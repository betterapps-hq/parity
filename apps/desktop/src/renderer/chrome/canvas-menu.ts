import {
  componentLibrary,
  type ContainerKind,
  type ContainerSpec,
  type DesignNode,
  findNode,
  hiddenOnBoard,
  isInnerPath,
  locateInner,
  nodeLabel,
  type StateSpec
} from "@parity-app/core"
import { activeState } from "../canvas/view.ts"
import type { ContainerEntry } from "../design-store.ts"
import { layersSelection, selectedDesigns, selectedNodes, type Selection } from "../selection.ts"
import { type Command, keymap } from "./keymap.ts"

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

/** The design under the pointer when the menu opened, and its layers there. */
export interface MenuTarget {
  design: string
  /** Every layer drawn under the pointer, outermost first, the design's root among them when it's under it. */
  path: readonly string[]
  /** The frame under the pointer; none around a design's frames. */
  mode?: string
  state?: string
}

/**
 * The menu for a right-click: over a design, Figma's canvas menu as far as Parity's commands go, for the selection,
 * which the right-click has already made (see `rightClickSelection`); on the canvas around designs (`target`
 * undefined), Paste here, Select all and Zoom to fit. Items for layers only (Paste to replace, the order, Wrap in
 * layout and Hide) are left out with designs selected, and Go to the main component unless an instance is. Each is
 * unavailable when the menubar's would be, and, for layers inside an instance, when it can't act on them: Copy,
 * Duplicate, the order, Wrap in layout and Hide. Paste over and Paste to replace stay, and say why they can't.
 */
export function canvasMenu(
  target: MenuTarget | undefined,
  selection: Selection,
  entries: readonly ContainerEntry[]
): MenuEntry[] {
  if (!target) return sections([[item("pasteHere", true)], [item("selectAll", true), item("zoomToFit", true)]])
  const entry = selection.design ? entries.find((candidate) => candidate.key === selection.design) : undefined
  const ids = entry ? selectedNodes(selection) : []
  const root = entry?.container.root
  const own = ownLayers(selection, root)
  const can = layerCommands(selection, root)
  const layers = ids.length > 0
  const designs = layers ? 0 : selectedDesigns(selection).length
  const alone = entry && !selection.node && !selection.designs?.length ? entry.container : undefined
  const one = ids.length === 1 && own.length === 1 ? own[0] : undefined
  const instance = one?.type === "instance" ? one : undefined
  const state = entry ? editingState(entry.container, selection.state) : undefined
  // As Hide decides: every selected layer hidden as the board shows it, with its variant, the state and the params.
  const ownIds = own.map((node) => node.id)
  const hidden = !!entry && !!state && ownIds.length > 0 && hiddenOnBoard(entry.container, state.id, ownIds)
  const order: Command[] = ["bringToFront", "bringForward", "sendBackward", "sendToBack"]
  return sections([
    [{ kind: "select-layer", label: "Select layer", choices: layerChoices(target, selection, entries) }],
    [
      item("copy", layers ? can.copy : !!selection.design),
      item("pasteHere", true),
      item("pasteOver", layers || designs > 0),
      ...(layers ? [item("pasteReplace", true)] : []),
      item("duplicate", layers ? can.duplicate : !!selection.design)
    ],
    layers ? order.map((command) => item(command, can.order)) : [],
    [
      ...(layers ? [item("wrap", can.wrap)] : []),
      item("makeComponent", !!alone || !!one, makeLabel(alone)),
      ...(instance
        ? [item("goToMain", true, `Go to ${designName(entries, instance.design) ?? "the main component"}`)]
        : [])
    ],
    layers ? [item("hide", can.hide, hidden ? "Show" : "Hide")] : []
  ])
}

/** The commands that copy, move or change the selected layers themselves. */
export type LayerCommand = "copy" | "duplicate" | "order" | "wrap" | "hide"

/**
 * Which commands that copy, move or change the selected layers can act on them, for this menu and the menubar alike:
 * Copy, Duplicate, Wrap in layout and Hide when any is the design's own, and the order when one layer is selected and
 * it's the design's own. Layers inside an instance, and the design's root, aren't (see `ownLayers`).
 */
export function layerCommands(selection: Selection, root: DesignNode | undefined): Record<LayerCommand, boolean> {
  const own = ownLayers(selection, root).length
  const one = own === 1 && selectedNodes(selection).length === 1
  return { copy: own > 0, duplicate: own > 0, order: one, wrap: own > 0, hide: own > 0 }
}

/**
 * The selected layers that are the design `root` draws as its own, as the commands that move or change layers need:
 * not its root, nor a layer inside an instance (`card/title`), which belongs to the instance's component.
 */
export function ownLayers(selection: Selection, root: DesignNode | undefined): DesignNode[] {
  return selectedNodes(selection).flatMap((id) => {
    const node = root && !isInnerPath(id) && id !== root.id ? findNode(root, id) : undefined
    return node ? [node] : []
  })
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
  if (inside) return current
  if (!clicked || clicked === root) return { design: target.design }
  return layersSelection(target.design, [clicked], target)
}

/** Every layer under the pointer, outermost first, the design itself at the top, named as the Layers panel names them. */
function layerChoices(target: MenuTarget, selection: Selection, entries: readonly ContainerEntry[]): LayerChoice[] {
  const entry = entries.find((candidate) => candidate.key === target.design)
  if (!entry) return []
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
    if (id === container.root.id) continue
    const layer = isInnerPath(id) ? locateInner(container, id, library, view)?.shown : findNode(container.root, id)
    if (!layer) continue
    choices.push({
      id,
      whole: false,
      label: nodeLabel(layer, (design) => designName(entries, design)),
      layer,
      selected: picked.includes(id)
    })
  }
  return choices
}

/** What Make component says for a design picked alone: it turns a component back into a screen. */
function makeLabel(alone: ContainerSpec | undefined): string | undefined {
  if (alone?.kind === "component") return "Make it a screen"
  return alone ? "Make it a component" : undefined
}

function item(action: MenuAction, enabled: boolean, label?: string): MenuItem {
  if (action === "pasteHere") return { kind: "item", action, label: label ?? "Paste here", enabled }
  return { kind: "item", action, label: label ?? keymap[action].label, keys: keymap[action].keys[0], enabled }
}

/** Groups of items with a line between each, leaving out the empty ones. */
function sections(groups: readonly (readonly MenuEntry[])[]): MenuEntry[] {
  return groups
    .filter((group) => group.length > 0)
    .flatMap((group, index): MenuEntry[] => (index === 0 ? [...group] : [{ kind: "separator" }, ...group]))
}

/** The state being edited: the one the selection was picked in, else the one the board shows. */
function editingState(container: ContainerSpec, picked: string | undefined): StateSpec {
  return container.states.find((state) => state.id === picked) ?? activeState(container)
}

function designName(entries: readonly ContainerEntry[], id: string): string | undefined {
  return entries.find((candidate) => candidate.container.id === id)?.container.name
}
