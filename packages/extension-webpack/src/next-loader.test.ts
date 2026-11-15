import type { GuestPage, GuestPages } from "@parity-app/next-builders"
import { describe, expect, it } from "vite-plus/test"
import { webpackGuestChunks, webpackGuestLoaderSource } from "./next-loader.ts"

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
      packageStyles: [],
      stylesheetBase: `${origin}/_next/`
    })

    expect(source).toContain("chunks.push = (chunk) => Array.prototype.push.call(chunks, [chunk[0], chunk[1]])")
    expect(source.indexOf("map(load)")).toBeLessThan(
      source.indexOf(`await load("${origin}/_next/static/chunks/webpack.js?v=1")`)
    )
    expect(source).toContain('self.webpackChunk_N_E.push([["parity:s1"], {}, (require) => {')
    expect(source).toContain('resolve(require("(app-pages-browser)/./app/guest.tsx"))')
    expect(source).toContain("export default createGuest(")
  })
})
