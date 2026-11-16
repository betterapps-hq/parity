import { describe, expect, it } from "vite-plus/test"
import type { ConnectorInfo } from "./connector.ts"
import { mobbin } from "./mobbin.ts"
import { notify, prepare } from "./request.ts"

const keyless: ConnectorInfo = { ...mobbin.info, id: "open", name: "Open", auth: { type: "none" } }

describe("prepare", () => {
  it("searches a connector that needs no key without one, and asks only a keyed one for a key", () => {
    const search = { query: "login", kind: "screens" as const }

    expect(prepare(keyless, search, { fetch })).toMatchObject({ request: { query: "login" }, key: "" })
    expect(prepare(mobbin.info, search, { fetch })).toHaveProperty("problem.code", "no-key")
  })
})

describe("notify", () => {
  it("says whether the source took it", async () => {
    const answering = (status: number) => async () => new Response(null, { status })
    const offline = async () => Promise.reject(new Error("offline"))

    expect(await notify({ fetch: answering(200) }, "https://example.com", {})).toBe(true)
    expect(await notify({ fetch: answering(500) }, "https://example.com", {})).toBe(false)
    expect(await notify({ fetch: offline }, "https://example.com", {})).toBe(false)
  })
})
