import { randomUUID } from "node:crypto"
import { realpathSync } from "node:fs"
import { homedir } from "node:os"
import { agentRegistry, isRunning, readEntries, removeStaleEntry } from "@parity-app/agent/registry"
import {
  type Copy,
  type CopyEntry,
  type CopyReport,
  openTabs,
  registryVersion,
  type Request,
  route
} from "@parity-app/agent/routing"
import { CodedError, readErrorDetails, unknownReference } from "@parity-app/core/errors"
import { cliCallerName, sessionCallerId } from "./caller.ts"
import type { ExecResponse } from "./execute.ts"

/**
 * Where running copies of the app say how to reach them: `~/.parity/agents`, or the one file `PARITY_AGENT_FILE` names
 * for a copy kept apart from the person's.
 */
export const registry = agentRegistry(process.env, homedir())

export type { OperationError } from "./errors.ts"
export type { Edit, ExecResponse, Screenshot } from "./execute.ts"

let caller = cliCallerName(process.env)
/** Tells callers with the same name apart. A terminal's calls are separate processes, so they share their name. */
const explicitCallerId = process.env.PARITY_AGENT_ID?.trim() || undefined
let callerId = explicitCallerId

/**
 * Names who's calling in later calls, so the canvas can say who's at work. The MCP server learns the name from its
 * client, and is one session: its calls share an id, apart from any other session of the same agent.
 */
export function setCaller(name: string | undefined, session = false): void {
  caller = name ?? caller
  callerId = session ? sessionCallerId(caller, randomUUID()) : explicitCallerId
}

/**
 * How a call finds its copy of the app (PAR-514): `tab` goes to the copy that has the tab's project open, `open` to the
 * copy that has the project or else the one the person used last, and `copies` asks every copy, for their tabs.
 */
export type Routing = "tab" | "open" | "copies"

/**
 * Calls the running Parity app: the copy that has the call's project open, with the exact tab it chose, by the rules
 * in `@parity-app/agent/routing`. Fails with a clear message, and a code, when no copy is running, none has the
 * project, or the call fails: the app's own code when it gives one.
 */
export async function call<T>(
  method: string,
  params: Record<string, unknown> = {},
  routing: Routing = "tab"
): Promise<T> {
  const copies = await runningCopies()
  if (routing === "copies") return openTabs(copies) as T
  const request: Request =
    routing === "open"
      ? { kind: "open", root: String(params.root) }
      : { kind: "tab", ...(typeof params.tab === "string" ? { tab: params.tab } : {}), folder: process.cwd(), real }
  const target = route(copies, request)
  if (target.kind === "none") {
    if (target.code === "not_running") throw new CodedError(target.message, { code: target.code, retryable: true })
    const ids = target.open.map((tab) => tab.id)
    throw unknownReference("unknown_tab", target.message, typeof params.tab === "string" ? params.tab : "", ids, "tab")
  }
  return send<T>(target.copy.entry, method, target.tab ? { ...params, tab: target.tab.id } : params)
}

/** A folder's real path, through any link, or the folder as named when it can't be read. */
function real(path: string): string {
  try {
    return realpathSync.native(path)
  } catch {
    return path
  }
}

/** Every copy that answers, with what it has open. An entry whose copy has quit is removed on the way. */
async function runningCopies(): Promise<Copy<TabSummary>[]> {
  const entries = readEntries(registry, homedir())
  const newer = entries.find((entry) => entry.version > registryVersion)
  if (newer) {
    throw new CodedError(`The Parity at ${newer.url} is newer than this CLI. Update @parity-app/cli, then try again.`, {
      code: "not_running",
      retryable: false
    })
  }
  const found = await Promise.all(
    entries.map(async (entry) => {
      const report = await reportOf(entry)
      if (!report && !isRunning(entry.app)) removeStaleEntry(registry, entry)
      return report ? [{ entry, report }] : []
    })
  )
  const copies = found.flat()
  if (entries.length > 0 && copies.length === 0) {
    const where = entries.map((entry) => entry.url).join(", ")
    throw new CodedError(`Parity isn't answering at ${where}. Is the app still running?`, {
      code: "not_answering",
      retryable: true
    })
  }
  if (copies.length === 0) {
    throw new CodedError(`Parity isn't running (nothing in ${registry.path}). Start the app, then try again.`, {
      code: "not_running",
      retryable: true
    })
  }
  return copies
}

