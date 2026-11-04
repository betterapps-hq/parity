/**
 * Text kept inside a PNG, in a `tEXt` chunk just after its header, which image viewers and browsers skip. Frame bitmaps
 * kept on disk carry their frame's height this way, so a frame that hasn't drawn yet can take its size from its bitmap
 * (PAR-179).
 */

const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
/** The signature, then the header chunk: its length, type, 13 bytes of data and its CRC. */
const headerEnd = 8 + 4 + 4 + 13 + 4

/** The PNG with `text` under `keyword`, replacing any it had. A buffer that isn't a PNG is returned as it is. */
export function withPngText(png: Uint8Array, keyword: string, text: string): Uint8Array {
  if (!isPng(png)) return png
  const without = withoutPngText(png, keyword)
  const data = new TextEncoder().encode(`${keyword}\0${text}`)
  const chunk = new Uint8Array(12 + data.length)
  const view = new DataView(chunk.buffer)
  view.setUint32(0, data.length)
  chunk.set(new TextEncoder().encode("tEXt"), 4)
  chunk.set(data, 8)
  view.setUint32(8 + data.length, crc32(chunk.subarray(4, 8 + data.length)))
  const result = new Uint8Array(without.length + chunk.length)
  result.set(without.subarray(0, headerEnd))
  result.set(chunk, headerEnd)
  result.set(without.subarray(headerEnd), headerEnd + chunk.length)
  return result
}

/** The text a PNG keeps under `keyword`, if it has any. */
export function pngText(png: Uint8Array, keyword: string): string | undefined {
  for (const chunk of chunks(png)) {
    const text = textOf(png, chunk, keyword)
    if (text !== undefined) return text
  }
  return undefined
}

function withoutPngText(png: Uint8Array, keyword: string): Uint8Array {
  const kept: Uint8Array[] = [png.subarray(0, 8)]
  for (const chunk of chunks(png)) {
    if (textOf(png, chunk, keyword) === undefined) kept.push(png.subarray(chunk.start, chunk.end))
  }
  const length = kept.reduce((total, part) => total + part.length, 0)
  if (length === png.length) return png
  const result = new Uint8Array(length)
  let at = 0
  for (const part of kept) {
    result.set(part, at)
    at += part.length
  }
  return result
}

interface Chunk {
  type: string
  /** Where the chunk starts and ends in the file, its length and CRC included. */
  start: number
  end: number
}

function* chunks(png: Uint8Array): Generator<Chunk> {
  if (!isPng(png)) return
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength)
  let at = 8
  while (at + 12 <= png.length) {
    const length = view.getUint32(at)
    const end = at + 12 + length
    if (end > png.length) return
    const type = String.fromCharCode(...png.subarray(at + 4, at + 8))
    yield { type, start: at, end }
    if (type === "IEND") return
    at = end
  }
}

function textOf(png: Uint8Array, chunk: Chunk, keyword: string): string | undefined {
  if (chunk.type !== "tEXt") return undefined
  const data = png.subarray(chunk.start + 8, chunk.end - 4)
  const separator = data.indexOf(0)
  if (separator === -1) return undefined
  const decoder = new TextDecoder("latin1")
  return decoder.decode(data.subarray(0, separator)) === keyword
    ? decoder.decode(data.subarray(separator + 1))
    : undefined
}

function isPng(png: Uint8Array): boolean {
  return png.length >= headerEnd && signature.every((byte, index) => png[index] === byte)
}

let table: Uint32Array | undefined

function crc32(bytes: Uint8Array): number {
  table ??= Uint32Array.from({ length: 256 }, (_, index) => {
    let value = index
    for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    return value >>> 0
  })
  let crc = 0xffffffff
  for (const byte of bytes) crc = table[(crc ^ byte) & 0xff]! ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}
