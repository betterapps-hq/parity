/**
 * When the canvas's zoom has settled, for what waits for a zoom to end: the zoom styles every frame inherits, and boards
 * taking the size their gutters give at the new zoom. It has to hold for some animation frames and for a moment, both.
 * tldraw's own camera state goes by a timeout counted in frame time, so a frame slower than its timeout counts as the
 * camera stopping, and on a busy machine a zoom stopped on almost every frame (PAR-655). Counting frames alone, a quick
 * frame rate would end a zoom between a mouse wheel's notches.
 */
export const zoomSettle = { frames: 3, ms: 150 } as const

/** A zoom and how long it's held: since when, in milliseconds, and for how many animation frames after that. */
export interface ZoomHeld {
  zoom: number
  since: number
  frames: number
}

/** The zoom when it's first seen, or changes, at `now`. */
export function zoomHeldFrom(zoom: number, now: number): ZoomHeld {
  return { zoom, since: now, frames: 0 }
}

/** The zoom after an animation frame at `now`: held one frame longer, or started again if it changed. */
export function holdZoom(held: ZoomHeld, zoom: number, now: number): ZoomHeld {
  return zoom === held.zoom ? { ...held, frames: held.frames + 1 } : zoomHeldFrom(zoom, now)
}

/** Whether the zoom has held long enough, in frames and in time, to count as settled at `now`. */
export function zoomSettled(held: ZoomHeld, now: number): boolean {
  return held.frames >= zoomSettle.frames && now - held.since >= zoomSettle.ms
}
