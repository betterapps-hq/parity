import type { ParamSpec, PropKind } from "@parity/core"

/**
 * The kind of control a prop or param value is edited with: text, a number field, a switch, JSON, or any value, which
 * reads JSON when what's typed is JSON and text otherwise.
 */
export type ValueKind = "text" | "number" | "boolean" | "json" | "any"

/**
 * How a value is edited, so it keeps its type: from what its param or prop is declared to take, else from the value
 * itself. A number param with no value yet gets a number field, not a text box that would make it a string.
 */
export function valueKind(value: unknown, declared?: ParamSpec["type"] | PropKind): ValueKind {
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
  if (typeof value === "boolean") return "boolean"
  if (typeof value === "number") return "number"
  if (typeof value === "string") return "text"
  return value === undefined ? "any" : "json"
}

/** A value as a JSON or any-value field shows it: a string as itself where any value goes, else as JSON. */
export function showValue(value: unknown, kind: "json" | "any"): string {
  if (value === undefined) return ""
  return kind === "any" && typeof value === "string" ? value : JSON.stringify(value)
}

/**
 * Reads what was typed into a JSON or any-value field. JSON that doesn't parse is refused rather than kept as text, so
 * an object prop never turns into a string. An empty field clears the value.
 */
export function readValue(text: string, kind: "json" | "any"): { value: unknown } | { error: string } {
  const trimmed = text.trim()
  if (trimmed === "") return { value: undefined }
  if (kind === "any") return { value: parseLooseValue(trimmed) }
  try {
    return { value: JSON.parse(trimmed) }
  } catch {
    return { error: `Can't read this as JSON: check its quotes, commas and brackets` }
  }
}

/** Parses what someone typed as a prop value: JSON when it is (true, 3, "x", [..]), otherwise a string. */
export function parseLooseValue(text: string): unknown {
  const trimmed = text.trim()
  if (trimmed === "") return ""
  try {
    return JSON.parse(trimmed)
  } catch {
    return text
  }
}
