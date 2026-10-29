import { existsSync } from "node:fs"
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
  const visit = (path: string) => {
    const key = slashes(path)
    if (seen.has(key) || !existsSync(path)) return
    seen.add(key)
    const parsed = ts.getParsedCommandLineOfConfigFile(path, {}, host)
    if (!parsed) return
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
  return { configs, ...(app ? { app } : {}) }
}

/**
 * Maps an import alias such as `@/components/ui` to a folder relative to the root, through the configs' `paths`. The
 * app's config is asked first, then the others, since a solution-style root config often holds the shared ones.
 */
export function resolvePathAlias(root: string, tsconfig: ProjectTsconfig, alias: string): string | undefined {
  const ordered = [...(tsconfig.app ? [tsconfig.app] : []), ...tsconfig.configs.filter((config) => config !== tsconfig.app)]
  for (const config of ordered) {
    const { paths } = config.options
    if (!paths) continue
    // Without `baseUrl`, paths are relative to the config that declares them, which TypeScript records for us.
    const base =
      config.options.baseUrl ??
      (config.options as { pathsBasePath?: string }).pathsBasePath ??
      dirname(join(root, config.path))
    for (const [pattern, targets] of Object.entries(paths)) {
      const target = targets[0]
      if (target === undefined) continue
      const prefix = pattern.replace(/\*$/, "")
      const matches = pattern.endsWith("*") ? alias.startsWith(prefix) : alias === pattern
      if (!matches) continue
      const resolved = join(base, target.replace(/\*$/, "") + (pattern.endsWith("*") ? alias.slice(prefix.length) : ""))
      return posix.normalize(slashes(relative(root, resolved)))
    }
  }
  return undefined
}

const host: ts.ParseConfigFileHost = {
  ...ts.sys,
  // A broken config is reported where it's used; reading the others goes on.
  onUnRecoverableConfigFileDiagnostic: () => undefined
}

function slashes(path: string): string {
  return path.replaceAll("\\", "/")
}
