/*
 * Position's Placement, its insets from the pin box, and Layer order: what they store and write. A pinned side is an
 * inset; an unpinned one is `auto` and writes nothing. Center writes `left: d; right: -d` with auto margins, as the
 * panel spec's presets table says; Fill parent is `inset-0`.
 */
import {
  type Side,
  type Sides,
  sideClass,
  sideCss,
  sideNumber,
  sideRules,
  sideStored,
  sidesWrites
} from "./sides-writes.ts"
import type { Writes } from "./writes.ts"

/** In layout (static), Absolute, Fixed, Sticky, or Relative from More. */
export type Placement = "static" | "absolute" | "fixed" | "sticky" | "relative"

export interface Position {
  placement: Placement
  /** Each side from the top, clockwise; an unpinned side is undefined, `auto`. */
  insets: Sides
  /** Centered across, with its offset from the center in pixels, as Figma's Center keeps one. */
  centerX?: number
  /** Centered down, with its offset from the center. */
  centerY?: number
  /** Whether the layer hugs its content on each axis, which Center needs `w-fit` or `h-fit` for. */
  hugs?: { width: boolean; height: boolean }
}

/** Pricing, the parent the preview places Plans in, and Plans' own size and place in the flow. */
export const parent = { width: 320, height: 200 }
export const layerSize = { width: 120, height: 64 }
export const inFlow = { x: 24, y: 24 }

/** An inset in pixels: its own, its token's, or a percentage of the parent's width or height. */
export function insetPixels(side: Side, of: number): number | undefined {
  if (side === undefined || side === "auto") return undefined
  if ("percent" in side) return (side.percent / 100) * of
  return sideNumber(side, sideRules.inset)
}

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

function axis(
  start: Side,
  end: Side,
  center: number | undefined,
  of: number,
  size: number,
  flow: number
): { at: number; size: number } {
  if (center !== undefined) return { at: (of - size) / 2 + center, size }
  const from = insetPixels(start, of)
  const to = insetPixels(end, of)
  if (from !== undefined && to !== undefined) return { at: from, size: Math.max(0, of - from - to) }
  if (from !== undefined) return { at: from, size }
  if (to !== undefined) return { at: of - to - size, size }
  return { at: flow, size }
}

/**
 * Where Plans is drawn in Pricing: by its insets when Absolute or Fixed, stretching between two pinned sides; moved
 * from its place in the flow by them when Relative; in the flow otherwise, Sticky included until it's scrolled.
 */
export function placed(position: Position): Rect {
  const [top, right, bottom, left] = position.insets
  if (position.placement === "absolute" || position.placement === "fixed") {
    const across = axis(left, right, position.centerX, parent.width, layerSize.width, inFlow.x)
    const down = axis(top, bottom, position.centerY, parent.height, layerSize.height, inFlow.y)
    return { x: across.at, y: down.at, width: across.size, height: down.size }
  }
  if (position.placement === "relative") {
    const dx = insetPixels(left, parent.width) ?? -(insetPixels(right, parent.width) ?? 0)
    const dy = insetPixels(top, parent.height) ?? -(insetPixels(bottom, parent.height) ?? 0)
    return { x: inFlow.x + dx, y: inFlow.y + dy, ...layerSize }
  }
  return { ...inFlow, ...layerSize }
}

/** How far each side of Plans is from Pricing's, from the top, clockwise. */
export function distances(rect: Rect): [number, number, number, number] {
  return [
    Math.round(rect.y),
    Math.round(parent.width - rect.x - rect.width),
    Math.round(parent.height - rect.y - rect.height),
    Math.round(rect.x)
  ]
}

/** Placement, the insets and Center's auto margins. In layout writes nothing. */
export function positionWrites(position: Position): Writes {
  if (position.placement === "static") return { stored: undefined, css: [], tailwind: [] }
  const sides = [...position.insets] as Sides
  if (position.centerX !== undefined) {
    sides[3] = { number: position.centerX }
    sides[1] = { number: -position.centerX }
  }
  if (position.centerY !== undefined) {
    sides[0] = { number: position.centerY }
    sides[2] = { number: -position.centerY }
  }
  const insets = sidesWrites("inset", sides)
  const css = [`position: ${position.placement}`, ...insets.css]
  const tailwind = [position.placement, ...insets.tailwind]
  const stored: Record<string, unknown> = { position: { keyword: position.placement } }
  if (insets.stored !== undefined) stored.inset = insets.stored
  if (position.centerX !== undefined) {
    stored.marginInline = { keyword: "auto" }
    css.push("margin-inline: auto")
    tailwind.push("mx-auto")
    // An auto width between two insets stretches, so a layer that hugs needs fit-content to center.
    if (position.hugs?.width) {
      stored.width = { mode: "hug" }
      css.push("width: fit-content")
      tailwind.push("w-fit")
    }
  }
  if (position.centerY !== undefined) {
    stored.marginBlock = { keyword: "auto" }
    css.push("margin-block: auto")
    tailwind.push("my-auto")
    if (position.hugs?.height) {
      stored.height = { mode: "hug" }
      css.push("height: fit-content")
      tailwind.push("h-fit")
    }
  }
  return { stored, css, tailwind }
}

/**
 * Layer order: `z-10`, `-z-5`, a token as `z-(--z-overlay)`. In a flex or grid layout it needs nothing more; a child
 * of a Block layout that's In layout gets `position: relative`, which `z-index` needs there.
 */
export function layerOrderWrites(value: Side, needsPosition = false): Writes {
  if (value === undefined || value === "auto") return { stored: undefined, css: [], tailwind: [] }
  const css = [`z-index: ${sideCss("layer", value)}`]
  const tailwind = [sideClass("layer", "z", value)]
  if (needsPosition) {
    css.unshift("position: relative")
    tailwind.unshift("relative")
  }
  return { stored: sideStored("layer", value), css, tailwind }
}
