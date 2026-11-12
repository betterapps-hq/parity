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
import { useProject } from "../canvas/context.ts"
import { projectLibrary } from "../canvas/layers.ts"
import { useStylePreview } from "../canvas/style-preview.ts"
import type { ContainerEntry } from "../design-store.ts"
import { useSelection } from "../selection.ts"
import { spacingUnit, useTokenList } from "../tokens-store.ts"
import {
  type InspectorChange,
  recordInspectorChange,
  type RowValues,
  rowChanged,
  rowValues
} from "./inspector-events.ts"
import { measureNode, placeNode } from "./LayerPanel.tsx"

/** Edits the selected layers' style through the style rows, in the state and variant being edited. */
export interface StyleEditor {
  /** What the layers share, what differs and what the state changes, as `@parity-app/editor` works it out. */
  selection: StyleSelection
  /**
   * A row's edit of every layer, as one undoable change, or as part of a gesture's one step (a field's run of Up and
   * Down presses). `undefined` clears a property.
   */
  set: <R extends StyleRow>(row: R, edit: StyleEdit<RowKey<R>>, label?: string, gesture?: string) => void
  reset: (row: StyleRow) => void
  /**
   * Shows a row's edit on the canvas at once, without changing the design, while a field is typed in or scrubbed:
   * `set` then makes it, or `endPreview` takes it back.
   */
  preview?: <R extends StyleRow>(row: R, edit: StyleEdit<RowKey<R>>) => void
  endPreview?: () => void
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

/**
 * The style editor for layers of one design: the module's selection, with its edits previewed on the canvas and made
 * through the store. Undefined when none of the layers exists.
 */
export function useStyleEditor(entry: ContainerEntry, ids: readonly string[]): StyleEditor | undefined {
  const session = useProject()
  const { store } = session
  const selected = useSelection(session.selection)
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
    const size = measureNode(session, entry.key, id, selected)

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

  return {
    selection,
    set: (row, edit, label = "Change style", gesture) => {
      const apply = within(selection.edit(row, edit, measure))
      preview.settle(apply)
      store.updateContainer(entry.key, count > 1 ? `${label} on ${count} layers` : label, apply, { gesture })
      recordRow(row, gesture)
    },
    reset: (row) => {
      store.updateContainer(entry.key, count > 1 ? "Reset changes" : "Reset change", within(selection.reset(row)))
      recordRow(row)
    },
    preview: (row, edit) => preview.show(within(selection.edit(row, edit, measure))),
    endPreview: () => preview.cancel(),
    tokens,
    unit,
    measure: (axis, round = Math.round) => (only ? measure(only, axis, round) : undefined),
    place: () => (only ? placeNode(session, entry.key, only, selected) : undefined)
  }
}
