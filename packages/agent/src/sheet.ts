/**
 * A contact sheet: one picture of a design in every state and mode a screenshot drew, labeled, so an agent looks at one
 * image rather than one per frame (PAR-895). Rows are states and columns are modes, in the order they were drawn. This
 * module lays the sheet out and draws its labels as SVG; a host that can read and write pictures puts the frames in.
 */

/** One frame to place: which state and mode, by id and name, and its picture's size in pixels. */
export interface SheetInput {
  state: { id: string; name: string }
  mode: { id: string; name: string }
  width: number
  height: number
}

/** Where a frame went on the sheet, in the sheet's pixels, with the input's index to find its picture by. */
export interface SheetFrame {
  index: number
  state: string
  mode: string
  x: number
  y: number
  width: number
  height: number
}

export interface SheetLayout {
  width: number
  height: number
  /** How much each frame was shrunk to fit the sheet within `sheetLimit`: 1 when it wasn't. */
  fit: number
  frames: SheetFrame[]
  /** The background, labels and frame borders, the sheet's size, for the frames to go over. */
  overlay: string
}

/**
 * The longest side a sheet can have. Models scale larger images down before they see them (Claude to about 1,568
 * pixels), and some clients refuse images over 2,000 pixels once a conversation holds many, so a bigger sheet only
 * costs bytes. A frame shrunk this far is still worth a screenshot of its own for detail.
 */
export const sheetLimit = 2000

const padding = 24
const gap = 24
const titleSize = 18
const labelSize = 14
const titleBand = 40
const labelBand = 26

/** A label never makes a column wider than this; a longer one is cut short. */
const widestLabel = 200
const background = "#f4f4f5"
const ink = "#18181b"
const muted = "#52525b"
const border = "#d4d4d8"
const font = "Segoe UI, Helvetica, Arial, sans-serif"

/** Lays out a design's frames as one sheet, titled with the design's name. */
export function sheetLayout(title: string, inputs: readonly SheetInput[]): SheetLayout {
  const states = unique(inputs.map((input) => input.state))
  const modes = unique(inputs.map((input) => input.mode))
  let fit = 1
  let layout = place(title, inputs, states, modes, fit)

  // Labels keep their size as frames shrink, so shrinking once can leave a sheet a little over; a few rounds settle it.
  for (let round = 0; round < 8 && Math.max(layout.width, layout.height) > sheetLimit; round++) {
    const fixed = place(title, inputs, states, modes, 0)

    const ratio = Math.min(
      ratioFor(sheetLimit, fixed.width, layout.width),
      ratioFor(sheetLimit, fixed.height, layout.height)
    )

    fit = Math.max(0.01, fit * ratio)
    layout = place(title, inputs, states, modes, fit)
  }

  return { ...layout, fit }
}

/** How much the frames' share of a length must shrink for the whole length to fit. */
function ratioFor(limit: number, fixed: number, length: number): number {
  if (length <= limit) {
    return 1
  }

  return Math.max(0.01, (limit - fixed) / Math.max(1, length - fixed)) * 0.999
}

function place(
  title: string,
  inputs: readonly SheetInput[],
  states: readonly { id: string; name: string }[],
  modes: readonly { id: string; name: string }[],
  fit: number
): Omit<SheetLayout, "fit"> {
  const size = (length: number) => (fit === 0 ? 0 : Math.max(1, Math.round(length * fit)))

  const columns = modes.map((mode) => {
    const widest = Math.max(0, ...inputs.flatMap((input) => (input.mode.id === mode.id ? [size(input.width)] : [])))

    return Math.max(widest, Math.min(textWidth(mode.name, labelSize), widestLabel))
  })

  const rows = states.map((state) =>
    Math.max(0, ...inputs.flatMap((input) => (input.state.id === state.id ? [size(input.height)] : [])))
  )

  const columnX: number[] = []
  let x = padding

  for (const width of columns) {
    columnX.push(x)
    x += width + gap
  }

  const gridWidth = columns.reduce((total, width) => total + width, 0) + gap * Math.max(0, columns.length - 1)
  const width = Math.ceil(padding * 2 + Math.max(gridWidth, Math.min(textWidth(title, titleSize), widestLabel * 2)))

  const rowY: number[] = []
  let y = padding + titleBand + labelBand

  for (const height of rows) {
    rowY.push(y + labelBand)
    y += labelBand + height + gap
  }

  const height = Math.ceil(y - gap + padding)

  const frames = inputs.map((input, index) => {
    const column = modes.findIndex((mode) => mode.id === input.mode.id)
    const row = states.findIndex((state) => state.id === input.state.id)

    return {
      index,
      state: input.state.id,
      mode: input.mode.id,
      x: columnX[column]!,
      y: rowY[row]!,
      width: size(input.width),
      height: size(input.height)
    }
  })

  const labels = [
    textElement(clip(title, width - padding * 2, titleSize), padding, padding + titleSize, titleSize, ink, 600),
    ...modes.map((mode, column) =>
      textElement(
        clip(mode.name, columns[column]!, labelSize),
        columnX[column]!,
        padding + titleBand + labelSize,
        labelSize,
        muted,
        500
      )
    ),
    ...states.map((state, row) =>
      textElement(
        clip(state.name, width - padding * 2, labelSize),
        padding,
        rowY[row]! - labelBand + labelSize + 4,
        labelSize,
        ink,
        600
      )
    )
  ]

  const borders = frames.map(
    (frame) =>
      `<rect x="${frame.x - 0.5}" y="${frame.y - 0.5}" width="${frame.width + 1}" height="${frame.height + 1}" ` +
      `fill="#ffffff" stroke="${border}"/>`
  )

  const overlay =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<rect width="${width}" height="${height}" fill="${background}"/>${borders.join("")}${labels.join("")}</svg>`

  return { width, height, frames, overlay }
}

function unique(items: readonly { id: string; name: string }[]): { id: string; name: string }[] {
  const seen = new Map<string, { id: string; name: string }>()

  for (const item of items) {
    if (!seen.has(item.id)) {
      seen.set(item.id, item)
    }
  }

  return [...seen.values()]
}

/** About how wide text is set at a size: wide enough for most interface fonts, so a label isn't cut when it fits. */
function textWidth(text: string, size: number): number {
  return Math.ceil(characters(text).length * size * 0.6)
}

/** Text cut short with an ellipsis to fit a width, or as it was when it fits. */
export function clip(text: string, width: number, size: number): string {
  const letters = characters(text)
  const most = Math.max(1, Math.floor(width / (size * 0.6)))

  return letters.length <= most ? text : `${letters.slice(0, Math.max(1, most - 1)).join("")}…`
}

/** Text as the characters a reader sees, so an emoji or an accented letter is never cut in two. */
function characters(text: string): string[] {
  return Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text), ({ segment }) => segment)
}

function textElement(text: string, x: number, y: number, size: number, color: string, weight: number): string {
  return (
    `<text x="${x}" y="${y}" font-family="${font}" font-size="${size}" font-weight="${weight}" fill="${color}">` +
    `${escapeXml(text)}</text>`
  )
}

function escapeXml(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;")
}
