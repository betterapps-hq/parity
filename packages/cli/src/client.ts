import { randomBytes, randomUUID } from "node:crypto"
import { realpathSync } from "node:fs"
import { homedir } from "node:os"
import { type AgentMethod, type AgentMethods, replies, rpcReply } from "@parity-app/agent/contracts"
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
import { checkData, jsonText, type SchemaProblem } from "@parity-app/core/schema"
import type { z } from "zod"
import { cliCallerName, sessionCallerId } from "./caller.ts"
import type { ExecResponse } from "./execute.ts"
import { cliCallerChanged, recordCli, runTraceHeaders } from "./telemetry.ts"

/**
 * Where running copies of the app say how to reach them: `~/.parity/agents`, or the one file `PARITY_AGENT_FILE` names
 * for a copy kept apart from the person's.
 */
export const registry = agentRegistry(process.env, homedir())

export type { OperationError } from "./errors.ts"

export type { Edit, ExecResponse, Screenshot } from "./execute.ts"

import type { ConsoleResponse, TokensResponse } from "./operations.ts"

export type { ConsoleResponse, TabsResponse, TokensResponse } from "./operations.ts"

// What the app answers, from the schemas the client checks each answer with.
/** One open project. */
export type TabSummary = z.output<typeof replies.open>

export type StateResponse = z.output<typeof replies.state>

export type StatusResponse = z.output<typeof replies.status>

export type ModesResponse = z.output<typeof replies.modes>

export type AccessibilityResponse = z.output<typeof replies.accessibility>

export type AccessibilityFinding = AccessibilityResponse["findings"][number]

export type ProblemsResponse = z.output<typeof replies.problems>

export type Problem = ProblemsResponse["problems"][number]

/** A box in a frame, in CSS pixels from its top left corner. */
export type FrameBox = NonNullable<Problem["box"]>

export type TokenInfo = z.output<typeof replies.tokens>[number]

export type ComponentsResponse = z.output<typeof replies.components>

/** One of the app's exports, by its file and export name. */
export type ComponentRef = NonNullable<NonNullable<ComponentsResponse["corrections"]>["include"]>[number]

export type PropsResponse = z.output<typeof replies.props>

/** A component's composition, as `@parity-app/editor`'s `componentComposition` reads it. */
export type Composition = NonNullable<PropsResponse["composition"]>

export type ConsoleEntry = z.output<typeof replies.console>["entries"][number]

export type ReportResponse = z.output<typeof replies.report>

let caller = cliCallerName(process.env)

/** Tells callers with the same name apart. A terminal's calls are separate processes, so they share their name. */
const explicitCallerId = process.env.PARITY_AGENT_ID?.trim() || undefined
let callerId = explicitCallerId

/** The program calling through MCP, such as `claude-code`, which the app's telemetry tags (PAR-630). */
let callerClient: string | undefined

/** Whether calls come from the `parity` command or its MCP server, for the app's telemetry (PAR-641). */
let transport: "cli" | "mcp" = "cli"

/**
 * Names who's calling in later calls, so the canvas can say who's at work. The MCP server learns the name from its
 * client, and is one session: its calls share an id, apart from any other session of the same agent.
 */
export function setCaller(name: string | undefined, session = false, client?: string): void {
  caller = name ?? caller
  callerClient = client
  callerId = session ? sessionCallerId(caller, randomUUID()) : explicitCallerId
  transport = session ? "mcp" : "cli"
  tagCaller()
}

/** Tags the CLI's own events with who's calling, as the app tags the calls (PAR-642). */
function tagCaller(): void {
  cliCallerChanged({ name: caller, id: callerId ?? caller, ...(callerClient ? { client: callerClient } : {}) })
}

tagCaller()

/**
 * How a call finds its copy of the app (PAR-514): `tab` goes to the copy that has the tab's project open, `open` to the
 * copy that has the project or else the one the person used last, and `copies` asks every copy, for their tabs.
 * `tab-or-any` is `tab`, except that with no tab named and no project open, it goes to the copy used last (PAR-646).
 */
export type Routing = "tab" | "tab-or-any" | "open" | "copies"

/**
 * Calls the running Parity app: the copy that has the call's project open, with the exact tab it chose, by the rules
 * in `@parity-app/agent/routing`, and returns its answer once `reply` has checked it. Fails with a clear message, and a
 * code, when no copy is running, none has the project, or the call fails: the app's own code when it gives one.
 */
