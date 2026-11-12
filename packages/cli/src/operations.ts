import {
  type AgentMethod,
  type AgentMethods,
  readRequest,
  replies,
  requestJsonSchema,
  requests,
  skillRequest
} from "@parity-app/agent/contracts"
import { type JsonValue, jsonValue } from "@parity-app/core/schema"
import { z } from "zod"
import type { FindResponse, PlacedReferencesResponse, Routing } from "./client.ts"
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

/**
 * What a caller sends an operation, before its contract checks it: MCP's arguments, which are JSON of any shape, or the
 * CLI's flags by field, with the unset ones undefined.
 */
export type OperationInput = JsonValue | OperationFields

/** An operation's input as fields, with the unset ones undefined, as the CLI gives them. */
export interface OperationFields {
  readonly [field: string]: JsonValue | undefined
}

/** An operation's input as fields, when it's an object, which the CLI's flags always are. */
export const inputFields = z.record(z.string(), jsonValue.optional())

/** An input's JSON Schema, which MCP publishes. */
export type InputSchema = z.core.JSONSchema.JSONSchema

/** The methods an agent asks with input of its own: every one but `copy`, which the CLI asks on its own. */
type Requested = AgentMethod & keyof typeof requests

/**
 * The adapters share these contracts; they only parse their syntax and format results. Each operation's input and the
 * app's answer are the schemas in `@parity-app/agent/contracts`. `run` gives the canonical result, and `structured` the
 * data both CLI `--json` and MCP `structuredContent` return.
 */
export interface Operation<Result> {
  /** The input's JSON Schema, which MCP publishes. */
  inputSchema: InputSchema
  /** The input fields, which an error's path can point at. */
  fields: readonly string[]
  /**
   * Which copy of the app the call goes to, from its fields: one with a tab goes to the copy that has it open, one with
   * a root to the copy that has that project or the one the person used last, and one with neither asks every copy.
   */
  routing: Routing
  run(input: OperationInput, send: Send): Promise<Result>
  failed(result: Result): boolean
  structured(result: Result): object
}

interface Options<Result> {
  /** Which copy the call goes to, when it isn't the one its fields say. */
  routing?: Routing
  failed?: (result: Result) => boolean
  structured?: (result: Result) => object
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
  const routing = options.routing ?? routingFor(fields)

  return {
    inputSchema: requestJsonSchema(input),
    fields,
    routing,
    async run(given, send) {
      // SAFETY: `input` is `requests[method]`, the schema `AgentMethods[M]["params"]` is inferred from; it's typed as a
      // plain object schema only so its shape can be read.
      const request = readRequest(input, given, 1) as AgentMethods[M]["params"]

      return result(await send(method, request, routing), request)
    },
    failed: options.failed ?? (() => false),
    structured: options.structured ?? ((value) => value)
  }
}

/** Which copy a call goes to, from its fields: see `Operation.routing`. */
function routingFor(fields: readonly string[]): Routing {
  if (fields.includes("tab")) {
    return "tab"
  }

  if (fields.includes("root")) {
    return "open"
  }

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

/** Problems that mean this copy can't search a source at all: it has no key for it, or nobody is signed in. */
const unsearchable: readonly string[] = ["no-key", "signed-out"]

/**
 * How a search for screens, pictures or videos is routed and read. Any running copy can search: main holds the keys, whatever
 * projects are open (PAR-829). --json and structuredContent leave the previews' base64 out; MCP shows them as images,
 * and the CLI names their files. A copy that can't search the source isn't a failure: the agent carries on without it.
 */
const finding: Options<FindResponse> = {
  routing: "tab-or-any",
  failed: (result) => result.problem !== undefined && !unsearchable.includes(result.problem.code),
  structured: (result) => ({
    ...result,
    found: result.found.map(({ preview, ...item }) => {
      if (!preview) {
        return item
      }

      const { data: _data, ...saved } = preview

      return { ...item, preview: saved }
    })
  })
}

/**
 * How the references on the canvas are read (PAR-889): --json and structuredContent leave the pictures' base64 out, as
 * a search's previews do.
 */
const placed: Options<PlacedReferencesResponse> = {
  structured: (result) => ({
    ...result,
    references: result.references.map(({ preview, ...reference }) => {
      if (!preview) {
        return reference
      }

      const { data: _data, ...saved } = preview

      return { ...reference, preview: saved }
    })
  })
}

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
  props: operation("props"),
  // A report goes to a running copy even with no project open, as long as it names no tab.
  report: withTestRun(operation("report", { routing: "tab-or-any" })),
  references: operation("references", finding),
  media: operation("media", finding),
  placedReferences: operation("placedReferences", placed),
  // Placing edits a design, so it goes to the copy with the tab, and a result that wasn't placed exits with 1.
  place: operation("place", { failed: (result) => !result.placed }),
  images: operation("images"),
  removeImage: operation("removeImage")
}

/**
 * A report names the test pass `PARITY_TEST_RUN` names, unless the agent says another, so it groups with the pass's
 * events in Sentry (PAR-646).
 */
function withTestRun<Result>(operation: Operation<Result>, env: NodeJS.ProcessEnv = process.env): Operation<Result> {
  return {
    ...operation,
    run(input, send) {
      const testRun = env.PARITY_TEST_RUN?.trim()
      const fields = inputFields.safeParse(input).data

      if (!testRun || !fields || fields.testRun !== undefined) {
        return operation.run(input, send)
      }

      return operation.run({ ...fields, testRun }, send)
    }
  }
}

export const skillOperation = {
  inputSchema: requestJsonSchema(skillRequest),
  fields: Object.keys(skillRequest.shape),
  async run(input: OperationInput, read: (path: string) => Promise<string>): Promise<string> {
    return read(readRequest(skillRequest, input, 1).path)
  }
}
