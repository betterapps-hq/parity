import {
  componentLibrary,
  type ContainerKind,
  type DesignNode,
  type ElementSource,
  findNode,
  isInnerPath,
  type LibraryInfo,
  locateInner,
  nodeLabel
} from "@parity-app/core"
import { editingState, layersSelection, selectedDesigns, selectedNodes, type Selection } from "@parity-app/editor"
import type { ContainerEntry } from "../design-store.ts"
import type { CommandStates } from "./command-state.ts"
import { type Command, keymap } from "./keymap.ts"
import { unnamedIconLabel } from "./layer-kind.ts"

/**
 * What the canvas's right-click menu shows, and what a right-click selects first, as Figma's canvas menu does. These
 * take data and return data: `CanvasMenu.tsx` finds what's under the pointer and runs what's chosen.
 */

/** What a menu item runs: a command from the keymap, or Paste here, which needs the pointer and has no keys. */
export type MenuAction = Command | "pasteHere"

export interface MenuItem {
  kind: "item"
  action: MenuAction
  label: string
  /** The keys shown, the keymap's first for the command. */
  keys?: string
  enabled: boolean
}

/** One of the layers under the pointer, in Select layer. */
export interface LayerChoice {
  /** The layer's id, by the canvas's ids (`card/title` inside an instance); for the design, its root's. */
  id: string
  /** Whether it's the design itself, which choosing selects on its own. */
  whole: boolean
  /** Its name, as the Layers panel names it. */
  label: string
  /** The layer, for its icon; undefined for the design. */
  layer?: DesignNode
  /** The design's kind, for the design's icon. */
  kind?: ContainerKind
  selected: boolean
}

export type MenuEntry =
  | MenuItem
  | { kind: "separator" }
  /** A submenu of every layer under the pointer, outermost first. */
  | { kind: "select-layer"; label: string; choices: LayerChoice[] }
  /** Opens the file the element under the pointer is written in, at its line (PAR-167). */
  | { kind: "open-source"; label: string; source: ElementSource }

/** The design under the pointer when the menu opened, and its layers there. */
export interface MenuTarget {
  design: string
  /** Every layer drawn under the pointer, outermost first, the design's root among them when it's under it. */
  path: readonly string[]
  /** The frame under the pointer; none around a design's frames. */
  mode?: string
  state?: string
  /** Where the element under the pointer is written, when a project file wrote it (PAR-167). */
  source?: ElementSource
}

/**
 * The menu for a right-click: over a design, Figma's canvas menu as far as Parity's commands go, for the selection,
 * which the right-click has already made (see `rightClickSelection`); on the canvas around designs (`target`
 * undefined), New screen, New component, Insert and Find references, then Paste here, then Select all and Zoom to fit.
 * Items for layers only (Paste to replace, the order, Wrap in layout and Hide) are left out with designs selected, and
 * Go to the main component unless it can go to one. Whether each item can act, and what it's called, is `states`', as
 * the menubar and the keys have it. Find references for designs (PAR-840) and Export, at the Export section's sizes
 * (PAR-185), then, over an element a project file wrote, Open in editor at its line (PAR-167) end the menu.
 */
export function canvasMenu(
  target: MenuTarget | undefined,
  states: CommandStates,
  selection: Selection,
  entries: readonly ContainerEntry[],
  libraries: readonly Pick<LibraryInfo, "id" | "kind">[] = []
): MenuEntry[] {
  const item = (action: MenuAction, label?: string) => menuItem(action, states, label)

  if (!target) {
    return sections([
      [item("newScreen"), item("newComponent"), item("insert", "Insert…"), item("findReferences", "Find references…")],
      [item("pasteHere")],
      [item("selectAll"), item("zoomToFit")]
    ])
  }

  const layers = selectedNodes(selection).length > 0
  const order: Command[] = ["bringToFront", "bringForward", "sendBackward", "sendToBack"]

  return sections([
    [{ kind: "select-layer", label: "Select layer", choices: layerChoices(target, selection, entries, libraries) }],
    [
      item("copy"),
      item("copyAsPng"),
      item("pasteHere"),
      item("pasteOver"),
      ...(layers ? [item("pasteReplace")] : []),
      item("duplicate")
    ],
    layers ? order.map((command) => item(command)) : [],
    [...(layers ? [item("wrap")] : []), item("makeComponent"), ...(states.goToMain.enabled ? [item("goToMain")] : [])],
    [...(layers ? [item("hide")] : []), item("lock")],
    [...(layers ? [] : [item("findReferences", "Find references…")]), item("exportSelection", "Export…")],
    target.source ? [{ kind: "open-source", label: "Open in editor", source: target.source }] : []
  ])
}

