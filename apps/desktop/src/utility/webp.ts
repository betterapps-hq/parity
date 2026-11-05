import type { Sharp, SharpOptions } from "sharp"

/**
 * Frame bitmaps and component previews are kept as lossless WebP, encoded here in the project service with sharp's
 * libwebp, about 40% smaller than the PNGs the offscreen window captures and the same pixels (PAR-535). Chromium's own
 * encoder is lossless at full quality too, but wrote larger files than the PNGs. sharp is loaded the first time it's
 * needed, so a system it can't load on still runs, keeping nothing.
 */
let encoder: Promise<(input: Uint8Array, options?: SharpOptions) => Sharp> | undefined

/** A picture, such as a PNG, as a lossless WebP. Fails when sharp can't load or can't read it. */
export async function losslessWebp(picture: Uint8Array): Promise<Buffer> {
  encoder ??= import("sharp").then(
    ({ default: sharp }) => {
      // Each picture is encoded once, so nothing is worth keeping in sharp's cache.
      sharp.cache(false)
      return sharp
    },
    (error: unknown) => {
      console.warn(`[service] sharp couldn't load, so bitmaps and previews aren't kept: ${String(error)}`)
      throw error
    }
  )
  const sharp = await encoder
  return sharp(picture).webp({ lossless: true }).toBuffer()
}
