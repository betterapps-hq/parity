import type { AgentToolContribution, Fact, JsonSchema, JsonValue } from "@parity-app/extension"
import { z } from "zod"
import type { ExtensionStatus, HostState } from "./hosts.ts"
import type { LogLine } from "./protocol.ts"
import type { ExtensionFacts, TabFacts } from "./window-snapshot.ts"

/*
 * What agents see of a project's extensions through the agent API (PAR-1096): each extension found in the project, with
 * its commands, agent tools, node types and facts, so the same feature works by hand or by asking. An agent runs a
 * command or a tool by its id, and the tool's input is checked against the schema its manifest gives. For debugging
 * (PAR-1284), each also gives its halves' states and latest failures, and the extension that brings the room its sync
 * state, as `extensions.json` has them, so an agent sees what the person sees.
 */

/** How many of an extension's latest failures an agent sees. */
const keptFailures = 5

/** A failure an agent sees: core's call into a window module, or an error its Node half logged. */
export interface AgentFailure {
  half: "node" | "window"
  /** What core called in its window module, as `selection.onChange`; none for the Node half's. */
  api?: string
  message: string
  /** When, in milliseconds since 1970. */
  at: number
  /** Its stack, for the Node half's, when the line kept one. */
  stack?: string
}

/** An extension as an agent reads it. */
export interface AgentExtension {
  id: string
  name: string
  state: HostState
  /** Why it's stuck or crashed. */
  reason?: string
  commands: { id: string; title: string; note?: string }[]
  tools: { name: string; description: string; input: JsonSchema }[]
  nodeTypes: { id: string; name: string }[]
  /** Its facts about components, by component. */
  facts: { component: string; facts: Fact[] }[]
  /** Its halves' states: its Node half's host, and its window module in the tab, for those it has. */
  halves: { node?: HostState; window?: ExtensionFacts["halves"]["window"] }
  /** Its latest failures, oldest first, at most five of each half. */
  failures: AgentFailure[]
  /** The room's sync state in the tab, for the extension that brings it. */
  room?: ExtensionFacts["room"]
}

/**
 * A project's extensions as agents read them, from what its window is sent, with their logs for the Node halves'
 * failures and the tab's facts of its window modules (`extensions.json`) when the window gave them.
 */
export function agentExtensions(
  extensions: ExtensionStatus[],
  { logs = {}, tab }: { logs?: Record<string, LogLine[]>; tab?: TabFacts } = {}
): AgentExtension[] {
  return extensions.map((extension) => {
    const { contributes } = extension
    const inTab = tab?.extensions.find((each) => each.id === extension.id)

    const nodeFailures = (logs[extension.id] ?? [])
      .filter((line) => line.level === "error" && line.half !== "window")
      .slice(-keptFailures)
      .map(({ text, at, stack }): AgentFailure =>
        stack === undefined ? { half: "node", message: text, at } : { half: "node", message: text, at, stack }
      )

    const windowFailures = (inTab?.failures ?? []).map(({ api, message, at }): AgentFailure => ({
      half: "window",
      api,
      message,
      at
    }))

    const found: AgentExtension = {
      id: extension.id,
      name: extension.displayName,
      state: extension.state,
      commands: (contributes.commands ?? []).map(({ id, title, note }) =>
        note === undefined ? { id, title } : { id, title, note }
      ),
      tools: (contributes.agentTools ?? []).map(({ name, description, input }) => ({
        name,
        description,
        input: toolSchema(input)
      })),
      nodeTypes: (contributes.nodeTypes ?? []).map(({ id, name }) => ({ id, name })),
      facts: Object.entries(extension.facts).map(([component, facts]) => ({ component, facts })),
      halves: {},
      failures: [...nodeFailures, ...windowFailures].toSorted((a, b) => a.at - b.at)
    }

    if (extension.reason !== undefined) {
      found.reason = extension.reason
    }

    if (extension.node) {
      found.halves.node = extension.state
    }

    if (extension.window) {
      // A window module the tab hasn't started, or one the window couldn't say, is inactive.
      found.halves.window = inTab?.halves.window ?? "inactive"
    }

    if (inTab?.room) {
      found.room = inTab.room
    }

    return found
  })
}

/** A tool's input schema as JSON, which it is already, typed as JSON Schema is. */
function toolSchema(input: AgentToolContribution["input"]): JsonSchema {
  const schema: JsonSchema = { type: "object" }

  if (input.properties) {
    schema.properties = input.properties
  }

  if (input.required) {
    schema.required = input.required
  }

  return schema
}

/**
 * Checks an agent's input to a tool against the schema its manifest gives, and gives it back as the tool's handler
 * gets it. Throws, saying what's wrong with which field, when it doesn't fit.
 */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- the I/O boundary: what an agent sent, read here
export function readToolInput(tool: AgentToolContribution, input: unknown): Record<string, JsonValue> {
  const schema = z.fromJSONSchema({ ...toolSchema(tool.input), additionalProperties: false })
  const fits = schema.safeParse(input ?? {})

  if (!fits.success) {
    const problems = fits.error.issues.map((issue) =>
      issue.path.length > 0 ? `${issue.path.join(".")}: ${issue.message}` : issue.message
    )

    throw new Error(`${tool.name}'s input doesn't fit its schema. ${problems.join("; ")}`)
  }

  return z.record(z.string(), z.json()).parse(fits.data)
}
