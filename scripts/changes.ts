// Says which released packages a change needs a change file for, and writes or checks them. Beachball versions only the
// packages that aren't private, the desktop app and the CLI, so on its own it would miss a change to a private package
// they bundle, such as @parity-app/core. Like Beachball, it counts from where the branch left the one beachball.config.cjs
// names. Unlike it, it reads only the index or the commits, never the working tree, which sessions share. A changed entry
// in pnpm-workspace.yaml's catalog counts as Beachball's check counts it, so the two never disagree (PAR-1177).
// Usage:
//   node scripts/changes.ts write --type patch --message "…"  writes the change files that are missing (pnpm changefile)
//   node scripts/changes.ts check                             fails when one is missing from what's staged (pre-commit)
//   node scripts/changes.ts check --committed                 the same for the branch's commits (pre-push and CI)
import { execFileSync } from "node:child_process"
import { createRequire } from "node:module"
import { dirname, join, matchesGlob } from "node:path"
import { parseData, plainObject } from "@parity-app/core/schema"
import { z } from "zod"
import { print } from "./output.ts"

export interface WorkspacePackage {
  name: string
  /** Its folder from the repository root, with forward slashes. */
  dir: string
  private: boolean
  /** The workspace packages it depends on, of any kind. */
  dependencies: string[]
  /** Its dependencies of any kind whose version is `catalog:…`, by name, with that version. */
  catalogDependencies?: Record<string, string>
}

/** The catalogs pnpm-workspace.yaml declares: `catalog` (or `catalogs.default`), and the rest of `catalogs` by name. */
export interface Catalogs {
  default?: Record<string, string>
  named?: Record<string, Record<string, string>>
}

/**
 * The catalog entries added or changed since `before`, as Beachball's check diffs them. A removed entry doesn't count,
 * and with no catalogs before, every entry does.
 */
export function changedCatalogEntries(before: Catalogs | undefined, after: Catalogs | undefined): Catalogs {
  const diff = (old: Record<string, string> | undefined, now: Record<string, string>): Record<string, string> =>
    Object.fromEntries(Object.entries(now).filter(([name, version]) => old?.[name] !== version))

  const changed: Catalogs = {}
  const defaults = diff(before?.default, after?.default ?? {})

  if (Object.keys(defaults).length > 0) {
    changed.default = defaults
  }

  for (const [catalog, entries] of Object.entries(after?.named ?? {})) {
    const named = diff(before?.named?.[catalog], entries)

    if (Object.keys(named).length > 0) {
      changed.named = { ...changed.named, [catalog]: named }
    }
  }

  return changed
}

/** Whether a `catalog:…` version resolves to one of the catalog entries, as pnpm and Beachball resolve it. */
function inCatalogs(catalogs: Catalogs, name: string, version: string): boolean {
  if (!version.startsWith("catalog:")) {
    return false
  }

  const catalog = version.slice("catalog:".length)

  // `catalog:` is the default catalog, and so is `catalog:default` unless a catalog is named that.
  if (!catalog) {
    return catalogs.default?.[name] !== undefined
  }

  const entries = catalogs.named?.[catalog] ?? (catalog === "default" ? catalogs.default : undefined)

  return entries?.[name] !== undefined
}

/** The released packages that bundle each private package, directly or through other private packages. */
export function bundledBy(packages: WorkspacePackage[]): Map<string, string[]> {
  const byName = new Map(packages.map((pkg) => [pkg.name, pkg]))
  const bundlers = new Map<string, string[]>()

  for (const release of packages.filter((pkg) => !pkg.private)) {
    const seen = new Set<string>()

    const visit = (name: string): void => {
      const pkg = byName.get(name)

      if (!pkg?.private || seen.has(name)) {
        return
      }

      seen.add(name)
      bundlers.set(name, [...(bundlers.get(name) ?? []), release.name])

      for (const dependency of pkg.dependencies) {
        visit(dependency)
      }
    }

    for (const dependency of release.dependencies) {
      visit(dependency)
    }
  }

  return bundlers
}

