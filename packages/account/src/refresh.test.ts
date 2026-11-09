import { describe, expect, it } from "vite-plus/test"
import { type AccessToken, refreshDelay, retryDelay } from "./index.ts"

const issuedAt = 1_800_000_000_000

const token: AccessToken = {
  userId: "user_01ANA",
  sessionId: "session_01",
  permissions: [],
  issuedAt,
  expiresAt: issuedAt + 300_000
}

describe("refreshDelay", () => {
  it("refreshes a minute before a five-minute token expires", () => {
    expect(refreshDelay(token, issuedAt)).toBe(240_000)
    expect(refreshDelay(token, issuedAt + 200_000)).toBe(40_000)
  })

  it("waits half a short token's life", () => {
    expect(refreshDelay({ ...token, expiresAt: issuedAt + 60_000 }, issuedAt)).toBe(30_000)
  })

  it("refreshes a minute early when the token doesn't say when it was issued", () => {
    const { issuedAt: _, ...undated } = token
    expect(refreshDelay(undated, issuedAt)).toBe(240_000)
  })

  it("refreshes straight away once it's due, as after sleep", () => {
    expect(refreshDelay(token, issuedAt + 250_000)).toBe(0)
    expect(refreshDelay(token, issuedAt + 3_600_000)).toBe(0)
  })
})

describe("retryDelay", () => {
  it("doubles from 5 seconds up to 5 minutes", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 20].map(retryDelay)).toEqual([
      5_000, 10_000, 20_000, 40_000, 80_000, 160_000, 300_000, 300_000
    ])
  })
})
