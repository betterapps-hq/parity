import { type DesignNode, findNode, hiddenOnBoard, isInnerPath } from "@parity-app/core"
import {
  designsLocked,
  editingState,
  layersLocked,
  selectedDesigns,
  selectedNodes,
  type Selection
} from "@parity-app/editor"
import type { ContainerEntry } from "../design-store.ts"
import { type Command, keymap } from "./keymap.ts"

/**
 * Whether each command can run now and what it's called, worked out once for every place that offers it: the keys, the
 * menubar, Search actions, the toolbar and the canvas and Layers menus (PAR-971). It takes data and returns data;
 * `actions.ts` reads the active tab into a `CommandContext` and runs only what this says is enabled.
 */

/** What a command's state depends on: the tab's selection and what it holds. */
export interface CommandContext {
  /** What's selected in the active project tab; undefined when the active tab isn't a project. */
  selection?: Selection
  /** The project's screens and components. */
  entries: readonly ContainerEntry[]
  /** How many text notes are on the canvas. */
  notes: number
  /** How many references Find references has placed on the canvas. */
  placedReferences: number
  /** Whether the tab's canvas is drawn, which zooming needs. */
  canvas: boolean
  history: { canUndo: boolean; canRedo: boolean; undoLabel?: string; redoLabel?: string }
  /** What Repeat last action would run again, and whether it applies now. */
  repeat?: { label: string; enabled: boolean }
  /** Whether a reference library is connected, which Find references searches. */
  references: boolean
}

export interface CommandState {
  enabled: boolean
  /** What it's called: the keymap's label, unless what's selected changes it, as Lock reads Unlock. */
  label: string
}

/** Every command's state: whether it can act now, and what it's called. */
export type CommandStates = Readonly<Record<Command, CommandState>>

/**
 * Each command's state for `context`. A command acts on what's selected when it can: layers of the design's own for
 * Copy, Duplicate, the order, Wrap in layout, Hide and Lock, not its root or layers inside an instance (see
 * `ownLayers`), and Cut and Delete when layers are selected; the order on one layer alone. Hide reads Show when every selected layer is hidden as the board shows it, and Lock reads Unlock when every
 * selected layer, or every selected design, is locked (PAR-192).
 */
