/**
 * What the inspector's number and length fields read from what's typed, and how they step. A field reads a number, a
 * unit (`px`, `rem` or `%`), maths (`+ - * /` and brackets), and the value already there: a leading `+`, `*` or `/`
 * works from it (`+8` adds 8), and so does the word Mixed (`Mixed+8` adds 8 to each selected layer's own value).
 *
 * Lengths are kept as steps of the spacing scale (`4` is `calc(var(--spacing) * 4)`) but typed and shown in pixels, so
 * typing 320 in Width gives 320px. Until lengths can leave the scale (PAR-194), a length lands on the nearest half step,
 * which is what Tailwind's scale lists below 4 and what drags already write, and the field says when it moved one.
 */

/** What a field holds: a length, a percentage (opacity), a whole number (columns, spans, lines) or any number. */
export type FieldKind = "length" | "percent" | "count" | "number"

export interface FieldRules {
  kind: FieldKind
  /** Pixels per spacing step, for lengths: 4 with Tailwind's default `--spacing` of 0.25rem. */
  unit?: number
  /** The least and most it takes, in what it stores (steps for lengths). */
  min?: number
  max?: number
  /** What the field is called, for the reasons it gives ("Opacity takes a percentage"). */
  label?: string
}

/** A parsed sum. `current` stands for the value already in the field, each layer's own when they differ. */
export type FieldExpression =
  | { op: "number"; value: number; unit?: FieldUnit }
  | { op: "current" }
  | { op: "negate"; operand: FieldExpression }
  | { op: "+" | "-" | "*" | "/"; left: FieldExpression; right: FieldExpression }

/** Units a number can carry. `step` is a step of the spacing scale, as `spacing-4` names it. */
export type FieldUnit = "px" | "rem" | "%" | "step"

/** What was typed, read but not yet worked out against a value. */
export type FieldInput =
  /** Nothing: the property goes back to unset. */
  | { type: "clear" }
  /** A length token by name, such as `container-sm`. */
  | { type: "token"; name: string }
  /** A number or a sum; `relative` when it works from the value already there. */
  | { type: "maths"; expression: FieldExpression; relative: boolean }
  /** Something the field can't read, and why, in plain words. */
  | { type: "unreadable"; reason: string }

/** What an input came to for one value. */
export type FieldOutcome =
  | { ok: true; value: number | string | undefined; note?: FieldNote }
  | { ok: false; reason: string }

/** What the field did to a value that didn't fit, so it can say so. Values are as the field shows them (px). */
export type FieldNote =
  | { kind: "snapped"; from: number; to: number }
  | { kind: "clamped"; to: number; bound: "min" | "max" }
  | { kind: "rounded"; to: number }

/** Pixels in a rem, the browser's default root size, which `spacingUnit` assumes too. */
export const remPixels = 16

/** Screen pixels of dragging a field's label per step, as an arrow key steps. */
export const scrubPixelsPerStep = 2

/** Reads what was typed into a field. `tokens` are the length token names a length field takes. */
export function readFieldInput(text: string, rules: FieldRules, tokens: readonly string[] = []): FieldInput {
  const trimmed = text.trim()
  if (trimmed === "") return { type: "clear" }
  if (rules.kind === "length") {
    const name = trimmed.replace(/^--/, "")
    if (tokens.includes(name)) return { type: "token", name }
    const step = /^spacing-(\d+(?:\.\d+)?)$/.exec(name)?.[1]
    if (step !== undefined) {
      return { type: "maths", expression: { op: "number", value: Number(step), unit: "step" }, relative: false }
    }
  }
  const lexed = lex(trimmed, rules)
  if (!Array.isArray(lexed)) return { type: "unreadable", reason: lexed.reason }
  // A leading operator other than minus works from the value there: `+8` adds 8, `*2` doubles. A leading minus is a
  // negative number, as an inset can be; subtracting is `Mixed-8`, or typing after the value shown.
  const first = lexed[0]!
  const leading = first.type === "operator" && first.value !== "-"
  const tokensToParse: Lexeme[] = leading ? [{ type: "current", text: "" }, ...lexed] : lexed
  const parser = new Parser(tokensToParse)
  const parsed = parser.parse()
  if ("reason" in parsed) return { type: "unreadable", reason: parsed.reason }
  return { type: "maths", expression: parsed, relative: usesCurrent(parsed, rules) }
}

