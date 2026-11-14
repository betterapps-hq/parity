import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vite-plus/test"
import type { KeybindingsState } from "../shared/keybindings.ts"
import { keybindingsFile } from "./keybindings.ts"

function fileIn(): string {
  return join(mkdtempSync(join(tmpdir(), "parity-keybindings-")), "data", "keybindings.json")
}

/** A copy's `keybindings.json`, and what it sent the windows. */
function opened(file: string) {
  const sent: KeybindingsState[] = []

  return { store: keybindingsFile(file, (state) => sent.push(state)), sent }
}

describe("keybindingsFile", () => {
  it("starts with no changes when there's no file, and writes nothing until one's made", () => {
    const file = fileIn()
    const { store } = opened(file)

    expect(store.state()).toEqual({ entries: [] })
    expect(() => readFileSync(file)).toThrow(/ENOENT/)
  })

  it("reads the file at start", async () => {
    const file = fileIn()
    await opened(file).store.replace([{ command: "save", keys: ["Ctrl Alt S"] }])

    expect(opened(file).store.state()).toEqual({ entries: [{ command: "save", keys: ["Ctrl Alt S"] }] })
  })

  it("makes changes one at a time to the file as it is, keeping entries it skips, and tells the windows", async () => {
    const file = fileIn()
    const { store } = opened(file)
    await store.replace([])
    writeFileSync(file, JSON.stringify([{ command: "launch", keys: ["Ctrl L"] }]))
    const { store: copy, sent } = opened(file)

    await Promise.all([
      copy.replace([{ command: "save", keys: ["Ctrl K"] }]),
      copy.replace([{ command: "undo", keys: [] }])
    ])

    const entries = [
      { command: "launch", keys: ["Ctrl L"] },
      { command: "save", keys: ["Ctrl K"] },
      { command: "undo", keys: [] }
    ]

    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual(entries)
    expect(copy.state()).toEqual({ entries })
    expect(sent.at(-1)).toEqual({ entries })
  })

  it("never writes over a file it can't read, and says why", async () => {
    const file = fileIn()
    const { store } = opened(file)
    await store.replace([])
    writeFileSync(file, '[{ "command": "save", ')
    const { store: copy, sent } = opened(file)

    expect(copy.state()).toEqual({ entries: [], problem: expect.stringMatching(/isn't JSON/) })
    await expect(copy.replace([{ command: "save", keys: ["Ctrl K"] }])).rejects.toThrow(/Parity didn't change it/)
    expect(readFileSync(file, "utf8")).toBe('[{ "command": "save", ')
    expect(sent).toEqual([{ entries: [], problem: expect.stringMatching(/isn't JSON/) }])

    // Fixed by hand, it's read again for the next change.
    writeFileSync(file, "[]")
    await copy.replace([{ command: "save", keys: ["Ctrl K"] }])
    expect(copy.state()).toEqual({ entries: [{ command: "save", keys: ["Ctrl K"] }] })
  })

  it("makes an empty file to open when there's none, and leaves one that's there", async () => {
    const file = fileIn()
    const { store } = opened(file)

    expect(await store.ensure()).toBe(file)
    expect(readFileSync(file, "utf8")).toBe("[]\n")

    writeFileSync(file, "not json")
    await store.ensure()
    expect(readFileSync(file, "utf8")).toBe("not json")
  })
})
