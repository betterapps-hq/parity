import {
  boardTarget,
  childEntries,
  type ContainerSpec,
  type DesignNode,
  editNode,
  type Length,
  locateNode,
  moveNode,
  type StateSpec,
  topmostNodes
} from "@parity-app/core"
import { boardReader, type Flow, flowOf } from "@parity-app/editor"
import type { DesignStore } from "../design-store.ts"
import { findNodeElement, flowingBoxes } from "../frame.ts"
import { selectedDesigns, selectedNodes, type SelectionStore, selectionKey } from "../selection.ts"
import { GestureRun } from "./gesture.ts"
import { selectionFrame } from "./hit.ts"
import { type DrawnSteps, type Side, shiftInsets } from "./insets.ts"
import { activeState, frameViewport } from "./view.ts"

export type { DrawnSteps, Side } from "./insets.ts"

/**
 * The arrow keys, through the keymap, as Figma's: a layer in a layout moves one place earlier or later along the
 * layout's direction; an absolutely placed layer moves by one step of the spacing scale, or ten with Shift; designs and
 * text notes move by 1px, or 10px with Shift. Each run of presses is one undo step.
 */

export type Arrow = "left" | "right" | "up" | "down"

const arrows: Record<string, Arrow> = {
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "up",
  ArrowDown: "down"
}

/** The arrow a key is, by `KeyboardEvent.key`. */
export function arrowOf(key: string): Arrow | undefined {
  return arrows[key]
}

/** How a layout node lays out its children as the design says, for when its frame doesn't draw it. */
export function modelFlow(parent: DesignNode): Flow {
  const forward = { reversed: false, linesReversed: false }
  if (parent.type !== "layout") return { direction: "column", wraps: false, ...forward }
  const style = parent.style ?? {}
  if (style.display === "grid") return { direction: "row", wraps: true, ...forward, stride: style.columns ?? 2 }
  return { direction: style.direction === "row" ? "row" : "column", wraps: style.wrap === true, ...forward }
}

/**
 * How many places an arrow moves a layer in a layout: one earlier or later along its direction, a row's worth up or
 * down a grid, and nothing across a row or column.
 */
export function reorderStep(flow: Flow, arrow: Arrow): number | undefined {
  const horizontal = arrow === "left" || arrow === "right"
  const forward = arrow === "right" || arrow === "down"
  if (horizontal !== (flow.direction === "row")) {
    // Up and down a grid move a row's worth of places.
    if (!horizontal && flow.stride) return forward ? flow.stride : -flow.stride
    return undefined
  }
  return forward !== flow.reversed ? 1 : -1
}

/**
 * The children's order once the selected ones move `step` places. A place is a child in the layout's flow, so
 * absolutely placed and hidden children (`inFlow` false) keep where they are in the list. Selected layers move
 * together, as a block; one at the end stays. A move of more than one place, a row of a grid, happens only when every
 * selected layer has somewhere to go.
 */
export function reorder(
  children: readonly { id: string; inFlow: boolean }[],
  selected: ReadonlySet<string>,
  step: number
): string[] {
  const order = children.map((child) => child.id)
  const places = children.flatMap((child, index) => (child.inFlow || selected.has(child.id) ? [index] : []))
  const flow = places.map((index) => order[index]!)
  if (Math.abs(step) > 1) {
    const fits = flow.every((id, index) => !selected.has(id) || (index + step >= 0 && index + step < flow.length))
    if (!fits) return order
  }
  for (let pass = 0; pass < Math.abs(step); pass++) {
    if (step < 0) {
      for (let index = 1; index < flow.length; index++) {
        if (selected.has(flow[index]!) && !selected.has(flow[index - 1]!)) swap(flow, index, index - 1)
      }
    } else {
      for (let index = flow.length - 2; index >= 0; index--) {
        if (selected.has(flow[index]!) && !selected.has(flow[index + 1]!)) swap(flow, index, index + 1)
      }
    }
  }
  places.forEach((at, index) => (order[at] = flow[index]!))
  return order
}

function swap(list: string[], a: number, b: number): void {
  ;[list[a], list[b]] = [list[b]!, list[a]!]
}

const deltas: Record<Arrow, { x: number; y: number }> = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 }
}

