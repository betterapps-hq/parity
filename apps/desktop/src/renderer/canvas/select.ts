import {
  childEntries,
  type ContainerSpec,
  type DesignNode,
  locateNode,
  nodeInState,
  type NodeStyle,
  shownVariants,
  type StateSpec,
  topmostNodes,
  walkNodes
} from "@parity/core"
import type { ContainerEntry, DesignStore } from "../design-store.ts"
import { designsSelection, layersSelection, selectedDesigns, selectedNodes, type Selection } from "../selection.ts"
import { activeState } from "./view.ts"

/** Select inverse, select matching layers, and stepping from one design to the next, as Figma's keys do them. */

/**
 * Select inverse: what Select all would select, less what's selected now. With layers selected, that's the other
 * layers beside the one picked last, in the same layout or slot; otherwise every design that isn't selected, or every
 * design when nothing is. When everything was selected, nothing is.
 */
export function inverseSelection(store: DesignStore, current: Selection): Selection {
  const entry = current.design ? store.getEntry(current.design) : undefined
  if (entry && current.node) {
    const location = locateNode(entry.container.root, current.node)
    const parent = location?.ancestors.at(-1)
    const siblings = parent && childEntries(parent).find((candidate) => candidate.slot === location?.slot)?.nodes
    // Inside an instance, as for Select all, there's nothing to invert.
    if (!siblings) return current
    const selected = new Set(selectedNodes(current))
    const rest = siblings.filter((node) => !selected.has(node.id)).map((node) => node.id)
    return rest.length > 0 ? layersSelection(entry.key, rest, current) : {}
  }
  const selected = new Set(current.mode && current.design ? [current.design] : selectedDesigns(current))
  return designsSelection(
    store
      .getEntries()
      .map((candidate) => candidate.key)
      .filter((key) => !selected.has(key))
  )
}

/**
 * Where a layer sits rather than how it looks: left out when layers are compared, so a card's title matches the
 * titles of cards placed or sized differently.
 */
const placement = new Set<keyof NodeStyle>([
  "position",
  "top",
  "right",
  "bottom",
  "left",
  "width",
  "height",
  "minWidth",
  "maxWidth",
  "minHeight",
  "maxHeight",
  "grow",
  "self",
  "colSpan",
  "rowSpan",
  "margin"
])

/**
 * What a layer is and how it looks, as a key two matching layers share: its kind (the same component, the same main
 * component for an instance, the same tag for text) and its style apart from where it's placed. Text, props, images'
 * files, an instance's values and the layers inside are left out, as Figma leaves out content.
 */
export function matchKey(node: DesignNode): string {
  const kind =
    node.type === "component"
      ? `component:${node.component}`
      : node.type === "instance"
        ? `instance:${node.design}`
        : node.type === "text"
          ? `text:${node.tag ?? ""}`
          : node.type
  const style = Object.entries(node.style ?? {})
    .filter(([key, value]) => value !== undefined && !placement.has(key as keyof NodeStyle))
    .toSorted(([a], [b]) => a.localeCompare(b))
  return JSON.stringify([kind, style])
}

/**
 * The layers of a design that match the given ones, as the state shows them, the given ones among them, in the
 * design's order. The search stays in the design, as Figma's stays in the top-level frame, and doesn't go inside
 * instances.
 */
export function matchingLayers(container: ContainerSpec, ids: readonly string[], state: StateSpec): string[] {
  const variants = shownVariants(container)
  const key = (node: DesignNode) => matchKey(nodeInState(node, state, variants))
  const wanted = new Set(topmostNodes(container.root, ids).map(key))
  const found: string[] = []
  walkNodes(container.root, (node) => {
    if (node.id !== container.root.id && wanted.has(key(node))) found.push(node.id)
  })
  return found
}

/**
 * Select matching layers: with layers selected, every layer in their design that matches one of them; with designs
 * selected, every design of the same kind, screens or components. Undefined when there's nothing to match.
 */
export function matchingSelection(store: DesignStore, current: Selection): Selection | undefined {
  const entry = current.design ? store.getEntry(current.design) : undefined
  const layers = selectedNodes(current)
  if (entry && layers.length > 0) {
    const state =
      entry.container.states.find((candidate) => candidate.id === current.state) ?? activeState(entry.container)
    const found = matchingLayers(entry.container, layers, state)
    if (found.length === 0) return undefined
    // The layer picked last stays the one the inspector shows.
    const ordered =
      current.node && found.includes(current.node)
        ? [...found.filter((id) => id !== current.node), current.node]
        : found
    return layersSelection(entry.key, ordered, current)
  }
  const designs = selectedDesigns(current)
  if (designs.length === 0) return undefined
  const kinds = new Set(designs.map((key) => isComponent(store.getEntry(key))))
  const found = store
    .getEntries()
    .filter((candidate) => kinds.has(isComponent(candidate)))
    .map((candidate) => candidate.key)
  const last = current.design
  return designsSelection(last && found.includes(last) ? [...found.filter((key) => key !== last), last] : found)
}

function isComponent(entry: ContainerEntry | undefined): boolean {
  return entry?.container.kind === "component"
}

/** The designs in the order the Layers panel lists them: components, then screens. */
export function designOrder(entries: readonly ContainerEntry[]): ContainerEntry[] {
  return [...entries.filter(isComponent), ...entries.filter((entry) => !isComponent(entry))]
}

/**
 * The design after the selected one, or before it with a step of -1, in the Layers panel's order, going round: what N
 * and Shift+N select. With no design selected, the first or the last.
 */
export function adjacentDesign(
  entries: readonly ContainerEntry[],
  current: Selection,
  step: 1 | -1
): string | undefined {
  const order = designOrder(entries)
  if (order.length === 0) return undefined
  const index = current.design ? order.findIndex((entry) => entry.key === current.design) : -1
  if (index === -1) return (step === 1 ? order[0] : order.at(-1))!.key
  return order[(index + step + order.length) % order.length]!.key
}
