import { CodedError, errorCodes, errorDetails, type ErrorDetails } from "@parity-app/core/errors"
import { z } from "zod"

/**
 * A failed call, the same in CLI `--json` and MCP `structuredContent`: a stable code to branch on, the message people
 * read, whether the same request can succeed when sent again, the input at fault, and what to use instead. What each
 * field means is in the CLI's README and the skill, too.
 */
export const failure = z.object({
  code: z.enum(errorCodes),
  message: z.string(),
  /** Whether sending the same request again, unchanged, can succeed: the app was starting, or edits collided. */
  retryable: z.boolean(),
  /** A JSON pointer to the input at fault, such as `/design` or `/edits/0/find`, in the operation's field names. */
  path: z.string().optional(),
  /** Valid ids to use instead of an unknown or ambiguous one, closest first, at most 20. */
  alternatives: z.array(z.string()).optional(),
  /** A failed snippet's id: retry it with `editId` and `edits` instead of sending it again. */
  editId: z.string().optional()
})

export type OperationError = z.output<typeof failure>

/** A request field that isn't valid, rejected before anything reaches the app. */
export function invalidInput(field: string | undefined, message: string): CodedError {
  const details: ErrorDetails = { code: "invalid_input", retryable: false }

  if (field) {
    details.field = field
  }

  return new CodedError(message, details)
}

/**
 * A thrown value as an operation error. Invalid input always points at the request; a field the app names becomes a
 * path only when the operation has that input: an unknown design inside a snippet has no `design` input to point at.
 */
export function operationError(cause: unknown, fields?: readonly string[]): OperationError {
  const message = cause instanceof Error ? cause.message : String(cause)
  const details = errorDetails(cause) ?? { code: "app_error", retryable: false }
  const field = details.field

  const known =
    field !== undefined && (details.code === "invalid_input" || !fields || fields.includes(field.split("/")[0]!))

  const result: OperationError = { code: details.code, message, retryable: details.retryable }

  if (known) {
    result.path = `/${field}`
  }

  if (details.alternatives?.length) {
    result.alternatives = details.alternatives
  }

  return result
}

/** Renames the top-level field a path points at, for an adapter whose names differ from the contract's. */
export function renamePath(error: OperationError, names: Record<string, string>): OperationError {
  if (!error.path) {
    return error
  }

  const [, first = "", ...rest] = error.path.split("/")

  if (!Object.hasOwn(names, first)) {
    return error
  }

  return { ...error, path: ["", names[first], ...rest].join("/") }
}
