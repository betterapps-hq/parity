import { describe, expect, it, vi } from "vite-plus/test"
import { type UpdateDriver, UpdateSession } from "./update-session.ts"

function setup(change: { enabled?: boolean; manual?: boolean; driver?: Partial<UpdateDriver> } = {}) {
  const driver: UpdateDriver = {
    check: vi.fn<UpdateDriver["check"]>(async () => "0.4.0"),
    download: vi.fn<UpdateDriver["download"]>(async () => undefined),
    install: vi.fn<UpdateDriver["install"]>(),
    ...change.driver
  }
  const saveBeta = vi.fn<(beta: boolean) => void>()
  const session = new UpdateSession({
    enabled: true,
    manual: false,
    beta: false,
    changed: vi.fn<(state: ReturnType<UpdateSession["get"]>) => void>(),
    saveBeta,
    ...change,
    driver
  })
  return { session, driver, saveBeta }
}

describe("update session", () => {
  it("coalesces simultaneous checks into one download and keeps readiness on later checks", async () => {
    let finish: (() => void) | undefined
    const download = new Promise<void>((resolve) => {
      finish = resolve
    })
    const { session, driver } = setup({ driver: { download: () => download } })
    const first = session.check()
    expect(session.check()).toBe(first)
    await Promise.resolve()
    expect(session.get().phase).toBe("downloading")
    finish?.()
    await first
    await session.check()
    expect(driver.check).toHaveBeenCalledTimes(1)
    expect(session.get().phase).toBe("ready")
  })

  it("never downloads or installs for the unsigned Mac fallback", async () => {
    const { session, driver } = setup({ manual: true })
    await session.check()
    expect(session.get().phase).toBe("manual")
    expect(session.install()).toBe(false)
    expect(driver.download).not.toHaveBeenCalled()
    expect(driver.install).not.toHaveBeenCalled()
  })

  it("does not reach the platform updater at all in development", async () => {
    const { session, driver } = setup({ enabled: false })
    await session.check()
    expect(session.install()).toBe(false)
    expect(driver.check).not.toHaveBeenCalled()
    expect(driver.install).not.toHaveBeenCalled()
  })

  it("allows retry after a failed download", async () => {
    const download = vi
      .fn<UpdateDriver["download"]>()
      .mockRejectedValueOnce(new Error("Checksum mismatch"))
      .mockResolvedValueOnce(undefined)
    const { session } = setup({ driver: { download } })
    await session.check()
    expect(session.get()).toMatchObject({ phase: "error", message: "Checksum mismatch" })
    expect(session.install()).toBe(false)
    await session.check()
    expect(session.get().phase).toBe("ready")
  })

  it("persists a channel before checking it and never switches during a download", async () => {
    const { session, driver, saveBeta } = setup()
    session.setBeta(true)
    expect(saveBeta).toHaveBeenCalledWith(true)
    expect(driver.check).toHaveBeenCalledWith(true)
    expect(() => session.setBeta(false)).toThrow("Wait for the current update")
    await session.check()
    session.setBeta(false)
    await session.check()
    expect(driver.check).toHaveBeenLastCalledWith(false)
    expect(session.get().beta).toBe(false)
  })

  it("does not start installation until explicitly requested after download", async () => {
    const { session, driver } = setup()
    expect(session.install()).toBe(false)
    await session.check()
    expect(driver.install).not.toHaveBeenCalled()
    expect(session.install()).toBe(true)
    expect(driver.install).toHaveBeenCalledTimes(1)
    expect(session.install()).toBe(false)
  })

  it("resets the acknowledged close when installation reports a later failure", async () => {
    const { session } = setup()
    await session.check()
    const resetClose = vi.fn<() => void>()
    expect(session.install(resetClose)).toBe(true)
    expect(resetClose).not.toHaveBeenCalled()
    session.fail(new Error("Installer failed"))
    expect(session.get()).toMatchObject({ phase: "error", message: "Installer failed" })
    expect(resetClose).toHaveBeenCalledOnce()
    session.fail(new Error("Another error"))
    expect(resetClose).toHaveBeenCalledOnce()
  })

  it("also resets the close when installation throws immediately", async () => {
    const { session } = setup({
      driver: {
        install: () => {
          throw new Error("Installer could not start")
        }
      }
    })
    await session.check()
    const resetClose = vi.fn<() => void>()
    expect(session.install(resetClose)).toBe(false)
    expect(resetClose).toHaveBeenCalledOnce()
    expect(session.get()).toMatchObject({ phase: "error", message: "Installer could not start" })
  })
})
