import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { replies } from "@parity-app/agent/contracts"
import type { ComponentSource, DesignNode, LibraryManifest } from "@parity-app/core"
import { checkData, jsonText } from "@parity-app/core/schema"
import { z } from "zod"
import { call } from "./client.ts"
import { invalidInput } from "./errors.ts"
import { executeOperation } from "./execute.ts"
import { stderr, stdout } from "./output.ts"

/** The registry's least share of placed parts each library must render, by library, in `in-app.json`. */
const floorsFile = jsonText(z.record(z.string(), z.number()))

/** The app's errors kept for a library, by part. */
const appErrorsFile = jsonText(z.record(z.string(), z.string()))

export interface CheckOptions {
  tab?: string
  /** The mode the designs are checked in. */
  mode?: string
  json?: boolean
  /** Keeps why parts failed in the registry's `app-errors`, for making the library's file again. */
  record?: boolean
}

/** What `parity lib check` found for one library. */
export interface CheckReport {
  library: string
  mode: string
  components: number
  /** Parts that fail on their own, by why. */
  failAlone: Record<string, string>
  /** Of those, the ones the library file places, and the ones that then render inside their parents. */
  placed: string[]
  hits: string[]
  /** Placed parts that still fail, by why. */
  misses: Record<string, string>
  /** The share of placed parts that render, as a whole percent, and the least the registry accepts. */
  score: number
  floor?: number
}

/**
 * `parity lib check <library>`: inserts every component of a registry library file into the running app, once on its
 * own and once the way the Assets panel inserts it, inside its parents with its sample, and reports the parts that fail
 * alone but render inside. The tab's project must have the library installed. Exits with 1 below the library's floor
 * in the registry's `in-app.json`.
 */
export async function runCheck(library: string | undefined, options: CheckOptions): Promise<void> {
  if (!library) {
    throw invalidInput("library", "Name a library to check: parity lib check <library> [--tab t] [--mode m]")
  }

  const { componentNode, generateId, librarySource, withLibraryContext } = await import("@parity-app/core")
  const { newestEntries, registryDir } = await import("@parity-app/registry")
  // The file the app uses for the library's newest version, with its hand edits, as the app reads it.
  const entry = (await newestEntries()).find((item) => item.manifest.id === library)

  if (!entry) {
    throw invalidInput("library", `The registry has no library "${library}"`)
  }

  const manifest: LibraryManifest = entry.manifest
  const list = manifest.components?.list ?? {}
  const names = Object.keys(list).filter((name) => list[name]!.visual !== false)
  const id = (name: string) => `${library}/${name}`

  // Providers stay in, as the app lists them, so the parts that need one are inserted inside it with its sample.
  const sources: Record<string, ComponentSource> = Object.fromEntries(
    Object.keys(list).map((name) => [
      id(name),
      { ...librarySource(library, name, list[name]!, library), declaration: "" }
    ])
  )

  const mode = options.mode ?? "desktop-light"

  /** Runs one of these snippets and reads the JSON it prints, once `printed` has checked it. */
  const exec = async <T extends z.ZodType>(label: string, code: string, printed: T): Promise<z.output<T>> => {
    const result = await executeOperation.run({ tab: options.tab, label, code }, call)

    if (executeOperation.failed(result)) {
      throw new Error(result.error?.message ?? `${label} failed`)
    }

    const line = result.output.find((item) => item.startsWith("{") || item.startsWith("["))

    if (!line) {
      throw new Error(`${label} printed nothing`)
    }

    const checked = checkData(jsonText(printed), line)

    if (checked.success) {
      return checked.data
    }

    throw new Error(
      `This CLI can't read what "${label}" printed (${checked.problem.pointer}: ${checked.problem.message})`
    )
  }

  // The props the app reads for each component, which give a new node its required values, as on the canvas.
  const infos = await exec(
    `Read ${library}'s props`,
    `const ids = ${JSON.stringify(names.map(id))}
const known = new Set(Components())
Print(JSON.stringify(Object.fromEntries(ids.filter((id) => known.has(id)).map((id) => [id, Props(id, { all: true })]))))`,
    z.record(z.string(), replies.props)
  )

  const missing = names.filter((name) => !infos[id(name)])

  if (missing.length === names.length) {
    throw invalidInput("library", `The tab's project doesn't have ${library} installed`)
  }

  const taken = new Set<string>()

  // Ids only keep the nodes apart here; the app gives them its own as it inserts them.
  const alone = names.map((name) => {
    const node = { type: "component" as const, id: generateId(taken), component: id(name) }
    taken.add(node.id)

    return node
  })

  const placedNames = names.filter((name) => list[name]!.parents?.length || list[name]!.sample)

  const inside = placedNames.map((name) =>
    withLibraryContext(componentNode(id(name), infos[id(name)], taken), sources, [], taken)
  )

  const failing = async (design: string, nodes: DesignNode[]) => {
    const problems = await exec(
      `Check ${design}`,
      `for (const design of Designs().filter((d) => d.name === ${JSON.stringify(design)})) DeleteDesign(design.id)
const spot = FindEmptySpace({ width: 1280, height: 2000 })
const id = CreateDesign({ name: ${JSON.stringify(design)}, x: spot.x, y: spot.y })
const grid = Insert(id, { type: "layout", name: "Grid", style: { flexDirection: "row", flexWrap: "wrap", gap: { step: 4 }, padding: { step: 4 } }, children: [] })
for (const node of ${JSON.stringify(nodes)}) Insert(grid, node)
Print(JSON.stringify(await Problems(id, { mode: ${JSON.stringify(mode)} })))`,
      replies.problems.shape.problems
    )

    return failures(problems, library)
  }

  const failAlone = await failing(`${library} alone`, alone)
  const failInside = await failing(`${library} inside`, inside)
  const report = score(library, mode, names.length, failAlone, failInside, list)
  const floors = join(registryDir(), "..", "in-app.json")
  report.floor = registryFile(floors, await readFile(floors, "utf8"), floorsFile)[library]

  if (options.record) {
    const kept = await recordAppErrors(registryDir(), library, report)
    stderr(`Kept ${kept} errors from the app for ${library}; run parity lib with --registry to use them.`)
  }

  if (options.json) {
    stdout(JSON.stringify(report, null, 2))
  } else {
    stdout(describeCheck(report))
  }

  if (report.floor !== undefined && report.score < report.floor) {
    process.exitCode = 1
  }
}

