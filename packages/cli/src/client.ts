import { randomUUID } from "node:crypto"
import { readFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import { cliCallerName } from "./caller.ts"

/** Where the running app writes its address and token. */
export const agentFile = process.env.PARITY_AGENT_FILE ?? join(homedir(), ".parity", "agent.json")

export interface Screenshot {
  path: string
  png: string
  design: string
  state: string
  mode: string
}

export interface ExecResponse {
  ok: boolean
  applied: boolean
  output: string[]
  warnings: string[]
  error?: string
  editId?: string
  created: Record<string, string>
  screenshots: Screenshot[]
}

export interface Edit {
  find: string
  replace: string
  all?: boolean
}

let caller = cliCallerName(process.env)
/** Tells callers with the same name apart. A terminal's calls are separate processes, so they share their name. */
let callerId = process.env.PARITY_AGENT_ID?.trim() || caller

/**
 * Names who's calling in later calls, so the canvas can say who's at work. The MCP server learns the name from its
 * client, and is one session: its calls share an id, apart from any other session of the same agent.
 */
export function setCaller(name: string | undefined, session = false): void {
  caller = name ?? caller
  callerId = session ? `${caller}#${randomUUID().slice(0, 8)}` : caller
}

/** Calls the running Parity app. Fails with a clear message when it isn't running. */
export async function call<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
  let connection: { url: string; token: string }
  try {
    connection = JSON.parse(await readFile(agentFile, "utf8")) as { url: string; token: string }
  } catch {
    throw new Error(`Parity isn't running (no ${agentFile}). Start the app, then try again.`)
  }
  let response: Response
  try {
    response = await fetch(`${connection.url}/rpc`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${connection.token}` },
      body: JSON.stringify({ method, params, agent: caller, agentId: callerId })
    })
  } catch {
    throw new Error(`Parity isn't answering at ${connection.url}. Is the app still running?`)
  }
  const body = (await response.json()) as { result?: T; error?: string }
  if (body.error !== undefined) throw new Error(body.error)
  return body.result as T
}

/** A readable account of an exec call, for terminals and for agents. */
export function describeExec(result: ExecResponse): string {
  const lines: string[] = []
  if (result.ok)
    lines.push(result.applied ? "Done. The changes are on the canvas as one undoable step." : "Done. Nothing changed.")
  else {
    lines.push(`Failed, nothing changed: ${result.error}`)
    lines.push(`Fix it by retrying with editId "${result.editId}" and edits ({find, replace}) to the snippet.`)
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

/** Tokens by category, each with its value in every theme that sets one. */
export function describeTokens(tokens: TokenInfo[]): string {
  if (tokens.length === 0) return "No tokens match."
  const lines = [`${tokens.length === 1 ? "1 token" : `${tokens.length} tokens`}. Name them in styles without "--".`]
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
        .sort(([a], [b]) => (a === "default" ? -1 : b === "default" ? 1 : a.localeCompare(b)))
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
}

/** The project's own components, then each library's, then the icon libraries, then the exports left out and why. */
export function describeComponents({ components, iconLibraries = [], leftOut = [] }: ComponentsResponse): string {
  const groups = new Map<string, string[]>()
  for (const component of components) {
    const slash = component.indexOf("/")
    const group = slash > 0 ? component.slice(0, slash) : ""
    groups.set(group, [...(groups.get(group) ?? []), slash > 0 ? component.slice(slash + 1) : component])
  }
  const lines: string[] = []
  for (const [group, names] of [...groups].sort(([a], [b]) => (a === "" ? -1 : b === "" ? 1 : a.localeCompare(b)))) {
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
}

/** A component's props, with each variant's options and default. */
export function describeProps(result: PropsResponse): string {
  if (!result.known) return `${result.component}'s props haven't been read from its source yet. Try again in a moment.`
  const imported = result.import && result.import !== result.path ? `, imported from "${result.import}"` : ""
  const lines = [`${result.component}, from ${result.path}${imported}:`]
  for (const prop of result.props) {
    const options = prop.options ? `: ${prop.options.map((option) => JSON.stringify(option)).join(", ")}` : ""
    const fallback = prop.default === undefined ? "" : `, default ${JSON.stringify(prop.default)}`
    lines.push(`  ${prop.name} (${prop.kind}${prop.required ? ", required" : ""})${options}${fallback}`)
  }
  if (result.props.length === 0) lines.push("  No props of its own. --all lists the attributes it passes on.")
  return lines.join("\n")
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
  entries: ConsoleEntry[]
}

/** A readable account of what a project's code wrote to the console, oldest first, with where each came from. */
export function describeConsole(result: ConsoleResponse): string {
  const { tab, entries } = result
  if (entries.length === 0) return `${tab.name}'s code hasn't written anything to the console.`
  const count = entries.length === 1 ? "1 message" : `${entries.length} messages`
  const lines = [`${count} from ${tab.name}'s code, oldest first:`]
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

/** A script's path on its server, without the cache-busting query Vite adds. */
function scriptPath(url: string): string {
  try {
    return new URL(url).pathname
  } catch {
    return url || "an unknown script"
  }
}
