import type { Editor } from "tldraw"
import { track } from "../../report-error.ts"
import { tldrawCameraPort } from "./camera-tldraw.ts"
import { createCamera } from "./camera.ts"
import { domMeasurePort } from "./measure-dom.ts"
import { createMeasure } from "./measure.ts"
import type { Camera, Measure } from "./types.ts"

/**
 * A project tab's canvas surface (PAR-1236): its camera, following, and where things are on the page. Core services
 * for now; internal extensions reach them through `parity.canvas` once window modules land (PAR-1233).
 */
export interface CanvasSurface extends Measure {
  readonly camera: Camera
}

const surfaces = new WeakMap<Editor, CanvasSurface>()

/**
 * The surface of the canvas `editor` draws, while it's mounted. Window modules' `parity.canvas` reads it once they land
 * (PAR-1233).
 *
 * @public
 */
export function surfaceOf(editor: Editor): CanvasSurface | undefined {
  return surfaces.get(editor)
}

/** Starts the surface for a canvas as it mounts. Returns what stops it, ending any following. */
export function startCanvasSurface(editor: Editor): () => void {
  const camera = createCamera(tldrawCameraPort(editor), {
    onFollowEnded: ({ owner, why, durationMs }) => track("follow.ended", { extension: owner, why, durationMs })
  })

  const measure = createMeasure(domMeasurePort(editor))
  surfaces.set(editor, {
    camera,
    box: (ref, options) => measure.box(ref, options),
    onBoxChange: (ref, listener, options) => measure.onBoxChange(ref, listener, options),
    hit: (at) => measure.hit(at),
    pageToScreen: (at) => measure.pageToScreen(at),
    screenToPage: (at) => measure.screenToPage(at)
  })

  return () => {
    surfaces.delete(editor)
    camera.dispose()
    measure.dispose()
  }
}
