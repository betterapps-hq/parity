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
