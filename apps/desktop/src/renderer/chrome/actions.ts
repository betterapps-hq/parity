import { type ContainerKind, findNode } from "@parity-app/core"
import { type Alignment, arrowOf, type Order, reviewToolFor, selectedDesigns, selectedNodes } from "@parity-app/editor"
import { toast } from "sonner"
import type { ServiceMethods } from "../../shared/protocol.ts"
import { canvasIdFor } from "../canvas/CanvasEditor.tsx"
import {
  copySelection,
  copyStyle,
  duplicateDesigns,
  pasteClipboard,
  pasteOverSelection,
  pasteStyle,
  pasteToReplace
} from "../canvas/clipboard.ts"
import { layerLabel } from "../canvas/kinds.tsx"
import { parentLayer, siblingLayer } from "../canvas/layers.ts"
import { frameDrawn, nudgeSelection } from "../canvas/nudge.ts"
import { enterTarget } from "../canvas/pick.ts"
import { adjacentDesign, inverseSelection, matchingSelection } from "../canvas/select.ts"
import { getEffectivePreferences, setEffectivePreference } from "../project-settings.ts"
import { findReferences, referenceLibrary } from "../references/find-references.ts"
import { errorMessage, reportError } from "../report-error.ts"
import type { Tool } from "../selection.ts"
import { serviceCall } from "../service-call.ts"
import { request } from "../service.ts"
import { spacingUnit } from "../tokens-store.ts"
import { homeTab, type ProjectDesigns, type ProjectSession, saveFailureToast, workspace } from "../workspace.ts"
import { openDialog } from "./app-dialogs.ts"
import {
  align,
  deleteDesigns,
  deleteLayers,
  distribute,
  duplicateLayers,
  orderLayer,
  selectAll,
  toggleHiddenLayers,
  toggleLockedSelection,
  unwrapLayer,
  wrapLayers
} from "./arrange.ts"
import { type CommandContext, type CommandStates, commandStates } from "./command-state.ts"
import { activeSession, exportLayers, selectedDesign, selectedTargets } from "./commands.ts"
import { detachAndRecord } from "./component-events.ts"
import { extractIntoComponent } from "./components.ts"
import { createDesign } from "./create.ts"
import { duplicateDesign, setDesignKind } from "./designs.ts"
import { type Command, keymap } from "./keymap.ts"
import { setLayout, toggleConsole, togglePanels } from "./layout.ts"
import { openQuickInsert } from "./QuickInsert.tsx"
import { type RecordedAction, recordActions } from "./record-actions.ts"
import { lastAction, rememberAction, repeatLastAction } from "./repeat.ts"
import { revealSelection } from "./reveal.ts"

/**
 * Every command in the keymap and what it runs: the one place the window runs a command, so each is recorded, and runs
 * only when `commandStates` says it applies, however it's asked for (PAR-639, PAR-971). What each runs is private to
 * this module; the rest of the window has `actions` to run them and `commandsFor` to say whether they can run and what
 * they're called. `app` ones work anywhere in the window, even in a text field; the rest act on the canvas, so typing
 * and menus keep their keys.
 */

/** What running an action gives back: nothing, or a promise of when it's done, which `command.ran` waits for. */
export type ActionResult = void | Promise<void>

export interface Action {
  /**
   * Runs it on `session`, the tab it was asked for in. `event` is the key that ran it, for an action that acts on which
   * of its keys was pressed.
   */
  run(session: ProjectSession | undefined, event?: KeyboardEvent): ActionResult
  scope?: "app"
  /** It acts on the key pressed, as the arrows nudge each their own way, so only its keys run it, not the search. */
  byKey?: boolean
}

/**
 * What the commands' states depend on in `session`, read as it is now. `repeat` false leaves out what Repeat would run,
 * for asking whether that applies, which asks this again.
 */
function contextOf(
  session: (ProjectDesigns & Pick<ProjectSession, "editor">) | undefined,
  repeat = true
): CommandContext {
  const history = session?.store.getHistory()
  const last = repeat ? lastAction() : undefined

  return {
    selection: session?.selection.get(),
    entries: session?.store.getEntries() ?? [],
    notes: session?.store.getNotes().length ?? 0,
    placedReferences: session?.store.getReferences().length ?? 0,
    canvas: !!session?.editor,
    history: {
      canUndo: !!history?.canUndo,
      canRedo: !!history?.canRedo,
      undoLabel: history?.undoLabel,
      redoLabel: history?.redoLabel
    },
    repeat: last && { label: last.label, enabled: last.available?.() !== false },
    references: !!referenceLibrary
  }
}

