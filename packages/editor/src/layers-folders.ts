import type { TreeDesign, TreeRow } from "./layers-tree.ts"

// Designs a tool groups into folders, as Storybook groups its stories by title, listed as a tree of those folders in the
// Layers panel: a folder for each part of the title, each design inside the last.

/**
 * A folder's row. A folder that holds designs is a component's, as `Button` holds Button's stories; one that holds
 * only folders is a group, as `UI` does.
 */
export interface FolderRow {
  type: "folder"
  /** `folderId` of its path. */
  id: string
  label: string
  kind: "group" | "component"
  /** How many folders it's inside. */
  level: number
  expanded: boolean
  /** Where it is among the rows beside it, from 1, and how many there are, as a screen reader reads them. */
  position: number
  siblings: number
  /** The folder it's in, or undefined at the top. */
  parent?: string
}

/** A design's row, or one of its layers', inside the folders `level` says. */
export interface FolderedRow<D extends TreeDesign = TreeDesign> {
  type: "row"
  row: TreeRow<D>
  level: number
  /** The folder it's in, or undefined at the top. */
  parent?: string
}

export type FolderTreeRow<D extends TreeDesign = TreeDesign> = FolderRow | FolderedRow<D>

/** A folder's id: what it's listed under, as `stories`, and its path, as `UI/Button`. */
export function folderId(scope: string, path: readonly string[]): string {
  return `folder:${scope}:${path.join("/")}`
}

/** The ids of the folders a design with this path is inside, outermost first, to open them and show it. */
export function folderIds(scope: string, path: readonly string[]): string[] {
  return path.map((_, at) => folderId(scope, path.slice(0, at + 1)))
}

export interface FolderTreeOptions<D extends TreeDesign> {
  /** What the folders are listed under, which their ids start with. */
  scope: string
  /** The folders a design is inside, outermost first: none to list it at the top. */
  folderOf: (design: D) => readonly string[]
  /** The rows of some designs that show, as `treeRows` or `searchRows` gives them; a design with none is left out. */
  rowsOf: (designs: readonly D[]) => TreeRow<D>[]
  expanded: ReadonlySet<string>
  /** A search opens every folder with something found in it, and leaves out the rest. */
  searching?: boolean
}

interface Folder<D> {
  path: string[]
  items: ({ folder: Folder<D> } | { design: D })[]
  folders: Map<string, Folder<D>>
}

/**
 * Designs as a tree of the folders they're in, top to bottom, folders and designs in the order the designs come: each
 * folder, and inside an open one its folders and designs with their rows.
 */
export function folderTree<D extends TreeDesign>(
  designs: readonly D[],
  options: FolderTreeOptions<D>
): FolderTreeRow<D>[] {
  const top: Folder<D> = { path: [], items: [], folders: new Map() }

  for (const design of designs) {
    let folder = top

    for (const part of options.folderOf(design)) {
      let inner = folder.folders.get(part)

      if (!inner) {
        inner = { path: [...folder.path, part], items: [], folders: new Map() }
        folder.folders.set(part, inner)
        folder.items.push({ folder: inner })
      }

      folder = inner
    }

    folder.items.push({ design })
  }

  return linesOf(top, 0, undefined, options)
}

function linesOf<D extends TreeDesign>(
  folder: Folder<D>,
  level: number,
  parent: string | undefined,
  options: FolderTreeOptions<D>
): FolderTreeRow<D>[] {
  const designs = folder.items.flatMap((item) => ("design" in item ? [item.design] : []))
  const rows = Map.groupBy(options.rowsOf(designs), (row) => row.design.key)

  // Each folder or design that shows, with the rows it brings: a folder's own row comes once its place is known.
  const shown = folder.items.flatMap((item): { folder?: Folder<D>; id?: string; lines: FolderTreeRow<D>[] }[] => {
    if ("design" in item) {
      const own = rows.get(item.design.key) ?? []

      return own.length > 0 ? [{ lines: own.map((row): FolderedRow<D> => ({ type: "row", row, level, parent })) }] : []
    }

    const id = folderId(options.scope, item.folder.path)
    const open = !!options.searching || options.expanded.has(id)
    const inside = open ? linesOf(item.folder, level + 1, id, options) : []

    return options.searching && inside.length === 0 ? [] : [{ folder: item.folder, id, lines: inside }]
  })

  return shown.flatMap((each, at): FolderTreeRow<D>[] => {
    const place = { position: at + 1, siblings: shown.length }

    if (!each.folder || !each.id) {
      const [first, ...rest] = each.lines

      return first?.type === "row" ? [{ ...first, row: { ...first.row, ...place } }, ...rest] : each.lines
    }

    const holdsDesigns = each.folder.items.some((item) => "design" in item)

    const row: FolderRow = {
      type: "folder",
      id: each.id,
      label: each.folder.path.at(-1) ?? "",
      kind: holdsDesigns ? "component" : "group",
      level,
      expanded: !!options.searching || options.expanded.has(each.id),
      ...place
    }

    if (parent) {
      row.parent = parent
    }

    return [row, ...each.lines]
  })
}
