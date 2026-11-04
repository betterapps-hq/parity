import { CodedError, type ErrorCode, errorCodes, errorDetails } from "@parity-app/core/errors"

/**
 * A failed call, the same in CLI `--json` and MCP `structuredContent`: a stable code to branch on, the message people
 * read, whether the same request can succeed when sent again, the input at fault, and what to use instead.
 */
export interface OperationError {
  code: ErrorCode
  message: string
  /** Whether sending the same request again, unchanged, can succeed: the app was starting, or edits collided. */
  retryable: boolean
  /** A JSON pointer to the input at fault, such as `/design` or `/edits/0/find`, in the operation's field names. */
  path?: string
  /** Valid ids to use instead of an unknown or ambiguous one, closest first, at most 20. */
  alternatives?: string[]
  /** A failed snippet's id: retry it with `editId` and `edits` instead of sending it again. */
  editId?: string
}

/** A request field that isn't valid, rejected before anything reaches the app. */
export function invalidInput(field: string | undefined, message: string): CodedError {
  return new CodedError(message, { code: "invalid_input", ...(field ? { field } : {}) })
}

/**
 * A thrown value as an operation error. Invalid input always points at the request; a field the app names becomes a
 * path only when the operation has that input: an unknown design inside a snippet has no `design` input to point at.
 */
export function operationError(error: unknown, fields?: readonly string[]): OperationError {
  const message = error instanceof Error ? error.message : String(error)
  const details = errorDetails(error) ?? { code: "app_error", retryable: false }
  const field = details.field
  const known =
    field !== undefined && (details.code === "invalid_input" || !fields || fields.includes(field.split("/")[0]!))
  return {
    code: details.code,
    message,
    retryable: details.retryable,
    ...(known ? { path: `/${field}` } : {}),
    ...(details.alternatives?.length ? { alternatives: details.alternatives } : {})
  }
}

/** Renames the top-level field a path points at, for an adapter whose names differ from the contract's. */
export function renamePath(error: OperationError, names: Record<string, string>): OperationError {
  if (!error.path) return error
  const [, first = "", ...rest] = error.path.split("/")
  if (!Object.hasOwn(names, first)) return error
  return { ...error, path: ["", names[first], ...rest].join("/") }
}

/** The error's schema. What each field means is in the CLI's README and the skill, to keep every tool's schema small. */
export const operationErrorSchema = {
  type: "object",
  properties: {
    code: { type: "string", enum: [...errorCodes] },
    message: { type: "string" },
    retryable: { type: "boolean" },
    path: { type: "string" },
    alternatives: { type: "array", items: { type: "string" } },
    editId: { type: "string" }
  },
  required: ["code", "message", "retryable"]
}
