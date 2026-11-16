import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test"
import { findPreviewFile } from "./preview-file.ts"

let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "canvas-preview-file-"))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

async function write(path: string) {
  await mkdir(join(root, ".parity"), { recursive: true })
  await writeFile(join(root, path), "export const decorators = []\n")
}

describe("the project's preview file (PAR-100)", () => {
  it("is .parity/preview.tsx", async () => {
    await write(".parity/preview.tsx")

    expect(await findPreviewFile(root)).toBe(".parity/preview.tsx")
  })

  it("can be JavaScript, for a project its loaders compile as JavaScript", async () => {
    await write(".parity/preview.jsx")

    expect(await findPreviewFile(root)).toBe(".parity/preview.jsx")
  })

  it("is the TypeScript one when there are several", async () => {
    await write(".parity/preview.js")
    await write(".parity/preview.tsx")

    expect(await findPreviewFile(root)).toBe(".parity/preview.tsx")
  })

  it("isn't there without the folder, or with only other files in it", async () => {
    expect(await findPreviewFile(root)).toBeUndefined()

    await write(".parity/preview.css")

    expect(await findPreviewFile(root)).toBeUndefined()
  })
})
