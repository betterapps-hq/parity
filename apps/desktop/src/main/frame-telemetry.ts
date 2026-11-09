import { type FrameFailure, frameFailure, frameTimeoutMs, type Span } from "@parity-app/telemetry"
import type { RenderedFrame, RenderJob } from "../shared/protocol.ts"
import { track } from "../shared/tracing.ts"
import type { PageFailure } from "./render-results.ts"

/** What a frame drawn offscreen was asked to show, for its events. */
function shown(job: RenderJob, priority: string): { design?: string; state?: string; mode?: string; priority: string } {
  const { design } = job
  return {
    ...(design?.key ? { design: design.key } : {}),
    ...(design?.state ? { state: design.state } : {}),
    ...(design?.mode ? { mode: design.mode } : {}),
    priority
  }
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
): {
  /** The guest drew it, or gave its error. */
  rendered(frame: RenderedFrame): void
  /** The render page threw instead of answering, as it can while the frame is settled, checked or measured. */
  threw(failure: PageFailure): void
  /** It's done, as drawn; `threw` when it didn't finish, which the span records with the error's code itself. */
  end(frame?: RenderedFrame, threw?: boolean): void
} {
  const started = now()
  let renderMs: number | undefined
  let failure: FrameFailure | undefined
  const fail = (why: FrameFailure, message: string, stack?: string) => {
    failure ??= why
    track("frame.failed", { ...shown(job, priority), failure: why, message, ...(stack ? { stack } : {}) }, span)
    failed()
  }
  const failedWith = ({ error, errorStack }: { error?: string; errorStack?: string }) => {
    if (error && failure === undefined) fail(frameFailure(error), error, errorStack)
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
    end(frame, threw = false) {
      clearTimeout(timer)
      if (threw) return
      const ended = Math.round(now() - started)
      span?.end(failure ? "error" : "ok", {
        ...shown(job, priority),
        ...(renderMs === undefined ? {} : { renderMs, captureMs: ended - renderMs }),
        ...(frame ? { width: frame.width, height: frame.height, nodes: frame.nodes.length } : {}),
        ...(failure ? { failure } : {})
      })
    }
  }
}
