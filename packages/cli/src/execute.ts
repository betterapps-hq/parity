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
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} must be a nonblank string`)
  return value
}

function edit(value: unknown): Edit {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Each edit must be an object")
  if (!("find" in value) || typeof value.find !== "string" || !value.find.length) {
    throw new Error("Each edit needs a nonempty find string")
  }
  if (!("replace" in value) || typeof value.replace !== "string") throw new Error("Each edit needs a replace string")
  if ("all" in value && typeof value.all !== "boolean") throw new Error("Edit all must be a boolean")
  if (Object.keys(value).some((key) => !["find", "replace", "all"].includes(key))) {
    throw new Error("Unknown edit field")
  }
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
  if (!code && !editId) throw new Error("Nothing to run: pass a snippet, or an editId with edits")
  if (code !== undefined && editId !== undefined) throw new Error("Pass a snippet or an editId, not both")
  if (input.edits !== undefined && !Array.isArray(input.edits)) throw new Error("edits must be an array")
  if (input.edits !== undefined && !editId) throw new Error("edits requires an editId")
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
    send: (method: string, params: Record<string, unknown>) => Promise<ExecResponse>
  ): Promise<ExecResponse> {
    const request = executeRequest(input)
    return send("exec", { ...request })
  }
}
