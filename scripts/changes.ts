// Says which released packages a change needs a change file for, and writes or checks them. Beachball versions only the
// packages that aren't private, the desktop app and the CLI, so on its own it would miss a change to a private package
// they bundle, such as @parity-app/core. Like Beachball, it counts from where the branch left the one beachball.config.cjs
// names. Unlike it, it reads only the index or the commits, never the working tree, which sessions share.
// Usage:
//   node scripts/changes.ts write --type patch --message "…"  writes the change files that are missing (pnpm changefile)
//   node scripts/changes.ts check                             fails when one is missing from what's staged (pre-commit)
//   node scripts/changes.ts check --committed                 the same for the branch's commits (pre-push and CI)
import { execFileSync } from "node:child_process"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join, matchesGlob } from "node:path"

export interface WorkspacePackage {
  name: string
  /** Its folder from the repository root, with forward slashes. */
  dir: string
  private: boolean
  /** The workspace packages it depends on, of any kind. */
  dependencies: string[]
}

/** The released packages that bundle each private package, directly or through other private packages. */
export function bundledBy(packages: WorkspacePackage[]): Map<string, string[]> {
  const byName = new Map(packages.map((pkg) => [pkg.name, pkg]))
  const bundlers = new Map<string, string[]>()
  for (const release of packages.filter((pkg) => !pkg.private)) {
    const seen = new Set<string>()
    const visit = (name: string): void => {
      const pkg = byName.get(name)
      if (!pkg?.private || seen.has(name)) return
      seen.add(name)
      bundlers.set(name, [...(bundlers.get(name) ?? []), release.name])
      for (const dependency of pkg.dependencies) visit(dependency)
    }
    for (const dependency of release.dependencies) visit(dependency)
  }
  return bundlers
}

/**
 * The released packages that changed files need a change file for: the package a file is in when it's released, and
 * every released package that bundles it when it's private. Files matching an ignore pattern don't count.
 */
export function releasesFor(packages: WorkspacePackage[], files: string[], ignorePatterns: string[]): string[] {
  const bundlers = bundledBy(packages)
  const releases = new Set<string>()
  for (const file of files) {
    if (ignorePatterns.some((pattern) => matchesGlob(file, pattern))) continue
    const owner = packages
      .filter((pkg) => file.startsWith(`${pkg.dir}/`))
      .sort((a, b) => b.dir.length - a.dir.length)[0]
    if (!owner) continue
    for (const release of owner.private ? (bundlers.get(owner.name) ?? []) : [owner.name]) releases.add(release)
  }
  return [...releases].sort()
}

/**
 * Whether a `package.json` changed only in its version, as Beachball's release commit bumps it. That needs no change
 * file of its own: the release is what the change files it consumes asked for.
 */
export function onlyVersionChanged(before: string, after: string): boolean {
  const withoutVersion = (text: string): string => {
    const json = JSON.parse(text) as Record<string, unknown>
    delete json.version
    return JSON.stringify(json)
  }
  return withoutVersion(before) === withoutVersion(after)
}

/** A fix may consume its change files in the same PR: require a newer version and its generated changelog entry. */
export function versionedRelease(before: string, after: string, changelog: string): string | undefined {
  const previous: unknown = JSON.parse(before)
  const next: unknown = JSON.parse(after)
  const log: unknown = JSON.parse(changelog)
  if (
    !previous ||
    typeof previous !== "object" ||
    !("version" in previous) ||
    typeof previous.version !== "string" ||
    !next ||
    typeof next !== "object" ||
    !("version" in next) ||
    typeof next.version !== "string" ||
    !("name" in next) ||
    typeof next.name !== "string" ||
    !log ||
    typeof log !== "object" ||
    !("name" in log) ||
    log.name !== next.name ||
    !("entries" in log) ||
    !Array.isArray(log.entries)
  )
    return undefined
  const pattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
  if (!pattern.test(previous.version) || !pattern.test(next.version)) return undefined
  const oldParts = previous.version.split(".").map(BigInt)
  const newParts = next.version.split(".").map(BigInt)
  const difference = newParts.findIndex((part, index) => part !== oldParts[index])
  const newer = newParts[difference]
  const older = oldParts[difference]
  if (newer === undefined || older === undefined || newer <= older) return undefined
  const entry: unknown = log.entries[0]
  return entry && typeof entry === "object" && "version" in entry && entry.version === next.version
    ? next.name
    : undefined
}

