import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { Fetch, Found, SearchAnswer } from "@parity-app/connectors"
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test"
import type { ConnectorSearch } from "../shared/connectors.ts"
import { searchReferences } from "./references.ts"

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
  const searched: ConnectorSearch[] = []

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
      search: async (search: ConnectorSearch) => {
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
  it("asks main for Mobbin's screens, and saves each preview for the agent", async () => {
    const { options: given, searched } = options(
      { found: [calm] },
      { [calm.image.url]: { type: "image/webp", bytes: webp } }
    )

    const answer = await searchReferences(given, request)

    expect(searched).toEqual([
      {
        connector: "mobbin",
        request: { query: request.query, kind: "screens", platform: "ios", depth: "standard", limit: 6, exclude: [] }
      }
    ])
    expect(answer.found).toEqual([
      {
        id: calm.id,
        app: "Calm",
        platform: "ios",
        link: calm.link,
        image: calm.image.url,
        width: 390,
        height: 844,
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

  it("passes on why a search found nothing", async () => {
    const problem = { code: "no-key" as const, message: "Add a Mobbin API key to search Mobbin." }
    const { options: given } = options({ problem })

    expect(await searchReferences(given, request)).toEqual({ found: [], problem })
  })
})
