import { readFile, stat } from "node:fs/promises"
import { dirname, join, relative, resolve } from "node:path"
import type {
  BuilderDetection,
  Detection,
  PackageManagerDetection,
  PackageManifest,
  ProjectDetection
} from "@parity-app/core"
import type { Agent } from "package-manager-detector"
import { resolveCommand } from "package-manager-detector/commands"
import { LOCKS } from "package-manager-detector/constants"
import { detect } from "package-manager-detector/detect"
import semver from "semver"
import { storybookConfig } from "./storybook.ts"

/** A tool Parity runs or renders with, the packages it comes in, and when each of its majors came out. */
interface Tool {
  /** Its adapter's id. */
  id: string
  name: string
  /** Packages that carry its version, the main one first. */
  packages: string[]
  /** Whether a dependency means the project uses the tool. */
  uses(dependency: string): boolean
  /** Each major's first stable release (x.0.0) from the npm registry, oldest first. */
  majors: [major: number, released: string][]
  /** How majors are written, such as Tailwind's `v4`. */
  prefix?: string
  /** Where its config file is, relative to the root, for tools whose builder doesn't report one. */
  config?(root: string, pkg: PackageManifest): Promise<string | undefined>
}

/** The tools the version cutoff covers. Add a major here when it comes out, so the one before it starts to count down. */
const tools: Tool[] = [
  {
    id: "react",
    name: "React",
    packages: ["react"],
    uses: (dependency) => dependency === "react",
    majors: [
      [15, "2016-04-07"],
      [16, "2017-09-26"],
      [17, "2020-10-20"],
      [18, "2022-03-29"],
      [19, "2024-12-05"]
    ]
  },
  {
    id: "vite",
    name: "Vite",
    packages: ["vite"],
    uses: (dependency) => dependency === "vite",
    majors: [
      [2, "2021-02-16"],
      [3, "2022-07-13"],
      [4, "2022-12-09"],
      [5, "2023-11-16"],
      [6, "2024-11-26"],
      [7, "2025-06-24"],
      [8, "2026-03-12"]
    ]
  },
  {
    id: "tailwind",
    name: "Tailwind CSS",
    packages: ["tailwindcss"],
    uses: (dependency) => dependency === "tailwindcss",
    prefix: "v",
    majors: [
      [1, "2019-05-13"],
      [2, "2020-11-18"],
      [3, "2021-12-09"],
      [4, "2025-01-21"]
    ]
  },
  {
    id: "storybook",
    name: "Storybook",
    // Storybook 7 and later are versioned by `storybook`; before that, by its framework packages.
    packages: ["storybook", "@storybook/react", "@storybook/react-vite", "@storybook/core"],
    uses: (dependency) => dependency === "storybook" || dependency.startsWith("@storybook/"),
    config: async (root, pkg) => (await storybookConfig(root, pkg))?.main,
    majors: [
      [6, "2020-08-11"],
      [7, "2023-03-31"],
      [8, "2024-03-11"],
      [9, "2025-05-28"],
      [10, "2025-10-28"]
    ]
  }
]

/**
 * What a project uses and where each was found: its package manager, and the installed versions of the tools Parity
 * runs or renders with, checked against the version cutoff. The builder passes what it found, such as its config.
 */
export async function detectProject(
  root: string,
  pkg: PackageManifest,
  builder?: { id: string; detection: BuilderDetection },
  today = new Date()
): Promise<ProjectDetection> {
  const [packageManager, ...found] = await Promise.all([
    detectPackageManager(root),
    ...tools.map((tool) => detectTool(root, pkg, tool, builder?.id === tool.id ? builder.detection : undefined, today))
  ])
  const used = found.filter((detection) => detection !== undefined)
  const untested = used
    .filter((detection) => detection.status === "dropped")
    .map((detection) => `${detection.name} ${detection.version}`)
  // Dropped only means untested: nothing is blocked, so this is a note, not a warning.
  const list = untested.length > 1 ? `${untested.slice(0, -1).join(", ")} and ${untested.at(-1)}` : untested[0]
  return {
    packageManager,
    tools: used,
    ...(list
      ? {
          notice: `Not tested with Parity: ${list}. Nothing is blocked; Parity tests versions from the last two years, and each tool's newest.`
        }
      : {})
  }
}

async function detectTool(
  root: string,
  pkg: PackageManifest,
  tool: Tool,
  builder: BuilderDetection | undefined,
  today: Date
): Promise<Detection | undefined> {
  const declared = { ...pkg.dependencies, ...pkg.devDependencies }
  const dependencies = Object.keys(declared).filter((dependency) => tool.uses(dependency))
  if (!builder && dependencies.length === 0) return undefined
  const file = builder?.config ?? (await tool.config?.(root, pkg))
  const config = file ? { config: file } : {}
  for (const name of new Set([...tool.packages, ...dependencies])) {
    const installed = await installedPackage(root, name)
    if (!installed) continue
    return toolDetection(tool, installed.version, { from: installed.from, ...config }, today)
  }
  if (builder?.version) return toolDetection(tool, builder.version, config, today)
  const range = dependencies.map((dependency) => declared[dependency]).find(Boolean)
  return {
    id: tool.id,
    name: tool.name,
    ...(range ? { declared: range } : {}),
    status: "missing",
    summary: `${tool.name}${range ? ` ${range}` : ""} is in package.json but isn't installed: install the project's packages first`
  }
}

