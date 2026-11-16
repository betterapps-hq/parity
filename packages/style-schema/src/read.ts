/*
 * What a reader gives back when it can't read a value: a code saying what kind of failure it is, which callers branch
 * on, and a reason in the interface's words, which a field shows. No caller reads the reason to decide anything.
 */

/** The kinds of failure a reader reports. */
export const readCodes = [
  /** Something in it isn't part of the value's syntax. */
  "unreadable",
  /** It stops before it's whole: a bracket left open, an argument missing. */
  "incomplete",
  /** It names a custom property the project doesn't have. */
  "unknown-token",
  /** It calls a function the value doesn't take. */
  "unknown-function",
  /** A function is given the wrong number of arguments. */
  "arguments",
  /** It mixes units that can't go together, such as two lengths multiplied. */
  "units",
  /** It divides by zero. */
  "divide-by-zero",
  /** A number in it is outside what the value takes. */
  "out-of-range"
] as const

export type ReadCode = (typeof readCodes)[number]

/** A value that couldn't be read: what kind of failure, and why, as the field says it. */
export interface ReadFailure {
  code: ReadCode
  reason: string
}

/** A failed read. */
export const readFailure = (code: ReadCode, reason: string): ReadFailure => ({ code, reason })

/** Whether a reader's outcome is a failure. */
export function isReadFailure<Read>(outcome: Read | ReadFailure): outcome is ReadFailure {
  return outcome instanceof Object && "code" in outcome && "reason" in outcome
}
