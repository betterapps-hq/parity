import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test"
import { readStylesheet, stylesheetsFrom } from "./styles.ts"

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

describe("stylesheetsFrom", () => {
  it("gives the entry and each stylesheet it imports, once each, without missing ones", async () => {
    const globals = '@import "./theme.css";\n@import "./gone.css";\n.a {}'
    const theme = '@import "@buildkitgg/shadcn/tailwind.css";\n@import "./globals.css";'
    await write("app/globals.css", globals)
    await write("app/theme.css", theme)

    expect(await stylesheetsFrom(join(root, "app/globals.css"))).toEqual([
      { path: join(root, "app/globals.css"), source: globals },
      { path: join(root, "app/theme.css"), source: theme }
    ])
  })
})
