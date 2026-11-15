import { readdir, readFile, realpath } from "node:fs/promises"
import { basename, dirname, extname, join, resolve } from "node:path"
import {
  type Bundler,
  type BundlerConfig,
  bundlerConfig,
  bundledAppStyles,
  importProjectPackage,
  rspackApi,
  rspackBundler,
  type RspackModule,
  startBundledGuest
} from "@parity-app/builder-webpack-compatible"
import {
  type AppStyles,
  type BuilderAdapter,
  type BuilderDetection,
  parseManifest,
  scriptConfigExtensions
} from "@parity-app/core"
import { commandOption, findConfig, loadConfig, scriptRunning } from "@parity-app/project"
import { z } from "zod"

/** The config files Rspack's CLI looks for. */
export const rspackConfigFiles = scriptConfigExtensions.map((extension) => `rspack.config.${extension}`)

/** Rsbuild's, whose project Rsbuild builds, though it has Rspack installed too. */
const rsbuildConfigFiles = scriptConfigExtensions.map((extension) => `rsbuild.config.${extension}`)

/** Runs Rspack's dev server: `rspack dev`, `rspack serve`, or `rspack` alone. */
const rspackServe = /(?:^|[\s;&|(])rspack(?![\w.-])(?!\s+(?:build|preview)\b)/

/**
 * Builds a project's components with the project's own Rspack install and config: the entry module the Rspack
 * extension's manifest names, which the builder process loads (PAR-1147).
 */
export const rspackBuilder: BuilderAdapter = {
  id: "rspack",
  name: "Rspack",
  watches: [...rspackConfigFiles, ...rsbuildConfigFiles],
  detect: ({ root }) => detectRspack(root),
  styles: ({ root }) => rspackAppStyles(root),
  async start(options) {
    const root = await realpath(options.root)
    const { bundler, config } = await projectRspack(root)

    return startBundledGuest({ bundler, config, start: { ...options, root } })
  }
}

/** The project's own Rspack, and its config as Rspack's CLI would give `rspack dev`. */
export async function projectRspack(root: string): Promise<{ bundler: Bundler; config: BundlerConfig; file: string }> {
  const { module, version } = await importProjectPackage(root, "@rspack/core")
  // SAFETY: the module is the ES module entry `@rspack/core`'s own package.json names, so its exports are Rspack's API.
  const bundler = rspackBundler(rspackApi(module as RspackModule, "@rspack/core"), { name: "Rspack", version })
  const found = await rspackConfig(root)

  if (!found) {
    throw new Error(`Rspack ${version} is installed, but there's no rspack.config`)
  }

  return { bundler, config: found.config, file: found.file }
}

/**
 * Asks the project's own Rspack whether it builds the project, with its version and config file, as `rspack dev` finds
 * it. A project with an Rsbuild config is Rsbuild's, though Rsbuild installs Rspack too.
 */
export async function detectRspack(root: string): Promise<BuilderDetection> {
  const names = await readdir(root).catch(() => [])
  const rsbuild = names.find((name) => rsbuildConfigFiles.includes(name))

  if (rsbuild) {
    return { found: false, summary: `${rsbuild} is here, so Rsbuild builds the project` }
  }

  let version: string

  try {
    version = (await importProjectPackage(root, "@rspack/core")).version
  } catch {
    const named = names.find((name) => rspackConfigFiles.includes(name))

    return {
      found: false,
      summary: named
        ? `${named} is here, but Rspack isn't installed: install the project's packages first`
        : "No Rspack installed and no rspack.config file"
    }
  }

  let found: Awaited<ReturnType<typeof rspackConfig>>

  try {
    found = await rspackConfig(root)
  } catch (error) {
    throw new Error(
      `Rspack ${version} couldn't load the project's config: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    )
  }

  if (!found) {
    return {
      found: false,
      version,
      summary: `Rspack ${version} is installed, but there's no rspack.config (${scriptConfigExtensions.map((extension) => `.${extension}`).join(", ")})`
    }
  }

  return { found: true, version, config: found.file, summary: `Rspack ${version}, config ${found.file}` }
}

/** The global stylesheets the app loads, as the project's own Rspack builds it. */
export async function rspackAppStyles(root: string): Promise<AppStyles> {
  root = await realpath(root)
  const { bundler, config, file } = await projectRspack(root)

  return bundledAppStyles(bundler, config, root, file)
}

/**
 * The project's Rspack config for `rspack dev`, and its file from the root: the one its dev script names with
 * `--config` or `-c`, else `rspack.config.*` in its folder. A config that exports a function is called as Rspack's CLI
 * calls it for `serve`; one that exports a list gives its first. Loading it runs it, as `rspack` does.
 */
export async function rspackConfig(root: string): Promise<{ config: BundlerConfig; file: string } | undefined> {
  const named = await scriptedConfig(root)
  const folder = named ? dirname(named) : root
  const files = named ? [basename(named, extname(named))] : ["rspack.config"]
  const source = { files, extensions: [...scriptConfigExtensions], here: true }

  if (!(await findConfig(root, folder, source))) {
    return undefined
  }

  const loaded = await loadConfig(root, folder, source, z.unknown())

  if (!loaded) {
    return undefined
  }

  // A config file may export a promise of its config, which `rspack` waits for.
  return { config: await servedConfig(configExport.parse(await loaded.value)), file: loaded.path }
}

/** What Rspack's CLI passes a config that exports a function, for `rspack dev`. */
export interface ServeEnv {
  RSPACK_SERVE: true
}

export interface ServeArgv {
  mode: "development"
  env: ServeEnv
}

/** What a config file exports: a config, a list of them, or a function that gives one. */
const configExport = z.union([
  // oxlint-disable-next-line anti-slop/no-unknown-returns -- what the function gives is parsed by this schema in turn
  z.custom<(env: ServeEnv, argv: ServeArgv) => unknown>((value) => value instanceof Function),
  z.array(bundlerConfig),
  bundlerConfig
])

/** A config's value as `rspack dev` takes it: a function's result, a list's first. */
export async function servedConfig(value: z.output<typeof configExport>): Promise<BundlerConfig> {
  if (value instanceof Function) {
    const env: ServeEnv = { RSPACK_SERVE: true }

    return servedConfig(configExport.parse(await value(env, { mode: "development", env })))
  }

  if (!Array.isArray(value)) {
    return value
  }

  const [first] = value

  if (!first) {
    throw new TypeError("its config is an empty list")
  }

  return first
}

/** The config the project's dev script names with `--config` or `-c`, as an absolute path. */
async function scriptedConfig(root: string): Promise<string | undefined> {
  const file = join(root, "package.json")
  const text = await readFile(file, "utf8").catch(() => undefined)
  const script = text === undefined ? undefined : scriptRunning(parseManifest(text, file).scripts, rspackServe)
  const named = script && commandOption(script[1], ["-c", "--config"])

  return named ? resolve(root, named) : undefined
}
