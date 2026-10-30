import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test"
import { installedPackage, packageEntry } from "./installed.ts"

let root: string

/** Writes a package with an `exports` map at `dir`. */
function writePackage(dir: string, name: string): void {
  mkdirSync(join(dir, "dist"), { recursive: true })
  const exports = { ".": { import: "./dist/index.mjs", require: "./dist/index.js" } }
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name, exports }))
  writeFileSync(join(dir, "dist", "index.js"), "module.exports = {}")
}

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), "parity-installed-")))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe("installedPackage", () => {
  it("finds a package in the folder's node_modules or a folder above's", () => {
    writePackage(join(root, "node_modules", "@acme", "node"), "@acme/node")
    const project = join(root, "apps", "web")
    mkdirSync(project, { recursive: true })
    expect(installedPackage(project, "@acme/node")).toBe(join(root, "node_modules", "@acme", "node"))
  })

  it("follows a link to where the package really is, as pnpm installs it", () => {
    const store = join(root, "node_modules", ".pnpm", "@acme+node@1.0.0", "node_modules", "@acme", "node")
    writePackage(store, "@acme/node")
    mkdirSync(join(root, "node_modules", "@acme"), { recursive: true })
    symlinkSync(store, join(root, "node_modules", "@acme", "node"), "junction")
    expect(installedPackage(root, "@acme/node")).toBe(store)
  })

  it("finds nothing when no folder has the package installed", () => {
    expect(installedPackage(root, "@acme/node")).toBeUndefined()
  })
})

describe("packageEntry", () => {
  it("resolves the package's require export", () => {
    const dir = join(root, "node_modules", "@acme", "node")
    writePackage(dir, "@acme/node")
    expect(packageEntry(dir, "@acme/node")).toBe(join(dir, "dist", "index.js"))
  })
})
