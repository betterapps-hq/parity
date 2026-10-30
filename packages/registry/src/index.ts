import { existsSync } from "node:fs"
import { readdir, readFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { type LibraryManifest, libraryManifestExtension, parseLibraryManifest } from "@parity-app/core"
import semver from "semver"

/**
 * A `.lib.par` Parity keeps for a package that doesn't ship one, the way DefinitelyTyped keeps types. Each file names
 * the package it describes and the versions it covers.
 */
export interface RegistryEntry {
  /** The file's name, as in `mui.lib.par`. */
  file: string
  /** Its absolute path. */
  path: string
  manifest: LibraryManifest
  /**
   * Set when no file covers the installed version and this is the newest one made for an older version, which is
   * used rather than none: its components may have gone, and newer ones aren't listed.
   */
  older?: true
}

const require = createRequire(import.meta.url)

/**
 * The folder the registry's files are in. The published CLI bundles this module and ships the files beside it, where
 * the package can't be resolved. Otherwise they're found through the package's own `package.json`, so it's the same
 * whether this module runs from source or bundled into the app.
 */
export function registryDir(): string {
  const bundled = join(import.meta.dirname, "libraries")
  if (existsSync(bundled)) return bundled
  return join(dirname(require.resolve("@parity-app/registry/package.json")), "libraries")
}

let cache: Promise<RegistryEntry[]> | undefined

/** Every file in the registry, read once. One that doesn't parse is skipped with a warning. */
export function registryEntries(dir = registryDir()): Promise<RegistryEntry[]> {
  if (dir !== registryDir()) return readEntries(dir)
  cache ??= readEntries(dir)
  return cache
}

async function readEntries(dir: string): Promise<RegistryEntry[]> {
  const files = (await readdir(dir).catch(() => [] as string[]))
    .filter((file) => file.endsWith(libraryManifestExtension))
    .sort()
  const entries: RegistryEntry[] = []
  for (const file of files) {
    const path = join(dir, file)
    try {
      const manifest = parseLibraryManifest(JSON.parse(await readFile(path, "utf8")))
      if (!manifest.package) throw new TypeError("/package: a registry file names the package it describes")
      entries.push({ file, path, manifest })
    } catch (error) {
      console.warn(`Skipping registry file ${file}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  return entries
}

/**
 * The registry's file for a package at a version: the one whose range covers the version, preferring the newest
 * generated. When none covers it, the newest file made for an older version, marked `older`, so a library newer
 * than its file keeps its decorators, tokens and components rather than losing them. A version older than every file,
 * or no version at all, matches nothing.
 */
export async function registryEntryFor(
  packageName: string,
  version: string | undefined,
  dir?: string
): Promise<RegistryEntry | undefined> {
  const candidates = (await registryEntries(dir)).filter((entry) => entry.manifest.package?.name === packageName)
  const covering = candidates.filter((entry) => covers(entry.manifest, version))
  const best = covering.sort((a, b) => compareGenerated(b.manifest, a.manifest))[0]
  if (best || !version) return best
  const installed = semver.coerce(version, { includePrerelease: true })
  const older = candidates
    .filter((entry) => {
      const generated = semver.coerce(entry.manifest.package?.version)
      return installed && generated && semver.gt(installed, generated)
    })
    .sort((a, b) => compareGenerated(b.manifest, a.manifest))[0]
  return older && { ...older, older: true }
}

/** Whether a manifest describes this version of its package. A manifest without a range covers every version. */
export function covers(manifest: LibraryManifest, version: string | undefined): boolean {
  const range = manifest.package?.range
  if (!range) return true
  if (!version) return false
  const parsed = semver.coerce(version, { includePrerelease: true })
  return parsed !== null && semver.satisfies(parsed, range, { includePrerelease: true })
}

function compareGenerated(a: LibraryManifest, b: LibraryManifest): number {
  const left = semver.coerce(a.package?.version)
  const right = semver.coerce(b.package?.version)
  if (!left || !right) {
    if (left) return 1
    return right ? -1 : 0
  }
  return semver.compare(left, right)
}
