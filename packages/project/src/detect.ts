import { readFile } from "node:fs/promises"
import { dirname, join, relative, resolve } from "node:path"
import type { Adapter, AdapterDetection, DetectContext, PackageManifest, ToolVersions } from "@parity-app/core"
import type { Agent } from "package-manager-detector"
import { resolveCommand } from "package-manager-detector/commands"
import { AGENTS, LOCKS } from "package-manager-detector/constants"
import { detect } from "package-manager-detector/detect"
import semver from "semver"
import type { Detection, PackageManagerDetection, ProjectDetection } from "./detection.ts"
import { nearestLockfiles } from "./lockfile.ts"
import { findPackage, readPackage } from "./packages.ts"

/** A tool Parity runs or renders with: its adapter's name, and where its version is installed. */
interface Tool extends ToolVersions {
  /** Its adapter's id. */
  id: string
  name: string
}

/** An adapter, and what its `detect` found. */
export interface AdapterFound<A extends Pick<Adapter, "id" | "name" | "versions"> = Adapter> {
  adapter: A
  detection: AdapterDetection
}

/** How every adapter's `detect` reads the project at `root`. */
export function detectContext(root: string, pkg: PackageManifest): DetectContext {
  return { root, pkg, read: async (path) => readFile(join(root, path), "utf8").catch(() => undefined) }
}

/** What each of `adapters` found, in order, asked all at once. An adapter whose `detect` throws rejects it. */
export async function detectAdapters<A extends Adapter>(
  project: DetectContext,
  adapters: readonly A[]
): Promise<AdapterFound<A>[]> {
  const detections = await Promise.all(adapters.map((adapter) => adapter.detect(project)))

  return adapters.map((adapter, index) => ({ adapter, detection: detections[index]! }))
}

/**
 * What a project uses and where each was found: its package manager, and the installed version of each tool an adapter
 * found, checked against the version cutoff its adapter gives. What the adapter found, such as a builder's config and
 * its build tool's own version, comes first.
 */
export async function detectProject(
  root: string,
  pkg: PackageManifest,
  found: readonly AdapterFound<Pick<Adapter, "id" | "name" | "versions">>[],
  today = new Date()
): Promise<ProjectDetection> {
  const tools = found.flatMap(({ adapter, detection }) =>
    detection.found && adapter.versions
      ? [{ tool: { id: adapter.id, name: adapter.name, ...adapter.versions }, detection }]
      : []
  )

  const [packageManager, ...detected] = await Promise.all([
    detectPackageManager(root),
    ...tools.map(({ tool, detection }) => detectTool(root, pkg, tool, detection, today))
  ])

  const used = detected

  const untested = used
    .filter((detection) => detection.status === "dropped")
    .map((detection) => `${detection.name} ${detection.version}`)

  // Dropped only means untested: nothing is blocked, so this is a note, not a warning.
  const list = untested.length > 1 ? `${untested.slice(0, -1).join(", ")} and ${untested.at(-1)}` : untested[0]

  return {
    packageManager,
    tools: used,
    notice: list
      ? `Not tested with Parity: ${list}. Nothing is blocked; Parity tests versions from the last two years, and each tool's newest.`
      : undefined
  }
}

async function detectTool(
  root: string,
  pkg: PackageManifest,
  tool: Tool,
  found: AdapterDetection,
  today: Date
): Promise<Detection> {
  const declared = { ...pkg.dependencies, ...pkg.devDependencies }
  const dependencies = Object.keys(declared).filter((dependency) => uses(tool, dependency))
  const config = found.config ? { config: found.config } : {}

  let aliased: { from: string; via: Via } | undefined

  for (const name of new Set([...tool.packages, ...dependencies])) {
    const installed = await findPackage(root, name).catch(() => undefined)

    if (!installed) {
      continue
    }

    const { manifest } = installed
    const from = toPosix(relative(root, installed.installedAt))

    // An alias, such as Vite+ installing `@voidzero-dev/vite-plus-core` as `vite`, has its own version: the tool's is
    // the one it says it ships.
    const via: Via | undefined =
      manifest.name && manifest.name !== name
        ? {
            name: tool.distributions?.[manifest.name] ?? manifest.name,
            package: manifest.name,
            version: manifest.version
          }
        : undefined

    const version = via ? manifest.bundledVersions?.[name] : manifest.version

    if (!version) {
      aliased ??= via ? { from, via } : undefined
      continue
    }

    return toolDetection(tool, version, { from, ...config }, today, via)
  }

  if (found.version) {
    return toolDetection(tool, found.version, config, today, aliased?.via)
  }

  if (aliased) {
    return {
      id: tool.id,
      name: tool.name,
      from: aliased.from,
      ...config,
      summary: `${tool.name} from ${aliased.from}, installed as ${described(aliased.via)}, which doesn't say which ${tool.name} version it ships`
    }
  }

  const range = dependencies.map((dependency) => declared[dependency]).find(Boolean)

  return {
    id: tool.id,
    name: tool.name,
    declared: range || undefined,
    status: "missing",
    summary: `${tool.name}${range ? ` ${range}` : ""} is in package.json but isn't installed: install the project's packages first`
  }
}

/** Whether a dependency is one of the tool's packages, or in its scope. */
function uses(tool: Tool, dependency: string): boolean {
  return tool.packages.includes(dependency) || (tool.scope !== undefined && dependency.startsWith(tool.scope))
}

/** A package installed in a tool's place: its name for people, its package name and its own version. */
interface Via {
  name: string
  package: string
  version?: string
}

