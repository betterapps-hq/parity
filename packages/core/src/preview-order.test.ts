import { describe, expect, it } from "vite-plus/test"
import { drawsNothing, fitInside, nextPreview, previewIdleMs, previewSettleMs, renderQueue } from "./preview-order.ts"

/** A job that records when it starts and finishes only when `release` is called. */
function held(log: string[], name: string) {
  let release!: () => void
  const done = new Promise<void>((resolve) => (release = resolve))

  return {
    run: async () => {
      log.push(name)
      await done

      return name
    },
    release: () => release()
  }
}

describe("renderQueue", () => {
  it("runs canvas and agent jobs before previews on screen, and those before the idle pass", async () => {
    const queue = renderQueue()
    const log: string[] = []
    const first = held(log, "first preview")
    const running = queue.add("idle", first.run)

    const waiting = [
      queue.add("idle", async () => log.push("idle")),
      queue.add("visible", async () => log.push("visible")),
      queue.add("render", async () => log.push("bitmap")),
      queue.add("render", async () => log.push("agent"))
    ]

    expect(queue.waiting()).toBe(4)
    first.release()
    await Promise.all([running, ...waiting])
    // The preview already running finishes; nothing waiting jumps the canvas's and agents' jobs.
    expect(log).toEqual(["first preview", "bitmap", "agent", "visible", "idle"])
  })

  it("runs one job at a time", async () => {
    const queue = renderQueue()
    const log: string[] = []
    const a = held(log, "a")
    const b = held(log, "b")
    const done = [queue.add("render", a.run), queue.add("render", b.run)]
    await Promise.resolve()
    expect(log).toEqual(["a"])
    a.release()
    await done[0]
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(log).toEqual(["a", "b"])
    b.release()
    expect(await Promise.all(done)).toEqual(["a", "b"])
  })

  it("runs one job in each window at once, in the lowest window free", async () => {
    const queue = renderQueue(2)
    const log: string[] = []
    const windows: number[] = []

    const job = (name: string) => {
      const job = held(log, name)

      return {
        ...job,
        run: (window: number) => {
          windows.push(window)

          return job.run()
        }
      }
    }

    const [a, b, c] = [job("a"), job("b"), job("c")]
    const done = [queue.add("render", a.run), queue.add("render", b.run), queue.add("render", c.run)]
    await Promise.resolve()
    expect(log).toEqual(["a", "b"])
    expect(queue.waiting()).toBe(1)
    a.release()
    await done[0]
    await new Promise((resolve) => setTimeout(resolve, 0))
    // The window "a" freed is the one "c" takes.
    expect(log).toEqual(["a", "b", "c"])
    expect(windows).toEqual([0, 1, 0])
    b.release()
    c.release()
    expect(await Promise.all(done)).toEqual(["a", "b", "c"])
  })

  it("makes one preview at a time, leaving the other windows to the canvas and agents", async () => {
    const queue = renderQueue(3)
    const log: string[] = []
    const preview = held(log, "visible")
    const running = queue.add("visible", preview.run)
    const waiting = queue.add("idle", async () => log.push("idle"))
    const bitmap = queue.add("render", async () => log.push("bitmap"))
    await bitmap
    // The bitmap didn't wait for the preview, and the second preview waits for the first even with a window free.
    expect(log).toEqual(["visible", "bitmap"])
    expect(queue.waiting()).toBe(1)
    preview.release()
    await Promise.all([running, waiting])
    expect(log).toEqual(["visible", "bitmap", "idle"])
  })

  it("gives a job's failure to whoever added it and goes on with the next", async () => {
    const queue = renderQueue()

    const failing = queue.add("visible", async () => {
      throw new Error("The canvas window closed")
    })

    const next = queue.add("idle", async () => "made")
    await expect(failing).rejects.toThrow("The canvas window closed")
    expect(await next).toBe("made")
  })
})

describe("nextPreview", () => {
  const needed = [
    { component: "ui/Button", visible: false },
    { component: "ui/Card", visible: true },
    { component: "ui/Badge", visible: true }
  ]

  it("makes nothing until the canvas has settled, whatever is on screen", () => {
    expect(nextPreview({ canvasSettled: false, idleFor: 10_000, needed })).toEqual({ wait: previewSettleMs })
  })

  it("makes the first one on screen next, even while the person works", () => {
    expect(nextPreview({ canvasSettled: true, idleFor: 0, needed })).toEqual({ make: "ui/Card", priority: "visible" })
  })

  it("makes the rest in order once the person has been idle long enough", () => {
    const offScreen = needed.map((need) => ({ ...need, visible: false }))
    expect(nextPreview({ canvasSettled: true, idleFor: previewIdleMs, needed: offScreen })).toEqual({
      make: "ui/Button",
      priority: "idle"
    })
  })

  it("waits out what's left of the idle time while the person works", () => {
    const offScreen = needed.map((need) => ({ ...need, visible: false }))
    expect(nextPreview({ canvasSettled: true, idleFor: 500, needed: offScreen })).toEqual({
      wait: previewIdleMs - 500
    })
  })

  it("has nothing to do when every preview is made", () => {
    expect(nextPreview({ canvasSettled: true, idleFor: 10_000, needed: [] })).toBeUndefined()
  })
})

describe("fitInside", () => {
  const box = { width: 240, height: 152 }

  it("scales a wide picture down to the box's width, keeping its shape", () => {
    expect(fitInside(1280, 160, box)).toEqual({ width: 240, height: 30 })
  })

  it("scales a tall picture down to the box's height", () => {
    expect(fitInside(200, 608, box)).toEqual({ width: 50, height: 152 })
  })

  it("never makes a small picture larger", () => {
    expect(fitInside(96, 40, box)).toEqual({ width: 96, height: 40 })
  })

  it("keeps at least a pixel each way", () => {
    expect(fitInside(10_000, 1, box)).toEqual({ width: 240, height: 1 })
  })
})

describe("drawsNothing", () => {
  const white = [255, 255, 255, 255]
  it("is a picture of the page alone, every pixel alike", () => {
    expect(drawsNothing(new Uint8Array([...white, ...white, ...white]))).toBe(true)
    expect(drawsNothing(new Uint8Array(white))).toBe(true)
  })

  it("isn't one with a pixel of anything else, even a channel apart", () => {
    expect(drawsNothing(new Uint8Array([...white, ...white, 255, 255, 254, 255]))).toBe(false)
  })
})
