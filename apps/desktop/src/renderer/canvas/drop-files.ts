import type { DesignNode } from "@parity-app/core"
import {
  countMedia,
  designOfMedia,
  type DroppedFile,
  dropLabel,
  type FileMedium,
  fileBaseName,
  type HereLayout,
  layersSelection,
  mediaWords,
  pasteHere,
  type Point,
  type Slot,
  skippedMessage,
  sortDrop,
  type TakenFile
} from "@parity-app/editor"
import { toast } from "sonner"
import type { Attributes } from "../chrome/event-attributes.ts"
import { reportError, track } from "../report-error.ts"
import type { ProjectSession } from "../workspace.ts"
import { type Hit, pickedIn } from "./hit.ts"
import { importMedia } from "./import-media.ts"
import { emptyCanvasAt } from "./new-screen.ts"
import { placeAtPoint } from "./paste-here.ts"

/**
 * Image and video files dragged onto the canvas from Explorer or Finder (PAR-24, PAR-841). Over a layout inside a design
 * they go into the slot under the pointer, as a dragged layer lands, or at the pointer in an absolutely placed layout,
 * as Paste here puts layers; on the empty canvas they make a new frame there, as a paste with nothing to paste into
 * does. Each file is saved under `public/images/` or `public/videos/` through `images.import` at once, as a paste saves
 * it, and placing them is one undo step, which leaves the files, as undoing a paste does. Which files are taken, and
 * what's said about the rest, are `@parity-app/editor`'s rules.
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

/** An image or video file saved into the project: the layer that shows it, and the file's name as it came. */
export interface SavedImage {
  node: DesignNode
  name: string
}

/**
 * The files among `files` that Parity takes, in the order they came. The rest, which aren't images or videos or are too
 * large, are named in a message with why.
 */
function takenFrom(files: readonly DroppedFile[]): TakenFile[] {
  const { taken, skipped } = sortDrop(files)
  const message = skippedMessage(skipped)

  if (message) {
    toast.warning(message.title, { description: message.description })
  }

  return taken
}

/**
 * Saves image and video files into the project, saying so while it does. One at a time, in the order given: each is
 * read whole before it's sent, so a folder of large photos isn't all in memory at once, and the same file given twice
 * reuses the one the first saved. Any that fail to save are named in a message, and the rest are returned.
 */
async function saveImages(
  session: ProjectSession,
  files: readonly File[],
  taken: readonly TakenFile[]
): Promise<SavedImage[]> {
  const words = mediaWords(countMedia(taken.map(({ medium }) => medium)))
  const progress = toast.loading(`Adding ${words}…`)
  const added: SavedImage[] = []
  const failed: { name: string; error: unknown }[] = []

  for (const { index, type } of taken) {
    const file = files[index]!

    try {
      added.push({ node: await importMedia(session, file, fileBaseName(file.name), type), name: file.name })
    } catch (error) {
      failed.push({ name: file.name, error })
    }
  }

  if (failed.length > 0) {
    const reason = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause))
    reportError(failed[0]!.error, {
      operation: "images.import",
      title: failed.length === 1 ? `Couldn't add ${failed[0]!.name}` : `Couldn't add ${failed.length} files`,
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
 * Adds image and video files to the project without placing them, as dropping them on the Media tab does (PAR-838):
 * each is saved under `public/images/` or `public/videos/`, and what was saved comes back. Files that aren't taken, or
 * fail to save, are named. `described` says what each file is when that isn't the file itself, as for a copied file too
 * large to read.
 */
export async function addImageFiles(
  session: ProjectSession,
  files: readonly File[],
  described: readonly DroppedFile[] = files
): Promise<SavedImage[]> {
  const taken = takenFrom(described)

  return taken.length === 0 ? [] : saveImages(session, files, taken)
}

/**
 * Adds the image files dropped `target`, measured when they were dropped: each saved into the project, then all placed
 * as one undo step and selected. Files that aren't images Parity takes, or are too large, are skipped with a message
 * naming them, and so are any that fail to save.
 */
export async function dropFiles(session: ProjectSession, target: FileDrop, files: readonly File[]): Promise<void> {
  const { store, selection } = session
  const taken = takenFrom(files)

  if (taken.length === 0) {
    return
  }

  if (target.kind === "none") {
    toast.info("There's no layout here to drop into")

    return
  }

  const added = await saveImages(session, files, taken)

  if (added.length === 0) {
    return
  }

  const nodes = added.map((image) => image.node)
  const label = dropLabel(countMedia(nodes.map(mediumOfNode)))

  if (target.kind === "canvas") {
    const design = designOfMedia(
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
    toast.info("The layout they were dropped on is gone, so they weren't placed")

    return
  }

  selection.set(layersSelection(hit.entry.key, copies, hit))
  recordDrop(added, hit.entry.key, false)
}

/** Whether a saved file's layer shows a picture or a video. */
export function mediumOfNode(node: DesignNode): FileMedium {
  return node.type === "video" ? "video" : "image"
}

/** Records files dropped from outside the app as `insert.done` (PAR-640), as videos when they all are. */
function recordDrop(added: readonly SavedImage[], design: string, newDesign: boolean): void {
  const done: Attributes<"insert.done"> = {
    source: "drop",
    via: "files",
    kind: added.every(({ node }) => node.type === "video") ? "video" : "image",
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
