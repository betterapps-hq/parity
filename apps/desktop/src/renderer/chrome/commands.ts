import { detachInstance, findNode } from "@parity-app/core"
import type { Alignment, Order } from "@parity-app/editor"
import { toast } from "sonner"
import { shapeIdFor } from "../canvas/CanvasEditor.tsx"
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
import { parentLayer, projectLibrary, siblingLayer } from "../canvas/layers.ts"
import { arrowOf, frameDrawn, nudgeSelection } from "../canvas/nudge.ts"
import { enterTarget } from "../canvas/pick.ts"
import { adjacentDesign, inverseSelection, matchingSelection } from "../canvas/select.ts"
import { selectedDesigns } from "../selection.ts"
import { spacingUnit } from "../tokens-store.ts"
import { type ProjectSession, saveFailureToast, workspace } from "../workspace.ts"
import {
  align,
  deleteDesigns,
  deleteLayers,
  distribute,
  duplicateLayers,
  orderLayer,
  selectAll,
  toggleHiddenLayers,
  unwrapLayer,
  wrapLayers
} from "./arrange.ts"
import { extractIntoComponent } from "./components.ts"
import { duplicateDesign, setDesignKind } from "./designs.ts"
import { setLayout } from "./layout.ts"
import { getPreferences, setPreferences } from "./preferences.ts"
import { revealSelection } from "./reveal.ts"

/** What the menus and their shortcuts do. Each acts on the active tab unless it says otherwise. */

export function activeSession(): ProjectSession | undefined {
  return workspace.getActive()?.session
}

export async function openProjectFolder(): Promise<void> {
  const root = await window.canvasHost.pickFolder()
  if (root) await workspace.open(root)
}

/** Opens the project a `.par` file belongs to. */
export async function openProjectFile(): Promise<void> {
  const file = await window.canvasHost.pickProjectFile()
  if (file) await workspace.open(file)
}

/** Writes every file with unsaved changes and says which ones it wrote. */
export async function save(session = activeSession()): Promise<void> {
  if (!session) return
  try {
    const paths = session.store.unsavedPaths()
    await session.store.flush()
    toast.success("Saved", { description: paths.join(", ") || session.store.mainPath, duration: 2000 })
  } catch (error) {
    toast.error("Couldn't save", { id: saveFailureToast(session.id), description: message(error) })
  }
}

/**
 * Writes every design, note and the modes into one `.par` file wherever the person picks, as a snapshot to share or
 * keep. The project keeps working from its own files. It suggests a place outside the project, since a `.par` inside
 * it would show up as more designs.
 */
export async function saveCopy(session = activeSession()): Promise<void> {
  if (!session) return
  const { root, name } = session.info
  const path = await window.canvasHost.saveFile({
    title: "Save a copy",
    defaultPath: join(parentOf(root), `${name} copy.par`),
    filters: [{ name: "Parity project", extensions: ["par"] }]
  })
  if (!path) return
  try {
    await session.store.flush()
    await window.canvasHost.request("document.saveCopy", { path, document: session.store.merged() })
    toast.success("Saved a copy", {
      description: path,
      action: { label: "Show", onClick: () => void window.canvasHost.showItem(path) }
    })
  } catch (error) {
    toast.error("Couldn't save the copy", { description: message(error) })
  }
}

/** Renders the selected design, or every design, to PNGs in a folder the person picks. */
export async function exportImages(scope: "selection" | "all", session = activeSession()): Promise<void> {
  if (!session) return
  const { store, selection } = session
  const selected = selection.get().design
  let designs: string[] = selected ? [selected] : []
  if (scope === "all") designs = store.getEntries().map((entry) => entry.key)
  if (designs.length === 0) {
    toast.info(scope === "all" ? "There are no designs to export" : "Select a design to export it")
    return
  }
  const folder = await window.canvasHost.pickFolder("Export images to")
  if (!folder) return
  const scale = getPreferences().exportScale
  const progress = toast.loading(
    designs.length === 1 ? "Exporting the design…" : `Exporting ${designs.length} designs…`
  )
  try {
    // Designs export as they are on the canvas, saved or not, and exporting doesn't save them.
    const { files, warnings } = await window.canvasHost.request("designs.export", {
      projectId: session.id,
      folder,
      designs,
      scale
    })
    toast.success(files.length === 1 ? "Exported 1 image" : `Exported ${files.length} images`, {
      id: progress,
      description: folder,
      action: files[0] ? { label: "Show", onClick: () => void window.canvasHost.showItem(files[0]!) } : undefined
    })
    if (warnings.length > 0)
      toast.warning("Some frames had problems", {
        description: warnings.join("\n"),
        // One warning to a line.
        classNames: { description: "whitespace-pre-line" }
      })
  } catch (error) {
    toast.error("Couldn't export", { id: progress, description: message(error) })
  }
}