function toolDetection(tool: Tool, version: string, where: { from?: string; config?: string }, today: Date): Detection {
  const found = [
    `${tool.name} ${version}`,
    where.from ? ` from ${where.from}` : "",
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
    ...(support.drops ? { drops: support.drops } : {}),
    summary: support.drops ? `${found}; tested until ${month(support.drops)}` : found
  }
}

/**
 * The version cutoff: a major released more than two years ago is dropped, counted from its own x.0.0, except the
 * tool's newest major, which is never dropped. Dropped means Parity doesn't test it; nothing is blocked.
 */
export function cutoff(
  tool: Pick<Tool, "majors">,
  version: string,
  today = new Date()
): { status: "supported" | "newer" | "dropped"; drops?: string } {
  const valid = semver.valid(version) ?? semver.coerce(version)?.version
  if (!valid) return { status: "supported" }
  const major = semver.major(valid)
  const newest = tool.majors.at(-1)![0]
  if (major > newest) return { status: "newer" }
  if (major === newest) return { status: "supported" }
  const released = tool.majors.find(([candidate]) => candidate === major)?.[1]
  if (!released) return { status: "dropped" }
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

/**
 * An installed package's folder and version, found the way Node finds packages: in `node_modules` here or in a folder
 * above. It reads the package's own `package.json`, which a package's `exports` may not let `require.resolve` reach.
 */
async function installedPackage(root: string, name: string): Promise<{ from: string; version: string } | undefined> {
  for (let folder = resolve(root); ; folder = dirname(folder)) {
    const directory = join(folder, "node_modules", name)
    const manifest = (await readJson(join(directory, "package.json"))) as { version?: unknown } | undefined
    if (typeof manifest?.version === "string")
      return { from: toPosix(relative(root, directory)), version: manifest.version }
    if (dirname(folder) === folder) return undefined
  }
}

const agentNames: Record<string, string> = {
  npm: "npm",
  pnpm: "pnpm",
  "pnpm@6": "pnpm",
  "pnpm-rush": "pnpm",
  yarn: "Yarn",
  "yarn@berry": "Yarn Berry",
  bun: "Bun",
  deno: "Deno"
}

/**
 * The project's package manager, by `package-manager-detector`: in each folder from the root up, a lockfile, then the
 * `packageManager` and `devEngines.packageManager` fields of its package.json. npm when nothing says.
 */
export async function detectPackageManager(root: string): Promise<PackageManagerDetection> {
  for (let folder = resolve(root); ; folder = dirname(folder)) {
    // One folder at a time, so the evidence can say which folder and which file.
    const found = await detect({ cwd: folder, stopDir: folder })
    if (found) {
      const lock = await firstFile(folder, Object.keys(LOCKS))
      const manifest = (await readJson(join(folder, "package.json"))) as { packageManager?: unknown } | undefined
      const field = typeof manifest?.packageManager === "string" ? "packageManager" : "devEngines.packageManager"
      const path = (file: string) => toPosix(relative(root, join(folder, file)))
      const from = lock && LOCKS[lock] === found.name ? path(lock) : path("package.json")
      const name = agentNames[found.agent] ?? found.name
      const version = found.version && semver.coerce(found.version) ? found.version : undefined
      const summary = `${name}${version ? ` ${version}` : ""} from ${lock && from === path(lock) ? from : `${field} in ${from}`}`
      return { id: found.name, name, agent: found.agent, ...(version ? { version } : {}), from, summary }
    }
    if (dirname(folder) === folder) break
  }
  return {
    id: "npm",
    name: "npm",
    agent: "npm",
    summary: "npm, since no folder from here up has a lockfile or a packageManager or devEngines.packageManager field"
  }
}

/** The command that adds packages to a project with its package manager, from `package-manager-detector`'s table. */
export function addCommand(agent: string, packages: string[]): { command: string; args: string[] } {
  const resolved = resolveCommand(agent as Agent, "add", packages)
  if (!resolved) throw new Error(`Parity doesn't know how to add packages with ${agent}`)
  return resolved
}

async function firstFile(folder: string, names: string[]): Promise<string | undefined> {
  for (const name of names) {
    const isFile = await stat(join(folder, name)).then(
      (stats) => stats.isFile(),
      () => false
    )
    if (isFile) return name
  }
  return undefined
}

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, "utf8"))
  } catch {
    return undefined
  }
}

function toPosix(path: string): string {
  return path.replaceAll("\\", "/")
}