/**
 * Works an input out against one value, in what the field stores (steps for lengths; a token's name stays a name).
 * `current` is the value already there, or what an unset one counts as (0 for padding, 100 for opacity); it's only
 * needed when the input works from it.
 */
export function applyFieldInput(input: FieldInput, current: number | undefined, rules: FieldRules): FieldOutcome {
  if (input.type === "unreadable") return { ok: false, reason: input.reason }
  if (input.type === "clear") return { ok: true, value: undefined }
  if (input.type === "token") return { ok: true, value: input.name }
  const scale = shownPerStored(rules)
  const result = evaluate(input.expression, current === undefined ? undefined : current * scale, rules)
  if (typeof result !== "number") return { ok: false, reason: result.reason }
  return settle(result / scale, rules)
}

/**
 * A value moved by `count` steps, as Up and Down move it (Shift is ten). A length moves along the spacing scale, one
 * step (`--spacing`) at a time; a half step goes to the whole step beside it. Anything else moves by 1.
 */
export function stepFieldValue(current: number, count: number, rules: FieldRules): number {
  const value = Math.round(current * 1e9) / 1e9
  let next: number
  if (rules.kind === "length") {
    if (count === 0) next = value
    else next = count > 0 ? Math.floor(value) + count : Math.ceil(value) + count
  } else if (rules.kind === "count") next = Math.round(value) + count
  else next = value + count
  return clamp(next, rules)
}

/** How many steps dragging a label `dx` screen pixels moves the value: one per two pixels, ten with Shift. */
export function scrubSteps(dx: number, shift: boolean): number {
  const steps = Math.trunc(dx / scrubPixelsPerStep)
  return (steps === 0 ? 0 : steps) * (shift ? 10 : 1)
}

/** A value as the field shows it: lengths in pixels, a token by its name, nothing when unset. */
export function formatFieldValue(value: number | string | undefined, rules: FieldRules): string {
  if (value === undefined) return ""
  if (typeof value === "string") return value
  return formatNumber(value * shownPerStored(rules))
}

/** What the field says about a note, as it shows values. */
export function describeFieldNote(note: FieldNote, rules: FieldRules): string {
  const shown = (value: number) => `${formatNumber(value)}${shownUnit(rules)}`
  switch (note.kind) {
    case "snapped":
      return `Snapped to ${shown(note.to)}, the nearest step on the spacing scale`
    case "clamped":
      return `Kept at ${shown(note.to)}: it can't go ${note.bound === "min" ? "lower" : "higher"}`
    case "rounded":
      return `Rounded to ${shown(note.to)}: it takes whole numbers`
  }
}

/**
 * One line for what happened across several layers: the note itself when they all got the same one, otherwise each
 * kind once, as the layers each landed somewhere different.
 */
export function summarizeFieldNotes(notes: readonly FieldNote[], rules: FieldRules): string | undefined {
  if (notes.length === 0) return undefined
  const texts = [...new Set(notes.map((note) => describeFieldNote(note, rules)))]
  if (texts.length === 1) return texts[0]
  const kinds = new Set(notes.map((note) => note.kind))
  const parts: string[] = []
  if (kinds.has("snapped")) parts.push("snapped to the nearest step on the spacing scale")
  if (kinds.has("clamped")) parts.push("kept within what they can be")
  if (kinds.has("rounded")) parts.push("rounded to whole numbers")
  const line = parts.join(", ")
  return `Some layers ${line}`
}

/** Whether a length, in steps, sits on the half-step grid lengths land on until PAR-194. */
export function onSpacingGrid(steps: number): boolean {
  return Math.abs(steps * 2 - Math.round(steps * 2)) < 1e-9
}

/** A number of steps moved to the nearest half step. */
export function snapToSpacingGrid(steps: number): number {
  return Math.round(steps * 2) / 2
}

// What the field shows per unit it stores: pixels per step for lengths.
function shownPerStored(rules: FieldRules): number {
  return rules.kind === "length" ? (rules.unit ?? 4) : 1
}

