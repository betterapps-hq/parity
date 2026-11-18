import { describe, expect, it } from "vite-plus/test"
import { lensWindowPage, lensWindowUrl, readLensWindowUrl } from "./lens-window.ts"

describe("a lens window's address", () => {
  const dev = "http://localhost:5310/"
  const installed = "parity://app/index.html"

  it("names the lens, and whether its tab was let go somewhere", () => {
    const moved = lensWindowUrl(lensWindowPage, { lens: "screens", placed: false })
    const dropped = lensWindowUrl(lensWindowPage, { lens: "screens", placed: true })

    expect(readLensWindowUrl(new URL(moved, dev).href, dev)).toEqual({ lens: "screens", placed: false })
    expect(readLensWindowUrl(new URL(dropped, installed).href, installed)).toEqual({ lens: "screens", placed: true })
  })

  it("is only Parity's own page, on the window's scheme and host", () => {
    const page = (base: string) => new URL(`${lensWindowPage}?lens=screens`, base).href

    expect(readLensWindowUrl(page("http://localhost:5311/"), dev)).toBeUndefined()
    expect(readLensWindowUrl(page("https://example.com/"), dev)).toBeUndefined()
    expect(readLensWindowUrl(page("parity://other/"), installed)).toBeUndefined()
    expect(readLensWindowUrl(new URL("/index.html?lens=screens", dev).href, dev)).toBeUndefined()
    expect(readLensWindowUrl(new URL(lensWindowPage, dev).href, dev)).toBeUndefined()
    expect(readLensWindowUrl("not a url", dev)).toBeUndefined()
  })
})