/**
 * Whether each command can run in `session`, the active tab unless another is given, and what it's called there, for
 * the menus, the search and the keys to read before running one.
 */
export function commandsFor(
  session: (ProjectDesigns & Pick<ProjectSession, "editor">) | undefined = activeSession()
): CommandStates {
  return commandStates(contextOf(session))
}

async function openProjectFolder(): Promise<void> {
  const root = await window.canvasHost.pickFolder()

  if (root) {
    await workspace.open(root)
  }
}

/** Opens the project a `.par` file belongs to. */
async function openProjectFile(): Promise<void> {
  const file = await window.canvasHost.pickProjectFile()

  if (file) {
    await workspace.open(file)
  }
}

/** Writes every file with unsaved changes and says which ones it wrote. */
async function save(session: Pick<ProjectSession, "id" | "store"> | undefined): Promise<void> {
  if (!session) {
    return
  }

  try {
    const paths = session.store.unsavedPaths()
    await session.store.flush()
    toast.success("Saved", { description: paths.join(", ") || session.store.mainPath, duration: 2000 })
  } catch (error) {
    reportError(error, {
      operation: "project.save",
      title: "Couldn't save",
      id: saveFailureToast(session.id),
      description: errorMessage(error)
    })
  }
}

/**
 * Writes every design, note and the modes into one `.par` file wherever the person picks, as a snapshot to share or
 * keep. The project keeps working from its own files. It suggests a place outside the project, since a `.par` inside
 * it would show up as more designs.
 */
async function saveCopy(session: Pick<ProjectSession, "info" | "store"> | undefined): Promise<void> {
  if (!session) {
    return
  }

  const { root, name } = session.info

  const path = await window.canvasHost.saveFile({
    title: "Save a copy",
    defaultPath: join(parentOf(root), `${name} copy.par`),
    filters: [{ name: "Parity project", extensions: ["par"] }]
  })

  if (!path) {
    return
  }

  try {
    await session.store.flush()
    await request("document.saveCopy", { path, document: session.store.merged() })
    toast.success("Saved a copy", {
      description: path,
      action: { label: "Show", onClick: () => void window.canvasHost.showItem(path) }
    })
  } catch (error) {
    reportError(error, {
      operation: "document.saveCopy",
      title: "Couldn't save the copy",
      description: errorMessage(error)
    })
  }
}

/** A layer as `layers.picture` draws it. */
type PicturedLayer = ServiceMethods["layers.picture"]["params"]["layers"][number]

/**
 * Exports what's selected at the Export section's sizes (PAR-185): the selected layers, or else the selected designs,
 * each named as the Layers panel names it. The command is greyed with nothing selected; if the selected layers are gone
 * by the time it runs, it says to select something.
 */
async function exportSelected(
  session: (ProjectDesigns & Pick<ProjectSession, "id" | "info">) | undefined
): Promise<void> {
  if (!session) {
    return
  }

  const targets = selectedTargets(session)

  if (targets.length === 0) {
    toast.info("Select a screen, a component or a layer to export it")

    return
  }

  await exportLayers(session.id, targets, getEffectivePreferences(session.store).exportSizes)
}

/**
 * Copies what's selected to the clipboard as one PNG at 2x (PAR-190), drawn as exporting draws it: the selected
 * layers, or else the selected designs, where they sit on the canvas. A toast says it's copied, or warns of any it
 * couldn't draw.
 */
