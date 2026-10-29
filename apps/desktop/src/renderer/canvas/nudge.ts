import {
  boardTarget,
  childEntries,
  type ContainerSpec,
  type DesignNode,
  editNode,
  type Length,
  locateNode,
  moveNode,
  nodeInState,
  type NodeStyle,
  shownVariants,
  type StateSpec,
  topmostNodes
} from "@parity/core"
import type { DesignStore } from "../design-store.ts"
import { findNodeElement } from "../frame.ts"
import { selectedDesigns, selectedNodes, type Selection, type SelectionStore } from "../selection.ts"
import { selectionFrame } from "./hit.ts"
import { activeState } from "./view.ts"

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

/**
 * How a layout places its children on screen. `axis` is the way they follow each other: along a row or down a column.
 * `reversed` when that runs right to left or bottom to top. A grid fills rows, so `stride` is how many places one row
 * down is.
 */
export interface Flow {
  axis: "row" | "column"
  reversed: boolean
  stride?: number
}

/** The computed styles of the element a layout's children sit in, as `getComputedStyle` gives them. */
export type FlowStyle = Pick<
  CSSStyleDeclaration,
  "display" | "flexDirection" | "gridTemplateColumns" | "gridAutoFlow" | "direction"
>

/** How an element lays out its children, from its computed styles: a flex box, a grid, or blocks one under another. */
export function flowOf(style: FlowStyle): Flow {
  const rtl = style.direction === "rtl"
  if (style.display.includes("grid")) {
    if (style.gridAutoFlow.startsWith("column")) return { axis: "column", reversed: false }
    return { axis: "row", reversed: rtl, stride: trackCount(style.gridTemplateColumns) }
  }
  if (style.display.includes("flex")) {
    const reversed = style.flexDirection.endsWith("reverse")
    return style.flexDirection.startsWith("row")
      ? { axis: "row", reversed: reversed !== rtl }
      : { axis: "column", reversed }
  }
  return { axis: "column", reversed: false }
}

/** The columns in a computed `grid-template-columns`: `120px 120px 120px`, or `repeat(3, …)` before layout. */
function trackCount(columns: string): number {
  const repeat = /^repeat\((\d+)/.exec(columns)
  if (repeat) return Number(repeat[1])
  const tracks = columns
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\([^)]*\)/g, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  return Math.max(1, tracks.length)
}

/** How a layout node lays out its children as the design says, for when its frame doesn't draw it. */
export function modelFlow(parent: DesignNode): Flow {
  if (parent.type !== "layout") return { axis: "column", reversed: false }
  const style = parent.style ?? {}
  if (style.display === "grid") return { axis: "row", reversed: false, stride: style.columns ?? 2 }
  return { axis: style.direction === "row" ? "row" : "column", reversed: false }
}

/**
 * How many places an arrow moves a layer in a layout: one earlier or later along its direction, a row's worth up or
 * down a grid, and nothing across a row or column.
 */
export function reorderStep(flow: Flow, arrow: Arrow): number | undefined {
  const horizontal = arrow === "left" || arrow === "right"
  const forward = arrow === "right" || arrow === "down"
  if (horizontal !== (flow.axis === "row")) {
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

export type Side = "top" | "right" | "bottom" | "left"

/** Where a layer's sides are drawn, in steps of the spacing scale from its parent's edges. */
export type DrawnSteps = Record<Side, number>

/**
 * The insets that move an absolutely placed layer `dx` and `dy` steps of the spacing scale, as dragging it does. Along
 * each axis it moves by the side it's placed from (the left or top, unless only the right or bottom is set), or by both
 * when it's stretched between them, so it keeps its size. Each side moves from where it is: its number, negative too,
 * or, for a length token or a side left unset, where `drawn` says it's drawn. Without `drawn`, an unset side counts
 * from 0 and an axis with a token stays, named by `blocked`. An axis it doesn't move along keeps what's written.
 */
export function shiftInsets(
  style: NodeStyle,
  dx: number,
  dy: number,
  drawn?: DrawnSteps
): { change: NodeStyle; blocked?: Side } {
  const change: NodeStyle = {}
  let blocked: Side | undefined
  for (const [start, end, by] of [
    ["left", "right", dx],
    ["top", "bottom", dy]
  ] as const) {
    if (by === 0) continue
    const placed: Side[] =
      style[start] === undefined
        ? style[end] === undefined
          ? [start]
          : [end]
        : style[end] === undefined
          ? [start]
          : [start, end]
    const at = (side: Side): number | undefined => {
      const value = style[side]
      if (typeof value === "number") return value
      return drawn?.[side] ?? (value === undefined ? 0 : undefined)
    }
    const token = placed.find((side) => at(side) === undefined)
    if (token) {
      blocked ??= token
      continue
    }
    for (const side of placed) change[side] = at(side)! + (side === start ? by : -by)
  }
  return { change, ...(blocked ? { blocked } : {}) }
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
 * Nudges layers of one design, as the state being edited shows them. Absolutely placed ones move by their insets, in
 * that state; the rest move among their siblings, in the layout each sits in, as the frame draws it (or as the design
 * says, when it isn't drawn). Layers inside instances don't move.
 */
export function nudgeLayers(
  container: ContainerSpec,
  ids: readonly string[],
  state: StateSpec,
  arrow: Arrow,
  big: boolean,
  drawn: Drawn
): LayersNudge {
  const variants = shownVariants(container)
  const shown = (node: DesignNode) => nodeInState(node, state, variants)
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
 * Nudges what's selected: layers, designs or a text note. Presses in a run, on the same selection, a second or less
 * apart, are one undo step. Returns what couldn't move, if anything.
 */
export function nudgeSelection(session: NudgeSession, arrow: Arrow, big: boolean): LayersNudge["blocked"] {
  const { store, selection } = session
  const current = selection.get()
  const layers = selectedNodes(current)
  const entry = current.design ? store.getEntry(current.design) : undefined
  if (entry && layers.length > 0) {
    let blocked: LayersNudge["blocked"]
    const state = editingState(entry.container, current.state)
    store.updateContainer(
      entry.key,
      layers.length === 1 ? "Nudge layer" : `Nudge ${layers.length} layers`,
      (container) => {
        const drawn = session.drawn?.(entry.key) ?? nothingDrawn
        const result = nudgeLayers(container, layers, state, arrow, big, drawn)
        blocked = result.blocked
        return result.container
      },
      { group: nudgeGroup(current) }
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
      designs.length === 1 ? "Nudge design" : `Nudge ${designs.length} designs`,
      (containers) => containers.map((container) => ({ ...container, position: moved(container.position, by) })),
      { group: nudgeGroup(current) }
    )
  } else if (current.note) {
    store.updateNote(current.note, "Nudge text", (note) => ({ ...note, position: moved(note.position, by) }), {
      group: nudgeGroup(current)
    })
  }
  return undefined
}

/** One undo step for a run of presses on the same selection. */
function nudgeGroup(current: Selection): string {
  return `nudge:${JSON.stringify([current.note, current.design, current.designs, current.node, current.nodes])}`
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
      return parent ? flowOf(getComputedStyle(parent)) : undefined
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