/** A worked-out value, in what the field stores, made to fit: on the grid, a whole number, within its limits. */
function settle(stored: number, rules: FieldRules): FieldOutcome {
  const scale = shownPerStored(rules)
  let value = stored
  let note: FieldNote | undefined
  if (rules.kind === "length" && !onSpacingGrid(value)) {
    const snapped = snapToSpacingGrid(value)
    note = { kind: "snapped", from: value * scale, to: snapped * scale }
    value = snapped
  } else if (rules.kind === "count" && !Number.isInteger(value)) {
    value = Math.round(value)
    note = { kind: "rounded", to: value }
  }
  const clamped = clamp(value, rules)
  if (clamped !== value) {
    note = { kind: "clamped", to: clamped * scale, bound: clamped < value ? "max" : "min" }
    value = clamped
  }
  // A negative zero shows as "-0".
  return { ok: true, value: value === 0 ? 0 : value, ...(note ? { note } : {}) }
}

function clamp(value: number, rules: FieldRules): number {
  return Math.min(rules.max ?? Infinity, Math.max(rules.min ?? -Infinity, value))
}

function formatNumber(value: number): string {
  const rounded = Math.round(value * 100) / 100
  return String(rounded === 0 ? 0 : rounded)
}

type Lexeme =
  | { type: "number"; value: number; unit?: FieldUnit; text: string }
  | { type: "operator"; value: "+" | "-" | "*" | "/" }
  | { type: "open" }
  | { type: "close" }
  | { type: "current"; text: string }

const operatorAliases: Record<string, "+" | "-" | "*" | "/"> = {
  "+": "+",
  "-": "-",
  "−": "-",
  "*": "*",
  "×": "*",
  x: "*",
  "/": "/",
  "÷": "/"
}

function lex(text: string, rules: FieldRules): Lexeme[] | { reason: string } {
  const lexemes: Lexeme[] = []
  let at = 0
  while (at < text.length) {
    const char = text[at]!
    if (/\s/.test(char)) {
      at++
      continue
    }
    const number = /^(?:\d+(?:\.\d*)?|\.\d+)/.exec(text.slice(at))?.[0]
    if (number) {
      at += number.length
      const value = Number(number)
      const unitText = /^\s*(%|[a-z]+)/i.exec(text.slice(at))
      let unit: FieldUnit | undefined
      if (unitText) {
        const name = unitText[1]!.toLowerCase()
        // `x` after a number is times, as in `2x3`.
        if (name !== "x") {
          const known = unitFor(name, rules)
          if (typeof known !== "string") return known
          unit = known
          at += unitText[0].length
        }
      }
      lexemes.push({ type: "number", value, ...(unit ? { unit } : {}), text: number })
      continue
    }
    const word = /^[a-z]+/i.exec(text.slice(at))?.[0]
    if (word && word.toLowerCase() !== "x") {
      if (word.toLowerCase() !== "mixed") return { reason: `Can't read "${word}": ${expects(rules)}` }
      lexemes.push({ type: "current", text: word })
      at += word.length
      continue
    }
    const operator = operatorAliases[char.toLowerCase()]
    if (operator) {
      lexemes.push({ type: "operator", value: operator })
      at++
      continue
    }
    if (char === "(") lexemes.push({ type: "open" })
    else if (char === ")") lexemes.push({ type: "close" })
    else if (char === "%") return { reason: `A % needs a number before it, as in 50%` }
    else return { reason: `Can't read "${char}": ${expects(rules)}` }
    at++
  }
  return lexemes
}

function unitFor(name: string, rules: FieldRules): FieldUnit | { reason: string } {
  if (name === "%") return "%"
  if (name === "px" || name === "rem") {
    if (rules.kind === "length") return name
    return { reason: `${rules.label ?? "This field"} takes ${noun(rules)}, not ${name}` }
  }
  return { reason: `"${name}" isn't a unit ${rules.label ? `${rules.label} takes` : "here"}: ${expects(rules)}` }
}

/** The unit a value is shown with. */
function shownUnit(rules: FieldRules): string {
  if (rules.kind === "length") return "px"
  return rules.kind === "percent" ? "%" : ""
}

function noun(rules: FieldRules): string {
  if (rules.kind === "percent") return "a percentage"
  return rules.kind === "count" ? "a whole number" : "a number"
}

function expects(rules: FieldRules): string {
  return rules.kind === "length" ? "type a number, px, rem or %" : "type a number or %"
}

class Parser {
  private at = 0
  private readonly lexemes: Lexeme[]

  constructor(lexemes: Lexeme[]) {
    this.lexemes = lexemes
  }

