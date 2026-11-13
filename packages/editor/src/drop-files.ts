import { type ContainerSpec, type DesignNode, generateId, uniqueId, withFreshIds } from "@parity-app/core"
import { landedStyle } from "./new-screen.ts"

/**
 * Image and video files dropped onto the canvas from Explorer or Finder: which of them Parity takes, what it says about
 * the rest, and the new design they make on the empty canvas. Reading the files, saving them into the project and
 * finding the layout under the pointer stay in the app.
 */

/** What a file Parity saves into a project shows: a picture, or a video (PAR-841). */
export type FileMedium = "image" | "video"

/** The types Parity saves into a project, by media type: the extension each is saved under, and what it shows. */
const mediaTypes: ReadonlyMap<string, { extension: string; medium: FileMedium }> = new Map([
  ["image/png", { extension: "png", medium: "image" }],
  ["image/jpeg", { extension: "jpg", medium: "image" }],
  ["image/gif", { extension: "gif", medium: "image" }],
  ["image/webp", { extension: "webp", medium: "image" }],
  ["image/svg+xml", { extension: "svg", medium: "image" }],
  ["video/mp4", { extension: "mp4", medium: "video" }],
  ["video/webm", { extension: "webm", medium: "video" }]
])

/** The types Parity saves, as a file picker's `accept` lists them. */
export const mediaAccept = [...mediaTypes.keys()].join(",")

/** The extension a file of a media type is saved under, or undefined for a type Parity doesn't save. */
export function mediaExtension(type: string): string | undefined {
  return mediaTypes.get(type)?.extension
}

/** Whether a media type Parity saves is a picture or a video; undefined for one it doesn't save. */
export function mediumOfType(type: string): FileMedium | undefined {
  return mediaTypes.get(type)?.medium
}

/** The largest image saved into a project, in bytes. */
export const imageLimit = 20 * 1024 * 1024

/** The largest video saved into a project, in bytes. */
export const videoLimit = 100 * 1024 * 1024

/** The largest file of a media type Parity saves into a project, in bytes. */
export function limitOf(type: string): number {
  return mediumOfType(type) === "video" ? videoLimit : imageLimit
}

/** A limit as messages say it: "20 MB". */
export function megabytes(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`
}

/** How the types read in messages. */
export const mediaKinds = "PNG, JPEG, GIF, WebP, SVG, MP4 or WebM"

/** Media types by extension, for files the system gives no type. */
const byExtension: ReadonlyMap<string, string> = new Map([
  ["png", "image/png"],
  ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"],
  ["gif", "image/gif"],
  ["webp", "image/webp"],
  ["svg", "image/svg+xml"],
  ["mp4", "video/mp4"],
  ["webm", "video/webm"]
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
export interface TakenFile {
  index: number
  type: string
  medium: FileMedium
}

/** A file Parity leaves out, and why: not one of the types, or larger than the limit for its type. */
export interface SkippedFile {
  name: string
  reason: "type" | "size"
  /** The limit it's over, in bytes, when it's too large; an image's when left out. */
  limit?: number
}

/**
 * A file's media type: its own when that's one Parity takes, or, when the system gave it none, the one its extension
 * names. Undefined for anything else.
 */
export function mediaTypeOf(file: Pick<DroppedFile, "name" | "type">): string | undefined {
  if (file.type) {
    return mediaTypes.has(file.type) ? file.type : undefined
  }

  const extension = /\.([^./\\]+)$/.exec(file.name)?.[1]?.toLowerCase()

  return extension === undefined ? undefined : byExtension.get(extension)
}

/**
 * What a drag's item, whose name isn't known until it's dropped, may be: a picture or a video Parity takes, by its
 * media type, with an item of no type counted as a picture. Undefined for one Parity won't take.
 */
export function mayBeMedia(type: string): FileMedium | undefined {
  return type === "" ? "image" : mediumOfType(type)
}

/** Dropped files sorted: the ones Parity takes, and the ones it skips. */
export interface SortedDrop {
  taken: TakenFile[]
  skipped: SkippedFile[]
}

/** The dropped files sorted into the ones Parity takes, in the order they came, and the ones it skips. */
export function sortDrop(files: readonly DroppedFile[]): SortedDrop {
  const taken: TakenFile[] = []
  const skipped: SkippedFile[] = []

  for (const [index, file] of files.entries()) {
    const type = mediaTypeOf(file)
    const medium = type === undefined ? undefined : mediumOfType(type)

    if (type === undefined || medium === undefined) {
      skipped.push({ name: file.name, reason: "type" })
    } else if (file.size > limitOf(type)) {
      skipped.push({ name: file.name, reason: "size", limit: limitOf(type) })
    } else {
      taken.push({ index, type, medium })
    }
  }

  return { taken, skipped }
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
    sentences.push(`${types[0]} isn't a ${mediaKinds} file.`)
  } else if (types.length > 1) {
    sentences.push(`${names(types)} aren't ${mediaKinds} files.`)
  }

  const tooLarge = skipped.flatMap((file) =>
    file.reason === "size" ? [{ ...file, limit: file.limit ?? imageLimit }] : []
  )

  const limits = [...new Set(tooLarge.map((file) => file.limit))].toSorted((a, b) => a - b)

  for (const limit of limits) {
    const sizes = tooLarge.flatMap((file) => (file.limit === limit ? [file.name] : []))
    sentences.push(`${names(sizes)} ${sizes.length === 1 ? "is" : "are"} larger than ${megabytes(limit)}.`)
  }

  return { title, description: sentences.join(" ") }
}

