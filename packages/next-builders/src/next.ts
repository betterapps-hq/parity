import { readdir, readFile, realpath, stat } from "node:fs/promises"
import { createRequire } from "node:module"
import { dirname, join, relative, resolve } from "node:path"
import { readTsconfig } from "@parity-app/code"
import { parseManifest } from "@parity-app/core"
import { type NextBundler, nextBundler, nextDevScript } from "./bundler.ts"

/** The project's own Next: its folder, with forward slashes, its version, and a `require` from its package. */
export interface ProjectNext {
  folder: string
  version: string
  require: NodeJS.Require
}

/** The names Next looks for its config by, in its order, as Next.js 16 has them (`CONFIG_FILES` in `next/constants`). */
export const nextConfigFiles = ["next.config.js", "next.config.mjs", "next.config.ts", "next.config.mts"] as const

/**
 * The project's own Next, from `node_modules` in its folder or one above, the way Node finds packages. Not through
 * `require.resolve`, which also looks in `NODE_PATH`: package manager scripts set it, and it would find another copy.
 */
export async function loadProjectNext(root: string): Promise<ProjectNext | undefined> {
  for (let candidate = resolve(root); ; candidate = dirname(candidate)) {
    const manifest = join(candidate, "node_modules", "next", "package.json")

    if (await isFile(manifest)) {
      const real = await realpath(manifest)
      const { version } = parseManifest(await readFile(real, "utf8"), real)

      return { folder: dirname(real).replaceAll("\\", "/"), version: version ?? "0.0.0", require: createRequire(real) }
    }

    if (dirname(candidate) === candidate) {
      return undefined
    }
  }
}

/** The project's Next config file, as Next looks for it, by its name; none when it has none, which Next allows. */
export async function nextConfigFile(root: string, next?: ProjectNext): Promise<string | undefined> {
  let names: readonly string[] = nextConfigFiles

  try {
    // SAFETY: Next's constants module exports its config file names as a list of strings.
    const constants = next?.require("./dist/shared/lib/constants.js") as { CONFIG_FILES?: string[] } | undefined
    names = constants?.CONFIG_FILES ?? names
  } catch {
    // An older or newer Next without that module: the names Next.js 16 uses.
  }

  const present = new Set(await readdir(root).catch(() => []))

  return names.find((name) => present.has(name))
}

/** What a Next.js builder found in a project: its Next, the bundler its dev script runs, and its config file. */
export interface NextProject {
  next: ProjectNext
  bundler: NextBundler
  /** The script that runs `next dev`, by its name, when there is one. */
  script?: string
  config?: string
}

/** The project's Next and the bundler its dev server runs with, or why there's none. */
export async function detectNext(root: string): Promise<NextProject | { missing: string }> {
  const next = await loadProjectNext(root)

  if (!next) {
    return { missing: "No Next.js installed" }
  }

  const file = join(root, "package.json")
  const text = await readFile(file, "utf8").catch(() => undefined)
  const script = text === undefined ? undefined : nextDevScript(parseManifest(text, file).scripts)
  const config = await nextConfigFile(root, next)
  const found: NextProject = { next, bundler: nextBundler(script?.[1], next.version) }

  if (script) {
    found.script = script[0]
  }

  if (config) {
    found.config = config
  }

  return found
}

/** The project's PostCSS config, which Next reads from the project's folder, by its name. */
export async function postcssConfigFile(root: string): Promise<string | undefined> {
  const present = new Set(await readdir(root).catch(() => []))

  return [
    "postcss.config.js",
    "postcss.config.cjs",
    "postcss.config.mjs",
    "postcss.config.ts",
    "postcss.config.mts"
  ].find((name) => present.has(name))
}

/** The project's `tsconfig.json` or `jsconfig.json`, by its name. */
export async function projectTsconfigFile(root: string): Promise<string | undefined> {
  const present = new Set(await readdir(root).catch(() => []))

  return ["tsconfig.json", "jsconfig.json"].find((name) => present.has(name))
}

/**
 * The folder, relative to `root`, the project's `paths` resolve from when its tsconfig gives no `baseUrl`, its own or
 * inherited: that of the config that declares them, or the root's. Nothing when it gives one.
 */
export function tsconfigPathsBase(root: string, tsconfig: string): string | undefined {
  const config = readTsconfig(root).configs.find((read) => read.path === tsconfig)

  if (config?.options.baseUrl !== undefined) {
    return undefined
  }

  // SAFETY: TypeScript's config parser sets `pathsBasePath`, an internal option, to the folder of the config with `paths`.
  const base = (config?.options as { pathsBasePath?: string } | undefined)?.pathsBasePath

  return base ? relative(root, base).replaceAll("\\", "/") : ""
}

async function isFile(path: string): Promise<boolean> {
  return stat(path).then(
    (stats) => stats.isFile(),
    () => false
  )
}
