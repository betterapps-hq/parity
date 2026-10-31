import { EventEmitter } from "node:events"
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"

const platform = vi.hoisted(() => ({
  check: vi.fn<() => Promise<{ isUpdateAvailable: boolean; updateInfo: { version: string } }>>(),
  download: vi.fn<() => Promise<void>>(),
  confirmEmpty: vi.fn<(error: unknown, beta: boolean) => Promise<boolean>>()
}))

vi.mock("electron", () => ({ app: { isPackaged: true, getPath: () => "." } }))
vi.mock("node:fs", () => ({ readFileSync: () => '{"beta":false}', writeFileSync: vi.fn<() => void>() }))
vi.mock("./github-releases.ts", () => ({ noStableRelease: platform.confirmEmpty }))
vi.mock("electron-updater", () => ({
  default: {
    autoUpdater: Object.assign(new EventEmitter(), {
      checkForUpdates: platform.check,
      downloadUpdate: platform.download,
      quitAndInstall: vi.fn<() => void>()
    })
  }
}))

import { createUpdates } from "./updates.ts"

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv("APPIMAGE", "/test/Parity.AppImage")
})

afterEach(() => vi.unstubAllEnvs())

describe("installed updater empty-feed handling", () => {
  it("does not check or download when a renamed Electron runs under the dev runner", async () => {
    vi.stubEnv("PARITY_DEV_RUNNER", "1234")
    const session = createUpdates(vi.fn())
    await session.check()
    expect(session.get().phase).toBe("disabled")
    expect(platform.check).not.toHaveBeenCalled()
    expect(platform.download).not.toHaveBeenCalled()
  })
  it("reports current without downloading only when the stable absence was confirmed", async () => {
    const error = new Error("No stable release")
    platform.check.mockRejectedValue(error)
    platform.confirmEmpty.mockResolvedValue(true)
    const session = createUpdates(vi.fn())
    await session.check()
    expect(session.get()).toEqual({ phase: "current", beta: false })
    expect(platform.confirmEmpty).toHaveBeenCalledWith(error, false)
    expect(platform.download).not.toHaveBeenCalled()
  })

  it("preserves the original updater failure when no empty feed could be confirmed", async () => {
    platform.check.mockRejectedValue(new Error("Network unavailable"))
    platform.confirmEmpty.mockResolvedValue(false)
    const session = createUpdates(vi.fn())
    await session.check()
    expect(session.get()).toEqual({ phase: "error", beta: false, message: "Network unavailable" })
    expect(platform.download).not.toHaveBeenCalled()
  })

  it("does not probe GitHub or replace a successful generic-feed check", async () => {
    platform.check.mockResolvedValue({ isUpdateAvailable: false, updateInfo: { version: "0.3.0" } })
    const session = createUpdates(vi.fn())
    await session.check()
    expect(session.get().phase).toBe("current")
    expect(platform.confirmEmpty).not.toHaveBeenCalled()
  })
})
