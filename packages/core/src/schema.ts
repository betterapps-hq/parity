import { z } from "zod"
import { CodedError } from "./errors.ts"

/**
 * Checks for data Parity didn't make (PAR-578): files, agent input, environment variables, other programs' JSON. A zod
 * schema is both the check and the type. A failed check reads as core's hand-written ones in `validate.ts` do: a JSON
 * pointer to the value at fault, then what was expected there, as in `/containers/0/name: expected a string`.
 */

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
export function fileObject<const Shape extends z.core.$ZodLooseShape>(shape: Shape) {
  return z.strictObject(shape).overwrite(withoutUnset)
}

/** Zod's own copy of an object, without the keys whose values are `undefined`. */
function withoutUnset<T extends object>(value: T): T {
  for (const [key, entry] of Object.entries(value)) if (entry === undefined) Reflect.deleteProperty(value, key)
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
export function parseData<T extends z.ZodType>(schema: T, value: unknown, at = ""): z.output<T> {
  const result = schema.safeParse(value, { error: issueText })
  if (result.success) return result.data
  const { pointer, message } = firstProblem(result.error.issues, at)
  throw new TypeError(`${pointer || "/"}: ${message}`)
}

/**
 * Checks an agent's input, as `parseData` does, but throws `CodedError` with `invalid_input` and the pointer as its
 * field, without the leading slash, so the CLI and MCP report the pointer as the error's `path` (PAR-472).
 */
export function parseInput<T extends z.ZodType>(schema: T, value: unknown, at = ""): z.output<T> {
  const result = schema.safeParse(value, { error: issueText })
  if (result.success) return result.data
  const { pointer, message } = firstProblem(result.error.issues, at)
  throw new CodedError(`${pointer || "/"}: ${message}`, {
    code: "invalid_input",
    ...(pointer ? { field: pointer.slice(1) } : {})
  })
}

/** A path inside a value as a JSON pointer (RFC 6901): `/edits/0/find`, or `` for the value itself. */
function jsonPointer(path: readonly PropertyKey[]): string {
  return path.map((key) => `/${String(key).replaceAll("~", "~0").replaceAll("/", "~1")}`).join("")
}

interface Problem {
  pointer: string
  message: string
}

/**
 * The problem to report from a failed check: its first issue. An unknown property points at that property. A union
 * that no option matched reports the option that came closest, or every type it takes when none got past the value's
 * type. An option for another type of value isn't close, so `{ size: "big" }` against a string or an object with a
 * numeric size reports the size, however many issues the object has.
 */
function firstProblem(issues: readonly z.core.$ZodIssue[], at: string): Problem {
  const [issue] = issues
  if (!issue) return { pointer: at, message: "isn't valid" }
  const pointer = at + jsonPointer(issue.path)
  if (issue.code === "unrecognized_keys") {
    return { pointer: pointer + jsonPointer(issue.keys.slice(0, 1)), message: issue.message }
  }
  if (issue.code === "invalid_union" && issue.errors.length > 0) return unionProblem(issue.errors, pointer)
  return { pointer, message: issue.message }
}

function unionProblem(options: readonly (readonly z.core.$ZodIssue[])[], pointer: string): Problem {
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
  if (issue.code === "invalid_type") return typeName(issue.expected)
  if (issue.code === "invalid_value") return issue.values.map(literal).join(" or ")
  return undefined
}

/** Zod's issues in `validate.ts`'s words. Messages a schema gives itself win, and anything else keeps zod's own. */
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

const typeNames: Record<string, string> = {
  array: "an array",
  boolean: "true or false",
  int: "a whole number",
  number: "a number",
  object: "an object",
  record: "an object",
  string: "a string",
  tuple: "an array"
}

function typeName(expected: string): string {
  return typeNames[expected] ?? expected
}

function literal(value: unknown): string {
  return typeof value === "string" ? JSON.stringify(value) : String(value)
}

const units: Record<string, string> = { string: "character", array: "item", set: "item" }

/** A size or range check's limit, as `expected at least 1 item` or `expected less than 10`. */
function bound(
  inclusiveWords: string,
  exclusiveWords: string,
  origin: string,
  limit: number | bigint,
  inclusive = true
): string | undefined {
  const words = inclusive ? inclusiveWords : exclusiveWords
  const unit = units[origin]
  if (unit) return `expected ${words} ${limit} ${unit}${Number(limit) === 1 ? "" : "s"}`
  return ["number", "int", "bigint"].includes(origin) ? `expected ${words} ${limit}` : undefined
}