/**
 * What a right-click on a design selects before its menu opens, as in Figma. Inside the selection, it's kept, so the
 * menu acts on all of it: over a selected layer, or anywhere in a selected design. Elsewhere it selects what a click
 * there would, `clicked`, in the frame under the pointer; on a frame's background, or around the frames, that's the
 * design.
 */
export function rightClickSelection(
  current: Selection,
  target: MenuTarget,
  clicked: string | undefined,
  root: string | undefined
): Selection {
  const layers = current.design === target.design ? selectedNodes(current) : []

  const inside =
    layers.length > 0 ? layers.some((id) => target.path.includes(id)) : selectedDesigns(current).includes(target.design)

  if (inside) {
    return current
  }

  if (!clicked || clicked === root) {
    return { design: target.design }
  }

  return layersSelection(target.design, [clicked], target)
}

/** Every layer under the pointer, outermost first, the design itself at the top, named as the Layers panel names them. */
function layerChoices(
  target: MenuTarget,
  selection: Selection,
  entries: readonly ContainerEntry[],
  libraries: readonly Pick<LibraryInfo, "id" | "kind">[]
): LayerChoice[] {
  const entry = entries.find((candidate) => candidate.key === target.design)

  if (!entry) {
    return []
  }

  const { container } = entry
  const picked = selection.design === entry.key ? selectedNodes(selection) : []
  const library = componentLibrary(entries.map((candidate) => candidate.container))

  const view = {
    state: editingState(container, selection.design === entry.key ? selection.state : target.state),
    variants: container.view?.variants
  }

  const choices: LayerChoice[] = [
    {
      id: container.root.id,
      whole: true,
      label: container.name,
      kind: container.kind,
      selected: picked.length === 0 && selectedDesigns(selection).includes(entry.key)
    }
  ]

  for (const id of target.path) {
    if (id === container.root.id) {
      continue
    }

    const layer = isInnerPath(id) ? locateInner(container, id, library, view)?.shown : findNode(container.root, id)

    if (!layer) {
      continue
    }

    choices.push({
      id,
      whole: false,
      label: unnamedIconLabel(layer, libraries) ?? nodeLabel(layer, (design) => designName(entries, design)),
      layer,
      selected: picked.includes(id)
    })
  }

  return choices
}

/**
 * An item for a command, with the keymap's keys, and enabled and named as `states` has it. `label` is for a menu's own
 * fixed wording, as Insert… says it asks what, only for a command whose name never changes. Paste here always applies.
 */
export function menuItem(action: MenuAction, states: CommandStates, label?: string): MenuItem {
  if (action === "pasteHere") {
    return { kind: "item", action, label: label ?? "Paste here", enabled: true }
  }

  const { enabled, label: named } = states[action]

  return { kind: "item", action, label: label ?? named, keys: keymap[action].keys[0], enabled }
}

/** Groups of items with a line between each, leaving out the empty ones. */
export function sections(groups: readonly (readonly MenuEntry[])[]): MenuEntry[] {
  return groups
    .filter((group) => group.length > 0)
    .flatMap((group, index): MenuEntry[] => (index === 0 ? [...group] : [{ kind: "separator" }, ...group]))
}

function designName(entries: readonly ContainerEntry[], id: string): string | undefined {
  return entries.find((candidate) => candidate.container.id === id)?.container.name
}
