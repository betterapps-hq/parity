import { describe, expect, it } from "vite-plus/test"
import { keysFromEvent, matches } from "./keys.ts"

/** A key event as the browser gives it, with nothing held unless asked. */
function press(key: string, code: string, held: Partial<Pick<KeyboardEvent, "ctrlKey" | "altKey" | "shiftKey">> = {}) {
  return { key, code, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...held }
}

describe("the keys a key event is", () => {
  it("writes letters and modifiers as the keymap does", () => {
    expect(keysFromEvent(press("k", "KeyK", { ctrlKey: true, shiftKey: true }))).toBe("Ctrl Shift K")
    expect(keysFromEvent(press("v", "KeyV"))).toBe("V")
  })

  it("names a key by its place when the layout types something else", () => {
    expect(keysFromEvent(press("!", "Digit1", { shiftKey: true }))).toBe("Shift 1")
    expect(keysFromEvent(press("å", "KeyA", { altKey: true }))).toBe("Alt A")
  })

  it("names arrows, Space, Delete and Escape as the keymap writes them", () => {
    expect(keysFromEvent(press("ArrowLeft", "ArrowLeft", { altKey: true }))).toBe("Alt ←")
    expect(keysFromEvent(press(" ", "Space"))).toBe("Space")
    expect(keysFromEvent(press("Delete", "Delete"))).toBe("Del")
    expect(keysFromEvent(press("Escape", "Escape"))).toBe("Esc")
  })

  it("leaves Shift off plus and minus, which some keyboards type with it", () => {
    expect(keysFromEvent(press("+", "Equal", { ctrlKey: true, shiftKey: true }))).toBe("Ctrl +")
  })

  it("is nothing for a modifier alone", () => {
    expect(keysFromEvent(press("Control", "ControlLeft", { ctrlKey: true }))).toBeUndefined()
  })

  it("writes keys the event matches", () => {
    const events = [press("ArrowUp", "ArrowUp", { shiftKey: true }), press("[", "BracketLeft", { ctrlKey: true })]

    for (const event of events) {
      expect(matches(event, keysFromEvent(event) ?? "")).toBe(true)
    }
  })
})
