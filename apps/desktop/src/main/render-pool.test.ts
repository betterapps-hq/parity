import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"
import type { ConsoleContext, RenderedFrame, RenderJob } from "../shared/protocol.ts"
import { createRenderPool, type Picture, type RenderWindow } from "./render-pool.ts"

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

const job: RenderJob = {
  projectId: "D:/shop",
  guestUrl: "http://localhost:5001",
  theme: [],
  tree: [],
  mode: { width: 320, viewport: { width: 1280, height: 800 }, classNames: [], attributes: {} },
  scale: 1,
  design: { key: "button", state: "hover" }
}

const frame: RenderedFrame = { width: 320, height: 200, nodes: [], overflowsX: false, unknownComponents: [] }

function picture(): Picture {
  const image: Picture = {
    toPNG: () => Buffer.from("png"),
    toBitmap: () => Buffer.from([0, 0, 0, 0, 255, 255, 255, 255]),
    getSize: () => ({ width: 320, height: 200 }),
    resize: () => image
  }

  return image
}

/** A fake offscreen window, which a test can crash and whose page's answers it can change. */
interface FakeWindow extends RenderWindow {
  /** What the pool says the window is drawing now. */
  drawing(): ConsoleContext | undefined
  calls: string[]
  /** Makes its renderer go during the next frame it draws. */
  crashWhileDrawing(): void
}

/**
 * An offscreen window whose render page answers each call as `pageCall`'s script does, until its renderer goes, as
 * Electron's does: every call fails from then on.
 */
function fakeWindow(drawing: () => ConsoleContext | undefined): FakeWindow {
  let destroyed = false
  let crashed = false
  let crashing = false

  const window: FakeWindow = {
    loaded: Promise.resolve(),
    drawing,
    calls: [],
    destroyed: () => destroyed,
    crashed: () => crashed,
    destroy() {
      destroyed = true
    },
    crashWhileDrawing() {
      crashing = true
    },
    setContentSize: () => undefined,
    async execute(script: string) {
      window.calls.push(script)

      if (crashing && script.includes("window.canvasRender(")) {
        crashed = true
      }

      if (crashed) {
        throw new Error("Render frame was disposed before WebFrameMain could be accessed")
      }

      if (script.includes("window.canvasRender(")) {
        return { value: frame }
      }

      return { value: undefined }
    },
    capture: async () => picture(),
    invalidate: () => undefined
  }

  return window
}

function setup() {
  const opened: FakeWindow[] = []
  const keepFailedFrame = vi.fn<(png: Buffer, traceId: string | undefined) => void>()

  const pool = createRenderPool({
    open(drawing) {
      const window = fakeWindow(drawing)
      opened.push(window)

      return window
    },
    keepFailedFrame
  })

  return { pool, opened, keepFailedFrame }
}

describe("createRenderPool", () => {
  it("opens a window for the first job and keeps it for the next", async () => {
    const { pool, opened } = setup()
    await expect(pool.render(job, false)).resolves.toEqual({ frame })
    await pool.render(job, false)
    expect(opened).toHaveLength(1)
    expect(pool.windows()).toEqual(opened)
  })

  it("fails the job that was drawing when its renderer crashes, and opens the window again for the next", async () => {
    const { pool, opened } = setup()
    await pool.render(job, false)
    opened[0]?.crashWhileDrawing()
    await expect(pool.render(job, false)).rejects.toThrow("disposed")
    expect(opened[0]?.destroyed()).toBe(false)

    await expect(pool.render(job, false)).resolves.toEqual({ frame })
    expect(opened).toHaveLength(2)
    expect(opened[0]?.destroyed()).toBe(true)
    expect(pool.windows()).toEqual([opened[1]])
  })

  it("doesn't picture a frame whose renderer crashed", async () => {
    const { pool, opened, keepFailedFrame } = setup()
    await pool.render(job, false)
    opened[0]?.crashWhileDrawing()
    await expect(pool.render(job, false)).rejects.toThrow("disposed")
    expect(keepFailedFrame).not.toHaveBeenCalled()
  })

  it("closes its windows a minute after the last job, and opens them again for the next", async () => {
    const { pool, opened } = setup()
    await pool.render(job, false)
    vi.advanceTimersByTime(59_999)
    expect(opened[0]?.destroyed()).toBe(false)
    vi.advanceTimersByTime(1)
    expect(opened[0]?.destroyed()).toBe(true)
    expect(pool.windows()).toEqual([])

    await pool.render(job, false)
    expect(opened).toHaveLength(2)
    expect(opened[1]?.destroyed()).toBe(false)
  })

  it("stays open while a job draws, however long it takes", async () => {
    const { pool, opened } = setup()
    await pool.render(job, false)
    let finish: (answer: { value: RenderedFrame }) => void = () => undefined
    const slow = opened[0]!
    slow.execute = (script) => {
      slow.calls.push(script)

      return new Promise((resolve) => {
        finish = resolve
      })
    }

    const drawn = pool.render(job, false)
    await vi.advanceTimersByTimeAsync(600_000)
    expect(slow.destroyed()).toBe(false)
    finish({ value: frame })
    await drawn
    vi.advanceTimersByTime(60_000)
    expect(slow.destroyed()).toBe(true)
  })

  it("closes every window at once when asked, and forgets the close it was waiting to make", async () => {
    const { pool, opened } = setup()
    await pool.render(job, false)
    pool.closeAll()
    expect(opened[0]?.destroyed()).toBe(true)
    await pool.render(job, false)
    vi.advanceTimersByTime(30_000)
    expect(opened[1]?.destroyed()).toBe(false)
  })

  it("tags what a window writes with the design it's drawing, and nothing between jobs", async () => {
    const { pool, opened } = setup()
    const seen: (ConsoleContext | undefined)[] = []
    await pool.render(job, false)
    const window = opened[0]!
    window.execute = async () => {
      seen.push(window.drawing())

      return { value: frame }
    }

    await pool.render(job, false)
    expect(seen).toEqual([{ design: "button", state: "hover" }])
    expect(window.drawing()).toBeUndefined()
  })

  it("gives the frame's picture when one is asked for", async () => {
    const { pool } = setup()
    await expect(pool.render(job, true)).resolves.toEqual({
      frame,
      png: Buffer.from("png").toString("base64")
    })
  })

  it("says a preview drew nothing when its element is one color", async () => {
    const { pool, opened } = setup()
    const crop = { id: "root", x: 0, y: 0, width: 10, height: 10 }
    await pool.render(job, false)
    const window = opened[0]!
    window.execute = async (script) =>
      script.includes("window.canvasRender(") ? { value: { ...frame, nodes: [crop] } } : { value: undefined }
    window.capture = async () => ({ ...picture(), toBitmap: () => Buffer.from([1, 2, 3, 4, 1, 2, 3, 4]) })
    await expect(pool.preview(job, "root", "visible")).resolves.toEqual({ empty: true })
  })
})
