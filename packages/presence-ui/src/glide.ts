/** Where a pointer is, in the layer it's drawn in. */
export interface Point {
  x: number
  y: number
}

/** The easing a pointer glides back with: quick to leave, slow to arrive. */
export const glideEasing = "cubic-bezier(0.22, 1, 0.36, 1)"

/** How long a pointer takes to glide back after being off the canvas: longer for further, from 280ms to 720ms. */
export function glideMs(distance: number): number {
  return Math.round(Math.min(Math.max(distance * 1.8, 280), 720))
}

/** What a pointer knew before its newest position: where it was, whether it was off the canvas, and when a glide ends. */
export interface PointerTrack {
  last?: Point
  wasOff?: boolean
  /** When the glide back ends, on the `now` clock; 0 when it isn't gliding. */
  glideEnds: number
}

export interface PointerStep {
  at: Point
  offCanvas?: boolean
  now: number
  /** How far apart positions arrive, which is how long each step takes. */
  stepMs: number
  /** Whether the person asked for less motion: it then jumps back instead of gliding. */
  reduced?: boolean
}

/** How a pointer moves to its newest position, and what it knows after. */
export interface PointerMove {
  /** The CSS transition to its newest position. */
  transition: string
  track: PointerTrack
}

/**
 * How a pointer moves to its newest position, as a CSS transition, and what it knows after. Its first position is
 * placed at once. Coming back onto the canvas, it glides from where it was left, for longer the further it is, and
 * positions that arrive during the glide finish it rather than restart it. Otherwise it moves in a straight line in the
 * time positions take to arrive, and fades as it goes off the canvas.
 */
export function pointerMove(track: PointerTrack, step: PointerStep): PointerMove {
  const { at, offCanvas = false, now, stepMs, reduced = false } = step
  const from = track.last
  let { glideEnds } = track

  if (from && track.wasOff && !offCanvas) {
    glideEnds = reduced ? 0 : now + glideMs(Math.hypot(at.x - from.x, at.y - from.y))
  }

  const gliding = glideEnds - now
  let transition: string

  if (!from) {
    transition = "none"
  } else if (gliding > 0) {
    transition = `transform ${Math.round(gliding)}ms ${glideEasing}, opacity 200ms ease-out`
  } else if (reduced && track.wasOff && !offCanvas) {
    transition = "opacity 200ms ease-out"
  } else {
    transition = `transform ${stepMs}ms linear, opacity 400ms ease-out`
  }

  return { transition, track: { last: at, wasOff: offCanvas, glideEnds: gliding > 0 ? glideEnds : 0 } }
}
