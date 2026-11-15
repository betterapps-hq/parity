import { readFile } from "node:fs/promises"
import { basename, dirname, extname, join, resolve } from "node:path"
import { parseManifest, scriptConfigExtensions } from "@parity-app/core"
import { commandOption, findConfig, loadConfig, scriptRunning } from "@parity-app/project"
import { z } from "zod"
import { type BundlerConfig, bundlerConfig } from "./bundler.ts"

/*
 * A project's config as its tool's CLI loads it for its dev server: `webpack serve` and `rspack dev` find, run and call
 * their config files the same way, apart from the file's name and the flag they pass a function.
 */

/** How a tool's CLI finds its config for its dev server. */
export interface CliConfigSource {
  /** The config file's name, without its extension: `webpack.config`. */
  file: string
  /** Matches a script that runs the tool's dev server, whose `--config` or `-c` names the config. */
  serve: RegExp
  /** What the CLI passes a config that exports a function, as `env`: `{ WEBPACK_SERVE: true }`. */
  env: Readonly<Record<string, true>>
}

/** What the CLI passes a config that exports a function, for its dev server. */
export interface ServeArgv {
  mode: "development"
  env: Readonly<Record<string, true>>
}

/** The config files a CLI looks for, by its config's name. */
export function cliConfigFiles(file: string): string[] {
  return scriptConfigExtensions.map((extension) => `${file}.${extension}`)
}

/**
 * The project's config for its tool's dev server, and its file from the root: the one its dev script names with
 * `--config` or `-c`, else the config file in its folder. A config that exports a function is called as the CLI calls
 * it for its dev server; one that exports a list gives its first. Loading it runs it, as the CLI does.
 */
export async function cliConfig(
  root: string,
  source: CliConfigSource
): Promise<{ config: BundlerConfig; file: string } | undefined> {
  const named = await scriptedConfig(root, source.serve)
  const folder = named ? dirname(named) : root
  const files = named ? [basename(named, extname(named))] : [source.file]
  const found = { files, extensions: [...scriptConfigExtensions], here: true }

  if (!(await findConfig(root, folder, found))) {
    return undefined
  }

  const loaded = await loadConfig(root, folder, found, z.unknown())

  if (!loaded) {
    return undefined
  }

  // A config file may export a promise of its config, which the CLI waits for.
  return { config: await servedConfig(configExport.parse(await loaded.value), source.env), file: loaded.path }
}

/** What a config file exports: a config, a list of them, or a function that gives one. */
const configExport = z.union([
  // oxlint-disable-next-line anti-slop/no-unknown-returns -- what the function gives is parsed by this schema in turn
  z.custom<(env: Readonly<Record<string, true>>, argv: ServeArgv) => unknown>((value) => value instanceof Function),
  z.array(bundlerConfig),
  bundlerConfig
])

/** A config's value as the CLI's dev server takes it: a function's result, called with `env`, or a list's first. */
export async function servedConfig(
  value: z.output<typeof configExport>,
  env: Readonly<Record<string, true>>
): Promise<BundlerConfig> {
  if (value instanceof Function) {
    return servedConfig(configExport.parse(await value(env, { mode: "development", env })), env)
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
async function scriptedConfig(root: string, serve: RegExp): Promise<string | undefined> {
  const file = join(root, "package.json")
  const text = await readFile(file, "utf8").catch(() => undefined)
  const script = text === undefined ? undefined : scriptRunning(parseManifest(text, file).scripts, serve)
  const named = script && commandOption(script[1], ["-c", "--config"])

  return named ? resolve(root, named) : undefined
}
