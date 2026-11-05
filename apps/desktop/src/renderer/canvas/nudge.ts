import {
  type Arrow,
  type Drawn,
  editingState,
  flowOf,
  type LayersNudge,
  nudgedPosition,
  nudgeLayers
} from "@parity-app/editor"
import type { DesignStore } from "../design-store.ts"
import { findNodeElement, flowingBoxes } from "../frame.ts"
import { selectedDesigns, selectedNodes, type SelectionStore, selectionKey } from "../selection.ts"
import { GestureRun } from "./gesture.ts"
import { selectionFrame } from "./hit.ts"
import { frameViewport } from "./view.ts"

/**
 * The arrow keys, through the keymap: the selection nudged by `@parity-app/editor`'s rules (`nudgeLayers`,
 * `nudgedPosition`), with what they read from the frame the selection was picked in. Each run of presses is one undo
 * step.
 */

/** What the arrows act on, and what they read from the frame the selection was picked in. */
export interface NudgeSession {
  store: DesignStore
  selection: SelectionStore
  drawn?(design: string): Drawn
}

const nothingDrawn: Drawn = { flow: () => undefined, insets: () => undefined }

/**
 * Nudges what's selected: layers, designs or a text note. A run of presses is one undo step (see `runGesture`).
 * Returns what couldn't move, if anything.
 */
export function nudgeSelection(session: NudgeSession, arrow: Arrow, big: boolean): LayersNudge["blocked"] {
  const { store, selection } = session
  const current = selection.get()
  const gesture = runGesture(store, selection)
  const layers = selectedNodes(current)
  const entry = current.design ? store.getEntry(current.design) : undefined
  if (entry && layers.length > 0) {
    let blocked: LayersNudge["blocked"]
    const state = editingState(entry.container, current.state)
    const viewport = frameViewport(store.getModes(), current.mode)
    store.updateContainer(
      entry.key,
      layers.length === 1 ? "Nudge layer" : `Nudge ${layers.length} layers`,
      (container) => {
        const drawn = session.drawn?.(entry.key) ?? nothingDrawn
        const result = nudgeLayers(container, layers, state, arrow, big, drawn, viewport)
        blocked = result.blocked
        return result.container
      },
      { gesture }
    )
    return blocked
  }

  // A mode column moves with its design.
  const designs = current.mode && current.design ? [current.design] : selectedDesigns(current)
  if (designs.length > 0) {
    store.updateContainers(
      designs,
      `Nudge ${store.designsLabel(designs)}`,
      (containers) =>
        containers.map((container) => ({ ...container, position: nudgedPosition(container.position, arrow, big) })),
      { gesture }
    )
  } else if (current.note) {
    store.updateNote(
      current.note,
      "Nudge text",
      (note) => ({ ...note, position: nudgedPosition(note.position, arrow, big) }),
      {
        gesture
      }
    )
  }
  return undefined
}

/** Each store's run of arrow presses, keyed by what it nudges (see `GestureRun`). */
const runs = new WeakMap<DesignStore, GestureRun>()

/**
 * The gesture a press nudging what's selected is in. A run of presses on one selection is one gesture, however long it
 * takes, and however often the same selection is set again meanwhile. Selecting something else ends it as it happens,
 * and so does any other change, an undo or a redo, since the history only adds to the latest step (see `recordChange`
 * in `@parity-app/editor`).
 */
function runGesture(store: DesignStore, selection: SelectionStore): string {
  const run = runs.get(store) ?? new GestureRun(store)
  runs.set(store, run)
  return run.gesture(selectionKey(selection.get()), () =>
    selection.subscribe(() => run.select(selectionKey(selection.get())))
  )
}

/**
 * What nudging reads from the frame a selection was picked in, whose viewport and state can lay a design out
 * differently from its base: the flow of the layout around a layer, from its element's parent, and where an absolutely
 * placed layer is drawn in its parent, in steps of `unit` pixels.
 */
export function frameDrawn(
  area: ParentNode,
  design: string,
  picked: { mode?: string; state?: string },
  unit: number
): Drawn {
  const host = selectionFrame(area, design, picked)
  const element = (layer: string) => (host ? findNodeElement(host, layer) : undefined)
  return {
    flow(layer) {
      let parent = element(layer)?.parentElement
      while (parent && getComputedStyle(parent).display === "contents") parent = parent.parentElement
      return parent ? flowOf(getComputedStyle(parent), flowingBoxes(parent)) : undefined
    },
    insets(layer) {
      const placed = element(layer)
      const parent = placed?.offsetParent
      const width = host ? parseFloat(host.style.width) : NaN
      if (!host || !placed || !(parent instanceof HTMLElement) || !(width > 0)) return undefined
      // Screen pixels to the frame's own: the canvas's zoom times the frame's scale.
      const scale = host.getBoundingClientRect().width / width
      const box = placed.getBoundingClientRect()
      const around = parent.getBoundingClientRect()
      const border = getComputedStyle(parent)
      const steps = (px: number, edge: string) => Math.round(((px / scale - parseFloat(edge)) / unit) * 2) / 2
      return {
        left: steps(box.left - around.left, border.borderLeftWidth),
        right: steps(around.right - box.right, border.borderRightWidth),
        top: steps(box.top - around.top, border.borderTopWidth),
        bottom: steps(around.bottom - box.bottom, border.borderBottomWidth)
      }
    }
  }
}
