/** Where a pointer is, in the layer it's drawn in. */
export interface Point {
  x: number
  y: number
}

/** The easing a pointer glides back with: quick to leave, slow to arrive, as CSS writes it. */
export const glideEasing = "cubic-bezier(0.22, 1, 0.36, 1)"

/** How long a pointer takes to glide back after being off the canvas: longer for further, from 280ms to 720ms. */
export function glideMs(distance: number): number {
  return Math.round(Math.min(Math.max(distance * 1.8, 280), 720))
}

/** `glideEasing` at `share` of the way through the glide, worked out as CSS does, for drawing a frame at a time. */
export function glideEase(share: number): number {
  if (share <= 0) {
    return 0
  }

  if (share >= 1) {
    return 1
  }

  // The curve's control points, and a bezier's coordinate at `s`.
  const [x1, y1, x2, y2] = [0.22, 1, 0.36, 1]
  const along = (s: number, a: number, b: number) => 3 * a * s * (1 - s) ** 2 + 3 * b * s * s * (1 - s) + s ** 3
  // x rises with s, so halving finds the s whose x is `share`.
  let low = 0
  let high = 1

  for (let step = 0; step < 24; step++) {
    const middle = (low + high) / 2

    if (along(middle, x1, x2) < share) {
      low = middle
    } else {
      high = middle
    }
  }

  return along((low + high) / 2, y1, y2)
}

/** What a pointer knew on its last frame: where it was drawn, whether it was off the canvas, and a glide back. */
export interface PointerTrack {
  shown?: Point
  wasOff?: boolean
  /** The glide back onto the canvas: from where it was left, starting at `start` on the `now` clock, taking `ms`. */
  glide?: { from: Point; start: number; ms: number }
}

export interface PointerStep {
  /** Where their pointer is to be drawn on this frame, from the positions they sent (`PointerTrail`). */
  at: Point
  offCanvas?: boolean
  now: number
  /** Whether the person asked for less motion: it then jumps back instead of gliding. */
  reduced?: boolean
}

/** Where a pointer is drawn on a frame, and what it knows after. */
export interface PointerFrame {
  at: Point
  track: PointerTrack
  /** Whether it's gliding back, so it needs more frames. */
  gliding: boolean
}

/**
 * Where a pointer is drawn on a frame, and what it knows after. It follows where their positions say it is, frame by
 * frame. Coming back onto the canvas, it glides from where it was left to where they are, for longer the further it is,
 * following them as they move during the glide; with reduced motion it jumps there instead. Off the canvas it stays
 * where they left it.
 */
export function pointerFrame(track: PointerTrack, step: PointerStep): PointerFrame {
  const { at, offCanvas = false, now, reduced = false } = step
  const from = track.shown
  let { glide } = track

  if (from && track.wasOff && !offCanvas && !reduced) {
    glide = { from, start: now, ms: glideMs(Math.hypot(at.x - from.x, at.y - from.y)) }
  }

  if (offCanvas || (glide && now >= glide.start + glide.ms)) {
    glide = undefined
  }

  let shown = at

  if (glide) {
    const eased = glideEase((now - glide.start) / glide.ms)
    shown = { x: glide.from.x + (at.x - glide.from.x) * eased, y: glide.from.y + (at.y - glide.from.y) * eased }
  }

  const next: PointerTrack = { shown, wasOff: offCanvas }

  if (glide) {
    next.glide = glide
  }

  return { at: shown, track: next, gliding: glide !== undefined }
}
