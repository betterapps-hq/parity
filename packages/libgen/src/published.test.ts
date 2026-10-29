import { describe, expect, it } from "vitest"
import { tarEntry } from "./published.ts"

/** A tar entry as npm writes one: a ustar header, then the body padded to 512 bytes. */
function entry(name: string, body: string, type = "0"): Buffer {
  const header = Buffer.alloc(512)
  header.write(name.slice(0, 100), 0)
  header.write(`${Buffer.byteLength(body).toString(8).padStart(11, "0")}\0`, 124)
  header.write(type, 156)
  header.write("ustar\0", 257)
  const padded = Buffer.alloc(Math.ceil(Buffer.byteLength(body) / 512) * 512)
  padded.write(body)
  return Buffer.concat([header, padded])
}

/** A pax header giving the next entry's long path. */
function pax(path: string): Buffer {
  const record = (length: number) => `${length} path=${path}\n`
  let length = record(0).length
  while (record(length).length !== length) length = record(length).length
  return entry("PaxHeader", record(length), "x")
}

describe("tarEntry", () => {
  it("finds a file by its path, past the ones before it", () => {
    const archive = Buffer.concat([
      entry("package/package.json", "{}"),
      entry("package/tags.json", '{"x":["close"]}'),
      Buffer.alloc(1024)
    ])
    expect(tarEntry(archive, "package/tags.json")?.toString()).toBe('{"x":["close"]}')
    expect(tarEntry(archive, "package/missing.json")).toBeUndefined()
  })

  it("reads the long paths pax headers give", () => {
    const long = `package/${"deep/".repeat(30)}meta.json`
    const archive = Buffer.concat([pax(long), entry("package/deep/deep/meta.json", "[1]"), Buffer.alloc(1024)])
    expect(tarEntry(archive, long)?.toString()).toBe("[1]")
  })
})
