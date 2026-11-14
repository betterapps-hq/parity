import { existsSync } from "node:fs"
import { readdir, readFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { dirname, join, resolve } from "node:path"
import {
  applyLibraryEdits,
  fileObject,
  type LibraryEdits,
  type LibraryManifest,
  libraryManifestExtension,
  libraryManifest,
  libraryPackage,
  parseData,
  parseLibraryEdits
} from "@parity-app/core"
import { isText } from "@parity-app/core/values/evaluate"
import semver from "semver"
import { z } from "zod"
import { parseJsonc } from "./jsonc.ts"

export { parseJsonc } from "./jsonc.ts"

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

/** A library file in the registry, which names the package it describes, since that's how it's found. */
const registryManifest = fileObject({
  ...libraryManifest.shape,
  package: z
    .unknown()
    .refine((value) => value !== undefined, "a registry file names the package it describes")
    .pipe(libraryPackage)
})

/**
 * The folder the registry's files are in. The published CLI bundles this module and ships the files beside it, where
 * the package can't be resolved. Otherwise they're found through the package's own `package.json`, so it's the same
 * whether this module runs from source or bundled into the app.
 */
export function registryDir(): string {
  const bundled = join(import.meta.dirname, "libraries")

  if (existsSync(bundled)) {
    return bundled
  }

  return join(dirname(require.resolve("@parity-app/registry/package.json")), "libraries")
}

let cache: Promise<RegistryEntry[]> | undefined

/** The file the app's build writes beside the registry's files, naming the package each describes (PAR-1085). */
export const registryIndexFile = "index.json"

const registryIndex = z.array(fileObject({ file: z.string(), package: libraryPackage }))

/** Each registry file and the package it describes, so the file for a package is found without parsing the others. */
export type RegistryIndex = z.infer<typeof registryIndex>

/** The index of the registry at `dir`, from its files, for the app's build to write as `registryIndexFile`. */
export async function buildRegistryIndex(dir = registryDir()): Promise<RegistryIndex> {
  return (await readEntries(dir)).map(({ file, manifest }) => ({ file, package: manifest.package! }))
}

let indexCache: Promise<RegistryIndex | undefined> | undefined
const entryCache = new Map<string, Promise<RegistryEntry | undefined>>()

/** Every file in the registry, read once. One that doesn't parse is skipped with a warning. */
export function registryEntries(dir = registryDir()): Promise<RegistryEntry[]> {
  if (dir !== registryDir()) {
    return readEntries(dir)
  }

  cache ??= readEntries(dir)

  return cache
}

async function readEntries(dir: string): Promise<RegistryEntry[]> {
  const files = (await readdir(dir).catch((): string[] => []))
    .filter((file) => file.endsWith(libraryManifestExtension))
    .sort()

  const entries: RegistryEntry[] = []

  for (const file of files) {
    const entry = await readEntry(dir, file)

    if (entry) {
      entries.push(entry)
    }
  }

  return entries
}

/** One registry file, or nothing, with a warning, when it doesn't parse. */
async function readEntry(dir: string, file: string): Promise<RegistryEntry | undefined> {
  const path = join(dir, file)

  try {
    const { $schema: _schema, ...manifest } = parseData(registryManifest, JSON.parse(await readFile(path, "utf8")))

    return { file, path, manifest }
  } catch (error) {
    console.warn(`Skipping registry file ${file}: ${errorText(error)}`)

    return undefined
  }
}

/** The registry's index at `dir`, or nothing when there's none or it can't be read, as in a development checkout. */
async function readIndex(dir: string): Promise<RegistryIndex | undefined> {
  try {
    return parseData(registryIndex, JSON.parse(await readFile(join(dir, registryIndexFile), "utf8")))
  } catch {
    return undefined
  }
}

/**
 * The registry's files for a package. With an index, only those files are parsed: the registry is tens of megabytes,
 * most of it libraries a project doesn't use, and a project's every dependency is looked up as it opens (PAR-1085).
 * Without one, every file is read, as `registryEntries` does.
 */
async function entriesFor(packageName: string, dir = registryDir()): Promise<RegistryEntry[]> {
  const shared = dir === registryDir()
  const index = await (shared ? (indexCache ??= readIndex(dir)) : readIndex(dir))

  if (!index) {
    return (await registryEntries(dir)).filter((entry) => entry.manifest.package?.name === packageName)
  }

  const files = index.filter((entry) => entry.package.name === packageName).map((entry) => entry.file)

  const read = (file: string) => {
    if (!shared) {
      return readEntry(dir, file)
    }

    const path = join(dir, file)
    const kept = entryCache.get(path) ?? readEntry(dir, file)
    entryCache.set(path, kept)

    return kept
  }

  return (await Promise.all(files.map(read))).filter((entry) => entry !== undefined)
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
  const candidates = await entriesFor(packageName, dir)
  const covering = candidates.filter((entry) => covers(entry.manifest, version))
  const best = covering.sort((a, b) => compareGenerated(b.manifest, a.manifest))[0]

  if (best || !version) {
    return best
  }

  const installed = semver.coerce(version, { includePrerelease: true })

  const older = candidates
    .filter((entry) => {
      const generated = semver.coerce(entry.manifest.package?.version)

      return installed && generated && semver.gt(installed, generated)
    })
    .sort((a, b) => compareGenerated(b.manifest, a.manifest))[0]

  return older && { ...older, older: true }
}

/**
 * The newest file for each package the registry describes, by the version it was made from, with its hand edits
 * applied. A file whose edits can't be read is used as it is, with a warning.
 */
export async function newestEntries(dir?: string): Promise<RegistryEntry[]> {
  const newest = new Map<string, RegistryEntry>()

  for (const entry of await registryEntries(dir)) {
    const name = entry.manifest.package!.name
    const current = newest.get(name)

    if (!current || compareGenerated(entry.manifest, current.manifest) > 0) {
      newest.set(name, entry)
    }
  }

  return Promise.all(
    [...newest.values()].map(async (entry) => {
      try {
        return { ...entry, manifest: (await withEdits(entry.path, entry.manifest)).manifest }
      } catch (error) {
        console.warn(`Using registry file ${entry.file} without its edits: ${errorText(error)}`)

        return entry
      }
    })
  )
}

/**
 * A library file at `path` with its hand edits applied: its own `edits`, or the shared file it names beside it. Edits
 * for exports it doesn't have are its `orphans`, reported rather than dropped silently. Throws when the edits can't be
 * read.
 */
export async function withEdits(
  path: string,
  manifest: LibraryManifest
): Promise<{ manifest: LibraryManifest; orphans: string[] }> {
  if (manifest.edits === undefined) {
    return { manifest, orphans: [] }
  }

  return applyLibraryEdits(manifest, await readLibraryEdits(manifest.edits, dirname(path)))
}

/**
 * Hand edits as a library file writes them: inline, or the path of a shared file, which is read from `from` and may
 * have comments.
 */
export async function readLibraryEdits(
  edits: NonNullable<LibraryManifest["edits"]>,
  from: string
): Promise<LibraryEdits> {
  return parseLibraryEdits(isText(edits) ? parseJsonc(await readFile(resolve(from, edits), "utf8")) : edits)
}

function errorText(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

/** Whether a manifest describes this version of its package. A manifest without a range covers every version. */
export function covers(manifest: Pick<LibraryManifest, "package">, version: string | undefined): boolean {
  const range = manifest.package?.range

  if (!range) {
    return true
  }

  if (!version) {
    return false
  }

  const parsed = semver.coerce(version, { includePrerelease: true })

  return parsed !== null && semver.satisfies(parsed, range, { includePrerelease: true })
}

function compareGenerated(a: LibraryManifest, b: LibraryManifest): number {
  const left = semver.coerce(a.package?.version)
  const right = semver.coerce(b.package?.version)

  if (!left || !right) {
    if (left) {
      return 1
    }

    return right ? -1 : 0
  }

  return semver.compare(left, right)
}
