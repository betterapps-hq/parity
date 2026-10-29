import { toast } from "sonner"
import { shapeIdFor } from "../canvas/CanvasEditor.tsx"
import { copySelection, copyStyle, duplicateDesigns, pasteClipboard, pasteStyle } from "../canvas/clipboard.ts"
import { selectedDesigns } from "../selection.ts"
import { type ProjectSession, saveFailureToast, workspace } from "../workspace.ts"
import {
  type Alignment,
  align,
  deleteDesigns,
  deleteLayers,
  distribute,
  duplicateLayers,
  selectAll,
  unwrapLayer,
  wrapLayers
} from "./arrange.ts"
import { duplicateDesign } from "./designs.ts"
import { getPreferences } from "./preferences.ts"

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
  const designs = scope === "all" ? store.getEntries().map((entry) => entry.key) : selected ? [selected] : []
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
  if (id) workspace.close(id)
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

export function copySelectionStyle(session = activeSession()): void {
  if (session) copyStyle(session)
}

export function pasteSelectionStyle(session = activeSession()): void {
  if (session) pasteStyle(session)
}

export function selectEverything(session = activeSession()): void {
  if (session) selectAll(session)
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