/**
 * The released packages that changed files need a change file for: the package a file is in when it's released, and
 * every released package that bundles it when it's private. Files matching an ignore pattern don't count. A package
 * whose `catalog:` dependency is among the changed catalog entries has changed too, whatever the ignore patterns say,
 * as Beachball's check counts it.
 */
export function releasesFor(
  packages: WorkspacePackage[],
  files: string[],
  ignorePatterns: string[],
  changedCatalog: Catalogs = {}
): string[] {
  const bundlers = bundledBy(packages)
  const changed = new Set<WorkspacePackage>()

  for (const file of files) {
    if (ignorePatterns.some((pattern) => matchesGlob(file, pattern))) {
      continue
    }

    const owner = packages
      .filter((pkg) => file.startsWith(`${pkg.dir}/`))
      .sort((a, b) => b.dir.length - a.dir.length)[0]

    if (owner) {
      changed.add(owner)
    }
  }

  for (const pkg of packages) {
    const references = Object.entries(pkg.catalogDependencies ?? {})

    if (references.some(([name, version]) => inCatalogs(changedCatalog, name, version))) {
      changed.add(pkg)
    }
  }

  const releases = new Set<string>()

  for (const pkg of changed) {
    for (const release of pkg.private ? (bundlers.get(pkg.name) ?? []) : [pkg.name]) {
      releases.add(release)
    }
  }

  return [...releases].sort()
}

/**
 * Whether a `package.json` changed only in its version, as Beachball's release commit bumps it. That needs no change
 * file of its own: the release is what the change files it consumes asked for.
 */
export function onlyVersionChanged(before: string, after: string): boolean {
  const withoutVersion = (text: string): string => {
    const fields = new Map(Object.entries(parseData(plainObject, JSON.parse(text))))
    fields.delete("version")

    return JSON.stringify(Object.fromEntries(fields))
  }

  return withoutVersion(before) === withoutVersion(after)
}

/** A fix may consume its change files in the same PR: require a newer version and its generated changelog entry. */
export function versionedRelease(before: string, after: string, changelog: string): string | undefined {
  const previous = versioned.safeParse(JSON.parse(before))
  const next = namedVersion.safeParse(JSON.parse(after))
  const log = changelogFile.safeParse(JSON.parse(changelog))

  if (!previous.success || !next.success || !log.success || log.data.name !== next.data.name) {
    return undefined
  }

  const pattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/

  if (!pattern.test(previous.data.version) || !pattern.test(next.data.version)) {
    return undefined
  }

  const oldParts = previous.data.version.split(".").map(BigInt)
  const newParts = next.data.version.split(".").map(BigInt)
  const difference = newParts.findIndex((part, index) => part !== oldParts[index])
  const newer = newParts[difference]
  const older = oldParts[difference]

  if (newer === undefined || older === undefined || newer <= older) {
    return undefined
  }

  const entry = versioned.safeParse(log.data.entries[0])

  return entry.success && entry.data.version === next.data.version ? next.data.name : undefined
}

/** A package.json, or a changelog entry, as far as its version. */
const versioned = z.object({ version: z.string() })

/** A package.json's name and version. */
const namedVersion = versioned.extend({ name: z.string() })

/** A package's CHANGELOG.json, as Beachball writes it: its name and its entries, newest first. */
const changelogFile = z.object({ name: z.string(), entries: z.array(z.json()) })

/** A change file in `change/`, as far as the package it's for. */
const changeFile = z.object({ packageName: z.string() })

/** A workspace package's package.json, as far as which package it is and what it depends on. */
const manifest = z.object({
  name: z.string(),
  private: z.boolean().optional(),
  dependencies: z.record(z.string(), z.string()).optional(),
  devDependencies: z.record(z.string(), z.string()).optional(),
  peerDependencies: z.record(z.string(), z.string()).optional(),
  optionalDependencies: z.record(z.string(), z.string()).optional()
})

/** One catalog's entries: each dependency's name, with its version. */
const catalogEntries = z.record(z.string(), z.string())

/** Catalogs as workspace-tools parses pnpm-workspace.yaml for Beachball. */
const catalogs = z.object({
  default: catalogEntries.optional(),
  named: z.record(z.string(), catalogEntries).optional()
})

