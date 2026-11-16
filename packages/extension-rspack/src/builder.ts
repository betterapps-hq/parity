import { readdir, realpath } from "node:fs/promises"
import {
  type Bundler,
  type BundlerConfig,
  bundledAppStyles,
  cliConfig,
  cliConfigFiles,
  type CliConfigSource,
  importProjectPackage,
  rspackApi,
  rspackBundler,
  type RspackModule,
  startBundledGuest
} from "@parity-app/builder-webpack-compatible"
import { type AppStyles, type BuilderAdapter, type BuilderDetection, scriptConfigExtensions } from "@parity-app/core"

/** The config files Rspack's CLI looks for. */
export const rspackConfigFiles = cliConfigFiles("rspack.config")

/** Rsbuild's, whose project Rsbuild builds, though it has Rspack installed too. */
const rsbuildConfigFiles = cliConfigFiles("rsbuild.config")

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

/** How Rspack's CLI finds its config for `rspack dev`. */
const rspackCli: CliConfigSource = { file: "rspack.config", serve: rspackServe, env: { RSPACK_SERVE: true } }

/** The project's Rspack config for `rspack dev`, and its file from the root, as Rspack's CLI finds and runs it. */
export function rspackConfig(root: string): Promise<{ config: BundlerConfig; file: string } | undefined> {
  return cliConfig(root, rspackCli)
}
