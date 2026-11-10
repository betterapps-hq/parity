import { describe, expect, it } from "vite-plus/test"
import { z } from "zod"
import { type Fetch, mobbin, retryAfter, type SearchRequest } from "./index.ts"

const screen = {
  id: "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed",
  image_url: "https://images.mobbin.com/a.webp",
  image: {
    url: "https://images.mobbin.com/a.webp",
    width: 390,
    height: 844,
    url_expires_at: "2026-12-09T00:00:00Z"
  },
  mobbin_url: "https://mobbin.com/screens/1b9d6bcd",
  app_name: "Calm",
  platform: "ios"
}

/** A fetch that records what it was asked and answers with `status` and `body` as JSON. */
function answering(status: number, body: z.core.util.JSONType, headers: Record<string, string> = {}) {
  const sent: { url: string; init: RequestInit }[] = []

  const fetch: Fetch = async (url, init) => {
    sent.push({ url, init })

    return new Response(JSON.stringify(body), { status, headers })
  }

  return { fetch, sent }
}

/** The JSON a request sent. */
function sentJson(request: { init: RequestInit } | undefined) {
  return JSON.parse(z.string().parse(request?.init.body))
}

const paywalls: SearchRequest = { query: "paywall with a free trial", kind: "screens", filters: { platform: "ios" } }

