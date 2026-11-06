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

/** Characters no file name may hold on Windows, macOS or Linux. Control characters are dropped too. */
const unsafe = /[<>:"/\\|?*]/g

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
  const safe = [...name]
    .map((character) => (character.charCodeAt(0) < 32 ? " " : character))
    .join("")
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
