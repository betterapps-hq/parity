import { describe, expect, it } from "vitest"
import { pageScripts, tarEntry } from "./published.ts"

/** A tar entry as npm writes one: a ustar header, then the body padded to 512 bytes. */
function entry(name: string, body: string, type = "0"): Buffer {
  const header = Buffer.alloc(512)
  header.write(name.slice(0, 100), 0)
  header.write(`${Buffer.byteLength(body).toString(8).padStart(11, "0")}\0`, 124)
  header.write(type, 156)
  header.write("ustar\0", 257)
  const padded = Buffer.alloc(Math.ceil(Buffer.byteLength(body) / 512) * 512)
  padded.write(body)
  return Buffer.concat([header, padded])
}

/** A pax header giving the next entry's long path. */
function pax(path: string): Buffer {
  const record = (length: number) => `${length} path=${path}\n`
  let length = record(0).length
  while (record(length).length !== length) length = record(length).length
  return entry("PaxHeader", record(length), "x")
}

describe("tarEntry", () => {
  it("finds a file by its path, past the ones before it", () => {
    const archive = Buffer.concat([
      entry("package/package.json", "{}"),
      entry("package/tags.json", '{"x":["close"]}'),
      Buffer.alloc(1024)
    ])
    expect(tarEntry(archive, "package/tags.json")?.toString()).toBe('{"x":["close"]}')
    expect(tarEntry(archive, "package/missing.json")).toBeUndefined()
  })

  it("reads the long paths pax headers give", () => {
    const long = `package/${"deep/".repeat(30)}meta.json`
    const archive = Buffer.concat([pax(long), entry("package/deep/deep/meta.json", "[1]"), Buffer.alloc(1024)])
    expect(tarEntry(archive, long)?.toString()).toBe("[1]")
  })
})

describe("pageScripts", () => {
  it("fetches the scripts a page loads from its own site, with the day it was served", async () => {
    const pages: Record<string, string> = {
      "https://heroicons.com/": `<html><head><script src="/_next/static/chunks/main-1.js" defer=""></script>
<script async src="https://www.googletagmanager.com/gtag/js"></script>
<script src="/_next/static/chunks/pages/%5B%5B...slug%5D%5D-2.js"></script><script>inline()</script></head></html>`,
      "https://heroicons.com/_next/static/chunks/main-1.js": "main()",
      "https://heroicons.com/_next/static/chunks/pages/%5B%5B...slug%5D%5D-2.js": "page()"
    }
    const asked: string[] = []
    const usual = globalThis.fetch
    globalThis.fetch = (async (input: string | URL) => {
      const url = String(input)
      asked.push(url)
      const text = pages[url]
      return new Response(text ?? "", {
        status: text === undefined ? 404 : 200,
        headers: { date: "Thu, 29 Oct 2026 17:00:00 GMT" }
      })
    }) as typeof fetch
    try {
      const { served, scripts } = await pageScripts("https://heroicons.com/")
      expect(served).toBe("2026-10-29")
      expect(scripts).toEqual([
        { path: "/_next/static/chunks/main-1.js", text: "main()" },
        { path: "/_next/static/chunks/pages/[[...slug]]-2.js", text: "page()" }
      ])
      expect(asked.some((url) => url.includes("googletagmanager"))).toBe(false)
    } finally {
      globalThis.fetch = usual
    }
  })
})
