import { describe, expect, it } from "vite-plus/test"
import type { z } from "zod"
import { type Fetch, pixabay, type SearchRequest } from "./index.ts"

const hit = {
  id: 195893,
  pageURL: "https://pixabay.com/en/blossom-bloom-flower-195893/",
  type: "photo",
  tags: "blossom, bloom, flower",
  previewURL: "https://cdn.pixabay.com/photo/2013/10/15/09/12/flower-195893_150.jpg",
  webformatURL: "https://pixabay.com/get/35bbf209e13e39d2_640.jpg",
  webformatWidth: 640,
  webformatHeight: 426,
  largeImageURL: "https://pixabay.com/get/ed6a99fd0a76647_1280.jpg",
  imageWidth: 4000,
  imageHeight: 2250,
  views: 7671,
  user_id: 48777,
  user: "Josch13",
  userImageURL: "https://cdn.pixabay.com/user/2013/11/05/02-10-23-764_250x250.jpg"
}

const clip = {
  id: 244754,
  pageURL: "https://pixabay.com/videos/id-244754/",
  type: "film",
  tags: "turtle, ocean, tortoise",
  duration: 30,
  videos: {
    large: { url: "https://cdn.pixabay.com/video/244754_large.mp4", width: 2560, height: 1440, size: 70495178 },
    medium: {
      url: "https://cdn.pixabay.com/video/244754_medium.mp4",
      width: 1920,
      height: 1080,
      size: 42948491,
      thumbnail: "https://cdn.pixabay.com/video/244754_medium.jpg"
    },
    tiny: {
      url: "https://cdn.pixabay.com/video/244754_tiny.mp4",
      width: 960,
      height: 540,
      size: 10086122,
      thumbnail: "https://cdn.pixabay.com/video/244754_tiny.jpg"
    }
  },
  user_id: 29857114,
  user: "PaulsAdventures",
  description: "snorkeling with turtles in Curacao"
}

function answering(status: number, body: z.core.util.JSONType, headers: Record<string, string> = {}) {
  const sent: string[] = []

  const fetch: Fetch = async (url) => {
    sent.push(url)

    return new Response(JSON.stringify(body), { status, headers })
  }

  return { fetch, sent }
}

const flowers: SearchRequest = { query: "yellow flowers", kind: "photos" }

