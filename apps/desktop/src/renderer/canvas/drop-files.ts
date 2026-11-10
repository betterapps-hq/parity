import type { DesignNode } from "@parity-app/core"
import {
  designOfImages,
  type DroppedImage,
  dropLabel,
  fileBaseName,
  type HereLayout,
  layersSelection,
  pasteHere,
  type Point,
  type Slot,
  skippedMessage,
  sortDrop
} from "@parity-app/editor"
import { toast } from "sonner"
import type { Attributes } from "../chrome/event-attributes.ts"
import { reportError, track } from "../report-error.ts"
import type { ProjectSession } from "../workspace.ts"
import { importImage } from "./clipboard.ts"
import { type Hit, pickedIn } from "./hit.ts"
import { emptyCanvasAt } from "./new-screen.ts"
import { placeAtPoint } from "./paste-here.ts"

/**
 * Image files dragged onto the canvas from Explorer or Finder (PAR-24). Over a layout inside a design they go into the
 * slot under the pointer, as a dragged layer lands, or at the pointer in an absolutely placed layout, as Paste here puts
 * layers; on the empty canvas they make a new frame there, as a paste with nothing to paste into does. Each file is
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
  const place = placeAtPoint(session, area, point)

  if (place.kind === "layout") {
    return { kind: "layout", hit: place.hit, here: place.here, line: place.slot.line }
  }

  if (place.kind === "none") {
    return { kind: "none" }
  }

  const at = emptyCanvasAt(session, area, point)

  return at ? { kind: "canvas", at } : { kind: "none" }
}

/** An image file saved into the project: the layer that shows it, and the file's name as it came. */
export interface SavedImage {
  node: DesignNode
  name: string
}

/**
 * The image files among `files` that Parity takes, in the order they came. The rest, which aren't images or are too
 * large, are named in a message with why.
 */
function takenFrom(files: readonly File[]): DroppedImage[] {
  const { images, skipped } = sortDrop(files)
  const message = skippedMessage(skipped)

  if (message) {
    toast.warning(message.title, { description: message.description })
  }

  return images
}

/**
 * Saves image files into the project, saying so while it does. One at a time, in the order given: each is read whole
 * before it's sent, so a folder of large photos isn't all in memory at once, and the same image given twice reuses the
 * file the first one saved. Any that fail to save are named in a message, and the rest are returned.
 */
async function saveImages(
  session: ProjectSession,
  files: readonly File[],
  images: readonly DroppedImage[]
): Promise<SavedImage[]> {
  const progress = toast.loading(images.length === 1 ? "Adding the image…" : `Adding ${images.length} images…`)
  const added: SavedImage[] = []
  const failed: { name: string; error: unknown }[] = []

  for (const { index, type } of images) {
    const file = files[index]!

    try {
      added.push({ node: await importImage(session, file, fileBaseName(file.name), type), name: file.name })
    } catch (error) {
      failed.push({ name: file.name, error })
    }
  }

  if (failed.length > 0) {
    const reason = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause))
    reportError(failed[0]!.error, {
      operation: "images.import",
      title: failed.length === 1 ? `Couldn't add ${failed[0]!.name}` : `Couldn't add ${failed.length} images`,
      context: { images: failed.length },
      id: progress,
      description:
        failed.length === 1
          ? reason(failed[0]!.error)
          : failed.map((file) => `${file.name}: ${reason(file.error)}`).join("\n")
    })
  } else {
    toast.dismiss(progress)
  }

  return added
}

/**
 * Adds image files to the project without placing them, as dropping them on the Media tab does (PAR-838): each is
 * saved under `public/images/`, and what was saved comes back. Files that aren't taken, or fail to save, are named.
 */
export async function addImageFiles(session: ProjectSession, files: readonly File[]): Promise<SavedImage[]> {
  const images = takenFrom(files)

  return images.length === 0 ? [] : saveImages(session, files, images)
}

/**
 * Adds the image files dropped `target`, measured when they were dropped: each saved into the project, then all placed
 * as one undo step and selected. Files that aren't images Parity takes, or are too large, are skipped with a message
 * naming them, and so are any that fail to save.
 */
export async function dropFiles(session: ProjectSession, target: FileDrop, files: readonly File[]): Promise<void> {
  const { store, selection } = session
  const images = takenFrom(files)

  if (images.length === 0) {
    return
  }

  if (target.kind === "none") {
    toast.info("There's no layout here to drop into")

    return
  }

  const added = await saveImages(session, files, images)

  if (added.length === 0) {
    return
  }

  const nodes = added.map((image) => image.node)
  const label = dropLabel(nodes.length)

  if (target.kind === "canvas") {
    const design = designOfImages(
      nodes,
      added.map((image) => image.name),
      store.getEntries().map((entry) => entry.container.id),
      target.at
    )

    const key = store.addContainer(store.mainPath, design, label)
    selection.set({ design: key })
    recordDrop(added, key, true)

    return
  }

  const { hit, here } = target
  // In the frame they were dropped on, as the design is now that the files are saved.
  const frame = store.editFrame(pickedIn(hit))
  let copies: string[] = []

  if (frame) {
    store.updateContainer(frame.design, label, (container) => {
      const placed = pasteHere(container, nodes, here, frame.state, frame.viewport)
      copies = placed.copies

      return placed.container
    })
  }

  // The layout went while the files were saved, by an undo or an agent.
  if (copies.length === 0) {
    toast.info("The layout they were dropped on is gone, so the images weren't placed")

    return
  }

  selection.set(layersSelection(hit.entry.key, copies, hit))
  recordDrop(added, hit.entry.key, false)
}

/** Records images dropped from outside the app as `insert.done` (PAR-640). */
function recordDrop(added: readonly { name: string }[], design: string, newDesign: boolean): void {
  const done: Attributes<"insert.done"> = {
    source: "drop",
    via: "files",
    kind: "image",
    count: added.length,
    design,
    newDesign
  }

  if (added.length === 1) {
    done.item = added[0]!.name
  }

  track("insert.done", done)
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
    if (event.defaultPrevented || !ours(event)) {
      return
    }

    event.preventDefault()

    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "none"
    }
  }

  const onDrop = (event: DragEvent) => {
    if (ours(event)) {
      event.preventDefault()
    }
  }

  target.addEventListener("dragover", onDragOver)
  target.addEventListener("drop", onDrop)

  return () => {
    target.removeEventListener("dragover", onDragOver)
    target.removeEventListener("drop", onDrop)
  }
}
