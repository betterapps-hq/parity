import { describe, expect, it } from "vite-plus/test"
import { keymapKeys, resolveKeys } from "./keys.ts"

describe("extensions' keys", () => {
  it.each([
    ["mod+shift+t", "Ctrl Shift T"],
    ["shift+alt+k", "Alt Shift K"],
    ["ctrl+enter", "Ctrl Enter"],
    ["f2", "F2"],
    ["alt+left", "Alt ←"],
    ["mod++", "Ctrl +"]
  ])("writes %s as the keymap does: %s", (written, expected) => {
    expect(keymapKeys(written)).toBe(expected)
  })

  it("refuses keys it can't read", () => {
    expect(() => keymapKeys("hyper+t")).toThrow("hyper isn't a modifier")
    expect(() => keymapKeys("mod+shift")).toThrow("only modifiers")
    expect(() => keymapKeys("mod+banana")).toThrow("banana isn't a key")
  })

  it("lets Parity's own keys win, and names two extensions on one key", () => {
    const resolved = resolveKeys(
      ["Ctrl D", "Ctrl Alt Shift K"],
      [
        {
          id: "timings",
          keybindings: [
            { command: "timings.measure", key: "mod+shift+m" },
            { command: "timings.copy", key: "mod+d" },
            { command: "timings.open", key: "mod+alt+o", when: "node.type == route" }
          ]
        },
        { id: "a11y", keybindings: [{ command: "a11y.check", key: "shift+alt+mod+k" }] },
        { id: "lint", keybindings: [{ command: "lint.run", key: "mod+alt+o" }] }
      ]
    )

    expect(resolved.keys).toEqual([{ extension: "timings", command: "timings.measure", keys: "Ctrl Shift M" }])
    expect(resolved.clashes).toEqual([
      { extension: "timings", command: "timings.copy", keys: "Ctrl D", with: "parity" },
      { extension: "timings", command: "timings.open", keys: "Ctrl Alt O", with: ["lint"] },
      { extension: "lint", command: "lint.run", keys: "Ctrl Alt O", with: ["timings"] },
      { extension: "a11y", command: "a11y.check", keys: "Ctrl Alt Shift K", with: "parity" }
    ])
  })
})