describe("pixabay", () => {
  it("searches with the key and safe search, and credits the contributor and Pixabay", async () => {
    const { fetch, sent } = answering(200, { total: 1, totalHits: 1, hits: [hit] })
    const before = Date.now()

    const answer = await pixabay.search(flowers, { fetch, key: "key-1" })

    const url = new URL(sent[0]!)
    expect(url.origin + url.pathname).toBe("https://pixabay.com/api/")
    expect(Object.fromEntries(url.searchParams)).toEqual({
      key: "key-1",
      q: "yellow flowers",
      per_page: "20",
      page: "1",
      safesearch: "true",
      image_type: "photo",
      order: "popular"
    })
    expect(answer).toEqual({
      found: [
        {
          connector: "pixabay",
          id: "195893",
          kind: "photos",
          title: "Blossom, bloom, flower",
          image: { url: hit.largeImageURL, width: 1280, height: 720, expiresAt: expect.any(Number) },
          preview: { url: hit.webformatURL, width: 640, height: 426, expiresAt: expect.any(Number) },
          link: hit.pageURL,
          credit: [
            { name: "Josch13", url: "https://pixabay.com/users/Josch13-48777/" },
            { name: "Pixabay", url: "https://pixabay.com/" }
          ]
        }
      ]
    })
    // Pixabay's links work for a day.
    const expiresAt = "found" in answer ? (answer.found[0]?.image.expiresAt ?? 0) : 0
    expect(expiresAt - before).toBeGreaterThanOrEqual(24 * 60 * 60 * 1000)
  })

  it("sends a page and each filter by the name Pixabay gives it", async () => {
    const { fetch, sent } = answering(200, { hits: [] })

    await pixabay.search(
      {
        ...flowers,
        page: 2,
        limit: 50,
        filters: {
          type: "illustrations",
          orientation: "vertical",
          color: "turquoise",
          category: "nature",
          editors: "true",
          order: "latest"
        }
      },
      { fetch, key: "k" }
    )

    expect(Object.fromEntries(new URL(sent[0]!).searchParams)).toMatchObject({
      page: "2",
      per_page: "50",
      image_type: "illustration",
      orientation: "vertical",
      colors: "turquoise",
      category: "nature",
      editors_choice: "true",
      order: "latest"
    })
  })

  it("asks for Pixabay's fewest a page and keeps as many as the search asked for", async () => {
    const { fetch, sent } = answering(200, { hits: [hit, { ...hit, id: 2 }, { ...hit, id: 3 }] })

    const answer = await pixabay.search({ ...flowers, limit: 1 }, { fetch, key: "k" })

    expect(new URL(sent[0]!).searchParams.get("per_page")).toBe("3")
    expect("found" in answer && answer.found.map(({ id }) => id)).toEqual(["195893"])
  })

  it("answers a page past Pixabay's first 500 results with nothing, without asking", async () => {
    const { fetch, sent } = answering(200, { hits: [hit] })

    expect(await pixabay.search({ ...flowers, page: 26 }, { fetch, key: "k" })).toEqual({ found: [] })
    expect(sent).toHaveLength(0)
  })

  it("names an image by its description, without its closing period", async () => {
    const { fetch } = answering(200, { hits: [{ ...hit, description: "Turquoise lake below Alpine peaks." }] })

    const answer = await pixabay.search(flowers, { fetch, key: "k" })

    expect("found" in answer && answer.found[0]?.title).toBe("Turquoise lake below Alpine peaks")
  })

  it("names an image by its first three tags, each once", async () => {
    const { fetch } = answering(200, { hits: [{ ...hit, tags: "Lake, mountains, lake, hut, cabin" }] })

    const answer = await pixabay.search(flowers, { fetch, key: "k" })

    expect("found" in answer && answer.found[0]?.title).toBe("Lake, mountains, hut")
  })

  it("names an image by its photographer when it has no tags", async () => {
    const { fetch } = answering(200, { hits: [{ ...hit, tags: " , " }] })

    const answer = await pixabay.search(flowers, { fetch, key: "k" })

    expect("found" in answer && answer.found[0]?.title).toBe("By Josch13")
  })

  it("says how many searches Pixabay allows before it turns them away", async () => {
    const { fetch } = answering(200, { hits: [] }, { "x-ratelimit-limit": "100", "x-ratelimit-remaining": "99" })

    expect(await pixabay.search(flowers, { fetch, key: "k" })).toEqual({
      found: [],
      allowance: { remaining: 99, limit: 100 }
    })
  })

  it("turns down a search it doesn't take without asking Pixabay", async () => {
    const { fetch, sent } = answering(200, { hits: [] })

    const asked: SearchRequest[] = [
      { ...flowers, query: "a".repeat(101) },
      { ...flowers, kind: "screens" },
      { ...flowers, filters: { orientation: "squarish" } },
      { ...flowers, filters: { color: "beige" } },
      { ...flowers, exclude: ["1"] },
      { ...flowers, limit: 201 }
    ]

    const answers = await Promise.all(asked.map((request) => pixabay.search(request, { fetch, key: "k" })))

    expect(answers.map((each) => "problem" in each && each.problem.field)).toEqual([
      "query",
      "kind",
      "filters.orientation",
      "filters.color",
      "exclude",
      "limit"
    ])
    expect(sent).toHaveLength(0)
  })

  it.each([
    [400, {}, "[ERROR 400] Invalid or missing API key (https://pixabay.com/api/docs/).", "key-refused"],
    [400, {}, '[ERROR 400] "page" is out of valid range.', "invalid"],
    [429, {}, "API rate limit exceeded", "rate-limited"],
    [500, {}, "", "unavailable"]
  ] as const)("reads a %i saying %j as %s", async (status, headers, body, code) => {
    const fetch: Fetch = async () => new Response(body, { status, headers })

    const answer = await pixabay.search(flowers, { fetch, key: "k" })

    expect("problem" in answer && answer.problem.code).toBe(code)
  })

  it("says how long to wait once the minute's searches are used up", async () => {
    const fetch: Fetch = async () =>
      new Response("API rate limit exceeded", { status: 429, headers: { "x-ratelimit-reset": "42" } })

    expect(await pixabay.search(flowers, { fetch, key: "k" })).toHaveProperty("problem.retryAfter", 42)
  })

  it("searches videos for the videos type, with only the filters that apply to them", async () => {
    const { fetch, sent } = answering(200, { hits: [clip] })

    const answer = await pixabay.search(
      { ...flowers, filters: { type: "videos", footage: "animation", category: "nature" } },
      { fetch, key: "k" }
    )

    const url = new URL(sent[0]!)
    expect(url.origin + url.pathname).toBe("https://pixabay.com/api/videos/")
    expect(Object.fromEntries(url.searchParams)).toEqual({
      key: "k",
      q: "yellow flowers",
      per_page: "20",
      page: "1",
      safesearch: "true",
      video_type: "animation",
      category: "nature",
      order: "popular"
    })
    expect(answer).toEqual({
      found: [
        {
          connector: "pixabay",
          id: "244754",
          kind: "videos",
          title: "Snorkeling with turtles in Curacao",
          image: { url: clip.videos.medium.thumbnail, width: 1920, height: 1080 },
          video: {
            url: clip.videos.medium.url,
            width: 1920,
            height: 1080,
            duration: 30,
            preview: clip.videos.tiny.url
          },
          link: clip.pageURL,
          credit: [
            { name: "PaulsAdventures", url: "https://pixabay.com/users/PaulsAdventures-29857114/" },
            { name: "Pixabay", url: "https://pixabay.com/" }
          ]
        }
      ]
    })
  })

  it("takes a search for videos by kind as one for the videos type", async () => {
    const { fetch, sent } = answering(200, { hits: [] })

    await pixabay.search({ ...flowers, kind: "videos" }, { fetch, key: "k" })

    const mixed = await pixabay.search(
      { ...flowers, kind: "videos", filters: { type: "vectors" } },
      { fetch, key: "k" }
    )

    expect(new URL(sent[0]!).pathname).toBe("/api/videos/")
    expect(mixed).toHaveProperty("problem.field", "filters.type")
    expect(sent).toHaveLength(1)
  })

  it("turns down a picture's filter for videos, and a video's for pictures", async () => {
    const { fetch, sent } = answering(200, { hits: [] })

    const answers = await Promise.all([
      pixabay.search({ ...flowers, filters: { type: "videos", color: "red" } }, { fetch, key: "k" }),
      pixabay.search({ ...flowers, filters: { footage: "film" } }, { fetch, key: "k" })
    ])

    expect(answers.map((each) => "problem" in each && each.problem.field)).toEqual(["filters.color", "filters.footage"])
    expect(sent).toHaveLength(0)
  })

  it("asks for a key before searching without one", async () => {
    const { fetch, sent } = answering(200, { hits: [] })

    expect(await pixabay.search(flowers, { fetch })).toHaveProperty("problem.code", "no-key")
    expect(sent).toHaveLength(0)
  })
})
