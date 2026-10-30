import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import type { ComponentInfo, ComponentSource, DesignNode, LibraryManifest } from "@parity-app/core"
import { call, type ExecResponse } from "./client.ts"

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
  if (!library) throw new Error("parity lib check <library> [--tab t] [--mode m]")
  const { applyLibraryEdits, componentNode, generateId, librarySource, parseLibraryEdits, withLibraryContext } =
    await import("@parity-app/core")
  const { registryDir, registryEntries } = await import("@parity-app/registry")
  const entry = (await registryEntries()).find((item) => item.manifest.id === library)
  if (!entry) throw new Error(`The registry has no library "${library}"`)
  let manifest: LibraryManifest = entry.manifest
  if (manifest.edits) {
    const edits =
      typeof manifest.edits === "string"
        ? parseLibraryEdits(JSON.parse(await readFile(join(dirname(entry.path), manifest.edits), "utf8")))
        : manifest.edits
    manifest = applyLibraryEdits(manifest, edits).manifest
  }
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
  const exec = async (label: string, code: string): Promise<string> => {
    const result = await call<ExecResponse>("exec", { tab: options.tab, label, code })
    if (!result.ok) throw new Error(result.error ?? `${label} failed`)
    const line = result.output.find((item) => item.startsWith("{") || item.startsWith("["))
    if (!line) throw new Error(`${label} printed nothing`)
    return line
  }
  // The props the app reads for each component, which give a new node its required values, as on the canvas.
  const infos = JSON.parse(
    await exec(
      `Read ${library}'s props`,
      `const ids = ${JSON.stringify(names.map(id))}
const known = new Set(Components())
Print(JSON.stringify(Object.fromEntries(ids.filter((id) => known.has(id)).map((id) => [id, Props(id, { all: true })]))))`
    )
  ) as Record<string, ComponentInfo>
  const missing = names.filter((name) => !infos[id(name)])
  if (missing.length === names.length) throw new Error(`The tab's project doesn't have ${library} installed`)
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
    const line = await exec(
      `Check ${design}`,
      `for (const design of Designs().filter((d) => d.name === ${JSON.stringify(design)})) DeleteDesign(design.id)
const spot = FindEmptySpace({ width: 1280, height: 2000 })
const id = CreateDesign({ name: ${JSON.stringify(design)}, x: spot.x, y: spot.y })
const grid = Insert(id, { type: "layout", name: "Grid", style: { direction: "row", wrap: true, gap: 4, padding: 4 }, children: [] })
for (const node of ${JSON.stringify(nodes)}) Insert(grid, node)
Print(JSON.stringify(await Problems(id, { mode: ${JSON.stringify(mode)} })))`
    )
    return failures(JSON.parse(line) as { problem: string }[], library)
  }
  const failAlone = await failing(`${library} alone`, alone)
  const failInside = await failing(`${library} inside`, inside)
  const report = score(library, mode, names.length, failAlone, failInside, list)
  const floors = JSON.parse(await readFile(join(registryDir(), "..", "in-app.json"), "utf8")) as Record<string, number>
  report.floor = floors[library]
  if (options.record) {
    const kept = await recordAppErrors(registryDir(), library, report)
    console.error(`Kept ${kept} errors from the app for ${library}; run parity lib with --registry to use them.`)
  }
  if (options.json) console.log(JSON.stringify(report, null, 2))
  else console.log(describeCheck(report))
  if (report.floor !== undefined && report.score < report.floor) process.exitCode = 1
}

/** Where a library's errors from the app are kept: `app-errors/<id>.json` beside the registry's files. */
function appErrorsPath(registry: string, library: string): string {
  return join(registry, "..", "app-errors", `${library}.json`)
}

/** The app's errors kept for a library, by part, or none. */
export async function readAppErrors(registry: string, library: string): Promise<Record<string, string> | undefined> {
  return readFile(appErrorsPath(registry, library), "utf8").then(
    (text) => JSON.parse(text) as Record<string, string>,
    () => undefined
  )
}

/**
 * Adds the parts that failed in the app to those kept before, with their own errors rather than a parent's: one kept
 * from an earlier check stays, so the parent its error named stays in the part's chain once it renders.
 */
async function recordAppErrors(registry: string, library: string, report: CheckReport): Promise<number> {
  const kept = { ...(await readAppErrors(registry, library)) }
  for (const [name, why] of Object.entries(report.misses)) if (!why.startsWith("inside ")) kept[name] = why
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
      if (match && !failed.has(match[1]!)) failed.set(match[1]!, match[2]!.slice(0, 160))
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
  for (const [name, why] of Object.entries(report.misses)) lines.push(`  ${name}: ${why}`)
  if (unplaced.length > 0) lines.push(`  Not placed: ${unplaced.join(", ")}`)
  if (report.floor !== undefined && report.score < report.floor) lines.push(`Below ${report.library}'s floor.`)
  return lines.join("\n")
}
