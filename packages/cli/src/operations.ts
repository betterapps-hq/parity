import {
  type AgentMethod,
  type AgentMethods,
  readRequest,
  replies,
  requestJsonSchema,
  requests,
  skillRequest
} from "@parity-app/agent/contracts"
import { z } from "zod"
import type { Routing } from "./client.ts"
import { type ExecResponse, execResponse, executionFailed, structuredExec } from "./execute.ts"

/**
 * Sends one call to the app and returns its answer once its schema has checked it. The method map is the one the app's
 * dispatch answers by (PAR-564).
 */
export type Send = <M extends AgentMethod>(
  method: M,
  params: AgentMethods[M]["params"],
  routing: Routing
) => Promise<AgentMethods[M]["result"]>

/** The methods an agent asks with input of its own: every one but `copy`, which the CLI asks on its own. */
type Requested = AgentMethod & keyof typeof requests

/**
 * The adapters share these contracts; they only parse their syntax and format results. Each operation's input and the
 * app's answer are the schemas in `@parity-app/agent/contracts`. `run` gives the canonical result, and `structured` the
 * data both CLI `--json` and MCP `structuredContent` return.
 */
export interface Operation<Result> {
  /** The input's JSON Schema, which MCP publishes. */
  inputSchema: Record<string, unknown>
  /** The input fields, which an error's path can point at. */
  fields: readonly string[]
  /**
   * Which copy of the app the call goes to, from its fields: one with a tab goes to the copy that has it open, one with
   * a root to the copy that has that project or the one the person used last, and one with neither asks every copy.
   */
  routing: Routing
  run(input: unknown, send: Send): Promise<Result>
  failed(result: Result): boolean
  structured(result: Result): Record<string, unknown>
}

interface Options<Result> {
  failed?: (result: Result) => boolean
  structured?: (result: Result) => Record<string, unknown>
}

/**
 * An operation whose canonical result is built from the app's checked answer, given the checked request. A request's
 * error points at the field, since an operation's fields are flat.
 */
function mapped<M extends Exclude<Requested, "exec">, Result extends object>(
  method: M,
  result: (reply: AgentMethods[M]["result"], request: AgentMethods[M]["params"]) => Result,
  options: Options<Result> = {}
): Operation<Result> {
  const input: z.ZodObject = requests[method]
  const fields = Object.keys(input.shape)
  const routing = routingFor(fields)
  return {
    inputSchema: requestJsonSchema(input),
    fields,
    routing,
    async run(given, send) {
      const request = readRequest(input, given, 1) as AgentMethods[M]["params"]
      return result(await send(method, request, routing), request)
    },
    failed: options.failed ?? (() => false),
    structured: options.structured ?? ((value) => Object.fromEntries(Object.entries(value)))
  }
}

/** Which copy a call goes to, from its fields: see `Operation.routing`. */
function routingFor(fields: readonly string[]): Routing {
  if (fields.includes("tab")) return "tab"
  if (fields.includes("root")) return "open"
  return "copies"
}

/** An operation whose canonical result is the app's answer. */
function operation<M extends Exclude<Requested, "exec" | "tabs" | "tokens">>(
  method: M,
  options: Options<AgentMethods[M]["result"]> = {}
): Operation<AgentMethods[M]["result"]> {
  return mapped(method, (answer) => answer, options)
}

/** The first `count` items, with how many there were, so a reply says when it left some out. */
export function bounded<T>(items: T[], count: number, keep: "first" | "last" = "first") {
  const kept = keep === "first" ? items.slice(0, count) : items.slice(Math.max(0, items.length - count))
  return { items: kept, total: items.length, truncated: kept.length < items.length }
}

// The results the CLI builds rather than passing the app's answer on: every copy's tabs, and the bounded reads.
const truncation = {
  total: z.int().describe("How many there were before the limit."),
  truncated: z.boolean().describe("Some were left out; narrow the read or raise limit.")
}
const tabsResult = z.looseObject({ tabs: replies.tabs })
const consoleResult = replies.console.extend({
  entries: replies.console.shape.entries.describe("The newest entries, up to the limit, oldest first."),
  ...truncation
})
const tokensResult = z.looseObject({ tokens: replies.tokens, ...truncation })
export type TabsResponse = z.output<typeof tabsResult>
export type ConsoleResponse = z.output<typeof consoleResult>
export type TokensResponse = z.output<typeof tokensResult>

export const operations = {
  tabs: mapped("tabs", (tabs): TabsResponse => ({ tabs })),
  state: operation("state"),
  status: operation("status"),
  modes: operation("modes"),
  open: operation("open"),
  screenshot: mapped(
    "screenshot",
    (reply): ExecResponse => execResponse(reply, Object.keys(requests.screenshot.shape)),
    { failed: executionFailed, structured: structuredExec }
  ),
  problems: operation("problems", {
    failed: (result) => result.problems.length > 0
  }),
  accessibility: operation("accessibility", {
    failed: (result) => result.findings.length > 0
  }),
  console: mapped("console", ({ tab, entries }, request): ConsoleResponse => {
    const { items, total, truncated } = bounded(entries, request.limit, "last")
    return { tab, entries: items, total, truncated }
  }),
  tokens: mapped("tokens", (tokens, request): TokensResponse => {
    const { items, total, truncated } = bounded(tokens, request.limit)
    return { tokens: items, total, truncated }
  }),
  components: operation("components"),
  props: operation("props")
}

export const skillOperation = {
  inputSchema: requestJsonSchema(skillRequest),
  fields: Object.keys(skillRequest.shape),
  async run(input: unknown, read: (path: string) => Promise<string>): Promise<string> {
    return read(readRequest(skillRequest, input, 1).path)
  }
}
