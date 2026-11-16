import {
  drawsNothing,
  fitInside,
  offscreenWindows,
  previewSizes,
  type RenderPriority,
  renderQueue
} from "@parity-app/processes"
import type { Span } from "@parity-app/telemetry"
import type { ConsoleContext, RenderedFrame, RenderJob } from "../shared/protocol.ts"
import { deviceBox, devicePixels } from "../shared/render-job.ts"
import type { PreviewDrawn, PreviewPictures } from "../shared/service.ts"
import { currentTrace, inSpan } from "../shared/tracing.ts"
import { retryingCapture } from "./capture-retry.ts"
import { watchFrame } from "./frame-telemetry.ts"
import { idleClose } from "./idle-close.ts"
import { auditResult, canvasHeightResult, PageError, pageAnswer, pageCall, renderResult } from "./render-results.ts"

/** A picture an offscreen window took: Electron's `NativeImage` in the app. */
export interface Picture {
  toPNG(): Buffer
  toBitmap(): Buffer
  getSize(): { width: number; height: number }
  resize(options: { width: number; height: number; quality: "best" }): Picture
}

/** A part of a window, in device pixels. */
export interface Box {
  x: number
  y: number
  width: number
  height: number
}

/** What the pool needs of an offscreen window: Electron's offscreen `BrowserWindow` in the app, a fake in tests. */
export interface RenderWindow {
  /** Settles once the render page has loaded. */
  readonly loaded: Promise<void>
  destroyed(): boolean
  /** Whether its renderer crashed. Electron keeps the window, and every call into it fails from then on. */
  crashed(): boolean
  destroy(): void
  setContentSize(width: number, height: number): void
  /** Runs `script` in the render page, and gives what it answered. */
  // oxlint-disable-next-line anti-slop/no-unknown-returns -- the I/O boundary: what the render page gave, which `pageAnswer` parses
  execute(script: string): Promise<unknown>
  /** Takes a picture of `box`, or of the whole window. */
  capture(box?: Box): Promise<Picture>
  /** Asks the window to paint again. */
  invalidate(): void
}

export interface RenderPoolOptions<Window extends RenderWindow> {
  /** Opens an offscreen window and starts loading the render page. `drawing` says which design it's drawing now. */
  open: (drawing: () => ConsoleContext | undefined) => Window
  /** Keeps a picture of a frame that failed, for the errors about it (PAR-812). */
  keepFailedFrame: (png: Buffer, traceId: string | undefined) => void
  /** How many windows draw at once. */
  windows?: number
  /** How long the windows stay open after the last job. */
  idleMs?: number
}

/** What a frame drawn offscreen gives: the frame, and its picture when one was asked for. */
export interface Rendered {
  frame?: RenderedFrame
  png?: string
}

/** The offscreen windows agents measure and capture frames in, so their work never moves the person's camera. */
export interface RenderPool<Window extends RenderWindow> {
  /** Draws a frame, and pictures it when `capture` says to. */
  render(job: RenderJob, capture: boolean): Promise<Rendered>
  /**
   * Draws a component preview and crops it to the element `crop` names, scaled down to the two sizes previews are kept
   * at (PAR-207). A component that fails to draw gives its error.
   */
  preview(job: RenderJob, crop: string, priority: Exclude<RenderPriority, "render">): Promise<PreviewDrawn>
  /** The windows open now. */
  windows(): Window[]
  /** Closes every window, as when the last app window closes, so the hidden ones don't keep the app running. */
  closeAll(): void
}

/** The design a job draws, as what its window writes to the console is tagged (PAR-147). */
function consoleContextOf(design: NonNullable<RenderJob["design"]>): ConsoleContext {
  const context: ConsoleContext = { design: design.key }

  if (design.state) {
    context.state = design.state
  }

  if (design.mode) {
    context.mode = design.mode
  }

  return context
}

/**
 * Calls into the render page and parses what it gave with `read`, throwing what the page threw as a `PageError` with
 * its own message and stack.
 */
async function callPage<Result>(
  window: RenderWindow,
  call: string,
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- the I/O boundary: what the render page gave, which `read` parses
  read: (value: unknown) => Result
): Promise<Result> {
  return read(pageAnswer(await window.execute(pageCall(call))))
}

/**
 * The part of an offscreen window in `box`, taken again once the window has painted when Chromium had no frame to copy
 * (PAR-880).
 */
function captureWindow(window: RenderWindow, box: Box): Promise<Picture> {
  return retryingCapture(
    () => window.capture(box),
    async () => {
      window.invalidate()
      await callPage(window, "window.canvasSettle()", () => undefined)
    }
  )
}

/**
 * A few offscreen windows that draw at once, so a project's bitmaps are taken in a fraction of the time one window took
 * (PAR-523), one job in each, canvas bitmaps and agents' renders before component previews (PAR-207). Each window holds
 * its page and every project module graph it imported, which only closing it returns, so they close `idleMs` after the
 * last job and the next job opens them again. A window whose renderer crashed is opened again for the next job (PAR-681).
 */
