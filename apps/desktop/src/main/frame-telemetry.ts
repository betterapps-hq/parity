import {
  type EventAttributes,
  type FrameFailure,
  frameFailure,
  frameTimeoutMs,
  type registeredEvents,
  type Span
} from "@parity-app/telemetry"
import type { RenderedFrame, RenderJob } from "../shared/protocol.ts"
import { track } from "../shared/tracing.ts"
import type { PageFailure } from "./render-results.ts"

/** What a frame drawn offscreen was asked to show, which each of its events says. */
interface FrameShown {
  design?: string
  state?: string
  mode?: string
  priority: string
}

/** What a frame drawn offscreen was asked to show, for its events. */
function shown(job: RenderJob, priority: string): FrameShown {
  const { design } = job
  const attributes: FrameShown = { priority }

  if (design?.key) {
    attributes.design = design.key
  }

  if (design?.state) {
    attributes.state = design.state
  }

  if (design?.mode) {
    attributes.mode = design.mode
  }

  return attributes
}

/** One frame's timing, as `watchFrame` gives it. */
export interface FrameWatch {
  /** The guest drew it, or gave its error. */
  rendered(frame: RenderedFrame): void
  /** The render page threw instead of answering, as it can while the frame is settled, checked or measured. */
  threw(failure: PageFailure): void
  /** Its window's renderer crashed while drawing it, which fails it. */
  crashed(): void
  /** It's done, as drawn; `threw` when it didn't finish, which the span records with the error's code itself. */
  end(frame?: RenderedFrame, threw?: boolean): void
}

/**
 * Times one frame drawn offscreen for its `frame.rendered` span, and records `frame.failed` when its guest fails or it's
 * still drawing `frameTimeoutMs` after its turn came (PAR-638). A frame that times out is left to finish. `failed` is
 * called once it fails, to keep a picture of what the window shows for the errors that follow.
 */
export function watchFrame(
  job: RenderJob,
  priority: string,
  span: Span | undefined,
  failed: () => void,
  now: () => number = () => performance.now()
): FrameWatch {
  const started = now()
  let renderMs: number | undefined
  let failure: FrameFailure | undefined

  const fail = (why: FrameFailure, message: string, stack?: string) => {
    failure ??= why

    const attributes: EventAttributes<typeof registeredEvents, "frame.failed"> = {
      ...shown(job, priority),
      failure: why,
      message
    }

    if (stack) {
      attributes.stack = stack
    }

    track("frame.failed", attributes, span)
    failed()
  }

  const failedWith = ({ error, errorStack }: { error?: string; errorStack?: string }) => {
    if (error && failure === undefined) {
      fail(frameFailure(error), error, errorStack)
    }
  }

  const timer = setTimeout(
    () => fail("timed out", `It was still drawing ${frameTimeoutMs / 1000} seconds after its turn came`),
    frameTimeoutMs
  )

  return {
    rendered(frame) {
      renderMs = Math.round(now() - started)
      failedWith(frame)
    },
    threw: failedWith,
    crashed: () => fail("crashed", "Its offscreen window's renderer crashed while drawing it"),
    end(frame, threw = false) {
      clearTimeout(timer)

      if (threw) {
        return
      }

      const ended = Math.round(now() - started)
      const attributes: Partial<EventAttributes<typeof registeredEvents, "frame.rendered">> = shown(job, priority)

      if (renderMs !== undefined) {
        attributes.renderMs = renderMs
        attributes.captureMs = ended - renderMs
      }

      if (frame) {
        attributes.width = frame.width
        attributes.height = frame.height
        attributes.nodes = frame.nodes.length
      }

      if (failure) {
        attributes.failure = failure
      }

      span?.end(failure ? "error" : "ok", attributes)
    }
  }
}
