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
  /** The file's name, as in `@mui+material.lib.par` (see `registryFileName`). */
  file: string
  /** Its absolute path. */
  path: string
  manifest: LibraryManifest
  /**
   * Set when no file covers the installed version and this is the newest one made for an older version, which is
   * used rather than none: its components may have gone, and newer ones aren't listed.
   */
  older?: true
  /**
   * Set when no file covers the installed version and every file was made for a newer one, so this, the oldest of them,
   * is used rather than none: it may list components the installed version doesn't have yet, and miss ones it has.
   */
  newer?: true
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
let listing: Promise<string[]> | undefined
const entryCache = new Map<string, Promise<RegistryEntry | undefined>>()

/**
 * The name of a package's registry file: its npm name with `+` for the `/` after its scope, which no package name has,
 * as in `@mui+material.lib.par`. Another file for an older major version adds it, as in `@mui+material@7.lib.par`.
 * Named for their packages, the files for a project's packages are found without opening the rest (PAR-1086).
 */
export function registryFileName(packageName: string, major?: number): string {
  return `${packageName.replace("/", "+")}${major === undefined ? "" : `@${major}`}${libraryManifestExtension}`
}

/**
 * The name the registry describes a package by: its own, or for a Buildkit shadcn kit, retired for shadcn-sync, the
 * style sync builds, so `@buildkitgg/shadcn-baseui-nova` is read with `shadcn-base-nova.lib.par`.
 */
export function registryName(packageName: string): string {
  const kit = /^@buildkitgg\/shadcn-baseui-([a-z]+)$/.exec(packageName)

  return kit ? `shadcn-base-${kit[1]}` : packageName
}

/** The package a registry file is named for, or nothing for a file that isn't a library's. */
export function registryFilePackage(file: string): string | undefined {
  if (!file.endsWith(libraryManifestExtension)) {
    return undefined
  }

  return file.slice(0, -libraryManifestExtension.length).replace(/@\d+$/, "").replace("+", "/")
}

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

/**
 * The registry's files for a package, found by their names, so only those are opened: the registry is tens of
 * megabytes, most of it libraries a project doesn't use, and each of a project's dependencies is looked up as it opens
 * (PAR-1086). A file that turns out to describe another package is left out. A retired kit's files are its style's.
 */
async function entriesFor(given: string, dir = registryDir()): Promise<RegistryEntry[]> {
  const packageName = registryName(given)
  const shared = dir === registryDir()
  const list = () => readdir(dir).catch((): string[] => [])

  const files = (await (shared ? (listing ??= list()) : list()))
    .filter((file) => registryFilePackage(file) === packageName)
    .sort()

  const read = (file: string) => {
    if (!shared) {
      return readEntry(dir, file)
    }

    const path = join(dir, file)
    const kept = entryCache.get(path) ?? readEntry(dir, file)
    entryCache.set(path, kept)

    return kept
  }

  return (await Promise.all(files.map(read))).filter(
    (entry): entry is RegistryEntry => entry?.manifest.package?.name === packageName
  )
}

/**
 * The registry's file for a package at a version: the one whose range covers the version, preferring the newest
 * generated. When none covers it, the newest file made for an older version, marked `older`, so a library newer
 * than its file keeps its decorators, tokens and components rather than losing them. A version older than every file
 * takes the oldest of them, marked `newer`, for the same reason: MUI 7 still gets the providers MUI 9's file wraps
 * frames in (PAR-1168). No version at all matches nothing.
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

  if (older) {
    return { ...older, older: true }
  }

  const newer = candidates
    .filter((entry) => {
      const generated = semver.coerce(entry.manifest.package?.version)

      return installed && generated && semver.lt(installed, generated)
    })
    .sort((a, b) => compareGenerated(a.manifest, b.manifest))[0]

  return newer && { ...newer, newer: true }
}

/**
 * The registry's newest file for a package, by the version it was made from, whatever version is installed: for a
 * package that stands in for one the registry describes, such as the components shadcn-sync generates in a style.
 */
export async function newestEntryFor(packageName: string, dir?: string): Promise<RegistryEntry | undefined> {
  return (await entriesFor(packageName, dir)).sort((a, b) => compareGenerated(b.manifest, a.manifest))[0]
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

const tokenName = z.string().min(1).max(200)
const link = z.url({ protocol: /^https?$/ })
const hex = z.string().regex(/^#[\da-f]{6}$/i)

/** A library the Components panel offers, with what its registry file doesn't say. */
const catalogEntry = z.strictObject({
  /** Its id in the registry, or in the catalog of the extension that sets it up. */
  id: z.string().min(1),
  /**
   * The package whose registry file shows it before it's added, when that isn't its own, with each `{setting}` filled
   * from its settings, as `shadcn-base-{style}`.
   */
  preview: z.string().min(1).optional(),
  logo: z
    .strictObject({
      viewBox: z.string().min(1),
      path: z.string().min(1),
      fillRule: z.enum(["nonzero", "evenodd"]).optional(),
      color: z.strictObject({ light: hex, dark: hex }).optional()
    })
    .optional(),
  links: z.strictObject({
    website: link.optional(),
    docs: link.optional(),
    storybook: link.optional(),
    source: link.optional()
  }),
  /** Which of its tokens plays each part in the look the panel draws it with. */
  look: z.strictObject({
    primary: tokenName,
    onPrimary: tokenName,
    surface: tokenName,
    text: tokenName,
    muted: tokenName,
    border: tokenName,
    radius: tokenName,
    font: tokenName.optional(),
    shadow: tokenName.optional()
  }),
  /** The registry id of an icon set offered alongside it, as Fluent icons beside Fluent UI. */
  companion: z.string().min(1).optional()
})

export type CatalogEntry = z.infer<typeof catalogEntry>

let catalog: Promise<CatalogEntry[]> | undefined

/**
 * The component libraries the Components panel offers, in the order it lists them, from the registry's
 * `catalog.json`: each one's pages, logo and look, which its registry file doesn't hold. Read once.
 */
export function registryCatalog(dir = registryDir()): Promise<CatalogEntry[]> {
  const read = async () =>
    z
      .strictObject({ $comment: z.string().optional(), libraries: z.array(catalogEntry) })
      .parse(JSON.parse(await readFile(join(dir, "catalog.json"), "utf8"))).libraries

  if (dir !== registryDir()) {
    return read()
  }

  catalog ??= read()

  return catalog
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
