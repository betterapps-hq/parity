/*
 * How picking something up, carrying it and dropping it moves on the canvas: a layer, a board or a sticker, the same
 * whoever drags it. When someone else in the room drags, their preview moves the same way and adds their outline and
 * name. Every timing and look here is the one place they're set: the stories (`Parity/Canvas/Dragging`), the design
 * parts (`DragLift`, `DragPicture`, `LandingSpot`) and the canvas's own drags (`layer-drag.ts`, `element-lift.ts`,
 * `carried.ts`) all read them.
 *
 * - Picking up: what's picked up grows 3% and lifts onto a shadow, in 120 ms (`DragLift`).
 * - Carrying: it follows the pointer exactly. From a layout, a picture of it is carried (`DragPicture`) while a faded
 *   copy shows where it would land (`LandingSpot`), and the layout makes room as it will: what's around it slides
 *   aside, and back when the copy moves on, in 180 ms (`make-room.ts`).
 * - Dropping: the picture flies from the pointer into its landing spot and settles, in 180 ms.
 * - Cancelling, with Esc: it flies back to where it was, a little slower, in 260 ms, so it reads as going back.
 * - With reduced motion, nothing grows or flies: what's picked up keeps its shadow, and lands or goes back at once.
 */

/** Where a drag is: being carried, flying into where it lands, or flying back to where it was. */
export type DragPhase = "carrying" | "dropping" | "cancelling"

/** How long picking something up takes. */
export const liftMs = 120

/** How long a dropped picture takes to fly into its landing spot, and anything dropped takes to settle. */
export const dropMs = 180

/** How long a cancelled drag takes to fly back to where it was. */
export const cancelMs = 260

/** How long what's around a carried layer takes to slide aside, or back, as its copy moves. */
export const makeRoomMs = 180

/** How lifted things settle: quick to start, gentle to land. */
export const settle = "cubic-bezier(0.2, 0, 0, 1)"

/** How much bigger what's picked up grows. */
export const liftScale = 1.03

/** The shadow what's picked up lifts onto, two layers that follow its shape. */
export const liftShadow = "drop-shadow(0 12px 16px rgb(0 0 0 / 0.18)) drop-shadow(0 2px 4px rgb(0 0 0 / 0.12))"

/** The same shadow at rest, with nothing to see, so the two blend into each other. */
export const restShadow = "drop-shadow(0 0 0 rgb(0 0 0 / 0)) drop-shadow(0 0 0 rgb(0 0 0 / 0))"

/** How faded the copy that shows where something would land is. */
export const landingOpacity = 0.55

/** The dashed edge around that copy: its width, and the gap between it and the copy, in pixels. */
export const landingEdge = { width: 1.5, gap: 1 }

/**
 * The copy that shows where something would land, as inline styles for an element of the canvas's own, which React
 * doesn't draw: faded, with a dashed outline in `color` that follows its corners, as far out as `LandingSpot`'s edge.
 */
export function landingLook(color: string): Record<"opacity" | "outline" | "outline-offset", string> {
  return {
    opacity: String(landingOpacity),
    outline: `${landingEdge.width}px dashed ${color}`,
    "outline-offset": `${landingEdge.gap}px`
  }
}

/** How long a phase of a drag that's let go takes: flying in or back, or nothing with reduced motion. */
export function flightMs(phase: Exclude<DragPhase, "carrying">, reduced: boolean): number {
  if (reduced) {
    return 0
  }

  return phase === "dropping" ? dropMs : cancelMs
}

/** How something picked up, or put down, is drawn: its scale and shadow, and how it gets there. */
export interface Lift {
  scale: string
  filter: string
  transition: string
}

/**
 * How something is drawn picked up (`up`) or put down, from how it's drawn of its own (`scale` and `filter`, as computed,
 * or nothing). Picked up, it grows by `liftScale` and lifts onto `liftShadow` in `liftMs`; put down, it settles back in
 * `ms`. With reduced motion it keeps its size and gets its shadow at once.
 */
export function lift(
  up: boolean,
  {
    reduced,
    ms = dropMs,
    scale = "none",
    filter = "none"
  }: { reduced: boolean; ms?: number; scale?: string; filter?: string }
): Lift {
  const own = filter === "none" ? "" : `${filter} `
  const grown = up && !reduced ? scaled(scale, liftScale) : undefined
  const took = up ? liftMs : ms

  return {
    scale: grown ?? scale,
    filter: `${own}${up ? liftShadow : restShadow}`,
    transition: reduced ? "none" : `scale ${took}ms ${settle}, filter ${took}ms ${settle}`
  }
}

/**
 * A computed `scale` grown by `factor`: `none`, or one, two or three numbers. Nothing when it's something else, so it's
 * left as it is.
 */
export function scaled(scale: string, factor: number): string | undefined {
  if (scale === "none") {
    return String(factor)
  }

  const parts = scale.trim().split(/\s+/).map(Number)

  if (parts.length > 3 || parts.some((part) => !Number.isFinite(part))) {
    return undefined
  }

  // A third number is along z, which doesn't grow.
  return parts.map((part, index) => (index < 2 ? round(part * factor) : part)).join(" ")
}

/**
 * A computed `translate` moved by `by`, in pixels: `none`, or one, two or three lengths. Nothing when it's something
 * else, so it's left where it is.
 */
export function translated(translate: string, by: { x: number; y: number }): string | undefined {
  const parts = translate === "none" ? [] : translate.trim().split(/\s+/)

  if (parts.length > 3 || parts.some((part) => !part.endsWith("px") || !Number.isFinite(parseFloat(part)))) {
    return undefined
  }

  const [x = "0px", y = "0px", z] = parts
  const moved = [`${round(parseFloat(x) + by.x)}px`, `${round(parseFloat(y) + by.y)}px`]

  return (z ? [...moved, z] : moved).join(" ")
}

const round = (value: number) => Math.round(value * 1000) / 1000
