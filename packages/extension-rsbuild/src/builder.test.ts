import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { pathToFileURL } from "node:url"
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test"
import { detectRsbuild, projectRsbuild } from "./builder.ts"

let root: string

/**
 * A fake `@rsbuild/core` at `version`: its config loading, an instance whose configs are the web environment's and a
 * server's, as Rsbuild gives them, and its Rspack. What the instance was made with is kept for the test to read.
 */
const fakeRsbuild = (version: string) => ({
  "node_modules/@rsbuild/core/package.json": JSON.stringify({
    name: "@rsbuild/core",
    version,
    type: "module",
    exports: { ".": { import: "./index.js" } }
  }),
  "node_modules/@rsbuild/core/index.js": [
    `export const version = ${JSON.stringify(version)}`,
    "export function rspack() {}",
    "rspack.HotModuleReplacementPlugin = class {}",
    "rspack.DefinePlugin = class {}",
    "rspack.NormalModuleReplacementPlugin = class {}",
    "export async function loadConfig({ cwd, path }) {",
    "  return { content: { dev: { writeToDisk: false }, source: { entry: { index: './src/index.tsx' } } }, filePath: path ?? null }",
    "}",
    "export const madeWith = []",
    "export async function createRsbuild(options) {",
    "  madeWith.push(options)",
    "  process.env.NODE_ENV = 'development'",
    "  return { initConfigs: async () => [{ name: 'node', target: 'node' }, { name: 'web', entry: { index: './src/index.tsx' } }] }",
    "}"
  ].join("\n")
})

async function fixture(files: Record<string, string>, scripts: Record<string, string> = {}) {
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "fixture", type: "module", scripts }))

  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true })
    await writeFile(join(root, path), content)
  }
}

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), "parity-rsbuild-")))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
})

describe("detectRsbuild", () => {
  it("finds the project's Rsbuild and its config", async () => {
    await fixture({ ...fakeRsbuild("2.3.2"), "rsbuild.config.ts": "export default {}" })

    expect(await detectRsbuild(root)).toEqual({
      found: true,
      version: "2.3.2",
      config: "rsbuild.config.ts",
      summary: "Rsbuild 2.3.2, config rsbuild.config.ts"
    })
  })

  it("finds a project with no config file whose dev script runs Rsbuild, or the config it names", async () => {
    await fixture(fakeRsbuild("2.3.2"), { dev: "rsbuild dev" })

    expect(await detectRsbuild(root)).toEqual({
      found: true,
      version: "2.3.2",
      summary: "Rsbuild 2.3.2, with no config file"
    })

    await fixture(fakeRsbuild("2.3.2"), { dev: "rsbuild dev -c config/rsbuild.web.ts" })

    expect(await detectRsbuild(root)).toMatchObject({ found: true, config: "config/rsbuild.web.ts" })
  })

  it("says what's missing when Rsbuild isn't there or isn't installed", async () => {
    await fixture({})

    expect(await detectRsbuild(root)).toEqual({
      found: false,
      summary: "No rsbuild.config file and no script that runs Rsbuild"
    })

    await fixture({ "rsbuild.config.mjs": "export default {}" })

    expect(await detectRsbuild(root)).toEqual({
      found: false,
      summary: "rsbuild.config.mjs is here, but Rsbuild isn't installed: install the project's packages first"
    })
  })
})

describe("projectRsbuild", () => {
  it("builds the web environment's config, with Rsbuild's own hot updates off and NODE_ENV left as it was", async () => {
    await fixture({ ...fakeRsbuild("2.3.2"), "rsbuild.config.ts": "export default {}" }, { dev: "rsbuild dev" })
    const before = process.env.NODE_ENV

    const { bundler, config } = await projectRsbuild(root)

    expect(bundler).toMatchObject({ name: "Rsbuild", version: "2.3.2" })
    expect(config).toEqual({ name: "web", entry: { index: "./src/index.tsx" } })
    expect(process.env.NODE_ENV).toBe(before)
    const made: unknown = (await import(pathToFileURL(join(root, "node_modules/@rsbuild/core/index.js")).href)).madeWith

    expect(made).toEqual([
      {
        cwd: root,
        rsbuildConfig: {
          mode: "development",
          dev: { writeToDisk: false, hmr: false, liveReload: false },
          source: { entry: { index: "./src/index.tsx" } }
        }
      }
    ])
  })
})