/** The part of beachball.config.cjs this script reads. */
const beachballSettings = z.object({ branch: z.string(), ignorePatterns: z.array(z.string()).optional() })

const root = join(import.meta.dirname, "..")

function git(...args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" })
}

function lines(text: string): string[] {
  return text.split("\n").filter(Boolean)
}

/**
 * The change files a diff adds or edits in `change/`, run in `cwd`. Without `--no-renames`, git pairs a change file a
 * release consumed with a new one for the same package as a rename, and the new one would go uncounted. A file with
 * the same content as one the diff deletes is that file renamed, which covers nothing new, so it doesn't count.
 */
export function listChangeFiles(range: string[], cwd = root): string[] {
  const raw = execFileSync("git", ["diff", "--raw", "--no-abbrev", "--no-renames", ...range, "--", "change/"], {
    cwd,
    encoding: "utf8"
  })

  // Each line reads `:<old mode> <new mode> <old blob> <new blob> <status>\t<path>`.
  const entries = lines(raw).map((line) => {
    const [meta = "", path = ""] = line.split("\t")
    const [, , before = "", after = "", status = ""] = meta.split(" ")

    return { path, before, after, status }
  })

  const deleted = new Set(entries.filter((entry) => entry.status === "D").map((entry) => entry.before))

  return entries
    .filter((entry) => entry.status === "M" || (entry.status === "A" && !deleted.has(entry.after)))
    .map((entry) => entry.path)
}

/**
 * The workspace packages under apps/ and packages/, read from the same snapshot as the changes, the index or HEAD, so
 * an unstaged manifest edit can't change which packages need change files.
 */
function readWorkspace(committed: boolean, now: (file: string) => string): WorkspacePackage[] {
  const listed = committed
    ? git("ls-tree", "-r", "--name-only", "HEAD", "--", "apps", "packages")
    : git("ls-files", "--", "apps", "packages")

  const found = lines(listed).flatMap((file) => {
    const dir = /^((?:apps|packages)\/[^/]+)\/package\.json$/.exec(file)?.[1]

    return dir ? [{ dir, json: parseData(manifest, JSON.parse(now(file))) }] : []
  })

  const names = new Set(found.map(({ json }) => json.name))

  return found.map(({ dir, json }) => {
    const kinds = [json.dependencies, json.devDependencies, json.peerDependencies, json.optionalDependencies]
    const declared = kinds.flatMap((kind) => Object.entries(kind ?? {}))

    return {
      name: json.name,
      dir,
      private: json.private === true,
      dependencies: declared.flatMap(([name]) => (names.has(name) ? [name] : [])),
      catalogDependencies: Object.fromEntries(declared.filter(([, version]) => version.startsWith("catalog:")))
    }
  })
}

function beachballConfig(): z.output<typeof beachballSettings> {
  return parseData(beachballSettings, createRequire(import.meta.url)(join(root, "beachball.config.cjs")))
}

/** What a branch changed, and the packages its change files cover and its release commits released. */
interface Changes {
  packages: WorkspacePackage[]
  files: string[]
  changedCatalog: Catalogs
  covered: Set<string>
  released: Set<string>
}

/**
 * The files changed since the branch left Beachball's, and the packages that the change files among them are for. It
 * reads the index, so a commit counts what it stages and not the edits other sessions leave in a folder they share;
 * `committed` reads only the branch's commits, as a push or CI checks them.
 */
