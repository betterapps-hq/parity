import { z } from "zod"
import { CodedError, type ErrorDetails } from "./errors.ts"

/**
 * Checks for data Parity didn't make (PAR-578): files, agent input, environment variables, other programs' JSON. A zod
 * schema is both the check and the type. A failed check reads as core's hand-written ones in `validate.ts` did: a JSON
 * pointer to the value at fault, then what was expected there, as in `/containers/0/name: expected a string`.
 */

/** A value JSON can hold, for data read from a JSON file. */
export const jsonValue = z.json()

export type JsonValue = z.infer<typeof jsonValue>

/** An object with string keys, and not an array or null. */
export const plainObject = z.record(z.string(), z.unknown())

/** Text with something besides whitespace, trimmed. */
export const nonBlankString = z.string().trim().min(1, "can't be blank")

/** A number other than NaN or ±Infinity, which zod 4 refuses on its own. */
export const finiteNumber = z.number()

/**
 * An object in a file Parity owns, such as a `.par`. A key it doesn't know is an error, and a key set to `undefined` is
 * left out, as JSON leaves it out, so what the window saves from memory reads as it would from the file.
 */
// The fields `z.strictObject` takes, by its own parameter rather than zod's internal name for them.
type ObjectFields = NonNullable<Parameters<typeof z.strictObject>[0]>

export function fileObject<const Fields extends ObjectFields>(fields: Fields) {
  return z.strictObject(fields).overwrite(withoutUnset)
}

/** Zod's own copy of an object, without the keys whose values are `undefined`. */
function withoutUnset<T extends object>(value: T): T {
  for (const [key, entry] of Object.entries(value)) {
    if (entry === undefined) {
      Reflect.deleteProperty(value, key)
    }
  }

  return value
}

/** JSON text holding what `schema` checks. Text that isn't JSON fails as `expected JSON`. */
export function jsonText<T extends z.ZodType>(schema: T) {
  return z
    .string()
    .transform((text, context) => {
      try {
        const value: unknown = JSON.parse(text)

        return value
      } catch {
        context.addIssue({ code: "custom", message: "expected JSON" })

        return z.NEVER
      }
    })
    .pipe(schema)
}

/**
 * Checks data Parity didn't make and returns what the schema reads from it, or throws `TypeError` with the first
 * problem as `/json/pointer: message`. `at` is where the value sits in a larger one, so its pointers start there.
 */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- the I/O boundary: data Parity didn't make comes here to be parsed
export function parseData<T extends z.ZodType>(schema: T, value: unknown, at = ""): z.output<T> {
  const checked = checkData(schema, value, at)

  if (checked.success) {
    return checked.data
  }

  const { pointer, message } = checked.problem
  throw new TypeError(`${pointer || "/"}: ${message}`)
}

/**
 * Checks an agent's input, as `parseData` does, but throws `CodedError` with `invalid_input` and the pointer as its
 * field, without the leading slash, so the CLI and MCP report the pointer as the error's `path` (PAR-472).
 */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- the I/O boundary: data Parity didn't make comes here to be parsed
export function parseInput<T extends z.ZodType>(schema: T, value: unknown, at = ""): z.output<T> {
  const checked = checkData(schema, value, at)

  if (checked.success) {
    return checked.data
  }

  const { pointer, message } = checked.problem
  const details: ErrorDetails = { code: "invalid_input", retryable: false }

  if (pointer) {
    details.field = pointer.slice(1)
  }

  throw new CodedError(`${pointer || "/"}: ${message}`, details)
}

/**
 * A reader for one kind of file or message: `parseData` with its schema, and `read` making the result what callers
 * use. The parsers built with it are where their data comes in, so they take what the file or message held.
 */
export function parserFor<T extends z.ZodType, R = z.output<T>>(
  schema: T,
  read?: (parsed: z.output<T>) => R
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- the I/O boundary: data Parity didn't make comes here to be parsed
): (value: unknown, at?: string) => R {
  return (value, at = "") => {
    const parsed = parseData(schema, value, at)

    // SAFETY: without `read`, `R` is its default, the schema's output.
    return read ? read(parsed) : (parsed as R)
  }
}

