import { describe, expect, it } from "vite-plus/test"
import type { z } from "zod"
import { type Fetch, type Found, type SearchRequest, unsplash } from "./index.ts"

const photo = {
  id: "Dwu85P9SOIk",
  width: 4000,
  height: 3000,
  description: "A desk by a window",
  alt_description: "white desk",
  urls: { regular: "https://images.unsplash.com/photo-1?ixid=x&w=1080" },
  links: { html: "https://unsplash.com/photos/Dwu85P9SOIk" },
  user: { name: "Ada Park", links: { html: "https://unsplash.com/@adapark" } }
}

function answering(status: number, body: z.core.util.JSONType, headers: Record<string, string> = {}) {
  const sent: { url: string; init: RequestInit }[] = []

  const fetch: Fetch = async (url, init) => {
    sent.push({ url, init })

    return new Response(JSON.stringify(body), { status, headers })
  }

  return { fetch, sent }
}

const desks: SearchRequest = { query: "desk by a window", kind: "photos" }

describe("unsplash", () => {
  it("searches with the Access Key and keeps out photos unsuitable for every audience", async () => {
    const { fetch, sent } = answering(200, { total: 1, total_pages: 1, results: [photo] })

    const answer = await unsplash.search(desks, { fetch, key: "access-1" })

    const url = new URL(sent[0]!.url)
    expect(url.origin + url.pathname).toBe("https://api.unsplash.com/search/photos")
    expect(Object.fromEntries(url.searchParams)).toEqual({
      query: "desk by a window",
      per_page: "20",
      content_filter: "high"
    })
    expect(new Headers(sent[0]?.init.headers).get("authorization")).toBe("Client-ID access-1")
    expect(answer).toEqual({
      found: [
        {
          connector: "unsplash",
          id: "Dwu85P9SOIk",
          kind: "photos",
          title: "white desk",
          image: { url: photo.urls.regular, width: 1080, height: 810 },
          link: "https://unsplash.com/photos/Dwu85P9SOIk?utm_source=parity&utm_medium=referral",
          credit: [
            { name: "Ada Park", url: "https://unsplash.com/@adapark?utm_source=parity&utm_medium=referral" },
            { name: "Unsplash", url: "https://unsplash.com/?utm_source=parity&utm_medium=referral" }
          ]
        }
      ]
    })
  })

  it("sends a page, an orientation and a color", async () => {
    const { fetch, sent } = answering(200, { results: [] })

    await unsplash.search(
      { ...desks, page: 3, limit: 30, filters: { orientation: "portrait", color: "teal" } },
      { fetch, key: "k" }
    )

    expect(Object.fromEntries(new URL(sent[0]!.url).searchParams)).toMatchObject({
      page: "3",
      per_page: "30",
      orientation: "portrait",
      color: "teal"
    })
  })

  it("says how many searches Unsplash allows before it turns them away", async () => {
    const { fetch } = answering(200, { results: [] }, { "x-ratelimit-limit": "50", "x-ratelimit-remaining": "49" })

    expect(await unsplash.search(desks, { fetch, key: "k" })).toEqual({
      found: [],
      allowance: { remaining: 49, limit: 50 }
    })
  })

  it("names a photo by its alt text, then its description, then its photographer", async () => {
    const { fetch } = answering(200, { results: [{ ...photo, description: null, alt_description: null }] })

    const answer = await unsplash.search(desks, { fetch, key: "k" })

    expect("found" in answer && answer.found[0]?.title).toBe("Photo by Ada Park")
  })

  it("turns down filters it doesn't take without asking Unsplash", async () => {
    const { fetch, sent } = answering(200, { results: [] })

    const asked: SearchRequest[] = [
      { ...desks, kind: "screens" },
      { ...desks, filters: { platform: "ios" } },
      { ...desks, exclude: ["a"] },
      { ...desks, filters: { color: "beige" } },
      { ...desks, limit: 31 }
    ]

    const answers = await Promise.all(asked.map((request) => unsplash.search(request, { fetch, key: "k" })))

    expect(answers.map((each) => "problem" in each && each.problem.field)).toEqual([
      "kind",
      "filters.platform",
      "exclude",
      "filters.color",
      "limit"
    ])
    expect(sent).toHaveLength(0)
  })

  it.each([
    [401, {}, "", "key-refused"],
    [403, { "x-ratelimit-remaining": "0" }, "Rate Limit Exceeded", "rate-limited"],
    [403, {}, "Forbidden", "no-access"],
    [500, {}, "", "unavailable"]
  ] as const)("reads a %i as %s", async (status, headers, body, code) => {
    const fetch: Fetch = async () => new Response(body, { status, headers })

    const answer = await unsplash.search(desks, { fetch, key: "k" })

    expect("problem" in answer && answer.problem.code).toBe(code)
  })

  it("asks for a key before searching without one", async () => {
    const { fetch, sent } = answering(200, { results: [] })

    expect(await unsplash.search(desks, { fetch })).toHaveProperty("problem.code", "no-key")
    expect(sent).toHaveLength(0)
  })

  it("reports a photo someone used to its download endpoint, and lets a failure go", async () => {
    const { fetch, sent } = answering(200, { url: "https://images.unsplash.com/photo-1" })

    const found: Found = {
      connector: "unsplash",
      id: "Dwu85P9SOIk",
      kind: "photos",
      title: "Desk",
      image: { url: photo.urls.regular },
      link: photo.links.html,
      credit: []
    }

    await unsplash.picked?.(found, { fetch, key: "k" })
    await unsplash.picked?.(found, { fetch: () => Promise.reject(new Error("offline")), key: "k" })

    expect(sent.map(({ url }) => url)).toEqual(["https://api.unsplash.com/photos/Dwu85P9SOIk/download"])
    expect(new Headers(sent[0]?.init.headers).get("authorization")).toBe("Client-ID k")
  })
})
