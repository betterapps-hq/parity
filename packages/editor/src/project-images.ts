import {
  type CanvasDocument,
  type ImageCredit,
  type ImageDetails,
  type InstanceNode,
  type NodeStyle,
  paintsOf,
  type StateSpec,
  walkNodes
} from "@parity-app/core"
import { z } from "zod"
import type { InsertItem } from "./insert.ts"
import type { PictureSize } from "./media-wall.ts"

/*
 * A project's images and videos (PAR-834, PAR-841): the files under `public/images/` and `public/videos/`, which
 * pasting, dropping and downloading save there, and the photos image layers link to at a stock library's own address.
 * What uses each one, in designs and in the project's code, says whether it can be removed. Reading the files and the
 * code, and removing a file, stay in the app.
 */

/** Where a project's own image files are, from its root. */
export const imagesFolder = "public/images"

/** Where a project's own video files are, from its root, beside its images (PAR-841). */
export const videosFolder = "public/videos"

/** The folders a project's media files are in, from its root. */
export const mediaFolders = [imagesFolder, videosFolder] as const

/** The media folder a path from the project's root is in, or undefined for a path in neither. */
export function mediaFolderOf(path: string): (typeof mediaFolders)[number] | undefined {
  return mediaFolders.find((folder) => path.startsWith(`${folder}/`))
}

/** An image file in the project, by its path from the root with forward slashes, and its size in bytes. */
export interface ImageFile {
  path: string
  bytes: number
}

/** A line of the project's code that names an image file, by the file's path. */
export interface CodeReference {
  image: string
  path: string
  /** From 1. */
  line: number
}

/** A layer that shows an image, in a design or one of its states. */
export interface ImageUse {
  /** The project file the design is in. */
  document: string
  design: string
  designName: string
  node: string
}

/**
 * One image, the same shape for the window's image list and agents: a file in the project, a photo linked at its
 * library's address, or a project path layers name with no file there.
 */
export interface ProjectImage {
  kind: "file" | "linked" | "missing"
  /** What layers set `src` to: `/images/hero.png`, or a link. */
  src: string
  /** The file's path from the root, for a file. */
  path?: string
  /** For people: the file's name, or a linked photo's alt text, credit or address. */
  name: string
  bytes?: number
  /** The alt text the first layer showing it gives. */
  alt?: string
  credit?: ImageCredit
  usedBy: ImageUse[]
  usedInCode: { path: string; line: number }[]
}

export interface ImagesInput {
  files: readonly ImageFile[]
  references: readonly CodeReference[]
  documents: readonly { path: string; document: CanvasDocument }[]
}

/** The project's images: its files by path, then linked photos, then paths with no file, each with what uses it. */
export function projectImages({ files, references, documents }: ImagesInput): ProjectImage[] {
  const bySrc = new Map<string, ProjectImage>()
  const details = keptDetails(documents)

  for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    const src = srcOf(file.path)

    const image: ProjectImage = {
      kind: "file",
      src,
      path: file.path,
      name: file.path.slice((mediaFolderOf(file.path) ?? "public").length + 1),
      bytes: file.bytes,
      usedBy: [],
      usedInCode: references
        .filter((reference) => reference.image === file.path)
        .map(({ path, line }) => ({ path, line }))
    }

    // What the project kept as the file was added comes before what the first layer showing it says.
    const kept = details.get(file.path)
    bySrc.set(src, image)

    if (kept?.alt) {
      image.alt = kept.alt
    }

    if (kept?.credit) {
      image.credit = kept.credit
    }
  }

  const added: ProjectImage[] = []

  for (const layer of imageLayers(documents)) {
    const src = comparable(layer.src)
    let image = bySrc.get(src)

    if (!image) {
      image = { kind: isLink(src) ? "linked" : "missing", src, name: src, usedBy: [], usedInCode: [] }
      bySrc.set(src, image)
      added.push(image)
    }

    image.usedBy.push(layer.use)

    if (image.alt === undefined && layer.alt) {
      image.alt = layer.alt
    }

    if (image.credit === undefined && layer.credit) {
      image.credit = layer.credit
    }
  }

  for (const image of added) {
    const by = mediumOf(image) === "video" ? "Video" : "Photo"
    image.name = image.alt || (image.credit ? `${by} by ${image.credit.name}` : image.src)
  }

  const order = { file: 0, linked: 1, missing: 2 }

  return [...bySrc.values()].sort((a, b) => order[a.kind] - order[b.kind])
}

