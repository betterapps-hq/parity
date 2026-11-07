/**
 * What exporting writes (PAR-185): a file for each layer at each size asked for, named after the layer. Takes data and
 * returns data; the app picks the folder and the service draws and writes the files.
 */

/** One size of export: a PNG or a JPG, at 1x to 3x. */
export interface ExportSize {
  format: "png" | "jpg"
  scale: 1 | 2 | 3
}

/** What exports when nothing's been chosen: a PNG at 2x, sharp on high-density screens. */
export const defaultExportSizes: readonly ExportSize[] = [{ format: "png", scale: 2 }]

/** Every size there is, in the order the Export section offers them: PNGs, then JPGs, each from 1x up. */
export const exportSizes: readonly ExportSize[] = (["png", "jpg"] as const).flatMap((format) =>
  ([1, 2, 3] as const).map((scale) => ({ format, scale }))
)

/** One file to write: the layer's name made safe for a file, with its size's suffix and extension. */
export interface ExportFile {
  /** The layer's index in what was asked to export. */
  layer: number
  size: ExportSize
  name: string
}

/** Characters no file name may hold on Windows, macOS or Linux, and control characters. */
const unsafe = /[<>:"/\\|?*\p{Cc}]/gu

/**
 * The files exporting `layers`, by their names, at `sizes` writes: `Headline@2x.png`, `Headline.jpg`. One at 1x has
 * no suffix, as iOS and Android name theirs. Layers named alike get a number from the second on (`Card`, `Card 2`), so
 * no file overwrites another; a name that's empty once made safe is `Layer`.
 */
export function exportFiles(layers: readonly string[], sizes: readonly ExportSize[]): ExportFile[] {
  const taken = new Map<string, number>()
  const names = layers.map((layer) => {
    const base = safeName(layer)
    const key = base.toLowerCase()
    const count = (taken.get(key) ?? 0) + 1
    taken.set(key, count)
    return count === 1 ? base : `${base} ${count}`
  })
  return names.flatMap((name, layer) =>
    uniqueSizes(sizes).map((size) => ({ layer, size, name: `${name}${suffix(size)}.${size.format}` }))
  )
}

/** The next size to offer when adding one: the first in `exportSizes` not asked for already, if any is left. */
export function nextExportSize(sizes: readonly ExportSize[]): ExportSize | undefined {
  return exportSizes.find((size) => !sizes.some((taken) => sameSize(taken, size)))
}

export function sameSize(a: ExportSize, b: ExportSize): boolean {
  return a.format === b.format && a.scale === b.scale
}

/** A layer's name as a file's: trimmed, without characters a file name can't hold, and no trailing dots. */
export function safeName(name: string): string {
  const safe = name
    .replace(unsafe, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/, "")
  return safe || "Layer"
}

/** A short list of the files, for the Export section: the first few, then how many more. */
export function describeFiles(files: readonly ExportFile[], shown = 3): string {
  const names = files.map((file) => file.name)
  if (names.length <= shown) return names.join(", ")
  return `${names.slice(0, shown).join(", ")} and ${names.length - shown} more`
}

function suffix(size: ExportSize): string {
  return size.scale === 1 ? "" : `@${size.scale}x`
}

/** The sizes once each: two rows asking for a PNG at 2x write it once. */
function uniqueSizes(sizes: readonly ExportSize[]): ExportSize[] {
  return sizes.filter((size, index) => sizes.findIndex((other) => sameSize(other, size)) === index)
}

/** A design drawn for an export, at one scale: its size in CSS pixels and its layers' boxes in them. */
export interface ExportFrame {
  /** The design's id. */
  design: string
  scale: number
  width: number
  height: number
  nodes?: readonly { id: string; x: number; y: number; width: number; height: number }[]
}

/** A file's part of a frame's picture, in whole pixels. */
export interface PictureCrop {
  left: number
  top: number
  width: number
  height: number
}

/**
 * Where each file comes from: the frame of its layer's design at its scale, and the part of its picture the layer
 * covers, the whole picture for a design; or why it can't be written. `layers` name designs by id.
 */
export function planExport(
  layers: readonly { design: string; node?: string }[],
  files: readonly ExportFile[],
  frames: readonly ExportFrame[]
): { file: ExportFile; frame?: number; crop?: PictureCrop; problem?: string }[] {
  return files.map((file) => {
    const layer = layers[file.layer]
    const frame = frames.findIndex(
      (candidate) => candidate.design === layer?.design && candidate.scale === file.size.scale
    )
    const drawn = frames[frame]
    if (!layer || !drawn) return { file, problem: `${file.name}: its design didn't draw` }
    const box = layer.node
      ? drawn.nodes?.find((node) => node.id === layer.node)
      : { x: 0, y: 0, width: drawn.width, height: drawn.height }
    if (!box) return { file, problem: `${file.name}: the layer isn't drawn in the state the canvas shows` }
    const crop = pictureCrop(box, drawn)
    if (!crop) return { file, problem: `${file.name}: the layer has no size` }
    return { file, frame, crop }
  })
}

/**
 * A box in a frame's CSS pixels as whole pixels of its picture at the frame's scale, covering every pixel the box
 * touches and kept inside the picture. None when nothing of it is in the picture.
 */
export function pictureCrop(
  box: { x: number; y: number; width: number; height: number },
  frame: { width: number; height: number; scale: number }
): PictureCrop | undefined {
  const { scale } = frame
  const left = Math.max(0, Math.floor(box.x * scale))
  const top = Math.max(0, Math.floor(box.y * scale))
  const right = Math.min(Math.floor(frame.width * scale), Math.ceil((box.x + box.width) * scale))
  const bottom = Math.min(Math.floor(frame.height * scale), Math.ceil((box.y + box.height) * scale))
  if (right <= left || bottom <= top) return undefined
  return { left, top, width: right - left, height: bottom - top }
}

/** The scale a selection is copied as a PNG at (PAR-190): 2x, as exports are by default, sharp on high-density screens. */
export const copyScale = 2

/**
 * The most pixels across or down a copied picture has (PAR-190). Designs far apart on the canvas make a picture mostly
 * see-through and too big for the clipboard to hold, and for sharp to make.
 */
export const largestPicture = 16_384

/** A design's part of a copied picture: the part of its frame's picture its selected layers cover, and where it goes. */
export interface PicturePiece {
  frame: number
  crop: PictureCrop
  left: number
  top: number
}

/** One picture of a selection: its size in pixels, the pieces it's made of, and what couldn't be drawn. */
export interface PicturePlan {
  width: number
  height: number
  pieces: PicturePiece[]
  problems: string[]
}

/**
 * A selection as one picture at `scale`, for copying it as a PNG (PAR-190), cut from the same frames as an export. Each
 * design's selected layers make one piece, the box around them all, so what's between them shows as it does on the
 * canvas; a design selected whole is its whole picture. Pieces sit where their designs sit on the canvas, `at`, and the
 * picture is the box around them, see-through between designs. `layers` name designs by id, and a layer that can't be
 * drawn is a problem, by `name`, and a picture over `largestPicture` either way is nothing, with a problem saying so.
 * One layer or design is exactly what exporting it as a PNG at `scale` writes.
 */
export function planPicture(
  layers: readonly { design: string; node?: string; name: string; at: { x: number; y: number } }[],
  frames: readonly ExportFrame[],
  scale: number
): PicturePlan {
  const problems: string[] = []
  const placed: PicturePiece[] = []
  for (const design of new Set(layers.map((layer) => layer.design))) {
    const selected = layers.filter((layer) => layer.design === design)
    const frame = frames.findIndex((candidate) => candidate.design === design && candidate.scale === scale)
    const drawn = frames[frame]
    if (!drawn) {
      problems.push(...selected.map((layer) => `${layer.name}: its design didn't draw`))
      continue
    }
    const boxes = selected.flatMap((layer) => {
      const box = layer.node
        ? drawn.nodes?.find((node) => node.id === layer.node)
        : { x: 0, y: 0, width: drawn.width, height: drawn.height }
      if (!box) problems.push(`${layer.name}: the layer isn't drawn in the state the canvas shows`)
      return box ? [box] : []
    })
    if (boxes.length === 0) continue
    const left = Math.min(...boxes.map((box) => box.x))
    const top = Math.min(...boxes.map((box) => box.y))
    const right = Math.max(...boxes.map((box) => box.x + box.width))
    const bottom = Math.max(...boxes.map((box) => box.y + box.height))
    const crop = pictureCrop({ x: left, y: top, width: right - left, height: bottom - top }, drawn)
    if (!crop) {
      problems.push(...selected.map((layer) => `${layer.name}: the layer has no size`))
      continue
    }
    const { at } = selected[0]!
    placed.push({
      frame,
      crop,
      left: Math.round(at.x * scale) + crop.left,
      top: Math.round(at.y * scale) + crop.top
    })
  }
  if (placed.length === 0) return { width: 0, height: 0, pieces: [], problems }
  const originX = Math.min(...placed.map((piece) => piece.left))
  const originY = Math.min(...placed.map((piece) => piece.top))
  const pieces = placed.map((piece) => ({ ...piece, left: piece.left - originX, top: piece.top - originY }))
  const width = Math.max(...pieces.map((piece) => piece.left + piece.crop.width))
  const height = Math.max(...pieces.map((piece) => piece.top + piece.crop.height))
  if (Math.max(width, height) > largestPicture) {
    const limit = largestPicture.toLocaleString("en-US")
    problems.push(`At ${scale}x it's over ${limit} pixels wide or tall, too big to copy. Select less, or export it.`)
    return { width: 0, height: 0, pieces: [], problems }
  }
  return { width, height, pieces, problems }
}
