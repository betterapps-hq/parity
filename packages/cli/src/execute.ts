import { readRequest, replies, requestJsonSchema, requests } from "@parity-app/agent/contracts"
import { CodedError, readErrorDetails } from "@parity-app/core/errors"
import type { z } from "zod"
import { failure, operationError } from "./errors.ts"
import type { Send } from "./operations.ts"

/** The shared execute contract. Transport adapters only rename fields and read their input sources. */
export type ExecuteRequest = z.output<typeof requests.exec>

/** What the app answers: a failure's message, with its details beside it when the app knew the cause. */
export type ExecReply = z.output<typeof replies.exec>
export type Screenshot = ExecReply["screenshots"][number]
export type Edit = z.output<(typeof requests.exec.options)[1]>["edits"][number]

/** The canonical result: the reply with its failure as one error, which carries the editId to retry a snippet by. */
const execResult = replies.exec.omit({ error: true, details: true, editId: true }).extend({ error: failure.optional() })
export type ExecResponse = z.output<typeof execResult>

/** The same request fields in both adapters' paths, before MCP renames label and code. */
const executeFields = ["tab", "label", "code", "editId", "edits"]

/** A reply as the canonical result: the failure's message, code and retry id together in one error. */
export function execResponse(reply: ExecReply, fields: readonly string[] = executeFields): ExecResponse {
  const { error, details, editId, ...rest } = reply
  if (reply.ok || error === undefined) return rest
  const coded = readErrorDetails(details)
  const failed = operationError(
    coded ? new CodedError(error, coded) : new CodedError(error, { code: "execution_failed" }),
    fields
  )
  return { ...rest, error: { ...failed, ...(editId ? { editId } : {}) } }
}

/** The result as structured data: everything but image data, which MCP sends as image blocks. */
export function structuredExec(result: ExecResponse): Record<string, unknown> {
  return { ...result, screenshots: result.screenshots.map(({ png: _png, ...shot }) => shot) }
}

/** Checks the request once, before either transport sends it to the desktop. Snippet and patch text stay as written. */
export function executeRequest(input: unknown): ExecuteRequest {
  return readRequest(requests.exec, input)
}

/** Execution failures have the same meaning for CLI exits and MCP tool errors. */
export function executionFailed(result: ExecResponse): boolean {
  return !result.ok
}

/**
 * Discovery's schema: every field either kind of request takes, under the adapter's names, and which ones each kind
 * needs and refuses, from the two kinds' own schemas. Clients read one object, so the kinds become `oneOf` rules on it.
 */
function discoverySchema(names: { label: string; code: string }): Record<string, unknown> {
  const renamed: Record<string, string> = { label: names.label, code: names.code }
  const rename = (key: string) => renamed[key] ?? key
  const kinds = requests.exec.options.map((kind) => ({ json: requestJsonSchema(kind), keys: Object.keys(kind.shape) }))
  const every = [...new Set(kinds.flatMap(({ keys }) => keys))]
  const properties = Object.fromEntries(
    kinds.flatMap(({ json }) => Object.entries(json.properties ?? {})).map(([key, schema]) => [rename(key), schema])
  )
  return {
    type: "object",
    properties,
    additionalProperties: false,
    oneOf: kinds.map(({ json, keys }) => {
      const refused = every.filter((key) => !keys.includes(key)).map((key) => ({ required: [rename(key)] }))
      return {
        required: (json.required ?? []).map(rename),
        not: refused.length === 1 ? refused[0] : { anyOf: refused }
      }
    })
  }
}

/** One handler for both adapters. Caller identity stays in the transport's connection context. */
export const executeOperation = {
  failed: executionFailed,
  fields: executeFields,
  structured: structuredExec,
  /** Discovery uses the same contract, with just the two historical MCP field aliases. */
  inputSchema: discoverySchema,
  async run(input: unknown, send: Send): Promise<ExecResponse> {
    const request = executeRequest(input)
    return execResponse(await send("exec", request, "tab", replies.exec))
  }
}
