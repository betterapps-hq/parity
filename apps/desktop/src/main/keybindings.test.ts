import { mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vite-plus/test"
import type { KeybindingsState } from "../shared/keybindings.ts"
import type { LockOptions } from "./file-lock.ts"
import { type KeybindingsFile, keybindingsFile } from "./keybindings.ts"

let folder: string
const stores: KeybindingsFile[] = []

function fileIn(): string {
  folder = mkdtempSync(join(tmpdir(), "parity-keybindings-"))
  mkdirSync(join(folder, "data"))

  return join(folder, "data", "keybindings.json")
}

/** A copy's `keybindings.json`, and what it sent the windows. */
function opened(file: string, lock: LockOptions = {}) {
  const sent: KeybindingsState[] = []

  const store = keybindingsFile(file, {
    changed: (state) => sent.push(state),
    settleMs: 20,
    retryMs: 20,
    retryMaxMs: 40,
    lock
  })

  stores.push(store)

  return { store, sent }
}

afterEach(() => {
  for (const store of stores.splice(0)) {
    store.close()
  }

  rmSync(folder, { recursive: true, force: true })
})

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

  it("keeps both copies' changes when they change keys at the same moment (PAR-1122)", async () => {
    const file = fileIn()
    const one = opened(file).store
    const two = opened(file).store

    await Promise.all([
      one.replace([{ command: "save", keys: ["Ctrl K"] }]),
      two.replace([{ command: "undo", keys: ["Ctrl U"] }])
    ])

    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual(
      expect.arrayContaining([
        { command: "save", keys: ["Ctrl K"] },
        { command: "undo", keys: ["Ctrl U"] }
      ])
    )
  })

  it("tells the windows of a key changed in another copy or by hand (PAR-1122)", async () => {
    const file = fileIn()
    const { sent } = opened(file)

    await opened(file).store.replace([{ command: "save", keys: ["Ctrl K"] }])
    await vi.waitFor(() => expect(sent.at(-1)).toEqual({ entries: [{ command: "save", keys: ["Ctrl K"] }] }))

    writeFileSync(file, JSON.stringify([{ command: "undo", keys: ["Ctrl U"] }]))
    await vi.waitFor(() => expect(sent.at(-1)).toEqual({ entries: [{ command: "undo", keys: ["Ctrl U"] }] }))
  })

  it("never writes over a file it can't read, says why, and keeps the keys it had", async () => {
    const file = fileIn()
    writeFileSync(file, JSON.stringify([{ command: "save", keys: ["Ctrl K"] }]))
    const { store } = opened(file)

    writeFileSync(file, '[{ "command": "save", ')
    store.check()

    expect(store.state()).toEqual({
      entries: [{ command: "save", keys: ["Ctrl K"] }],
      problem: expect.stringMatching(/isn't JSON/)
    })
    await expect(store.replace([{ command: "undo", keys: [] }])).rejects.toThrow(/Parity didn't change it/)
    expect(readFileSync(file, "utf8")).toBe('[{ "command": "save", ')

    // Fixed by hand, it's read again for the next change.
    writeFileSync(file, "[]")
    await store.replace([{ command: "undo", keys: [] }])
    expect(store.state()).toEqual({ entries: [{ command: "undo", keys: [] }] })
  })

  it("applies a change it can't write yet for this run, and writes it once it can (PAR-1122)", async () => {
    const file = fileIn()
    writeFileSync(`${file}.lock`, JSON.stringify({ pid: 1, at: Date.now() }))
    const { store } = opened(file, { waitMs: 20 })

    const held = await store.replace([{ command: "save", keys: ["Ctrl K"] }])

    expect(held).toEqual({ entries: [{ command: "save", keys: ["Ctrl K"] }], unsaved: true })

    unlinkSync(`${file}.lock`)
    await vi.waitFor(() => expect(store.state()).toEqual({ entries: [{ command: "save", keys: ["Ctrl K"] }] }))
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual([{ command: "save", keys: ["Ctrl K"] }])
  })

  it("makes an empty file to open when there's none, and leaves one that's there", () => {
    const file = fileIn()
    const { store } = opened(file)

    expect(store.ensure()).toBe(file)
    expect(readFileSync(file, "utf8")).toBe("[]\n")

    writeFileSync(file, "not json")
    store.ensure()
    expect(readFileSync(file, "utf8")).toBe("not json")
  })
})
