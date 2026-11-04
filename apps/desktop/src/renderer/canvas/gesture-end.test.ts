import { describe, expect, it } from "vite-plus/test"
import { onGestureEnd } from "./gesture-end.ts"

/** A key press as the window gets it. */
const press = (key: string) => Object.assign(new Event("keydown", { cancelable: true }), { key })

/** Follows a gesture on a stand-in window, logging how it ends. */
function follow() {
  const target = new EventTarget()
  const ends: string[] = []
  const stop = onGestureEnd(target, (how) => ends.push(how))
  return { target, ends, stop }
}

describe("how a pointer gesture ends", () => {
  it("ends once, at the release, the pointer being cancelled, the window losing focus or Escape", () => {
    const cases: [Event, string][] = [
      [new Event("pointerup"), "release"],
      [new Event("pointercancel"), "interrupted"],
      [new Event("blur"), "interrupted"],
      [press("Escape"), "escape"]
    ]
    for (const [event, how] of cases) {
      const { target, ends } = follow()
      target.dispatchEvent(event)
      // Whatever comes after belongs to no gesture, so nothing is left listening for it.
      for (const after of [new Event("pointerup"), new Event("pointercancel"), new Event("blur"), press("Escape")]) {
        target.dispatchEvent(after)
      }
      expect(ends).toEqual([how])
    }
  })

  it("keeps Escape from going further, and lets other keys by", () => {
    const { target, ends } = follow()
    const other = press("a")
    target.dispatchEvent(other)
    expect(other.defaultPrevented).toBe(false)
    expect(ends).toEqual([])
    const escape = press("Escape")
    target.dispatchEvent(escape)
    expect(escape.defaultPrevented).toBe(true)
  })

  it("stops listening when the gesture is given up, without ending it", () => {
    const { target, ends, stop } = follow()
    stop()
    target.dispatchEvent(new Event("pointerup"))
    expect(ends).toEqual([])
  })

  it("leaves one gesture's end to that gesture, when another follows it", () => {
    const target = new EventTarget()
    const ends: string[] = []
    onGestureEnd(target, (how) => ends.push(`first ${how}`))
    target.dispatchEvent(new Event("blur"))
    onGestureEnd(target, (how) => ends.push(`second ${how}`))
    target.dispatchEvent(new Event("pointerup"))
    expect(ends).toEqual(["first interrupted", "second release"])
  })
})
