import type { CheckedRequest, Fetch, Found } from "@parity-app/connectors"
import type { JsonValue } from "@parity-app/core"
import { isText } from "@parity-app/core/values/evaluate"
import { describe, expect, it } from "vite-plus/test"
import { createRemoteSearch } from "./remote-search.ts"

const beach: CheckedRequest = { query: "beach", kind: "photos", limit: 10, filters: { type: "photo" } }

const photo: Found = {
  connector: "pixabay",
  id: "1",
  kind: "photos",
  title: "A beach",
  image: { url: "https://pixabay.example/1.jpg" },
  link: "https://pixabay.example/1",
  credit: [{ name: "Ada" }]
}

/** The service stood in for: it answers from a queue, and keeps each request's address, token and body. */
function setUp(tokens: (string | undefined)[] = ["token_1"]) {
  const answers: { status: number; body: JsonValue }[] = []
  const sent: { url: string; token: string | null; body: JsonValue | undefined }[] = []
  const asked: boolean[] = []

  const fetch: Fetch = async (url, init) => {
    const headers = new Headers(init.headers)
    sent.push({ url, token: headers.get("Authorization"), body: isText(init.body) ? JSON.parse(init.body) : undefined })
    const answer = answers.shift()

    if (!answer) {
      throw new Error("Offline")
    }

    return new Response(JSON.stringify(answer.body), { status: answer.status })
  }

  const remote = createRemoteSearch({
    address: "https://api.example",
    fetch,
    token: async (renew = false) => {
      asked.push(renew)

      return tokens.shift()
    }
  })

  return {
    remote,
    sent,
    asked,
    answer: (status: number, body: JsonValue) => answers.push({ status, body }),
    search: () => remote.search("pixabay", beach, AbortSignal.timeout(1000))
  }
}

describe("load", () => {
  it("lists the connectors the service says it searches", async () => {
    const test = setUp()
    test.answer(200, { connectors: ["mobbin", "pixabay"] })

    await test.remote.load()

    expect(test.remote.connectors).toEqual(["mobbin", "pixabay"])
    expect(test.sent[0]?.url).toBe("https://api.example/v1/connectors")
  })

  it("keeps what it had when the service can't be asked or answers something else", async () => {
    const test = setUp()
    test.answer(200, { connectors: ["pixabay"] })
    await test.remote.load()

    await test.remote.load()
    test.answer(200, { nonsense: true })
    await test.remote.load()

    expect(test.remote.connectors).toEqual(["pixabay"])
  })
})

describe("search", () => {
  it("sends the search as the signed-in person and gives the service's answer", async () => {
    const test = setUp()
    test.answer(200, { found: [photo] })

    expect(await test.search()).toEqual({ found: [photo] })
    expect(test.sent).toEqual([
      { url: "https://api.example/v1/connectors/pixabay/search", token: "Bearer token_1", body: beach }
    ])
  })

  it("answers signed-out without asking the service when nobody is signed in", async () => {
    const test = setUp([undefined])

    expect(await test.search()).toMatchObject({ problem: { code: "signed-out" } })
    expect(test.sent).toEqual([])
  })

  it("renews the token and sends once more when the service turns it down", async () => {
    const test = setUp(["token_1", "token_2"])
    test.answer(401, { problem: { code: "signed-out", message: "Sign in to Parity to search." } })
    test.answer(200, { found: [photo] })

    expect(await test.search()).toEqual({ found: [photo] })
    expect(test.sent.map((each) => each.token)).toEqual(["Bearer token_1", "Bearer token_2"])
    expect(test.asked).toEqual([false, true])
  })

  it("answers signed-out when the renewed token is turned down too, or there isn't one", async () => {
    const refused = setUp(["token_1", "token_2"])
    refused.answer(401, { problem: { code: "signed-out", message: "Sign in to Parity to search." } })
    refused.answer(401, { problem: { code: "signed-out", message: "Sign in to Parity to search." } })
    const ended = setUp(["token_1", undefined])
    ended.answer(401, { problem: { code: "signed-out", message: "Sign in to Parity to search." } })

    expect(await refused.search()).toMatchObject({ problem: { code: "signed-out" } })
    expect(await ended.search()).toMatchObject({ problem: { code: "signed-out" } })
    expect(refused.sent).toHaveLength(2)
    expect(ended.sent).toHaveLength(1)
  })

  it("passes on a problem the service answers with, whatever its status", async () => {
    const test = setUp()
    const limited = { problem: { code: "rate-limited", message: "Try again in a minute.", retryAfter: 60 } }
    test.answer(429, limited)

    expect(await test.search()).toEqual(limited)
  })

  it("answers unavailable for an answer that isn't the service's", async () => {
    const test = setUp()
    test.answer(502, "<html>Bad gateway</html>")

    expect(await test.search()).toMatchObject({ problem: { code: "unavailable" } })
  })
})
