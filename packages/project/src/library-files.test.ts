import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import type { RendererAdapter } from "@parity/core"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { findLibraries } from "./libraries.ts"

const renderer = {
  componentExtensions: [".tsx", ".ts"],
  findComponents: (source: string) =>
    [...source.matchAll(/export function ([A-Z]\w*)/g)].map((match) => ({
      name: match[1]!,
      export: match[1]!,
      as: "function"
    }))
} as unknown as RendererAdapter

let root: string

async function write(path: string, content: unknown) {
  await mkdir(dirname(join(root, path)), { recursive: true })
  await writeFile(join(root, path), typeof content === "string" ? content : JSON.stringify(content))
}

const component = (fields: Record<string, unknown> = {}) => ({ as: "function", ...fields })

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "canvas-library-files-"))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe("library files", () => {
  it("merges hand edits over what was generated, from a shared file, and reports edits for exports that have gone", async () => {
    await write("node_modules/@acme/ui/package.json", { name: "@acme/ui", version: "1.0.0", types: "index.d.ts" })
    await write("node_modules/@acme/ui/index.d.ts", "export function Menu(): unknown")
    await write("node_modules/@acme/ui/acme.lib.par", {
      version: 3,
      id: "acme",
      name: "Acme UI",
      edits: "acme.edits.json",
      components: {
        list: {
          Menu: component(),
          MenuItem: component({ parents: ["Menu"], parentsFrom: "prefix" }),
          MenuContext: component()
        }
      }
    })
    await write("node_modules/@acme/ui/acme.edits.json", {
      components: {
        MenuItem: { parents: ["Menu", "MenuContent"] },
        MenuContext: { visual: false },
        Gone: { parents: ["Menu"] }
      }
    })

    const found = await findLibraries(root, { dependencies: { "@acme/ui": "1.0.0" } }, [], renderer)
    expect(Object.keys(found.components).sort()).toEqual(["acme/Menu", "acme/MenuItem"])
    expect(found.notes).toEqual(["@acme/ui: hand edits for exports it no longer has: Gone"])
  })

  it("keeps a file made for an older version, leaving out what's gone and listing what's new by name", async () => {
    await write("node_modules/@acme/ui/package.json", { name: "@acme/ui", version: "2.1.0", types: "index.d.ts" })
    await write(
      "node_modules/@acme/ui/index.d.ts",
      "export function Button(): unknown\nexport function Chip(): unknown"
    )
    await write("registry/acme.lib.par", {
      version: 3,
      id: "acme",
      name: "Acme UI",
      package: { name: "@acme/ui", version: "1.4.0", range: "^1.0.0" },
      decorators: [{ wrap: { import: "@acme/ui", component: "Provider" } }],
      components: { list: { Button: component(), Badge: component() } }
    })

    const found = await findLibraries(
      root,
      { dependencies: { "@acme/ui": "2.1.0" } },
      [],
      renderer,
      [],
      join(root, "registry")
    )
    expect(found.libraries[0]?.decorators).toHaveLength(1)
    expect(Object.keys(found.components).sort()).toEqual(["acme/Button", "acme/Chip"])
    expect(found.notes[0]).toMatch(
      /2\.1\.0 is newer than Parity's file for it \(1\.4\.0\): 1 new components found by name, 1 gone/
    )
  })
})
