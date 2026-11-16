import { z } from "zod"

/**
 * Why an agent's call failed, as a stable code it can act on without reading the message. The CLI and MCP publish
 * these; the app throws them where it knows the cause.
 */
export const errorCodes = [
  /** The request is malformed: a field is missing, of the wrong type or out of range. */
  "invalid_input",
  /** The app isn't running, so there's nowhere to send the call. */
  "not_running",
  /** The app is running but didn't answer. */
  "not_answering",
  "unknown_tab",
  /** The tab is still opening, or failed to open. */
  "tab_not_ready",
  "unknown_design",
  "unknown_node",
  /** A reference matches more than one thing; the alternatives say how to name each. */
  "ambiguous_reference",
  "unknown_state",
  "unknown_mode",
  "unknown_viewport",
  "unknown_component",
  "unknown_icon_set",
  /** A retry named a failed snippet the app doesn't have, so the whole snippet has to be sent again. */
  "unknown_edit_id",
  /** No image in the project matches the path or address given. */
  "unknown_image",
  /** The image is still used by a design or the project's code, so it isn't removed. */
  "image_in_use",
  /** The call's changes collided with edits made in the editor meanwhile. Running it again may succeed. */
  "conflict",
  /** A snippet threw. Retry it with its editId and edits. */
  "execution_failed",
  /** Anything else the app reported. */
  "app_error"
] as const

export type ErrorCode = (typeof errorCodes)[number]

/** The most alternatives a failure names, so an unknown component in a large library stays a small reply. */
export const alternativeLimit = 20

/** Details as another process sends them. Each field that's malformed falls back on its own; only the code must hold. */
const errorDetailsSchema = z.object({
  code: z.enum(errorCodes),
  /** Whether sending the same request again, unchanged, can succeed. */
  retryable: z.boolean().catch(false),
  /** The request field at fault, as a path: `design`, `state`, `edits/0/find`. */
  field: z.string().min(1).optional().catch(undefined),
  /** Valid references to use instead of an unknown or ambiguous one, at most `alternativeLimit` of them. */
  // An item that isn't a string reads as `null` and is dropped, so the strings around it still count.
  alternatives: z
    .array(z.string().nullable().catch(null))
    .transform((items) => items.filter((item) => item !== null).slice(0, alternativeLimit))
    .optional()
    .catch(undefined)
})

/** What a coded failure says beyond its message. Plain data, so it crosses processes and the RPC boundary as is. */
export type ErrorDetails = z.infer<typeof errorDetailsSchema>

/** An error with a stable code, the field it's about and what to use instead. */
export class CodedError extends Error {
  readonly details: ErrorDetails

  constructor(message: string, details: Omit<ErrorDetails, "retryable"> & { retryable?: boolean }) {
    super(message)
    this.name = "CodedError"
    this.details = { ...details, retryable: details.retryable ?? false }
  }
}

/** An unknown reference, naming the valid ones closest to what was asked for, up to `alternativeLimit`. */
export function unknownReference(
  code: ErrorCode,
  message: string,
  reference: string,
  candidates: readonly string[],
  field?: string
): CodedError {
  const details: Omit<ErrorDetails, "retryable"> = { code }

  if (field !== undefined) {
    details.field = field
  }

  details.alternatives = closest(reference, candidates)

  return new CodedError(message, details)
}

/**
 * Candidates sharing text with the reference first, ignoring case, then the rest by how few single-character edits
 * away they are, so a typo's intended id makes the cut; ties keep their own order. All of them when they fit.
 */
export function closest(reference: string, candidates: readonly string[], limit = alternativeLimit): string[] {
  const unique = [...new Set(candidates)]

  if (unique.length <= limit) {
    return unique
  }

  const wanted = reference.toLowerCase()

  const ranked = unique.map((candidate, index) => {
    const lower = candidate.toLowerCase()
    const near = wanted.length > 0 && (lower.includes(wanted) || wanted.includes(lower))

    return { candidate, index, near: near ? 0 : 1, distance: near ? 0 : editDistance(wanted, lower) }
  })

  ranked.sort((a, b) => a.near - b.near || a.distance - b.distance || a.index - b.index)

  return ranked.slice(0, limit).map(({ candidate }) => candidate)
}

/** How many single-character insertions, deletions or substitutions turn one string into the other. */
function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index)

  for (let i = 1; i <= a.length; i++) {
    const row = [i]

    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(previous[j]! + 1, row[j - 1]! + 1, previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1))
    }

    previous = row
  }

  return previous[b.length]!
}

/** A thrown value's details, when it carries them. */
export function errorDetails(cause: unknown): ErrorDetails | undefined {
  return cause instanceof CodedError ? cause.details : undefined
}

/** Details that came from another process, checked before they're trusted. Anything malformed reads as none. */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- the I/O boundary: details from another process are parsed here
export function readErrorDetails(value: unknown): ErrorDetails | undefined {
  return errorDetailsSchema.safeParse(value).data
}
