import { readdir, readFile, realpath } from "node:fs/promises"
import { join } from "node:path"
import {
  type Bundler,
  type BundlerConfig,
  bundledAppStyles,
  cliConfig,
  cliConfigFiles,
  type CliConfigSource,
  importProjectPackage,
  projectPackageFolder,
  startBundledGuest
} from "@parity-app/builder-webpack-compatible"
import {
  type AppStyles,
  type BuilderAdapter,
  type BuilderDetection,
  parseManifest,
  scriptConfigExtensions
} from "@parity-app/core"
import { cssExtractPlugin, type WebpackCss, webpackApi, webpackBundler, withWebpackCss } from "./webpack.ts"

/** The config files webpack's CLI looks for. */
export const webpackConfigFiles = cliConfigFiles("webpack.config")

/** The config files of the builders that take a project with webpack installed, but aren't plain webpack. */
const otherConfigFiles = [
  ...cliConfigFiles("rspack.config"),
  ...cliConfigFiles("rsbuild.config"),
  ...["js", "mjs", "ts", "mts"].map((extension) => `next.config.${extension}`)
]

/** Runs webpack's dev server: `webpack serve` (or `server`, `s`), or `webpack-dev-server`. */
const webpackServe = /(?:^|[\s;&|(])(?:webpack(?:-cli)?\s+(?:serve|server|s)(?![\w.-])|webpack-dev-server(?![\w.-]))/

/** How webpack's CLI finds its config for `webpack serve`. */
const webpackCli: CliConfigSource = { file: "webpack.config", serve: webpackServe, env: { WEBPACK_SERVE: true } }

/**
 * Builds a plain webpack project's components with the project's own webpack install and config: the entry module the
 * webpack extension's manifest names, which the builder process loads (PAR-1150).
 */
export const webpackBuilder: BuilderAdapter = {
  id: "webpack",
  name: "webpack",
  watches: [...webpackConfigFiles, ...otherConfigFiles],
  detect: ({ root }) => detectWebpack(root),
  styles: ({ root }) => webpackAppStyles(root),
  async start(options) {
    const root = await realpath(options.root)
    const { bundler, config } = await projectWebpack(root)

    return startBundledGuest({ bundler, config, start: { ...options, root } })
  }
}

/**
 * The project's own webpack, and its config as `webpack serve` would take it. CSS is extracted with the project's
 * `mini-css-extract-plugin`, or, when it has none, built with webpack's own CSS.
 */
export async function projectWebpack(root: string): Promise<{ bundler: Bundler; config: BundlerConfig; file: string }> {
  const { module, version } = await importProjectPackage(root, "webpack")
  // SAFETY: an ES module import of a CommonJS package gives its exports as the module's default.
  const webpack = webpackApi(module as { default?: unknown }, "webpack")
  const extract = await projectCssExtractPlugin(root)
  const found = await cliConfig(root, webpackCli)

  if (!found) {
    throw new Error(`webpack ${version} is installed, but there's no webpack.config`)
  }

  return {
    bundler: webpackBundler(webpack, version, extract),
    config: extract ? found.config : withWebpackCss(found.config, await webpackCss(root)),
    file: found.file
  }
}

/**
 * What the project's webpack can do with its own CSS, read from the options its schema accepts: it refuses a config that
 * names one it doesn't know.
 */
async function webpackCss(root: string): Promise<WebpackCss> {
  const folder = await projectPackageFolder(root, "webpack")
  const schema = folder ? await readFile(join(folder, "schemas", "WebpackOptions.json"), "utf8").catch(() => "") : ""

  return { globalCustomProperties: schema.includes('"dashedIdents"') }
}

/** The project's own `mini-css-extract-plugin`, if it has it. */
async function projectCssExtractPlugin(root: string) {
  if (!(await projectPackageFolder(root, "mini-css-extract-plugin"))) {
    return undefined
  }

  // SAFETY: an ES module import of a CommonJS package gives its exports as the module's default.
  return cssExtractPlugin((await importProjectPackage(root, "mini-css-extract-plugin")).module as { default?: unknown })
}

/**
 * Asks the project whether plain webpack builds it, with webpack's version and the config file, as `webpack serve`
 * finds it. A Next.js project is Next's, and one with an Rspack or Rsbuild config is theirs, though either may have
 * webpack installed.
 */
export async function detectWebpack(root: string): Promise<BuilderDetection> {
  const next = await installedVersion(root, "next")

  if (next !== undefined) {
    return { found: false, summary: `Next.js ${next} is installed, so Next.js builds the project` }
  }

  const names = await readdir(root).catch(() => [])
  const other = names.find((name) => otherConfigFiles.includes(name))

  if (other) {
    return {
      found: false,
      summary: `${other} is here, so ${other.startsWith("rsbuild") ? "Rsbuild" : "Rspack"} builds the project`
    }
  }

  const version = await installedVersion(root, "webpack")

  if (version === undefined) {
    const named = names.find((name) => webpackConfigFiles.includes(name))

    return {
      found: false,
      summary: named
        ? `${named} is here, but webpack isn't installed: install the project's packages first`
        : "No webpack installed and no webpack.config file"
    }
  }

  let found: Awaited<ReturnType<typeof cliConfig>>

  try {
    found = await cliConfig(root, webpackCli)
  } catch (error) {
    throw new Error(
      `webpack ${version} couldn't load the project's config: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    )
  }

  if (!found) {
    return {
      found: false,
      version,
      summary: `webpack ${version} is installed, but there's no webpack.config (${scriptConfigExtensions.map((extension) => `.${extension}`).join(", ")})`
    }
  }

  return { found: true, version, config: found.file, summary: `webpack ${version}, config ${found.file}` }
}

/** The global stylesheets the app loads, as the project's own webpack builds it. */
export async function webpackAppStyles(root: string): Promise<AppStyles> {
  root = await realpath(root)
  const { bundler, config, file } = await projectWebpack(root)

  return bundledAppStyles(bundler, config, root, file)
}

/** The version of the project's copy of a package, read from its manifest without loading it, if it's installed. */
async function installedVersion(root: string, name: string): Promise<string | undefined> {
  const folder = await projectPackageFolder(root, name)

  if (!folder) {
    return undefined
  }

  const file = join(folder, "package.json")

  return parseManifest(await readFile(file, "utf8"), file).version ?? ""
}
