/*
 * Position's Placement, its insets from the pin box, and Layer order: what they store and write. A pinned side is an
 * inset; an unpinned one is `auto` and writes nothing. Center writes `left: d; right: -d` with auto margins, as the
 * panel spec's presets table says; Fill parent is `inset-0`. Each side writes as sides-writes.ts writes any side, in
 * css-values.ts's forms; where Plans is drawn takes the project's spacing tokens, so a token inset lands where it says.
 */
import { type Side, type Sides, sideClass, sideCss, sideNumber, sideStored, sidesWrites } from "./sides-writes.ts"
import type { LengthToken } from "./tokens.ts"
import type { StoredObject, Writes } from "./writes.ts"

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

/** An inset in pixels: its own, its spacing token's, or a percentage of the parent's width or height. */
export function insetPixels(side: Side, of: number, tokens: readonly LengthToken[]): number | undefined {
  if (side === undefined || side === "auto") {
    return undefined
  }

  if ("percent" in side) {
    return (side.percent / 100) * of
  }

  return sideNumber(side, tokens)
}

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

function axis(
  [start, end]: [Side, Side],
  center: number | undefined,
  { of, size, flow }: { of: number; size: number; flow: number },
  tokens: readonly LengthToken[]
) {
  if (center !== undefined) {
    return { at: (of - size) / 2 + center, size }
  }

  const from = insetPixels(start, of, tokens)
  const to = insetPixels(end, of, tokens)

  if (from !== undefined && to !== undefined) {
    return { at: from, size: Math.max(0, of - from - to) }
  }

  if (from !== undefined) {
    return { at: from, size }
  }

  if (to !== undefined) {
    return { at: of - to - size, size }
  }

  return { at: flow, size }
}

/**
 * Where Plans is drawn in Pricing: by its insets when Absolute or Fixed, stretching between two pinned sides; moved
 * from its place in the flow by them when Relative; in the flow otherwise, Sticky included until it's scrolled. A
 * token inset is as long as the project's token says (`tokens`, its spacing tokens).
 */
export function placed(position: Position, tokens: readonly LengthToken[]): Rect {
  const [top, right, bottom, left] = position.insets

  if (position.placement === "absolute" || position.placement === "fixed") {
    const across = axis(
      [left, right],
      position.centerX,
      { of: parent.width, size: layerSize.width, flow: inFlow.x },
      tokens
    )

    const down = axis(
      [top, bottom],
      position.centerY,
      { of: parent.height, size: layerSize.height, flow: inFlow.y },
      tokens
    )

    return { x: across.at, y: down.at, width: across.size, height: down.size }
  }

  if (position.placement === "relative") {
    const inset = (side: Side, of: number) => insetPixels(side, of, tokens)
    const dx = inset(left, parent.width) ?? -(inset(right, parent.width) ?? 0)
    const dy = inset(top, parent.height) ?? -(inset(bottom, parent.height) ?? 0)

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
  if (position.placement === "static") {
    return { stored: undefined, css: [], tailwind: [] }
  }

  const sides: Sides = [...position.insets]

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
  const stored: StoredObject = { position: { keyword: position.placement } }

  if (insets.stored !== undefined) {
    stored.inset = insets.stored
  }

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
  if (value === undefined || value === "auto") {
    return { stored: undefined, css: [], tailwind: [] }
  }

  const css = [`z-index: ${sideCss("layer", value)}`]
  const tailwind = [sideClass("layer", "z", value)]

  if (needsPosition) {
    css.unshift("position: relative")
    tailwind.unshift("relative")
  }

  return { stored: sideStored("layer", value), css, tailwind }
}
