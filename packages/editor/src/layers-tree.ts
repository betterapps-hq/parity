import { childNodes, type ComponentLibrary, type ContainerSpec, type DesignNode, locateNode } from "@parity-app/core"

// The Layers panel's tree as rows: which rows show, which are open, and what opens as the selection moves (PAR-187).
// The panel draws only the rows in view, so everything it needs to know about the rest is worked out here. An
// instance's row opens to its component's layers, as the canvas selects them (PAR-92).

/** A design as the Layers panel lists it: its key in the store and the design itself. */
export interface TreeDesign {
  key: string
  container: ContainerSpec
}

/** One row of the tree: a design (depth 0), its page (1), or a layer inside it (2 and deeper). */
export interface TreeRow<D extends TreeDesign = TreeDesign> {
  /** The design's key, or `layerRowId` for a layer. */
  id: string
  depth: number
  design: D
  /**
   * The layer, or undefined for the design's own row. Inside an instance it's the node as its component has it; what
   * this copy changes about it is the instance's.
   */
  node?: DesignNode
  /**
   * The layer's path, as the selection and the canvas name it: its id, or inside an instance the instance's id, then
   * the ids of any instances nested in it, then the node's (`card/title`). Undefined for the design's own row.
   */
  path?: string
  /** The component designs of the instances the layer is inside, outermost first: none for the design's own layers. */
  within: readonly string[]
  hasChildren: boolean
  /** Whether the rows inside it show. */
  expanded: boolean
  /** Where it is among the rows beside it, from 1, and how many there are, as a screen reader reads them. */
  position: number
  siblings: number
}

/** A layer row's id: its design's key and the layer's id. */
export function layerRowId(design: string, node: string): string {
  return `${design}/${node}`
}

/** A layer as the tree walks it: the node, its path, and the component designs of the instances it's inside. */
interface Layer {
  node: DesignNode
  path: string
  within: readonly string[]
}

function rootLayer(design: TreeDesign): Layer {
  return { node: design.container.root, path: design.container.root.id, within: [] }
}

/**
 * The layers inside a layer, in order. An instance's are its component's root's children, whose paths start with the
 * instance's, since the canvas draws that root as the instance itself. An instance of a missing component, or of one
 * it's already inside, has none, as the canvas draws it.
 */
function layersInside(layer: Layer, library: ComponentLibrary): Layer[] {
  const { node, path, within } = layer
  if (node.type === "instance") {
    const component = library.get(node.design)
    if (!component || within.includes(component.id)) return []
    const inside = [...within, component.id]
    return childNodes(component.root).map((child) => ({ node: child, path: `${path}/${child.id}`, within: inside }))
  }
  const prefix = path.slice(0, path.length - node.id.length)
  return childNodes(node).map((child) => ({ node: child, path: `${prefix}${child.id}`, within }))
}

function layerRow<D extends TreeDesign>(
  design: D,
  layer: Layer,
  depth: number,
  hasChildren: boolean,
  expanded: boolean
): Omit<TreeRow<D>, "position" | "siblings"> {
  const { node, path, within } = layer
  return { id: layerRowId(design.key, path), depth, design, node, path, within, hasChildren, expanded }
}

/** Every row that shows, top to bottom: each design, and inside it the layers of every open row, into instances. */
export function treeRows<D extends TreeDesign>(
  designs: readonly D[],
  expanded: ReadonlySet<string>,
  library: ComponentLibrary
): TreeRow<D>[] {
  const rows: TreeRow<D>[] = []
  designs.forEach((design, index) => {
    const open = expanded.has(design.key)
    rows.push(designRow(design, index, designs.length, open))
    if (!open) return
    const visit = (layer: Layer, depth: number, position: number, siblings: number) => {
      const children = layersInside(layer, library)
      const shown = children.length > 0 && expanded.has(layerRowId(design.key, layer.path))
      rows.push({ ...layerRow(design, layer, depth, children.length > 0, shown), position, siblings })
      if (shown) children.forEach((child, at) => visit(child, depth + 1, at + 1, children.length))
    }
    visit(rootLayer(design), 1, 1, 1)
  })
  return rows
}

/**
 * The rows a search finds: each design or layer whose label has the search in it, ignoring case, with the rows above
 * it open so it shows. A match's own layers stay closed unless one of them matches too. Empty when nothing matches.
 */
export function searchRows<D extends TreeDesign>(
  designs: readonly D[],
  search: string,
  label: (design: D, node?: DesignNode) => string,
  library: ComponentLibrary
): TreeRow<D>[] {
  const needle = search.trim().toLocaleLowerCase()
  const matches = (design: D, node?: DesignNode) => label(design, node).toLocaleLowerCase().includes(needle)
  // Each found subtree, built bottom up so a row knows whether anything inside it matched before it's kept.
  const found = (design: D, layer: Layer, depth: number): TreeRow<D>[] => {
    const children = layersInside(layer, library)
    const inside = children.map((child) => found(design, child, depth + 1)).filter((rows) => rows.length > 0)
    if (inside.length === 0 && !matches(design, layer.node)) return []
    inside.forEach((rows, index) => Object.assign(rows[0]!, { position: index + 1, siblings: inside.length }))
    const row = layerRow(design, layer, depth, children.length > 0, inside.length > 0)
    return [{ ...row, position: 1, siblings: 1 }, ...inside.flat()]
  }
  const shown = designs
    .map((design) => ({ design, inside: found(design, rootLayer(design), 1) }))
    .filter(({ design, inside }) => inside.length > 0 || matches(design))
  return shown.flatMap(({ design, inside }, index) => [
    designRow(design, index, shown.length, inside.length > 0),
    ...inside
  ])
}

