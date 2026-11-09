import { mkdir, mkdtemp, readFile, rm, utimes, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test"
import { type CodeSnapshot, codeSnapshot } from "./code-fingerprint.ts"
import {
  importedFiles,
  moduleClosure,
  previewKey,
  type PreviewKeyInput,
  resolveModule,
  sharedPreviewFiles
} from "./preview-key.ts"

const files = new Map(
  [
    "src/components/ui/button.tsx",
    "src/components/ui/index.ts",
    "src/lib/utils.ts",
    "src/lib/format.js",
    "src/index.css",
    "src/theme.css"
  ].map((path) => [path, "1:1"])
)

const alias = (specifier: string) => (specifier.startsWith("@/") ? `src/${specifier.slice(2)}` : undefined)

describe("resolveModule", () => {
  it.each([
    ["a relative path without its extension", "src/components/ui/card.tsx", "./button", "src/components/ui/button.tsx"],
    ["a folder's index", "src/App.tsx", "./components/ui", "src/components/ui/index.ts"],
    ["a tsconfig alias", "src/App.tsx", "@/lib/utils", "src/lib/utils.ts"],
    ["a TypeScript file imported as .js", "src/components/ui/card.tsx", "./button.js", "src/components/ui/button.tsx"],
    ["a JavaScript file by its own name", "src/App.tsx", "./lib/format.js", "src/lib/format.js"],
    ["a stylesheet, with a query", "src/main.tsx", "./index.css?inline", "src/index.css"],
    ["a path from the root", "src/App.tsx", "/src/theme.css", "src/theme.css"]
  ])("finds %s", (_what, from, specifier, found) => {
    expect(resolveModule(from, specifier, files, alias)).toBe(found)
  })

  it("finds nothing for a package or a file the project hasn't got", () => {
    expect(resolveModule("src/App.tsx", "react", files, alias)).toBeUndefined()
    expect(resolveModule("src/App.tsx", "./missing", files, alias)).toBeUndefined()
  })
})

describe("importedFiles", () => {
  it("resolves a module's imports and leaves out packages", () => {
    const source = `import { cn } from "@/lib/utils"\nimport * as React from "react"\nexport { Button } from "./button"`
    expect(importedFiles("src/components/ui/card.tsx", source, files, alias)).toEqual([
      "src/lib/utils.ts",
      "src/components/ui/button.tsx"
    ])
  })

  it("reads a stylesheet's @imports", () => {
    const source = `@import "tailwindcss";\n@import "./theme.css";`
    expect(importedFiles("src/index.css", source, files, alias)).toEqual(["src/theme.css"])
  })
})

describe("moduleClosure", () => {
  const graph = new Map([
    ["a.tsx", ["b.ts", "c.ts"]],
    ["b.ts", ["c.ts"]],
    ["c.ts", ["a.tsx"]],
    ["d.ts", []]
  ])

  const importsOf = async (path: string) => graph.get(path) ?? []

  it("reaches every file through imports, once, even round a cycle", async () => {
    expect(await moduleClosure(["a.tsx"], importsOf)).toEqual(["a.tsx", "b.ts", "c.ts"])
  })

  it("treats a file that can't be read as importing nothing", async () => {
    const failing = async (path: string) =>
      path === "b.ts" ? Promise.reject(new Error("gone")) : (graph.get(path) ?? [])

    expect(await moduleClosure(["b.ts", "d.ts"], failing)).toEqual(["b.ts", "d.ts"])
  })
})

describe("sharedPreviewFiles", () => {
  it("is the root's package.json, tsconfigs and tool configs, and every lockfile", () => {
    const snapshot: CodeSnapshot = {
      fingerprint: "f",
      salt: "s",
      files: new Map(
        [
          "package.json",
          "tsconfig.app.json",
          "vite.config.ts",
          "pnpm-lock.yaml",
          "../../pnpm-lock.yaml",
          "packages/ui/package.json",
          "src/App.tsx"
        ].map((path) => [path, "1:1"])
      )
    }

    expect(sharedPreviewFiles(snapshot)).toEqual([
      "package.json",
      "tsconfig.app.json",
      "vite.config.ts",
      "pnpm-lock.yaml",
      "../../pnpm-lock.yaml"
    ])
  })
})

describe("previewKey", () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "parity-preview-key-"))
    await write("package.json", "{}")
    await write("src/index.css", `@import "./theme.css";`)
    await write("src/theme.css", ":root { --primary: blue }")
    await write("src/lib/utils.ts", "export const cn = () => ''")
    await write("src/Button.tsx", `import { cn } from "./lib/utils"\nexport const Button = () => null`)
    await write("src/Badge.tsx", "export const Badge = () => null")
  })

  afterEach(() => rm(root, { recursive: true, force: true }))

  async function write(path: string, contents: string): Promise<void> {
    await mkdir(dirname(join(root, path)), { recursive: true })
    await writeFile(join(root, path), contents)
  }

  /** Writes a file again, a second later so its time changes even on a coarse file system. */
  async function edit(path: string, contents: string): Promise<void> {
    await write(path, contents)
    const later = new Date(Date.now() + 1000)
    await utimes(join(root, path), later, later)
  }

  /** A component's key as the service works it out: its file and what it imports, the stylesheets, shared files. */
  async function keyOf(
    component: string,
    snapshot: CodeSnapshot,
    drawn: PreviewKeyInput["drawn"] = { tree: component }
  ) {
    const importsOf = async (path: string) =>
      importedFiles(path, await readFile(join(root, path), "utf8"), snapshot.files, () => undefined)

    const closure = await moduleClosure([component, "src/index.css"], importsOf)

    return previewKey({ drawn, files: [...closure, ...sharedPreviewFiles(snapshot)], snapshot, salt: "1" })
  }

  it("is the same for the same code and tree, so a reopen draws nothing again", async () => {
    expect(await keyOf("src/Button.tsx", await codeSnapshot(root, "a"))).toBe(
      await keyOf("src/Button.tsx", await codeSnapshot(root, "a"))
    )
  })

  it("changes for a component that imports the file that changed, and only for it", async () => {
    const before = await codeSnapshot(root, "a")
    await edit("src/lib/utils.ts", "export const cn = () => 'x'")
    const after = await codeSnapshot(root, "a")
    expect(await keyOf("src/Button.tsx", after)).not.toBe(await keyOf("src/Button.tsx", before))
    expect(await keyOf("src/Badge.tsx", after)).toBe(await keyOf("src/Badge.tsx", before))
  })

  it("changes for every component when a stylesheet, or one it imports, changes", async () => {
    const before = await codeSnapshot(root, "a")
    await edit("src/theme.css", ":root { --primary: red }")
    const after = await codeSnapshot(root, "a")
    expect(await keyOf("src/Button.tsx", after)).not.toBe(await keyOf("src/Button.tsx", before))
    expect(await keyOf("src/Badge.tsx", after)).not.toBe(await keyOf("src/Badge.tsx", before))
  })

  it("changes for every component when the dependencies change", async () => {
    const before = await codeSnapshot(root, "a")
    await edit("package.json", `{ "dependencies": { "react": "19.2.0" } }`)
    expect(await keyOf("src/Badge.tsx", await codeSnapshot(root, "a"))).not.toBe(await keyOf("src/Badge.tsx", before))
  })

  it("changes with what's drawn, such as the mode or the sample", async () => {
    const snapshot = await codeSnapshot(root, "a")
    expect(await keyOf("src/Badge.tsx", snapshot, { mode: "dark" })).not.toBe(
      await keyOf("src/Badge.tsx", snapshot, { mode: "light" })
    )
  })

  it("is 40 hex characters, which the store names its files by", async () => {
    expect(await keyOf("src/Badge.tsx", await codeSnapshot(root, "a"))).toMatch(/^[0-9a-f]{40}$/)
  })
})
