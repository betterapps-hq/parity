import { mkdtemp, rm, utimes, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test"
import { contentReader, scannedBytes, traceDigest } from "./frame-trace.ts"

let folder: string

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "parity-trace-"))
})

afterEach(async () => {
  await rm(folder, { recursive: true, force: true })
})

describe("contentReader", () => {
  it("gives the same hash for the same bytes, whenever they were written", async () => {
    const file = join(folder, "button.tsx")
    await writeFile(file, "export const Button = () => null\n")
    const read = contentReader()
    const first = await read(file)
    const later = new Date(Date.now() + 60_000)
    await utimes(file, later, later)
    expect(await read(file)).toEqual(first)
    expect(first.text).toBe("export const Button = () => null\n")
  })

  it("reads a file again once it changes", async () => {
    const file = join(folder, "button.tsx")
    await writeFile(file, "export const Button = () => null\n")
    const read = contentReader()
    const first = await read(file)
    await writeFile(file, "export const Button = () => 'Buy'\n")
    const later = new Date(Date.now() + 60_000)
    await utimes(file, later, later)
    expect((await read(file)).hash).not.toBe(first.hash)
  })

  it("hashes a large file without keeping its text, and marks a missing one", async () => {
    const lockfile = join(folder, "pnpm-lock.yaml")
    await writeFile(lockfile, "x".repeat(scannedBytes + 1))
    const read = contentReader()
    const large = await read(lockfile)
    expect(large.hash).toMatch(/^[0-9a-f]{64}$/)
    expect(large).not.toHaveProperty("text")
    expect(await read(join(folder, "gone.tsx"))).toEqual({ hash: "-" })
  })
})

describe("traceDigest", () => {
  it("is the same for the same files and hashes in any order, and changes with a hash, a file or the salt", () => {
    const files = [
      ["src/button.tsx", "aa"],
      ["src/index.css", "bb"]
    ] as const

    const digest = traceDigest("3:guest", files)
    expect(traceDigest("3:guest", [...files].reverse())).toBe(digest)
    expect(traceDigest("3:guest", [files[0], ["src/index.css", "cc"]])).not.toBe(digest)
    expect(traceDigest("3:guest", [files[0]])).not.toBe(digest)
    expect(traceDigest("4:guest", files)).not.toBe(digest)
  })
})
