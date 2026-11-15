import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { configInput, viteAppStyles } from "./app-styles.ts"

// docs/editor.md, Global stylesheets come from the builder (PAR-1133): the project's own Vite, compiling a real app.

const viteFolder = dirname(createRequire(import.meta.url).resolve("vite/package.json"))

let root: string

async function write(files: Record<string, string>) {
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true })
    await writeFile(join(root, path), content)
  }
}

beforeEach(async () => {
  // The real path: Windows runners' tmpdir can use a short (8.3) name.
  root = await realpath(await mkdtemp(join(tmpdir(), "parity-app-styles-")))
  await write({ "package.json": JSON.stringify({ name: "fixture", type: "module" }) })
  await mkdir(join(root, "node_modules"), { recursive: true })
  await symlink(viteFolder, join(root, "node_modules", "vite"), "junction")
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
})

describe("viteAppStyles", { timeout: 30_000 }, () => {
  it("names what the module index.html loads imports, packages' by their specifier, and nothing deeper", async () => {
    await write({
      "index.html": '<link rel="stylesheet" href="/public.css"><script type="module" src="/src/main.ts"></script>',
      "public.css": "body { margin: 0; }",
      "src/main.ts": 'import "fake-ui/styles.css"\nimport "./index.css"\nimport { app } from "./app"\napp()',
      "src/index.css": ":root { --primary: red; }",
      "src/app.ts": 'import "./app.css"\nimport styles from "./card.module.css"\nexport const app = () => styles',
      "src/app.css": ".app { color: red; }",
      "src/card.module.css": ".card { color: red; }",
      "node_modules/fake-ui/package.json": JSON.stringify({ name: "fake-ui" }),
      "node_modules/fake-ui/styles.css": ":root { --fake: blue; }"
    })

    expect(await viteAppStyles(root)).toEqual({
      styles: ["public.css", "src/index.css"],
      packageStyles: ["fake-ui/styles.css"],
      from: ["index.html", "src/main.ts"]
    })
  })

  it("follows the config's own entry to the app's root, whose stylesheet holds the theme", async () => {
    await write({
      "vite.config.mjs": 'export default { build: { rollupOptions: { input: "src/entry.ts" } } }',
      // As a router's generated tree does, the root and a page are imported side by side.
      "src/entry.ts": 'import { root } from "./root"\nimport { page } from "./page"\nexport default [root, page]',
      "src/root.ts":
        'import href from "./style.css?url"\nimport raw from "./print.css?raw"\nexport const root = [href, raw]',
      "src/page.ts": 'import "./page.css"\nexport const page = 1',
      "src/style.css": '@import "./theme.css";\n.a { color: var(--primary); }',
      "src/theme.css": ":root { --primary: red; }",
      "src/print.css": ":root { --print: black; }",
      "src/page.css": ".page { --gap: 4px; }"
    })

    expect(await viteAppStyles(root)).toEqual({ styles: ["src/style.css"], packageStyles: [], from: ["src/root.ts"] })
  })

  it("names none for an app that loads no stylesheet", async () => {
    await write({
      "index.html": '<script type="module" src="/src/main.ts"></script>',
      "src/main.ts": 'import { app } from "./app"\napp()',
      "src/app.ts": "export const app = () => 1"
    })

    expect(await viteAppStyles(root)).toEqual({ styles: [], packageStyles: [], from: [] })
  })
})

describe("configInput", () => {
  it("reads the entries of a config Vite 6 or 7 resolved, which has no rolldownOptions", () => {
    expect(configInput({ rollupOptions: { input: "src/entry.ts" } })).toEqual(["src/entry.ts"])
    expect(configInput({ rollupOptions: {} })).toEqual([])
  })

  it("prefers Vite 8's rolldownOptions, and takes a list or a record of entries", () => {
    const input = { main: "index.html", admin: "admin.html" }
    expect(configInput({ rolldownOptions: { input }, rollupOptions: {} })).toEqual(["index.html", "admin.html"])
    expect(configInput({ rolldownOptions: {}, rollupOptions: { input: ["a.html", "b.html"] } })).toEqual([
      "a.html",
      "b.html"
    ])
  })
})
