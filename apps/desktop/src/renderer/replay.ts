import type { ResolvedTelemetry } from "@parity-app/telemetry"
import * as Sentry from "@sentry/electron/renderer"
import { scrubber } from "./telemetry.ts"

/**
 * The share of sessions recorded whole while diagnostics are on: every one, while there are few testers and agents.
 * Lower it when volume or Sentry's replay quota says so (PAR-624).
 */
export const replaySessionRate = 1

/**
 * The rates Sentry reads when replay starts, given to `startTelemetry` by the editor window: none, since
 * `followTelemetry` starts it by hand, recording whole sessions or, in CI, buffering. An error never sends a buffer by
 * itself, so CI sends a replay only when one is asked for (PAR-1043).
 */
export const replaySampling = { replaysSessionSampleRate: 0, replaysOnErrorSampleRate: 0 }

/** Whether this window has added the recorder yet, and whether it's recording, whole sessions or a buffer. */
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
 * hold is let go of, or has lasted its longest (`longestMs`, unless the hold says otherwise). Resuming takes a fresh snapshot of the page, so what changed while it
 * was paused shows from then on, all at once, in the same replay. It resumes in a task of its own, so a frame drawn as
 * the last hold is let go of is painted before the snapshot is taken.
 */
export function pageHolds(
  recorder: () => PageRecorder | undefined,
  { longestMs = longestHoldMs, later = setTimeout, cancel = clearTimeout } = {}
): (longestHold?: number) => () => void {
  let holds = 0
  let paused: PageRecorder | undefined

  const resume = () => {
    if (holds > 0 || !paused) {
      return
    }

    // Replay resumes on its own when someone clicks, and stops for good if diagnostics are turned off.
    if (paused.isPaused() && paused === recorder()) {
      paused.resume()
    }

    paused = undefined
  }

  return (longestHold = longestMs) => {
    if (holds++ === 0 && !paused) {
      const current = recorder()

      if (current?.isEnabled() && !current.isPaused()) {
        current.pause()
        paused = current
      }
    }

    let held = true

    const release = () => {
      if (!held) {
        return
      }

      held = false
      cancel(timer)

      if (--holds === 0) {
        later(resume, 0)
      }
    }

    const timer = later(release, longestHold)

    return release
  }
}

/**
 * Holds Session Replay's recording of the page while a project's canvas mounts, until its first frame shows (PAR-758).
 * Recording every board, title and layer tldraw adds took up to a third of the task that mounts them, before anything
 * showed; a snapshot once the frame shows costs the same, after. Replay keeps its page recorder to itself, so it's
 * reached through `_replay`; while diagnostics are off there's none.
 */
export const holdRecording = pageHolds(() => (recording ? replayRecorder() : undefined))

/** The longest a zoom holds recording, for one that never settles, as when a gesture is stuck. */
export const longestZoomHoldMs = 60_000

/** How long recording stays held after the zoom settles, so a zoom that starts again soon keeps it held. */
export const zoomHoldLingerMs = 1000

/** The longest recording waits for the window to be idle once the linger is over, before it resumes anyway. */
export const zoomHoldIdleMs = 2000

/**
 * A hold taken while the canvas zooms and let go of after it settles, as `holdWhileZooming` takes on Session Replay.
 * `zooming` takes it, or keeps it if it hasn't been let go of yet; `settled` lets go of it `lingerMs` later, once the
 * window is idle, so the snapshot resuming takes waits for the frames a settled zoom wakes; `end` lets go now.
 */
export function zoomHold(
  hold: (longestMs?: number) => () => void,
  {
    lingerMs = zoomHoldLingerMs,
    longestMs = longestZoomHoldMs,
    later = setTimeout,
    cancel = clearTimeout,
    idle = (run: () => void) => requestIdleCallback(run, { timeout: zoomHoldIdleMs }),
    cancelIdle = cancelIdleCallback
  } = {}
) {
  let release: (() => void) | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let waiting: number | undefined

  const wait = () => {
    cancel(timer)
    timer = undefined

    if (waiting !== undefined) {
      cancelIdle(waiting)
      waiting = undefined
    }
  }

  const end = () => {
    wait()
    release?.()
    release = undefined
  }

  return {
    zooming() {
      wait()
      release ??= hold(longestMs)
    },
    settled() {
      if (release && timer === undefined && waiting === undefined) {
        timer = later(() => {
          timer = undefined
          waiting = idle(end)
        }, lingerMs)
      }
    },
    end
  }
}