export async function call<M extends AgentMethod>(
  method: M,
  given: AgentMethods[M]["params"],
  routing: Routing
): Promise<AgentMethods[M]["result"]> {
  const params: Record<string, unknown> = given
  const copies = await runningCopies()

  if (routing === "copies") {
    return answer(replies[method], openTabs(copies), "tabs") as AgentMethods[M]["result"]
  }

  const request: Request =
    routing === "open"
      ? { kind: "open", root: String(params.root) }
      : {
          kind: "tab",
          ...(typeof params.tab === "string" ? { tab: params.tab } : {}),
          folder: process.cwd(),
          real,
          ...(routing === "tab-or-any" ? { anyCopy: true } : {})
        }

  const target = route(copies, request)

  if (target.kind === "none") {
    if (target.code === "not_running") {
      throw new CodedError(target.message, { code: target.code, retryable: true })
    }

    const ids = target.open.map((tab) => tab.id)
    throw unknownReference("unknown_tab", target.message, typeof params.tab === "string" ? params.tab : "", ids, "tab")
  }

  return send(target.copy.entry, method, target.tab ? { ...params, tab: target.tab.id } : params)
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
    recordCli("cli.versionMismatch", { cause: "app_newer", cliRegistry: registryVersion, appRegistry: newer.version })
    throw new CodedError(`The Parity at ${newer.url} is newer than this CLI. Update @parity-app/cli, then try again.`, {
      code: "not_running",
      retryable: false
    })
  }

  const found = await Promise.all(
    entries.map(async (entry) => {
      const report = await reportOf(entry)

      if (!report && !isRunning(entry.app)) {
        removeStaleEntry(registry, entry)
      }

      return report ? [{ entry, report }] : []
    })
  )

  const copies = found.flat()

  if (entries.length > 0 && copies.length === 0) {
    recordCli("cli.connectFailed", { code: "not_answering", copies: entries.length })
    const where = entries.map((entry) => entry.url).join(", ")
    throw new CodedError(`Parity isn't answering at ${where}. Is the app still running?`, {
      code: "not_answering",
      retryable: true
    })
  }

  if (copies.length === 0) {
    recordCli("cli.connectFailed", { code: "not_running", copies: 0 })
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
    return await send(entry, "copy", {}, 5000)
  } catch (error) {
    if (!(error instanceof CodedError) || error.details.code !== "app_error") {
      return undefined
    }

    try {
      return { tabs: await send(entry, "tabs", {}, 5000) }
    } catch {
      return undefined
    }
  }
}

/** Asks one copy, and returns its answer once the method's schema in `contracts.ts` has checked it. */
async function send<M extends AgentMethod>(
  entry: CopyEntry,
  method: M,
  params: Record<string, unknown>,
  timeout?: number
): Promise<AgentMethods[M]["result"]> {
  let response: Response

  try {
    response = await fetch(`${entry.url}/rpc`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${entry.token}`, ...traceHeaders() },
      body: JSON.stringify({ method, params, agent: caller, agentId: callerId, client: callerClient, transport }),
      ...(timeout === undefined ? {} : { signal: AbortSignal.timeout(timeout) })
    })
  } catch {
    throw new CodedError(`Parity isn't answering at ${entry.url}. Is the app still running?`, {
      code: "not_answering",
      retryable: true
    })
  }

  const body = answer(jsonText(rpcReply), await response.text(), method)

  if (body.error !== undefined) {
    throw new CodedError(body.error, readErrorDetails(body.details) ?? { code: "app_error" })
  }

  return answer(replies[method], body.result, method) as AgentMethods[M]["result"]
}

/**
 * The trace a call carries, which the app continues, so the call and everything the app does for it, to the frame it
 * draws, are one trace in Sentry (PAR-629): the running command's, or one of its own for an MCP call. Sampled, as the
 * app's spans are.
 */
function traceHeaders(): { "sentry-trace": string; baggage?: string } {
  const running = runTraceHeaders()

  if (running) {
    return running
  }

  const traceId = randomBytes(16).toString("hex")

  return {
    "sentry-trace": `${traceId}-${randomBytes(8).toString("hex")}-1`,
    baggage: `sentry-trace_id=${traceId},sentry-sampled=true`
  }
}

/** The app's answer to `method` once `schema` has checked it, or `app_error` saying what this CLI couldn't read. */
function answer<Schema extends z.ZodType>(schema: Schema, value: unknown, method: string): z.output<Schema> {
  const checked = checkData(schema, value)

  if (checked.success) {
    return checked.data
  }

  recordCli("cli.versionMismatch", { cause: "unreadable_answer", cliRegistry: registryVersion, method })
  throw new CodedError(unreadable(method, checked.problem), { code: "app_error" })
}

