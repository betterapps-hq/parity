import * as Sentry from "@sentry/electron/renderer"
import type { CanvasHost } from "../shared/protocol.ts"

/**
 * The share of sessions recorded whole at the All level: every one, while there are few testers and agents. Lower it
 * when volume or Sentry's replay quota says so (PAR-624).
 */
export const replaySessionRate = 1

/**
 * Sentry's options for recording the editor window with Session Replay, unmasked, its canvases included (PAR-624). At
 * All every session is recorded; at Errors only the buffer Sentry keeps before each error is sent; at Off nothing is
 * recorded. Only the editor window calls this, so the offscreen renderers neither record nor load the recorder.
 */
export function replayOptions(level: CanvasHost["telemetry"]): Parameters<typeof Sentry.init>[0] {
  if (level === undefined || level === "off") return {}
  return {
    replaysSessionSampleRate: level === "all" ? replaySessionRate : 0,
    replaysOnErrorSampleRate: 1,
    integrations: [
      // Names, values and pictures are what make a bug findable, as in every other event. Frames are shadow roots in
      // this page, recorded with it; the bitmaps of frames whose renders fail go with those failures
      // (canvas/frames-on-screen.ts).
      Sentry.replayIntegration({ maskAllText: false, maskAllInputs: false, blockAllMedia: false }),
      // The canvas's own <canvas> elements, such as the selection overlay, which Replay otherwise leaves out.
      Sentry.replayCanvasIntegration()
    ]
  }
}
