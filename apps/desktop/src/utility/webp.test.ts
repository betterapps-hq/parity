import sharp from "sharp"
import { describe, expect, it } from "vite-plus/test"
import { losslessWebp } from "./webp.ts"

/** Pixels with edges and soft gradients, as a frame's text and shadows have, as a PNG. */
async function picture(): Promise<Buffer> {
  const width = 37
  const height = 23
  const pixels = Buffer.alloc(width * height * 3)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const at = (y * width + x) * 3
      pixels[at] = (x * 7) % 256
      pixels[at + 1] = (y * 11 + x) % 256
      pixels[at + 2] = x > 18 ? 250 : (x * y) % 256
    }
  }
  return sharp(pixels, { raw: { width, height, channels: 3 } })
    .png()
    .toBuffer()
}

describe("losslessWebp", () => {
  it("gives a WebP of the same pixels", async () => {
    const png = await picture()
    const webp = await losslessWebp(png)
    expect(webp.subarray(8, 12).toString("latin1")).toBe("WEBP")
    const [before, after] = await Promise.all(
      [png, webp].map((image) => sharp(image).removeAlpha().raw().toBuffer({ resolveWithObject: true }))
    )
    expect(after!.info).toMatchObject({ width: 37, height: 23 })
    expect(after!.data.equals(before!.data)).toBe(true)
  })
})