function unreadable(method: string, { pointer, message }: SchemaProblem): string {
  return `This CLI can't read Parity's answer to ${method} (${pointer || "/"}: ${message}). Update Parity and @parity-app/cli, then try again.`
}

/** A readable account of an exec call, for terminals and for agents. */
export function describeExec(result: ExecResponse): string {
  const lines: string[] = []

  if (result.ok) {
    lines.push(result.applied ? "Done. The changes are on the canvas as one undoable step." : "Done. Nothing changed.")
  } else {
    const error = result.error
    lines.push(`Failed, nothing changed: ${error?.message ?? "unknown error"}`)

    if (error?.retryable) {
      lines.push("Nothing in the request was wrong; run it again.")
    }

    if (error?.editId) {
      lines.push(`Fix it by retrying with editId "${error.editId}" and edits ({find, replace}) to the snippet.`)
    }
  }

  if (result.output.length > 0) {
    lines.push("", "Output:", ...result.output)
  }

  const created = Object.entries(result.created)

  if (created.length > 0) {
    lines.push("", "Created:", ...created.map(([name, id]) => `  ${name} = ${id}`))
  }

  lines.push(...describeWarnings(result))

  if (result.discarded?.length) {
    lines.push("", "Discarded by Replace (reapply what you still want to the new node):")

    for (const { design, replaced, replacement, nodes } of result.discarded) {
      lines.push(`  ${design}/${replaced}, now ${replacement}:`)

      for (const node of nodes) {
        const where = [
          node.viewports && `viewports ${node.viewports.join(", ")}`,
          node.states && `states ${node.states.join(", ")}`,
          node.variants && `variants ${node.variants.join(", ")}`
        ].filter(Boolean)

        lines.push(`    ${node.name ? `${node.name} (${node.id})` : node.id}: ${where.join("; ")}`)
      }
    }
  }

  if (result.screenshots.length > 0) {
    lines.push(
      "",
      "Screenshots:",
      ...result.screenshots.map((shot) => `  ${shot.design} / ${shot.state} / ${shot.mode}: ${shot.path}`)
    )
  }

  return lines.join("\n")
}

const warningHeadings = {
  error: "Render failures (these frames weren't checked):",
  warning: "Warnings (fix these next):",
  suggestion: "Suggestions:"
} as const

/**
 * The warnings under a heading for each severity, so a failed render doesn't read like a naming tip. The lines are
 * the app's, one per group in the groups' order; an app older than PAR-460 sends no groups, so they're all warnings.
 */
function describeWarnings(result: ExecResponse): string[] {
  const lines: string[] = []

  for (const severity of ["error", "warning", "suggestion"] as const) {
    const matching = result.warnings.filter(
      (_, index) => (result.warningGroups?.[index]?.severity ?? "warning") === severity
    )

    if (matching.length > 0) {
      lines.push("", warningHeadings[severity], ...matching.map((warning) => `  ${warning}`))
    }
  }

  return lines
}

