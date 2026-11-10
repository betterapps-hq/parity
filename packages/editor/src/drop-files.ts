import { type ContainerSpec, type DesignNode, generateId, uniqueId, withFreshIds } from "@parity-app/core"
import { landedStyle } from "./new-screen.ts"

/**
 * Image files dropped onto the canvas from Explorer or Finder: which of them Parity takes, what it says about the rest,
 * and the new design they make on the empty canvas. Reading the files, saving them into the project and finding the
 * layout under the pointer stay in the app.
 */

/** The image types Parity saves into a project, by media type, with the extension each is saved under. */
const imageTypes: ReadonlyMap<string, string> = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/gif", "gif"],
  ["image/webp", "webp"],
  ["image/svg+xml", "svg"]
])

/** The image types Parity saves, as a file picker's `accept` lists them. */
export const imageAccept = [...imageTypes.keys()].join(",")

/** The extension an image of a media type is saved under, or undefined for a type Parity doesn't save. */
export function imageExtension(type: string): string | undefined {
  return imageTypes.get(type)
}

/** The largest image saved into a project, in bytes. */
export const imageLimit = 20 * 1024 * 1024

/** How the image types read in messages. */
export const imageKinds = "PNG, JPEG, GIF, WebP or SVG"

/** Media types by extension, for files the system gives no type. */
const byExtension: ReadonlyMap<string, string> = new Map([
  ["png", "image/png"],
  ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"],
  ["gif", "image/gif"],
  ["webp", "image/webp"],
  ["svg", "image/svg+xml"]
])

/** A dropped file, as the browser's `File` describes it. */
export interface DroppedFile {
  name: string
  /** Its media type; empty when the system doesn't know it. */
  type: string
  /** In bytes. */
  size: number
}

/** A file Parity takes, by its place among the dropped files, with the media type it's saved as. */
export interface DroppedImage {
  index: number
  type: string
}

/** A file Parity leaves out, and why: not one of the image types, or larger than the limit. */
export interface SkippedFile {
  name: string
  reason: "type" | "size"
}

/**
 * A file's image type: its own media type when that's one Parity takes, or, when the system gave it none, the one its
 * extension names. Undefined for anything else.
 */
export function imageTypeOf(file: Pick<DroppedFile, "name" | "type">): string | undefined {
  if (file.type) {
    return imageTypes.has(file.type) ? file.type : undefined
  }

  const extension = /\.([^./\\]+)$/.exec(file.name)?.[1]?.toLowerCase()

  return extension === undefined ? undefined : byExtension.get(extension)
}

/** Whether a drag's item, whose name isn't known until it's dropped, could be an image Parity takes. */
export function mayBeImage(type: string): boolean {
  return type === "" || imageTypes.has(type)
}

/** Dropped files sorted: the images Parity takes, and the files it skips. */
export interface SortedDrop {
  images: DroppedImage[]
  skipped: SkippedFile[]
}

/** The dropped files sorted into the images Parity takes, in the order they came, and the files it skips. */
export function sortDrop(files: readonly DroppedFile[]): SortedDrop {
  const images: DroppedImage[] = []
  const skipped: SkippedFile[] = []

  for (const [index, file] of files.entries()) {
    const type = imageTypeOf(file)

    if (!type) {
      skipped.push({ name: file.name, reason: "type" })
    } else if (file.size > imageLimit) {
      skipped.push({ name: file.name, reason: "size" })
    } else {
      images.push({ index, type })
    }
  }

  return { images, skipped }
}

/** A message about skipped files: a title naming them, and why each was skipped. */
export interface SkippedMessage {
  title: string
  description: string
}

/** What to say about skipped files: a title naming them, and why each was skipped. Undefined when none were. */
export function skippedMessage(skipped: readonly SkippedFile[]): SkippedMessage | undefined {
  if (skipped.length === 0) {
    return undefined
  }

  const title = skipped.length === 1 ? `Skipped ${skipped[0]!.name}` : `Skipped ${skipped.length} files`
  const sentences: string[] = []
  const types = skipped.flatMap((file) => (file.reason === "type" ? [file.name] : []))

  if (types.length === 1) {
    sentences.push(`${types[0]} isn't a ${imageKinds} image.`)
  } else if (types.length > 1) {
    sentences.push(`${names(types)} aren't ${imageKinds} images.`)
  }

  const sizes = skipped.flatMap((file) => (file.reason === "size" ? [file.name] : []))

  if (sizes.length > 0) {
    sentences.push(`${names(sizes)} ${sizes.length === 1 ? "is" : "are"} larger than 20 MB.`)
  }

  return { title, description: sentences.join(" ") }
}

/** Names in a sentence: "a", "a and b", "a, b and c", and past five, how many more. */
function names(list: readonly string[]): string {
  const shown = list.length > 5 ? [...list.slice(0, 4), `${list.length - 4} more`] : list

  return shown.length === 1 ? shown[0]! : `${shown.slice(0, -1).join(", ")} and ${shown.at(-1)}`
}

/**
 * What the canvas says beside the pointer while files are dragged over it: what a drop there would do with the `count`
 * files that may be images, into a layout, onto the empty canvas, or nowhere, over a design with no layout there.
 */
export function dropHint(count: number, where: "layout" | "canvas" | "none"): string {
  if (count === 0) {
    return `Only ${imageKinds} images can be dropped`
  }

  if (where === "none") {
    return "Drop onto a layout, or onto the empty canvas"
  }

  const images = count === 1 ? "the image" : `${count} images`

  return where === "layout" ? `Add ${images} here` : `New frame with ${images}`
}

/** The undo step's label for a drop of this many images. */
export function dropLabel(count: number): string {
  return count === 1 ? "Drop image" : `Drop ${count} images`
}

/** A file's name without its extension, as the image it's saved as and a design made of it are named. */
export function fileBaseName(name: string): string {
  return name.replace(/\.[^./\\]*$/, "") || name
}

/**
 * Images dropped on the empty canvas: a new frame with its top left `at`, holding them side by side in a row, padded
 * and hugging them as a pasted frame is (see `landedStyle`). It's named after the file when there's one, and Images when there are several.
 * Its id isn't one of `taken`, the designs' ids, and its layers get fresh ids.
 */
export function designOfImages(
  nodes: readonly DesignNode[],
  files: readonly string[],
  taken: Iterable<string>,
  at: { x: number; y: number }
): ContainerSpec {
  const ids = new Set<string>()
  const rootId = generateId(ids)
  ids.add(rootId)
  const name = (files.length === 1 && fileBaseName(files[0]!)) || "Images"

  return {
    id: uniqueId(name, taken),
    name,
    kind: "frame",
    position: at,
    root: {
      type: "layout",
      id: rootId,
      style: { ...landedStyle, direction: "row", align: "start" },
      children: nodes.map((node) => withFreshIds(node, ids))
    },
    states: [{ id: "default", name: "Default" }]
  }
}
