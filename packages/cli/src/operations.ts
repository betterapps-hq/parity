import { readRequest, replies, requestJsonSchema, requests, skillRequest } from "@parity-app/agent/contracts"
import { z } from "zod"
import type { Routing } from "./client.ts"
import { type ExecResponse, execResponse, executionFailed, structuredExec } from "./execute.ts"

/** Sends one call to the app and returns its answer once `reply` has checked it. */
export type Send = <Reply extends z.ZodType>(
  method: string,
  params: Record<string, unknown>,
  routing: Routing,
  reply: Reply
) => Promise<z.output<Reply>>

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
function mapped<Input extends z.ZodObject, Reply extends z.ZodType, Result extends object>(
  method: string,
  input: Input,
  reply: Reply,
  result: (reply: z.output<Reply>, request: z.output<Input>) => Result,
  options: Options<Result> = {}
): Operation<Result> {
  const fields = Object.keys(input.shape)
  const routing = routingFor(fields)
  return {
    inputSchema: requestJsonSchema(input),
    fields,
    routing,
    async run(given, send) {
      const request = readRequest(input, given, 1)
      return result(await send(method, request, routing, reply), request)
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
function operation<Input extends z.ZodObject, Reply extends z.ZodType<object>>(
  method: string,
  input: Input,
  reply: Reply,
  options: Options<z.output<Reply>> = {}
): Operation<z.output<Reply>> {
  return mapped(method, input, reply, (answer) => answer, options)
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
  tabs: mapped("tabs", requests.tabs, replies.tabs, (tabs): TabsResponse => ({ tabs })),
  state: operation("state", requests.state, replies.state),
  status: operation("status", requests.status, replies.status),
  modes: operation("modes", requests.modes, replies.modes),
  open: operation("open", requests.open, replies.open),
  screenshot: mapped(
    "screenshot",
    requests.screenshot,
    replies.screenshot,
    (reply): ExecResponse => execResponse(reply, Object.keys(requests.screenshot.shape)),
    { failed: executionFailed, structured: structuredExec }
  ),
  problems: operation("problems", requests.problems, replies.problems, {
    failed: (result) => result.problems.length > 0
  }),
  accessibility: operation("accessibility", requests.accessibility, replies.accessibility, {
    failed: (result) => result.findings.length > 0
  }),
  console: mapped("console", requests.console, replies.console, ({ tab, entries }, request): ConsoleResponse => {
    const { items, total, truncated } = bounded(entries, request.limit, "last")
    return { tab, entries: items, total, truncated }
  }),
  tokens: mapped("tokens", requests.tokens, replies.tokens, (tokens, request): TokensResponse => {
    const { items, total, truncated } = bounded(tokens, request.limit)
    return { tokens: items, total, truncated }
  }),
  components: operation("components", requests.components, replies.components),
  props: operation("props", requests.props, replies.props)
}

export const skillOperation = {
  inputSchema: requestJsonSchema(skillRequest),
  fields: Object.keys(skillRequest.shape),
  async run(input: unknown, read: (path: string) => Promise<string>): Promise<string> {
    return read(readRequest(skillRequest, input, 1).path)
  }
}