/** Names in a sentence: "a", "a and b", "a, b and c", and past five, how many more. */
function names(list: readonly string[]): string {
  const shown = list.length > 5 ? [...list.slice(0, 4), `${list.length - 4} more`] : list

  return shown.length === 1 ? shown[0]! : `${shown.slice(0, -1).join(", ")} and ${shown.at(-1)}`
}

/** How many pictures and videos there are, as a drag, a drop or a new frame counts them. */
export interface MediaCount {
  images: number
  videos: number
}

/** Counts the pictures and videos among files Parity takes, or among a drag's items that may be either. */
export function countMedia(media: readonly (FileMedium | undefined)[]): MediaCount {
  return {
    images: media.filter((medium) => medium === "image").length,
    videos: media.filter((medium) => medium === "video").length
  }
}

/** Pictures and videos in words: "the image", "2 videos", or "3 files" for some of each. */
export function mediaWords({ images, videos }: MediaCount): string {
  const count = images + videos

  if (images > 0 && videos > 0) {
    return `${count} files`
  }

  const one = videos > 0 ? "video" : "image"

  return count === 1 ? `the ${one}` : `${count} ${one}s`
}

/**
 * What the canvas says beside the pointer while files are dragged over it: what a drop there would do with the files
 * that may be pictures or videos, into a layout, onto the empty canvas, or nowhere, over a design with no layout there.
 */
export function dropHint(count: MediaCount, where: "layout" | "canvas" | "none"): string {
  if (count.images + count.videos === 0) {
    return `Only ${mediaKinds} files can be dropped`
  }

  if (where === "none") {
    return "Drop onto a layout, or onto the empty canvas"
  }

  const media = mediaWords(count)

  return where === "layout" ? `Add ${media} here` : `New frame with ${media}`
}

/** The undo step's label for a drop: "Drop image", "Drop 2 videos", "Drop 3 files". */
export function dropLabel(count: MediaCount): string {
  return `Drop ${mediaWords(count).replace(/^the /, "")}`
}

/** A file's name without its extension, as the file it's saved as and a design made of it are named. */
export function fileBaseName(name: string): string {
  return name.replace(/\.[^./\\]*$/, "") || name
}

/** What a frame of several dropped files is called: Images, Videos, or Media for some of each. */
function severalName(nodes: readonly DesignNode[]): string {
  const videos = nodes.filter((node) => node.type === "video").length

  if (videos === 0) {
    return "Images"
  }

  return videos === nodes.length ? "Videos" : "Media"
}

/**
 * Pictures and videos dropped on the empty canvas: a new frame with its top left `at`, holding them side by side in a
 * row, padded and hugging them as a pasted frame is (see `landedStyle`). It's named after the file when there's one,
 * and otherwise Images, Videos, or Media for some of each. Its id isn't one of `taken`, the designs' ids, and its
 * layers get fresh ids.
 */
export function designOfMedia(
  nodes: readonly DesignNode[],
  files: readonly string[],
  taken: Iterable<string>,
  at: { x: number; y: number }
): ContainerSpec {
  const ids = new Set<string>()
  const rootId = generateId(ids)
  ids.add(rootId)
  const name = (files.length === 1 && fileBaseName(files[0]!)) || severalName(nodes)

  return {
    id: uniqueId(name, taken),
    name,
    kind: "frame",
    position: at,
    root: {
      type: "layout",
      id: rootId,
      style: { ...landedStyle, flexDirection: "row", alignItems: "start" },
      children: nodes.map((node) => withFreshIds(node, ids))
    }
  }
}
