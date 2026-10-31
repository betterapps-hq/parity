import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test"
import { readTsconfig } from "./tsconfig.ts"

let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "canvas-tsconfig-"))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe("the configs readTsconfig lists as read", () => {
  it("lists a referenced config that's missing, so it appearing is a change", async () => {
    const references = [{ path: "./tsconfig.app.json" }, { path: "./tsconfig.node.json" }]
    await writeFile(join(root, "tsconfig.json"), JSON.stringify({ files: [], references }))
    await writeFile(join(root, "tsconfig.node.json"), JSON.stringify({ include: [] }))
    expect(readTsconfig(root).read.sort()).toEqual(["tsconfig.app.json", "tsconfig.json", "tsconfig.node.json"])
  })
})
