import { existsSync, realpathSync } from "node:fs"
import { dirname, join, posix, relative } from "node:path"
import ts from "typescript"

/** One tsconfig or jsconfig, as TypeScript reads it: its `extends` chain applied and its `include` globs expanded. */
export interface TsconfigFile {
  /** The config file, relative to the project root. */
  path: string
  /** Every file it includes, absolute, with forward slashes. */
  files: string[]
  options: ts.CompilerOptions
}

/** A project's TypeScript configs, and the one that builds the app's own source. */
export interface ProjectTsconfig {
  /** The root config and every config it references, in the order TypeScript would build them. */
  configs: TsconfigFile[]
  /** The config the app's components are built with: the first that sets `jsx`, else the first with files. */
  app?: TsconfigFile
  /**
   * Every config file read, relative to the project root: the configs, and each one's `extends` chain, including a base
   * from an installed package such as `@tsconfig/strictest`. A change to any of them can change what the configs say.
   */
  read: string[]
}

/**
 * Reads a project's tsconfig (or jsconfig) the way TypeScript does, with its own parser: `extends` chains, project
 * references (a Vite app's `tsconfig.json` is often `"files": []` with references to `tsconfig.app.json` and
 * `tsconfig.node.json`) and every `paths` entry. Parity uses its own TypeScript, so a project on a newer one still reads.
 */
export function readTsconfig(root: string): ProjectTsconfig {
  const start = ["tsconfig.json", "jsconfig.json"].map((name) => join(root, name)).find((path) => existsSync(path))
  const configs: TsconfigFile[] = []
  const seen = new Set<string>()
  const read = new Set<string>()
  // TypeScript resolves a package's base to its real path (`/private/tmp` on macOS, long names on Windows), so each
  // file read is made relative to the root's real path too.
  const realRoot = realPath(root)
  const readFile = (path: string) => read.add(slashes(relative(realRoot, realPath(path))))
  const visit = (path: string) => {
    const key = slashes(path)
    if (seen.has(key) || !existsSync(path)) return
    seen.add(key)
    const parsed = ts.getParsedCommandLineOfConfigFile(path, {}, host)
    if (!parsed) return
    readFile(path)
    for (const base of extendedFiles(parsed.options)) readFile(base)
    configs.push({
      path: slashes(relative(root, path)),
      files: parsed.fileNames.map(slashes),
      // A config that only lists references still carries settings its references don't, such as shared `paths`.
      options: parsed.options
    })
    for (const reference of parsed.projectReferences ?? []) visit(ts.resolveProjectReferencePath(reference))
  }
  if (start) visit(start)
  const withFiles = configs.filter((config) => config.files.length > 0)
  const app = withFiles.find((config) => config.options.jsx !== undefined) ?? withFiles[0]
  return { configs, ...(app ? { app } : {}), read: [...read] }
}

/**
 * Maps an import alias such as `@/components/ui` to a folder relative to the root, through the configs' `paths`. The
 * app's config is asked first, then the others.
 */
export function resolvePathAlias(root: string, tsconfig: ProjectTsconfig, alias: string): string | undefined {
  for (const { pattern, target, base } of pathMappings(root, tsconfig)) {
    const prefix = pattern.replace(/\*$/, "")
    const matches = pattern.endsWith("*") ? alias.startsWith(prefix) : alias === pattern
    if (!matches) continue
    const resolved = join(base, target.replace(/\*$/, "") + (pattern.endsWith("*") ? alias.slice(prefix.length) : ""))
    return posix.normalize(slashes(relative(root, resolved)))
  }
  return undefined
}

/**
 * How the app's code imports one of its files through the tsconfig `paths`, the way its developers would write it:
 * `src/components/ui/button.tsx` is `@/components/ui/button` when `@/*` maps to `./src/*`. The alias reaching furthest
 * into the file's folders wins; unset when none reaches it.
 */
export function importAlias(root: string, tsconfig: ProjectTsconfig, path: string): string | undefined {
  const module = slashes(path)
    .replace(/\.[cm]?[jt]sx?$/, "")
    .replace(/\/index$/, "")
  let best: { alias: string; depth: number } | undefined
  for (const { pattern, target, base } of pathMappings(root, tsconfig)) {
    const folder = posix.normalize(slashes(relative(root, join(base, target.replace(/\*$/, "")))))
    if (!pattern.endsWith("*")) {
      if (folder.replace(/\.[cm]?[jt]sx?$/, "").replace(/\/index$/, "") === module) return pattern
      continue
    }
    const prefix = folder === "." ? "" : `${folder}/`
    if (!module.startsWith(prefix) || (best && best.depth >= prefix.length)) continue
    best = { alias: pattern.slice(0, -1) + module.slice(prefix.length), depth: prefix.length }
  }
  return best?.alias
}

/** Every `paths` entry, the app's config first, then the others, since a solution-style root often holds shared ones. */
function pathMappings(root: string, tsconfig: ProjectTsconfig): { pattern: string; target: string; base: string }[] {
  const ordered = [
    ...(tsconfig.app ? [tsconfig.app] : []),
    ...tsconfig.configs.filter((config) => config !== tsconfig.app)
  ]
  return ordered.flatMap((config) => {
    // Without `baseUrl`, paths are relative to the config that declares them, which TypeScript records for us.
    const base =
      config.options.baseUrl ??
      (config.options as { pathsBasePath?: string }).pathsBasePath ??
      dirname(join(root, config.path))
    return Object.entries(config.options.paths ?? {}).flatMap(([pattern, targets]) =>
      targets[0] === undefined ? [] : [{ pattern, target: targets[0], base }]
    )
  })
}

/** A path with its links and short names resolved, or as it is when it can't be. */
function realPath(path: string): string {
  try {
    return realpathSync.native(path)
  } catch {
    return path
  }
}

/**
 * The configs a parsed config's `extends` chain read, absolute. TypeScript keeps them on the config's own source file,
 * which `CompilerOptions` types only by its index signature.
 */
function extendedFiles(options: ts.CompilerOptions): string[] {
  const file = options.configFile
  if (typeof file !== "object" || file === null || Array.isArray(file) || !("extendedSourceFiles" in file)) return []
  const extended: unknown = file.extendedSourceFiles
  return Array.isArray(extended) ? extended.filter((path) => typeof path === "string") : []
}

const host: ts.ParseConfigFileHost = {
  ...ts.sys,
  // A broken config is reported where it's used; reading the others goes on.
  onUnRecoverableConfigFileDiagnostic: () => undefined
}

function slashes(path: string): string {
  return path.replaceAll("\\", "/")
}
