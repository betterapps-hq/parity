/**
 * Text kept inside a WebP file, in a chunk of its own after the image, which decoders skip as the format asks them to.
 * Frame bitmaps kept on disk carry their frame's height this way (PAR-535), as their PNGs did in a text chunk (PAR-179).
 * A plain WebP has only its image, so the extended header (`VP8X`) is added first, which the format requires before any
 * other chunk.
 */

/** The chunk Parity's text goes in: `keyword`, a zero byte, then the text, as a PNG's `tEXt` holds it. */
const textType = "TEXT"

/** The WebP with `text` under `keyword`, replacing any it had. A buffer that isn't a WebP is returned as it is. */
export function withWebpText(webp: Uint8Array, keyword: string, text: string): Uint8Array {
  const found = [...chunks(webp)]
  const image = found.find((chunk) => chunk.type === "VP8L" || chunk.type === "VP8 ")

  if (!isWebp(webp) || !image) {
    return webp
  }

  const extended = found.find((chunk) => chunk.type === "VP8X")

  const parts: Uint8Array[] = [
    extended ? webp.subarray(extended.start, extended.end) : extendedHeader(webp, found, image)
  ]

  for (const chunk of found) {
    if (chunk === extended || textOf(webp, chunk, keyword) !== undefined) {
      continue
    }

    parts.push(webp.subarray(chunk.start, chunk.end))
  }

  parts.push(chunk(textType, new TextEncoder().encode(`${keyword}\0${text}`)))
  const body = parts.reduce((total, part) => total + part.length, 0)
  const result = new Uint8Array(12 + body)
  result.set(webp.subarray(0, 12))
  new DataView(result.buffer).setUint32(4, 4 + body, true)
  let at = 12

  for (const part of parts) {
    result.set(part, at)
    at += part.length
  }

  return result
}

/** The text a WebP keeps under `keyword`, if it has any. */
export function webpText(webp: Uint8Array, keyword: string): string | undefined {
  for (const found of chunks(webp)) {
    const text = textOf(webp, found, keyword)

    if (text !== undefined) {
      return text
    }
  }

  return undefined
}

/**
 * A WebP's size in pixels, from its first chunk: the extended header's canvas, or a plain image's own header. Nothing
 * when it isn't a WebP. The first 30 bytes of the file are enough.
 */
export function webpSize(webp: Uint8Array): { width: number; height: number } | undefined {
  if (!isWebp(webp) || webp.length < 30) {
    return undefined
  }

  const view = new DataView(webp.buffer, webp.byteOffset, webp.byteLength)
  const type = ascii(webp, 12, 16)

  if (type === "VP8X") {
    return { width: readUint24(webp, 24) + 1, height: readUint24(webp, 27) + 1 }
  }

  if (type === "VP8L") {
    const bits = view.getUint32(21, true)

    return { width: bitField(bits, 0, 14) + 1, height: bitField(bits, 14, 14) + 1 }
  }

  if (type === "VP8 ") {
    return { width: bitField(view.getUint16(26, true), 0, 14), height: bitField(view.getUint16(28, true), 0, 14) }
  }

  return undefined
}

/** Whether a buffer is a WebP file: a RIFF container of type `WEBP`. */
export function isWebp(bytes: Uint8Array): boolean {
  return bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP"
}

interface Chunk {
  type: string
  /** Where the chunk starts and ends in the file, its header and any padding byte included. */
  start: number
  end: number
}

function* chunks(webp: Uint8Array): Generator<Chunk> {
  if (!isWebp(webp)) {
    return
  }

  const view = new DataView(webp.buffer, webp.byteOffset, webp.byteLength)
  let at = 12

  while (at + 8 <= webp.length) {
    const size = view.getUint32(at + 4, true)
    const end = at + 8 + size + (size % 2)

    if (at + 8 + size > webp.length) {
      return
    }

    yield { type: ascii(webp, at, at + 4), start: at, end: Math.min(end, webp.length) }
    at = end
  }
}

function textOf(webp: Uint8Array, found: Chunk, keyword: string): string | undefined {
  if (found.type !== textType) {
    return undefined
  }

  const size = new DataView(webp.buffer, webp.byteOffset, webp.byteLength).getUint32(found.start + 4, true)
  const data = webp.subarray(found.start + 8, found.start + 8 + size)
  const separator = data.indexOf(0)

  if (separator === -1 || new TextDecoder().decode(data.subarray(0, separator)) !== keyword) {
    return undefined
  }

  return new TextDecoder().decode(data.subarray(separator + 1))
}

/**
 * The `VP8X` chunk a plain WebP needs before it can carry another chunk: the image's size, from its own header, and
 * whether it has alpha, from a lossless image's header or an `ALPH` chunk beside a lossy one.
 */
function extendedHeader(webp: Uint8Array, found: Chunk[], image: Chunk): Uint8Array {
  const data = webp.subarray(image.start + 8, image.end)
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  let width: number
  let height: number
  let alpha: boolean

  if (image.type === "VP8L") {
    // A signature byte, then the width and height less one in 14 bits each and the alpha bit, little-endian.
    const bits = view.getUint32(1, true)
    width = bitField(bits, 0, 14) + 1
    height = bitField(bits, 14, 14) + 1
    alpha = bitField(bits, 28, 1) === 1
  } else {
    // A 3-byte frame tag and 3-byte start code, then the width and height in 14 bits each.
    width = bitField(view.getUint16(6, true), 0, 14)
    height = bitField(view.getUint16(8, true), 0, 14)
    alpha = found.some((chunk) => chunk.type === "ALPH")
  }

  const header = new Uint8Array(10)
  header[0] = alpha ? 0x10 : 0
  header.set(uint24(width - 1), 4)
  header.set(uint24(height - 1), 7)

  return chunk("VP8X", header)
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const result = new Uint8Array(8 + data.length + (data.length % 2))
  result.set(new TextEncoder().encode(type))
  new DataView(result.buffer).setUint32(4, data.length, true)
  result.set(data, 8)

  return result
}

function uint24(value: number): Uint8Array {
  return new Uint8Array([bitField(value, 0, 8), bitField(value, 8, 8), bitField(value, 16, 8)])
}

function readUint24(bytes: Uint8Array, at: number): number {
  return bytes[at]! + bytes[at + 1]! * 2 ** 8 + bytes[at + 2]! * 2 ** 16
}

/**
 * The `width` bits of a non-negative integer starting `shift` bits up from its lowest, as a WebP header packs its
 * sizes and flags little-endian.
 */
function bitField(value: number, shift: number, width: number): number {
  return Math.floor(value / 2 ** shift) % 2 ** width
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.subarray(start, end))
}