function changes(branch: string, committed: boolean): Changes {
  const base = git("merge-base", branch, "HEAD").trim()
  const range = committed ? [base, "HEAD"] : ["--cached", base]
  const now = (file: string): string => git("show", `${committed ? "HEAD" : ""}:${file}`)

  // A package.json that only changed version, as a release bumps it, doesn't count.
  const bumped = lines(git("diff", "--name-only", "--diff-filter=M", ...range, "--", "*package.json")).filter((file) =>
    onlyVersionChanged(git("show", `${base}:${file}`), now(file))
  )

  const files = lines(git("diff", "--name-only", "--no-renames", ...range)).filter((file) => !bumped.includes(file))
  const changeFiles = listChangeFiles(range)
  const covered = new Set(changeFiles.map((file) => parseData(changeFile, JSON.parse(now(file))).packageName))
  const released = new Set<string>()

  for (const file of bumped) {
    const changelog = file.replace(/package\.json$/, "CHANGELOG.json")

    if (!files.includes(changelog)) {
      continue
    }

    const release = versionedRelease(git("show", `${base}:${file}`), now(file), now(changelog))

    if (release) {
      covered.add(release)
      released.add(release)
    }
  }

  return {
    packages: readWorkspace(committed, now),
    files,
    changedCatalog: catalogChanges(base, files, now),
    covered,
    released
  }
}

const catalogFile = "pnpm-workspace.yaml"

/**
 * The catalog entries changed since `base`, read with the parser Beachball's own check uses, so the YAML means the same
 * to both. Like Beachball, it looks only when the file changed.
 */
function catalogChanges(base: string, files: string[], now: (file: string) => string): Catalogs {
  if (!files.includes(catalogFile)) {
    return {}
  }

  const fromBeachball = createRequire(createRequire(import.meta.url).resolve("beachball/package.json"))
  const parser = z.function({ input: [z.string(), z.literal("pnpm")], output: catalogs.optional() })
  const tools = parseData(z.object({ parseCatalogContent: parser }), fromBeachball("workspace-tools"))
  const parse = (content: string): Catalogs | undefined => tools.parseCatalogContent(content, "pnpm")

  let before: string | undefined

  try {
    before = git("show", `${base}:${catalogFile}`)
  } catch {
    before = undefined
  }

  return changedCatalogEntries(before === undefined ? undefined : parse(before), parse(now(catalogFile)))
}

function option(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`)

  return index === -1 ? undefined : process.argv[index + 1]
}

function main(): void {
  const command = process.argv[2]
  const config = beachballConfig()
  const committed = process.argv.includes("--committed")
  const { packages, files, changedCatalog, covered, released } = changes(config.branch, committed)
  // Beachball's own ignore patterns, plus the change files and changelogs it ignores itself.
  const ignored = [...(config.ignorePatterns ?? []), "change/*.json", "**/CHANGELOG.md", "**/CHANGELOG.json"]
  const needed = releasesFor(packages, files, ignored, changedCatalog)
  const missing = needed.filter((name) => !covered.has(name))

  // Beachball checks ordinary change files; a consumed release is checked by version + generated changelog instead.
  if (command === "releasing") {
    process.exit(released.size > 0 && needed.every((name) => released.has(name)) ? 0 : 1)
  }

  if (command === "check") {
    if (missing.length === 0) {
      return
    }

    console.error(`Change files are needed for ${missing.join(" and ")}, which ship what changed.`)
    console.error('Run `pnpm changefile --type patch --message "what changed, for the changelog"` after staging.')
    process.exit(1)
  }

  if (command === "write") {
    const type = option("type")
    const message = option("message")

    if (!type || !message) {
      console.error('Usage: pnpm changefile --type <patch|minor|none> --message "what changed, for the changelog"')
      process.exit(1)
    }

    if (needed.length === 0) {
      print("No change file needed: nothing changed ships in the desktop app or the CLI.")

      return
    }

    if (missing.length === 0) {
      print(`No change file needed: ${needed.join(" and ")} already have staged or committed release coverage.`)

      return
    }

    const require = createRequire(import.meta.url)
    const beachball = join(dirname(require.resolve("beachball/package.json")), "bin/beachball.js")
    const packages = missing.flatMap((name) => ["--package", name])
    execFileSync(
      process.execPath,
      [beachball, "change", "--no-commit", "--type", type, "--message", message, ...packages],
      {
        cwd: root,
        stdio: "inherit"
      }
    )

    return
  }

  console.error(
    "Usage: node scripts/changes.ts write --type <type> --message <message> | check|releasing [--committed]"
  )
  process.exit(1)
}

if (process.argv[1] && import.meta.filename === process.argv[1]) {
  main()
}