/** Where a tab's edits stand: the revision, what's applied and undoable, what's on disk, and what failed to write. */
export function describeStatus(result: StatusResponse): string {
  const { tab, revision, unsaved, undo, redo, save, errors } = result
  const steps = (count: number) => (count === 1 ? "1 step" : `${count} steps`)
  const lines = [`${tab.name} is at revision ${revision}.`]

  if (unsaved.length === 0) {
    lines.push("Everything applied is saved.")
  } else {
    const how = result.autosave
      ? "Automatic saving is on, so they save themselves."
      : "They wait for the person to save; agents can't."

    lines.push(`${unsaved.length === 1 ? "1 file isn't" : `${unsaved.length} files aren't`} saved. ${how}`)

    for (const file of unsaved) {
      const parts: string[] = []

      if (file.designs) {
        const { added, changed, removed } = file.designs

        if (added.length > 0) {
          parts.push(`added ${added.join(", ")}`)
        }

        if (changed.length > 0) {
          parts.push(`changed ${changed.join(", ")}`)
        }

        if (removed.length > 0) {
          parts.push(`removed ${removed.join(", ")}`)
        }
      }

      if (file.modes) {
        parts.push("changed the modes")
      }

      if (file.tokens?.length) {
        parts.push(`token values ${file.tokens.join(", ")}`)
      }

      if (file.more) {
        parts.push(`and ${file.more} more`)
      }

      lines.push(`  ${file.path}${parts.length > 0 ? `: ${parts.join("; ")}` : ""}`)
    }
  }

  if (save.status === "saving") {
    lines.push("Saving now.")
  }

  if (errors.length > 0) {
    lines.push("", "Failed to write:", ...errors.map((entry) => `  ${entry.path}: ${entry.error}`))
  }

  lines.push("", `Undo has ${steps(undo.count)}${undo.labels?.length ? `: ${undo.labels.join(", ")}` : ""}.`)

  if (redo.count > 0) {
    lines.push(`Redo has ${steps(redo.count)}${redo.labels?.length ? `: ${redo.labels.join(", ")}` : ""}.`)
  }

  return lines.join("\n")
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

const impactOrder = ["critical", "serious", "moderate", "minor"]

interface LayerLine {
  name: string
  nodes: string[]
  detail: string
  fix?: string
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

  for (const finding of findings) {
    rules.set(finding.rule, [...(rules.get(finding.rule) ?? []), finding])
  }

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
        ...(fixLine(finding) ? { fix: fixLine(finding) } : {}),
        frames: []
      }

      layer.frames.push({ state: finding.state, mode: finding.mode })
      byLayer.set(key, layer)
    }

    const alike = new Map<string, LayerLine>()

    for (const layer of byLayer.values()) {
      const same = JSON.stringify([layer.name, layer.detail, layer.frames])
      const existing = alike.get(same)

      if (existing) {
        existing.nodes.push(...layer.nodes)
      } else {
        alike.set(same, layer)
      }
    }

    for (const layer of alike.values()) {
      const where = layer.frames.length === frames && frames > 1 ? "every frame" : frameList(layer.frames)
      const ids = layer.nodes.length > 0 ? ` (${layer.nodes.join(", ")})` : ""
      lines.push(`  ${layer.name}${ids}, in ${where}: ${layer.detail}`)

      if (layer.fix) {
        lines.push(`    ${layer.fix}`)
      }
    }

    lines.push(`  How to fix it: ${helpUrl}`)
  }

  if (result.warnings.length > 0) {
    lines.push("", "Warnings:", ...result.warnings.map((warning) => `  ${warning}`))
  }

  lines.push("", "Automated checks find some issues, not all. Try the design with a keyboard and a screen reader too.")

  return lines.join("\n")
}

/** A contrast failure's fix in a sentence, naming the style to set so it can be passed to execute. */
function fixLine(finding: AccessibilityFinding): string | undefined {
  const fix = finding.contrast?.fix

  if (fix === "none") {
    return "Fix: none of the project's color tokens pass on this background; change the background."
  }

  return fix && `Fix: set style.foreground to "${fix.token}", which reaches ${fix.ratio}:1 in every frame checked.`
}

/** A readable account of the layout problems in a design's frames, each once with the frames it's in. */
export function describeProblems(result: ProblemsResponse): string {
  const { design, problems, frames } = result
  const checked = `${design.name} (${design.id}), ${frames === 1 ? "1 frame" : `${frames} frames`}`
  const grouped = new Map<string, { problem: string; node?: string; frames: { state: string; mode: string }[] }>()

  for (const { problem, node: id, name, state, mode } of problems) {
    const node = id && name ? `${name} (${id})` : id
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

  if (result.warnings.length > 0) {
    lines.push("", "Warnings:", ...result.warnings.map((warning) => `  ${warning}`))
  }

  return lines.join("\n")
}

/** Tokens by category, each with its value in every theme that sets one. */
export function describeTokens({ tokens, total, truncated }: TokensResponse): string {
  if (tokens.length === 0) {
    return "No tokens match."
  }

  const count = `${total === 1 ? "1 token" : `${total} tokens`}${truncated ? `, the first ${tokens.length} shown` : ""}`
  const lines = [`${count}. Name them in styles without "--".`]

  if (truncated) {
    lines.push("Narrow them with category, source or search, or raise limit, to see the rest.")
  }

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

/**
 * The project's own components, by the file each is written in when that's known, then each library's, then the icon
 * libraries, then the exports left out and why, the components failing to draw and why, and what the person corrected
 * by hand.
 */
export function describeComponents({
  components,
  files = {},
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
    if (group) {
      lines.push(`${group}, as ${group}/Name:`, `  ${names.join(", ")}`, "")
    } else {
      lines.push(...ownComponents(names, files), "")
    }
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

    for (const entry of failing) {
      lines.push(`  ${entry.id}: ${entry.reason}`)
    }

    lines.push("")
  }

  const { include = [] } = corrections

  if (include.length > 0) {
    const name = (ref: ComponentRef) => (ref.export === "default" ? "the default export" : ref.export)
    lines.push("Corrected by hand in the project file:")

    for (const ref of include) {
      lines.push(`  listed: ${name(ref)}, in ${ref.path}`)
    }
  }

  return lines.join("\n").trimEnd()
}

/** The project's own components, under the file each is written in when the app says, files in order (PAR-167). */
function ownComponents(names: string[], files: Record<string, string>): string[] {
  const byFile = new Map<string, string[]>()
  const unplaced: string[] = []

  for (const name of names) {
    const file = files[name]

    if (file) {
      byFile.set(file, [...(byFile.get(file) ?? []), name])
    } else {
      unplaced.push(name)
    }
  }

  if (byFile.size === 0) {
    return ["The project's own:", `  ${names.join(", ")}`]
  }

  return [
    "The project's own, by file:",
    ...[...byFile].sort(([a], [b]) => a.localeCompare(b)).map(([file, inFile]) => `  ${file}: ${inFile.join(", ")}`),
    ...(unplaced.length > 0 ? [`  file not known yet: ${unplaced.join(", ")}`] : [])
  ]
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

    if (result.props.length === 0) {
      lines.push("  No props of its own. --all lists the attributes it passes on.")
    }
  }

  if (result.composition) {
    lines.push("", ...describeComposition(result.composition))
  }

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
  } else if (parents.status === "none") {
    lines.push("Needs nothing around it.")
  } else {
    lines.push(`What it needs around it is unknown: ${parents.reason}`)
  }

  if (holds.length > 0) {
    lines.push(`Holds: ${holds.join(", ")}`)
  }

  if (slots.length > 0) {
    lines.push(`Slots: ${slots.map((slot) => `${slot.key} (${slot.kind})`).join(", ")}`)
  }

  const reason = example.reason ? `: ${example.reason}` : ""
  lines.push(`Example for Insert, ${exampleStatus[example.status]}${reason}:`, `  ${JSON.stringify(example.node)}`)

  return lines
}

