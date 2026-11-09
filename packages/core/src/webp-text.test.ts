import { describe, expect, it } from "vite-plus/test"
import { isWebp, webpSize, webpText, withWebpText } from "./webp-text.ts"

/** Tiny WebPs as an encoder writes them: lossless 3x2 without alpha, lossless 2x5 with alpha, and lossy 4x4. */
const opaque = Buffer.from("UklGRh4AAABXRUJQVlA4TBEAAAAvAkAAAAdQvFIUuf+BiOh/AAA=", "base64")
const translucent = Buffer.from("UklGRhwAAABXRUJQVlA4TA8AAAAvAQABEAcQ/Y8CBiKi/wEA", "base64")
const lossy = Buffer.from("UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoEAAQAAUAmJaQAA3AA/vzKsAA=", "base64")

/** Each chunk's type and data size, in order, and whether the RIFF size covers the file exactly. */
function layout(webp: Uint8Array) {
  const view = new DataView(webp.buffer, webp.byteOffset, webp.byteLength)
  const types: string[] = []
  let at = 12

  while (at + 8 <= webp.length) {
    const size = view.getUint32(at + 4, true)
    types.push(String.fromCharCode(...webp.subarray(at, at + 4)))
    at += 8 + size + (size % 2)
  }

  return { types, whole: view.getUint32(4, true) + 8 === webp.length && at === webp.length }
}

/** The canvas size and alpha flag the extended header gives. */
function extended(webp: Uint8Array) {
  const view = new DataView(webp.buffer, webp.byteOffset, webp.byteLength)
  // Each size is the low 24 bits, less one; the alpha flag is bit 4 of the first byte.
  const width = (view.getUint32(24, true) % 2 ** 24) + 1
  const height = (view.getUint32(27, true) % 2 ** 24) + 1

  return { width, height, alpha: Math.floor(webp[20]! / 2 ** 4) % 2 === 1 }
}

describe("withWebpText", () => {
  it("keeps text after the image, behind the extended header a plain WebP needs, and reads it back", () => {
    const kept = withWebpText(opaque, "parity:height", "812.5")
    expect(layout(kept)).toEqual({ types: ["VP8X", "VP8L", "TEXT"], whole: true })
    expect(extended(kept)).toEqual({ width: 3, height: 2, alpha: false })
    expect(webpText(kept, "parity:height")).toBe("812.5")
    // The image's own bytes are untouched.
    expect(Buffer.from(kept).includes(opaque.subarray(12))).toBe(true)
  })

  it("says the image has alpha when a lossless image does, and gives a lossy image its size", () => {
    expect(extended(withWebpText(translucent, "k", "v"))).toEqual({ width: 2, height: 5, alpha: true })
    const kept = withWebpText(lossy, "k", "v")
    expect(layout(kept).types).toEqual(["VP8X", "VP8 ", "TEXT"])
    expect(extended(kept)).toEqual({ width: 4, height: 4, alpha: false })
  })

  it("replaces text under the same keyword and keeps text under others, padding odd sizes", () => {
    const once = withWebpText(opaque, "parity:height", "1")
    const twice = withWebpText(withWebpText(once, "other", "kept"), "parity:height", "2000")
    expect(layout(twice)).toEqual({ types: ["VP8X", "VP8L", "TEXT", "TEXT"], whole: true })
    expect(webpText(twice, "parity:height")).toBe("2000")
    expect(webpText(twice, "other")).toBe("kept")
  })

  it("has none without the text, and leaves what isn't a WebP alone", () => {
    expect(webpText(opaque, "parity:height")).toBeUndefined()
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    expect(isWebp(png)).toBe(false)
    expect(withWebpText(png, "k", "v")).toBe(png)
    expect(webpText(png, "k")).toBeUndefined()
  })
})

describe("webpSize", () => {
  it("reads the size from a plain lossless or lossy image's header, or the extended header's canvas", () => {
    expect(webpSize(opaque)).toEqual({ width: 3, height: 2 })
    expect(webpSize(lossy)).toEqual({ width: 4, height: 4 })
    expect(webpSize(withWebpText(translucent, "k", "v"))).toEqual({ width: 2, height: 5 })
    expect(webpSize(Buffer.from("not a webp at all, but long enough"))).toBeUndefined()
  })
})
