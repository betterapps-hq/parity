import { readdir, readFile, realpath } from "node:fs/promises"
import { relative, resolve } from "node:path"
import {
  type Bundler,
  type BundlerConfig,
  bundlerConfig,
  bundledAppStyles,
  importProjectPackage,
  type RspackApi,
  rspackBundler,
  startBundledGuest
} from "@parity-app/builder-webpack-compatible"
import {
  type AppStyles,
  type BuilderAdapter,
  type BuilderDetection,
  parseManifest,
  scriptConfigExtensions
} from "@parity-app/core"
import { commandOption, scriptRunning } from "@parity-app/project"
import { z } from "zod"

/** The config files Rsbuild's CLI looks for. */
export const rsbuildConfigFiles = scriptConfigExtensions.map((extension) => `rsbuild.config.${extension}`)

/** Runs Rsbuild's dev server: `rsbuild dev`, or `rsbuild` alone. */
const rsbuildServe = /(?:^|[\s;&|(])rsbuild(?![\w.-])(?!\s+(?:build|preview|inspect)\b)/

/** What the parts of Rsbuild's API this builder uses give back. */
export interface RsbuildInstance {
  initConfigs(): Promise<unknown[]>
}

/** The parts of `@rsbuild/core`'s exports the builder uses: its config loading, its instance and its Rspack. */
export interface RsbuildModule {
  version: string
  rspack: RspackApi
  loadConfig(options: { cwd: string; path?: string }): Promise<{ content: RsbuildConfig; filePath: string | null }>
  createRsbuild(options: { cwd: string; rsbuildConfig: RsbuildConfig }): Promise<RsbuildInstance>
}

/** An Rsbuild config, read only for the settings the builder changes, the rest passed on as it is. */
const rsbuildConfig = z.looseObject({
  mode: z.string().optional(),
  dev: z.looseObject({}).optional()
})

type RsbuildConfig = z.output<typeof rsbuildConfig>

/**
 * Builds a project's components with the project's own Rsbuild and config: the entry module the Rsbuild extension's
 * manifest names, which the builder process loads (PAR-1148). Rsbuild gives the Rspack config `rsbuild dev` would
 * build with, its plugins applied, and the Rspack it ships builds it as the Rspack extension's builder does.
 */
export const rsbuildBuilder: BuilderAdapter = {
  id: "rsbuild",
  name: "Rsbuild",
  watches: rsbuildConfigFiles,
  detect: ({ root }) => detectRsbuild(root),
  styles: ({ root }) => rsbuildAppStyles(root),
  async start(options) {
    const root = await realpath(options.root)
    const { bundler, config } = await projectRsbuild(root)

    return startBundledGuest({ bundler, config, start: { ...options, root } })
  }
}

/** The project's own Rsbuild: its version, and its API. */
async function rsbuildModule(root: string): Promise<{ rsbuild: RsbuildModule; version: string }> {
  const { module, version } = await importProjectPackage(root, "@rsbuild/core")
  // SAFETY: the module is the ES module entry `@rsbuild/core`'s own package.json names; its exports are checked below.
  const rsbuild = module as Partial<RsbuildModule>

  if (!rsbuild.createRsbuild || !rsbuild.loadConfig || !rsbuild.rspack?.HotModuleReplacementPlugin) {
    throw new TypeError(`@rsbuild/core ${version} doesn't export the API Parity builds with`)
  }

  // SAFETY: its functions and its Rspack are there, as checked above.
  return { rsbuild: rsbuild as RsbuildModule, version }
}

/**
 * The project's Rsbuild as a bundler, and the Rspack config `rsbuild dev` builds the browser's code with, minus its
 * dev server's hot updates (the builder adds its own), with the config file it came from, if any.
 */
export async function projectRsbuild(
  root: string
): Promise<{ bundler: Bundler; config: BundlerConfig; file: string | undefined }> {
  const { rsbuild, version } = await rsbuildModule(root)
  const named = await scriptedConfig(root)
  const loaded = await rsbuild.loadConfig(named ? { cwd: root, path: named } : { cwd: root })
  const content = rsbuildConfig.parse(loaded.content)

  const made = await withNodeEnv(async () => {
    const instance = await rsbuild.createRsbuild({
      cwd: root,
      rsbuildConfig: { ...content, mode: "development", dev: { ...content.dev, hmr: false, liveReload: false } }
    })

    return instance.initConfigs()
  })

  const environments = z.array(bundlerConfig).parse(made)
  // The browser's environment: Rsbuild names it `web` unless the project names its own.
  const config = environments.find((one) => one.name === "web") ?? environments[0]

  if (!config) {
    throw new Error(`Rsbuild ${version} gave no config to build`)
  }

  return {
    bundler: rspackBundler(rsbuild.rspack, { name: "Rsbuild", version }),
    config,
    file: loaded.filePath ? relative(root, loaded.filePath).replaceAll("\\", "/") : undefined
  }
}

/** Runs `make`, keeping `NODE_ENV` as it was: Rsbuild sets it for the mode it builds in, for the whole process. */
async function withNodeEnv<T>(make: () => Promise<T>): Promise<T> {
  const before = process.env.NODE_ENV

  try {
    return await make()
  } finally {
    if (before === undefined) {
      delete process.env.NODE_ENV
    } else {
      process.env.NODE_ENV = before
    }
  }
}

/**
 * Asks the project's own Rsbuild whether it builds the project, with its version and config file. Rsbuild needs no
 * config file, so a dev script that runs `rsbuild` says so as well as an `rsbuild.config`.
 */
export async function detectRsbuild(root: string): Promise<BuilderDetection> {
  const names = await readdir(root).catch(() => [])
  const config = names.find((name) => rsbuildConfigFiles.includes(name))
  const script = await devScript(root)

  if (!config && !script) {
    return { found: false, summary: "No rsbuild.config file and no script that runs Rsbuild" }
  }

  let version: string

  try {
    ;({ version } = await rsbuildModule(root))
  } catch {
    return {
      found: false,
      summary: `${config ? `${config} is here` : "A script runs Rsbuild"}, but Rsbuild isn't installed: install the project's packages first`
    }
  }

  const named = script && commandOption(script, ["-c", "--config"])
  const file = named ? relative(root, resolve(root, named)).replaceAll("\\", "/") : config

  if (!file) {
    return { found: true, version, summary: `Rsbuild ${version}, with no config file` }
  }

  return { found: true, version, config: file, summary: `Rsbuild ${version}, config ${file}` }
}

/** The global stylesheets the app loads, as the project's own Rsbuild builds it. */
export async function rsbuildAppStyles(root: string): Promise<AppStyles> {
  root = await realpath(root)
  const { bundler, config, file } = await projectRsbuild(root)

  return bundledAppStyles(bundler, config, root, file)
}

/** The command of the project's script that runs Rsbuild's dev server, if one does. */
async function devScript(root: string): Promise<string | undefined> {
  const file = resolve(root, "package.json")
  const text = await readFile(file, "utf8").catch(() => undefined)

  return text === undefined ? undefined : scriptRunning(parseManifest(text, file).scripts, rsbuildServe)?.[1]
}

/** The config the project's dev script names with `--config` or `-c`, as an absolute path. */
async function scriptedConfig(root: string): Promise<string | undefined> {
  const script = await devScript(root)
  const named = script && commandOption(script, ["-c", "--config"])

  return named ? resolve(root, named) : undefined
}
