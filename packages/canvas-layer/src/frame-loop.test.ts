import { describe, expect, it } from "vite-plus/test"
import { createFrameLoop } from "./frame-loop.ts"

/** Animation frames run by hand. */
function frames() {
  const waiting = new Map<number, (time: number) => void>()
  let next = 0

  return {
    request: (callback: (time: number) => void) => {
      next += 1
      waiting.set(next, callback)

      return next
    },
    cancel: (handle: number) => void waiting.delete(handle),
    get waiting() {
      return waiting.size
    },
    run(time: number) {
      const now = [...waiting.values()]
      waiting.clear()

      for (const callback of now) {
        callback(time)
      }
    }
  }
}

describe("createFrameLoop", () => {
  it("measures every frame before any draws, and gives each draw the time since the frame before", () => {
    const clock = frames()
    const loop = createFrameLoop(clock)
    const order: string[] = []
    const failed = () => undefined

    loop.add({ measure: () => order.push("measure a"), draw: (dt) => order.push(`draw a ${dt}`) }, failed)
    loop.add({ measure: () => order.push("measure b"), draw: (dt) => order.push(`draw b ${dt}`) }, failed)
    clock.run(100)
    clock.run(116)

    expect(order).toEqual([
      "measure a",
      "measure b",
      "draw a 0",
      "draw b 0",
      "measure a",
      "measure b",
      "draw a 16",
      "draw b 16"
    ])
  })

  it("rests while nothing is added or the tab is hidden, and starts again from a fresh frame", () => {
    const clock = frames()
    const loop = createFrameLoop(clock)
    const drawn: number[] = []

    expect(clock.waiting).toBe(0)
    const remove = loop.add({ draw: (dt) => drawn.push(dt) }, () => undefined)
    clock.run(0)
    loop.setVisible(false)
    expect(clock.waiting).toBe(0)
    loop.setVisible(true)
    clock.run(500)
    remove()

    expect(clock.waiting).toBe(0)
    expect(drawn).toEqual([0, 0])
  })

  it("gives a frame's throw to its own handler and runs the rest", () => {
    const clock = frames()
    const loop = createFrameLoop(clock)
    const errors: string[] = []
    let drawn = 0

    loop.add(
      {
        draw: () => {
          throw new Error("broken")
        }
      },
      (error) => errors.push(error.message)
    )
    loop.add({ draw: () => (drawn += 1) }, () => undefined)
    clock.run(0)

    expect(errors).toEqual(["broken"])
    expect(drawn).toBe(1)
  })
})
