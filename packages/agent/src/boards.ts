import { boardSize, type ContainerSpec, type ModeSettings, shownModes } from "@parity-app/core"
import type { Warning } from "./warnings.ts"

/** A design's board on the canvas. */
export interface Board {
  /** The design key, `path#id`. */
  key: string
  id: string
  name: string
  x: number
  y: number
  width: number
  height: number
  /** Not drawn yet, so its size is a guess. */
  estimated: boolean
}

/**
 * Two boards too close, from the whole canvas. Without `titleOnly` the boards themselves collide; with it they're
 * clear, but the lower one's title, drawn in the band above it, covers the upper one. `width` and `height` are the
 * shared area, title band included. `estimated` means one of them isn't drawn yet, so its size is a guess from its
 * frames; without it both sizes are as the canvas last drew them.
 */
export interface Overlap {
  designs: [string, string]
  names: [string, string]
  width: number
  height: number
  titleOnly?: true
  estimated?: true
}

export interface SpaceOptions {
  width: number
  height: number
  direction?: "right" | "below"
  padding?: number
  near?: string
}

/** Room above a board for its title, which the canvas draws at screen size: enough down to about 25% zoom. */
export const titleBand = 160

/**
 * Every design's board: where its position puts it, as big as it was last drawn. Designs not yet drawn get an
 * estimate from their frames' sizes, laid out as the canvas lays them out (see boardSize).
 */
export function canvasBoards(
  designs: readonly { path: string; container: ContainerSpec }[],
  bounds: Record<string, { width: number; height: number }>,
  modes: ModeSettings
): Board[] {
  return designs.map(({ path, container }) => {
    const key = `${path}#${container.id}`
    const drawn = bounds[key]
    const size = drawn ?? estimateSize(container, modes)

    return {
      key,
      id: container.id,
      name: container.name,
      x: container.position.x,
      y: container.position.y,
      width: Math.round(size.width),
      height: Math.round(size.height),
      estimated: !drawn
    }
  })
}

/**
 * Boards that overlap, each pair once; only those involving the design with id `only` when it's given. A board's
 * title, drawn above it at screen size, counts as part of it, so a board just below another overlaps it by its title.
 */
export function boardOverlaps(boards: readonly Board[], only?: string): Overlap[] {
  const found: Overlap[] = []

  for (const [index, a] of boards.entries()) {
    for (const b of boards.slice(index + 1)) {
      if (only !== undefined && a.id !== only && b.id !== only) {
        continue
      }

      const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
      const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y - titleBand, b.y - titleBand)

      if (width <= 0 || height <= 0) {
        continue
      }

      const collide = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 0
      const overlap: Overlap = { designs: [a.id, b.id], names: [a.name, b.name], width, height }

      if (!collide) {
        overlap.titleOnly = true
      }

      if (a.estimated || b.estimated) {
        overlap.estimated = true
      }

      found.push(overlap)
    }
  }

  return found
}

/**
 * Warnings for boards a call created, changed or moved (`touched`, by design key) that now collide with another or sit
 * inside its title's band, and a note when the canvas has others the call didn't touch, so a call that moved nothing
 * doesn't read as a clean canvas.
 */
export function overlapWarnings(boards: readonly Board[], touched: ReadonlySet<string>): Warning[] {
  const ids = new Set(boards.flatMap((board) => (touched.has(board.key) ? [board.id] : [])))
  const drawn = new Map(boards.map((board) => [board.id, !board.estimated]))
  const found = boardOverlaps(boards)
  const near = found.filter(({ designs }) => designs.some((id) => ids.has(id)))

  const warnings: Warning[] = near.map(({ designs, names, width, height, titleOnly }) => {
    // SAFETY: an overlap names a pair of designs, so mapping them gives two labels.
    const [a, b] = designs.map((id, index) => `${names[index]} (${id})`) as [string, string]
    const guessed = names.filter((_, index) => !drawn.get(designs[index]))

    const size =
      guessed.length === 0
        ? "measured"
        : `estimated, as ${guessed.join(" and ")} ${guessed.length === 1 ? "isn't" : "aren't"} drawn yet`

    if (titleOnly) {
      return {
        category: "title_clearance" as const,
        message: `The title of ${b} would cover ${a}: the boards are clear, but ${names[1]} starts less than ${titleBand} below it (${width}x${height} shared, ${size}). Move ${names[1]} down or aside with UpdateDesign(id, { x, y }); Overlaps() checks every board.`
      }
    }

    return {
      category: "overlap" as const,
      message: `${a} and ${b} overlap by ${width}x${height} (${size}). Move one clear with UpdateDesign(id, { x, y }), leaving ${titleBand} above each board for its title; FindEmptySpace finds space and Overlaps() checks every board.`
    }
  })

  const others = found.length - near.length

  if (others > 0) {
    const what =
      others === 1
        ? "1 other pair of boards overlaps or crowds a title"
        : `${others} other pairs of boards overlap or crowd a title`

    warnings.push({
      category: "canvas_overlaps",
      message: `${what} on the canvas. This call didn't create, change or move them, so they aren't listed here; Overlaps() lists every one.`
    })
  }

  return warnings
}

/** A point on the canvas, in canvas units. */
export interface CanvasPoint {
  x: number
  y: number
}

/**
 * Where a board of the given size fits clear of the others: right of or below them all, or of the boards level with
 * `anchor` (the board `options.near` names) when there is one, `padding` away.
 */
export function emptySpace(boards: readonly Board[], options: Omit<SpaceOptions, "near">, anchor?: Board): CanvasPoint {
  const padding = options.padding ?? 240

  if (boards.length === 0) {
    return { x: 0, y: 0 }
  }

  const direction = options.direction ?? "right"

  if (anchor) {
    if (direction === "below") {
      return {
        x: anchor.x,
        y:
          Math.max(
            ...boards.flatMap((box) => (spans(box.x, box.width, anchor.x, options.width) ? [box.y + box.height] : []))
          ) + padding
      }
    }

    return {
      x:
        Math.max(
          ...boards.flatMap((box) => (spans(box.y, box.height, anchor.y, options.height) ? [box.x + box.width] : []))
        ) + padding,
      y: anchor.y
    }
  }

  if (direction === "below") {
    return {
      x: Math.min(...boards.map((box) => box.x)),
      y: Math.max(...boards.map((box) => box.y + box.height)) + padding
    }
  }

  return {
    x: Math.max(...boards.map((box) => box.x + box.width)) + padding,
    y: Math.min(...boards.map((box) => box.y))
  }
}

/** The size of a board the canvas hasn't drawn: its shown frames, laid out as the canvas lays them out. */
export function estimateSize(container: ContainerSpec, modes: ModeSettings): { width: number; height: number } {
  const { main, beside } = shownModes(modes, container)

  return boardSize(container, [main, ...beside])
}

/** Whether two spans along one axis share any length. */
function spans(start: number, size: number, otherStart: number, otherSize: number): boolean {
  return start < otherStart + otherSize && otherStart < start + size
}
