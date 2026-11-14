import { afterEach, describe, expect, it, vi } from "vite-plus/test"
import {
  applyReplacements,
  type KeybindingsState,
  type Replacement,
  readKeybindings,
  readKeys
} from "../../shared/keybindings.ts"
import type { CanvasHost } from "../../shared/protocol.ts"
import { resetWindowStores } from "../store.ts"
import { resetKeys, setKeys, startKeybindings } from "./keybindings.ts"
import { keymap, keysOf, shortcutFor, shortcutOf } from "./keymap.ts"

type Host = CanvasHost["keybindings"]

/** Main, as far as the window knows it: a `keybindings.json` it changes, telling the window each time. */
function main(text?: string) {
  let file = text
  let listener: ((state: KeybindingsState) => void) | undefined
  const sent: Replacement[][] = []

  const host: Host = {
    get: () => Promise.resolve(readKeybindings(file)),
    replace: (replacements) => {
      sent.push(replacements)
      file = applyReplacements(file, replacements)
      listener?.(readKeybindings(file))

      return Promise.resolve(readKeybindings(file))
    },
    open: () => Promise.resolve(),
    subscribe: (heard) => {
      listener = heard

      return () => undefined
    }
  }

  vi.stubGlobal("window", { canvasHost: { keybindings: host } })

  return { host, sent, tell: (state: KeybindingsState) => listener?.(state) }
}

/** A key event with Ctrl held, as the key handlers get one. */
function ctrl(key: string): KeyboardEvent {
  const event = {
    key,
    code: `Key${key.toUpperCase()}`,
    ctrlKey: true,
    metaKey: false,
    shiftKey: false,
    altKey: false
  } satisfies Partial<KeyboardEvent>

  // SAFETY: `matches` reads only the key, the code and the modifier flags, which this sets.
  return event as KeyboardEvent
}

afterEach(() => {
  resetWindowStores()
  vi.unstubAllGlobals()
})

describe("the keymap's keys", () => {
  it("are each written as keybindings.json reads them", () => {
    for (const keys of Object.values(keymap).flatMap((binding) => binding.keys)) {
      expect(readKeys(keys)).toBe(keys)
    }
  })
})

describe("keybindings.json in the window", () => {
  it("gives the key handlers, menus and tooltips the person's keys", async () => {
    const { host } = main(JSON.stringify([{ command: "save", keys: ["Ctrl Alt S"] }]))
    startKeybindings(host)

    await vi.waitFor(() => expect(keysOf("save")).toEqual(["Ctrl Alt S"]))
    expect(shortcutOf("save", false)).toBe("Ctrl+Alt+S")
    expect(shortcutOf("save", true)).toBe("⌥⌘S")
    expect(shortcutFor(ctrl("s"), ["save"])).toBeUndefined()
    expect(keysOf("undo")).toEqual(keymap.undo.keys)
  })

  it("follows what main sends as the file changes", async () => {
    const { host, tell } = main()
    startKeybindings(host)
    await vi.waitFor(() => expect(keysOf("save")).toEqual(["Ctrl S"]))

    tell({ entries: [{ command: "save", keys: [] }] })

    expect(keysOf("save")).toEqual([])
    expect(shortcutOf("save", false)).toBe("")
  })

  it("gives a command new keys, taking them from the command that had them", async () => {
    const { sent } = main()

    expect(await setKeys("save", "ctrl z")).toEqual({ lost: "undo" })
    expect(sent).toEqual([
      [
        { command: "undo", keys: [] },
        { command: "save", keys: ["Ctrl Z"] }
      ]
    ])
    expect(keysOf("save")).toEqual(["Ctrl Z"])
    expect(shortcutFor(ctrl("z"), ["undo", "save"])).toBe("save")
  })

  it("removes a command's keys, and gives it the keymap's again", async () => {
    main()

    expect(await setKeys("save", "")).toEqual({})
    expect(keysOf("save")).toEqual([])
    expect(await resetKeys("save")).toEqual({})
    expect(keysOf("save")).toEqual(["Ctrl S"])
  })

  it("refuses keys that don't read, asking main nothing", async () => {
    const { sent } = main()

    await expect(setKeys("save", "Hyper S")).rejects.toThrow(`Parity can't read the keys "Hyper S"`)
    expect(sent).toEqual([])
  })
})