/** Frames as state and mode ids, naming a mode once when they share it: "default, error in desktop-light". */
function frameList(frames: { state: string; mode: string }[]): string {
  const modes = [...new Set(frames.map((frame) => frame.mode))]

  if (modes.length === 1) {
    return `${frames.map((frame) => frame.state).join(", ")} in ${modes[0]}`
  }

  return frames.map((frame) => `${frame.state} in ${frame.mode}`).join(", ")
}

/** Where a report went, what it's tied to and tagged with, and what went with it (PAR-646). */
export function describeReport(result: ReportResponse): string {
  const tied = [
    ...(result.traceId ? [`trace ${result.traceId}`] : []),
    ...(result.replayId ? [`replay ${result.replayId}`] : [])
  ]

  const tags = Object.entries(result.tags).map(([key, value]) => `${key} ${value}`)

  return [
    `Reported to Sentry: ${result.link}`,
    ...(tied.length > 0 ? [`Tied to ${tied.join(" and ")}.`] : []),
    ...(tags.length > 0 ? [`Tagged ${tags.join(", ")}.`] : []),
    `Sent with ${result.attachments.join(", ")}.`,
    "Sentry files it in Linear and links the issue from the feedback."
  ].join("\n")
}

/** A readable account of what a project's code wrote to the console, oldest first, with where each came from. */
export function describeConsole(result: ConsoleResponse): string {
  const { tab, entries, total, truncated } = result

  if (entries.length === 0) {
    return `${tab.name}'s code hasn't written anything to the console.`
  }

  const count = total === 1 ? "1 message" : `${total} messages`
  const shown = truncated ? `, the newest ${entries.length} shown` : ""
  const lines = [`${count} from ${tab.name}'s code${shown}, oldest first:`]

  for (const entry of entries) {
    const time = new Date(entry.last).toLocaleTimeString([], { hour12: false })
    const repeats = entry.count > 1 ? ` (${entry.count} times)` : ""
    const [first = "", ...rest] = entry.text.split("\n")
    lines.push("", `${time} ${entry.level}${repeats}: ${first}`, ...rest.map((line) => `  ${line}`))
    const offscreen = entry.where === "offscreen" ? ", in an offscreen render" : ""
    lines.push(`  at ${scriptPath(entry.source)}:${entry.line}${offscreen}${writtenBy(entry)}`)
  }

  return lines.join("\n")
}

/** The design a message came from, by id, with the state and mode it was drawn in, when the app knows (PAR-147). */
function writtenBy({ design, state, mode }: ConsoleEntry): string {
  if (!design) {
    return ""
  }

  const frame = [state, mode].filter(Boolean).join(", ")

  return `, from design ${design.slice(design.lastIndexOf("#") + 1)}${frame ? ` (${frame})` : ""}`
}

/** Compares two names alphabetically, with `name` before every other. */
function first(name: string, a: string, b: string): number {
  if (a === name) {
    return -1
  }

  if (b === name) {
    return 1
  }

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