/** What a failed check found first: where, as a JSON pointer (`` for the value itself), and what was expected there. */
export interface SchemaProblem {
  pointer: string
  message: string
}

/**
 * Checks data Parity didn't make, as `parseData` does, and returns the first problem rather than throwing it, for a
 * caller that reports it its own way: the CLI keeps the pointer out of its messages, since each names its field.
 */
export function checkData<T extends z.ZodType>(
  schema: T,
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- the I/O boundary: data Parity didn't make comes here to be parsed
  value: unknown,
  at = ""
): { success: true; data: z.output<T> } | { success: false; problem: SchemaProblem } {
  const result = schema.safeParse(value, { error: issueText })

  if (result.success) {
    return { success: true, data: result.data }
  }

  const problem = firstProblem(result.error.issues, at)

  if (invalidDataListener) {
    try {
      invalidDataListener({ schema: schemaName(schema), problem, issues: result.error.issues, value })
    } catch {
      // A listener's failure never changes what the check returns.
    }
  }

  return { success: false, problem }
}

/** A check through `checkData`, `parseData` or `parseInput` that failed, for telemetry's `data.invalid` (PAR-633). */
export interface InvalidData {
  /** The schema's name: its `.meta({ id })`, its description, or the function that ran the check. */
  schema: string
  problem: SchemaProblem
  issues: readonly z.core.$ZodIssue[]
  /** The data that failed, as given. */
  value: unknown
}

let invalidDataListener: ((failure: InvalidData) => void) | undefined

/**
 * Calls `listener` with each failed check through `checkData`, `parseData` or `parseInput`, in place of the one before,
 * so a process's telemetry records it as `data.invalid`. Returns a function that stops it.
 */
export function onInvalidData(listener: (failure: InvalidData) => void): () => void {
  invalidDataListener = listener

  return () => {
    if (invalidDataListener === listener) {
      invalidDataListener = undefined
    }
  }
}

/** A name for a schema in telemetry: its registered id, its description, or else the function that checked with it. */
function schemaName(schema: z.ZodType): string {
  const meta = z.globalRegistry.get(schema)

  if (meta?.id !== undefined) {
    return meta.id
  }

  if (schema.description) {
    return schema.description
  }

  return checkingFunction() ?? "unnamed"
}

/** The functions in this file a failed check passes through, which are never the checker's name. */
const ownFunctions = new Set(["checkingFunction", "schemaName", "checkData", "parseData", "parseInput"])