/**
 * A project file with what it keeps about some of its image files, by each file's path, as adding stock pictures
 * records what each shows and who made it. A file it already kept details for takes the new ones.
 */
export function keepImageDetails(
  document: CanvasDocument,
  details: Readonly<Record<string, ImageDetails>>
): CanvasDocument {
  return { ...document, images: { ...document.images, ...details } }
}

/**
 * What the project's files keep about its image files, by path: what each shows and who made it, as adding a stock
 * picture keeps them. The first file to say wins, as the main file comes first.
 */
function keptDetails(documents: ImagesInput["documents"]): Map<string, ImageDetails> {
  const details = new Map<string, ImageDetails>()

  for (const { document } of documents) {
    for (const [path, kept] of Object.entries(document.images ?? {})) {
      if (!details.has(path)) {
        details.set(path, kept)
      }
    }
  }

  return details
}

/** Images whose name, path, address, alt text or credit holds `search`, and only unused ones when asked. */
export function filterImages(
  images: readonly ProjectImage[],
  { search, unused = false }: { search?: string; unused?: boolean }
): ProjectImage[] {
  const wanted = search?.trim().toLowerCase()

  return images.filter((image) => {
    if (unused && inUse(image)) {
      return false
    }

    if (!wanted) {
      return true
    }

    const said = [image.name, image.path, image.src, image.alt, image.credit?.name, image.credit?.source]

    return said.some((text) => text?.toLowerCase().includes(wanted))
  })
}

/** Whether a design or the project's code uses the image. */
export function inUse(image: ProjectImage): boolean {
  return image.usedBy.length > 0 || image.usedInCode.length > 0
}

/**
 * Why an image can't be removed, in words a person or agent can act on, or undefined when it can be: it's a file in
 * `public/images/` that no design and no line of code uses. `named` is a path or `src` as the caller gave it.
 */
export function cantRemove(images: readonly ProjectImage[], named: string): string | undefined {
  const image = findImage(images, named)

  if (!image) {
    return `${named} isn't one of the project's images or videos. Those are the files in ${imagesFolder}/ and ${videosFolder}/, and the photos layers link to.`
  }

  if (image.kind !== "file") {
    const what = image.kind === "linked" ? "is linked at its library's address" : "has no file in the project"

    return `${image.name} ${what}, so there's no file to remove. Remove or replace the layers that show it instead.`
  }

  if (!inUse(image)) {
    return undefined
  }

  const places = [
    ...unique(image.usedBy.map((use) => use.designName)),
    ...image.usedInCode.map((use) => `${use.path} (line ${use.line})`)
  ]

  return `${image.name} is still used in ${listed(places)}. Remove or replace it there first.`
}

/** What one of the project's media is, which a list of them can narrow to: pixels, shapes that scale, or a video. */
export type ImageMedium = "image" | "vector" | "video"

