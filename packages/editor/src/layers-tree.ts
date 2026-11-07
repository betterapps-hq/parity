import { childNodes, type ContainerSpec, type DesignNode, locateNode } from "@parity-app/core"

/**
 * The rows a layer has below it in Layers. An instance has none: what it fills its slots with is shown on the canvas
 * and in its own panel, never inline under it.
 */
function rowChildren(node: DesignNode): DesignNode[] {
  return node.type === "instance" ? [] : childNodes(node)
}

// The Layers panel's tree as rows: which rows show, which are open, and what opens as the selection moves (PAR-187).
// The panel draws only the rows in view, so everything it needs to know about the rest is worked out here.

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
  /** The layer, or undefined for the design's own row. */
  node?: DesignNode
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

/** Every row that shows, top to bottom: each design, and inside it the layers of every open row. */
export function treeRows<D extends TreeDesign>(designs: readonly D[], expanded: ReadonlySet<string>): TreeRow<D>[] {
  const rows: TreeRow<D>[] = []
  designs.forEach((design, index) => {
    const open = expanded.has(design.key)
    rows.push(designRow(design, index, designs.length, open))
    if (!open) return
    const visit = (node: DesignNode, depth: number, position: number, siblings: number) => {
      const id = layerRowId(design.key, node.id)
      const children = rowChildren(node)
      const shown = children.length > 0 && expanded.has(id)
      rows.push({ id, depth, design, node, hasChildren: children.length > 0, expanded: shown, position, siblings })
      if (shown) children.forEach((child, at) => visit(child, depth + 1, at + 1, children.length))
    }
    visit(design.container.root, 1, 1, 1)
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
  label: (design: D, node?: DesignNode) => string
): TreeRow<D>[] {
  const needle = search.trim().toLocaleLowerCase()
  const matches = (design: D, node?: DesignNode) => label(design, node).toLocaleLowerCase().includes(needle)
  // Each found subtree, built bottom up so a row knows whether anything inside it matched before it's kept.
  const found = (design: D, node: DesignNode, depth: number): TreeRow<D>[] => {
    const children = rowChildren(node)
    const inside = children.map((child) => found(design, child, depth + 1)).filter((rows) => rows.length > 0)
    if (inside.length === 0 && !matches(design, node)) return []
    inside.forEach((rows, index) => Object.assign(rows[0]!, { position: index + 1, siblings: inside.length }))
    const id = layerRowId(design.key, node.id)
    const row = { id, depth, design, node, hasChildren: children.length > 0, expanded: inside.length > 0 }
    return [{ ...row, position: 1, siblings: 1 }, ...inside.flat()]
  }
  const shown = designs
    .map((design) => ({ design, inside: found(design, design.container.root, 1) }))
    .filter(({ design, inside }) => inside.length > 0 || matches(design))
  return shown.flatMap(({ design, inside }, index) => [
    designRow(design, index, shown.length, inside.length > 0),
    ...inside
  ])
}

function designRow<D extends TreeDesign>(design: D, index: number, count: number, expanded: boolean): TreeRow<D> {
  return { id: design.key, depth: 0, design, hasChildren: true, expanded, position: index + 1, siblings: count }
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

/** A row's id and the id of every row inside it with layers of its own: what Alt+click on its arrow opens or closes. */
export function branchIds(design: TreeDesign, node?: DesignNode): string[] {
  const ids = node ? [] : [design.key]
  const visit = (layer: DesignNode) => {
    const children = rowChildren(layer)
    if (children.length === 0) return
    ids.push(layerRowId(design.key, layer.id))
    children.forEach(visit)
  }
  visit(node ?? design.container.root)
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
 * The rows that have to be open for layers of a design to show: the design's, then each layer's ancestors'. With no
 * layers, the design's alone, since a selected design shows its page.
 */
export function revealIds(design: TreeDesign, nodes: readonly string[]): string[] {
  const { key, container } = design
  const ids = new Set([key, layerRowId(key, container.root.id)])
  for (const node of nodes) {
    for (const ancestor of locateNode(container.root, node)?.ancestors ?? []) ids.add(layerRowId(key, ancestor.id))
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