/** What a copy has open and when it was last used; just its tabs from an app too old to say more. */
async function reportOf(entry: CopyEntry): Promise<CopyReport<TabSummary> | undefined> {
  try {
    return await send<CopyReport<TabSummary>>(entry, "copy", {}, 5000)
  } catch (error) {
    if (!(error instanceof CodedError) || error.details.code !== "app_error") return undefined
    try {
      return { tabs: await send<TabSummary[]>(entry, "tabs", {}, 5000) }
    } catch {
      return undefined
    }
  }
}

async function send<T>(entry: CopyEntry, method: string, params: Record<string, unknown>, timeout?: number) {
  let response: Response
  try {
    response = await fetch(`${entry.url}/rpc`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${entry.token}` },
      body: JSON.stringify({ method, params, agent: caller, agentId: callerId }),
      ...(timeout === undefined ? {} : { signal: AbortSignal.timeout(timeout) })
    })
  } catch {
    throw new CodedError(`Parity isn't answering at ${entry.url}. Is the app still running?`, {
      code: "not_answering",
      retryable: true
    })
  }
  const body = (await response.json()) as { result?: T; error?: string; details?: unknown }
  if (body.error !== undefined) {
    throw new CodedError(body.error, readErrorDetails(body.details) ?? { code: "app_error" })
  }
  return body.result as T
}

/** A readable account of an exec call, for terminals and for agents. */
export function describeExec(result: ExecResponse): string {
  const lines: string[] = []
  if (result.ok)
    lines.push(result.applied ? "Done. The changes are on the canvas as one undoable step." : "Done. Nothing changed.")
  else {
    const error = result.error
    lines.push(`Failed, nothing changed: ${error?.message ?? "unknown error"}`)
    if (error?.retryable) lines.push("Nothing in the request was wrong; run it again.")
    if (error?.editId) {
      lines.push(`Fix it by retrying with editId "${error.editId}" and edits ({find, replace}) to the snippet.`)
    }
  }
  if (result.output.length > 0) lines.push("", "Output:", ...result.output)
  const created = Object.entries(result.created)
  if (created.length > 0) lines.push("", "Created:", ...created.map(([name, id]) => `  ${name} = ${id}`))
  if (result.warnings.length > 0)
    lines.push("", "Warnings (fix these next):", ...result.warnings.map((warning) => `  ${warning}`))
  if (result.screenshots.length > 0) {
    lines.push(
      "",
      "Screenshots:",
      ...result.screenshots.map((shot) => `  ${shot.design} / ${shot.state} / ${shot.mode}: ${shot.path}`)
    )
  }
  return lines.join("\n")
}

/** One open project. */
export interface TabSummary {
  id: string
  name: string
  root: string
  active: boolean
  status: "loading" | "ready" | "error"
  error?: string
  designs: number
}

export interface TabsResponse {
  tabs: TabSummary[]
}

export interface StatusResponse {
  tab: { id: string; name: string }
  /** Opaque: the same only while nothing in the tab has changed. */
  revision: string
  /** Something applied (and undoable) isn't on disk yet. */
  dirty: boolean
  /** Changes save themselves a moment later; otherwise they wait for the person to save. */
  autosave: boolean
  unsaved: {
    path: string
    kind: "document" | "stylesheet"
    designs?: { added: string[]; changed: string[]; removed: string[] }
    modes?: boolean
    tokens?: string[]
    more?: number
  }[]
  tokenEdits: number
  save: { status: "saved" | "unsaved" | "saving" | "failed"; error?: string }
  errors: { path: string; error: string }[]
  undo: { count: number; labels?: string[] }
  redo: { count: number; labels?: string[] }
}

