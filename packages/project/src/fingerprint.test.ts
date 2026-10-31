import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { readTsconfig } from "@parity-app/code"
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test"
import { detectPackageManager } from "./detect.ts"
import { detectionFingerprint, fingerprintInputs } from "./fingerprint.ts"

let root: string

async function write(path: string, content: string) {
  await mkdir(dirname(join(root, path)), { recursive: true })
  await writeFile(join(root, path), content)
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "canvas-fingerprint-"))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe("detection fingerprints", () => {
  const sources = { Button: { path: "src/button.tsx", export: "Button", as: "function" as const } }
  const fingerprint = (salt = "v1", listed: Record<string, (typeof sources)["Button"]> = sources) =>
    detectionFingerprint(join(root, "app"), ["src/button.tsx"], listed, readTsconfig(join(root, "app")), salt)

  beforeEach(async () => {
    await write("pnpm-lock.yaml", "lockfileVersion: '9.0'\n")
    await write("app/package.json", '{ "name": "app" }')
    await write("app/tsconfig.json", '{ "include": ["src"] }')
    await write("app/src/button.tsx", "export function Button() {}")
  })

  it("stays the same while nothing it reads changes", async () => {
    expect(await fingerprint()).toBe(await fingerprint())
  })

  it("changes with a file's contents, the workspace's lockfile, the list, or the reader", async () => {
    const before = await fingerprint()
    await write("app/src/button.tsx", "export function Button(props: { size: 'sm' }) {}")
    const edited = await fingerprint()
    expect(edited).not.toBe(before)
    await write("pnpm-lock.yaml", "lockfileVersion: '9.0'\npackages: {}\n")
    const locked = await fingerprint()
    expect(locked).not.toBe(edited)
    expect(await fingerprint("v2")).not.toBe(locked)
    expect(
      await fingerprint("v1", { ...sources, Card: { path: "src/card.tsx", export: "Card", as: "function" } })
    ).not.toBe(locked)
  })

  it("changes with npm-shrinkwrap.json alone, the lockfile npm prefers", async () => {
    await rm(join(root, "pnpm-lock.yaml"))
    await write("app/package-lock.json", '{ "lockfileVersion": 3 }')
    await write("app/npm-shrinkwrap.json", '{ "lockfileVersion": 3 }')
    const before = await fingerprint()
    await write("app/npm-shrinkwrap.json", '{ "lockfileVersion": 3, "packages": {} }')
    expect(await fingerprint()).not.toBe(before)
  })

  it("hashes the lockfile detection picked, not one further up", async () => {
    await write("app/package-lock.json", '{ "lockfileVersion": 3 }')
    expect((await detectPackageManager(join(root, "app"))).lockfile).toBe("package-lock.json")
    const before = await fingerprint()
    await write("pnpm-lock.yaml", "lockfileVersion: '9.0'\npackages: {}\n")
    expect(await fingerprint()).toBe(before)
    await write("app/package-lock.json", '{ "lockfileVersion": 3, "packages": {} }')
    expect(await fingerprint()).not.toBe(before)
  })

  it("changes with a base config the tsconfig extends", async () => {
    await write("tsconfig.base.json", '{ "compilerOptions": { "strict": false } }')
    await write("app/tsconfig.json", '{ "extends": "../tsconfig.base.json", "include": ["src"] }')
    const before = await fingerprint()
    await write("tsconfig.base.json", '{ "compilerOptions": { "strict": true } }')
    expect(await fingerprint()).not.toBe(before)
  })

  it("lists what it reads as its inputs", async () => {
    await write("tsconfig.base.json", "{}")
    await write("app/tsconfig.json", '{ "extends": "../tsconfig.base.json", "include": ["src"] }')
    const app = join(root, "app")
    expect(await fingerprintInputs(app, ["src/button.tsx"], sources, readTsconfig(app))).toEqual([
      "../pnpm-lock.yaml",
      "../tsconfig.base.json",
      "jsconfig.json",
      "package.json",
      "src/button.tsx",
      "tsconfig.json"
    ])
  })
})