export function createRenderPool<Window extends RenderWindow>({
  open,
  keepFailedFrame,
  windows = offscreenWindows,
  idleMs = 60_000
}: RenderPoolOptions<Window>): RenderPool<Window> {
  const opened: (Window | undefined)[] = []
  const queue = renderQueue(windows)
  // The design each window is drawing, for what it writes meanwhile.
  const drawing = new Map<Window, ConsoleContext>()

  const closeAll = () => {
    idle.cancel()

    for (const window of opened.splice(0)) {
      if (window && !window.destroyed()) {
        window.destroy()
      }
    }
  }

  const idle = idleClose(idleMs, closeAll)

  const crashed = (window: RenderWindow) => !window.destroyed() && window.crashed()

  /** Window `index`, opened and loaded if it isn't, or opened again if its renderer crashed. */
  const ensureWindow = async (index: number): Promise<Window> => {
    let window = opened[index]

    if (window && crashed(window)) {
      window.destroy()
    }

    if (!window || window.destroyed()) {
      const fresh: Window = open(() => drawing.get(fresh))
      opened[index] = fresh
      window = fresh
    }

    await window.loaded

    return window
  }

  /**
   * Draws a job in a free window when its turn comes (see `renderQueue`). When it's to be looked at whole, as a capture
   * or a check does, the window is made as tall as the frame and left to settle before `then`.
   */
  const renderOffscreen = (
    priority: RenderPriority,
    job: RenderJob,
    whole: boolean,
    then: (
      window: Window,
      frame: RenderedFrame,
      width: number,
      height: number
    ) => Promise<Rendered & { frame: RenderedFrame }>
  ): Promise<Rendered & { frame: RenderedFrame }> => {
    // Held from the moment it's queued, so the window never closes under a job or with one waiting.
    const done = idle.use()
    // Drawn under the trace it was queued in, with how long it waited for a window (PAR-629), and timed (PAR-638).
    const parent = currentTrace()
    const queued = performance.now()

    const draw = async (index: number, span: Span | undefined) => {
      const window = await ensureWindow(index)
      const width = devicePixels(job.mode.width, job.scale)
      window.setContentSize(width, 800)

      if (job.design) {
        drawing.set(window, consoleContextOf(job.design))
      }

      // A frame that fails is pictured as the window shows it, for the errors about it (PAR-812).
      const watch = watchFrame(job, priority, span, () => {
        if (window.destroyed() || crashed(window)) {
          return
        }

        void window
          .capture()
          .then((image) => keepFailedFrame(image.toPNG(), span?.traceId))
          .catch(() => undefined)
      })

      try {
        const result = await callPage(window, `window.canvasRender(${JSON.stringify(job)})`, renderResult)
        watch.rendered(result)
        // The guest's stack is telemetry's alone; agents get the message.
        const { errorStack: _stack, ...frame } = result

        if (!whole || frame.error) {
          watch.end(frame)

          return { frame }
        }

        // The whole frame is in view, so a capture or a contrast check sees all of it.
        const height = devicePixels(frame.height, job.scale)
        window.setContentSize(width, height)
        await callPage(window, "window.canvasSettle()", () => undefined)
        const finished = await then(window, frame, width, height)
        watch.end(frame)

        return finished
      } catch (error) {
        if (error instanceof PageError) {
          watch.threw(error.failure)
        }
        // The call it was waiting on fails as the renderer goes, so the canvas tries the frame again, in a window opened
        // afresh.
        else if (crashed(window)) {
          watch.crashed()
        }

        watch.end(undefined, true)
        throw error
      } finally {
        drawing.delete(window)
      }
    }

    const run = (index: number) =>
      inSpan(
        "frame.rendered",
        { priority, queuedMs: Math.round(performance.now() - queued), whole },
        (span) => draw(index, span),
        parent
      )

    return queue.add(priority, run).finally(done)
  }

  return {
    render: (job, capture) =>
      renderOffscreen("render", job, capture || !!job.audit, async (window, frame, width, height) => {
        if (job.audit) {
          const audited = await callPage(
            window,
            `window.canvasAudit(${JSON.stringify(job.colorTokens ?? [])})`,
            auditResult
          )

          frame.issues = audited.issues
          frame.contrast = audited.contrast
        }

        if (!capture) {
          return { frame }
        }

        const image = await captureWindow(window, { x: 0, y: 0, width, height })

        // A frame that grows with its content keeps the height the canvas lays it out at, measured after the capture
        // (PAR-525).
        if (job.mode.height === undefined) {
          const canvasHeight = await callPage(window, "window.canvasHeight()", canvasHeightResult)

          if (canvasHeight !== undefined) {
            frame.canvasHeight = canvasHeight
          }
        }

        return { frame, png: image.toPNG().toString("base64") }
      }),
    async preview(job, crop, priority) {
      let pictures: PreviewPictures | undefined
      let empty = false

      const { frame } = await renderOffscreen(priority, job, true, async (window, drawn) => {
        const box = drawn.nodes.find((node) => node.id === crop)

        if (!box) {
          return { frame: drawn }
        }

        const image = await captureWindow(window, deviceBox(box, job.scale))
        const { width, height } = image.getSize()

        if (drawsNothing(image.toBitmap())) {
          empty = true

          return { frame: drawn }
        }

        const scaled = (size: { width: number; height: number }) => {
          const fitted = fitInside(width, height, size)

          return fitted.width === width && fitted.height === height
            ? image
            : image.resize({ ...fitted, quality: "best" })
        }

        const large = scaled(previewSizes.large)
        pictures = {
          thumb: scaled(previewSizes.thumbnail).toPNG().toString("base64"),
          large: large.toPNG().toString("base64"),
          ...large.getSize()
        }

        return { frame: drawn }
      })

      if (frame.error) {
        return { error: frame.error }
      }

      if (empty) {
        return { empty: true }
      }

      if (!pictures) {
        return { error: "It drew nothing to take a picture of" }
      }

      return { pictures }
    },
    windows: () => opened.filter((window): window is Window => window !== undefined),
    closeAll
  }
}
