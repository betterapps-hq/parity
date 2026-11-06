import type { Fetch } from "@parity-app/account"
import type { CopyEntry } from "@parity-app/agent/routing"
import { describe, expect, it } from "vite-plus/test"
import { launchLink, passLink } from "./pass-link.ts"

const copy = (app: number): CopyEntry => ({
  version: 1,
  url: `http://127.0.0.1:${4000 + app}`,
  token: `token-${app}`,
  app,
  startedAt: 0
})

describe("launchLink", () => {
  it("finds the sign-in link the system started Parity with", () => {
    expect(launchLink(["Parity.exe", "--flag", "parity://auth/callback?code=1&state=2"])).toBe(
      "parity://auth/callback?code=1&state=2"
    )
    expect(launchLink(["Parity.exe", "parity://app/index.html"])).toBeUndefined()
    expect(launchLink(["Parity.exe"])).toBeUndefined()
  })
})

describe("passLink", () => {
  it("asks each other copy's service in turn, with its token, until one takes it", async () => {
    const asked: { url: string; auth: unknown; body: unknown }[] = []
    const fetch: Fetch = async (url, init) => {
      asked.push({
        url,
        auth: new Headers(init.headers).get("authorization"),
        body: JSON.parse(typeof init.body === "string" ? init.body : "{}")
      })
      if (url.includes(":4002")) throw new Error("connection refused")
      return Response.json({ taken: url.includes(":4003") })
    }
    const link = "parity://auth/callback?code=1&state=2"
    expect(await passLink(link, [copy(1), copy(2), copy(3), copy(4)], 1, fetch)).toBe(true)
    expect(asked).toEqual([
      { url: "http://127.0.0.1:4002/auth/link", auth: "Bearer token-2", body: { link } },
      { url: "http://127.0.0.1:4003/auth/link", auth: "Bearer token-3", body: { link } }
    ])
  })

  it("says nobody took it when no copy is waiting for it", async () => {
    const fetch: Fetch = async () => Response.json({ error: "POST /rpc" }, { status: 404 })
    expect(await passLink("parity://auth/callback", [copy(2)], 1, fetch)).toBe(false)
  })
})
