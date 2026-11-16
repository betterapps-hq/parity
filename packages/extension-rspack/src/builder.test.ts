import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { readExtension } from "@parity-app/extension/manifest"
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test"
import packageJson from "../package.json" with { type: "json" }
import { detectRspack, rspackBuilder, rspackConfigFiles } from "./builder.ts"

let root: string

/** A fake `@rspack/core` at `version`: enough of its API for detection, which only asks its version. */
const fakeRspack = (version: string) => ({
  "node_modules/@rspack/core/package.json": JSON.stringify({
    name: "@rspack/core",
    version,
    type: "module",
    exports: { ".": { import: "./index.js" } }
  }),
  "node_modules/@rspack/core/index.js": [
    "export function rspack() {}",
    "rspack.HotModuleReplacementPlugin = class {}",
    "rspack.DefinePlugin = class {}",
    "rspack.NormalModuleReplacementPlugin = class {}"
  ].join("\n")
})

async function fixture(files: Record<string, string>) {
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "fixture", type: "module" }))

  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true })
    await writeFile(join(root, path), content)
  }
}

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), "parity-rspack-")))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
})

describe("the Rspack extension", () => {
  it("has a manifest Parity accepts, with its builder's entry and config files, and its versions", () => {
    const found = readExtension(packageJson)

    expect(found.manifest.activates).toEqual(["onDetect"])
    expect(found.manifest.contributes.providers?.builder?.entry).toBe("./builder")
    expect(found.manifest.contributes.providers?.builder?.watches).toEqual(rspackBuilder.watches)
    expect(found.versions).toEqual({ packages: ["@rspack/core"], range: "^1.4.0 || ^2.0.0" })
  })

  it("names an entry module its package exports", () => {
    const { entry } = readExtension(packageJson).manifest.contributes.providers!.builder!

    expect(Object.keys(packageJson.exports)).toContain(entry)
  })
})

describe("detectRspack", () => {
  it("finds the project's Rspack and its config", async () => {
    await fixture({ ...fakeRspack("2.3.2"), "rspack.config.mjs": "export default { entry: './src/main.tsx' }" })

    expect(await detectRspack(root)).toEqual({
      found: true,
      version: "2.3.2",
      config: "rspack.config.mjs",
      summary: "Rspack 2.3.2, config rspack.config.mjs"
    })
  })

  it("finds the config the dev script names", async () => {
    await fixture({ ...fakeRspack("2.3.2"), "config/app.config.mjs": "export default {}" })
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({ name: "fixture", type: "module", scripts: { dev: "rspack dev -c config/app.config.mjs" } })
    )

    expect((await detectRspack(root)).config).toBe("config/app.config.mjs")
  })

  it("leaves a project with an Rsbuild config to Rsbuild", async () => {
    await fixture({ ...fakeRspack("2.3.2"), "rsbuild.config.ts": "export default {}", "rspack.config.mjs": "" })

    expect(await detectRspack(root)).toEqual({
      found: false,
      summary: "rsbuild.config.ts is here, so Rsbuild builds the project"
    })
  })

  it("says when Rspack isn't installed, or there's no config", async () => {
    await fixture({ "rspack.config.js": "module.exports = {}" })
    expect((await detectRspack(root)).summary).toBe(
      "rspack.config.js is here, but Rspack isn't installed: install the project's packages first"
    )

    await rm(join(root, "rspack.config.js"))
    await fixture(fakeRspack("1.7.12"))
    expect(await detectRspack(root)).toMatchObject({ found: false, version: "1.7.12" })
  })

  it("fails with why when the config doesn't load", async () => {
    await fixture({ ...fakeRspack("2.3.2"), "rspack.config.mjs": "throw new Error('broken')" })

    await expect(detectRspack(root)).rejects.toThrow("Rspack 2.3.2 couldn't load the project's config")
  })
})

describe("rspackConfigFiles", () => {
  it("knows the config files Rspack's CLI looks for", () => {
    expect(rspackConfigFiles).toContain("rspack.config.ts")
    expect(rspackConfigFiles).toContain("rspack.config.cjs")
  })
})
