import { CodedError, readErrorDetails } from "@parity-app/core/errors"
import { invalidInput, type OperationError, operationError, operationErrorSchema } from "./errors.ts"

/** The shared execute contract. Transport adapters only rename fields and read their input sources. */
export interface ExecuteRequest {
  tab?: string
  label: string
  code?: string
  editId?: string
  edits?: Edit[]
}

export interface Edit {
  find: string
  replace: string
  all?: boolean
}

export interface Screenshot {
  path: string
  png: string
  design: string
  state: string
  mode: string
}

/** What one `Replace` threw away: the patches keyed to the old node and what was inside it (PAR-455). */
export interface Discarded {
  design: string
  replaced: string
  replacement: string
  nodes: { id: string; name?: string; viewports?: string[]; states?: string[]; variants?: string[] }[]
}

/**
 * Findings with the same category and message, once, with every place they were found (PAR-460). The app's
 * `warnings` are these as lines, in the same order.
 */
export interface WarningGroup {
  category: string
  severity: "error" | "warning" | "suggestion"
  message: string
  count: number
  at: string[]
}

/** What the app answers: a failure's message, with its details beside it when the app knew the cause. */
export interface ExecReply {
  ok: boolean
  applied: boolean
  output: string[]
  warnings: string[]
  /** Missing from a copy of the app older than PAR-460. */
  warningGroups?: WarningGroup[]
  error?: string
  details?: unknown
  editId?: string
  created: Record<string, string>
  discarded?: Discarded[]
  screenshots: Screenshot[]
}

/** The canonical result. Structured output is this without the screenshots' image data. */
export interface ExecResponse {
  ok: boolean
  applied: boolean
  output: string[]
  warnings: string[]
  warningGroups?: WarningGroup[]
  /** Set when the call failed, with the editId to retry a snippet by. */
  error?: OperationError
  created: Record<string, string>
  /** Set when a Replace threw away responsive, state or variant patches. */
  discarded?: Discarded[]
  screenshots: Screenshot[]
}

/** The same request fields in both adapters' paths, before MCP renames label and code. */
const executeFields = ["tab", "label", "code", "editId", "edits"]

/** A reply as the canonical result: the failure's message, code and retry id together in one error. */
export function execResponse(reply: ExecReply, fields: readonly string[] = executeFields): ExecResponse {
  const { error, details, editId, ...rest } = reply
  if (reply.ok || error === undefined) return rest
  const coded = readErrorDetails(details)
  const failure = operationError(
    coded ? new CodedError(error, coded) : new CodedError(error, { code: "execution_failed" }),
    fields
  )
  return { ...rest, error: { ...failure, ...(editId ? { editId } : {}) } }
}

/** The result as structured data: everything but image data, which MCP sends as image blocks. */
export function structuredExec(result: ExecResponse): Record<string, unknown> {
  return { ...result, screenshots: result.screenshots.map(({ png: _png, ...shot }) => shot) }
}

const screenshotSchema = {
  type: "object",
  properties: {
    path: { type: "string", description: "Where the PNG was saved." },
    design: { type: "string" },
    state: { type: "string" },
    mode: { type: "string" }
  },
  required: ["path", "design", "state", "mode"]
}

const strings = { type: "array", items: { type: "string" } }

const discardedSchema = {
  type: "array",
  description:
    "Patches each Replace threw away with the node it swapped out. Present only when there were some; reapply what's " +
    "still wanted to the replacement with Responsive, Update with a state, or UpdateState.",
  items: {
    type: "object",
    properties: {
      design: { type: "string" },
      replaced: { type: "string", description: "The node Replace swapped out." },
      replacement: { type: "string", description: "The node that took its place." },
      nodes: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string", description: "The old node's id, or instance/inner path." },
            name: { type: "string" },
            viewports: { ...strings, description: "Viewport ids it had responsive patches for." },
            states: { ...strings, description: "State ids it had patches in." },
            variants: { ...strings, description: "Variant options it had patches in, as param=option." }
          },
          required: ["id"]
        }
      }
    },
    required: ["design", "replaced", "replacement", "nodes"]
  }
}

const warningGroupsSchema = {
  type: "array",
  description:
    "The warnings as data, in the same order: each finding once, with how many places and which. Errors come first, " +
    "then warnings, then suggestions.",
  items: {
    type: "object",
    properties: {
      category: {
        type: "string",
        description:
          "Stable: render_failed, unknown_component, unknown_component_design, unknown_prop, invalid_option, " +
          "not_a_token, not_a_length_token, overlap, title_clearance, canvas_overlaps, kind_changed or " +
          "unnamed_layout. overlap and title_clearance cover boards this call created, changed or moved: " +
          "overlap when two boards collide, title_clearance when they're clear but one's title covers the other. " +
          "canvas_overlaps counts the rest of the canvas's; call Overlaps() to check every board."
      },
      severity: {
        type: "string",
        enum: ["error", "warning", "suggestion"],
        description: "error: a render failed, so a check or screenshot is missing. suggestion: worth doing, not wrong."
      },
      message: { type: "string", description: "What's wrong and what to do about it." },
      count: { type: "integer", minimum: 1, description: "How many places it was found." },
      at: { ...strings, description: "Every place: a node's design/node path, or a frame. Empty for a whole board." }
    },
    required: ["category", "severity", "message", "count", "at"]
  }
}

