/** How the agent's cursor moves: eased, slightly curved travel, then small glances around what it's looking at. */

export interface Point {
  x: number
  y: number
}

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

/** Slow to start and to settle, like a hand on a mouse. */
export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
}

/** How long travelling between two points takes: farther is longer, though not in proportion. */
export function travelMs(from: Point, to: Point): number {
  const distance = Math.hypot(to.x - from.x, to.y - from.y)
  return Math.min(2200, 700 + 240 * Math.log2(1 + distance / 40))
}

/**
 * How much faster to play when calls pile up: full speed for a few waiting steps, down to about a third for a long
 * backlog, so the cursor never falls far behind the agent.
 */
export function paceFor(waiting: number): number {
  return waiting <= 2 ? 1 : Math.max(0.35, 1 - (waiting - 2) * 0.08)
}

/**
 * A point along a gentle arc from `from` to `to`. `bend` is how far the arc bows out, as a share of the distance,
 * to one side or the other by its sign: people rarely move a mouse in a straight line.
 */
export function arcPoint(from: Point, to: Point, t: number, bend: number): Point {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const control = { x: from.x + dx / 2 - dy * bend, y: from.y + dy / 2 + dx * bend }
  const u = 1 - t
  return {
    x: u * u * from.x + 2 * u * t * control.x + t * t * to.x,
    y: u * u * from.y + 2 * u * t * control.y + t * t * to.y
  }
}

/**
 * Eases in and out, overshooting a touch before it settles, as a hand does when it lands on something. `overshoot`
 * 0 is plain ease in and out.
 */
export function easeInOutSettle(t: number, overshoot = 0.5): number {
  const s = overshoot * 1.525
  return t < 0.5 ? ((2 * t) ** 2 * ((s + 1) * 2 * t - s)) / 2 : ((2 * t - 2) ** 2 * ((s + 1) * (t * 2 - 2) + s) + 2) / 2
}

/**
 * A point along a curve from `from` to `to` with two bends, at a third and two thirds of the way, each bowing out
 * by its share of the distance. Bends of the same sign make an arc; opposite signs make an S.
 */
export function curvePoint(from: Point, to: Point, t: number, bendA: number, bendB: number): Point {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const a = { x: from.x + dx / 3 - dy * bendA, y: from.y + dy / 3 + dx * bendA }
  const b = { x: from.x + (dx * 2) / 3 - dy * bendB, y: from.y + (dy * 2) / 3 + dx * bendB }
  const u = 1 - t
  return {
    x: u ** 3 * from.x + 3 * u * u * t * a.x + 3 * u * t * t * b.x + t ** 3 * to.x,
    y: u ** 3 * from.y + 3 * u * u * t * a.y + 3 * u * t * t * b.y + t ** 3 * to.y
  }
}

/**
 * A slow, looping drift around a resting point, at `seconds` into it: overlapping waves that never quite repeat,
 * swelling and easing like breath. `radius` is how far it strays at most.
 */
export function breathe(seconds: number, radius: number, seed = 0): Point {
  const swell = 0.7 + 0.3 * Math.sin(seconds * 0.45 + seed)
  return {
    x: radius * swell * (0.75 * Math.sin(seconds * 0.83 + seed) + 0.25 * Math.sin(seconds * 1.97 + seed * 2.1)),
    y: radius * swell * (0.7 * Math.sin(seconds * 1.13 + seed * 2.9) + 0.3 * Math.sin(seconds * 2.41 + seed * 1.3))
  }
}

/** Where the cursor points on a target, from its top left: its middle, or near the start of a large one. */
export function focusOffset(box: Box): Point {
  return { x: Math.min(box.w * 0.5, 120), y: Math.min(box.h * 0.5, 60) }
}

/**
 * A nearby spot to glance at while dwelling, from the target's top left: within a small radius of the focus that
 * grows with the target, and always inside it.
 */
export function glanceOffset(box: Box, random: () => number = Math.random): Point {
  const focus = focusOffset(box)
  const radius = Math.max(3, Math.min(Math.min(box.w, box.h) * 0.35, 44))
  const angle = random() * Math.PI * 2
  const distance = radius * Math.sqrt(random())
  const inset = Math.min(2, box.w / 2, box.h / 2)
  return {
    x: clamp(focus.x + Math.cos(angle) * distance, inset, box.w - inset),
    y: clamp(focus.y + Math.sin(angle) * distance, inset, box.h - inset)
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
