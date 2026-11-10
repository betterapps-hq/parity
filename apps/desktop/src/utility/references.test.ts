import { existsSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { Fetch, Found, SearchAnswer } from "@parity-app/connectors"
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test"
import type { ConnectorFind } from "../shared/connectors.ts"
import { searchMedia, searchReferences } from "./references.ts"

let folder = ""

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), "parity-references-"))
})

afterEach(() => rmSync(folder, { recursive: true, force: true }))

const calm: Found = {
  connector: "mobbin",
  id: "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed",
  kind: "screens",
  title: "Calm",
  platform: "ios",
  image: { url: "https://images.mobbin.com/calm.webp", width: 390, height: 844, expiresAt: 1 },
  link: "https://mobbin.com/screens/1b9d6bcd",
  credit: [{ name: "Calm" }, { name: "Mobbin", url: "https://mobbin.com/screens/1b9d6bcd" }]
}

const webp = Buffer.from("RIFF0000WEBPVP8 ")

/** Main's side, answering with `answer`, and a fetch that serves pictures by URL. */
function options(answer: SearchAnswer, pictures: Record<string, { type: string; bytes: Buffer }> = {}) {
  const searched: ConnectorFind[] = []

  const fetch: Fetch = async (url) => {
    const picture = pictures[url]

    if (!picture) {
      return new Response("Not found", { status: 404 })
    }

    return new Response(new Uint8Array(picture.bytes), { headers: { "content-type": picture.type } })
  }

  return {
    searched,
    options: {
      find: async (search: ConnectorFind) => {
        searched.push(search)

        return answer
      },
      fetch,
      folder,
      timeout: 1000
    }
  }
}

const request: Parameters<typeof searchReferences>[1] = {
  query: "paywall with a free trial",
  platform: "ios",
  depth: "standard",
  limit: 6,
  exclude: []
}

describe("searchReferences", () => {
  it("asks main for screens with their filters, and saves each preview for the agent", async () => {
    const { options: given, searched } = options(
      { found: [calm] },
      { [calm.image.url]: { type: "image/webp", bytes: webp } }
    )

    const answer = await searchReferences(given, request)

    expect(searched).toEqual([
      {
        request: {
          query: request.query,
          kind: "screens",
          filters: { platform: "ios", depth: "standard" },
          limit: 6
        }
      }
    ])
    expect(answer.found).toEqual([
      {
        id: calm.id,
        connector: "mobbin",
        source: "Mobbin",
        kind: "screens",
        title: "Calm",
        platform: "ios",
        link: calm.link,
        width: 390,
        height: 844,
        credit: calm.credit,
        preview: {
          path: expect.stringMatching(/calm-1b9d6bcd-[0-9a-f]{8}\.webp$/),
          mimeType: "image/webp",
          data: webp.toString("base64")
        }
      }
    ])

    expect(readFileSync(answer.found[0]!.preview!.path)).toEqual(webp)
  })

  it("lists a screen without a preview when its picture can't be fetched or isn't one", async () => {
    const html = { ...calm, id: "2", image: { url: "https://images.mobbin.com/page" } }

    const { options: given } = options(
      { found: [calm, html] },
      { "https://images.mobbin.com/page": { type: "text/html", bytes: Buffer.from("<html>") } }
    )

    const answer = await searchReferences(given, request)

    expect(answer.found.map((each) => [each.id, each.preview])).toEqual([
      [calm.id, undefined],
      ["2", undefined]
    ])
  })

  it("asks main for pictures with only the filters named, and passes on how many searches are left", async () => {
    const { platform: _platform, ...screen } = calm

    const desk: Found = {
      ...screen,
      connector: "unsplash",
      id: "Dwu85P9SOIk",
      kind: "photos",
      title: "white desk",
      image: { url: "https://images.unsplash.com/photo-1" },
      preview: { url: "https://images.unsplash.com/photo-1-small" }
    }

    const { options: given, searched } = options(
      { found: [desk], allowance: { remaining: 49, limit: 50 } },
      { "https://images.unsplash.com/photo-1-small": { type: "image/jpeg", bytes: Buffer.from("jpeg") } }
    )

    const answer = await searchMedia(given, {
      query: "desk",
      connector: "unsplash",
      orientation: "portrait",
      limit: 6,
      page: 2
    })

    expect(searched).toEqual([
      {
        connector: "unsplash",
        request: { query: "desk", kind: "photos", filters: { orientation: "portrait" }, limit: 6, page: 2 }
      }
    ])
    expect(answer.allowance).toEqual({ remaining: 49, limit: 50 })
    expect(
      answer.found.map(({ title, kind, platform, preview }) => [title, kind, platform, preview?.mimeType])
    ).toEqual([["white desk", "photos", undefined, "image/jpeg"]])
  })

  it("asks main for videos when the type is videos", async () => {
    const { options: given, searched } = options({ found: [] }, {})

    await searchMedia(given, { query: "waves", type: "videos", limit: 6 })

    expect(searched).toEqual([{ request: { query: "waves", kind: "videos", filters: { type: "videos" }, limit: 6 } }])
  })

  it("deletes previews saved more than a week ago, and keeps newer ones", async () => {
    const old = join(folder, "old.webp")
    const recent = join(folder, "recent.webp")
    writeFileSync(old, webp)
    writeFileSync(recent, webp)
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000)
    utimesSync(old, eightDaysAgo, eightDaysAgo)

    await searchReferences(options({ found: [] }).options, request)

    expect([existsSync(old), existsSync(recent)]).toEqual([false, true])
  })

  it("says a search has run out when more was asked for and none came", async () => {
    const { options: given } = options({ found: [] })

    expect(await searchReferences(given, { ...request, exclude: [calm.id] })).toEqual({ found: [], done: true })
    expect(await searchReferences(given, request)).toEqual({ found: [] })
  })

  it("leaves out a preview that's too big, and keeps a long title out of the file name", async () => {
    const long = { ...calm, id: "3", title: "A".repeat(300), image: { url: "https://images.mobbin.com/long" } }
    const huge = { ...calm, id: "4", image: { url: "https://images.mobbin.com/huge" } }

    const { options: given } = options(
      { found: [long, huge] },
      {
        "https://images.mobbin.com/long": { type: "image/webp", bytes: webp },
        "https://images.mobbin.com/huge": { type: "image/webp", bytes: Buffer.alloc(4 * 1024 * 1024 + 1) }
      }
    )

    const answer = await searchReferences(given, request)

    expect(answer.found[0]?.preview?.path).toMatch(/[/\\]a{40}-3-[0-9a-f]{8}\.webp$/)
    expect(answer.found[1]?.preview).toBeUndefined()
  })

  it("passes on why a search found nothing", async () => {
    const problem = { code: "no-key" as const, message: "This copy of Parity has no Mobbin key." }
    const { options: given } = options({ problem })

    expect(await searchReferences(given, request)).toEqual({ found: [], problem })
  })
})