async function copySelectedAsPng(
  session: (ProjectDesigns & Pick<ProjectSession, "id" | "info">) | undefined
): Promise<void> {
  if (!session) {
    return
  }

  const targets = selectedTargets(session)

  if (targets.length === 0) {
    toast.info("Select a screen, a component or a layer to copy it as a PNG")

    return
  }

  const copied = await serviceCall({
    progress: "Copying as PNG…",
    async run() {
      const { png, warnings } = await request("layers.picture", {
        projectId: session.id,
        layers: targets.map(({ design, node, name }) => {
          const layer: PicturedLayer = {
            design,
            name,
            at: session.store.getEntry(design)?.container.position ?? { x: 0, y: 0 }
          }

          if (node) {
            layer.node = node
          }

          return layer
        })
      })

      if (png) {
        const blob = new Blob([Uint8Array.from(atob(png), (char) => char.charCodeAt(0))], { type: "image/png" })
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })])
      }

      return { drawn: Boolean(png), warnings }
    },
    done: ({ drawn, warnings }) =>
      drawn
        ? { success: "Copied as PNG", duration: 2000 }
        : {
            failure: new Error(warnings.join("\n") || "Nothing was drawn"),
            operation: "layers.picture",
            title: "Couldn't copy as PNG",
            description: warnings.join("\n") || undefined,
            classNames: { description: "whitespace-pre-line" }
          },
    failed: { operation: "layers.picture", title: "Couldn't copy as PNG" }
  })

  if (copied?.drawn && copied.warnings.length > 0) {
    toast.warning("Some layers couldn't be drawn", {
      description: copied.warnings.join("\n"),
      classNames: { description: "whitespace-pre-line" }
    })
  }
}

/** Opens a new tab, which shows the start page until a project opens in it. */
function openNewTab(): void {
  workspace.newTab()
}

/** Shows Home, the start page pinned first in the tab strip. */
function goHome(): void {
  workspace.activate(homeTab)
}

/** Closes the active tab once its last edits are saved. */
function closeTab(id = workspace.getActiveId()): void {
  if (id) {
    void workspace.close(id)
  }
}

function undo(session: Pick<ProjectSession, "store"> | undefined): void {
  session?.store.undo()
}

function redo(session: Pick<ProjectSession, "store"> | undefined): void {
  session?.store.redo()
}

/** Duplicates the selected layers, or the selected designs. */
function duplicateSelection(session: (ProjectDesigns & Pick<ProjectSession, "editor">) | undefined): void {
  if (!session) {
    return
  }

  if (duplicateLayers(session)) {
    return
  }

  const designs = selectedDesigns(session.selection.get())
  const entry = designs.length === 1 ? session.store.getEntry(designs[0]!) : undefined

  if (entry) {
    duplicateDesign(session, entry)
  } else {
    duplicateDesigns(session)
  }
}

/** Deletes the selected layers, designs, text note or reference. */
function deleteSelection(session: ProjectDesigns | undefined): void {
  if (!session) {
    return
  }

  const { store, selection } = session
  const current = selection.get()

  if (deleteLayers(session) || deleteDesigns(session)) {
    return
  }

  if (current.note) {
    store.updateNote(current.note, "Delete text", () => undefined)
    selection.set({})
  } else if (current.reference) {
    store.updateReference(current.reference, "Delete reference", () => undefined)
    selection.set({})
  }
}

async function copy(session: (ProjectDesigns & Pick<ProjectSession, "info">) | undefined): Promise<void> {
  if (session) {
    await copySelection(session)
  }
}

async function cut(session: (ProjectDesigns & Pick<ProjectSession, "info">) | undefined): Promise<void> {
  if (session && (await copySelection(session))) {
    deleteSelection(session)
  }
}

async function paste(
  session: (ProjectDesigns & Pick<ProjectSession, "components" | "editor" | "id" | "info">) | undefined
): Promise<void> {
  if (session) {
    await pasteClipboard(session)
  }
}

async function pasteOver(
  session: (ProjectDesigns & Pick<ProjectSession, "components" | "id">) | undefined
): Promise<void> {
  if (session) {
    await pasteOverSelection(session)
  }
}

async function pasteReplace(
  session: (ProjectDesigns & Pick<ProjectSession, "components" | "id">) | undefined
): Promise<void> {
  if (session) {
    await pasteToReplace(session)
  }
}

function copySelectionStyle(session: ProjectDesigns | undefined): void {
  if (session) {
    copyStyle(session)
  }
}

function pasteSelectionStyle(session: ProjectDesigns | undefined): void {
  if (session) {
    pasteStyle(session)
  }
}

function selectEverything(session: ProjectDesigns | undefined): void {
  if (session) {
    selectAll(session)
  }
}