/** A package installed in a tool's place as a summary names it: `Vite+ 1.4.0 (@voidzero-dev/vite-plus-core)`. */
function described(via: Via): string {
  const named = `${via.name}${via.version ? ` ${via.version}` : ""}`

  return via.name === via.package ? named : `${named} (${via.package})`
}

/** A tool's detection at a version. `via` is the package that's installed in its place, when one is. */
function toolDetection(
  tool: Tool,
  version: string,
  where: { from?: string; config?: string },
  today: Date,
  via?: Via
): Detection {
  const found = [
    `${tool.name} ${version}`,
    where.from ? ` from ${where.from}` : "",
    via ? `, shipped by ${described(via)}` : "",
    where.config ? `, config ${where.config}` : ""
  ].join("")

  const support = cutoff(tool, version, today)
  const base = { id: tool.id, name: tool.name, version, ...where, status: support.status }

  if (support.status === "dropped") {
    return { ...base, summary: `${found}; untested, Parity tests ${supported(tool, today)}` }
  }

  if (support.status === "newer") {
    return { ...base, summary: `${found}, newer than the versions Parity is tested with` }
  }

  return {
    ...base,
    drops: support.drops || undefined,
    summary: support.drops ? `${found}; tested until ${month(support.drops)}` : found
  }
}

/** Whether Parity tests a version, and the day it stops if it's going to. */
export interface Support {
  status: "supported" | "newer" | "dropped"
  drops?: string
}

/**
 * The version cutoff: a major released more than two years ago is dropped, counted from its own x.0.0, except the
 * tool's newest major, which is never dropped. Dropped means Parity doesn't test it; nothing is blocked.
 */
export function cutoff(tool: Pick<Tool, "majors">, version: string, today = new Date()): Support {
  const valid = semver.valid(version) ?? semver.coerce(version)?.version

  if (!valid) {
    return { status: "supported" }
  }

  const major = semver.major(valid)
  const newest = tool.majors.at(-1)![0]

  if (major > newest) {
    return { status: "newer" }
  }

  if (major === newest) {
    return { status: "supported" }
  }

  const released = tool.majors.find(([candidate]) => candidate === major)?.[1]

  if (!released) {
    return { status: "dropped" }
  }

  const drops = `${Number(released.slice(0, 4)) + 2}${released.slice(4)}`

  return drops <= today.toISOString().slice(0, 10) ? { status: "dropped" } : { status: "supported", drops }
}

/** The majors Parity tests today, such as "React 19" or "Vite 6 or later". */
function supported(tool: Tool, today: Date): string {
  const kept = tool.majors.filter(([major]) => cutoff(tool, `${major}.0.0`, today).status !== "dropped")
  const oldest = label(tool, kept[0]![0])

  return kept.length === 1 ? `${tool.name} ${oldest}` : `${tool.name} ${oldest} or later`
}

function label(tool: Tool, major: number): string {
  return `${tool.prefix ?? ""}${major}`
}

function month(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })
}

const agentNames = new Map<Agent, string>([
  ["npm", "npm"],
  ["pnpm", "pnpm"],
  ["pnpm@6", "pnpm"],
  ["pnpm-rush", "pnpm"],
  ["yarn", "Yarn"],
  ["yarn@berry", "Yarn Berry"],
  ["bun", "Bun"],
  ["deno", "Deno"]
])

/**
 * The project's package manager, by `package-manager-detector`: in each folder from the root up, a lockfile, then the
 * `packageManager` and `devEngines.packageManager` fields of its package.json. npm when nothing says. `lockfile` is the
 * nearest one from the root up (see {@link nearestLockfiles}), which the detection fingerprint hashes too.
 */
export async function detectPackageManager(root: string): Promise<PackageManagerDetection> {
  const locks = await nearestLockfiles(root)
  const path = (folder: string, file: string) => toPosix(relative(root, join(folder, file)))
  const lockfile = locks ? { lockfile: path(locks.folder, locks.names[0]!) } : {}

  for (let folder = resolve(root); ; folder = dirname(folder)) {
    // One folder at a time, so the evidence can say which folder and which file.
    const found = await detect({ cwd: folder, stopDir: folder })

    if (found) {
      const lock = locks?.folder === folder ? locks.names[0] : undefined
      // Only the evidence's wording depends on the manifest, so one the schema refuses doesn't stop detection.
      const manifest = await readPackage(folder).catch(() => undefined)
      const field = manifest?.manifest.packageManager !== undefined ? "packageManager" : "devEngines.packageManager"
      const fromLock = lock !== undefined && LOCKS[lock] === found.name
      const from = path(folder, fromLock ? lock : "package.json")
      const name = agentNames.get(found.agent) ?? found.name
      const version = found.version && semver.coerce(found.version) ? found.version : undefined
      const summary = `${name}${version ? ` ${version}` : ""} from ${fromLock ? from : `${field} in ${from}`}`

      return { id: found.name, name, agent: found.agent, version, from, ...lockfile, summary }
    }

    if (dirname(folder) === folder) {
      break
    }
  }

  return {
    id: "npm",
    name: "npm",
    agent: "npm",
    ...lockfile,
    summary: "npm, since no folder from here up has a lockfile or a packageManager or devEngines.packageManager field"
  }
}

/** The command that adds packages to a project with its package manager, from `package-manager-detector`'s table. */
export function addCommand(agent: string, packages: string[]): { command: string; args: string[] } {
  const known = AGENTS.find((candidate) => candidate === agent)
  const resolved = known && resolveCommand(known, "add", packages)

  if (!resolved) {
    throw new Error(`Parity doesn't know how to add packages with ${agent}`)
  }

  return resolved
}

function toPosix(path: string): string {
  return path.replaceAll("\\", "/")
}
