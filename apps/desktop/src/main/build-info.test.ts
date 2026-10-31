import { describe, expect, it, vi } from "vite-plus/test"
import { InstalledBuild } from "./build-info.ts"

function release(prerelease: boolean, tag = "v0.3.0") {
  return Response.json({ tag_name: tag, prerelease, draft: false })
}

function setup(saved?: unknown) {
  let now = 1_000_000
  const request = vi.fn<typeof fetch>().mockResolvedValue(release(true))
  const save = vi.fn<(value: unknown) => void>()
  const options = { version: "0.3.0", packaged: true, read: () => saved, save, request, now: () => now }
  const build = new InstalledBuild(options)
  return {
    build,
    request,
    save,
    options,
    advance: () => {
      now += 300_000
    }
  }
}

describe("installed build identity", () => {
  it("identifies a numeric beta by the installed release, not the latest release or update preference", async () => {
    const { build, request, save } = setup()
    expect(await build.get()).toEqual({ version: "0.3.0", channel: "beta" })
    expect(request.mock.calls[0]?.[0]).toBe("https://api.github.com/repos/betterapps-hq/parity/releases/tags/v0.3.0")
    expect(save).toHaveBeenCalledWith({ version: "0.3.0", channel: "beta", checkedAt: 1_000_000 })
  })

  it("shares concurrent requests and observes promotion of the same artifacts after the cache expires", async () => {
    const { build, request, advance } = setup()
    const first = build.get()
    expect(build.get()).toBe(first)
    await first
    expect(await build.get()).toEqual({ version: "0.3.0", channel: "beta" })
    expect(request).toHaveBeenCalledOnce()
    advance()
    request.mockResolvedValue(release(false))
    expect(await build.get()).toEqual({ version: "0.3.0", channel: "stable" })
    expect(request).toHaveBeenCalledTimes(2)
  })

  it("uses a fresh persistent cache across app restarts without fetching", async () => {
    const { build, request } = setup({ version: "0.3.0", channel: "beta", checkedAt: 999_999 })
    expect(await build.get()).toEqual({ version: "0.3.0", channel: "beta" })
    expect(request).not.toHaveBeenCalled()
  })

  it("retains the last confirmed identity offline and throttles failed lookups", async () => {
    const { build, request, save, advance } = setup({ version: "0.3.0", channel: "beta", checkedAt: 0 })
    request.mockRejectedValue(new Error("Offline"))
    expect(await build.get()).toEqual({ version: "0.3.0", channel: "beta" })
    await build.get()
    expect(request).toHaveBeenCalledOnce()
    expect(save).not.toHaveBeenCalled()
    advance()
    await build.get()
    expect(request).toHaveBeenCalledTimes(2)
  })

  it.each([
    undefined,
    { version: "0.2.0", channel: "beta", checkedAt: 999_999 },
    { version: "0.3.0", channel: "development", checkedAt: 999_999 },
    { beta: true }
  ])("does not guess an unknown offline build from an unrelated or invalid cache (%j)", async (saved) => {
    const { build, request } = setup(saved)
    request.mockRejectedValue(new Error("Offline"))
    expect(await build.get()).toEqual({ version: "0.3.0", channel: "unknown" })
  })

  it.each([
    { tag_name: "v0.4.0", prerelease: true, draft: false },
    { tag_name: "v0.3.0", prerelease: "false", draft: false },
    { tag_name: "v0.3.0", prerelease: true, draft: true },
    null
  ])("rejects metadata that does not identify the published installed release (%j)", async (data) => {
    const { build, request, save } = setup()
    request.mockResolvedValue(Response.json(data))
    expect((await build.get()).channel).toBe("unknown")
    expect(save).not.toHaveBeenCalled()
  })

  it("revalidates a cache with a timestamp in the future", async () => {
    const { build, request } = setup({ version: "0.3.0", channel: "beta", checkedAt: 2_000_000 })
    request.mockResolvedValue(release(false))
    expect((await build.get()).channel).toBe("stable")
    expect(request).toHaveBeenCalledOnce()
  })

  it("survives unreadable and unwritable cache files", async () => {
    const { options } = setup()
    const build = new InstalledBuild({
      ...options,
      read: () => {
        throw new Error("Bad JSON")
      },
      save: () => {
        throw new Error("Read-only directory")
      }
    })
    expect((await build.get()).channel).toBe("beta")
  })

  it("never fetches release metadata for development builds", async () => {
    const { options, request } = setup()
    const build = new InstalledBuild({ ...options, packaged: false })
    expect((await build.get()).channel).toBe("development")
    expect(request).not.toHaveBeenCalled()
  })
})