  parse(): FieldExpression | { reason: string } {
    const expression = this.sum()
    if ("reason" in expression) return expression
    const next = this.lexemes[this.at]
    if (!next) return expression
    if (next.type === "close") return { reason: `A ")" has no "(" before it` }
    return { reason: `Put an operator between ${describe(this.lexemes[this.at - 1])} and ${describe(next)}` }
  }

  private sum(): FieldExpression | { reason: string } {
    let left = this.product()
    while (!("reason" in left)) {
      const next = this.lexemes[this.at]
      if (next?.type !== "operator" || (next.value !== "+" && next.value !== "-")) break
      this.at++
      const right = this.product(next.value)
      if ("reason" in right) return right
      left = { op: next.value, left, right }
    }
    return left
  }

  private product(after?: string): FieldExpression | { reason: string } {
    let left = this.factor(after)
    while (!("reason" in left)) {
      const next = this.lexemes[this.at]
      if (next?.type !== "operator" || (next.value !== "*" && next.value !== "/")) break
      this.at++
      const right = this.factor(next.value)
      if ("reason" in right) return right
      left = { op: next.value, left, right }
    }
    return left
  }

  private factor(after?: string): FieldExpression | { reason: string } {
    const next = this.lexemes[this.at]
    // Only a bracket leaves nothing to read without an operator before it, since an empty field clears.
    if (!next) return { reason: after ? `Something's missing after "${after}"` : "A bracket isn't closed" }
    this.at++
    switch (next.type) {
      case "number":
        return { op: "number", value: next.value, ...(next.unit ? { unit: next.unit } : {}) }
      case "current":
        return { op: "current" }
      case "open": {
        if (this.lexemes[this.at]?.type === "close") return { reason: "The brackets are empty" }
        const inner = this.sum()
        if ("reason" in inner) return inner
        if (this.lexemes[this.at]?.type !== "close") return { reason: `A bracket isn't closed` }
        this.at++
        return inner
      }
      case "operator":
        if (next.value === "-" || next.value === "+") {
          const operand = this.factor(next.value)
          if ("reason" in operand) return operand
          return next.value === "-" ? { op: "negate", operand } : operand
        }
        return { reason: after ? `Something's missing after "${after}"` : `Something's missing before "${next.value}"` }
      case "close":
        return { reason: after ? `Something's missing after "${after}"` : `A ")" has no "(" before it` }
    }
  }
}

function describe(lexeme: Lexeme | undefined): string {
  if (!lexeme) return "it"
  if (lexeme.type === "number") return lexeme.text
  if (lexeme.type === "current") return lexeme.text || "the value"
  if (lexeme.type === "open") return '"("'
  if (lexeme.type === "close") return '")"'
  return `"${lexeme.value}"`
}

function usesCurrent(expression: FieldExpression, rules: FieldRules): boolean {
  switch (expression.op) {
    case "current":
      return true
    case "number":
      // In a percentage field, % is its unit; elsewhere, a share of the value there.
      return expression.unit === "%" && rules.kind !== "percent"
    case "negate":
      return usesCurrent(expression.operand, rules)
    default:
      return usesCurrent(expression.left, rules) || usesCurrent(expression.right, rules)
  }
}

/** Works a sum out in what the field shows (pixels for lengths), against the value there, shown the same way. */
function evaluate(
  expression: FieldExpression,
  current: number | undefined,
  rules: FieldRules
): number | { reason: string } {
  switch (expression.op) {
    case "current":
      return current ?? { reason: "There's no value here to work from" }
    case "number": {
      const { value, unit } = expression
      if (unit === "rem") return value * remPixels
      if (unit === "step") return value * (rules.unit ?? 4)
      if (unit === "%" && rules.kind !== "percent") {
        return current === undefined
          ? { reason: `There's no value here to take ${value}% of` }
          : (current * value) / 100
      }
      return value
    }
    case "negate": {
      const operand = evaluate(expression.operand, current, rules)
      return typeof operand === "number" ? -operand : operand
    }
    default: {
      const left = evaluate(expression.left, current, rules)
      if (typeof left !== "number") return left
      const right = evaluate(expression.right, current, rules)
      if (typeof right !== "number") return right
      if (expression.op === "/" && right === 0) return { reason: "Can't divide by zero" }
      let result: number
      if (expression.op === "+") result = left + right
      else if (expression.op === "-") result = left - right
      else if (expression.op === "*") result = left * right
      else result = left / right
      return Number.isFinite(result) ? result : { reason: "That number is too big" }
    }
  }
}
