/**
 * When the canvas's selection overlay measures what it draws (PAR-522). Measuring reads the boxes of layers in frames,
 * so it runs only after something that can move them: the camera, the selection, the hover, a drag, a key, the design
 * or a frame's layout or DOM. Each of those wakes it, and it then measures every animation frame for `settleMs`, which
 * covers what follows a change by a frame or two, such as a design drawing after an edit. Past that, it keeps going only
 * while an animation runs in a frame it draws over. Measuring with nothing changed would find what it found last time.
 */

/** How long after a change the overlay goes on measuring every animation frame, in milliseconds. */
export const settleMs = 500

/** Which designs' frames the overlay draws over: the selected and hovered ones', or every frame's for the layout grid. */
export type OverlayDesigns = ReadonlySet<string> | "every"

/** The designs whose frames the overlay draws over, and so whose changes and animations it follows. */
export function overlayDesigns(at: { selected?: string; hovered?: string; layoutGrid: boolean }): OverlayDesigns {
  if (at.layoutGrid) {
    return "every"
  }

  const designs = new Set<string>()

  if (at.selected) {
    designs.add(at.selected)
  }

  if (at.hovered) {
    designs.add(at.hovered)
  }

  return designs
}

/** Whether a frame of `design` is one the overlay draws over. */
export function drawsOver(designs: OverlayDesigns, design: string | undefined): boolean {
  if (designs === "every") {
    return true
  }

  return design !== undefined && designs.has(design)
}

/** Until when the overlay measures every animation frame, after a change at `now`. A change never shortens it. */
export function settleUntil(now: number, until: number): number {
  return Math.max(until, now + settleMs)
}

/**
 * Whether the overlay measures again on the next animation frame: while it shows anything, until it has settled after
 * the last change, and after that while an animation runs in a frame it draws over. `animating` is asked only once it
 * has settled, since finding a frame's animations brings its styles up to date.
 */
export function measuresNext(at: { now: number; until: number; showing: boolean; animating: () => boolean }): boolean {
  if (!at.showing) {
    return false
  }

  return at.now < at.until || at.animating()
}

/** What in tldraw's store only moves the view: the camera, the pointer, and whether the camera is moving. */
const viewChanges: Record<string, ReadonlySet<string> | "any"> = {
  camera: "any",
  pointer: "any",
  instance: new Set(["cameraState"])
}

/**
 * Whether a change to tldraw's store only moves the view, which needn't wake measuring every frame (PAR-653): the camera,
 * which the overlay follows by measuring once in each frame it moves; the pointer, whose own events wake it for what the
 * pointer drives; and the camera starting or stopping. Each record updated comes with the fields that changed.
 */
export function movesOnlyTheView(change: {
  added: readonly string[]
  updated: readonly { type: string; fields: readonly string[] }[]
  removed: readonly string[]
}): boolean {
  if (change.added.length > 0 || change.removed.length > 0) {
    return false
  }

  return change.updated.every(({ type, fields }) => {
    const view = viewChanges[type]

    return view === "any" || (view !== undefined && fields.every((field) => view.has(field)))
  })
}
