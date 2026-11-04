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

/** What the app answers: a failure's message, with its details beside it when the app knew the cause. */
export interface ExecReply {
  ok: boolean
  applied: boolean
  output: string[]
  warnings: string[]
  error?: string
  details?: unknown
  editId?: string
  created: Record<string, string>
  screenshots: Screenshot[]
}

/** The canonical result. Structured output is this without the screenshots' image data. */
export interface ExecResponse {
  ok: boolean
  applied: boolean
  output: string[]
  warnings: string[]
  /** Set when the call failed, with the editId to retry a snippet by. */
  error?: OperationError
  created: Record<string, string>
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

/** Execute's and screenshot's structured result. */
export const execOutputSchema = {
  type: "object",
  properties: {
    ok: { type: "boolean" },
    applied: { type: "boolean", description: "Changes landed on the canvas as one undoable step." },
    output: { type: "array", items: { type: "string" }, description: "Lines from Print." },
    warnings: { type: "array", items: { type: "string" } },
    created: {
      type: "object",
      additionalProperties: { type: "string" },
      description: "Names of designs and nodes created, mapped to their ids."
    },
    screenshots: { type: "array", items: screenshotSchema },
    error: operationErrorSchema
  },
  required: ["ok", "applied", "output", "warnings", "created", "screenshots"]
}

const defaultLabel = "Edit designs"

/** Canonical properties, also used by MCP discovery after renaming label and code. */
const executeProperties = {
  tab: { type: "string", minLength: 1, description: "Tab id, project root or name. Defaults to the active tab." },
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
