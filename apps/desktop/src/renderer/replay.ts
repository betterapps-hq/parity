import type { TelemetryLevel } from "@parity-app/telemetry"
import * as Sentry from "@sentry/electron/renderer"

/**
 * The share of sessions recorded whole while diagnostics are on: every one, while there are few testers and agents.
 * Lower it when volume or Sentry's replay quota says so (PAR-624).
 */
export const replaySessionRate = 1

/** The rates Sentry reads when replay starts, given to `startTelemetry` by the editor window. */
export const replaySampling = { replaysSessionSampleRate: replaySessionRate, replaysOnErrorSampleRate: 1 }

/** Whether this window has added the recorder yet, and whether it's recording. */
let added = false
let recording = false

/**
 * Records the editor window with Session Replay while diagnostics are on, unmasked, its canvases included, and stops
 * while they're off (PAR-624). The recorder is added the first time they're on, so with them off it never loads. Only
 * the editor window calls this, as it learns the setting and each time it changes; the offscreen renderers never record.
 */
export function followTelemetry(level: TelemetryLevel): void {
  if (level === "off") {
    if (recording) void Sentry.getReplay()?.stop()
    recording = false
    return
  }
  if (recording) return
  recording = true
  if (added) {
    Sentry.getReplay()?.start()
    return
  }
  added = true
  // Names, values and pictures are what make a bug findable, as in every other event. A project's frames and icons are
  // left out, as boxes their size, and their shadow roots are attached where the recorder can't see them (shadow.ts): it
  // kept every shadow root it saw, and with a frame's the closed project's whole canvas. The project's page is the
  // project's, not Parity's; failures carry the frames instead (canvas/frames-on-screen.ts).
  Sentry.addIntegration(
    Sentry.replayIntegration({
      maskAllText: false,
      maskAllInputs: false,
      blockAllMedia: false,
      block: ["[data-frame]", "[data-guest-icon]"]
    })
  )
  // The canvas's own <canvas> elements, such as the selection overlay, which Replay otherwise leaves out.
  Sentry.addIntegration(Sentry.replayCanvasIntegration())
}
