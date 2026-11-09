import type { ParamSpec, PropKind } from "@parity-app/core"
import { z } from "zod"

/**
 * A prop's, argument's or param's value as a design holds it: anything JSON holds, since designs are JSON. The design
 * types leave these values unknown, so the panels read them with {@link readPropValue} where they take them.
 */
export type PropValue = z.infer<typeof propValue>

const propValue = z.json()

/** A value of one kind out of a value that can be several, such as a prop's: parsed, so it can't be the wrong kind. */
export const numberValue = z.number()
export const textValue = z.string()
export const booleanValue = z.boolean()

/** Reads a value a design holds as a prop value, or undefined when it's unset or isn't something JSON holds. */
export function readPropValue<Held>(value: Held): PropValue | undefined {
  return propValue.safeParse(value).data
}

/** A value as text: text as itself, and anything else, a number, `true` or a list, as JSON. */
export function plainText(value: PropValue): string {
  const text = textValue.safeParse(value)

  return text.success ? text.data : JSON.stringify(value)
}

/**
 * The kind of control a prop or param value is edited with: text, a number field, a switch, JSON, or any value, which
 * reads JSON when what's typed is JSON and text otherwise.
 */
export type ValueKind = "text" | "number" | "boolean" | "json" | "any"

/**
 * How a value is edited, so it keeps its type: from what its param or prop is declared to take, else from the value
 * itself. A number param with no value yet gets a number field, not a text box that would make it a string.
 */
export function valueKind(value: PropValue | undefined, declared?: ParamSpec["type"] | PropKind): ValueKind {
  switch (declared) {
    case "text":
    case "string":
      return "text"
    case "number":
      return "number"
    case "boolean":
      return "boolean"
    case "object":
      return "json"
    case "value":
      return "any"
  }

  if (booleanValue.safeParse(value).success) {
    return "boolean"
  }

  if (numberValue.safeParse(value).success) {
    return "number"
  }

  if (textValue.safeParse(value).success) {
    return "text"
  }

  return value === undefined ? "any" : "json"
}

/** A value as a JSON or any-value field shows it: a string as itself where any value goes, else as JSON. */
export function showValue(value: PropValue | undefined, kind: "json" | "any"): string {
  if (value === undefined) {
    return ""
  }

  return kind === "any" ? plainText(value) : JSON.stringify(value)
}

/**
 * Reads what was typed into a JSON or any-value field. JSON that doesn't parse is refused rather than kept as text, so
 * an object prop never turns into a string. An empty field clears the value.
 */
export function readValue(text: string, kind: "json" | "any"): { value: PropValue | undefined } | { error: string } {
  const trimmed = text.trim()

  if (trimmed === "") {
    return { value: undefined }
  }

  if (kind === "any") {
    return { value: parseLooseValue(trimmed) }
  }

  try {
    return { value: propValue.parse(JSON.parse(trimmed)) }
  } catch {
    return { error: `Can't read this as JSON: check its quotes, commas and brackets` }
  }
}

/** Parses what someone typed as a prop value: JSON when it is (true, 3, "x", [..]), otherwise a string. */
export function parseLooseValue(text: string): PropValue {
  const trimmed = text.trim()

  if (trimmed === "") {
    return ""
  }

  try {
    return propValue.parse(JSON.parse(trimmed))
  } catch {
    return text
  }
}
