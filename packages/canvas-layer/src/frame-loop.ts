/** Work done once an animation frame: `measure` reads layout first, then `draw` writes. */
export interface Frame {
  measure?: () => void
  /** `dt` is the milliseconds since the frame before, 0 on the first after a pause. */
  draw: (dt: number) => void
}

/** A tab's frames for its layers: every `measure`, then every `draw`, once a frame while any are added and it's shown. */
export interface FrameLoop {
  /** Runs `frame` every frame until the function it gives is called. A throw goes to `failed`, and the rest still run. */
  add(frame: Frame, failed: (error: Error) => void): () => void
  /** Pauses while the tab is hidden, and goes on when it's shown. */
  setVisible(visible: boolean): void
  dispose(): void
}

export interface FrameLoopOptions {
  request: (callback: (time: number) => void) => number
  cancel: (handle: number) => void
}

/** A frame loop over the window's animation frames, or the given ones in a test. */
export function createFrameLoop(
  { request, cancel }: FrameLoopOptions = {
    request: (callback) => window.requestAnimationFrame(callback),
    cancel: (handle) => window.cancelAnimationFrame(handle)
  }
): FrameLoop {
  const frames = new Map<object, { frame: Frame; failed: (error: Error) => void }>()
  let visible = true
  let disposed = false
  let handle: number | undefined
  let last: number | undefined

  const call = (failed: (error: Error) => void, run: () => void) => {
    try {
      run()
    } catch (error) {
      failed(error instanceof Error ? error : new Error(String(error)))
    }
  }

  const tick = (time: number) => {
    handle = undefined
    const dt = last === undefined ? 0 : time - last
    last = time
    // Copied, so a frame added or removed during this one waits for the next.
    const now = [...frames.values()]

    for (const { frame, failed } of now) {
      const { measure } = frame

      if (measure) {
        call(failed, measure)
      }
    }

    for (const { frame, failed } of now) {
      call(failed, () => frame.draw(dt))
    }

    schedule()
  }

  const schedule = () => {
    if (handle === undefined && !disposed && visible && frames.size > 0) {
      handle = request(tick)
    }
  }

  const stop = () => {
    if (handle !== undefined) {
      cancel(handle)
      handle = undefined
    }

    last = undefined
  }

  return {
    add(frame, failed) {
      const key = {}
      frames.set(key, { frame, failed })
      schedule()

      return () => {
        frames.delete(key)

        if (frames.size === 0) {
          stop()
        }
      }
    },
    setVisible(next) {
      visible = next

      if (visible) {
        schedule()
      } else {
        stop()
      }
    },
    dispose() {
      disposed = true
      frames.clear()
      stop()
    }
  }
}
