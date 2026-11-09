import { describe, expect, it, vi } from "vite-plus/test"
import { Promotion, type ReleaseChannel, type SavedPromotion } from "./promotion.ts"

function setup(saved?: SavedPromotion) {
  return setupText(JSON.stringify(saved ?? null))
}

function setupText(text: string) {
  let now = 1_000_000
  const lookup = vi.fn<() => Promise<ReleaseChannel | undefined>>().mockResolvedValue("beta")
  const save = vi.fn<(value: SavedPromotion) => void>()
  const options = { version: "0.3.0", read: () => text, save, lookup, now: () => now }

  return {
    promotion: new Promotion(options),
    options,
    lookup,
    save,
    advance: () => {
      now += 300_000
    }
  }
}

describe("Promotion", () => {
  it("knows this version from the saved answer before asking, and nothing from another version's", () => {
    const { promotion, lookup } = setup({ version: "0.3.0", channel: "stable", checkedAt: 1 })

    expect(promotion.known).toBe("stable")
    expect(setup({ version: "0.2.0", channel: "stable" }).promotion.known).toBeUndefined()
    expect(lookup).not.toHaveBeenCalled()
  })

  it("saves an answer by version and shares one lookup between callers", async () => {
    const { promotion, lookup, save } = setup()
    const first = promotion.check()

    expect(promotion.check()).toBe(first)
    expect(await first).toBe("beta")
    expect(lookup).toHaveBeenCalledOnce()
    expect(save).toHaveBeenCalledWith({ version: "0.3.0", channel: "beta", checkedAt: 1_000_000 })
  })

  it("asks again once five minutes have passed, and follows a promotion", async () => {
    const { promotion, lookup, advance } = setup()
    await promotion.check()
    await promotion.check()
    expect(lookup).toHaveBeenCalledOnce()

    advance()
    lookup.mockResolvedValue("stable")
    expect(await promotion.check()).toBe("stable")
    expect(promotion.known).toBe("stable")
  })

  it("doesn't ask across runs while the saved answer is fresh", async () => {
    const { promotion, lookup } = setup({ version: "0.3.0", channel: "beta", checkedAt: 999_999 })

    expect(await promotion.check()).toBe("beta")
    expect(lookup).not.toHaveBeenCalled()
  })

  it("asks again when the saved answer's time is in the future", async () => {
    const { promotion, lookup } = setup({ version: "0.3.0", channel: "beta", checkedAt: 2_000_000 })
    lookup.mockResolvedValue("stable")

    expect(await promotion.check()).toBe("stable")
  })

  it("keeps the last answer offline, saves nothing, and waits five minutes before asking again", async () => {
    const { promotion, lookup, save, advance } = setup({ version: "0.3.0", channel: "stable", checkedAt: 0 })
    lookup.mockRejectedValue(new Error("Offline"))

    expect(await promotion.check()).toBe("stable")
    await promotion.check()
    expect(lookup).toHaveBeenCalledOnce()
    expect(save).not.toHaveBeenCalled()

    advance()
    await promotion.check()
    expect(lookup).toHaveBeenCalledTimes(2)
  })

  it("keeps what's known when the answer doesn't say", async () => {
    const { promotion, lookup, save } = setup({ version: "0.3.0", channel: "stable", checkedAt: 0 })
    lookup.mockResolvedValue(undefined)

    expect(await promotion.check()).toBe("stable")
    expect(save).not.toHaveBeenCalled()
  })

  it.each(["null", '{"version":"0.3.0","channel":"development"}', '{"beta":true}', '"0.3.0"', "{"])(
    "counts a saved answer that doesn't read as nothing known (%s)",
    (text) => {
      expect(setupText(text).promotion.known).toBeUndefined()
    }
  )

  it("survives a file that can't be read or written", async () => {
    const { options } = setup()

    const promotion = new Promotion({
      ...options,
      read: () => {
        throw new Error("ENOENT")
      },
      save: () => {
        throw new Error("EROFS")
      }
    })

    expect(promotion.known).toBeUndefined()
    expect(await promotion.check()).toBe("beta")
  })
})
