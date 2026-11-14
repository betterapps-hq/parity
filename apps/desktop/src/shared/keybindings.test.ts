import { describe, expect, it } from "vite-plus/test"
import {
  applyReplacements,
  changeKeys,
  type KeyEntry,
  readKeybindings,
  readKeys,
  resolveBindings
} from "./keybindings.ts"

/** A small keymap, as the window's has: some commands with one key, one with two. */
const defaults = {
  save: { keys: ["Ctrl S"] },
  undo: { keys: ["Ctrl Z"] },
  redo: { keys: ["Ctrl Shift Z", "Ctrl Y"] },
  hide: { keys: ["Ctrl Shift H"] }
} as const

/** Each command's keys in the small keymap. */
const keymapKeys = { save: ["Ctrl S"], undo: ["Ctrl Z"], redo: ["Ctrl Shift Z", "Ctrl Y"], hide: ["Ctrl Shift H"] }

describe("readKeys", () => {
  it("reads keys as the keymap writes them", () => {
    expect(readKeys("Ctrl Shift K")).toBe("Ctrl Shift K")
    expect(readKeys("Ctrl Alt Shift N")).toBe("Ctrl Alt Shift N")
    expect(readKeys("Shift ←")).toBe("Shift ←")
    expect(readKeys("Ctrl \\")).toBe("Ctrl \\")
    expect(readKeys("F2")).toBe("F2")
  })

  it("puts modifiers in the keymap's order and capitals in their place", () => {
    expect(readKeys("shift ctrl k")).toBe("Ctrl Shift K")
    expect(readKeys("  Alt   del ")).toBe("Alt Del")
    expect(readKeys("ctrl pageup")).toBe("Ctrl PageUp")
  })

  it("reads nothing from keys it can't", () => {
    expect(readKeys("")).toBeUndefined()
    expect(readKeys("Ctrl")).toBeUndefined()
    expect(readKeys("Hyper K")).toBeUndefined()
    expect(readKeys("Cmd K")).toBeUndefined()
    expect(readKeys("Ctrl Ctrl K")).toBeUndefined()
    expect(readKeys("Ctrl K L")).toBeUndefined()
    expect(readKeys("Ctrl F25")).toBeUndefined()
  })
})

