import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test"
import { findStyles, readStylesheet, stylesheetImports } from "./styles.ts"

let root: string

async function write(path: string, content: string) {
  await mkdir(dirname(join(root, path)), { recursive: true })
  await writeFile(join(root, path), content)
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "parity-styles-"))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe("findStyles", () => {
  it("prefers components.json, then the entry's imports, then the conventional places", async () => {
    await write("app/globals.css", "")
    await write("src/index.css", "")
    const notes: string[] = []
    expect(await findStyles(root, notes)).toEqual({
      styles: ["src/index.css", "app/globals.css"],
      packageStyles: []
    })
    expect(notes).toEqual(["styles from the conventional place: src/index.css, app/globals.css"])

    await write("index.html", '<script type="module" src="/src/main.tsx"></script>')
    await write("src/main.tsx", 'import "./theme.css"')
    expect((await findStyles(root)).styles).toEqual(["src/theme.css"])

    await write("components.json", '{ /* shadcn */ "tailwind": { "css": "styles/app.css" } }')
    expect((await findStyles(root)).styles).toEqual(["styles/app.css"])
  })

  it("reads a root-absolute import from the project's root, as Vite does", async () => {
    await write("index.html", '<script type="module" src="/src/main.tsx"></script>')
    await write("src/main.tsx", 'import "/theme/site.css"')
    expect((await findStyles(root)).styles).toEqual(["theme/site.css"])
  })

  it("says when there are none", async () => {
    const notes: string[] = []
    expect(await findStyles(root, notes)).toEqual({ styles: [], packageStyles: [] })
    expect(notes).toEqual(["no global styles found"])
  })
})

describe("stylesheetImports", () => {
  it("counts side-effect and default imports of CSS and Sass, but not CSS modules or query imports", () => {
    const source = [
      'import "./reset.css"',
      "import theme from '../theme/site.scss'",
      'import styles from "./App.module.css"',
      'import inline from "./print.css?inline"',
      'import App from "./App"',
      'import "@mantine/core/styles.css"'
    ].join("\n")
    expect(stylesheetImports(source)).toEqual(["./reset.css", "../theme/site.scss", "@mantine/core/styles.css"])
  })
})

describe("readStylesheet", () => {
  it("inlines relative @imports once each and leaves packages' alone", async () => {
    await write("app/globals.css", '@import "tailwindcss";\n@import "./theme.css";\n.a {}')
    await write("app/theme.css", '@import url("../shared/colors.css") layer(base);\n@import "./globals.css";\n.b {}')
    await write("shared/colors.css", ".c {}")
    expect(await readStylesheet(join(root, "app/globals.css"))).toBe('@import "tailwindcss";\n.c {}\n\n.b {}\n.a {}')
  })

  it("reads a missing file as empty", async () => {
    expect(await readStylesheet(join(root, "nowhere.css"))).toBe("")
  })
})
