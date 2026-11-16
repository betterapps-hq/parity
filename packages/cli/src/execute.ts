import { readRequest, replies, requestJsonSchema, requests } from "@parity-app/agent/contracts"
import { CodedError, readErrorDetails } from "@parity-app/core/errors"
import { jsonValue } from "@parity-app/core/schema"
import { z } from "zod"
import { failure, operationError } from "./errors.ts"
import type { InputSchema, OperationInput, Send } from "./operations.ts"

/** The shared execute contract. Transport adapters only rename fields and read their input sources. */
export type ExecuteRequest = z.output<typeof requests.exec>

/** What the app answers: a failure's message, with its details beside it when the app knew the cause. */
export type ExecReply = z.output<typeof replies.exec>

export type Screenshot = ExecReply["screenshots"][number]

export type Edit = z.output<(typeof requests.exec.options)[1]>["edits"][number]

/**
 * The canonical result: the reply with its failure as one error, which carries the editId to retry a snippet by. A
 * quiet call leaves out `created`, the named nodes, and keeps `createdDesigns` (PAR-909).
 */
const execResult = replies.exec
  .omit({ error: true, details: true, editId: true })
  .extend({ error: failure.optional(), created: replies.exec.shape.created.optional() })

export type ExecResponse = z.output<typeof execResult>

/** The same request fields in both adapters' paths, before MCP renames label and code. */
const executeFields = ["tab", "label", "code", "editId", "edits", "quiet"]

/** A reply as the canonical result: the failure's message, code and retry id together in one error. */
export function execResponse(reply: ExecReply, fields: readonly string[] = executeFields): ExecResponse {
  const { error, details, editId, ...rest } = reply

  if (reply.ok || error === undefined) {
    return rest
  }

  const coded = readErrorDetails(details)

  const failed = operationError(
    coded ? new CodedError(error, coded) : new CodedError(error, { code: "execution_failed" }),
    fields
  )

  return { ...rest, error: editId ? { ...failed, editId } : failed }
}

/** A screenshot without its image data. */
type ShotInfo = Omit<Screenshot, "png">

/** A contact sheet without its image data. */
type SheetInfo = Omit<NonNullable<ExecResponse["sheets"]>[number], "png">

/** The result as structured data: every screenshot's and sheet's details, without their images. */
export type StructuredExec = Omit<ExecResponse, "screenshots" | "sheets"> & {
  screenshots: ShotInfo[]
  sheets?: SheetInfo[]
}

/** The result as structured data: everything but image data, which MCP sends as image blocks. */
export function structuredExec({ sheets, ...result }: ExecResponse): StructuredExec {
  const structured: StructuredExec = {
    ...result,
    screenshots: result.screenshots.map(({ png: _png, ...shot }) => shot)
  }

  if (sheets) {
    structured.sheets = sheets.map(({ png: _png, ...sheet }) => sheet)
  }

  return structured
}

/** Checks the request once, before either transport sends it to the desktop. Snippet and patch text stay as written. */
export function executeRequest(input: OperationInput): ExecuteRequest {
  return readRequest(requests.exec, input)
}

/** Execution failures have the same meaning for CLI exits and MCP tool errors. */
export function executionFailed(result: ExecResponse): boolean {
  return !result.ok
}

/** An adapter's names for execute's label and code. */
export interface ExecuteNames {
  label: string
  code: string
}

/**
 * Discovery's schema: every field either kind of request takes, under the adapter's names, and which ones each kind
 * needs and refuses, from the two kinds' own schemas. Clients read one object, so the kinds become `oneOf` rules on it.
 */
function discoverySchema(names: ExecuteNames): InputSchema {
  const renamed = new Map([
    ["label", names.label],
    ["code", names.code]
  ])

  const rename = (key: string) => renamed.get(key) ?? key
  const kinds = requests.exec.options.map((kind) => ({ json: requestJsonSchema(kind), keys: Object.keys(kind.shape) }))
  const every = [...new Set(kinds.flatMap(({ keys }) => keys))]

  const properties = Object.fromEntries(
    kinds.flatMap(({ json }) => Object.entries(json.properties ?? {})).map(([key, schema]) => [rename(key), schema])
  )

  return {
    type: "object",
    properties: { ...properties, quiet: quietSchema },
    additionalProperties: false,
    oneOf: kinds.map(({ json, keys }) => {
      const refused = every
        .values()
        .filter((key) => !keys.includes(key))
        .map((key) => ({ required: [rename(key)] }))
        .toArray()

      return {
        required: (json.required ?? []).map(rename),
        not: refused.length === 1 ? refused[0] : { anyOf: refused }
      }
    })
  }
}

/** Quiet is how the result is reported, so the adapters read it and the app never sees it. */
const quietSchema: InputSchema = {
  type: "boolean",
  default: false,
  description: "Leave out the named nodes created. Designs created are still listed."
}

/** Just the quiet flag, read on its own since the app's request refuses it. */
const quietFlag = z.object({ quiet: z.boolean("quiet must be a boolean").default(false) })

/** Input given as fields, which is the only kind that can ask to be quiet. */
const operationFields = z.record(z.string(), jsonValue.optional())

/** A request with `quiet` taken out, and whether it asked for a quiet result. */
interface QuietRequest {
  request: OperationInput
  quiet: boolean
}

function readQuiet(input: OperationInput): QuietRequest {
  const fields = operationFields.safeParse(input).data

  if (!fields) {
    return { request: input, quiet: false }
  }

  const { quiet, ...request } = fields

  return { request, quiet: readRequest(quietFlag, { quiet }).quiet }
}

/** One handler for both adapters. Caller identity stays in the transport's connection context. */
export const executeOperation = {
  failed: executionFailed,
  fields: executeFields,
  structured: structuredExec,
  /** Discovery uses the same contract, with just the two historical MCP field aliases. */
  inputSchema: discoverySchema,
  async run(input: OperationInput, send: Send): Promise<ExecResponse> {
    const { request, quiet } = readQuiet(input)
    const result = execResponse(await send("exec", executeRequest(request), "tab"))

    if (!quiet) {
      return result
    }

    const { created: _created, ...rest } = result

    return rest
  }
}
