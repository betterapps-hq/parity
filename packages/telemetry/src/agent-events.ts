import { z } from "zod"
import type { Attributes } from "./envelope.ts"
import { defineEvent } from "./events.ts"
import { createScrubber, type Scrubber } from "./scrub.ts"
import { errorCode, type SpanEnd } from "./trace.ts"

/*
 * Agents calling the app (PAR-641): each call as the service answers it, and the CLI's own runs, the copies it can't
 * reach and the MCP sessions it serves. The service and the CLI record them; what each call's span says is read here,
 * from the request's body and the answer, so it's tested without either.
 */

const count = (meaning: string) => z.number().int().nonnegative().describe(meaning)

/** How an agent reached the app: the `parity` command, or the MCP server it serves. */
export const agentTransports = ["cli", "mcp"] as const

export type AgentTransport = (typeof agentTransports)[number]

export const agentCalled = defineEvent(
  "agent.called",
  z.object({
    method: z.string().describe("The operation called, such as `exec` or `screenshot`, or `unreadable`"),
    transport: z.enum(agentTransports).describe("How the agent called: `cli` for the parity command, `mcp` for MCP"),
    agent: z.string().optional().describe("The caller's declared name, as PAR-450 has it"),
    client: z.string().optional().describe("The MCP client's program, such as `claude-code`"),
    input: z
      .string()
      .optional()
      .describe("The call's params as JSON, without an exec call's snippet, cut at 2,000 characters"),
    snippet: z.string().optional().describe("An exec call's snippet, cut at 10,000 characters"),
    resultBytes: count("How long the answer was, as JSON, in characters").optional(),
    code: z.string().optional().describe("The error code, when it failed"),
    retryable: z.boolean().optional().describe("Whether the failure says sending it again unchanged can succeed"),
    alternatives: count("How many alternatives the failure offered instead of what was asked for").optional(),
    warnings: z
      .string()
      .optional()
      .describe(
        "The answer's warning groups by category, with how many places each, such as `overlap:2 unknown_prop:1`"
      )
  }),
  {
    level: "info",
    sentBy: ["service"],
    when: "The agent server answers a call from the CLI or MCP, from reading it to the answer."
  }
)

export const agentServerFailed = defineEvent(
  "agent.serverFailed",
  z.object({
    message: z.string().describe("Why it couldn't start"),
    code: z.string().optional().describe("The error's code, such as Node's `EACCES`")
  }),
  { level: "error", sentBy: ["service"], when: "The agent server can't start, so agents can't reach this copy." }
)

export const cliRan = defineEvent(
  "cli.ran",
  z.object({
    command: z.string().describe("The command, such as `exec` or `mcp`, or `help` with none"),
    flags: z.array(z.string()).describe("The flags given, by name, without their values"),
    exitCode: count("What the command exited with: 0, or 1 when it failed or found problems").optional(),
    code: z.string().optional().describe("The error code, when it failed")
  }),
  { level: "info", sentBy: ["cli"], when: "A `parity` command runs, until it's done." }
)

export const cliConnectFailed = defineEvent(
  "cli.connectFailed",
  z.object({
    code: z
      .enum(["not_running", "not_answering"])
      .describe("`not_running` when no copy of the app is registered, `not_answering` when none registered answered"),
    copies: count("How many copies of the app were registered")
  }),
  { level: "warn", sentBy: ["cli"], when: "The CLI can't reach a running copy of the app for a call." }
)

export const cliVersionMismatch = defineEvent(
  "cli.versionMismatch",
  z.object({
    cause: z
      .enum(["app_newer", "unreadable_answer"])
      .describe(
        "`app_newer` when the app's registry entry is newer, `unreadable_answer` when its answer doesn't check"
      ),
    cliRegistry: count("The registry version this CLI reads"),
    appRegistry: count("The registry version the app wrote, for `app_newer`").optional(),
    method: z.string().optional().describe("The method whose answer couldn't be read, for `unreadable_answer`")
  }),
  { level: "warn", sentBy: ["cli"], when: "The CLI and the app it calls are versions apart that don't fit." }
)

export const mcpSession = defineEvent(
  "mcp.session",
  z.object({
    client: z.string().optional().describe("The MCP client's name from `initialize`, such as `claude-code`"),
    clientVersion: z.string().optional().describe("The MCP client's version from `initialize`"),
    protocolVersion: z.string().optional().describe("The MCP protocol version the client asked for")
  }),
  { level: "info", sentBy: ["cli"], when: "An MCP client starts a session with `parity mcp`." }
)

export const agentEvents = [agentCalled, agentServerFailed] as const

/** The events the CLI records in its own process. */
export const cliEvents = [cliRan, cliConnectFailed, cliVersionMismatch, mcpSession] as const

const inputLimit = 2000
const snippetLimit = 10_000