describe("mobbin", () => {
  it("searches screens with the key, the platform and its defaults, and gives each result one shape", async () => {
    const { fetch, sent } = answering(200, { screens: [screen] })

    const answer = await mobbin.search(paywalls, { fetch, key: "key-1" })

    expect(sent).toHaveLength(1)
    expect(sent[0]?.url).toBe("https://api.mobbin.com/v1/screens/search")
    expect(new Headers(sent[0]?.init.headers).get("authorization")).toBe("Bearer key-1")
    expect(sentJson(sent[0])).toEqual({
      query: "paywall with a free trial",
      platform: "ios",
      mode: "standard",
      limit: 20
    })
    expect(answer).toEqual({
      found: [
        {
          connector: "mobbin",
          id: screen.id,
          kind: "screens",
          title: "Calm",
          platform: "ios",
          image: {
            url: "https://images.mobbin.com/a.webp",
            width: 390,
            height: 844,
            expiresAt: Date.parse("2026-12-09T00:00:00Z")
          },
          link: "https://mobbin.com/screens/1b9d6bcd",
          credit: [{ name: "Calm" }, { name: "Mobbin", url: "https://mobbin.com/screens/1b9d6bcd" }]
        }
      ]
    })
  })

  it("sends a deep search, a limit and the screens already shown, leaving out ids Mobbin wouldn't take", async () => {
    const { fetch, sent } = answering(200, { screens: [] })

    await mobbin.search(
      { ...paywalls, filters: { platform: "ios", depth: "deep" }, limit: 5, exclude: [screen.id, "not-a-uuid"] },
      { fetch, key: "k" }
    )

    expect(sentJson(sent[0])).toMatchObject({
      mode: "deep",
      limit: 5,
      exclude_screen_ids: [screen.id]
    })
  })

  it("leaves a screen's size out when Mobbin doesn't know it", async () => {
    const { width: _width, height: _height, ...image } = screen.image
    const { fetch } = answering(200, { screens: [{ ...screen, image }] })

    const answer = await mobbin.search(paywalls, { fetch, key: "k" })

    expect("found" in answer && answer.found[0]?.image).toEqual({
      url: image.url,
      expiresAt: Date.parse(image.url_expires_at)
    })
  })

  it("searches the web at the standard depth when the search doesn't say", async () => {
    const { fetch, sent } = answering(200, { screens: [] })

    await mobbin.search({ query: "pricing", kind: "screens" }, { fetch, key: "k" })

    expect(sentJson(sent[0])).toMatchObject({ platform: "web", mode: "standard" })
  })

  it("turns down what its API can't search without asking Mobbin", async () => {
    const { fetch, sent } = answering(200, { screens: [] })

    const asked: SearchRequest[] = [
      { ...paywalls, kind: "flows" },
      { ...paywalls, filters: { platform: "android" } },
      { ...paywalls, filters: { color: "teal" } },
      { ...paywalls, limit: 101 }
    ]

    const answers = await Promise.all(asked.map((request) => mobbin.search(request, { fetch, key: "k" })))

    expect(answers.map((each) => ("problem" in each ? [each.problem.field, each.problem.message] : each))).toEqual([
      ["kind", "Mobbin finds screens only."],
      ["filters.platform", "Mobbin's platform can be web or ios."],
      ["filters.color", "Mobbin doesn't filter by color. It filters by platform and depth."],
      ["limit", "Mobbin returns up to 100 results a search."]
    ])
    expect(sent).toHaveLength(0)
  })

  it("asks for a key before searching without one", async () => {
    const { fetch, sent } = answering(200, { screens: [] })

    expect(await mobbin.search(paywalls, { fetch })).toEqual({
      problem: { code: "no-key", message: "Add a Mobbin API key to search Mobbin." }
    })
    expect(sent).toHaveLength(0)
  })

  it.each([
    [401, "key-refused"],
    [403, "no-access"],
    [404, "unavailable"],
    [500, "unavailable"]
  ] as const)("reads a %i as %s", async (status, code) => {
    const { fetch } = answering(status, { error: { code: "x", message: "y" } })

    const answer = await mobbin.search(paywalls, { fetch, key: "k" })

    expect("problem" in answer && answer.problem.code).toBe(code)
  })

  it("passes on what Mobbin says about a search it couldn't run", async () => {
    const { fetch } = answering(400, { error: { code: "invalid_query", message: "Query is too vague." } })

    expect(await mobbin.search(paywalls, { fetch, key: "k" })).toEqual({
      problem: { code: "invalid", message: "Mobbin couldn't run this search: Query is too vague." }
    })
  })

  it("says how long to wait when Mobbin's limit is reached", async () => {
    const { fetch } = answering(429, { error: { code: "rate_limited", message: "Slow down" } }, { "retry-after": "12" })

    expect(await mobbin.search(paywalls, { fetch, key: "k" })).toEqual({
      problem: {
        code: "rate-limited",
        message: "Mobbin allows 60 searches a minute for your workspace. Try again in 12 seconds.",
        retryAfter: 12
      }
    })
  })

  it("is unavailable when Mobbin can't be reached, takes too long, or answers with something else", async () => {
    const offline: Fetch = () => Promise.reject(new TypeError("fetch failed"))

    const slow: Fetch = () => Promise.reject(Object.assign(new Error("timed out"), { name: "TimeoutError" }))

    const { fetch: garbled } = answering(200, { screens: [{ id: "x" }] })

    const answers = await Promise.all(
      [offline, slow, garbled].map((fetch) => mobbin.search(paywalls, { fetch, key: "k" }))
    )

    expect(answers.map((each) => "problem" in each && each.problem.message)).toEqual([
      "Couldn't reach Mobbin. Check your connection and try again.",
      "Mobbin took too long to answer. Try again.",
      "Mobbin answered with something Parity couldn't read. Try again."
    ])
  })

  it("probes with the smallest search it takes", async () => {
    const { fetch, sent } = answering(200, { screens: [screen] })

    expect(await mobbin.search(mobbin.probe, { fetch, key: "k" })).toHaveProperty("found")
    expect(sentJson(sent[0])).toMatchObject({ limit: 1, mode: "standard" })
  })
})

describe("retryAfter", () => {
  it("reads seconds and dates, and nothing from what it can't read", () => {
    const now = Date.parse("2026-11-10T00:00:00Z")

    expect(retryAfter("30", now)).toBe(30)
    expect(retryAfter("Tue, 10 Nov 2026 00:00:45 GMT", now)).toBe(45)
    expect(retryAfter("Mon, 09 Nov 2026 00:00:00 GMT", now)).toBe(0)
    expect(retryAfter("soon", now)).toBeUndefined()
    expect(retryAfter(null, now)).toBeUndefined()
  })
})
