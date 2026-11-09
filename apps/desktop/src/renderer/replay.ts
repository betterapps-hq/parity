import type { TelemetryLevel } from "@parity-app/telemetry"
import * as Sentry from "@sentry/electron/renderer"
import { scrubber } from "./telemetry.ts"

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

/** What a hold pauses: the part of Replay that records the page, which goes on with the same replay when it resumes. */
export interface PageRecorder {
  isEnabled(): boolean
  isPaused(): boolean
  pause(): void
  resume(): void
}

/** The longest a hold lasts, for a canvas whose first frame never comes, as in a project with no designs. */
export const longestHoldMs = 5000

/**
 * Makes holds on recording the page. The first hold pauses the recorder, if it's recording, and it resumes once every
 * hold is let go of, or has lasted `longestMs`. Resuming takes a fresh snapshot of the page, so what changed while it
 * was paused shows from then on, all at once, in the same replay. It resumes in a task of its own, so a frame drawn as
 * the last hold is let go of is painted before the snapshot is taken.
 */
export function pageHolds(
  recorder: () => PageRecorder | undefined,
  { longestMs = longestHoldMs, later = setTimeout, cancel = clearTimeout } = {}
): () => () => void {
  let holds = 0
  let paused: PageRecorder | undefined
  const resume = () => {
    if (holds > 0 || !paused) return
    // Replay resumes on its own when someone clicks, and stops for good if diagnostics are turned off.
    if (paused.isPaused() && paused === recorder()) paused.resume()
    paused = undefined
  }
  return () => {
    if (holds++ === 0 && !paused) {
      const current = recorder()
      if (current?.isEnabled() && !current.isPaused()) {
        current.pause()
        paused = current
      }
    }
    let held = true
    const release = () => {
      if (!held) return
      held = false
      cancel(timer)
      if (--holds === 0) later(resume, 0)
    }
    const timer = later(release, longestMs)
    return release
  }
}

/**
 * Holds Session Replay's recording of the page while a project's canvas mounts, until its first frame shows (PAR-758).
 * Recording every board, title and layer tldraw adds took up to a third of the task that mounts them, before anything
 * showed; a snapshot once the frame shows costs the same, after. Replay keeps its page recorder to itself, so it's
 * reached through `_replay`; while diagnostics are off there's none.
 */
export const holdRecording = pageHolds(() =>
  recording ? (Sentry.getReplay() as unknown as { _replay?: PageRecorder } | undefined)?._replay : undefined
)

/**
 * What the recorder shows of the window: everything as written, its secrets scrubbed (PAR-679), as in every other
 * event (PAR-621). Masking all text through `maskFn` is how Replay lets text pass through a function, so each text node
 * goes through the window's scrubber, which leaves all but secrets as they are; styles and scripts don't. Inputs stay
 * unmasked, since Replay shows a masked input's value as stars whatever `maskFn` returns, except a password, or one in a
 * field whose name says it's secret (`Field` in `chrome/fields.tsx` marks it `data-sentry-mask`). Replay's own clicks,
 * network requests and spans never pass `beforeBreadcrumb`, so what it adds beside the page is scrubbed as it's added.
 */
export const replayPrivacy = {
  maskAllText: true,
  maskFn: (text: string) => scrubber.text(text),
  maskAllInputs: false,
  blockAllMedia: false,
  beforeAddRecordingEvent: <T>(event: T) => scrubber.value(event)
} satisfies Parameters<typeof Sentry.replayIntegration>[0]

/**
 * Records the editor window with Session Replay while diagnostics are on, its secrets scrubbed and its canvases
 * included, and stops while they're off (PAR-624). The recorder is added the first time they're on, so with them off it never loads. Only
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
  // Names, values and pictures are what make a bug findable, as in every other event, so only secrets are hidden. A project's frames and icons are
  // left out, as boxes their size, and their shadow roots are attached where the recorder can't see them (shadow.ts): it
  // kept every shadow root it saw, and with a frame's the closed project's whole canvas. The project's page is the
  // project's, not Parity's; failures carry the frames instead (canvas/frames-on-screen.ts).
  Sentry.addIntegration(Sentry.replayIntegration({ ...replayPrivacy, block: ["[data-frame]", "[data-guest-icon]"] }))
  // The canvas's own <canvas> elements, such as the selection overlay, which Replay otherwise leaves out.
  Sentry.addIntegration(Sentry.replayCanvasIntegration())
}
