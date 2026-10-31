import { afterEach, describe, expect, it, vi } from "vite-plus/test"
import { githubRelease, noStableRelease } from "./github-releases.ts"

const missingStable = Object.assign(
  new Error(
    "Cannot parse releases feed: Error: Unable to find latest version on GitHub (https://github.com/betterapps-hq/parity/releases/latest), please ensure a production release exists: HttpError: 404 Not Found"
  ),
  { code: "ERR_UPDATER_INVALID_RELEASE_FEED" }
)

afterEach(() => vi.useRealTimers())

describe("bounded GitHub metadata requests", () => {
  it("aborts a stalled request after three seconds", async () => {
    vi.useFakeTimers()
    const request = vi.fn<typeof fetch>().mockImplementation(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener("abort", () => reject(new Error("Timed out")))
        })
    )
    await Promise.all([
      expect(githubRelease("/latest", request)).rejects.toThrow("Timed out"),
      vi.advanceTimersByTimeAsync(3000)
    ])
    expect(vi.getTimerCount()).toBe(0)
  })

  it("rejects oversized and malformed bodies", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response("x".repeat(256 * 1024 + 1)))
    await expect(githubRelease("/latest", request)).rejects.toThrow("too large")
    request.mockResolvedValue(new Response("not JSON"))
    await expect(githubRelease("/latest", request)).rejects.toThrow(/JSON/)
  })
})

describe("empty stable GitHub feed", () => {
  it.each([[], [{ draft: false, prerelease: true }]].map((data) => ({ data })))(
    "confirms no latest stable and an accessible releases listing ($data)",
    async ({ data }) => {
      const request = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(new Response(null, { status: 404 }))
        .mockResolvedValueOnce(Response.json(data))
      expect(await noStableRelease(missingStable, false, request)).toBe(true)
      expect(request.mock.calls.map(([url]) => url)).toEqual([
        "https://api.github.com/repos/betterapps-hq/parity/releases/latest",
        "https://api.github.com/repos/betterapps-hq/parity/releases?per_page=1"
      ])
    }
  )

  it.each([401, 403, 404, 429, 500])(
    "keeps inaccessible repository and service failures as errors (%i)",
    async (status) => {
      const request = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(new Response(null, { status: 404 }))
        .mockResolvedValueOnce(new Response(null, { status }))
      expect(await noStableRelease(missingStable, false, request)).toBe(false)
    }
  )

  it.each([{}, [null], [{ draft: false, prerelease: false }]].map((data) => ({ data })))(
    "does not confirm missing stable from invalid or contradictory data ($data)",
    async ({ data }) => {
      const request = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(new Response(null, { status: 404 }))
        .mockResolvedValueOnce(Response.json(data))
      expect(await noStableRelease(missingStable, false, request)).toBe(false)
    }
  )

  it("preserves network failures and a stable release that appeared during confirmation", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new Error("Offline"))
      .mockResolvedValueOnce(Response.json({ prerelease: false }))
    expect(await noStableRelease(missingStable, false, request)).toBe(false)
    expect(await noStableRelease(missingStable, false, request)).toBe(false)
  })

  it("does not probe GitHub for beta checks, generic feeds, missing artifacts, or non-404 failures", async () => {
    const request = vi.fn<typeof fetch>()
    expect(await noStableRelease(missingStable, true, request)).toBe(false)
    for (const error of [
      new Error("Offline"),
      Object.assign(new Error("Cannot find latest.yml: 404"), { code: "ERR_UPDATER_CHANNEL_FILE_NOT_FOUND" }),
      Object.assign(new Error(missingStable.message.replace("404", "500")), { code: missingStable.code }),
      Object.assign(
        new Error(missingStable.message.replace("https://github.com/betterapps-hq/parity", "http://127.0.0.1:8000")),
        { code: missingStable.code }
      )
    ])
      expect(await noStableRelease(error, false, request)).toBe(false)
    expect(request).not.toHaveBeenCalled()
  })
})