describe("readKeybindings", () => {
  it("reads no file, or an empty one, as no changes", () => {
    expect(readKeybindings(undefined)).toEqual({ entries: [] })
    expect(readKeybindings("  \n")).toEqual({ entries: [] })
  })

  it("reads each entry, writing one that isn't { command, keys } as text", () => {
    const text = JSON.stringify([
      { command: "save", keys: ["Ctrl Alt S"] },
      { command: "undo", keys: "Ctrl Q" },
      { command: 7, keys: [8] },
      "hide"
    ])

    expect(readKeybindings(text)).toEqual({
      entries: [
        { command: "save", keys: ["Ctrl Alt S"] },
        { command: "undo", keys: ["Ctrl Q"] },
        { command: "7", keys: ["8"] },
        { command: "hide", keys: [] }
      ]
    })
  })

  it("says why text that isn't a list can't be read", () => {
    expect(readKeybindings("[{")).toEqual({
      entries: [],
      problem: expect.stringMatching(/^keybindings.json isn't JSON/)
    })
    expect(readKeybindings('{ "save": "Ctrl S" }')).toEqual({
      entries: [],
      problem: "keybindings.json isn't a list of { command, keys }."
    })
  })
})

describe("resolveBindings", () => {
  it("gives each command the keymap's keys when nothing's changed", () => {
    expect(resolveBindings(defaults, [])).toEqual({ keys: keymapKeys, changed: {}, lost: {}, skipped: [] })
  })

  it("replaces all of a command's keys with an entry's, and removes them with none", () => {
    const resolved = resolveBindings(defaults, [
      { command: "redo", keys: ["ctrl shift y"] },
      { command: "hide", keys: [] }
    ])

    expect(resolved.keys.redo).toEqual(["Ctrl Shift Y"])
    expect(resolved.keys.hide).toEqual([])
    expect(resolved.changed).toEqual({ redo: "Ctrl Shift Y", hide: "" })
  })

  it("skips and lists an entry for a command that doesn't exist or with keys that don't read", () => {
    const resolved = resolveBindings(defaults, [
      { command: "launch", keys: ["Ctrl L"] },
      { command: "save", keys: ["Ctrl Alt S", "Hyper S"] },
      { command: "toString", keys: [] }
    ])

    expect(resolved.keys.save).toEqual(["Ctrl S"])
    expect(resolved.changed).toEqual({})
    expect(resolved.skipped).toEqual([
      { command: "launch", keys: "Ctrl L" },
      { command: "save", keys: "Ctrl Alt S, Hyper S" },
      { command: "toString", keys: "" }
    ])
  })

  it("gives keys two commands have to the one an entry gives them, and says which lost them", () => {
    const resolved = resolveBindings(defaults, [{ command: "save", keys: ["Ctrl Z"] }])

    expect(resolved.keys.save).toEqual(["Ctrl Z"])
    expect(resolved.keys.undo).toEqual([])
    expect(resolved.changed).toEqual({ save: "Ctrl Z", undo: "" })
    expect(resolved.lost).toEqual({ undo: "save" })
  })

  it("gives keys two entries share to the later one", () => {
    const resolved = resolveBindings(defaults, [
      { command: "save", keys: ["Ctrl K"] },
      { command: "hide", keys: ["Ctrl K"] }
    ])

    expect(resolved.keys.save).toEqual([])
    expect(resolved.keys.hide).toEqual(["Ctrl K"])
    expect(resolved.lost).toEqual({ save: "hide" })
  })

  it("still says where a command's keys went once its entry is written without them", () => {
    const resolved = resolveBindings(defaults, [
      { command: "save", keys: ["Ctrl Y"] },
      { command: "redo", keys: ["Ctrl Shift Z"] }
    ])

    expect(resolved.lost).toEqual({ redo: "save" })
    expect(resolved.changed).toEqual({ save: "Ctrl Y", redo: "Ctrl Shift Z" })
  })

  it("doesn't say a command lost keys the person moved it off", () => {
    const resolved = resolveBindings(defaults, [
      { command: "undo", keys: ["Ctrl U"] },
      { command: "save", keys: ["Ctrl Z"] }
    ])

    expect(resolved.lost).toEqual({})
  })
})

describe("changeKeys", () => {
  it("writes a command's new keys", () => {
    expect(changeKeys(defaults, [], "save", ["Ctrl Alt S"])).toEqual({
      replacements: [{ command: "save", keys: ["Ctrl Alt S"] }],
      lost: undefined
    })
  })

  it("takes keys another command has, which keeps its others or gets none", () => {
    expect(changeKeys(defaults, [], "save", ["Ctrl Z"])).toEqual({
      replacements: [
        { command: "undo", keys: [] },
        { command: "save", keys: ["Ctrl Z"] }
      ],
      lost: "undo"
    })

    expect(changeKeys(defaults, [], "save", ["Ctrl Y"])).toEqual({
      replacements: [
        { command: "redo", keys: ["Ctrl Shift Z"] },
        { command: "save", keys: ["Ctrl Y"] }
      ],
      lost: "redo"
    })
  })

  it("removes a command's entry to give it the keymap's keys, taking them back", () => {
    const entries: KeyEntry[] = [
      { command: "undo", keys: [] },
      { command: "save", keys: ["Ctrl Z"] }
    ]

    expect(changeKeys(defaults, entries, "undo", undefined)).toEqual({
      replacements: [
        { command: "save", keys: [] },
        { command: "undo", keys: null }
      ],
      lost: "save"
    })
    expect(changeKeys(defaults, [{ command: "hide", keys: [] }], "hide", ["Ctrl Shift H"]).replacements).toEqual([
      { command: "hide", keys: null }
    ])
  })

  it("leaves the file with what the change meant", () => {
    const { replacements } = changeKeys(defaults, [], "save", ["Ctrl Z"])
    const after = readKeybindings(applyReplacements(undefined, replacements))

    expect(resolveBindings(defaults, after.entries).keys).toEqual({ ...keymapKeys, save: ["Ctrl Z"], undo: [] })
  })
})

describe("applyReplacements", () => {
  it("replaces a command's entries in the first one's place, keeping every other as it's written", () => {
    const text = JSON.stringify([
      { command: "launch", keys: ["Ctrl L"], note: "mine" },
      { command: "save", keys: ["Ctrl Alt S"] },
      { command: "hide", keys: "H" },
      { command: "save", keys: ["Ctrl Q"] }
    ])

    expect(JSON.parse(applyReplacements(text, [{ command: "save", keys: ["Ctrl K"] }]))).toEqual([
      { command: "launch", keys: ["Ctrl L"], note: "mine" },
      { command: "save", keys: ["Ctrl K"] },
      { command: "hide", keys: "H" }
    ])
  })

  it("adds an entry at the end, removes one with null, and starts a file from nothing", () => {
    const text = applyReplacements(undefined, [
      { command: "save", keys: ["Ctrl K"] },
      { command: "undo", keys: [] }
    ])

    expect(text).toBe(
      '[\n  {\n    "command": "save",\n    "keys": [\n      "Ctrl K"\n    ]\n  },\n  {\n    "command": "undo",\n    "keys": []\n  }\n]\n'
    )
    expect(JSON.parse(applyReplacements(text, [{ command: "save", keys: null }]))).toEqual([
      { command: "undo", keys: [] }
    ])
  })

  it("refuses text that isn't a list rather than starting again", () => {
    expect(() => applyReplacements("[{", [{ command: "save", keys: null }])).toThrow(/isn't JSON/)
    expect(() => applyReplacements("{}", [{ command: "save", keys: null }])).toThrow(/isn't a list/)
  })
})