export function commandStates(context: CommandContext): CommandStates {
  const { selection, entries, history, repeat } = context
  const project = !!selection
  const current = selection ?? {}
  const entry = current.design ? entries.find((candidate) => candidate.key === current.design) : undefined
  const root = entry?.container.root
  const layers = selectedNodes(current).length
  const designKeys = layers === 0 ? selectedDesigns(current) : []
  const designs = designKeys.length
  const own = ownLayers(current, root)
  const ownIds = own.map((node) => node.id)
  const ownOne = own.length === 1 && layers === 1
  const design = !!current.design
  const copyable = design || !!current.note
  const something = copyable || !!current.reference
  const filled = entries.length > 0 || context.notes > 0

  // A design picked on its own, rather than one of its layers or several designs.
  const alone = entry && !current.node && !current.designs?.length ? entry.container : undefined
  const instance = ownOne && own[0]?.type === "instance" ? own[0] : undefined

  const hidden =
    !!entry &&
    ownIds.length > 0 &&
    hiddenOnBoard(entry.container, editingState(entry.container, current.state).id, ownIds)

  const locked =
    layers > 0
      ? !!entry && ownIds.length > 0 && layersLocked(entry.container, ownIds)
      : designs > 0 &&
        designsLocked(designKeys.flatMap((key) => entries.find((candidate) => candidate.key === key)?.container ?? []))

  const canOwn = own.length > 0
  const lockable = layers > 0 ? canOwn : designs > 0
  const order = ownOne
  const alignable = layers > 0 || designs > 1
  const pointed = layers > 0 || designs > 0

  const enabled: Record<Command, boolean> = {
    select: project,
    hand: project,
    frame: project,
    text: project,
    interact: project,
    comment: project,
    annotate: project,
    findReferences: project && context.references,

    selectAll: project && filled,
    selectInverse: project,
    selectMatching: pointed,
    nextDesign: entries.length > 0,
    previousDesign: entries.length > 0,
    selectChildren: design,
    selectParent: layers > 0,
    selectNext: layers > 0,
    selectPrevious: layers > 0,
    back: project,

    undo: project && history.canUndo,
    redo: project && history.canRedo,
    repeat: !!repeat?.enabled,
    cut: layers > 0 ? canOwn : copyable,
    copy: layers > 0 ? canOwn : copyable,
    paste: project,
    pasteOver: pointed,
    pasteReplace: layers > 0,
    duplicate: layers > 0 ? canOwn : design,
    delete: layers > 0 ? canOwn : something,
    copyAsPng: pointed,
    copyStyle: layers > 0,
    pasteStyle: layers > 0,
    // A layer inside an instance keeps its component's name (PAR-92).
    rename: design && !(current.node && isInnerPath(current.node)),

    newScreen: project,
    newComponent: project,
    insert: project,
    wrap: canOwn,
    unwrap: layers === 1,
    makeComponent: !!alone || ownOne,
    goToMain: !!instance,
    detach: !!instance,
    bringForward: order,
    sendBackward: order,
    bringToFront: order,
    sendToBack: order,
    hide: canOwn,
    lock: lockable,

    alignLeft: alignable,
    alignCenter: alignable,
    alignRight: alignable,
    alignTop: alignable,
    alignMiddle: alignable,
    alignBottom: alignable,
    distributeHorizontal: designs >= 3,
    distributeVertical: designs >= 3,
    nudge: something,
    bigNudge: something,

    zoomIn: context.canvas,
    zoomOut: context.canvas,
    zoomTo100: context.canvas,
    zoomToFit: context.canvas && (filled || context.placedReferences > 0),
    zoomToSelection: something,
    panels: true,
    console: true,
    showLayers: true,
    showComponents: true,
    layoutGrid: true,
    home: true,
    nextTab: true,
    previousTab: true,

    newTab: true,
    openFolder: true,
    openFile: true,
    save: project,
    saveCopy: project,
    exportSelection: pointed,
    closeTab: true,
    settings: true,

    actions: true,
    shortcuts: true,
    developerTools: true
  }

  const labels: Partial<Record<Command, string>> = {
    undo: history.undoLabel && `Undo ${history.undoLabel.toLowerCase()}`,
    redo: history.redoLabel && `Redo ${history.redoLabel.toLowerCase()}`,
    repeat: repeat && `Repeat ${repeat.label[0]!.toLowerCase()}${repeat.label.slice(1)}`,
    makeComponent: alone && (alone.kind === "component" ? "Convert to screen" : "Convert to component"),
    goToMain: instance && `Go to ${designName(entries, instance) ?? "component"}`,
    hide: toggled(canOwn, hidden, "Show", "Hide"),
    lock: toggled(lockable, locked, "Unlock", "Lock")
  }

  // SAFETY: the loop below gives it an entry for every command before it's returned.
  const states = {} as Record<Command, CommandState>

  // SAFETY: `enabled` is a Record<Command, boolean>, so its own keys are the commands.
  for (const command of Object.keys(enabled) as Command[]) {
    states[command] = { enabled: enabled[command], label: labels[command] ?? keymap[command].label }
  }

  return states
}

/** What a toggle reads when it can act, `on` when every selected item is already toggled; else the keymap's name. */
function toggled(applies: boolean, already: boolean, on: string, off: string): string | undefined {
  if (!applies) {
    return undefined
  }

  return already ? on : off
}

/**
 * The selected layers that are the design `root` draws as its own, as the commands that move or change layers need:
 * not its root, nor a layer inside an instance (`card/title`), which belongs to the instance's component.
 */
function ownLayers(selection: Selection, root: DesignNode | undefined): DesignNode[] {
  return selectedNodes(selection).flatMap((id) => {
    const node = root && !isInnerPath(id) && id !== root.id ? findNode(root, id) : undefined

    return node ? [node] : []
  })
}

/** The name of the component an instance copies. */
function designName(entries: readonly ContainerEntry[], instance: DesignNode): string | undefined {
  const id = instance.type === "instance" ? instance.design : undefined

  return entries.find((candidate) => candidate.container.id === id)?.container.name
}