/** Ctrl+Shift+A: what Select all would select, less what's selected. */
function selectInverse(session: ProjectDesigns | undefined): void {
  if (session) {
    session.selection.set(inverseSelection(session.store, session.selection.get()))
  }
}

/** Ctrl+Alt+A: every layer in the design like the selected ones, or every design of the same kind. */
function selectMatching(session: ProjectDesigns | undefined): void {
  const next = session && matchingSelection(session.store, session.selection.get())

  if (next) {
    session.selection.set(next)
  }
}

/**
 * N and Shift+N, as Figma's Zoom to next frame: select the next or previous design, in the Layers panel's order, and
 * zoom to it as Zoom to selection does.
 */
function selectAdjacentDesign(
  step: 1 | -1,
  session: (ProjectDesigns & Pick<ProjectSession, "editor">) | undefined
): void {
  if (!session) {
    return
  }

  const key = adjacentDesign(session.store.getEntries(), session.selection.get(), step)

  if (!key) {
    return
  }

  session.selection.set({ design: key })
  zoomToSelection(session)
}

/**
 * The arrows: nudge the selected layers, designs or note, by the arrow pressed, further with Shift. A layer stays in
 * view as it moves.
 */
function nudge(
  event: KeyboardEvent | undefined,
  session: (ProjectDesigns & Pick<ProjectSession, "editor" | "tokens">) | undefined
): void {
  const arrow = event && arrowOf(event.key)

  if (!session || !arrow) {
    return
  }

  const area = session.editor?.getContainer()
  const unit = spacingUnit(session.tokens.get())

  const blocked = nudgeSelection(
    {
      store: session.store,
      selection: session.selection,
      unit,
      drawn: area ? (design) => frameDrawn(area, design, session.selection.get(), unit) : undefined
    },
    arrow,
    event.shiftKey
  )

  if (blocked) {
    toast.info(`Its ${blocked.side} is the ${String(blocked.token)} token, so it doesn't nudge that way`, {
      id: "nudge-token"
    })
  }

  if (session.selection.get().node) {
    revealSelection(session)
  }
}

function wrapSelection(session: ProjectDesigns | undefined): void {
  if (session) {
    wrapLayers(session)
  }
}

function unwrapSelection(session: ProjectDesigns | undefined): void {
  if (session) {
    unwrapLayer(session)
  }
}

function alignSelection(
  alignment: Alignment,
  session: (ProjectDesigns & Pick<ProjectSession, "editor">) | undefined
): void {
  if (session) {
    align(session, alignment)
  }
}

function distributeSelection(
  axis: "horizontal" | "vertical",
  session: (ProjectDesigns & Pick<ProjectSession, "editor">) | undefined
): void {
  if (session) {
    distribute(session, axis)
  }
}

function renameSelection(session: Pick<ProjectSession, "selection"> | undefined): void {
  session?.selection.requestRename()
}

function zoomToSelection(session: Pick<ProjectSession, "editor" | "selection"> | undefined): void {
  const current = session?.selection.get()
  const key = current?.note ?? current?.reference ?? current?.design
  const bounds = key ? session?.editor?.getShapePageBounds(canvasIdFor(key)) : undefined

  if (bounds) {
    session?.editor?.zoomToBounds(bounds, { inset: 80, animation: { duration: 200 } })
  }
}

function zoomIn(session: Pick<ProjectSession, "editor"> | undefined): void {
  session?.editor?.zoomIn()
}

function zoomOut(session: Pick<ProjectSession, "editor"> | undefined): void {
  session?.editor?.zoomOut()
}

function zoomTo100(session: Pick<ProjectSession, "editor"> | undefined): void {
  session?.editor?.resetZoom()
}

function zoomToFit(session: Pick<ProjectSession, "editor"> | undefined): void {
  session?.editor?.zoomToFit({ animation: { duration: 200 } })
}

function toggleLayoutGrid(): void {
  setEffectivePreference({ key: "layoutGrid", value: !getEffectivePreferences().layoutGrid })
}

/** Opens a side panel on one of its tabs, as Figma's Alt+1 opens Layers and Alt+2 Assets. */
function showPanelTab(tab: "layers" | "components"): void {
  setLayout({ left: true, leftTab: tab })
}

