import { type ProjectTsconfig, rootConfigNames } from "./tsconfig.ts"

/**
 * The files a project's configuration is read from, relative to the root, with `../` for one outside it: what a type
 * checker built for the project depends on besides the app's own files.
 */
export interface ConfigInputs {
  /**
   * Every tsconfig the config reader read (references and `extends` bases included), the root configs it looks for
   * even when they're missing, so one added or restored counts as a change, and package.json.
   */
  configs: string[]
  /** The lockfiles, which pin what installed packages declare: a change to one is a change to the dependencies. */
  lockfiles: string[]
}

/** How each config input stood when it was last read, by path: a stamp of its contents, or that it was missing. */
export interface ConfigStamps {
  configs: Record<string, string>
  lockfiles: Record<string, string>
}

/**
 * What a change to the config inputs makes stale: `config` when a tsconfig or package.json changed, so compiler options
 * are read again; `dependencies` when a lockfile changed, so installed packages' declarations are read again too.
 */
export type ConfigChange = "none" | "config" | "dependencies"

/**
 * The project's config inputs: the tsconfigs as `tsconfig` read them, the root configs whether or not they're there
 * (see `rootConfigNames`), package.json, and `lockfiles` (from
 * `findLockfiles` in `@parity-app/project`). The detection fingerprint hashes these, and the type checker watches them.
 */
export function configInputs(tsconfig: ProjectTsconfig, lockfiles: readonly string[]): ConfigInputs {
  const configs = new Set([...tsconfig.read, ...rootConfigNames, "package.json"])
  return { configs: [...configs].sort(), lockfiles: [...lockfiles].sort() }
}

/**
 * What changed between two readings of the config inputs. An input added, removed or changed counts, so a lockfile
 * appearing (a switch of package manager) or a base config dropped from an `extends` chain is a change too.
 */
export function configChange(before: ConfigStamps, after: ConfigStamps): ConfigChange {
  if (!sameStamps(before.lockfiles, after.lockfiles)) return "dependencies"
  if (!sameStamps(before.configs, after.configs)) return "config"
  return "none"
}

function sameStamps(a: Record<string, string>, b: Record<string, string>): boolean {
  const keys = Object.keys(a)
  return keys.length === Object.keys(b).length && keys.every((key) => key in b && a[key] === b[key])
}