const root = join(import.meta.dirname, "..")

function git(...args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" })
}

function lines(text: string): string[] {
  return text.split("\n").filter(Boolean)
}

function readWorkspace(): WorkspacePackage[] {
  const found: { dir: string; json: Record<string, unknown> }[] = []
  for (const parent of ["apps", "packages"]) {
    for (const name of readdirSync(join(root, parent))) {
      const file = join(root, parent, name, "package.json")
      if (existsSync(file)) found.push({ dir: `${parent}/${name}`, json: JSON.parse(readFileSync(file, "utf8")) })
    }
  }
  const names = new Set(found.map(({ json }) => String(json.name)))
  return found.map(({ dir, json }) => {
    const kinds = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]
    const declared = kinds.flatMap((kind) => Object.keys((json[kind] as Record<string, string> | undefined) ?? {}))
    return {
      name: String(json.name),
      dir,
      private: json.private === true,
      dependencies: declared.filter((name) => names.has(name))
    }
  })
}

interface BeachballConfig {
  branch: string
  ignorePatterns?: string[]
}

function beachballConfig(): BeachballConfig {
  return createRequire(import.meta.url)(join(root, "beachball.config.cjs")) as BeachballConfig
}

/**
 * The files changed since the branch left Beachball's, and the packages that the change files among them are for. It
 * reads the index, so a commit counts what it stages and not the edits other sessions leave in a folder they share;
 * `committed` reads only the branch's commits, as a push or CI checks them.
 */
function changes(branch: string, committed: boolean): { files: string[]; covered: Set<string> } {
  const base = git("merge-base", branch, "HEAD").trim()
  const range = committed ? [base, "HEAD"] : ["--cached", base]
  const now = (file: string): string => git("show", `${committed ? "HEAD" : ""}:${file}`)
  // A package.json that only changed version, as a release bumps it, doesn't count.
  const bumped = lines(git("diff", "--name-only", "--diff-filter=M", ...range, "--", "*package.json")).filter((file) =>
    onlyVersionChanged(git("show", `${base}:${file}`), now(file))
  )
  const files = lines(git("diff", "--name-only", "--no-renames", ...range)).filter((file) => !bumped.includes(file))
  const changeFiles = lines(git("diff", "--name-only", "--diff-filter=AM", ...range, "--", "change/"))
  const covered = new Set(changeFiles.map((file) => (JSON.parse(now(file)) as { packageName: string }).packageName))
  for (const file of bumped) {
    const changelog = file.replace(/package\.json$/, "CHANGELOG.json")
    if (!files.includes(changelog)) continue
    const release = versionedRelease(git("show", `${base}:${file}`), now(file), now(changelog))
    if (release) covered.add(release)
  }
  return { files, covered }
}

function option(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`)
  return index === -1 ? undefined : process.argv[index + 1]
}

function main(): void {
  const command = process.argv[2]
  const config = beachballConfig()
  const { files, covered } = changes(config.branch, process.argv.includes("--committed"))
  // Beachball's own ignore patterns, plus the change files and changelogs it ignores itself.
  const ignored = [...(config.ignorePatterns ?? []), "change/*.json", "**/CHANGELOG.md", "**/CHANGELOG.json"]
  const needed = releasesFor(readWorkspace(), files, ignored)
  const missing = needed.filter((name) => !covered.has(name))

  if (command === "check") {
    if (missing.length === 0) return
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
      console.log("No change file needed: nothing changed ships in the desktop app or the CLI.")
      return
    }
    if (missing.length === 0) {
      console.log(`No change file needed: ${needed.join(" and ")} already have staged or committed release coverage.`)
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

  console.error("Usage: node scripts/changes.ts write --type <type> --message <message> | check [--committed]")
  process.exit(1)
}

if (process.argv[1] && import.meta.filename === process.argv[1]) main()
