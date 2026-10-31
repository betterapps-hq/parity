import type { DesignNode } from "@parity-app/core"
import {
  designOfImages,
  dropLabel,
  fileBaseName,
  type HereLayout,
  pasteHere,
  type Slot,
  skippedMessage,
  slotHere,
  sortDrop
} from "@parity-app/editor"
import { toast } from "sonner"
import { editingState } from "../chrome/LayerPanel.tsx"
import { layersSelection } from "../selection.ts"
import { spacingUnit } from "../tokens-store.ts"
import type { ProjectSession } from "../workspace.ts"
import { importImage } from "./clipboard.ts"
import { type Hit, hitTest, type Point } from "./hit.ts"
import { measureHere } from "./paste-here.ts"
import { frameViewport } from "./view.ts"

/**
 * Image files dragged onto the canvas from Explorer or Finder (PAR-24). Over a layout inside a design they go into the
 * slot under the pointer, as a dragged layer lands, or at the pointer in an absolutely placed layout, as Paste here puts
 * layers; on the empty canvas they make a new screen there, as a paste with nothing to paste into does. Each file is
 * saved under `public/images/` through `images.import` at once, as a paste saves it, and placing them is one undo step,
 * which leaves the files, as undoing a paste does. Which files are taken, and what's said about the rest, are
 * `@parity-app/editor`'s rules.
 */

/** Where files dropped at a point land. */
export type FileDrop =
  | {
      kind: "layout"
      hit: Hit
      here: HereLayout
      /** The line that marks the slot on screen; none in an absolutely placed layout, where they go at the pointer. */
      line?: Slot["line"]
    }
  /** On the empty canvas, at this point on the page. */
  | { kind: "canvas"; at: Point }
  /** Over a design, where there's no layout to drop into. */
  | { kind: "none" }

/**
 * Where files dropped at a point (client coordinates) would land: the deepest of the design's own layouts under it, in
 * the frame there; the empty canvas; or nothing, over a design's frame with no layout under the pointer or over its
 * board around the frames.
 */
export function fileDropAt(session: ProjectSession, area: ParentNode, point: Point): FileDrop {
  const { store, editor } = session
  const hit = hitTest(area, store, point, editor)
  if (hit) {
    const here = measureHere(hit, point, spacingUnit(session.tokens.get()))
    const state = editingState(hit.entry.container, hit.state)
    const slot = here && slotHere(hit.entry.container, here, state, frameViewport(store.getModes(), hit.mode))
    return here && slot ? { kind: "layout", hit, here, line: slot.line } : { kind: "none" }
  }
  if (!editor) return { kind: "none" }
  const page = editor.screenToPage(point)
  const board = editor.getShapeAtPoint(page, {
    hitInside: true,
    filter: (shape) => shape.type === "canvas-container"
  })
  return board ? { kind: "none" } : { kind: "canvas", at: { x: Math.round(page.x), y: Math.round(page.y) } }
}

/**
 * Adds the image files dropped `target`, measured when they were dropped: each saved into the project, then all placed
 * as one undo step and selected. Files that aren't images Parity takes, or are too large, are skipped with a message
 * naming them, and so are any that fail to save.
 */
export async function dropFiles(session: ProjectSession, target: FileDrop, files: readonly File[]): Promise<void> {
  const { store, selection } = session
  const { images, skipped } = sortDrop(files)
  const message = skippedMessage(skipped)
  if (message) toast.warning(message.title, { description: message.description })
  if (images.length === 0) return
  if (target.kind === "none") {
    toast.info("There's no layout here to drop into")
    return
  }
  const progress = toast.loading(images.length === 1 ? "Adding the image…" : `Adding ${images.length} images…`)
  const added: { node: DesignNode; name: string }[] = []
  const failed: { name: string; error: unknown }[] = []
  // One at a time, in the order dropped: each is read whole before it's sent, so a folder of large photos isn't all in
  // memory at once, and the same image dropped twice reuses the file the first one saved.
  for (const { index, type } of images) {
    const file = files[index]!
    try {
      added.push({ node: await importImage(session, file, fileBaseName(file.name), type), name: file.name })
    } catch (error) {
      failed.push({ name: file.name, error })
    }
  }
  if (failed.length > 0) {
    const reason = (error: unknown) => (error instanceof Error ? error.message : String(error))
    toast.error(failed.length === 1 ? `Couldn't add ${failed[0]!.name}` : `Couldn't add ${failed.length} images`, {
      id: progress,
      description:
        failed.length === 1
          ? reason(failed[0]!.error)
          : failed.map((file) => `${file.name}: ${reason(file.error)}`).join("\n")
    })
  } else toast.dismiss(progress)
  if (added.length === 0) return
  const nodes = added.map((image) => image.node)
  const label = dropLabel(nodes.length)
  if (target.kind === "canvas") {
    const design = designOfImages(
      nodes,
      added.map((image) => image.name),
      store.getEntries().map((entry) => entry.container.id),
      target.at
    )
    selection.set({ design: store.addContainer(store.mainPath, design, label) })
    return
  }
  const { hit, here } = target
  const viewport = frameViewport(store.getModes(), hit.mode)
  let copies: string[] = []
  store.updateContainer(hit.entry.key, label, (container) => {
    const placed = pasteHere(container, nodes, here, editingState(container, hit.state), viewport)
    copies = placed.copies
    return placed.container
  })
  // The layout went while the files were saved, by an undo or an agent.
  if (copies.length === 0) {
    toast.info("The layout they were dropped on is gone, so the images weren't placed")
    return
  }
  selection.set(layersSelection(hit.entry.key, copies, hit))
}

/** Whether a drag carries files from outside the app, such as from Explorer or Finder. */
export function carriesFiles(event: DragEvent): boolean {
  return event.dataTransfer?.types.includes("Files") ?? false
}

/**
 * The media types of the files a drag carries, as far as the browser tells them before the drop: empty for a file
 * whose type it doesn't know.
 */
export function draggedTypes(event: DragEvent): string[] {
  return [...(event.dataTransfer?.items ?? [])].flatMap((item) => (item.kind === "file" ? [item.type] : []))
}

/** Whether a drag is over a file field, which takes a dropped file by itself, as one in a design in Interact does. */
export function overFileField(event: DragEvent): boolean {
  const at = event.composedPath()[0]
  return at instanceof HTMLInputElement && at.type === "file"
}

/**
 * Keeps a file dropped where the app doesn't take it from opening in the window in Parity's place, which is what
 * Electron does with a drop nothing cancels. Over such places the pointer shows that it can't be dropped.
 */
export function keepFilesFromOpening(target: Window): () => void {
  const ours = (event: DragEvent) => carriesFiles(event) && !overFileField(event)
  const onDragOver = (event: DragEvent) => {
    if (event.defaultPrevented || !ours(event)) return
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = "none"
  }
  const onDrop = (event: DragEvent) => {
    if (ours(event)) event.preventDefault()
  }
  target.addEventListener("dragover", onDragOver)
  target.addEventListener("drop", onDrop)
  return () => {
    target.removeEventListener("dragover", onDragOver)
    target.removeEventListener("drop", onDrop)
  }
}
