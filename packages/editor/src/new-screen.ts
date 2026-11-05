import {
  type ContainerSpec,
  type DesignNode,
  findNode,
  generateId,
  nodeLabel,
  uniqueId,
  withFreshIds
} from "@parity-app/core"
import { fitBindings } from "./clipboard.ts"
import { componentLabel, type InsertContext, insertIntoDesign, type InsertItem } from "./insert.ts"

/**
 * What lands on empty space on the canvas makes a screen there, by one rule (PAR-546): pasted layers, a layout or text
 * from the insert picker, a component or design from the Assets panel or the picker, and image files dropped from
 * Explorer or Finder (`designOfImages`, in drop-files.ts). The screen's top left is where it landed, it holds what
 * landed in a padded column, and it's named after what's in it, never "Pasted". The app finds where it landed and adds
 * the screen as one undo step.
 */

/** A design's name by its id, as the Layers panel names an instance after the design it places. */
export type DesignName = (id: string) => string | undefined

/**
 * What a screen made of `nodes` is called, after what's in it: one layer's name as the Layers panel gives it, with a
 * component named without its library ("Button") and an instance after its design; "Images" for several images; and
 * the first layer's name and how many more for several others ("Headline and 2 more").
 */
export function layersName(nodes: readonly DesignNode[], designName?: DesignName): string {
  const [first] = nodes
  if (!first) return "Untitled screen"
  if (nodes.length > 1 && nodes.every((node) => node.type === "image")) return "Images"
  const name =
    first.type === "component" && !first.name ? componentLabel(first.component) : nodeLabel(first, designName)
  return nodes.length === 1 ? name : `${name} and ${nodes.length - 1} more`
}

/**
 * Layers with nothing to go into, as a paste on the empty canvas or with nothing selected: a new screen with its top
 * left `at`, named after them (see `layersName`), that lays them out in a padded column. Its id comes from its name,
 * clear of `taken`, the designs' ids, and its layers get fresh ids. It has no params, so the layers keep no bindings,
 * only the values they showed.
 */
export function designOfLayers(
  nodes: readonly DesignNode[],
  taken: Iterable<string>,
  at: { x: number; y: number },
  designName?: DesignName
): ContainerSpec {
  const ids = new Set<string>()
  const rootId = generateId(ids)
  ids.add(rootId)
  const name = layersName(nodes, designName)
  const design: ContainerSpec = {
    id: uniqueId(name, taken),
    name,
    position: at,
    root: { type: "layout", id: rootId, style: { padding: 6, gap: 4 }, children: [] },
    states: [{ id: "default", name: "Default" }]
  }
  const children = nodes.map((node) => withFreshIds(fitBindings(node, design), ids))
  return { ...design, root: { type: "layout", id: rootId, style: { padding: 6, gap: 4 }, children } }
}

/**
 * An item from the Assets panel or the insert picker with nothing to go into: a new screen with its top left `at`, as
 * `designOfLayers` makes one, holding the item as inserting it would (its props, a library part's parents, a detached
 * copy's layers), and named after it. Returns the screen and the item's layer id in it.
 */
export function designOfItem(
  item: InsertItem,
  context: InsertContext,
  taken: Iterable<string>,
  at: { x: number; y: number },
  designName?: DesignName
): { design: ContainerSpec; node: string } {
  const empty = designOfLayers([], [], at)
  const { container, node } = insertIntoDesign(empty, { parent: empty.root.id }, item, context)
  const placed = findNode(container.root, node)
  const name = layersName(placed ? [placed] : [], designName)
  return { design: { ...container, id: uniqueId(name, taken), name }, node }
}
