// What the local update feed in try-update.ts answers for a file: the whole of it, one range, or several in one
// multipart answer, as a release host does.
import { createReadStream } from "node:fs"

/** Bytes `start` to `end` of a file, both included, as a Range header counts them. */
export interface ByteRange {
  start: number
  end: number
}

/** An answer to a request for a file: its status and headers, then its body as bytes it adds and ranges of the file. */
export interface FeedAnswer {
  status: number
  headers: Record<string, string | number>
  parts: (Buffer | ByteRange)[]
}

/** Separates a multipart answer's parts. A part's length is counted, so its bytes may contain it. */
const boundary = "parity-update-feed"

/**
 * The ranges a Range header asks for in a file of `size` bytes, in its order, or undefined when any of them can't be
 * served. electron-updater's differential download asks for several at once (`bytes=0-9, 20-29`).
 */
export function byteRanges(header: string, size: number): ByteRange[] | undefined {
  const match = /^bytes=(.+)$/.exec(header)

  if (!match) {
    return undefined
  }

  const ranges: ByteRange[] = []

  for (const text of match[1]!.split(",")) {
    const range = /^\s*(\d+)-(\d*)\s*$/.exec(text)

    if (!range) {
      return undefined
    }

    const start = Number(range[1])
    const end = range[2] ? Number(range[2]) : size - 1

    if (start > end || end >= size) {
      return undefined
    }

    ranges.push({ start, end })
  }

  return ranges
}

/**
 * What to answer for `range`, a request's Range header or undefined, on a file of `size` bytes and `type`: the whole
 * file, one range, or several as `multipart/byteranges` (RFC 9110, 14.6). A range it can't serve is a 416.
 */
export function feedAnswer(range: string | undefined, size: number, type: string): FeedAnswer {
  if (range === undefined) {
    return {
      status: 200,
      headers: { "content-type": type, "content-length": size, "accept-ranges": "bytes" },
      parts: [{ start: 0, end: size - 1 }]
    }
  }

  const ranges = byteRanges(range, size)

  if (!ranges) {
    return { status: 416, headers: { "content-range": `bytes */${size}` }, parts: [] }
  }

  if (ranges.length === 1) {
    const [only] = ranges

    return {
      status: 206,
      headers: {
        "content-type": type,
        "content-length": only!.end - only!.start + 1,
        "accept-ranges": "bytes",
        "content-range": `bytes ${only!.start}-${only!.end}/${size}`
      },
      parts: ranges
    }
  }

  const parts = ranges.flatMap((part, index) => [
    Buffer.from(
      `${index ? "\r\n" : ""}--${boundary}\r\ncontent-type: ${type}\r\ncontent-range: bytes ${part.start}-${part.end}/${size}\r\n\r\n`
    ),
    part
  ])

  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`))

  const length = parts.reduce(
    (total, part) => total + (Buffer.isBuffer(part) ? part.length : part.end - part.start + 1),
    0
  )

  return {
    status: 206,
    headers: {
      "content-type": `multipart/byteranges; boundary=${boundary}`,
      "content-length": length,
      "accept-ranges": "bytes"
    },
    parts
  }
}

/**
 * The body of an answer: its own bytes as they are, and its ranges read from `file`. With `corrupt`, the first byte read from
 * the file has every bit flipped, so a download of it fails its checksum while the answer's framing stays intact.
 */
export async function* feedBody(file: string, parts: FeedAnswer["parts"], corrupt: boolean): AsyncGenerator<Buffer> {
  let changed = !corrupt

  for (const part of parts) {
    if (Buffer.isBuffer(part)) {
      yield part

      continue
    }

    for await (const chunk of createReadStream(file, part)) {
      if (!Buffer.isBuffer(chunk)) {
        throw new Error("A file read without an encoding gives bytes.")
      }

      if (!changed && chunk.length) {
        // Every bit flipped, as a byte's complement.
        chunk[0] = 255 - chunk[0]!
        changed = true
      }

      yield chunk
    }
  }
}