/** Whether one of the project's media is pixels, shapes or a video, by its file's extension. */
export function mediumOf(image: Pick<ProjectImage, "src">): ImageMedium {
  if (/\.(?:mp4|webm)(?:[?#]|$)/i.test(image.src)) {
    return "video"
  }

  return /\.svg(?:[?#]|$)/i.test(image.src) ? "vector" : "image"
}

/** A design that uses an image, with each of its layers that does. */
export interface DesignUse {
  document: string
  design: string
  name: string
  layers: string[]
}

/**
 * The designs that use an image, the one with the most layers first. A logo can be in a hundred layers, and they're
 * in a handful of designs, so the designs are what a person is shown.
 */
export function designsUsing(image: Pick<ProjectImage, "usedBy">): DesignUse[] {
  const designs = new Map<string, DesignUse>()

  for (const use of image.usedBy) {
    const key = `${use.document}#${use.design}`
    const known = designs.get(key)

    if (known) {
      known.layers.push(use.node)
    } else {
      designs.set(key, { document: use.document, design: use.design, name: use.designName, layers: [use.node] })
    }
  }

  return [...designs.values()].toSorted((a, b) => b.layers.length - a.layers.length)
}

/** A file of the project's code that names an image, with each line that does. */
export interface CodeFileUse {
  path: string
  /** What a person is shown: its file's name, with as many of its folders as tell it from another of that name. */
  name: string
  /** From 1, in order. */
  lines: number[]
}

/**
 * The files of the project's code that name an image, in the order they were found, each with its lines and a name
 * that tells it apart: `index.tsx` alone, or `pages/index.tsx` beside `components/index.tsx`.
 */
export function codeFilesUsing(image: Pick<ProjectImage, "usedInCode">): CodeFileUse[] {
  const files = new Map<string, number[]>()

  for (const { path, line } of image.usedInCode) {
    files.set(path, [...(files.get(path) ?? []), line])
  }

  const paths = [...files.keys()]

  return [...files].map(([path, lines]) => ({
    path,
    name: distinctName(path, paths),
    lines: lines.toSorted((a, b) => a - b)
  }))
}

/** A path's end, as few of its parts as no other path ends with. */
function distinctName(path: string, paths: readonly string[]): string {
  const parts = path.split("/")

  for (let take = 1; take < parts.length; take++) {
    const end = parts.slice(-take).join("/")

    if (!paths.some((other) => other !== path && (other === end || other.endsWith(`/${end}`)))) {
      return end
    }
  }

  return path
}

/** Where an image is used, as its card lists it: designs then files of code, and how many of each wait past them. */
export interface UsesOnCard {
  designs: DesignUse[]
  files: CodeFileUse[]
  moreDesigns: number
  moreFiles: number
}

/**
 * What a card that has room for so many rows lists of where an image is used: the designs with the most layers first,
 * then files of code in what room is left, and how many of each it leaves out. One place past the room is listed
 * rather than counted, since a row saying "1 more" takes the room the place itself would.
 */
export function usesOnCard(image: Pick<ProjectImage, "usedBy" | "usedInCode">, rows: number): UsesOnCard {
  const allDesigns = designsUsing(image)
  const allFiles = codeFilesUsing(image)
  const room = allDesigns.length + allFiles.length === rows + 1 ? rows + 1 : rows
  const designs = allDesigns.slice(0, room)
  const files = allFiles.slice(0, Math.max(0, room - designs.length))

  return {
    designs,
    files,
    moreDesigns: allDesigns.length - designs.length,
    moreFiles: allFiles.length - files.length
  }
}

/** Every place an image is used, designs then files of code. */
export interface ImageUses {
  designs: DesignUse[]
  files: CodeFileUse[]
}

/** Every place an image is used whose design name or file path holds `search`, designs then files of code. */
export function findUses(image: Pick<ProjectImage, "usedBy" | "usedInCode">, search: string): ImageUses {
  const wanted = search.trim().toLowerCase()

  return {
    designs: designsUsing(image).filter(({ name }) => name.toLowerCase().includes(wanted)),
    files: codeFilesUsing(image).filter(({ path }) => path.toLowerCase().includes(wanted))
  }
}

/**
 * What removing an image in the window takes. A file nothing uses goes at once (`file`). One designs use goes with the
 * layers that show it (`file-and-layers`). One the project's code names stays until the code changes (`code`), since
 * Parity doesn't edit a person's code for them. A linked photo and a path with no file have nothing to delete, so
 * removing one removes its layers (`layers`).
 */
export type Removal = "file" | "file-and-layers" | "layers" | "code"

export function removalOf(image: ProjectImage): Removal {
  if (image.usedInCode.length > 0) {
    return "code"
  }

  if (image.kind !== "file") {
    return "layers"
  }

  return image.usedBy.length > 0 ? "file-and-layers" : "file"
}

/**
 * One of the project's images or videos as something to insert, as the Media tab places one: a layer that shows it by
 * its `src`, at its picture's own proportions, with the alt text and credit it already has elsewhere.
 */
export function imageItem(image: Pick<ProjectImage, "src" | "alt" | "credit">, size: PictureSize): InsertItem {
  const item = { src: image.src, width: size.width, height: size.height, alt: image.alt, credit: image.credit }

  if (!item.alt) {
    delete item.alt
  }

  if (!item.credit) {
    delete item.credit
  }

  return mediumOf(image) === "video" ? { kind: "video", ...item } : { kind: "image", ...item }
}

/** An image by its file's path, its `src`, or its file name. */
export function findImage(images: readonly ProjectImage[], named: string): ProjectImage | undefined {
  const wanted = comparable(named.replaceAll("\\", "/").replace(/^\.\//, ""))

  return images.find(
    (image) => image.path === wanted || image.src === wanted || (image.kind === "file" && image.name === wanted)
  )
}

/**
 * The lines of the project's code that name each image file, as `images/hero.png` with or without a leading slash,
 * which is how an `<img>`, an import from the public folder or a CSS `url()` reaches it.
 */
export function codeReferences(
  files: readonly ImageFile[],
  code: readonly { path: string; text: string }[]
): CodeReference[] {
  const references: CodeReference[] = []

  for (const source of code) {
    const lines = source.text.split("\n")

    for (const file of files) {
      const named = srcOf(file.path).slice(1)

      for (const [index, line] of lines.entries()) {
        if (line.includes(named)) {
          references.push({ image: file.path, path: source.path, line: index + 1 })
        }
      }
    }
  }

  return references
}

/** The address the dev server serves a file in `public/` at: `public/images/hero.png` is `/images/hero.png`. */
function srcOf(path: string): string {
  return path.slice("public".length)
}

/** A `src` without its query or fragment, so `/images/a.png?v=2` is `/images/a.png`. A link is left whole. */
function comparable(src: string): string {
  return isLink(src) ? src : src.replace(/[?#].*$/, "")
}

function isLink(src: string): boolean {
  return /^https?:\/\//i.test(src)
}

interface ImageLayer {
  src: string
  alt?: string
  credit?: ImageCredit
  use: ImageUse
}

/** A value a prop can hold that names an image: any text, kept when it's a `src` or names a file in `/images/`. */
const propText = z.string()

/** Props as layers and patches hold them. */
type Props = InstanceNode["args"]

/** Patches by the layer they patch, as states, variants, viewports and instances' overrides hold them. */
type Patches = StateSpec["overrides"]

/**
 * Every place a design names an image: its image layers, the props it gives components and instances (an avatar's
 * `src`), and the props its states, variants, viewports and instances' overrides patch in. A prop counts when it's
 * named `src`, or its value names a file in `/images/`. Each is named by the layer it's on or patches.
 */
function imageLayers(documents: ImagesInput["documents"]): ImageLayer[] {
  const layers: ImageLayer[] = []

  for (const { path, document } of documents) {
    for (const design of document.containers) {
      const seen = new Set<string>()

      const add = (layer: ImageLayer) => {
        const key = `${layer.use.node} ${layer.src}`

        if (!seen.has(key)) {
          seen.add(key)
          layers.push(layer)
        }
      }

      const usage = (node: string): ImageUse => ({ document: path, design: design.id, designName: design.name, node })

      const fromProps = (props: Props, node: string) => {
        for (const [name, value] of Object.entries(props ?? {})) {
          const text = propText.safeParse(value)

          if (text.success && (name === "src" || text.data.startsWith("/images/"))) {
            add({ src: text.data, use: usage(node) })
          }
        }
      }

      // An image a layer's fill paints (PAR-931).
      const fromFill = (style: NodeStyle | undefined, node: string) => {
        for (const paint of paintsOf(style?.background)) {
          if (paint.kind === "image") {
            add({ src: paint.src, use: usage(node) })
          }
        }
      }

      // A patch map is keyed by the layer it patches, or by `instance/inner` inside an instance.
      const fromPatches = (patches: Patches, owner?: string) => {
        for (const [key, patch] of Object.entries(patches ?? {})) {
          fromProps(patch.props, owner ?? key.split("/")[0] ?? key)
          fromFill(patch.style, owner ?? key.split("/")[0] ?? key)
        }
      }

      walkNodes(design.root, (node) => {
        if (node.type === "image" || node.type === "video") {
          const layer: ImageLayer = { src: node.src, use: usage(node.id) }

          if (node.alt) {
            layer.alt = node.alt
          }

          if (node.credit) {
            layer.credit = node.credit
          }

          add(layer)
        } else if (node.type === "component") {
          fromProps(node.props, node.id)
        } else if (node.type === "instance") {
          fromProps(node.args, node.id)
          fromPatches(node.overrides, node.id)
        }

        fromFill(node.style, node.id)
        fromPatches(node.responsive, node.id)
      })

      for (const state of design.states ?? []) {
        fromPatches(state.overrides)
      }

      for (const param of Object.values(design.params ?? {})) {
        for (const option of param.options ?? []) {
          fromPatches(option.overrides)
        }
      }
    }
  }

  return layers
}

function unique(words: string[]): string[] {
  return [...new Set(words)]
}

/** Words as a list in a sentence: "Home", "Home and Pricing", "Home, Pricing and src/App.tsx (line 3)". */
function listed(words: readonly string[]): string {
  return words.length < 2 ? words.join("") : `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`
}