/** Closes the active tab once its last edits are saved. */
export function closeTab(id = workspace.getActiveId()): void {
  if (id) void workspace.close(id)
}

export function exit(): void {
  void window.canvasHost.quit()
}

export function undo(session = activeSession()): void {
  session?.store.undo()
}

export function redo(session = activeSession()): void {
  session?.store.redo()
}

/** Duplicates the selected layers, or the selected designs. */
export function duplicateSelection(session = activeSession()): void {
  if (!session) return
  if (duplicateLayers(session)) return
  const designs = selectedDesigns(session.selection.get())
  const entry = designs.length === 1 ? session.store.getEntry(designs[0]!) : undefined
  if (entry) duplicateDesign(session, entry)
  else duplicateDesigns(session)
}

/** Deletes the selected layers, designs or text note. */
export function deleteSelection(session = activeSession()): void {
  if (!session) return
  const { store, selection } = session
  const current = selection.get()
  if (deleteLayers(session) || deleteDesigns(session)) return
  if (current.note) {
    store.updateNote(current.note, "Delete text", () => undefined)
    selection.set({})
  }
}

export async function copy(session = activeSession()): Promise<void> {
  if (session) await copySelection(session)
}

export async function cut(session = activeSession()): Promise<void> {
  if (session && (await copySelection(session))) deleteSelection(session)
}

export async function paste(session = activeSession()): Promise<void> {
  if (session) await pasteClipboard(session)
}

export async function pasteOver(session = activeSession()): Promise<void> {
  if (session) await pasteOverSelection(session)
}

export async function pasteReplace(session = activeSession()): Promise<void> {
  if (session) await pasteToReplace(session)
}

export function copySelectionStyle(session = activeSession()): void {
  if (session) copyStyle(session)
}

export function pasteSelectionStyle(session = activeSession()): void {
  if (session) pasteStyle(session)
}

export function selectEverything(session = activeSession()): void {
  if (session) selectAll(session)
}

/** Ctrl+Shift+A: what Select all would select, less what's selected. */
export function selectInverse(session = activeSession()): void {
  if (session) session.selection.set(inverseSelection(session.store, session.selection.get()))
}

/** Ctrl+Alt+A: every layer in the design like the selected ones, or every design of the same kind. */
export function selectMatching(session = activeSession()): void {
  const next = session && matchingSelection(session.store, session.selection.get())
  if (next) session.selection.set(next)
}

/**
 * N and Shift+N, as Figma's Zoom to next frame: select the next or previous design, in the Layers panel's order, and
 * zoom to it as Zoom to selection does.
 */
export function selectAdjacentDesign(step: 1 | -1, session = activeSession()): void {
  if (!session) return
  const key = adjacentDesign(session.store.getEntries(), session.selection.get(), step)
  if (!key) return
  session.selection.set({ design: key })
  zoomToSelection(session)
}

/**
 * The arrows: nudge the selected layers, designs or note, by the arrow pressed, further with Shift. A layer stays in
 * view as it moves.
 */
