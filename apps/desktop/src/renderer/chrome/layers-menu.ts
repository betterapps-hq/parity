import { isInnerPath } from "@parity-app/core"
import { selectedDesigns, selectedNodes, type Selection } from "@parity-app/editor"
import { type MenuEntry, menuItem, sections } from "./canvas-menu.ts"
import type { CommandStates } from "./command-state.ts"

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

  if (row.node) {
    return layers.includes(row.node) ? current : { design: row.design, node: row.node }
  }

  return layers.length === 0 && selectedDesigns(current).includes(row.design) ? current : { design: row.design }
}

/**
 * The menu for a row, for the selection the right-click has made (see `rowSelection`): Rename and Duplicate; for a
 * layer, Hide or Show, and for a layer or a design Lock or Unlock; then Export, at the Export section's sizes (PAR-185);
 * then Delete. Each has the keymap's keys, and is enabled and named as `states` has it, as the menubar and the keys
 * have them: the design's root, and layers inside an instance, can't be duplicated or hidden, and a layer inside an
 * instance keeps its component's name, so it can't be renamed either (PAR-92).
 */
export function layersMenu(row: LayersRow, states: CommandStates, selection: Selection): MenuEntry[] {
  if (selection.design !== row.design) {
    return []
  }

  const rename = menuItem("rename", states)

  return sections([
    // Rename renames the row, so a layer inside an instance can't be, whichever selected layer the selection leads with.
    [{ ...rename, enabled: rename.enabled && !(row.node && isInnerPath(row.node)) }, menuItem("duplicate", states)],
    [...(row.node ? [menuItem("hide", states)] : []), menuItem("lock", states)],
    [menuItem("exportSelection", states, "Export…")],
    [menuItem("delete", states)]
  ])
}
