import type { SharpConstructor } from "sharp"
import { degraded } from "./degraded.ts"

/**
 * Frame bitmaps and component previews are kept as lossless WebP, encoded here in the project service with sharp's
 * libwebp, about 40% smaller than the PNGs the offscreen window captures and the same pixels (PAR-535). Chromium's own
 * encoder is lossless at full quality too, but wrote larger files than the PNGs. sharp is loaded the first time it's
 * needed, so a system it can't load on still runs, keeping nothing.
 */
let encoder: Promise<SharpConstructor> | undefined

/**
 * Why sharp isn't loaded here, if it isn't. Under Electron on Linux, Electron's own glib clashes with the one sharp's
 * libvips brings, and the service crashed the first time sharp encoded a picture (PAR-688, electron/electron#46323). So
 * there it's never loaded, as on a system it can't load on.
 */
export function sharpRefusal(platform: string, electron: string | undefined): string | undefined {
  return platform === "linux" && electron !== undefined
    ? "Electron's glib on Linux crashes sharp's libvips (PAR-688)"
    : undefined
}

function loadSharp(): Promise<SharpConstructor> {
  const refusal = sharpRefusal(process.platform, process.versions.electron)
  encoder ??= (refusal ? Promise.reject(new Error(refusal)) : import("sharp")).then(
    ({ default: sharp }) => {
      // Each picture is encoded once, so nothing is worth keeping in sharp's cache.
      sharp.cache(false)

      return sharp
    },
    (cause: unknown) => {
      degraded("bitmap_cache", "sharp couldn't load, so bitmaps and previews aren't kept", cause)
      throw cause
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

  if (kept >= height) {
    return undefined
  }

  return sharp(picture).extract({ left: 0, top: 0, width, height: kept }).webp({ lossless: true }).toBuffer()
}

/**
 * Part of a picture as a PNG, or as a JPG with see-through parts white, for the Export section (PAR-185). Fails when
 * sharp can't load or can't read it.
 */
export async function cutPicture(
  picture: Uint8Array,
  crop: { left: number; top: number; width: number; height: number },
  format: "png" | "jpg"
): Promise<Buffer> {
  const sharp = await loadSharp()
  const cut = sharp(picture).extract(crop)

  return format === "jpg"
    ? cut.flatten({ background: "#ffffff" }).jpeg({ quality: 92 }).toBuffer()
    : cut.png().toBuffer()
}

/**
 * Pieces of pictures put together as one PNG, see-through where none is, for copying a selection (PAR-190). One piece
 * filling the picture is cut as `cutPicture` cuts a PNG export, so copying a layer gives the same file as exporting it.
 * Fails when sharp can't load or can't read a picture.
 */
export async function composePicture(
  pieces: readonly {
    picture: Uint8Array
    crop: { left: number; top: number; width: number; height: number }
    left: number
    top: number
  }[],
  width: number,
  height: number
): Promise<Buffer> {
  const cuts = await Promise.all(pieces.map((piece) => cutPicture(piece.picture, piece.crop, "png")))
  const [only] = cuts

  if (only && cuts.length === 1 && pieces[0]!.crop.width === width && pieces[0]!.crop.height === height) {
    return only
  }

  const sharp = await loadSharp()

  return sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(cuts.map((input, index) => ({ input, left: pieces[index]!.left, top: pieces[index]!.top })))
    .png()
    .toBuffer()
}
