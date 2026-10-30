import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import type { RendererAdapter } from "@parity-app/core"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { freePort, viteBuilder } from "./index.ts"

const viteFolder = dirname(createRequire(import.meta.url).resolve("vite/package.json"))
const viteVersion = (createRequire(import.meta.url)("vite/package.json") as { version: string }).version

let root: string

/** A project folder with these files, and Vite installed unless told otherwise. */
async function fixture(files: Record<string, string>, { vite = true } = {}) {
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "fixture", type: "module" }))
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true })
    await writeFile(join(root, path), content)
  }
  if (vite) {
    await mkdir(join(root, "node_modules"))
    // A junction needs no special rights on Windows; elsewhere it's an ordinary symlink.
    await symlink(viteFolder, join(root, "node_modules", "vite"), "junction")
  }
}

beforeEach(async () => {
  // The real path: Windows runners' tmpdir can use a short (8.3) name, which crashes libuv's watcher.
  root = await realpath(await mkdtemp(join(tmpdir(), "parity-vite-")))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe("viteBuilder.detect", () => {
  it.each([
    ["vite.config.ts", 'import { defineConfig } from "vite"\nexport default defineConfig({})\n'],
    ["vite.config.mts", "export default { clearScreen: false }\n"],
    ["vite.config.cjs", "module.exports = { clearScreen: false }\n"],
    ["vite.config.cts", 'import { defineConfig } from "vite"\nexport default defineConfig({ clearScreen: false })\n']
  ])("finds %s through the project's own Vite", async (name, source) => {
    await fixture({ [name]: source })
    expect(await viteBuilder.detect(root)).toEqual({
      found: true,
      version: viteVersion,
      config: name,
      summary: `Vite ${viteVersion}, config ${name}`
    })
  })

  it("uses the config the dev script names, and ignores flags on other Vite commands", async () => {
    const pkg = (scripts: Record<string, string>) => JSON.stringify({ name: "fixture", type: "module", scripts })
    await fixture({
      "package.json": pkg({
        build: "vite build --config build/prod.config.ts",
        dev: "vite --config build/dev.config.ts"
      }),
      "build/dev.config.ts": "export default {}\n",
      "vite.config.ts": "export default {}\n"
    })
    expect(await viteBuilder.detect(root)).toMatchObject({ found: true, config: "build/dev.config.ts" })

    await writeFile(join(root, "package.json"), pkg({ build: "vite build -c build/prod.config.ts", test: "vitest" }))
    expect(await viteBuilder.detect(root)).toMatchObject({ found: true, config: "vite.config.ts" })
  })

  it("says what it looked for when there's no config", async () => {
    await fixture({})
    const detection = await viteBuilder.detect(root)
    expect(detection).toMatchObject({ found: false, version: viteVersion })
    expect(detection.summary).toContain(".js, .mjs, .ts, .cjs, .mts or .cts")
  })

  it("says when there's a config but Vite isn't installed", async () => {
    await fixture({ "vite.config.cts": "export default {}\n" }, { vite: false })
    expect(await viteBuilder.detect(root)).toEqual({
      found: false,
      summary: "vite.config.cts is here, but Vite isn't installed: install the project's packages first"
    })
  })

  it("reports a config that fails to load", async () => {
    await fixture({ "vite.config.mjs": 'throw new Error("broken config")\n' })
    await expect(viteBuilder.detect(root)).rejects.toThrow(/couldn't load the project's config: .*broken config/)
  })
})

describe("viteBuilder.start", () => {
  it("gives each server its own port on 127.0.0.1, so a second one beside it serves its own guest", async () => {
    await fixture({ "guest.js": "export function createGuest() {}\n" })
    const options = {
      root,
      config: { styles: [], components: {}, documents: [], libraries: [] },
      renderer: { runtimePackages: [], runtimeImports: [] } as unknown as RendererAdapter,
      rendererGuestPath: join(root, "guest.js"),
      allowedOrigins: []
    }
    const first = await viteBuilder.start(options)
    const second = await viteBuilder.start(options)
    try {
      const urls = [new URL(first.guestUrl), new URL(second.guestUrl)]
      expect(urls.map((url) => url.hostname)).toEqual(["127.0.0.1", "127.0.0.1"])
      expect(urls[0].port).not.toBe(urls[1].port)
      for (const url of urls) {
        const response = await fetch(url)
        expect(response.status).toBe(200)
        expect(await response.text()).toContain("createGuest")
      }
    } finally {
      await Promise.all([first.close(), second.close()])
    }
  })

  it("serves on the port it's given when that's free, and on another one when it's taken", async () => {
    await fixture({ "guest.js": "export function createGuest() {}\n" })
    const port = await freePort()
    const options = {
      root,
      config: { styles: [], components: {}, documents: [], libraries: [] },
      renderer: { runtimePackages: [], runtimeImports: [] } as unknown as RendererAdapter,
      rendererGuestPath: join(root, "guest.js"),
      allowedOrigins: [],
      port
    }
    const first = await viteBuilder.start(options)
    try {
      expect(new URL(first.guestUrl).port).toBe(String(port))
      const second = await viteBuilder.start(options)
      try {
        expect(new URL(second.guestUrl).port).not.toBe(String(port))
      } finally {
        await second.close()
      }
    } finally {
      await first.close()
    }
  })
})
