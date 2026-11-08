import { describe, expect, it } from "vite-plus/test"
import type { FirstFrame } from "../opening.ts"
import { watchFirstFrame } from "./first-frame.ts"

/** A watch whose animation frames run when `frame()` says, and whose elements are seen when listed in `visible`. */
function watch() {
  const recorded: FirstFrame[] = []
  const visible = new Set<Element>()
  let next: (() => void) | undefined
  const firstFrame = watchFirstFrame((from) => recorded.push(from), {
    seen: (element) => visible.has(element),
    schedule: (tick) => {
      next = tick
      return 1
    },
    cancel: () => {
      next = undefined
    }
  })
  const frame = () => {
    const tick = next
    next = undefined
    tick?.()
  }
  return { recorded, visible, firstFrame, frame, waiting: () => next !== undefined }
}

const element = (name: string) => ({ name }) as unknown as Element

describe("watchFirstFrame", () => {
  it("records the first frame seen, not the first offered, and only once", () => {
    const { recorded, visible, firstFrame, frame, waiting } = watch()
    const bitmap = element("bitmap")
    const live = element("live")
    firstFrame.offer(bitmap, "bitmap")
    firstFrame.offer(live, "live")
    frame()
    expect(recorded).toEqual([])
    visible.add(live)
    frame()
    expect(recorded).toEqual(["live"])
    visible.add(bitmap)
    firstFrame.offer(element("later"), "bitmap")
    frame()
    expect(recorded).toEqual(["live"])
    expect(waiting()).toBe(false)
  })

  it("looks only while something is offered, and not at what was taken back", () => {
    const { recorded, visible, firstFrame, frame, waiting } = watch()
    const bitmap = element("bitmap")
    visible.add(bitmap)
    const takeBack = firstFrame.offer(bitmap, "bitmap")
    expect(waiting()).toBe(true)
    takeBack()
    expect(waiting()).toBe(false)
    frame()
    expect(recorded).toEqual([])
  })
})
