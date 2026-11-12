import type { ContainerSpec } from "@parity-app/core"
import {
  frameRootShown,
  frameRootStored,
  type LayerMeasure,
  type RowKey,
  type StyleEdit,
  type StyleRow,
  type StyleSelection,
  styleSelection
} from "@parity-app/editor"
import type { Token } from "@parity-app/tokens"
import { useEffect, useReducer, useRef } from "react"
import { useProject } from "../canvas/context.ts"
import { projectLibrary } from "../canvas/layers.ts"
import { useStylePreview } from "../canvas/style-preview.ts"
import type { ContainerEntry } from "../design-store.ts"
import { findFrames, subscribeFrames } from "../frame.ts"
import { useSelection } from "../selection.ts"
import { spacingUnit, useTokenList } from "../tokens-store.ts"
import type { ProjectSession } from "../workspace.ts"
import {
  type InspectorChange,
  recordInspectorChange,
  type RowValues,
  rowChanged,
  rowValues
} from "./inspector-events.ts"
import { measureNode, placeNode } from "./LayerPanel.tsx"

/** One row's edit of every selected layer, with what Undo calls it. `undefined` in an edit clears a property. */
export interface StyleChange<R extends StyleRow = StyleRow> {
  row: R
  edit: StyleEdit<RowKey<R>>
  label: string
}

/** Edits the selected layers' style through the style rows, in the state and variant being edited. */
export interface StyleEditor {
  /** What the layers share, what differs and what the state changes, as `@parity-app/editor` works it out. */
  selection: StyleSelection
  /**
   * Makes changes as one undoable step, named by the first, or as part of a gesture's one step (a field's run of Up
   * and Down presses). Sections make theirs through their edit session (`useEditSession`), not this.
   */
  make: (changes: readonly StyleChange[], gesture?: string) => void
  reset: (row: StyleRow) => void
  /**
   * Shows changes on the canvas at once, without changing the design, while a field is typed in or scrubbed: `make`
   * then makes them, or `endPreview` takes them back.
   */
  preview: (changes: readonly StyleChange[]) => void
  endPreview: () => void
  /**
   * Where the design is now, for a gesture's changes to go back to: `revert` takes them back as though never made, and
   * says whether it did. It doesn't once something else has changed the design since, as an agent editing the same
   * file, which reverting would take back too.
   */
  checkpoint: (gesture: string) => { revert: () => boolean } | undefined
  tokens: Token[]
  /** Pixels per spacing step. */
  unit: number
  /**
   * With one layer selected, its rendered length in whole spacing steps, so switching to a fixed size keeps it where it
   * is: the nearest step, or the one above with `Math.ceil`, so text fixed at it doesn't wrap again.
   */
  measure: (axis: "width" | "height", round?: (steps: number) => number) => number | undefined
  /**
   * With one layer selected, where it sits in the box its insets count from, in pixels: that box's size inside its
   * border, the layer's own size, and its offset from that box's top left, for Position's inset box.
   */
  place?: () => LayerPlace | undefined
}

/** Where a layer sits in the box its insets count from, in pixels. */
export interface LayerPlace {
  parent: { width: number; height: number }
  size: { width: number; height: number }
  inFlow: { x: number; y: number }
}

/** A layer's drawn size as text, to tell when it changes, or empty while it isn't drawn. */
const sizeKey = (size: { width: number; height: number } | undefined) => (size ? `${size.width}x${size.height}` : "")

/**
 * Draws the panel again when the one selected layer's drawn size changes: its frame drawing it for the first time, an
 * edit laying it out again, or the frame resizing. The panel reads the size as it draws (`measure`, `place`), and
 * nothing else tells it a frame has drawn, so a layer picked before its frame drew showed no size in Size or Spacing.
 * It watches the design's frames as the canvas's overlay does, and measures once an animation frame at most.
 */