/** Where a library's errors from the app are kept: `app-errors/<id>.json` beside the registry's files. */
function appErrorsPath(registry: string, library: string): string {
  return join(registry, "..", "app-errors", `${library}.json`)
}

/** The app's errors kept for a library, by part, or none. */
export async function readAppErrors(registry: string, library: string): Promise<Record<string, string> | undefined> {
  const path = appErrorsPath(registry, library)
  const text = await readFile(path, "utf8").catch(() => undefined)

  return text === undefined ? undefined : registryFile(path, text, appErrorsFile)
}

/** One of the registry's own JSON files once `schema` has checked it, or an error naming the file and what's wrong. */
function registryFile<T extends z.ZodType>(path: string, text: string, schema: T): z.output<T> {
  const checked = checkData(schema, text)

  if (checked.success) {
    return checked.data
  }

  throw new TypeError(`${path}: ${checked.problem.pointer || "/"}: ${checked.problem.message}`)
}

/**
 * Adds the parts that failed in the app to those kept before, with their own errors rather than a parent's: one kept
 * from an earlier check stays, so the parent its error named stays in the part's chain once it renders.
 */
async function recordAppErrors(registry: string, library: string, report: CheckReport): Promise<number> {
  const kept = { ...(await readAppErrors(registry, library)) }

  for (const [name, why] of Object.entries(report.misses)) {
    if (!why.startsWith("inside ")) {
      kept[name] = why
    }
  }

  const path = appErrorsPath(registry, library)
  await mkdir(dirname(path), { recursive: true })
  const sorted = Object.fromEntries(Object.entries(kept).sort(([a], [b]) => a.localeCompare(b, "en")))
  await writeFile(path, `${JSON.stringify(sorted, null, 2)}\n`)

  return Object.keys(sorted).length
}

/**
 * The components of a library that a design's problems name, by why: `aria/Cell: Cell count must match…`, or
 * `"aria/Cell" isn't one of the project's components` for one the project doesn't have.
 */
export function failures(problems: { problem: string }[], library: string): Map<string, string> {
  const failed = new Map<string, string>()
  const escaped = library.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&")
  // Component names are identifiers, so `$` counts too.
  const pattern = new RegExp(`${escaped}/([\\w.$]+)(?:: |" )(.*)`)

  for (const { problem } of problems) {
    for (const line of problem.split("\n")) {
      const match = pattern.exec(line)

      if (match && !failed.has(match[1]!)) {
        failed.set(match[1]!, match[2]!.slice(0, 160))
      }
    }
  }

  return failed
}

/** A part counts once it and every parent it's placed in render. */
export function score(
  library: string,
  mode: string,
  components: number,
  failAlone: Map<string, string>,
  failInside: Map<string, string>,
  list: Record<string, { parents?: string[]; sample?: unknown }>
): CheckReport {
  const placed = [...failAlone.keys()].filter((name) => list[name]?.parents?.length || list[name]?.sample)

  const hits = placed.filter(
    (name) => !failInside.has(name) && !(list[name]!.parents ?? []).some((parent) => failInside.has(parent))
  )

  const misses = Object.fromEntries(
    placed
      .values()
      .filter((name) => !hits.includes(name))
      .map((name) => [
        name,
        failInside.get(name) ??
          `inside ${(list[name]!.parents ?? []).filter((parent) => failInside.has(parent)).join(", ")}, which fails`
      ])
  )

  return {
    library,
    mode,
    components,
    failAlone: Object.fromEntries(failAlone),
    placed,
    hits,
    misses,
    score: placed.length === 0 ? 100 : Math.floor((100 * hits.length) / placed.length)
  }
}

export function describeCheck(report: CheckReport): string {
  const unplaced = Object.keys(report.failAlone).filter((name) => !report.placed.includes(name))

  const lines = [
    `${report.library}: ${report.components} components, ${Object.keys(report.failAlone).length} fail on their own, ` +
      `${report.placed.length} of them placed, ${report.hits.length} render inside their parents (${report.score}%` +
      `${report.floor === undefined ? "" : `, at least ${report.floor}%`})`
  ]

  for (const [name, why] of Object.entries(report.misses)) {
    lines.push(`  ${name}: ${why}`)
  }

  if (unplaced.length > 0) {
    lines.push(`  Not placed: ${unplaced.join(", ")}`)
  }

  if (report.floor !== undefined && report.score < report.floor) {
    lines.push(`Below ${report.library}'s floor.`)
  }

  return lines.join("\n")
}
