// Says which released packages a change needs a change file for, and writes or checks them. Beachball versions only the
// packages that aren't private, the desktop app and the CLI, so on its own it would miss a change to a private package
// they bundle, such as @parity/core. Like Beachball, it counts the branch's commits and what's staged, from where the
// branch left the one beachball.config.cjs names.
// Usage:
//   node scripts/changes.ts write --type patch --message "…"  writes the change files that are missing (pnpm changefile)
//   node scripts/changes.ts check                             fails when one is missing (the pre-commit hook and CI)
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
 * The files changed since the branch left Beachball's, staged ones included, and the packages that the change files
 * among them are for.
 */
function changes(branch: string): { files: string[]; covered: Set<string> } {
  const base = git("merge-base", branch, "HEAD").trim()
  const files = lines(git("diff", "--cached", "--name-only", "--no-renames", base))
  const changeFiles = lines(git("diff", "--cached", "--name-only", "--diff-filter=AM", base, "--", "change/"))
  const covered = new Set(
    changeFiles.map((file) => (JSON.parse(git("show", `:${file}`)) as { packageName: string }).packageName)
  )
  return { files, covered }
}

function option(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`)
  return index === -1 ? undefined : process.argv[index + 1]
}

function main(): void {
  const command = process.argv[2]
  const config = beachballConfig()
  const { files, covered } = changes(config.branch)
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
      console.log(`No change file needed: ${needed.join(" and ")} already have one, staged or on this branch.`)
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

  console.error("Usage: node scripts/changes.ts write --type <type> --message <message> | check")
  process.exit(1)
}

if (process.argv[1] && import.meta.filename === process.argv[1]) main()