/** Execute's and screenshot's structured result. */
export const execOutputSchema = {
  type: "object",
  properties: {
    ok: { type: "boolean" },
    applied: { type: "boolean", description: "Changes landed on the canvas as one undoable step." },
    output: { type: "array", items: { type: "string" }, description: "Lines from Print." },
    warnings: { ...strings, description: "One line per warning group, places first." },
    warningGroups: warningGroupsSchema,
    created: {
      type: "object",
      additionalProperties: { type: "string" },
      description: "Names of designs and nodes created, mapped to their ids."
    },
    discarded: discardedSchema,
    screenshots: { type: "array", items: screenshotSchema },
    error: operationErrorSchema
  },
  required: ["ok", "applied", "output", "warnings", "created", "screenshots"]
}

const defaultLabel = "Edit designs"

/** What every call's tab field says, the same in the CLI's help, MCP tools and the skill (PAR-514). */
export const tabDescription =
  'Tab id, project root or name, or "active" for what the person is looking at. Defaults to the open project the ' +
  'current folder is in, else "active".'

/** Canonical properties, also used by MCP discovery after renaming label and code. */
const executeProperties = {
  tab: { type: "string", minLength: 1, description: tabDescription },
  label: {
    type: "string",
    minLength: 1,
    default: defaultLabel,
    description: 'Shown while it runs. Prefer 3 to 8 words, e.g. "Add pricing tiers".'
  },
  code: { type: "string", minLength: 1, description: "The snippet. Omit when retrying with editId." },
  editId: { type: "string", minLength: 1, description: "The failed call's editId, to retry with edits." },
  edits: {
    type: "array",
    description: "Exact find and replace edits to the failed snippet, applied in order.",
    items: {
      type: "object",
      additionalProperties: false,
      properties: { find: { type: "string", minLength: 1 }, replace: { type: "string" }, all: { type: "boolean" } },
      required: ["find", "replace"]
    }
  }
}

function optionalText(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== "string" || !value.trim()) throw invalidInput(field, `${field} must be a nonblank string`)
  return value
}

function edit(value: unknown, index: number): Edit {
  const at = `edits/${index}`
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalidInput(at, "Each edit must be an object")
  if (!("find" in value) || typeof value.find !== "string" || !value.find.length) {
    throw invalidInput(`${at}/find`, "Each edit needs a nonempty find string")
  }
  if (!("replace" in value) || typeof value.replace !== "string") {
    throw invalidInput(`${at}/replace`, "Each edit needs a replace string")
  }
  if ("all" in value && typeof value.all !== "boolean") throw invalidInput(`${at}/all`, "Edit all must be a boolean")
  const unknown = Object.keys(value).find((key) => !["find", "replace", "all"].includes(key))
  if (unknown) throw invalidInput(`${at}/${unknown}`, "Unknown edit field")
  return {
    find: value.find,
    replace: value.replace,
    ...("all" in value && typeof value.all === "boolean" ? { all: value.all } : {})
  }
}

/** Validate once, before either transport sends a request to the desktop. Never rewrite snippet or patch text. */
export function executeRequest(input: Record<string, unknown>): ExecuteRequest {
  const tab = optionalText(input.tab, "tab")
  const label = optionalText(input.label, "label") ?? defaultLabel
  const code = optionalText(input.code, "code")
  const editId = optionalText(input.editId, "editId")
  if (!code && !editId) throw invalidInput("code", "Nothing to run: pass a snippet, or an editId with edits")
  if (code !== undefined && editId !== undefined) throw invalidInput("editId", "Pass a snippet or an editId, not both")
  if (input.edits !== undefined && !Array.isArray(input.edits)) throw invalidInput("edits", "edits must be an array")
  if (input.edits !== undefined && !editId) throw invalidInput("edits", "edits requires an editId")
  const edits = Array.isArray(input.edits) ? input.edits.map(edit) : undefined
  return {
    label,
    ...(tab === undefined ? {} : { tab }),
    ...(code === undefined ? {} : { code }),
    ...(editId === undefined ? {} : { editId, edits: edits ?? [] })
  }
}

/** Execution failures have the same meaning for CLI exits and MCP tool errors. */
export function executionFailed(result: ExecResponse): boolean {
  return !result.ok
}

/** One handler for both adapters. Caller identity stays in the transport's connection context. */
export const executeOperation = {
  failed: executionFailed,
  fields: executeFields,
  outputSchema: execOutputSchema,
  structured: structuredExec,
  /** Discovery uses the same contract, with just the two historical MCP field aliases. */
  inputSchema(names = { label: "label", code: "code" }): Record<string, unknown> {
    const { label, code, ...rest } = executeProperties
    return {
      type: "object",
      properties: { ...rest, [names.label]: label, [names.code]: code },
      oneOf: [
        { required: [names.code], not: { anyOf: [{ required: ["editId"] }, { required: ["edits"] }] } },
        { required: ["editId"], not: { required: [names.code] } }
      ]
    }
  },
  async run(
    input: Record<string, unknown>,
    send: (method: string, params: Record<string, unknown>) => Promise<ExecReply>
  ): Promise<ExecResponse> {
    const request = executeRequest(input)
    return execResponse(await send("exec", { ...request }))
  }
}
