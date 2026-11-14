import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { defaultSettings } from "@parity-app/settings"
import { afterEach, describe, expect, it, vi } from "vite-plus/test"
import { z } from "zod"
import type { SettingsState } from "../shared/settings.ts"
import { withFileLock } from "./file-lock.ts"
import { type SettingsStore, settingsStore } from "./settings-store.ts"

let folder: string
const stores: SettingsStore[] = []

function setUp(): string {
  folder = mkdtempSync(join(tmpdir(), "parity-settings-"))

  return join(folder, "settings.json")
}

function open(file: string, changed: (state: SettingsState) => void = () => undefined): SettingsStore {
  const store = settingsStore(file, { changed, settleMs: 20, retryMs: 20, retryMaxMs: 40 })
  stores.push(store)

  return store
}

/** What the file holds, as an object of its keys. */
function saved(file: string): Record<string, JsonValue> {
  return z.record(z.string(), z.json()).parse(JSON.parse(readFileSync(file, "utf8")))
}

type JsonValue = z.infer<ReturnType<typeof z.json>>

afterEach(() => {
  for (const store of stores.splice(0)) {
    store.close()
  }

  rmSync(folder, { recursive: true, force: true })
})

describe("settings.json", () => {
  it("starts at the defaults and writes nothing until something changes", () => {
    const file = setUp()
    const store = open(file)

    expect(store.state()).toEqual({ values: defaultSettings, extensions: {}, badValues: [] })
    expect(existsSync(file)).toBe(false)
  })

  it("writes only what changed, and reads it back in a new copy", async () => {
    const file = setUp()
    await open(file).change({ theme: "light" })

    expect(saved(file)).toEqual({ theme: "light" })
    expect(open(file).state().values.theme).toBe("light")
  })

  it("keeps both copies' changes when they change settings at the same moment", async () => {
    const file = setUp()
    const one = open(file)
    const two = open(file)

    await Promise.all([one.change({ theme: "light" }), two.change({ snapping: false }), one.change({ autosave: true })])

    expect(saved(file)).toEqual({ theme: "light", snapping: false, autosave: true })
  })

  it("tells a copy what another changed", async () => {
    const file = setUp()
    const heard = vi.fn<(state: SettingsState) => void>()
    open(file, heard)

    await open(file).change({ theme: "system" })

    await vi.waitFor(() =>
      expect(heard.mock.lastCall?.[0]).toEqual({
        values: { ...defaultSettings, theme: "system" },
        extensions: {},
        badValues: []
      })
    )
  })

  it("keeps extensions' settings by extension, both copies' changes, and tells the other copy (PAR-1090)", async () => {
    const file = setUp()
    const heard = vi.fn<(state: SettingsState) => void>()
    const one = open(file, heard)
    const two = open(file)

    await Promise.all([
      one.change({ extensions: { storybook: { openIn: "parity" } } }),
      two.change({ extensions: { tailwind: { strict: true } } })
    ])

    expect(saved(file)).toEqual({ extensions: { storybook: { openIn: "parity" }, tailwind: { strict: true } } })
    await vi.waitFor(() =>
      expect(heard.mock.lastCall?.[0].extensions).toEqual({
        storybook: { openIn: "parity" },
        tailwind: { strict: true }
      })
    )

    await two.change({ extensions: { storybook: { openIn: null } } })
    expect(saved(file)).toEqual({ extensions: { tailwind: { strict: true } } })
    expect(two.state().extensions).toEqual({ tailwind: { strict: true } })
  })

  it("puts a setting back to its default", async () => {
    const file = setUp()
    const store = open(file)
    await store.change({ theme: "light", snapping: false })
    await store.change({ theme: null })

    expect(saved(file)).toEqual({ snapping: false })
    expect(store.state().values.theme).toBe("dark")
  })

  it("never writes over a file it can't read, and keeps the change for this run", async () => {
    const file = setUp()
    writeFileSync(file, "{ half")
    const store = open(file)

    expect(store.state().problem).toMatch(/isn't JSON/)

    const after = await store.change({ theme: "light" })

    expect(after.values.theme).toBe("light")
    expect(after.unsaved).toBe(true)
    expect(readFileSync(file, "utf8")).toBe("{ half")
  })

  it("saves a held change once the file reads again, without undoing another copy's", async () => {
    const file = setUp()
    writeFileSync(file, "{ half")
    const store = open(file)
    await store.change({ theme: "light" })

    writeFileSync(file, JSON.stringify({ snapping: false }))

    await vi.waitFor(() => expect(saved(file)).toEqual({ snapping: false, theme: "light" }))
    await vi.waitFor(() => expect(store.state().unsaved).toBeUndefined())
  })
})

describe("the lock", () => {
  it("takes a lock a copy that died left behind", async () => {
    const file = setUp()
    writeFileSync(`${file}.lock`, JSON.stringify({ pid: 1, at: Date.now() - 60_000 }))

    await expect(withFileLock(file, () => Promise.resolve("done"))).resolves.toBe("done")
  })

  it("waits for a copy holding it, then gives up", async () => {
    const file = setUp()
    writeFileSync(`${file}.lock`, JSON.stringify({ pid: 1, at: Date.now() }))

    await expect(withFileLock(file, () => Promise.resolve("done"), { waitMs: 50 })).rejects.toThrow(/held by another/)
  })

  it("lets go when the work fails", async () => {
    const file = setUp()

    await expect(withFileLock(file, () => Promise.reject(new Error("no")))).rejects.toThrow("no")
    await expect(withFileLock(file, () => Promise.resolve("again"))).resolves.toBe("again")
  })
})
