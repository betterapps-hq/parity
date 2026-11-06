import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"
import type * as DetectionCache from "./detection-cache.ts"

let folder: string
let root: string
let cache: string
let detections: typeof DetectionCache

const button = { path: "src/button.tsx", export: "Button" }
const sources = { Button: button }
const files = ["src/button.tsx"]
const found = {
  sources,
  props: { Button: { name: "Button", path: "src/button.tsx", props: [] } },
  leftOut: [{ name: "cn", path: "src/button.tsx", export: "cn", reason: "it returns a string" }]
}

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "parity-detection-"))
  root = join(folder, "shop")
  cache = join(folder, "cache")
  await mkdir(join(root, "src"), { recursive: true })
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "shop" }))
  await writeFile(join(root, "src/button.tsx"), "export function Button() {\n  return <button />\n}\n")
  vi.stubEnv("PARITY_CACHE_DIR", cache)
  vi.resetModules()
  detections = await import("./detection-cache.ts")
})

afterEach(async () => {
  vi.unstubAllEnvs()
  await rm(folder, { recursive: true, force: true })
})

/** Saves what the checker found, then replaces the saved file with `contents`. */
async function saveThenWrite(contents: (fingerprint: string) => string): Promise<void> {
  const { fingerprint } = await detections.savedDetection(root, files, sources)
  await detections.saveDetection(root, files, sources, fingerprint, found)
  const [name] = await readdir(cache)
  await writeFile(join(cache, name!), contents(fingerprint))
}

describe("the detection cache", () => {
  it("gives back what was saved while nothing it read has changed", async () => {
    const { fingerprint } = await detections.savedDetection(root, files, sources)
    await detections.saveDetection(root, files, sources, fingerprint, found)
    expect(await detections.savedDetection(root, files, sources)).toEqual({
      fingerprint,
      saved: { fingerprint, ...found }
    })
  })

  it.each([
    { name: "isn't JSON", contents: () => '{"fingerprint": "' },
    { name: "has no components", contents: (fingerprint: string) => JSON.stringify({ fingerprint, props: {} }) },
    {
      name: "has a component without its file",
      contents: (fingerprint: string) =>
        JSON.stringify({ fingerprint, sources: { Button: { export: "Button" } }, props: {} })
    },
    {
      name: "has props that aren't a component's",
      contents: (fingerprint: string) => JSON.stringify({ fingerprint, sources, props: { Button: "Button" } })
    }
  ])("reads a file that $name as nothing saved", async ({ contents }) => {
    await saveThenWrite(contents)
    const read = await detections.savedDetection(root, files, sources)
    expect(read.saved).toBeUndefined()
    expect(read.fingerprint).toMatch(/\S/)
  })
})
