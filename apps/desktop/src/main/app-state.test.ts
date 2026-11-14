import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { goneAfterMs, type Projects } from "@parity-app/settings"
import { afterEach, describe, expect, it, vi } from "vite-plus/test"
import { type AppStateFiles, appStateFiles } from "./app-state.ts"

/** A window, as far as the files know one: a key that stays the same while it's open. */
interface TestWindow {
  id: number
}

let folder: string
const copies: AppStateFiles<TestWindow>[] = []
let clock = 1_000_000

/** A copy of Parity on the test's data folder. */
function copy(projectsChanged: (projects: Projects) => void = () => undefined): AppStateFiles<TestWindow> {
  folder ??= mkdtempSync(join(tmpdir(), "parity-state-"))

  const files = appStateFiles<TestWindow>(folder, {
    projectsChanged,
    windowKey: (window) => window.id,
    now: () => clock,
    settleMs: 20,
    retryMs: 20
  })

  copies.push(files)

  return files
}

afterEach(() => {
  for (const files of copies.splice(0)) {
    files.close()
  }

  rmSync(folder, { recursive: true, force: true })
  folder = undefined!
})

describe("projects.json", () => {
  it("keeps a project starred in a second copy after both close", async () => {
    const one = copy()
    const two = copy()
    await one.changeProjects({ kind: "opened", root: "D:/shop" })
    await two.changeProjects({ kind: "starred", root: "D:/shop", starred: true })
    one.close()
    two.close()

    expect(copy().projects().values.notes["D:/shop"]).toEqual({ opened: clock, starred: true })
  })

  it("tells a copy what another changed", async () => {
    const heard = vi.fn<(projects: Projects) => void>()
    copy(heard)
    await copy().changeProjects({ kind: "opened", root: "D:/shop" })

    await vi.waitFor(() => expect(heard.mock.lastCall?.[0].recent).toEqual(["D:/shop"]))
  })
})

describe("a window's tabs", () => {
  it("reopen after a copy crashed, in the next copy to start", async () => {
    const crashed = copy()
    await crashed.claimTabs({ id: 1 })
    crashed.saveTabs({ id: 1 }, { roots: ["D:/shop"], active: "D:/shop" })
    // A reload's claim waits behind the save, so the tabs are in the file; then the copy stops without a word.
    await crashed.claimTabs({ id: 1 })
    crashed.close()
    clock += goneAfterMs

    expect(await copy().claimTabs({ id: 1 })).toEqual({ roots: ["D:/shop"], active: "D:/shop" })
  })

  it("stay with a window that reloads, and aren't taken by a copy starting beside it", async () => {
    const running = copy()
    await running.claimTabs({ id: 1 })
    running.saveTabs({ id: 1 }, { roots: ["D:/shop"] })

    expect(await running.claimTabs({ id: 1 })).toEqual({ roots: ["D:/shop"] })
    expect(await copy().claimTabs({ id: 1 })).toEqual({ roots: [] })
  })

  it("aren't kept for a window that never claimed any, as one opened for one project", async () => {
    const files = copy()
    files.saveTabs({ id: 1 }, { roots: ["D:/shop"] })
    clock += goneAfterMs

    expect(await copy().claimTabs({ id: 2 })).toEqual({ roots: [] })
  })
})
