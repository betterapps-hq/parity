import { describe, expect, it } from "vite-plus/test"
import { fetchPageSheet } from "./page-sheets.ts"

const css = (body: string, type = "text/css; charset=utf-8", status = 200) =>
  new Response(body, { status, headers: { "content-type": type } })

describe("fetchPageSheet", () => {
  it("fetches another host's stylesheet over https", async () => {
    const asked: string[] = []

    const text = await fetchPageSheet("https://fonts.test/css?family=Inter", async (url) => {
      asked.push(url)

      return css("@font-face { font-family: Inter; }")
    })

    expect(text).toBe("@font-face { font-family: Inter; }")
    expect(asked).toEqual(["https://fonts.test/css?family=Inter"])
  })

  it("makes its url()s absolute against the address it came from, after a redirect", async () => {
    const text = await fetchPageSheet("https://fonts.test/css", async () => {
      const response = css("@font-face { src: url(../files/inter.woff2) } a { background: url(/bg.png) }")
      Object.defineProperty(response, "url", { value: "https://cdn.fonts.test/v2/css/inter.css" })

      return response
    })

    expect(text).toBe(
      '@font-face { src: url("https://cdn.fonts.test/v2/files/inter.woff2") } a { background: url("https://cdn.fonts.test/bg.png") }'
    )
  })

  it("inlines its @imports inside their conditions, each resolved against its own address", async () => {
    const sheets = new Map([
      [
        "https://cdn.test/css/main.css",
        `@import "base.css" layer(base) screen; @import url(https://fonts.test/f.css); a { color: red }`
      ],
      ["https://cdn.test/css/base.css", "body { background: url(bg.png) }"],
      ["https://fonts.test/f.css", "@font-face { font-family: F }"]
    ])

    const text = await fetchPageSheet("https://cdn.test/css/main.css", async (url) => {
      const body = sheets.get(url)

      return body === undefined ? css("", "text/css", 404) : css(body)
    })

    expect(text).toBe(
      `@layer base {\n@media screen {\nbody { background: url("https://cdn.test/css/bg.png") }\n}\n} @font-face { font-family: F } a { color: red }`
    )
  })

  it("keeps an @import's supports() apart from the media after it", async () => {
    const sheets = new Map([
      [
        "https://cdn.test/main.css",
        `@import "grid.css" supports((display: grid) and (gap: 1px)) screen and (min-width: 600px);`
      ],
      ["https://cdn.test/grid.css", "main { display: grid }"]
    ])

    const text = await fetchPageSheet("https://cdn.test/main.css", async (url) => css(sheets.get(url) ?? ""))

    expect(text).toBe(
      "@supports ((display: grid) and (gap: 1px)) {\n@media screen and (min-width: 600px) {\nmain { display: grid }\n}\n}"
    )
  })

  it("refuses anything but https, without asking", async () => {
    let asked = 0
    const fetch = async () => (asked++, css("a{}"))

    expect(await fetchPageSheet("http://fonts.test/a.css", fetch)).toBeNull()
    expect(await fetchPageSheet("file:///c:/a.css", fetch)).toBeNull()
    expect(await fetchPageSheet("not a url", fetch)).toBeNull()
    expect(asked).toBe(0)
  })

  it("gives nothing for a failed answer, one that isn't CSS, or a request that fails", async () => {
    expect(await fetchPageSheet("https://a.test/a.css", async () => css("gone", "text/css", 404))).toBeNull()
    expect(await fetchPageSheet("https://a.test/a.css", async () => css("<html>", "text/html"))).toBeNull()
    expect(
      await fetchPageSheet("https://a.test/a.css", async () => {
        throw new Error("offline")
      })
    ).toBeNull()
  })
})