/** Where a tab's edits stand: the revision, what's applied and undoable, what's on disk, and what failed to write. */
export function describeStatus(result: StatusResponse): string {
  const { tab, revision, unsaved, undo, redo, save, errors } = result
  const steps = (count: number) => (count === 1 ? "1 step" : `${count} steps`)
  const lines = [`${tab.name} is at revision ${revision}.`]
  if (unsaved.length === 0) lines.push("Everything applied is saved.")
  else {
    const how = result.autosave
      ? "Automatic saving is on, so they save themselves."
      : "They wait for the person to save; agents can't."
    lines.push(`${unsaved.length === 1 ? "1 file isn't" : `${unsaved.length} files aren't`} saved. ${how}`)
    for (const file of unsaved) {
      const parts: string[] = []
      if (file.designs) {
        const { added, changed, removed } = file.designs
        if (added.length > 0) parts.push(`added ${added.join(", ")}`)
        if (changed.length > 0) parts.push(`changed ${changed.join(", ")}`)
        if (removed.length > 0) parts.push(`removed ${removed.join(", ")}`)
      }
      if (file.modes) parts.push("changed the modes")
      if (file.tokens?.length) parts.push(`token values ${file.tokens.join(", ")}`)
      if (file.more) parts.push(`and ${file.more} more`)
      lines.push(`  ${file.path}${parts.length > 0 ? `: ${parts.join("; ")}` : ""}`)
    }
  }
  if (save.status === "saving") lines.push("Saving now.")
  if (errors.length > 0) {
    lines.push("", "Failed to write:", ...errors.map((entry) => `  ${entry.path}: ${entry.error}`))
  }
  lines.push("", `Undo has ${steps(undo.count)}${undo.labels?.length ? `: ${undo.labels.join(", ")}` : ""}.`)
  if (redo.count > 0)
    lines.push(`Redo has ${steps(redo.count)}${redo.labels?.length ? `: ${redo.labels.join(", ")}` : ""}.`)
  return lines.join("\n")
}

export interface ModesResponse {
  tab: { id: string; name: string }
  variables: {
    id: string
    name: string
    kind: "viewport" | "theme" | "locale" | "custom"
    options: {
      id: string
      name: string
      width?: number
      height?: number
      device?: string
      className?: string
      attributes?: Record<string, string>
    }[]
  }[]
  /** Viewport options: the ids Responsive takes, with the window each stands for. */
  viewports: { id: string; name: string; width: number; height: number; device?: string }[]
  /** Modes: the ids renders take, each a combination of one option per variable. */
  modes: {
    id: string
    name: string
    primary: boolean
    viewport: string
    width: number
    height: number
    values: Record<string, string>
    classNames: string[]
    attributes: Record<string, string>
  }[]
  designs: {
    id: string
    name: string
    state: string
    states: string[]
    main: string
    beside: string[]
    frames?: { mode: string; width: number; height?: number; window: { width: number; height: number } }[]
  }[]
}

/**
 * The project's viewports (what Responsive takes), its other variables, its modes (what renders take) and what each
 * design's board shows, with a named design's frames.
 */
export function describeModes(result: ModesResponse): string {
  const { variables, viewports, modes, designs } = result
  const lines = [
    "Viewports, the ids Responsive(node, viewport, patch) takes:",
    ...viewports.map(
      (viewport) => `  ${viewport.id}: ${viewport.width} wide, in a window ${viewport.height} tall (${viewport.name})`
    )
  ]
  const others = variables.filter((variable) => variable.kind !== "viewport")
  if (others.length > 0) {
    lines.push("", "Other variables:")
    for (const variable of others) {
      const options = variable.options.map((option) => {
        const effects = [
          ...(option.className ? [`class ${option.className}`] : []),
          ...Object.entries(option.attributes ?? {}).map(([name, value]) => `${name}="${value}"`)
        ]
        return effects.length > 0 ? `${option.id} (${effects.join(", ")})` : option.id
      })
      lines.push(`  ${variable.id} (${variable.kind}): ${options.join(", ")}`)
    }
  }
  lines.push("", "Modes, the ids screenshots and checks take, primary first:")
  for (const mode of modes) {
    const values = Object.entries(mode.values)
      .map(([variable, option]) => `${variable} ${option}`)
      .join(", ")
    lines.push(`  ${mode.id}${mode.primary ? " (primary)" : ""}: ${values}; ${mode.width} by ${mode.height}`)
  }
  lines.push("", designs.length === 1 ? "Design:" : "Designs:")
  for (const design of designs) {
    const states = design.states.length > 1 ? `every state (${design.states.join(", ")})` : `state ${design.state}`
    const beside = design.beside.length > 0 ? `, beside it ${design.beside.join(", ")}` : ""
    lines.push(`  ${design.id} (${design.name}): ${states}; main mode ${design.main}${beside}`)
    for (const frame of design.frames ?? []) {
      const size = frame.height === undefined ? `${frame.width} wide, growing` : `${frame.width} by ${frame.height}`
      lines.push(`    ${frame.mode}: ${size}, in a ${frame.window.width} by ${frame.window.height} window`)
    }
  }
  return lines.join("\n")
}

export interface AccessibilityFinding {
  state: string
  mode: string
  rule: string
  impact: "critical" | "serious" | "moderate" | "minor"
  help: string
  helpUrl: string
  node?: string
  name?: string
  detail: string
}

export interface AccessibilityResponse {
  tab: { id: string; name: string }
  design: { id: string; name: string }
  findings: AccessibilityFinding[]
  frames: number
  warnings: string[]
}

const impactOrder = ["critical", "serious", "moderate", "minor"]

interface LayerLine {
  name: string
  nodes: string[]
  detail: string
  frames: { state: string; mode: string }[]
}

/**
 * A readable account of an accessibility check: each rule broken, worst first, with the layers that break it, the
 * frames they break it in and what's wrong. Alike layers, such as the rows of a list, share a line.
 */
export function describeAccessibility(result: AccessibilityResponse): string {
  const { design, findings, frames } = result
  const checked = `${design.name} (${design.id}), ${frames === 1 ? "1 frame" : `${frames} frames`}`
  const rules = new Map<string, AccessibilityFinding[]>()
  for (const finding of findings) rules.set(finding.rule, [...(rules.get(finding.rule) ?? []), finding])
  const lines = [
    rules.size === 0
      ? `No issues found in ${checked}, with axe-core against WCAG 2.2 AA.`
      : `${rules.size === 1 ? "1 rule" : `${rules.size} rules`} broken in ${checked}, with axe-core against WCAG 2.2 AA.`
  ]
  const groups = [...rules.values()].sort(
    (a, b) => impactOrder.indexOf(a[0]!.impact) - impactOrder.indexOf(b[0]!.impact)
  )
  for (const group of groups) {
    const { impact, rule, help, helpUrl } = group[0]!
    lines.push("", `${impact}: ${help} (${rule})`)
    const byLayer = new Map<string, LayerLine>()
    for (const finding of group) {
      const key = `${finding.node ?? ""}\n${finding.detail}`
      const layer = byLayer.get(key) ?? {
        name: finding.name ?? "The design",
        nodes: finding.node ? [finding.node] : [],
        detail: finding.detail,
        frames: []
      }
      layer.frames.push({ state: finding.state, mode: finding.mode })
      byLayer.set(key, layer)
    }
    const alike = new Map<string, LayerLine>()
    for (const layer of byLayer.values()) {
      const same = JSON.stringify([layer.name, layer.detail, layer.frames])
      const existing = alike.get(same)
      if (existing) existing.nodes.push(...layer.nodes)
      else alike.set(same, layer)
    }
    for (const layer of alike.values()) {
      const where = layer.frames.length === frames && frames > 1 ? "every frame" : frameList(layer.frames)
      const ids = layer.nodes.length > 0 ? ` (${layer.nodes.join(", ")})` : ""
      lines.push(`  ${layer.name}${ids}, in ${where}: ${layer.detail}`)
    }
    lines.push(`  How to fix it: ${helpUrl}`)
  }
  if (result.warnings.length > 0) lines.push("", "Warnings:", ...result.warnings.map((warning) => `  ${warning}`))
  lines.push("", "Automated checks find some issues, not all. Try the design with a keyboard and a screen reader too.")
  return lines.join("\n")
}

export interface ProblemsResponse {
  tab: { id: string; name: string }
  design: { id: string; name: string }
  problems: { state: string; mode: string; problem: string; node?: string }[]
  frames: number
  warnings: string[]
}

/** A readable account of the layout problems in a design's frames, each once with the frames it's in. */
export function describeProblems(result: ProblemsResponse): string {
  const { design, problems, frames } = result
  const checked = `${design.name} (${design.id}), ${frames === 1 ? "1 frame" : `${frames} frames`}`
  const grouped = new Map<string, { problem: string; node?: string; frames: { state: string; mode: string }[] }>()
  for (const { problem, node, state, mode } of problems) {
    const key = `${node ?? ""}\n${problem}`
    const entry = grouped.get(key) ?? { problem, ...(node ? { node } : {}), frames: [] }
    entry.frames.push({ state, mode })
    grouped.set(key, entry)
  }
  const count = grouped.size === 1 ? "1 problem" : `${grouped.size} problems`
  const lines = [grouped.size === 0 ? `No problems found in ${checked}.` : `${count} in ${checked}:`]
  for (const { problem, node, frames: where } of grouped.values()) {
    const every = where.length === frames && frames > 1 ? "every frame" : frameList(where)
    lines.push(`  ${node ? `${node}: ` : ""}${problem}, in ${every}`)
  }
  if (result.warnings.length > 0) lines.push("", "Warnings:", ...result.warnings.map((warning) => `  ${warning}`))
  return lines.join("\n")
}

export interface TokenInfo {
  name: string
  category: string
  source: string
  values: Record<string, string>
}

export interface TokensResponse {
  tokens: TokenInfo[]
  /** How many matched, before the limit. */
  total: number
  truncated: boolean
}

/** Tokens by category, each with its value in every theme that sets one. */
export function describeTokens({ tokens, total, truncated }: TokensResponse): string {
  if (tokens.length === 0) return "No tokens match."
  const count = `${total === 1 ? "1 token" : `${total} tokens`}${truncated ? `, the first ${tokens.length} shown` : ""}`
  const lines = [`${count}. Name them in styles without "--".`]
  if (truncated) lines.push("Narrow them with category, source or search, or raise limit, to see the rest.")
  const categories = new Map<string, TokenInfo[]>()
  for (const token of tokens) {
    const key = `${token.category}, ${token.source}`
    categories.set(key, [...(categories.get(key) ?? []), token])
  }
  for (const [category, list] of categories) {
    lines.push("", `${category}:`)
    for (const token of list) {
      // The default theme first, then the others, such as dark.
      const values = Object.entries(token.values)
        .sort(([a], [b]) => first("default", a, b))
        .map(([theme, value]) => `${theme} ${value}`)
      lines.push(`  ${token.name}: ${values.join(", ")}`)
    }
  }
  return lines.join("\n")
}

export interface ComponentsResponse {
  components: string[]
  iconLibraries?: string[]
  /** The app's capitalised exports the type checker left out, with why. */
  leftOut?: { name: string; path: string; reason: string; undecided?: true }[]
  /** How many components have drawn on the canvas without errors so far. */
  drawn?: number
  /** Components failing to draw on the canvas now: why in words, and the kind of problem. */
  failing?: { id: string; problem: "provider" | "server" | "async" | "error"; reason: string }[]
  /** The person's corrections in the main project file, saved or not: exports listed by hand. */
  corrections?: { include?: ComponentRef[] }
}

/** One of the app's exports, by its file and export name. */
export interface ComponentRef {
  path: string
  export: string
}

/**
 * The project's own components, then each library's, then the icon libraries, then the exports left out and why, the
 * components failing to draw and why, and what the person corrected by hand.
 */
export function describeComponents({
  components,
  iconLibraries = [],
  leftOut = [],
  drawn = 0,
  failing = [],
  corrections = {}
}: ComponentsResponse): string {
  const groups = new Map<string, string[]>()
  for (const component of components) {
    const slash = component.indexOf("/")
    const group = slash > 0 ? component.slice(0, slash) : ""
    groups.set(group, [...(groups.get(group) ?? []), slash > 0 ? component.slice(slash + 1) : component])
  }
  const lines: string[] = []
  for (const [group, names] of [...groups].sort(([a], [b]) => first("", a, b))) {
    lines.push(group ? `${group}, as ${group}/Name:` : "The project's own:", `  ${names.join(", ")}`, "")
  }
  if (iconLibraries.length > 0) {
    lines.push(`Icons: ${iconLibraries.map((library) => `${library}, as ${library}/Name`).join("; ")}`, "")
  }
  if (leftOut.length > 0) {
    lines.push("Not components:")
    for (const entry of leftOut) {
      lines.push(`  ${entry.name}, in ${entry.path}: ${entry.undecided ? "can't tell, " : ""}${entry.reason}`)
    }
    lines.push("")
  }
  if (failing.length > 0) {
    lines.push(`Failing to draw on the canvas, ${failing.length} of ${failing.length + drawn} drawn so far:`)
    for (const entry of failing) lines.push(`  ${entry.id}: ${entry.reason}`)
    lines.push("")
  }
  const { include = [] } = corrections
  if (include.length > 0) {
    const name = (ref: ComponentRef) => (ref.export === "default" ? "the default export" : ref.export)
    lines.push("Corrected by hand in the project file:")
    for (const ref of include) lines.push(`  listed: ${name(ref)}, in ${ref.path}`)
  }
  return lines.join("\n").trimEnd()
}

export interface PropsResponse {
  component: string
  path?: string
  /** What the project's code imports it from: a package, or the file through the app's alias. */
  import?: string
  known: boolean
  props: {
    name: string
    kind: string
    group?: string
    options?: (string | number | boolean)[]
    default?: string | number | boolean | null
    required?: boolean
  }[]
  /** What it needs around it and holds inside it, read from its library's metadata (PAR-454). */
  composition?: Composition
}

/** A component's composition, as `@parity-app/editor`'s `componentComposition` reads it. */
export interface Composition {
  role: "provider" | "wrapper" | "component"
  parents:
    | { status: "listed"; chain: { component: string; optional?: true }[]; from?: string }
    | { status: "none" }
    | { status: "unknown"; reason: string }
  holds: string[]
  slots: { name: string; key: string; kind: "children" | "element" | "render" }[]
  example: { node: unknown; status: "drawn" | "failing" | "untried"; reason?: string }
}

/** A component's props, with each variant's options and default, then what it needs around it and holds. */
export function describeProps(result: PropsResponse): string {
  const lines: string[] = []
  if (!result.known) {
    lines.push(`${result.component}'s props haven't been read from its source yet. Try again in a moment.`)
  } else {
    const imported = result.import && result.import !== result.path ? `, imported from "${result.import}"` : ""
    lines.push(`${result.component}, from ${result.path}${imported}:`)
    for (const prop of result.props) {
      const options = prop.options ? `: ${prop.options.map((option) => JSON.stringify(option)).join(", ")}` : ""
      const fallback = prop.default === undefined ? "" : `, default ${JSON.stringify(prop.default)}`
      lines.push(`  ${prop.name} (${prop.kind}${prop.required ? ", required" : ""})${options}${fallback}`)
    }
    if (result.props.length === 0) lines.push("  No props of its own. --all lists the attributes it passes on.")
  }
  if (result.composition) lines.push("", ...describeComposition(result.composition))
  return lines.join("\n")
}

const roles: Record<Composition["role"], string> = {
  provider: "a provider, which draws nothing and gives the parts inside it their context",
  wrapper: "a wrapper, which other parts go inside",
  component: "a component"
}
const exampleStatus: Record<Composition["example"]["status"], string> = {
  drawn: "drawn on the canvas",
  failing: "failing on the canvas",
  untried: "not drawn yet"
}

/** What a component needs around it, what it holds, its slots, and its example as JSON for `Insert`. */
function describeComposition({ role, parents, holds, slots, example }: Composition): string[] {
  const lines = [`It's ${roles[role]}.`]
  if (parents.status === "listed") {
    const chain = parents.chain.map((parent) => (parent.optional ? `${parent.component} (optional)` : parent.component))
    lines.push(`Goes inside, outermost first: ${chain.join(" > ")}${parents.from ? ` (from its ${parents.from})` : ""}`)
  } else if (parents.status === "none") lines.push("Needs nothing around it.")
  else lines.push(`What it needs around it is unknown: ${parents.reason}`)
  if (holds.length > 0) lines.push(`Holds: ${holds.join(", ")}`)
  if (slots.length > 0) lines.push(`Slots: ${slots.map((slot) => `${slot.key} (${slot.kind})`).join(", ")}`)
  const reason = example.reason ? `: ${example.reason}` : ""
  lines.push(`Example for Insert, ${exampleStatus[example.status]}${reason}:`, `  ${JSON.stringify(example.node)}`)
  return lines
}

/** Frames as state and mode ids, naming a mode once when they share it: "default, error in desktop-light". */
function frameList(frames: { state: string; mode: string }[]): string {
  const modes = [...new Set(frames.map((frame) => frame.mode))]
  if (modes.length === 1) return `${frames.map((frame) => frame.state).join(", ")} in ${modes[0]}`
  return frames.map((frame) => `${frame.state} in ${frame.mode}`).join(", ")
}

export interface ConsoleEntry {
  level: "info" | "warning" | "error" | "debug"
  text: string
  source: string
  line: number
  where: "canvas" | "offscreen"
  count: number
  first: number
  last: number
}

export interface ConsoleResponse {
  tab: { id: string; name: string }
  /** The newest entries, up to the limit, oldest first. */
  entries: ConsoleEntry[]
  /** How many there were, before the limit. */
  total: number
  truncated: boolean
}

/** A readable account of what a project's code wrote to the console, oldest first, with where each came from. */
export function describeConsole(result: ConsoleResponse): string {
  const { tab, entries, total, truncated } = result
  if (entries.length === 0) return `${tab.name}'s code hasn't written anything to the console.`
  const count = total === 1 ? "1 message" : `${total} messages`
  const shown = truncated ? `, the newest ${entries.length} shown` : ""
  const lines = [`${count} from ${tab.name}'s code${shown}, oldest first:`]
  for (const entry of entries) {
    const time = new Date(entry.last).toLocaleTimeString([], { hour12: false })
    const repeats = entry.count > 1 ? ` (${entry.count} times)` : ""
    const [first = "", ...rest] = entry.text.split("\n")
    lines.push("", `${time} ${entry.level}${repeats}: ${first}`, ...rest.map((line) => `  ${line}`))
    const offscreen = entry.where === "offscreen" ? ", in an offscreen render" : ""
    lines.push(`  at ${scriptPath(entry.source)}:${entry.line}${offscreen}`)
  }
  return lines.join("\n")
}

/** Compares two names alphabetically, with `name` before every other. */
function first(name: string, a: string, b: string): number {
  if (a === name) return -1
  if (b === name) return 1
  return a.localeCompare(b)
}

/** A script's path on its server, without the cache-busting query Vite adds. */
function scriptPath(url: string): string {
  try {
    return new URL(url).pathname
  } catch {
    return url || "an unknown script"
  }
}