export function nudge(event: KeyboardEvent | undefined, session = activeSession()): void {
  const arrow = event && arrowOf(event.key)
  if (!session || !arrow) return
  const area = session.editor?.getContainer()
  const unit = spacingUnit(session.tokens.get())
  const blocked = nudgeSelection(
    {
      store: session.store,
      selection: session.selection,
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
  if (session.selection.get().node) revealSelection(session)
}

export function wrapSelection(session = activeSession()): void {
  if (session) wrapLayers(session)
}

export function unwrapSelection(session = activeSession()): void {
  if (session) unwrapLayer(session)
}

export function alignSelection(alignment: Alignment, session = activeSession()): void {
  if (session) align(session, alignment)
}

export function distributeSelection(axis: "horizontal" | "vertical", session = activeSession()): void {
  if (session) distribute(session, axis)
}

export function renameSelection(session = activeSession()): void {
  session?.selection.requestRename()
}

export function zoomToSelection(session = activeSession()): void {
  const current = session?.selection.get()
  const key = current?.note ?? current?.design
  const bounds = key ? session?.editor?.getShapePageBounds(shapeIdFor(key)) : undefined
  if (bounds) session?.editor?.zoomToBounds(bounds, { inset: 80, animation: { duration: 200 } })
}

export function zoomIn(session = activeSession()): void {
  session?.editor?.zoomIn()
}

export function zoomOut(session = activeSession()): void {
  session?.editor?.zoomOut()
}

export function zoomTo100(session = activeSession()): void {
  session?.editor?.resetZoom()
}

export function zoomToFit(session = activeSession()): void {
  session?.editor?.zoomToFit({ animation: { duration: 200 } })
}

export function toggleLayoutGrid(): void {
  setPreferences({ layoutGrid: !getPreferences().layoutGrid })
}

/** Opens a side panel on one of its tabs, as Figma's Alt+1 opens Layers and Alt+2 Assets. */
export function showPanelTab(tab: "layers" | "components"): void {
  setLayout({ left: true, leftTab: tab })
}

/** The tab after the active one, or before it with a step of -1, going round. */
export function switchTab(step: 1 | -1): void {
  const tabs = workspace.getTabs()
  const index = tabs.findIndex((tab) => tab.id === workspace.getActiveId())
  const next = tabs[(index + step + tabs.length) % tabs.length]
  if (next && tabs.length > 1) workspace.activate(next.id)
}

export function toggleDeveloperTools(): void {
  void window.canvasHost.toggleDevTools()
}

/**
 * Escape: stops editing text, then goes back to the select tool, then selects the parent, then nothing, one step a
 * press.
 */
export function stepBack(session = activeSession()): void {
  if (!session) return
  const { selection } = session
  if (selection.getEditing()) selection.setEditing(undefined)
  else if (selection.getTool() !== "select") selection.setTool("select")
  else if (selection.get().node) selectParent(session)
  else selection.set({})
}

/** The layer the selected one sits in, or the design when it's at the top. */
export function selectParent(session = activeSession()): void {
  if (!session) return
  const { store, selection } = session
  const current = selection.get()
  const entry = current.design ? store.getEntry(current.design) : undefined
  if (!entry || !current.node) return
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
export function selectChildren(session = activeSession()): void {
  if (!session) return
  const target = enterTarget(session.store, session.selection.get())
  if (!target) return
  if ("edit" in target) session.selection.setEditing(target.edit)
  else session.selection.set(target.select)
}

/** The next layer beside the selected one, or the one before it with a step of -1. */
export function selectSibling(step: 1 | -1, session = activeSession()): void {
  if (!session) return
  const { store, selection } = session
  const current = selection.get()
  const entry = current.design ? store.getEntry(current.design) : undefined
  if (!entry || !current.node) return
  const sibling = siblingLayer(store, entry.container, current.node, step)
  if (sibling) selection.set({ design: entry.key, node: sibling, mode: current.mode, state: current.state })
}

export function orderSelection(order: Order, session = activeSession()): void {
  if (session) orderLayer(session, order)
}

export function hideSelection(session = activeSession()): void {
  if (session) toggleHiddenLayers(session)
}

/** The selected design, when it's selected on its own rather than one of its layers. */
export function selectedDesign(session = activeSession()) {
  const current = session?.selection.get()
  return current?.design && !current.node && !current.designs?.length
    ? session?.store.getEntry(current.design)
    : undefined
}

/** Turns the selected design into a component, or a component back into a screen. */
export function toggleComponent(session = activeSession()): void {
  const entry = selectedDesign(session)
  if (session && entry) setDesignKind(session, entry, entry.container.kind === "component" ? "screen" : "component")
}

/** The one layer selected, when it's one of its design's own layers, not the root or a layer inside an instance. */
export function selectedOwnLayer(session = activeSession()) {
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
export function makeComponent(session = activeSession()): void {
  if (!session) return
  if (selectedDesign(session)) {
    toggleComponent(session)
    return
  }
  const layer = selectedOwnLayer(session)
  if (!layer) return
  try {
    const name = layerLabel(layer.node, session.store.getEntries(), session.store.getComponentLibrary())
    session.selection.set({ design: extractIntoComponent(session, layer.entry, [layer.node.id], name) })
    revealSelection(session)
  } catch (error) {
    toast.info(message(error))
  }
}

/** The selected layer, when it's one instance of a component. */
export function selectedInstance(session = activeSession()) {
  const current = session?.selection.get()
  const entry = current?.design ? session?.store.getEntry(current.design) : undefined
  const node =
    entry && current?.node && !current.nodes?.length ? findNode(entry.container.root, current.node) : undefined
  return entry && node?.type === "instance" ? { entry, node } : undefined
}

/** Turns the selected instance into plain layers, unlinked from its component. */
export function detachSelection(session = activeSession()): void {
  const instance = selectedInstance(session)
  if (!session || !instance) return
  const library = projectLibrary(session.store)
  session.store.updateContainer(instance.entry.key, "Detach instance", (container) =>
    detachInstance(container, instance.node.id, library)
  )
}

/** Selects the component the selected instance is a copy of, and shows it. */
export function goToMainComponent(session = activeSession()): void {
  const instance = selectedInstance(session)
  if (!session || !instance) return
  const main = session.store.getEntries().find((entry) => entry.container.id === instance.node.design)
  if (!main) return
  session.selection.set({ design: main.key })
  revealSelection(session)
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function parentOf(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, "")
  const cut = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"))
  return cut > 0 ? trimmed.slice(0, cut) : trimmed
}

function join(folder: string, name: string): string {
  return `${folder}${folder.includes("\\") ? "\\" : "/"}${name}`
}
