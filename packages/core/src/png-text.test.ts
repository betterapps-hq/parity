import { crc32 } from "node:zlib"
import { describe, expect, it } from "vite-plus/test"
import { pngText, withPngText } from "./png-text.ts"

/** A PNG of one transparent pixel. */
const pixel = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
    "base64"
  )
)

/** Each chunk's type, and whether its CRC matches its type and data. */
function chunks(png: Uint8Array): { type: string; valid: boolean }[] {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength)
  const found: { type: string; valid: boolean }[] = []
  for (let at = 8; at < png.length;) {
    const length = view.getUint32(at)
    const typed = png.subarray(at + 4, at + 8 + length)
    found.push({
      type: Buffer.from(png.subarray(at + 4, at + 8)).toString("latin1"),
      valid: crc32(typed) === view.getUint32(at + 8 + length)
    })
    at += 12 + length
  }
  return found
}

describe("text kept in a PNG", () => {
  it("reads back what was kept, right after the header, with a valid CRC", () => {
    const kept = withPngText(pixel, "parity:height", "812")
    expect(pngText(kept, "parity:height")).toBe("812")
    expect(chunks(kept)).toEqual([
      { type: "IHDR", valid: true },
      { type: "tEXt", valid: true },
      { type: "IDAT", valid: true },
      { type: "IEND", valid: true }
    ])
  })

  it("replaces text under the same keyword and keeps text under others", () => {
    const kept = withPngText(withPngText(withPngText(pixel, "a", "1"), "b", "2"), "a", "3")
    expect(pngText(kept, "a")).toBe("3")
    expect(pngText(kept, "b")).toBe("2")
    expect(chunks(kept).filter((chunk) => chunk.type === "tEXt")).toHaveLength(2)
  })

  it("finds nothing in a PNG without it", () => {
    expect(pngText(pixel, "parity:height")).toBeUndefined()
  })

  it("leaves what isn't a PNG alone", () => {
    const text = new TextEncoder().encode("not a picture, though long enough to be one")
    expect(withPngText(text, "a", "1")).toBe(text)
    expect(pngText(text, "a")).toBeUndefined()
  })
})
