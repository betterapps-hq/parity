import { describe, expect, it } from "vitest"
import { type Command, keymap, shortcutFor } from "./keymap.ts"
import { formatKeys, matches } from "./keys.ts"

/** A key event as the browser sends one: `key` is what the layout types, `code` the physical key. */
const press = (key: string, code: string, held: Partial<Record<"ctrl" | "meta" | "shift" | "alt", boolean>> = {}) =>
  ({
    key,
    code,
    ctrlKey: held.ctrl ?? false,
    metaKey: held.meta ?? false,
    shiftKey: held.shift ?? false,
    altKey: held.alt ?? false
  }) as KeyboardEvent

describe("matches", () => {
  it("needs exactly the modifiers written", () => {
    expect(matches(press("z", "KeyZ", { ctrl: true }), "Ctrl Z")).toBe(true)
    expect(matches(press("Z", "KeyZ", { ctrl: true, shift: true }), "Ctrl Z")).toBe(false)
    expect(matches(press("Z", "KeyZ", { ctrl: true, shift: true }), "Ctrl Shift Z")).toBe(true)
    expect(matches(press("H", "KeyH", { shift: true }), "H")).toBe(false)
  })

  it("takes Cmd for Ctrl", () => {
    expect(matches(press("s", "KeyS", { meta: true }), "Ctrl S")).toBe(true)
  })

  it("reads letters from the layout, and from the key's place when Alt types another character", () => {
    // AZERTY: the key in QWERTY's W place types Z.
    expect(matches(press("z", "KeyW", { ctrl: true }), "Ctrl Z")).toBe(true)
    expect(matches(press("z", "KeyW", { ctrl: true }), "Ctrl W")).toBe(false)
    // A Mac's Option+A types å.
    expect(matches(press("å", "KeyA", { alt: true }), "Alt A")).toBe(true)
    // A Cyrillic layout's Ctrl+С is still copy.
    expect(matches(press("с", "KeyC", { ctrl: true }), "Ctrl C")).toBe(true)
  })

  it("reads digits and punctuation by the key's place, whatever Shift types", () => {
    expect(matches(press(")", "Digit0", { shift: true }), "Shift 0")).toBe(true)
    expect(matches(press("?", "Slash", { ctrl: true, shift: true }), "Ctrl Shift ?")).toBe(true)
    expect(matches(press("}", "BracketRight", { ctrl: true, shift: true }), "Ctrl Shift ]")).toBe(true)
    expect(matches(press("\\", "Backslash", { ctrl: true }), "Ctrl \\")).toBe(true)
  })

  it("zooms with plus and minus held with Shift or not, and on the number pad", () => {
    expect(matches(press("=", "Equal", { ctrl: true }), "Ctrl +")).toBe(true)
    expect(matches(press("+", "Equal", { ctrl: true, shift: true }), "Ctrl +")).toBe(true)
    expect(matches(press("+", "NumpadAdd"), "+")).toBe(true)
    expect(matches(press("-", "Minus"), "-")).toBe(true)
  })

  it("names keys such as Delete, Escape and F2", () => {
    expect(matches(press("Delete", "Delete"), "Del")).toBe(true)
    expect(matches(press("Escape", "Escape"), "Esc")).toBe(true)
    expect(matches(press("F2", "F2"), "F2")).toBe(true)
    expect(matches(press("Enter", "Enter", { shift: true }), "Shift Enter")).toBe(true)
  })
})

describe("shortcutFor", () => {
  it("finds the command any of a binding's keys runs", () => {
    const commands = Object.keys(keymap) as Command[]
    expect(shortcutFor(press("y", "KeyY", { ctrl: true }), commands)).toBe("redo")
    expect(shortcutFor(press("F2", "F2"), commands)).toBe("rename")
    expect(shortcutFor(press("r", "KeyR", { ctrl: true }), commands)).toBe("rename")
    expect(shortcutFor(press("H", "KeyH", { shift: true }), commands)).toBeUndefined()
  })

  it("never gives two commands the same keys", () => {
    const seen = new Map<string, string>()
    for (const [command, binding] of Object.entries(keymap)) {
      for (const keys of binding.keys) {
        expect(seen.get(keys), `${keys} is ${seen.get(keys)} and ${command}`).toBeUndefined()
        seen.set(keys, command)
      }
    }
  })
})

describe("formatKeys", () => {
  it("leaves keys as written off a Mac", () => {
    expect(formatKeys("Ctrl Shift Z", false)).toBe("Ctrl Shift Z")
  })

  it("uses the Mac's symbols, modifiers first in its order", () => {
    expect(formatKeys("Ctrl Shift Z", true)).toBe("⇧⌘Z")
    expect(formatKeys("Ctrl Alt C", true)).toBe("⌥⌘C")
    expect(formatKeys("Alt Shift H", true)).toBe("⌥⇧H")
    expect(formatKeys("Del", true)).toBe("⌫")
    expect(formatKeys("Shift 0", true)).toBe("⇧0")
  })

  it("leaves text that isn't keys alone", () => {
    expect(formatKeys("Hold Space", true)).toBe("Hold Space")
  })
})
