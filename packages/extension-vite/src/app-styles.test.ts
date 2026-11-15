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

    expect(await viteAppStyles(root)).toEqual({
      styles: ["src/style.css"],
      packageStyles: [],
      from: ["src/root.ts", "src/entry.ts", "src/page.css", "src/page.ts", "src/style.css", "src/theme.css"]
    })
  })

  it("follows a page's links as the browser does: relative to the page, from public, and not commented out or remote", async () => {
    await write({
      "app/index.html": [
        '<link rel="stylesheet" href="https://fonts.example.com/inter.css">',
        '<!-- <link rel="stylesheet" href="./old.css"> -->',
        '<link rel="stylesheet" href="./page.css">',
        '<link rel="stylesheet" href="/reset.css">',
        '<script type="module" src="main.ts"></script>'
      ].join("\n"),
      "vite.config.mjs": 'export default { build: { rollupOptions: { input: "app/index.html" } } }',
      "app/page.css": ".page {}",
      "app/old.css": ".old {}",
      "public/reset.css": "* { margin: 0; }",
      "app/main.ts": "export {}"
    })

    expect(await viteAppStyles(root)).toEqual({
      styles: ["app/page.css", "public/reset.css"],
      packageStyles: [],
      from: ["app/index.html", "app/main.ts"]
    })
  })

  it("keeps the order the app imports them in when several modules at one depth import some", async () => {
    await write({
      "index.html": '<script type="module" src="/src/main.ts"></script>',
      // Imported base first, then the overrides that win over it: the reverse of their names' order.
      "src/main.ts": 'import "./z-base"\nimport "./a-overrides"',
      "src/z-base.ts": 'import "./base.css"',
      "src/a-overrides.ts": 'import "./overrides.css"',
      "src/base.css": ":root { --primary: red; }",
      "src/overrides.css": ":root { --primary: blue; }"
    })

    expect((await viteAppStyles(root)).styles).toEqual(["src/base.css", "src/overrides.css"])
  })

  it("lists every file that could change the answer: a module Vite couldn't compile, and the theme's stylesheets", async () => {
    await write({
      "index.html": '<script type="module" src="/src/main.ts"></script><link rel="stylesheet" href="/later.css">',
      "src/main.ts": 'import "./root"\nimport "./page"\nimport "./broken"',
      "src/root.ts": 'import "./root.css"',
      "src/page.ts": 'import "./page.css"',
      // Not valid code yet: fixing it may bring in a stylesheet.
      "src/broken.ts": 'import "./broken.css"\nexport const = ',
      "src/root.css": '@import "./tokens.css";',
      "src/tokens.css": ".a {}",
      "src/page.css": ".page {}"
    })

    const { from } = await viteAppStyles(root)

    // `later.css` isn't there yet and `broken.ts` didn't compile. Neither module's stylesheets hold a theme, so both
    // count, and an edit to any of them, `@import`ed ones included, can change which do.
    expect(from).toEqual(
      expect.arrayContaining(["later.css", "src/broken.ts", "src/page.css", "src/root.css", "src/tokens.css"])
    )
  })

  it("follows what an inline module script imports, stylesheets and modules alike", async () => {
    await write({
      "index.html": [
        "<script>window.analytics = true</script>",
        '<script type="module">',
        '  import "fake-ui/styles.css"',
        '  import "./src/index.css"',
        '  import { start } from "./src/main"',
        "  start()",
        "</script>"
      ].join("\n"),
      "src/index.css": ":root { --primary: red; }",
      "src/main.ts": 'import "./main.css"\nexport const start = () => 1',
      "src/main.css": ".main {}",
      "node_modules/fake-ui/package.json": JSON.stringify({ name: "fake-ui" }),
      "node_modules/fake-ui/styles.css": ":root { --fake: blue; }"
    })

    expect(await viteAppStyles(root)).toEqual({
      styles: ["src/index.css", "src/main.css"],
      packageStyles: ["fake-ui/styles.css"],
      from: ["index.html", "src/main.ts"]
    })
  })

  it("lists an HTML entry that isn't there yet, so creating it is seen", async () => {
    expect(await viteAppStyles(root)).toEqual({ styles: [], packageStyles: [], from: ["index.html"] })
  })

  it("names a package's stylesheet by the export the app imports, not the file it maps to", async () => {
    await write({
      "index.html": '<script type="module" src="/src/main.ts"></script>',
      "src/main.ts": 'import "fake-ui/styles.css"',
      "node_modules/fake-ui/package.json": JSON.stringify({
        name: "fake-ui",
        exports: { "./styles.css": "./dist/styles.css" }
      }),
      "node_modules/fake-ui/dist/styles.css": ":root { --fake: blue; }"
    })

    expect((await viteAppStyles(root)).packageStyles).toEqual(["fake-ui/styles.css"])
  })

  it("names none for an app that loads no stylesheet, but says the files it read, so a first import is seen", async () => {
    await write({
      "index.html": '<script type="module" src="/src/main.ts"></script>',
      "src/main.ts": 'import { app } from "./app"\napp()',
      "src/app.ts": "export const app = () => 1"
    })

    expect(await viteAppStyles(root)).toEqual({
      styles: [],
      packageStyles: [],
      from: ["index.html", "src/app.ts", "src/main.ts"]
    })

    await write({ "src/main.ts": 'import "./index.css"\nimport { app } from "./app"\napp()', "src/index.css": "" })
    expect((await viteAppStyles(root)).styles).toEqual(["src/index.css"])
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
