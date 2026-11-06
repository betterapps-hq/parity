import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test"
import { exampleFolder, missingFolders } from "./start-folders.ts"

// docs/editor.md, The start page: folders that aren't there any more, and the example on the first run (PAR-188).

let folder: string

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "parity-start-"))
})

afterEach(async () => {
  await rm(folder, { recursive: true, force: true })
})

describe("missingFolders", () => {
  it("names the folders that aren't there, or are files, and leaves the rest", async () => {
    const here = join(folder, "here")
    const file = join(folder, "notes.txt")
    await mkdir(here)
    await writeFile(file, "")
    expect(await missingFolders([here, join(folder, "gone"), file, join(file, "inside")])).toEqual([
      join(folder, "gone"),
      file,
      join(file, "inside")
    ])
  })
})

describe("exampleFolder", () => {
  async function example(installed: boolean): Promise<string> {
    const root = join(folder, "examples", "shadcn-vite")
    await mkdir(root, { recursive: true })
    await writeFile(join(root, "package.json"), "{}")
    if (installed) await mkdir(join(root, "node_modules"))
    return root
  }

  it("finds the example above where Parity runs from, once its packages are installed", async () => {
    const root = await example(true)
    const app = join(folder, "apps", "desktop", "out", "utility")
    await mkdir(app, { recursive: true })
    expect(await exampleFolder(app)).toBe(root)
  })

  it("has none when its packages aren't installed, or it isn't there, as in an installed copy", async () => {
    await example(false)
    expect(await exampleFolder(join(folder, "apps"))).toBeUndefined()
    expect(await exampleFolder(join(tmpdir(), "no-parity-here"))).toBeUndefined()
  })
})
