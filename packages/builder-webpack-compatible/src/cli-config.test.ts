import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test"
import { cliConfig, cliConfigFiles, type ServeArgv, servedConfig } from "./cli-config.ts"

let root: string

const webpackCli = { file: "webpack.config", serve: /\bwebpack(?:\s+serve)?\b/, env: { WEBPACK_SERVE: true } } as const

async function fixture(files: Record<string, string>) {
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true })
    await writeFile(join(root, path), content)
  }
}

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), "parity-cli-config-")))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
})

describe("cliConfig", () => {
  it("loads the config file in the project's folder", async () => {
    await fixture({
      "package.json": JSON.stringify({ name: "fixture" }),
      "webpack.config.cjs": "module.exports = { entry: './src/index.jsx' }"
    })

    expect(await cliConfig(root, webpackCli)).toEqual({
      config: { entry: "./src/index.jsx" },
      file: "webpack.config.cjs"
    })
  })

  it("loads the config the dev script names, and calls a function with the CLI's env", async () => {
    await fixture({
      "package.json": JSON.stringify({ name: "fixture", scripts: { dev: "webpack serve --config config/app.cjs" } }),
      "config/app.cjs": "module.exports = (env) => ({ name: Object.keys(env).join() })"
    })

    expect(await cliConfig(root, webpackCli)).toEqual({ config: { name: "WEBPACK_SERVE" }, file: "config/app.cjs" })
  })

  it("gives nothing when there's no config", async () => {
    await fixture({ "package.json": JSON.stringify({ name: "fixture" }) })

    expect(await cliConfig(root, webpackCli)).toBeUndefined()
  })
})

describe("servedConfig", () => {
  it("calls a function config as the CLI does for its dev server, and takes a list's first", async () => {
    const seen: [Readonly<Record<string, true>>, ServeArgv][] = []

    const config = await servedConfig(
      (env, argv) => {
        seen.push([env, argv])

        return [{ name: "web" }, { name: "server" }]
      },
      { RSPACK_SERVE: true }
    )

    expect(config).toEqual({ name: "web" })
    expect(seen).toEqual([[{ RSPACK_SERVE: true }, { mode: "development", env: { RSPACK_SERVE: true } }]])
  })

  it("takes a config as it is, and refuses an empty list", async () => {
    expect(await servedConfig({ entry: "./a.js" }, { WEBPACK_SERVE: true })).toEqual({ entry: "./a.js" })
    await expect(servedConfig([], { WEBPACK_SERVE: true })).rejects.toThrow("its config is an empty list")
  })
})

describe("cliConfigFiles", () => {
  it("names each extension a config may have", () => {
    expect(cliConfigFiles("webpack.config")).toEqual([
      "webpack.config.ts",
      "webpack.config.mts",
      "webpack.config.cts",
      "webpack.config.js",
      "webpack.config.mjs",
      "webpack.config.cjs"
    ])
  })
})
