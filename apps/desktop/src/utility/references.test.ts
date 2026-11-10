import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { Fetch, Found, SearchAnswer, SearchRequest } from "@parity-app/connectors"
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test"
import { searchPhotos, searchReferences } from "./references.ts"

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
  const searched: SearchRequest[] = []

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
      find: async (search: SearchRequest) => {
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
        query: request.query,
        kind: "screens",
        filters: { platform: "ios", depth: "standard" },
        limit: 6,
        exclude: []
      }
    ])
    expect(answer.found).toEqual([
      {
        id: calm.id,
        source: "Mobbin",
        title: "Calm",
        platform: "ios",
        link: calm.link,
        image: calm.image.url,
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

  it("asks main for photos with only the filters named, and passes on how many searches are left", async () => {
    const { platform: _platform, ...screen } = calm

    const desk: Found = {
      ...screen,
      connector: "unsplash",
      id: "Dwu85P9SOIk",
      kind: "photos",
      title: "white desk",
      image: { url: "https://images.unsplash.com/photo-1" }
    }

    const { options: given, searched } = options({ found: [desk], allowance: { remaining: 49, limit: 50 } })

    const answer = await searchPhotos(given, { query: "desk", orientation: "portrait", limit: 6, page: 2 })

    expect(searched).toEqual([
      { query: "desk", kind: "photos", filters: { orientation: "portrait" }, limit: 6, page: 2 }
    ])
    expect(answer.allowance).toEqual({ remaining: 49, limit: 50 })
    expect(answer.found.map(({ title, platform }) => [title, platform])).toEqual([["white desk", undefined]])
  })

  it("passes on why a search found nothing", async () => {
    const problem = { code: "no-key" as const, message: "Add a Mobbin API key to search Mobbin." }
    const { options: given } = options({ problem })

    expect(await searchReferences(given, request)).toEqual({ found: [], problem })
  })
})