/** Moves to the next or previous tab, with Home first, going round. */
function switchTab(step: 1 | -1): void {
  const ids = [homeTab, ...workspace.getTabs().map((tab) => tab.id)]
  const index = workspace.isHomeActive() ? 0 : ids.indexOf(workspace.getActiveId()!)
  const next = ids[(index + step + ids.length) % ids.length]

  if (ids.length > 1) {
    workspace.activate(next)
  }
}

function toggleDeveloperTools(): void {
  void window.canvasHost.toggleDevTools()
}

/**
 * Escape: stops editing text, then puts a review tool down, back on the tool before it, then goes back to the select
 * tool, then selects the parent, then nothing, one step a press.
 */
function stepBack(session: ProjectDesigns | undefined): void {
  if (!session) {
    return
  }

  const { selection } = session

  if (selection.getEditing()) {
    selection.setEditing(undefined)
  } else if (selection.getReview().picked) {
    selection.stopReviewing()
  } else if (selection.getTool() !== "select") {
    selection.setTool("select")
  } else if (selection.get().node) {
    selectParent(session)
  } else {
    selection.set({})
  }
}

/** The layer the selected one sits in, or the design when it's at the top. */
function selectParent(session: ProjectDesigns | undefined): void {
  if (!session) {
    return
  }

  const { store, selection } = session
  const current = selection.get()
  const entry = current.design ? store.getEntry(current.design) : undefined

  if (!entry || !current.node) {
    return
  }

  const parent = parentLayer(store, entry.container, current.node)
  selection.set(
    !parent || parent === entry.container.root.id
      ? { design: entry.key }
      : { design: entry.key, node: parent, mode: current.mode, state: current.state }
  )
}

/**
 * Enter, as in Figma: starts editing the selected text layer, or selects every layer inside the selected layers, or
 * inside the selected design (see `enterTarget`).
 */
function selectChildren(session: ProjectDesigns | undefined): void {
  if (!session) {
    return
  }

  const target = enterTarget(session.store, session.selection.get())

  if (!target) {
    return
  }

  if ("edit" in target) {
    session.selection.setEditing(target.edit)
  } else {
    session.selection.set(target.select)
  }
}

/** The next layer beside the selected one, or the one before it with a step of -1. */
function selectSibling(step: 1 | -1, session: ProjectDesigns | undefined): void {
  if (!session) {
    return
  }

  const { store, selection } = session
  const current = selection.get()
  const entry = current.design ? store.getEntry(current.design) : undefined

  if (!entry || !current.node) {
    return
  }

  const sibling = siblingLayer(store, entry.container, current.node, step)

  if (sibling) {
    selection.set({ design: entry.key, node: sibling, mode: current.mode, state: current.state })
  }
}

function orderSelection(order: Order, session: ProjectDesigns | undefined): void {
  if (session) {
    orderLayer(session, order)
  }
}

function hideSelection(session: ProjectDesigns | undefined): void {
  if (session) {
    toggleHiddenLayers(session)
  }
}

function lockSelection(session: ProjectDesigns | undefined): void {
  if (session) {
    toggleLockedSelection(session)
  }
}

/** Turns the selected design into a component, or a component back into a screen. */
function toggleComponent(session: ProjectDesigns | undefined): void {
  const entry = selectedDesign(session)

  if (session && entry) {
    setDesignKind(session, entry, entry.container.kind === "component" ? "screen" : "component")
  }
}

/** The one layer selected, when it's one of its design's own layers, not the root or a layer inside an instance. */
function selectedOwnLayer(session: ProjectDesigns | undefined) {
  const current = session?.selection.get()
  const entry = current?.design ? session?.store.getEntry(current.design) : undefined

  const node =
    entry && current?.node && !current.nodes?.length ? findNode(entry.container.root, current.node) : undefined

  return entry && node && node.id !== entry.container.root.id ? { entry, node } : undefined
}

/**
 * Ctrl+Alt+K, as in Figma: a design selected on its own becomes a component, or a screen again; a selected layer is
 * extracted into a new component design named after it, as the inspector's Make component does.
 */
function makeComponent(session: (ProjectDesigns & Pick<ProjectSession, "editor" | "info">) | undefined): void {
  if (!session) {
    return
  }

  if (selectedDesign(session)) {
    toggleComponent(session)

    return
  }

  const layer = selectedOwnLayer(session)

  if (!layer) {
    return
  }

  try {
    const name = layerLabel(
      layer.node,
      session.store.getEntries(),
      session.store.getComponentLibrary(),
      session.info.libraries
    )

    session.selection.set({ design: extractIntoComponent(session, layer.entry, [layer.node.id], name) })
    revealSelection(session)
  } catch (error) {
    toast.info(errorMessage(error))
  }
}

