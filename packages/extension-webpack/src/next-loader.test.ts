import { runInNewContext } from "node:vm"
import type { GuestPage } from "@parity-app/next-builders"
import { describe, expect, it } from "vite-plus/test"
import { chunkListsSource, type GuestPages, webpackGuestChunks, webpackGuestLoaderSource } from "./next-loader.ts"

const origin = "http://127.0.0.1:4000"
const empty: GuestPage = { scripts: [], stylesheets: [] }

/** The guest app's pages, as Next.js 15's webpack renders the guest's. */
const pages = (guest: GuestPage): GuestPages => ({ guest, styles: empty, packageStyles: empty })

const guestPage: GuestPage = {
  scripts: [
    `${origin}/_next/static/chunks/main-app.js?v=1`,
    `${origin}/_next/static/chunks/app-pages-internals.js`,
    `${origin}/_next/static/chunks/app/page.js`,
    `${origin}/_next/static/chunks/polyfills.js`,
    `${origin}/_next/static/chunks/webpack.js?v=1`
  ],
  stylesheets: [],
  guest: {
    id: "(app-pages-browser)/./app/guest.tsx",
    chunks: ["app/page", "static/chunks/app/page.js", "vendor", "static/chunks/vendor.js"]
  }
}

describe("webpackGuestChunks", () => {
  it("loads the page's chunks and the guest's once, without Next's polyfills, and the runtime after them", () => {
    expect(webpackGuestChunks(pages(guestPage), origin)).toEqual({
      chunks: [
        `${origin}/_next/static/chunks/main-app.js?v=1`,
        `${origin}/_next/static/chunks/app-pages-internals.js`,
        `${origin}/_next/static/chunks/app/page.js`,
        `${origin}/_next/static/chunks/vendor.js`
      ],
      runtime: `${origin}/_next/static/chunks/webpack.js?v=1`,
      id: "(app-pages-browser)/./app/guest.tsx"
    })
  })

  it("fails when the page has no runtime or guest module", () => {
    expect(() => webpackGuestChunks(pages({ ...guestPage, scripts: [] }), origin)).toThrow("no webpack runtime")
    expect(() => webpackGuestChunks(pages({ scripts: guestPage.scripts, stylesheets: [] }), origin)).toThrow(
      "no webpack runtime or guest module"
    )
  })
})

describe("webpackGuestLoaderSource", () => {
  it("keeps the chunks' start-up functions out until the runtime loads, then asks it for the guest module", () => {
    const source = webpackGuestLoaderSource({
      ...webpackGuestChunks(pages(guestPage), origin),
      session: "s1",
      styles: [],
      packageStyles: []
    })

    expect(source).toContain(chunkListsSource)
    expect(source).toContain(`startSession("s1", "${origin}/_next/static/chunks/webpack.js?v=1")`)
    expect(source.indexOf("map(load)")).toBeLessThan(
      source.indexOf(`await load("${origin}/_next/static/chunks/webpack.js?v=1")`)
    )
    expect(source).toContain('listOf("s1").push([["parity:s1"], {}, (require) => {')
    expect(source).toContain('resolve(require("(app-pages-browser)/./app/guest.tsx"))')
    expect(source).toContain("export default createGuest(")
  })
})

/** A webpack chunk as Next pushes it: its ids, its modules, and maybe a start-up function. */
type Chunk = [ids: string[], modules: Record<string, () => void>, startup?: () => void]

/** The page's globals that webpack's runtime and chunks reach. */
interface PageGlobals {
  webpackChunk_N_E?: Chunk[]
}

/** The page's document, as far as webpack's runtime and chunks read it. */
interface PageDocument {
  currentScript: { src: string } | null
}

/** What {@link chunkListsSource} defines for the guest module. */
interface ChunkLists {
  startSession: (session: string, runtime: string) => void
  listOf: (session: string) => Chunk[]
}

/**
 * A page with {@link chunkListsSource} run in it: `run` runs code as a script from an address, which webpack's runtime
 * and chunks find as `document.currentScript`.
 */
function page() {
  const self: PageGlobals = {}
  const document: PageDocument = { currentScript: null }
  const location = { href: "http://localhost:5173/" }

  // SAFETY: the script's last statement gives its `startSession` and `listOf`, which ChunkLists describes.
  const sessions = runInNewContext(
    `${chunkListsSource}
;({ startSession, listOf })`,
    { self, document, location, URL }
  ) as ChunkLists

  const run = <T>(src: string, code: () => T): T => {
    document.currentScript = { src }

    try {
      return code()
    } finally {
      document.currentScript = null
    }
  }

  /** What a chunk does: pushes itself to the page's list. */
  const pushChunk = (src: string, chunk: Chunk) =>
    run(src, () => {
      const list = (self.webpackChunk_N_E ??= [])
      list.push(chunk)
    })

  /** What webpack's runtime does: takes the page's list over, and gives what reaches it to `received`. */
  const startRuntime = (src: string, received: Chunk[]) =>
    run(src, () => {
      const list = (self.webpackChunk_N_E ??= [])
      list.forEach((chunk) => received.push(chunk))
      list.push = (...chunks: Chunk[]) => received.push(...chunks)
    })

  return { ...sessions, pushChunk, startRuntime }
}

/** A start-up function, which would start Next's router. */
const startNextRouter = () => undefined

describe("chunkListsSource", () => {
  const first = "http://127.0.0.1:4000"
  const second = "http://127.0.0.1:4001"

  it("keeps each session's chunks, lazy ones too, on its own runtime when two guests share the page", () => {
    const { startSession, listOf, pushChunk, startRuntime } = page()
    const firstReceived: Chunk[] = []
    const secondReceived: Chunk[] = []

    startSession("a", `${first}/_next/static/chunks/webpack.js`)
    pushChunk(`${first}/_next/static/chunks/main-app.js`, [["main-app"], {}, startNextRouter])
    startRuntime(`${first}/_next/static/chunks/webpack.js`, firstReceived)

    startSession("b", `${second}/_next/static/chunks/webpack.js`)
    pushChunk(`${second}/_next/static/chunks/main-app.js`, [["main-app"], {}])
    startRuntime(`${second}/_next/static/chunks/webpack.js`, secondReceived)

    pushChunk(`${first}/_next/static/chunks/lazy.js`, [["lazy"], {}])

    expect(firstReceived.map(([ids]) => ids)).toEqual([["main-app"], ["lazy"]])
    expect(secondReceived.map(([ids]) => ids)).toEqual([["main-app"]])
    expect(listOf("a")).not.toBe(listOf("b"))
  })

  it("leaves out a chunk's start-up function until the runtime takes the list over", () => {
    const { startSession, listOf, pushChunk } = page()

    startSession("a", `${first}/_next/static/chunks/webpack.js`)
    pushChunk(`${first}/_next/static/chunks/main-app.js`, [["main-app"], {}, startNextRouter])

    expect([...listOf("a")]).toEqual([[["main-app"], {}]])
  })
})
