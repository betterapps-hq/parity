import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test"
import { byteRanges, type FeedAnswer, feedAnswer, feedBody } from "./update-feed.ts"

const contents = "0123456789abcdefghij"
let folder: string
let file: string

beforeAll(async () => {
  folder = await mkdtemp(join(tmpdir(), "update-feed-"))
  file = join(folder, "Parity.AppImage")
  await writeFile(file, contents)
})

afterAll(() => rm(folder, { recursive: true, force: true }))

async function body(answer: FeedAnswer, corrupt = false): Promise<Buffer> {
  const chunks: Buffer[] = []

  for await (const chunk of feedBody(file, answer.parts, corrupt)) {
    chunks.push(chunk)
  }

  return Buffer.concat(chunks)
}

describe("byteRanges", () => {
  it("reads several ranges as electron-updater writes them, and an open end", () => {
    expect(byteRanges("bytes=0-3, 10-12,15-", 20)).toEqual([
      { start: 0, end: 3 },
      { start: 10, end: 12 },
      { start: 15, end: 19 }
    ])
  })

  it("refuses a range past the end, a reversed one, or another unit", () => {
    expect(byteRanges("bytes=0-3, 18-20", 20)).toBeUndefined()
    expect(byteRanges("bytes=5-4", 20)).toBeUndefined()
    expect(byteRanges("items=0-3", 20)).toBeUndefined()
  })
})

describe("feedAnswer", () => {
  it("answers the whole file without a range", async () => {
    const answer = feedAnswer(undefined, contents.length, "application/octet-stream")

    expect(answer.status).toBe(200)
    expect(answer.headers["content-length"]).toBe(20)
    expect((await body(answer)).toString()).toBe(contents)
  })

  it("answers one range with its bytes", async () => {
    const answer = feedAnswer("bytes=10-12", contents.length, "application/octet-stream")

    expect(answer.status).toBe(206)
    expect(answer.headers["content-range"]).toBe("bytes 10-12/20")
    expect((await body(answer)).toString()).toBe("abc")
  })

  it("answers several ranges as multipart byteranges, each part framed, the length counted", async () => {
    const answer = feedAnswer("bytes=0-3, 10-12", contents.length, "application/octet-stream")
    const sent = await body(answer)

    expect(answer.status).toBe(206)
    expect(answer.headers["content-type"]).toBe("multipart/byteranges; boundary=parity-update-feed")
    expect(answer.headers["content-length"]).toBe(sent.length)
    expect(sent.toString()).toBe(
      [
        "--parity-update-feed",
        "content-type: application/octet-stream",
        "content-range: bytes 0-3/20",
        "",
        "0123",
        "--parity-update-feed",
        "content-type: application/octet-stream",
        "content-range: bytes 10-12/20",
        "",
        "abc",
        "--parity-update-feed--",
        ""
      ].join("\r\n")
    )
  })

  it("answers a range it can't serve with 416", () => {
    expect(feedAnswer("bytes=30-40", contents.length, "application/octet-stream")).toEqual({
      status: 416,
      headers: { "content-range": "bytes */20" },
      parts: []
    })
  })
})

describe("feedBody", () => {
  it("flips only the first byte read from the file when corrupt, leaving the framing intact", async () => {
    const sent = await body(feedAnswer("bytes=0-3, 10-12", contents.length, "application/octet-stream"), true)
    const first = sent.indexOf("\r\n\r\n") + 4

    expect(sent[first]).toBe(255 - "0".charCodeAt(0))
    expect(sent.subarray(first + 1).toString()).toContain("123\r\n--parity-update-feed\r\n")
    expect(sent.toString()).toContain("\r\n\r\nabc\r\n--parity-update-feed--\r\n")
  })
})