/** The selected layer, when it's one instance of a component. */
function selectedInstance(session: ProjectDesigns | undefined) {
  const current = session?.selection.get()
  const entry = current?.design ? session?.store.getEntry(current.design) : undefined

  const node =
    entry && current?.node && !current.nodes?.length ? findNode(entry.container.root, current.node) : undefined

  return entry && node?.type === "instance" ? { entry, node } : undefined
}

/** Turns the selected instance into plain layers, unlinked from its component. */
function detachSelection(session: ProjectDesigns | undefined): void {
  const instance = selectedInstance(session)

  if (!session || !instance) {
    return
  }

  detachAndRecord(session.store, instance.entry.key, instance.node.id)
}

/** Selects the component the selected instance is a copy of, and shows it. */
function goToMainComponent(session: (ProjectDesigns & Pick<ProjectSession, "editor">) | undefined): void {
  const instance = selectedInstance(session)

  if (!session || !instance) {
    return
  }

  const main = session.store.getEntries().find((entry) => entry.container.id === instance.node.design)

  if (!main) {
    return
  }

  session.selection.set({ design: main.key })
  revealSelection(session)
}

function parentOf(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, "")
  const cut = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"))

  return cut > 0 ? trimmed.slice(0, cut) : trimmed
}

function join(folder: string, name: string): string {
  return `${folder}${folder.includes("\\") ? "\\" : "/"}${name}`
}

/** Makes an empty screen or component in the tab, right of everything (see `createDesign`). */
const newDesign =
  (kind: ContainerKind) =>
  (session: (ProjectDesigns & Pick<ProjectSession, "editor">) | undefined): void => {
    if (session) {
      createDesign(session, kind)
    }
  }

const tool = (name: Tool): Action => ({ run: (session) => session?.selection.setTool(name) })

/** Picks the review tool a key picks (PAR-795): Comment, or annotating in the kind picked last. */
const review = (key: "comment" | "annotate"): Action => ({
  run: (session) => session?.selection.startReviewing(reviewToolFor(session.selection.getReview(), key))
})

