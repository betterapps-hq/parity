import { describe, expect, it } from "vite-plus/test"
import type { z } from "zod"
import { readAccessToken } from "./index.ts"

const jwt = (claims: z.core.util.JSONType) =>
  ["header", JSON.stringify(claims), "signature"].map((part) => Buffer.from(part).toString("base64url")).join(".")

const claims = {
  iss: "https://api.workos.com",
  sub: "user_01ANA",
  sid: "session_01",
  org_id: "org_01ACME",
  role: "admin",
  permissions: ["projects:edit"],
  iat: 1_800_000_000,
  exp: 1_800_000_300
}

describe("readAccessToken", () => {
  it("reads who the token names and when it expires, in milliseconds", () => {
    expect(readAccessToken(jwt(claims))).toEqual({
      userId: "user_01ANA",
      sessionId: "session_01",
      organizationId: "org_01ACME",
      role: "admin",
      permissions: ["projects:edit"],
      issuedAt: 1_800_000_000_000,
      expiresAt: 1_800_000_300_000
    })
  })

  it("reads a token for someone in no organization", () => {
    expect(readAccessToken(jwt({ sub: "user_01ANA", sid: "session_01", exp: 1_800_000_300 }))).toEqual({
      userId: "user_01ANA",
      sessionId: "session_01",
      permissions: [],
      expiresAt: 1_800_000_300_000
    })
  })

  it("reads claims written in UTF-8", () => {
    expect(readAccessToken(jwt({ ...claims, role: "rédacteur" })).role).toBe("rédacteur")
  })

  it("throws on a token that isn't a JWT or lacks its expiry", () => {
    expect(() => readAccessToken("opaque")).toThrow(new TypeError("The access token isn't a JWT"))
    expect(() => readAccessToken("a.b%.c")).toThrow(TypeError)
    const { exp: _, ...noExpiry } = claims
    expect(() => readAccessToken(jwt(noExpiry))).toThrow(
      new TypeError("The access token's exp: Invalid input: expected number, received undefined")
    )
  })
})
