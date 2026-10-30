import { type DesignNode, isInnerPath } from "@parity-app/core"
import type { DesignStore } from "../design-store.ts"
import { designsSelection, layersSelection, selectedDesigns, selectedNodes, type Selection } from "../selection.ts"
import { childLayers, findLayer } from "./layers.ts"

/**
 * What a click, a double-click, Ctrl, hover, a box or Enter selects inside a board, as Figma's top-level frames do.
 * These take ids and return what to select: `hit.ts` finds what's under the pointer, and `CanvasOverlay.tsx`,
 * `select-box.ts` and the Enter command act on the answer.
 */

/** What's under the pointer in one frame, by id. */
export interface Under {
  /** The design's own layers holding the point, its root first. */
  chain: readonly string[]
  /**
   * Every drawn layer holding the point, outermost first. Inside an instance these reach past `chain`: `card`, then
   * `card/title`.
   */
  path: readonly string[]
}

/** The layer selected in the design under the pointer, and the layer it sits in. */
export interface Selected {
  node: string
  /** Its parent in the design; inside an instance, the layer it's drawn in. */
  parent: string | undefined
}

/**
 * The layer a click selects, or undefined on the frame's background, where a click selects the board. Ctrl (`deep`)
 * goes to the deepest layer under the pointer, inside instances too. With a layer of this design selected, a click
 * picks among its siblings, or leaves its group for the top level. Otherwise it's the top-level layer under the
 * pointer: one click from anywhere on the canvas.
 */
export function pickLayer(under: Under, selected: Selected | undefined, deep: boolean): string | undefined {
  const { chain, path } = under
  if (deep) return chain.length > 1 ? path.at(-1) : undefined
  if (selected?.parent) {
    // Inside an instance its siblings are found among what's drawn, otherwise in the design's own tree.
    const line = isInnerPath(selected.node) ? path : chain
    const index = line.indexOf(selected.parent)
    const sibling = index === -1 ? undefined : line[index + 1]
    if (sibling) return sibling
  }
  return chain[1]
}

/**
 * One level deeper than the selection, under the pointer: what a double-click selects. Past an instance, that's the
 * layers inside it, as the component draws them. Undefined when there's nothing deeper.
 */
export function pickDeeper(under: Under, selected: Selected | undefined): string | undefined {
  if (!selected) return under.chain[1]
  const index = under.chain.indexOf(selected.node)
  const child = index === -1 ? undefined : under.chain[index + 1]
  if (child) return child
  const at = under.path.indexOf(selected.node)
  if (at !== -1) return under.path[at + 1]
  return pickLayer(under, selected, false)
}

/** What pressing the left button inside a frame does. */
export type Press =
  /** Selects the layer, so a drag moves it. */
  | { kind: "select"; node: string }
  /** The layer is selected already: the selection stays, so a drag moves all of it, and a click selects just the layer. */
  | { kind: "keep"; node: string }
  /** Shift: adds the layer to the selection, or takes it out. */
  | { kind: "toggle"; node: string }
  /** The frame's background: a click selects the board, and a drag draws a box that selects the layers inside it. */
  | { kind: "background" }

/**
 * What a press inside a frame does: `selected` is the layer of this design that's selected, and `nodes` every one, so
 * pressing one of them keeps them all to drag. A press never moves the board: it's moved by its title or background.
 */
export function pressTarget(
  under: Under,
  selected: Selected | undefined,
  nodes: readonly string[],
  keys: { deep: boolean; shift: boolean }
): Press {
  const node = pickLayer(under, selected, keys.deep)
  if (!node) return { kind: "background" }
  if (keys.shift) return { kind: "toggle", node }
  return { kind: nodes.includes(node) ? "keep" : "select", node }
}

/**
 * What hovering outlines: what a click would select, Ctrl included, so nothing over the background, where the board is
 * outlined instead. Alt outlines the deepest layer, to measure to.
 */
export function hoverTarget(
  under: Under,
  selected: Selected | undefined,
  keys: { deep: boolean; alt: boolean }
): string | undefined {
  return keys.alt ? under.path.at(-1) : pickLayer(under, selected, keys.deep)
}

/**
 * A click on a frame's background selects its board. With Shift it adds the board to the selected designs, or takes it
 * out, as Shift on the board's title does.
 */
export function boardClick(current: Selection, design: string, shift: boolean): Selection {
  if (!shift) return { design }
  const group = selectedDesigns(current)
  return designsSelection(group.includes(design) ? group.filter((key) => key !== design) : [...group, design])
}

export interface Bounds {
  left: number
  top: number
  right: number
  bottom: number
}

/**
 * The layers a box touches, in the order given, as Figma's and tldraw's boxes select what they touch. A layer that
 * isn't drawn has no size, and is never touched.
 */
export function touchedBy(box: Bounds, layers: readonly { id: string; box: Bounds }[]): string[] {
  return layers
    .filter(({ box: layer }) => layer.right > layer.left || layer.bottom > layer.top)
    .filter(
      ({ box: layer }) =>
        layer.left <= box.right && layer.right >= box.left && layer.top <= box.bottom && layer.bottom >= box.top
    )
    .map((layer) => layer.id)
}

/**
 * What a box drawn from a frame's background selects: the layers it touches, in that frame. With Shift they're added
 * to the layers of the design selected when the box began. A box touching nothing selects nothing, or with Shift keeps
 * what was selected.
 */
export function boxSelection(
  before: Selection,
  design: string,
  frame: { mode?: string; state?: string },
  touched: readonly string[],
  shift: boolean
): Selection {
  const kept = shift && before.design === design ? selectedNodes(before) : []
  const nodes = [...kept, ...touched.filter((id) => !kept.includes(id))]
  if (nodes.length === 0) return shift ? before : {}
  return layersSelection(design, nodes, kept.length > 0 ? { mode: before.mode, state: before.state } : frame)
}

/** What Enter does: starts editing a text layer, or selects layers. */
export type Enter = { edit: { design: string; node: string; mode?: string; state?: string } } | { select: Selection }

/**
 * Enter, as in Figma: on a text layer, starts editing it; otherwise selects every layer inside the selected layers, or
 * inside the selected design (the one picked last, with several), in the frame they were picked in. Undefined when
 * there's nothing inside.
 */
export function enterTarget(store: DesignStore, current: Selection): Enter | undefined {
  const entry = current.design ? store.getEntry(current.design) : undefined
  if (!entry) return undefined
  const frame = {
    ...(current.mode ? { mode: current.mode } : {}),
    ...(current.state ? { state: current.state } : {})
  }
  const nodes = selectedNodes(current)
  const only = nodes.length === 1 ? nodes[0] : undefined
  const layer = only ? findLayer(store, entry.container, only) : undefined
  if (only && layer && editableText(layer) !== undefined) return { edit: { design: entry.key, node: only, ...frame } }
  const parents = nodes.length > 0 ? nodes : [entry.container.root.id]
  const children = parents.flatMap((id) => childLayers(store, entry.container, id))
  return children.length > 0 ? { select: layersSelection(entry.key, children, frame) } : undefined
}

/** The text a layer shows, when it's editable in place: a text layer, or a component whose child is a string. */
export function editableText(node: DesignNode): string | undefined {
  if (node.type === "text") return node.text
  if (node.type === "component" && typeof node.props?.children === "string") return node.props.children
  return undefined
}
