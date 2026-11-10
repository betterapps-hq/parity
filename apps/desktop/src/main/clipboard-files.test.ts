import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test"
import { type ClipboardReader, copiedFiles, copiedPath } from "./clipboard-files.ts"

const reader = (platform: NodeJS.Platform, formats: Record<string, string>): ClipboardReader => ({
  platform,
  raw: async (format) => {
    const held = formats[format]

    return held === undefined ? undefined : Buffer.from(held, platform === "win32" ? "utf16le" : "utf8")
  }
})

let folder: string

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "parity-copied-"))
})

afterEach(async () => {
  await rm(folder, { recursive: true, force: true })
})

describe("copiedPath", () => {
  it("reads Explorer's first file, without the null that ends it", async () => {
    await expect(copiedPath(reader("win32", { FileNameW: "C:\\clips\\waves.mp4\0" }))).resolves.toBe(
      "C:\\clips\\waves.mp4"
    )
    await expect(copiedPath(reader("win32", {}))).resolves.toBeUndefined()
  })

  it("reads Finder's file link as a path", async () => {
    const path = join(folder, "waves.mp4")

    await expect(copiedPath(reader("darwin", { "public.file-url": pathToFileURL(path).href }))).resolves.toBe(path)
    await expect(
      copiedPath(reader("darwin", { "public.file-url": "https://example.com/a.mp4" }))
    ).resolves.toBeUndefined()
  })

  it("finds none elsewhere", async () => {
    await expect(copiedPath(reader("linux", { FileNameW: "/clips/waves.mp4" }))).resolves.toBeUndefined()
  })
})

describe("copiedFiles", () => {
  it("gives the copied file's name, size and bytes, and nothing for a folder or a file that's gone", async () => {
    const path = join(folder, "waves.mp4")
    await writeFile(path, new Uint8Array([1, 2, 3]))

    const files = await copiedFiles(reader("win32", { FileNameW: `${path}\0` }))
    expect(files).toEqual([{ name: "waves.mp4", size: 3, data: new Uint8Array([1, 2, 3]) }])

    await expect(copiedFiles(reader("win32", { FileNameW: folder }))).resolves.toEqual([])
    await expect(copiedFiles(reader("win32", { FileNameW: join(folder, "gone.mp4") }))).resolves.toEqual([])
  })
})