function useDrawnBox(
  session: ProjectSession,
  design: string,
  layer: string | undefined,
  picked: { mode?: string; state?: string }
): void {
  const [, redraw] = useReducer((count: number) => count + 1, 0)
  // The size this draw of the panel saw, which a change is told against.
  const seen = useRef("")
  const drawn = layer ? sizeKey(measureNode(session.editor, design, layer, picked)) : ""
  const { mode, state } = picked

  useEffect(() => {
    seen.current = drawn
  })

  useEffect(() => {
    const area = session.editor?.getContainer().closest(".canvas-area")

    if (!layer || !area) {
      return
    }

    let frame = 0

    const check = () => {
      frame = 0

      if (sizeKey(measureNode(session.editor, design, layer, { mode, state })) !== seen.current) {
        redraw()
      }
    }

    const soon = () => {
      frame ||= requestAnimationFrame(check)
    }

    const resizes = new ResizeObserver(soon)
    const watched = new Map<HTMLElement, MutationObserver>()

    const watch = (host: HTMLElement) => {
      if (watched.has(host) || !host.shadowRoot) {
        return
      }

      resizes.observe(host)
      const changes = new MutationObserver(soon)
      changes.observe(host.shadowRoot, { subtree: true, childList: true, attributes: true, characterData: true })
      watched.set(host, changes)
    }

    findFrames(area, design).forEach(watch)

    const stopFrames = subscribeFrames((host, mounted) => {
      if (host.dataset.design !== design) {
        return
      }

      if (mounted) {
        watch(host)
      } else {
        watched.get(host)?.disconnect()
        watched.delete(host)
        resizes.unobserve(host)
      }

      soon()
    })

    // The frame may have drawn between the panel's draw and now.
    soon()

    return () => {
      stopFrames()
      resizes.disconnect()

      for (const changes of watched.values()) {
        changes.disconnect()
      }

      cancelAnimationFrame(frame)
    }
  }, [session, design, layer, mode, state])
}

/**
 * The style editor for layers of one design: the module's selection, with its edits previewed on the canvas and made
 * through the store. Undefined when none of the layers exists.
 */
export function useStyleEditor(entry: ContainerEntry, ids: readonly string[]): StyleEditor | undefined {
  const session = useProject()
  const { store } = session
  const selected = useSelection(session.selection)
  useDrawnBox(session, entry.key, ids.length === 1 ? ids[0] : undefined, selected)
  const tokens = useTokenList(session.tokens)
  // A field's edit previews on the canvas, applied as the edit would apply it, until it's made or taken back.
  const preview = useStylePreview(session, entry.key)
  const unit = spacingUnit(tokens)
  // A frame is its root layout, so its root's size rows are the frame's own size (see `frameRootShown`).
  const frameRoot = entry.container.kind === "frame" && ids.length === 1 && ids[0] === entry.container.root.id
  const shown = frameRoot ? frameRootShown(entry.container, unit) : entry.container

  const within = (edit: (container: ContainerSpec) => ContainerSpec) =>
    frameRoot ? (container: ContainerSpec) => frameRootStored(edit(frameRootShown(container, unit)), unit) : edit

  const selection = styleSelection(shown, ids, selected.state, projectLibrary(store))

  if (!selection) {
    return undefined
  }

  // Each layer measured in the frame the selection was picked in, so a size worked out from it is its own.
  const measure: LayerMeasure = (id, axis, round) => {
    const size = measureNode(session.editor, entry.key, id, selected)

    return size && Math.max(1, round(size[axis] / unit))
  }

  const count = selection.layers.length
  const only = count === 1 ? selection.layers[0]!.id : undefined

  // Each change is recorded with the row's values before and after, as the layers show them (PAR-640).
  const recordRow = (row: StyleRow, gesture?: string) => {
    const changed = store.getEntry(entry.key)?.container

    const now =
      changed &&
      styleSelection(frameRoot ? frameRootShown(changed, unit) : changed, ids, selected.state, projectLibrary(store))

    const change: InspectorChange<RowValues | undefined> = {
      field: `style.${row}`,
      design: entry.key,
      layers: selection.layers.map((layer) => layer.id),
      state: selection.state.id,
      from: rowValues(selection, row),
      to: rowValues(now, row),
      changed: rowChanged(selection, now, row)
    }

    if (gesture) {
      change.gesture = gesture
    }

    recordInspectorChange(change)
  }

  // Several changes, as one field's change can come to, are one edit of the design.
  const applying = (changes: readonly StyleChange[]) => (container: ContainerSpec) =>
    changes.reduce((each, change) => within(selection.edit(change.row, change.edit, measure))(each), container)

  return {
    selection,
    make: (changes, gesture) => {
      const label = changes[0]?.label ?? "Change style"
      const apply = applying(changes)
      preview.settle(apply)
      store.updateContainer(entry.key, count > 1 ? `${label} on ${count} layers` : label, apply, { gesture })

      for (const row of new Set(changes.map((change) => change.row))) {
        recordRow(row, gesture)
      }
    },
    reset: (row) => {
      store.updateContainer(entry.key, count > 1 ? "Reset changes" : "Reset change", within(selection.reset(row)))
      recordRow(row)
    },
    preview: (changes) => preview.show(applying(changes)),
    endPreview: () => preview.cancel(),
    checkpoint: (gesture) => {
      const point = store.checkpoint(entry.key, gesture)

      return (
        point && {
          revert: () => {
            if (store.changedBesides(point)) {
              return false
            }

            store.revert(point)

            return true
          }
        }
      )
    },
    tokens,
    unit,
    measure: (axis, round = Math.round) => (only ? measure(only, axis, round) : undefined),
    place: () => (only ? placeNode(session.editor, entry.key, only, selected) : undefined)
  }
}
