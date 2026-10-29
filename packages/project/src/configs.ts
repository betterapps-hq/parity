import { readFile } from "node:fs/promises"
import { dirname, relative, resolve } from "node:path"
import { createConfigLoader, type LoadConfigSource } from "unconfig"
import { parseJsonc } from "./jsonc.ts"

/**
 * Where a tool keeps its config, as data: the names it looks for, in its order. `unconfig` does the searching, so every
 * extension, folder and rc file counts without Parity listing file names.
 */
export interface ConfigSource {
  /** Base names, without an extension: `main`, `components`, `.prettierrc`. */
  files: string[]
  /** The extensions the tool accepts; `unconfig`'s set (`ts`, `mts`, `cts`, `js`, `mjs`, `cjs`, `json`, none) if unset. */
  extensions?: string[]
  /** A package.json key that holds the config instead, read when no file is found. */
  packageKey?: string
  /** Only look in the folder itself. Otherwise the search goes up, folder by folder, to the filesystem's root. */
  here?: boolean
  /** A JSON-only config that may have comments, as shadcn's and TypeScript's do. */
  jsonc?: boolean
}

/** A config that was found, with its path relative to the project root, which detection shows as evidence. */
export interface FoundConfig<T = unknown> {
  path: string
  value: T
}

/**
 * Where a config is, without running it: the first match, relative to the project root. A package.json only counts when
 * it has the key, which takes reading it.
 */
export async function findConfig(root: string, folder: string, source: ConfigSource): Promise<string | undefined> {
  const [found] = await loader(folder, { ...source, packageKey: undefined }).findConfigs()
  if (found !== undefined) return toPosix(relative(root, found))
  return source.packageKey ? (await loadConfig(root, folder, source))?.path : undefined
}

/**
 * A config's value. A JavaScript or TypeScript config runs, as the tool itself would run it, through `jiti`. A config
 * that fails to load throws, with its path in the message.
 */
export async function loadConfig<T>(
  root: string,
  folder: string,
  source: ConfigSource
): Promise<FoundConfig<T> | undefined> {
  let result: { config: unknown; sources: string[] }
  try {
    result = await loader(folder, source).load()
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`Couldn't load ${source.files.join(" or ")}: ${reason}`, { cause: error })
  }
  const [path] = result.sources
  return path === undefined ? undefined : { path: toPosix(relative(root, path)), value: result.config as T }
}

function loader(folder: string, source: ConfigSource) {
  const cwd = resolve(folder)
  const sources: LoadConfigSource[] = [
    {
      files: source.files,
      ...(source.extensions ? { extensions: source.extensions } : {}),
      ...(source.jsonc
        ? {
            parser: async (path: string) =>
              path.endsWith(".json") ? parseJsonc(await readFile(path, "utf8")) : undefined
          }
        : {})
    }
  ]
  const key = source.packageKey
  if (key) {
    sources.push({
      files: ["package"],
      extensions: ["json"],
      // Only a package.json that has the key counts; the search goes on past one that doesn't.
      rewrite: (value) => (value as Record<string, unknown>)?.[key]
    })
  }
  // unconfig stops before `stopAt`, so the folder's parent keeps the search in the folder.
  return createConfigLoader({ sources, cwd, ...(source.here ? { stopAt: dirname(cwd) } : {}) })
}

function toPosix(path: string): string {
  return path.replaceAll("\\", "/")
}