function cut(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit)}…` : text
}

/**
 * The fields each method's input keeps out of telemetry: what an agent searched for, and which result it placed where,
 * as `connectors.*` promise never to send (PAR-829). The filters, limit and connector stay, since they're the
 * connectors' own words.
 */
const privateFields = new Map([
  ["references", ["query", "exclude"]],
  ["media", ["query", "exclude"]],
  ["place", ["id", "node"]]
])

function withoutPrivate(
  method: string,
  params: Record<string, z.core.util.JSONType | undefined> | undefined
): Record<string, z.core.util.JSONType | undefined> | undefined {
  const hidden = privateFields.get(method)

  return params && hidden
    ? Object.fromEntries(Object.entries(params).filter(([name]) => !hidden.includes(name)))
    : params
}

/** Text with something besides spaces in it, as given, or nothing for anything else. */
const someText = z
  .string()
  .refine((value) => value.trim() !== "")
  .optional()
  .catch(undefined)

/** What a call's body says, each part read when it's the kind expected. */
const callBody = z.object({
  method: someText,
  agent: someText,
  client: someText,
  transport: z.enum(agentTransports).optional().catch(undefined),
  params: z.record(z.string(), z.json()).optional().catch(undefined)
})

/** What a failure's `details` says: its code, whether to retry, and the alternatives it offers. */
const failureDetails = z
  .object({
    code: someText,
    retryable: z.boolean().optional().catch(undefined),
    alternatives: z.array(z.unknown()).optional().catch(undefined)
  })
  .catch({})

/** A warning group's category and how many places it has, when they're the kinds expected. */
const warningGroup = z
  .object({ category: z.string().optional().catch(undefined), count: z.number().optional().catch(undefined) })
  .catch({})

/** The parts of an answer that its span reads. */
const callAnswer = z
  .object({
    ok: z.unknown().optional(),
    details: failureDetails.optional(),
    warningGroups: z.array(warningGroup).optional().catch(undefined)
  })
  .catch({})

/** The details a failed call's error carries. */
const failedCall = z.object({ details: failureDetails.optional() }).catch({})

/** Scrubs without a project's `.env` values, for callers that have none. */
const scrubWithoutSecrets = createScrubber()

/** What `agent.called` starts with. */
export type AgentCallStart = z.input<typeof agentCalled.schema>

/**
 * What an agent call's span starts with, from the body the CLI posted, before the app checks it: the method, how it
 * came, who sent it, its params and an exec call's snippet apart. A body that isn't a JSON object is `unreadable`. A
 * CLI older than PAR-641 doesn't say how it came, so a call naming an MCP client counts as MCP.
 *
 * The body's values are scrubbed with `scrubber`, given the open projects' `.env` values, before anything is
 * serialized or cut: a secret escaped by `JSON.stringify` or cut short at a limit no longer matches, so the scrubbing
 * every event gets later couldn't find it.
 */
export function agentCallStart(body: string, scrubber: Pick<Scrubber, "value"> = scrubWithoutSecrets): AgentCallStart {
  let read: z.ZodSafeParseResult<z.output<typeof callBody>>

  try {
    read = callBody.safeParse(scrubber.value(JSON.parse(body)))
  } catch {
    return { method: "unreadable", transport: "cli" }
  }

  if (!read.success) {
    return { method: "unreadable", transport: "cli" }
  }

  const sent = read.data
  const method = sent.method ?? "unreadable"
  const { agent, client, params } = sent
  const transport: AgentTransport = sent.transport ?? (client === undefined ? "cli" : "mcp")
  const snippet = method === "exec" ? someText.parse(params?.code) : undefined
  const rest = withoutPrivate(method, snippet === undefined ? params : { ...params, code: undefined })
  const json = rest ? JSON.stringify(rest) : "{}"
  const input = json === "{}" ? undefined : cut(json, inputLimit)
  const start: AgentCallStart = { method, transport }

  if (agent) {
    start.agent = cut(agent, 80)
  }

  if (client) {
    start.client = cut(client, 80)
  }

  if (input) {
    start.input = input
  }

  if (snippet) {
    start.snippet = cut(snippet, snippetLimit)
  }

  return start
}

/** A failure's code, whether it says to retry and how many alternatives it offers, from its `details`. */
function failureAttributes(
  { retryable, alternatives }: z.output<typeof failureDetails>,
  code: string | undefined
): Attributes {
  const attributes: Attributes = {}

  if (code) {
    attributes.code = code
  }

  if (retryable !== undefined) {
    attributes.retryable = retryable
  }

  if (alternatives) {
    attributes.alternatives = alternatives.length
  }

  return attributes
}

/** The warning groups' categories with how many places each, in the order they came: `overlap:2 unknown_prop:1`. */
function warningCategories(groups: readonly z.output<typeof warningGroup>[] | undefined): string | undefined {
  const counts = new Map<string, number>()

  for (const { category, count: places } of groups ?? []) {
    if (category === undefined) {
      continue
    }

    counts.set(category, (counts.get(category) ?? 0) + (places ?? 1))
  }

  return counts.size > 0 ? [...counts].map(([category, places]) => `${category}:${places}`).join(" ") : undefined
}

/**
 * How an answered call's span ends: its size and warnings, and, for a snippet or screenshot that failed without
 * throwing, `error` with the failure's code, `retryable` and alternatives.
 */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- the I/O boundary: any method's answer, which this reads
export function agentCallAnswered(result: unknown, resultBytes: number): SpanEnd {
  const answer = callAnswer.parse(result)
  const warnings = warningCategories(answer.warningGroups)
  const attributes: Attributes = { resultBytes }

  if (warnings) {
    attributes.warnings = warnings
  }

  if (answer.ok !== false) {
    return { outcome: "ok", attributes }
  }

  const details = answer.details ?? {}
  const code = details.code ?? "execution_failed"

  return { outcome: "error", attributes: { ...attributes, ...failureAttributes(details, code) } }
}

/** How a failed call's span ends: its code, whether to retry, and how many alternatives it offered. */
export function agentCallFailed(cause: unknown): SpanEnd {
  const { details = {} } = failedCall.parse(cause)

  return { outcome: "error", attributes: failureAttributes(details, errorCode(cause)) }
}
