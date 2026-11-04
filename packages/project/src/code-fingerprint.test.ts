import { mkdtemp, mkdir, rm, utimes, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test"
import { codeFingerprint } from "./code-fingerprint.ts"

let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "parity-code-fingerprint-"))
  await mkdir(join(root, "src"))
  await writeFile(join(root, "package.json"), "{}")
  await writeFile(join(root, "src", "Button.tsx"), "export const Button = () => null")
  await writeFile(join(root, "src", "index.css"), "body { margin: 0 }")
})

afterEach(() => rm(root, { recursive: true, force: true }))

/** Writes a file again with new contents, a second later so its time changes even on a coarse file system. */
async function edit(path: string, contents: string): Promise<void> {
  await writeFile(join(root, path), contents)
  const later = new Date(Date.now() + 1000)
  await utimes(join(root, path), later, later)
}

describe("codeFingerprint", () => {
  it("is the same for the same files and salt", async () => {
    expect(await codeFingerprint(root, "a")).toBe(await codeFingerprint(root, "a"))
  })

  it("changes with the salt, for a new version of what draws the project", async () => {
    expect(await codeFingerprint(root, "a")).not.toBe(await codeFingerprint(root, "b"))
  })

  it.each([
    ["a component's source", "src/Button.tsx", "export const Button = () => 1"],
    ["a stylesheet", "src/index.css", "body { margin: 1px }"],
    ["a config", "vite.config.ts", "export default {}"]
  ])("changes when %s changes", async (_what, path, contents) => {
    const before = await codeFingerprint(root, "a")
    await edit(path, contents)
    expect(await codeFingerprint(root, "a")).not.toBe(before)
  })

  it("leaves out dependencies, build output, dot-folders and designs", async () => {
    const before = await codeFingerprint(root, "a")
    for (const folder of ["node_modules/pkg", "dist", ".git"]) {
      await mkdir(join(root, folder), { recursive: true })
      await writeFile(join(root, folder, "file.js"), "x")
    }
    await writeFile(join(root, "app.par"), "{}")
    expect(await codeFingerprint(root, "a")).toBe(before)
  })
})
