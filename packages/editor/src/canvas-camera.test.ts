import { describe, expect, it } from "vite-plus/test"
import {
  between,
  type CameraPort,
  type CameraState,
  createCamera,
  fitCamera,
  glideMs,
  moveEnd,
  sameCamera,
  viewOf
} from "./canvas-camera.ts"
import type { FollowEnd } from "./canvas-surface.ts"

/** A canvas in memory: a camera, a viewport, and frames run by hand. */
function fakeCanvas({ lag = 0 }: { lag?: number } = {}) {
  let camera: CameraState = { x: 0, y: 0, z: 1 }
  let viewport = { width: 800, height: 600 }
  let time = 0
  const frames = new Map<number, (now: number) => void>()
  let nextFrame = 1

  const listeners = {
    camera: new Set<() => void>(),
    navigate: new Set<() => void>(),
    escape: new Set<() => boolean>()
  }

  const tell = <T>(set: Set<() => T>): T[] => [...set].map((listener) => listener())

  const on =
    <T>(set: Set<() => T>) =>
    (listener: () => T) => {
      set.add(listener)

      return () => set.delete(listener)
    }

  const port: CameraPort = {
    camera: () => camera,
    viewport: () => viewport,
    zoomLimits: () => ({ min: 0.01, max: 8 }),
    setCamera: (next) => {
      camera = next
      tell(listeners.camera)
    },
    onCamera: on(listeners.camera),
    onNavigate: on(listeners.navigate),
    onEscape: on(listeners.escape),
    frame: (callback) => {
      const id = nextFrame++
      frames.set(id, callback)

      return () => frames.delete(id)
    },
    // `lag` puts the clock after the frames' times, as when what's told runs after its frame began.
    now: () => time + lag
  }

  return {
    port,
    /** Runs animation frames until `ms` have passed. */
    run(ms: number) {
      const until = time + ms

      while (time < until) {
        time = Math.min(until, time + 16)
        const due = [...frames.values()]
        frames.clear()
        due.forEach((callback) => callback(time))
      }
    },
    /** The person moves the camera themselves. */
    move(next: CameraState) {
      port.setCamera(next)
    },
    resize(width: number, height: number) {
      viewport = { width, height }
      tell(listeners.camera)
    },
    navigate: () => tell(listeners.navigate),
    /** Esc on the canvas: whether anything took it. */
    escape: () => tell(listeners.escape).some(Boolean),
    get camera() {
      return camera
    }
  }
}

describe("fitting a view", () => {
  it("shows a view whole and centred, and reads back the same view", () => {
    const camera = fitCamera(
      { x: 100, y: 100, width: 400, height: 150 },
      { width: 800, height: 600 },
      { min: 0.1, max: 8 }
    )

    expect(camera.z).toBe(2)
    const view = viewOf(camera, { width: 800, height: 600 })
    expect(view.x + view.width / 2).toBeCloseTo(300)
    expect(view.y + view.height / 2).toBeCloseTo(175)
    expect(view.width).toBe(400)
  })

  it("keeps the zoom within the canvas's limits", () => {
    expect(fitCamera({ x: 0, y: 0, width: 1, height: 1 }, { width: 800, height: 600 }, { min: 0.1, max: 8 }).z).toBe(8)
  })

  it("glides from one view to another, ending exactly there", () => {
    const from = { x: 0, y: 0, width: 100, height: 100 }
    const to = { x: 500, y: 500, width: 400, height: 400 }
    expect(between(from, to, 0)).toEqual(from)
    expect(between(from, to, 1)).toEqual(to)
    expect(between(from, to, 0.5).width).toBeGreaterThan(100)
  })

  it("tells a zoom from a pan, and calls cameras within rounding the same", () => {
    expect(moveEnd({ x: 0, y: 0, z: 1 }, { x: 10, y: 0, z: 1 })).toBe("panned")
    expect(moveEnd({ x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: 1.2 })).toBe("zoomed")
    expect(sameCamera({ x: 0, y: 0, z: 1 }, { x: 0.1, y: 0, z: 1 })).toBe(true)
  })
})