const definitions: Record<Command, Action> = {
  select: tool("select"),
  hand: tool("hand"),
  frame: tool("frame"),
  text: tool("text"),
  interact: tool("interact"),
  comment: review("comment"),
  annotate: review("annotate"),
  findReferences: {
    run: (session) => {
      if (session) {
        findReferences(session)
      }
    }
  },

  selectAll: { run: selectEverything },
  selectInverse: { run: selectInverse },
  selectMatching: { run: selectMatching },
  nextDesign: { run: (session) => selectAdjacentDesign(1, session) },
  previousDesign: { run: (session) => selectAdjacentDesign(-1, session) },
  selectChildren: { run: selectChildren },
  selectParent: { run: selectParent },
  selectNext: { run: (session) => selectSibling(1, session) },
  selectPrevious: { run: (session) => selectSibling(-1, session) },
  back: { run: stepBack },

  undo: { run: undo },
  redo: { run: redo },
  repeat: { run: () => repeatLastAction() },
  cut: { run: cut },
  copy: { run: copy },
  paste: { run: paste },
  pasteOver: { run: pasteOver },
  pasteReplace: { run: pasteReplace },
  duplicate: { run: duplicateSelection },
  delete: { run: deleteSelection },
  copyAsPng: { run: copySelectedAsPng },
  copyStyle: { run: copySelectionStyle },
  pasteStyle: { run: pasteSelectionStyle },
  rename: { run: renameSelection },

  newScreen: { run: newDesign("screen") },
  newComponent: { run: newDesign("component") },
  insert: { run: () => openQuickInsert() },
  wrap: { run: wrapSelection },
  unwrap: { run: unwrapSelection },
  makeComponent: { run: makeComponent },
  goToMain: { run: goToMainComponent },
  detach: { run: detachSelection },
  bringForward: { run: (session) => orderSelection("forward", session) },
  sendBackward: { run: (session) => orderSelection("backward", session) },
  bringToFront: { run: (session) => orderSelection("front", session) },
  sendToBack: { run: (session) => orderSelection("back", session) },
  hide: { run: hideSelection },
  lock: { run: lockSelection },

  alignLeft: { run: (session) => alignSelection("left", session) },
  alignCenter: { run: (session) => alignSelection("center", session) },
  alignRight: { run: (session) => alignSelection("right", session) },
  alignTop: { run: (session) => alignSelection("top", session) },
  alignMiddle: { run: (session) => alignSelection("middle", session) },
  alignBottom: { run: (session) => alignSelection("bottom", session) },
  distributeHorizontal: { run: (session) => distributeSelection("horizontal", session) },
  distributeVertical: { run: (session) => distributeSelection("vertical", session) },
  nudge: { run: (session, event) => nudge(event, session), byKey: true },
  bigNudge: { run: (session, event) => nudge(event, session), byKey: true },

  zoomIn: { run: zoomIn },
  zoomOut: { run: zoomOut },
  zoomTo100: { run: zoomTo100 },
  zoomToFit: { run: zoomToFit },
  zoomToSelection: { run: zoomToSelection },
  panels: { run: () => togglePanels(), scope: "app" },
  console: { run: () => toggleConsole(), scope: "app" },
  // Not in text fields, where Alt and a digit can type a character.
  showLayers: { run: () => showPanelTab("layers") },
  showComponents: { run: () => showPanelTab("components") },
  layoutGrid: { run: () => toggleLayoutGrid() },
  home: { run: () => goHome(), scope: "app" },
  nextTab: { run: () => switchTab(1), scope: "app" },
  previousTab: { run: () => switchTab(-1), scope: "app" },

  newTab: { run: () => openNewTab(), scope: "app" },
  openFolder: { run: () => openProjectFolder(), scope: "app" },
  openFile: { run: () => openProjectFile(), scope: "app" },
  save: { run: save, scope: "app" },
  saveCopy: { run: saveCopy, scope: "app" },
  exportSelection: { run: exportSelected, scope: "app" },
  closeTab: { run: () => closeTab(), scope: "app" },
  settings: { run: () => openDialog("settings"), scope: "app" },

  actions: { run: () => openDialog("actions"), scope: "app" },
  shortcuts: { run: () => openDialog("shortcuts"), scope: "app" },
  developerTools: { run: () => toggleDeveloperTools(), scope: "app" }
}

/**
 * What Repeat last action runs again (PAR-180): what changes the selected layers or designs, or adds one. Undo, the
 * clipboard's copying, renaming, selecting, nudging and moving around aren't, as repeating them does nothing new.
 */
const repeatable: readonly Command[] = [
  "paste",
  "pasteOver",
  "pasteReplace",
  "duplicate",
  "delete",
  "pasteStyle",
  "newScreen",
  "newComponent",
  "wrap",
  "unwrap",
  "makeComponent",
  "detach",
  "bringForward",
  "sendBackward",
  "bringToFront",
  "sendToBack",
  "hide",
  "alignLeft",
  "alignCenter",
  "alignRight",
  "alignTop",
  "alignMiddle",
  "alignBottom",
  "distributeHorizontal",
  "distributeVertical"
]

/**
 * Remembers a repeatable command as it runs, however it's run, even in a place of its own as New screen where the canvas
 * was right-clicked, so Repeat follows the last change. Repeating runs it on the active tab, when it applies there.
 */
function rememberCommand(command: Command): void {
  if (!repeatable.includes(command)) {
    return
  }

  rememberAction({
    label: keymap[command].label,
    run: () => definitions[command].run(activeSession()),
    available: () => commandStates(contextOf(activeSession(), false))[command].enabled
  })
}

/** Each action in the keymap, recorded however it's run: a key, a menu, Search actions, the toolbar or a panel. */
export const actions: Record<Command, RecordedAction> = recordActions(definitions, {
  session: activeSession,
  enabled: (command, session) => commandsFor(session)[command].enabled,
  selected: (session) => {
    const selection = session?.selection.get()
    const layers = selection ? selectedNodes(selection).length : 0

    return { layers, designs: selection && layers === 0 ? selectedDesigns(selection).length : 0 }
  },
  ran: rememberCommand
})