/** The first function on the stack outside this file, as `readLibrary`, when the runtime names it. */
function checkingFunction(): string | undefined {
  for (const line of new Error().stack?.split("\n").slice(1) ?? []) {
    const name = /at (?:async )?([\w$.<>]+) \(/.exec(line)?.[1]

    if (name && !ownFunctions.has(name.split(".").pop() ?? name)) {
      return name
    }
  }

  return undefined
}

/** A path inside a value as a JSON pointer (RFC 6901): `/edits/0/find`, or `` for the value itself. */
function jsonPointer(path: readonly PropertyKey[]): string {
  return path.map((key) => `/${String(key).replaceAll("~", "~0").replaceAll("/", "~1")}`).join("")
}

/**
 * The problem to report from a failed check: its first issue. An unknown property points at that property. A union
 * that no option matched reports the option that came closest, or every type it takes when none got past the value's
 * type. An option for another type of value isn't close, so `{ size: "big" }` against a string or an object with a
 * numeric size reports the size, however many issues the object has.
 */
function firstProblem(issues: readonly z.core.$ZodIssue[], at: string): SchemaProblem {
  const [issue] = issues

  if (!issue) {
    return { pointer: at, message: "isn't valid" }
  }

  const pointer = at + jsonPointer(issue.path)

  if (issue.code === "unrecognized_keys") {
    return { pointer: pointer + jsonPointer(issue.keys.slice(0, 1)), message: issue.message }
  }

  if (issue.code === "invalid_union" && issue.errors.length > 0) {
    // A union that says what it takes, as a style's value forms do, is clearer than "an object" when the value is
    // none of them outright. Inside a form that nearly fits, the closest option's own problem says more.
    const outright = issue.errors.flat().every((error) => error.path.length === 0)

    if (outright && issue.message !== "Invalid input") {
      return { pointer, message: issue.message }
    }

    return unionProblem(issue.errors, pointer)
  }

  return { pointer, message: issue.message }
}

function unionProblem(options: readonly (readonly z.core.$ZodIssue[])[], pointer: string): SchemaProblem {
  const issues = options.flat()
  const shallow = issues.every((issue) => issue.path.length === 0)
  const expected = issues.map(expectation)

  if (shallow && expected.every((text) => text !== undefined)) {
    return { pointer, message: `expected ${[...new Set(expected)].join(" or ")}` }
  }

  const depth = (option: readonly z.core.$ZodIssue[]) => option[0]?.path.length ?? 0
  const typed = options.filter((option) => !refusesType(option))

  const closest = (typed.length > 0 ? typed : options).reduce((best, option) =>
    option.length < best.length || (option.length === best.length && depth(option) > depth(best)) ? option : best
  )

  return firstProblem(closest, pointer)
}

/** Whether a union's option failed on the value's type itself, as a string option does for an object. */
function refusesType(option: readonly z.core.$ZodIssue[]): boolean {
  const [first] = option

  return first?.code === "invalid_type" && first.path.length === 0
}

/** What one type or value check wanted, as `a string` or `"row"`; nothing for other checks. */
function expectation(issue: z.core.$ZodIssue): string | undefined {
  if (issue.code === "invalid_type") {
    return typeName(issue.expected)
  }

  if (issue.code === "invalid_value") {
    return issue.values.map(literal).join(" or ")
  }

  return undefined
}

/** Zod's issues in the words of core's old `validate.ts`. Messages a schema gives itself win, and anything else keeps zod's own. */
function issueText(issue: z.core.$ZodRawIssue): string | undefined {
  switch (issue.code) {
    case "invalid_type":
      return `expected ${typeName(issue.expected)}`
    case "invalid_value":
      return issue.values.length === 1
        ? `expected ${literal(issue.values[0])}`
        : `expected one of ${issue.values.map(literal).join(", ")}`
    case "unrecognized_keys":
      return "unknown property"
    case "invalid_union": {
      const options: unknown = "options" in issue ? issue.options : undefined

      return Array.isArray(options) && options.length > 0
        ? `expected one of ${options.map(literal).join(", ")}`
        : undefined
    }

    case "too_small":
      return bound("at least", "more than", issue.origin, issue.minimum, issue.inclusive)
    case "too_big":
      return bound("at most", "less than", issue.origin, issue.maximum, issue.inclusive)
    default:
      return undefined
  }
}

const typeNames = new Map([
  ["array", "an array"],
  ["boolean", "true or false"],
  ["int", "a whole number"],
  ["number", "a number"],
  ["object", "an object"],
  ["record", "an object"],
  ["string", "a string"],
  ["tuple", "an array"]
])

function typeName(expected: string): string {
  return typeNames.get(expected) ?? expected
}

function literal(value: z.core.util.Primitive): string {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- a primitive has no tag; only strings are quoted
  return typeof value === "string" ? JSON.stringify(value) : String(value)
}

const units = new Map([
  ["string", "character"],
  ["array", "item"],
  ["set", "item"]
])

/** A size or range check's limit, as `expected at least 1 item` or `expected less than 10`. */
function bound(
  inclusiveWords: string,
  exclusiveWords: string,
  origin: string,
  limit: number | bigint,
  inclusive = true
): string | undefined {
  const words = inclusive ? inclusiveWords : exclusiveWords
  const unit = units.get(origin)

  if (unit) {
    return `expected ${words} ${limit} ${unit}${Number(limit) === 1 ? "" : "s"}`
  }

  return ["number", "int", "bigint"].includes(origin) ? `expected ${words} ${limit}` : undefined
}
