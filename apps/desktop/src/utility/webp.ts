import type { Sharp, SharpOptions } from "sharp"

/**
 * Frame bitmaps and component previews are kept as lossless WebP, encoded here in the project service with sharp's
 * libwebp, about 40% smaller than the PNGs the offscreen window captures and the same pixels (PAR-535). Chromium's own
 * encoder is lossless at full quality too, but wrote larger files than the PNGs. sharp is loaded the first time it's
 * needed, so a system it can't load on still runs, keeping nothing.
 */
let encoder: Promise<(input: Uint8Array, options?: SharpOptions) => Sharp> | undefined

function loadSharp(): Promise<(input: Uint8Array, options?: SharpOptions) => Sharp> {
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
  return encoder
}

/** A picture, such as a PNG, as a lossless WebP. Fails when sharp can't load or can't read it. */
export async function losslessWebp(picture: Uint8Array): Promise<Buffer> {
  const sharp = await loadSharp()
  return sharp(picture).webp({ lossless: true }).toBuffer()
}

/**
 * The top of a picture, as tall as `ratio` times its width, as a lossless WebP: a frame's bitmap cut to its window, as a
 * project's picture shows it (PAR-607). Nothing when the picture is no taller than that already. Fails when sharp can't
 * load or can't read it.
 */
export async function topOfPicture(picture: Uint8Array, ratio: number): Promise<Buffer | undefined> {
  const sharp = await loadSharp()
  const { width, height } = await sharp(picture).metadata()
  const kept = Math.max(1, Math.round(width * ratio))
  if (kept >= height) return undefined
  return sharp(picture).extract({ left: 0, top: 0, width, height: kept }).webp({ lossless: true }).toBuffer()
}