/** What arrows do to a design's layers: the design changed, and the side of a layer that couldn't move, if any. */
export interface LayersNudge {
  container: ContainerSpec
  blocked?: { layer: string; side: Side; token: Length }
}

/** What nudging reads from the frame a selection was picked in. Each says nothing when the layer isn't drawn. */
export interface Drawn {
  /** How the layout a layer sits in places its children. */
  flow(layer: string): Flow | undefined
  /** Where an absolutely placed layer's sides are. */
  insets(layer: string): DrawnSteps | undefined
}

/**
 * Nudges layers of one design, as the board shows them in the state being edited and the frame's viewport. Absolutely placed ones move by their insets, in
 * that state; the rest move among their siblings, in the layout each sits in, as the frame draws it (or as the design
 * says, when it isn't drawn). Layers inside instances don't move.
 */
export function nudgeLayers(
  container: ContainerSpec,
  ids: readonly string[],
  state: StateSpec,
  arrow: Arrow,
  big: boolean,
  drawn: Drawn,
  viewport?: string
): LayersNudge {
  const shown = boardReader(container, { state, viewport })
  const layers = topmostNodes(container.root, ids).filter((node) => node.id !== container.root.id)
  let next = container
  let blocked: LayersNudge["blocked"]

  const steps = big ? 10 : 1
  const { x, y } = deltas[arrow]
  const flowing: DesignNode[] = []
  for (const node of layers) {
    const style = shown(node).style ?? {}
    if (style.position !== "absolute") {
      flowing.push(node)
      continue
    }
    const shift = shiftInsets(style, x * steps, y * steps, drawn.insets(node.id))
    if (shift.blocked) blocked ??= { layer: node.id, side: shift.blocked, token: style[shift.blocked]! }
    if (Object.keys(shift.change).length > 0) {
      next = editNode(next, boardTarget(next, state.id), node.id, { style: shift.change })
    }
  }

  // Layers in the same layout move together, as one block.
  const groups = new Map<string, { parent: DesignNode; slot?: string; ids: Set<string> }>()
  for (const node of flowing) {
    const location = locateNode(next.root, node.id)
    const parent = location?.ancestors.at(-1)
    if (!location || !parent) continue
    const key = `${parent.id}\n${location.slot ?? ""}`
    const group = groups.get(key) ?? { parent, slot: location.slot, ids: new Set<string>() }
    group.ids.add(node.id)
    groups.set(key, group)
  }
  for (const { parent, slot, ids: selected } of groups.values()) {
    const flow = drawn.flow([...selected][0]!) ?? modelFlow(shown(parent))
    const step = reorderStep(flow, arrow)
    if (!step) continue
    const siblings = childEntries(parent).find((entry) => entry.slot === slot)?.nodes ?? []
    const children = siblings.map((child) => {
      const look = shown(child)
      return { id: child.id, inFlow: !look.hidden && look.style?.position !== "absolute" }
    })
    const order = reorder(children, selected, step)
    if (order.every((id, index) => id === siblings[index]?.id)) continue
    let root = next.root
    for (const [index, id] of order.entries()) root = moveNode(root, id, parent.id, { index, slot })
    next = { ...next, root }
  }
  return { container: next, ...(blocked ? { blocked } : {}) }
}

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

  const steps = big ? 10 : 1
  const { x, y } = deltas[arrow]
  const by = { x: x * steps, y: y * steps }
  // A mode column moves with its design.
  const designs = current.mode && current.design ? [current.design] : selectedDesigns(current)
  if (designs.length > 0) {
    store.updateContainers(
      designs,
      `Nudge ${store.designsLabel(designs)}`,
      (containers) => containers.map((container) => ({ ...container, position: moved(container.position, by) })),
      { gesture }
    )
  } else if (current.note) {
    store.updateNote(current.note, "Nudge text", (note) => ({ ...note, position: moved(note.position, by) }), {
      gesture
    })
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

function moved(position: { x: number; y: number }, by: { x: number; y: number }) {
  return { x: Math.round(position.x + by.x), y: Math.round(position.y + by.y) }
}

/** The state being edited: the one the selection was picked in, else the one the board shows. */
function editingState(container: ContainerSpec, picked: string | undefined): StateSpec {
  return container.states.find((state) => state.id === picked) ?? activeState(container)
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