/**
 * Holds Session Replay's recording of the page while the canvas zooms, until a second after the zoom settles and the
 * window is idle (PAR-957).
 * Each frame of a zoom restyles every board's gutters, captions and labels to stay a screen pixel wide, and the recorder
 * parsed each element's old and new inline style to tell what changed: the largest share of the page's JavaScript while
 * zooming. A pan restyles only the camera's layer, so it goes on being recorded.
 */
export function holdWhileZooming() {
  return zoomHold(holdRecording)
}

/** Replay's page recorder, its private `_replay`, when it has one that looks like it. */
function replayRecorder(): PageRecorder | undefined {
  // Brackets are TypeScript's way into a private member; Replay declares this one without a type.
  const recorder: unknown = Sentry.getReplay()?.["_replay"]

  return isPageRecorder(recorder) ? recorder : undefined
}

function isPageRecorder(value: unknown): value is PageRecorder {
  return value instanceof Object && "isEnabled" in value && "isPaused" in value && "pause" in value && "resume" in value
}

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
 * included, and stops while they're off (PAR-624). CI, which sends only errors and reports (PAR-777), keeps the last
 * minute in memory instead and sends it only when `sendReplay` asks, as the end-to-end suite does for a failed test
 * (PAR-1043). The recorder is added the first time they're on, so with them off it never loads. Only the editor window
 * calls this, as it learns the setting and each time it changes; the offscreen renderers never record.
 */
export function followTelemetry({ level, errorsOnly }: Pick<ResolvedTelemetry, "level" | "errorsOnly">): void {
  if (level === "off") {
    if (recording) {
      void Sentry.getReplay()?.stop()
    }

    recording = false

    return
  }

  // Whether CI's rule applies is fixed for a run, so a window recording already goes on as it started.
  if (recording) {
    return
  }

  recording = true

  if (!added) {
    added = true
    // Names, values and pictures are what make a bug findable, as in every other event, so only secrets are hidden. A
    // project's frames and icons are left out, as boxes their size, and their shadow roots are attached where the
    // recorder can't see them (shadow.ts): it kept every shadow root it saw, and with a frame's the closed project's
    // whole canvas. The project's page is the project's, not Parity's; failures carry the frames instead
    // (canvas/frames-on-screen.ts).
    // The window's own <canvas> elements, such as the selection overlay, which Replay otherwise leaves out. Added first:
    // Replay looks for the canvas recorder once, as it's added itself, and records no canvas if it isn't there (PAR-964).
    Sentry.addIntegration(Sentry.replayCanvasIntegration())
    Sentry.addIntegration(Sentry.replayIntegration({ ...replayPrivacy, block: ["[data-frame]", "[data-guest-icon]"] }))
  }

  const replay = Sentry.getReplay()

  if (errorsOnly) {
    replay?.startBuffering()
  } else if (Math.random() < replaySessionRate) {
    replay?.start()
  }
}

/**
 * Sends what Replay has kept and gives the replay's id, or none when it isn't recording (PAR-635). Recording a whole
 * session, it sends what's waiting. Buffering, as in CI, it sends the buffer as a replay of its own and starts a fresh
 * buffer, so CI never goes on to record whole sessions after it (PAR-1043). `tags` go on that replay, such as the
 * end-to-end test that failed.
 */
export async function sendReplay(tags: Record<string, string> = {}): Promise<string | undefined> {
  const replay = Sentry.getReplay()
  const mode = replay?.getRecordingMode()

  if (!replay || !mode) {
    return undefined
  }

  const id = replay.getReplayId()

  try {
    await Sentry.withScope(async (scope) => {
      scope.setTags(tags)
      await replay.flush(mode === "buffer" ? { continueRecording: false } : undefined)
    })
  } catch {
    // A session's earlier parts went already; a buffer that couldn't go names nothing in Sentry.
    return mode === "session" ? id : undefined
  } finally {
    if (mode === "buffer") {
      await replay.stop()
      replay.startBuffering()
    }
  }

  return id
}

/** The replay and trace a report is tied to, each when there is one. */
interface ReportIds {
  replayId?: string
  traceId?: string
}

/**
 * The replay and trace a report is tied to (PAR-635). The replay is sent first, so the feedback can name it. Neither
 * is there when the window records no replay.
 */
export async function reportIds(): Promise<ReportIds> {
  const replayId = await sendReplay()
  const traceId = Sentry.getCurrentScope().getPropagationContext().traceId

  const ids: ReportIds = {}

  if (replayId) {
    ids.replayId = replayId
  }

  if (traceId) {
    ids.traceId = traceId
  }

  return ids
}
