import { describe, expect, it, vi } from "vite-plus/test"
import { cliChannel, npmChannel } from "./promotion.ts"

describe("cliChannel", () => {
  it("counts a version as promoted only while it's npm's latest", () => {
    expect(cliChannel("0.30.0", "0.30.0")).toBe("stable")
    expect(cliChannel("0.31.0", "0.30.0")).toBe("beta")
  })

  it("says nothing of a version older than latest, so a version that was latest stays promoted", () => {
    expect(cliChannel("0.29.0", "0.30.0")).toBeUndefined()
  })

  it.each([undefined, "", "soon"])("says nothing when npm names no latest version (%j)", (latest) => {
    expect(cliChannel("0.30.0", latest)).toBeUndefined()
  })

  it("says nothing for a version that isn't one, as a checkout's unknown", () => {
    expect(cliChannel("unknown", "0.30.0")).toBeUndefined()
  })
})

describe("npmChannel", () => {
  it("asks the registry for the CLI's dist-tags", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ latest: "0.30.0", next: "0.31.0" }))

    expect(await npmChannel("0.30.0", request)).toBe("stable")
    expect(request.mock.calls[0]?.[0]).toBe("https://registry.npmjs.org/-/package/@parity-app%2Fcli/dist-tags")
  })

  it.each<unknown>([{}, { latest: 30 }, null])("says nothing when the dist-tags don't read (%j)", async (tags) => {
    expect(await npmChannel("0.30.0", vi.fn<typeof fetch>().mockResolvedValue(Response.json(tags)))).toBeUndefined()
  })

  it("says nothing when the registry fails, and rejects offline", async () => {
    expect(await npmChannel("0.30.0", vi.fn<typeof fetch>().mockResolvedValue(new Response("", { status: 503 })))).toBe(
      undefined
    )
    await expect(npmChannel("0.30.0", vi.fn<typeof fetch>().mockRejectedValue(new Error("Offline")))).rejects.toThrow(
      "Offline"
    )
  })
})
