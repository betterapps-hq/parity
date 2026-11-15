import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { readExtension } from "@parity-app/extensions"
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test"
import packageJson from "../package.json" with { type: "json" }
import { detectWebpack, webpackBuilder, webpackConfigFiles } from "./builder.ts"

let root: string

/** A package in the project's node_modules at `version`: detection only reads its manifest. */
const installed = (name: string, version: string) => ({
  [`node_modules/${name}/package.json`]: JSON.stringify({ name, version, main: "index.js" })
})

async function fixture(files: Record<string, string>, scripts?: Record<string, string>) {
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "fixture", scripts }))

  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true })
    await writeFile(join(root, path), content)
  }
}

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), "parity-webpack-")))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
})

describe("the webpack extension", () => {
  it("has a manifest Parity accepts, with its builder's entry and config files, and its versions", () => {
    const found = readExtension(packageJson)

    expect(found.manifest.activates).toEqual(["onDetect"])
    expect(found.manifest.contributes.providers?.builder?.entry).toBe("./builder")
    expect(found.manifest.contributes.providers?.builder?.watches).toEqual(webpackBuilder.watches)
    expect(found.versions).toEqual({ packages: ["webpack"], range: "^5.90.0" })
  })

  it("names an entry module its package exports, and watches webpack's config files", () => {
    const { entry } = readExtension(packageJson).manifest.contributes.providers!.builder!

    expect(Object.keys(packageJson.exports)).toContain(entry)
    expect(webpackBuilder.watches).toEqual(expect.arrayContaining(webpackConfigFiles))
  })
})

describe("detectWebpack", () => {
  it("finds the project's webpack and its config", async () => {
    await fixture({ ...installed("webpack", "5.112.2"), "webpack.config.cjs": "module.exports = { entry: './a.js' }" })

    expect(await detectWebpack(root)).toEqual({
      found: true,
      version: "5.112.2",
      config: "webpack.config.cjs",
      summary: "webpack 5.112.2, config webpack.config.cjs"
    })
  })

  it("finds the config the dev script names", async () => {
    await fixture(
      { ...installed("webpack", "5.112.2"), "config/app.cjs": "module.exports = {}" },
      { dev: "webpack serve --mode development -c config/app.cjs" }
    )

    expect((await detectWebpack(root)).config).toBe("config/app.cjs")
  })

  it("leaves a Next.js project to Next.js, and an Rspack or Rsbuild one to them", async () => {
    await fixture({ ...installed("webpack", "5.112.2"), ...installed("next", "15.5.29") })
    expect(await detectWebpack(root)).toEqual({
      found: false,
      summary: "Next.js 15.5.29 is installed, so Next.js builds the project"
    })

    await rm(join(root, "node_modules/next"), { recursive: true })
    await fixture({ "rspack.config.mjs": "export default {}", "webpack.config.js": "module.exports = {}" })
    expect((await detectWebpack(root)).summary).toBe("rspack.config.mjs is here, so Rspack builds the project")
  })

  it("says when webpack isn't installed, or there's no config", async () => {
    await fixture({ "webpack.config.js": "module.exports = {}" })
    expect((await detectWebpack(root)).summary).toBe(
      "webpack.config.js is here, but webpack isn't installed: install the project's packages first"
    )

    await rm(join(root, "webpack.config.js"))
    await fixture(installed("webpack", "5.90.0"))
    expect(await detectWebpack(root)).toMatchObject({ found: false, version: "5.90.0" })
  })

  it("fails with why when the config doesn't load", async () => {
    await fixture({ ...installed("webpack", "5.112.2"), "webpack.config.cjs": "throw new Error('broken')" })

    await expect(detectWebpack(root)).rejects.toThrow("webpack 5.112.2 couldn't load the project's config")
  })
})
