import { boardTarget, editTargetName, hiddenOnBoard, isInnerPath } from "@parity-app/core"
import { selectedDesigns, selectedNodes, type Selection, editingState } from "@parity-app/editor"
import type { ContainerEntry } from "../design-store.ts"
import { item, layerCommands, type MenuEntry, ownLayers, sections } from "./canvas-menu.ts"

/**
 * What a row's right-click menu in the Layers panel shows, and what the right-click selects first. These take data and
 * return data: `LayerTree.tsx` opens the menu and runs what's chosen through the menubar's commands, Rename excepted,
 * which renames the row in place.
 */

/** A row in Layers: a design, or one of its layers, its root among them. */
export interface LayersRow {
  design: string
  node?: string
}

/**
 * What a right-click on a row selects before its menu opens, as on the canvas: a row inside the selection keeps it, so
 * the menu acts on all of it; any other row is selected as a click would select it.
 */
export function rowSelection(current: Selection, row: LayersRow): Selection {
  const layers = current.design === row.design ? selectedNodes(current) : []
  if (row.node) return layers.includes(row.node) ? current : { design: row.design, node: row.node }
  return layers.length === 0 && selectedDesigns(current).includes(row.design) ? current : { design: row.design }
}

/**
 * The menu for a row, for the selection the right-click has made (see `rowSelection`): Rename and Duplicate; for a
 * layer, Hide or Show in where the change lands, as the canvas menu's Hide reads it; then Export, at the Export section's
 * sizes (PAR-185); then Delete. Each has the keymap's
 * label and keys, and is unavailable when the menubar's would be: the design's root, and layers inside an instance,
 * can't be duplicated, hidden or deleted. A layer inside an instance keeps its component's name, so it can't be renamed
 * either (PAR-92).
 */
export function layersMenu(row: LayersRow, selection: Selection, entries: readonly ContainerEntry[]): MenuEntry[] {
  const entry = entries.find((candidate) => candidate.key === row.design)
  if (!entry || selection.design !== row.design) return []
  const { container } = entry
  const layers = selectedNodes(selection).length > 0
  const can = layerCommands(selection, container.root)
  const own = ownLayers(selection, container.root).map((node) => node.id)
  const state = editingState(container, selection.state)
  const hidden = own.length > 0 && hiddenOnBoard(container, state.id, own)
  const where = editTargetName(container, boardTarget(container, state.id))
  return sections([
    [item("rename", !row.node || !isInnerPath(row.node)), item("duplicate", layers ? can.duplicate : true)],
    row.node ? [item("hide", can.hide, `${hidden ? "Show" : "Hide"} in ${where}`)] : [],
    [item("exportSelection", true, "Export…")],
    [item("delete", layers ? own.length > 0 : true)]
  ])
}
