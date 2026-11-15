import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { pathToFileURL } from "node:url"
import { describe, expect, it } from "vite-plus/test"
import {
  type GuestAppFile,
  guestAppFiles,
  guestAppFolder,
  guestModuleFile,
  nextConfigSource,
  projectImport
} from "./guest-app.ts"

/** Writes the guest app's files into the project at `root`, as the builder does. */
async function write(root: string, files: GuestAppFile[]) {
  for (const file of files) {
    const path = join(root, guestAppFolder, file.path)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, file.text)
  }
}

const options = {
  root: "D:/work/app",
  next: "D:/work/app/node_modules/next",
  origin: "http://127.0.0.1:4000",
  guestSource: "export async function guestParts() {}\n",
  styles: ["src/app/globals.css"],
  packageStyles: ["@mantine/core/styles.css"]
}

const text = (files: { path: string; text: string }[], path: string) => files.find((file) => file.path === path)?.text

describe("the guest app", () => {
  it("imports project files from its app folder, three folders below the root", () => {
    expect(projectImport("src/components/Card.tsx")).toBe("../../../src/components/Card.tsx")
    expect(projectImport("./app/page.tsx")).toBe("../../../app/page.tsx")
    expect(projectImport("src\\lib\\util.ts")).toBe("../../../src/lib/util.ts")
  })

  it("has a client guest module, and pages of its own for the project's and packages' stylesheets", () => {
    const files = guestAppFiles(options)

    expect(text(files, guestModuleFile)).toMatch(/^"use client"\n\nexport async function guestParts\(\) \{\}/)
    expect(text(files, "app/page.tsx")).toContain('import Guest from "./guest"')
    // The styles page is one folder deeper than the guest module.
    expect(text(files, "app/styles/page.tsx")).toContain('import "../../../../src/app/globals.css"')
    expect(text(files, "app/package-styles/page.tsx")).toContain('import "@mantine/core/styles.css"')
    expect(text(files, "tsconfig.json")).toBeUndefined()
    expect(text(files, "postcss.config.mjs")).toBeUndefined()
  })

  it("extends the project's tsconfig", () => {
    const files = guestAppFiles({ ...options, tsconfig: "tsconfig.json" })

    expect(JSON.parse(text(files, "tsconfig.json")!)).toEqual({ extends: "../../tsconfig.json" })
  })

  it("passes on the project's PostCSS config, with Tailwind's plugin looking for classes from the project", async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), "parity-next-guest-")))

    try {
      const plugins = { "@tailwindcss/postcss": {}, autoprefixer: { grid: true } }
      await writeFile(join(root, "postcss.config.mjs"), `export default ${JSON.stringify({ plugins })}\n`)
      await write(root, guestAppFiles({ ...options, root, postcss: "postcss.config.mjs" }))

      const { default: config } = await import(pathToFileURL(join(root, guestAppFolder, "postcss.config.mjs")).href)

      expect(config).toEqual({ plugins: { "@tailwindcss/postcss": { base: root }, autoprefixer: { grid: true } } })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it("gives Tailwind's Turbopack loader the project's root, unless it has a base, and leaves other loaders", async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), "parity-next-guest-")))

    try {
      await write(root, guestAppFiles({ ...options, root }))

      const { rulesWithTailwindBase } = await import(
        pathToFileURL(join(root, guestAppFolder, "tailwind-base.mjs")).href
      )

      expect(
        rulesWithTailwindBase({
          "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" },
          "*.svg": [{ loaders: ["@svgr/webpack"] }],
          "*.scss": { loaders: [{ loader: "@tailwindcss/turbopack", options: { base: "/elsewhere" } }] }
        })
      ).toEqual({
        "*.css": { loaders: [{ loader: "@tailwindcss/turbopack", options: { base: root } }], as: "*.css" },
        "*.svg": [{ loaders: ["@svgr/webpack"] }],
        "*.scss": { loaders: [{ loader: "@tailwindcss/turbopack", options: { base: "/elsewhere" } }] }
      })
      expect(rulesWithTailwindBase(undefined)).toEqual({})
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it("loads the project's Next config the way Next does, serving assets and images from the builder, built beside it", () => {
    const ts = nextConfigSource({ ...options, config: "next.config.ts" })
    const mjs = nextConfigSource({ ...options, config: "next.config.mjs" })
    const none = nextConfigSource(options)

    expect(ts).toContain('transpileConfig({ nextConfigPath: "D:/work/app/next.config.ts", dir: "D:/work/app" })')
    expect(mjs).toContain('import("file:///D:/work/app/next.config.mjs")')
    expect(none).toContain("return {}")

    for (const source of [ts, mjs, none]) {
      expect(source).toContain('createRequire("D:/work/app/node_modules/next/package.json")')
      expect(source).toContain('const origin = "http://127.0.0.1:4000"')
      expect(source).toContain("const { output, distDir, basePath, i18n, rewrites, redirects, ...kept } = project")
      expect(source).toContain('distDir: "../parity-build"')
    }
  })
})