function designRow<D extends TreeDesign>(design: D, index: number, count: number, expanded: boolean): TreeRow<D> {
  const position = index + 1
  return { id: design.key, depth: 0, design, within: [], hasChildren: true, expanded, position, siblings: count }
}

/**
 * Which rows are open. Rows someone opens stay open until they close them. Rows opened to reveal the selection close
 * again once something selected elsewhere, on the canvas or by an agent, no longer needs them, so the tree doesn't keep
 * growing as the selection moves around the project.
 */
export interface Expansion {
  /** Opened by hand, with an arrow or a key. */
  opened: ReadonlySet<string>
  /** Opened to show the selection. */
  revealed: ReadonlySet<string>
}

export const closedTree: Expansion = { opened: new Set(), revealed: new Set() }

/** Every open row's id. */
export function expandedRows(expansion: Expansion): ReadonlySet<string> {
  if (expansion.revealed.size === 0) return expansion.opened
  return new Set([...expansion.opened, ...expansion.revealed])
}

/** A row opened or closed by hand; `open` says which, or it flips. Closing it closes it however it was opened. */
export function toggleRow(expansion: Expansion, id: string, open?: boolean): Expansion {
  const isOpen = expansion.opened.has(id) || expansion.revealed.has(id)
  if (open ?? !isOpen) {
    if (expansion.opened.has(id)) return expansion
    return { ...expansion, opened: new Set(expansion.opened).add(id) }
  }
  if (!isOpen) return expansion
  const opened = new Set(expansion.opened)
  const revealed = new Set(expansion.revealed)
  opened.delete(id)
  revealed.delete(id)
  return { opened, revealed }
}

/** Several rows opened, or closed, by hand at once, as `toggleRow` opens or closes one. */
export function toggleRows(expansion: Expansion, ids: readonly string[], open: boolean): Expansion {
  return ids.reduce((current, id) => toggleRow(current, id, open), expansion)
}

/**
 * A row's id and the id of every row inside it with layers of its own, into instances: what Alt+click on its arrow
 * opens or closes.
 */
export function branchIds(row: TreeRow, library: ComponentLibrary): string[] {
  const { design, node, path } = row
  const ids = node ? [] : [design.key]
  const visit = (layer: Layer) => {
    const children = layersInside(layer, library)
    if (children.length === 0) return
    ids.push(layerRowId(design.key, layer.path))
    children.forEach(visit)
  }
  visit(node && path !== undefined ? { node, path, within: row.within } : rootLayer(design))
  return ids
}

/** The rows beside `rows[index]` with layers of their own, itself included: what `*` opens, as trees do. */
export function siblingIds(rows: readonly TreeRow[], index: number): string[] {
  const row = rows[index]
  if (!row) return []
  const ids: string[] = []
  const take = (candidate: TreeRow) => {
    if (candidate.depth === row.depth && candidate.hasChildren) ids.push(candidate.id)
  }
  for (let at = index; at >= 0 && rows[at]!.depth >= row.depth; at--) take(rows[at]!)
  for (let at = index + 1; at < rows.length && rows[at]!.depth >= row.depth; at++) take(rows[at]!)
  return ids
}

/**
 * The rows that have to be open for layers of a design to show: the design's, then each layer's ancestors', the
 * instances it's inside among them. With no layers, the design's alone, since a selected design shows its page.
 */
export function revealIds(design: TreeDesign, paths: readonly string[], library: ComponentLibrary): string[] {
  const { key, container } = design
  const ids = new Set([key, layerRowId(key, container.root.id)])
  for (const path of paths) {
    let root = container.root
    let prefix = ""
    const segments = path.split("/")
    for (const [index, segment] of segments.entries()) {
      const location = locateNode(root, segment)
      if (!location) break
      // Inside an instance, the component's root is drawn as the instance, which has its row already.
      for (const ancestor of location.ancestors) {
        if (index === 0 || ancestor !== root) ids.add(layerRowId(key, `${prefix}${ancestor.id}`))
      }
      const { node } = location
      const component = node.type === "instance" ? library.get(node.design) : undefined
      // The layer itself stays closed, an instance among them.
      if (index === segments.length - 1 || !component) break
      ids.add(layerRowId(key, `${prefix}${segment}`))
      root = component.root
      prefix = `${prefix}${segment}/`
    }
  }
  return [...ids]
}

/**
 * Opens the rows a new selection needs (see `revealIds`). Selected in the tree itself, the rows it opened before stay
 * open, so nothing moves under the pointer or the keys. Selected anywhere else, they close, apart from those it still
 * needs and those opened by hand.
 */
export function revealRows(expansion: Expansion, ids: readonly string[], inTree: boolean): Expansion {
  const revealed = new Set(inTree ? [...expansion.revealed, ...ids] : ids)
  for (const id of expansion.opened) revealed.delete(id)
  const same = revealed.size === expansion.revealed.size && [...revealed].every((id) => expansion.revealed.has(id))
  return same ? expansion : { ...expansion, revealed }
}