describe("the camera", () => {
  it("shows a view, gliding there, and tells listeners once a frame", async () => {
    const canvas = fakeCanvas()
    const camera = createCamera(canvas.port)
    const views: unknown[] = []
    camera.onChange((view) => views.push(view))
    const shown = camera.show({ x: 1000, y: 1000, width: 400, height: 300 })
    canvas.run(glideMs + 32)
    await shown
    expect(camera.get()).toMatchObject({ x: expect.closeTo(1000, 3), width: expect.closeTo(400, 3) })
    expect(views.length).toBeGreaterThan(1)
    expect(views.length).toBeLessThanOrEqual(Math.ceil((glideMs + 32) / 16) + 1)
  })

  it("keeps following through its own moves, and ends when the person pans or zooms", () => {
    for (const [move, why] of [
      [(z: number) => ({ x: 5, y: 5, z }), "panned"],
      [(z: number) => ({ x: 0, y: 0, z: z * 2 }), "zoomed"]
    ] as const) {
      const canvas = fakeCanvas()
      const ended: { why: FollowEnd; owner: string }[] = []
      const camera = createCamera(canvas.port, { onFollowEnded: (each) => ended.push(each) })
      const following = camera.follow({ x: 0, y: 0, width: 400, height: 300 }, { owner: "multiplayer" })
      const told: FollowEnd[] = []
      following.onEnd((each) => told.push(each))
      canvas.run(glideMs + 32)
      following.update({ x: 300, y: 200, width: 400, height: 300 })
      canvas.run(glideMs + 32)
      expect(following.active).toBe(true)
      expect(camera.get().x).toBeCloseTo(300)
      const { x, y, z } = canvas.camera
      canvas.move({ ...move(z), x: x + move(z).x, y: y + move(z).y })
      expect(told).toEqual([why])
      expect(ended).toMatchObject([{ why, owner: "multiplayer" }])
      expect(following.active).toBe(false)
    }
  })

  it("ends following with Esc, taking the key only then, another page, another follow, show, or dispose", () => {
    const canvas = fakeCanvas()
    const ended: FollowEnd[] = []
    const camera = createCamera(canvas.port, { onFollowEnded: ({ why }) => ended.push(why) })
    const view = { x: 0, y: 0, width: 400, height: 300 }
    expect(canvas.escape()).toBe(false)
    camera.follow(view)
    expect(canvas.escape()).toBe(true)
    camera.follow(view)
    canvas.navigate()
    camera.follow(view)
    camera.follow(view)
    void camera.show(view, { animate: false })
    camera.follow(view).dispose()
    expect(ended).toEqual(["escape", "navigated", "replaced", "replaced", "disposed"])
  })

  it("arrives at what it follows when told every frame, after each frame began, the same view or a moving one", () => {
    for (const moving of [false, true]) {
      const canvas = fakeCanvas({ lag: 20 })
      const camera = createCamera(canvas.port)
      const following = camera.follow({ x: 0, y: 0, width: 400, height: 300 })
      canvas.run(glideMs + 32)
      let target = { x: 3000, y: -2000, width: 800, height: 600 }

      for (let frame = 0; frame < 40; frame++) {
        target = moving ? { ...target, x: 3000 + frame } : target
        following.update({ ...target })
        canvas.run(16)
      }

      // Still being told, it's there, or a frame or two behind the moving view.
      const view = camera.get()
      expect(Math.abs(view.x - target.x)).toBeLessThan(4)
      expect(view.y).toBeCloseTo(-2000)
      expect(view.width).toBeCloseTo(800)
    }
  })

  it("fits what it follows to the window again when the window is resized", () => {
    const canvas = fakeCanvas()
    const camera = createCamera(canvas.port)
    const following = camera.follow({ x: 0, y: 0, width: 400, height: 300 })
    canvas.run(glideMs + 32)
    canvas.resize(400, 300)
    expect(following.active).toBe(true)
    expect(camera.get().width).toBeCloseTo(400)
  })
})
