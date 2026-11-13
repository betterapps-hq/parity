import { type ReadFailure, readFailure } from "./read.ts"
import { lengthForm } from "./value.ts"

/*
 * Expressions as a field holds them (PAR-186): `calc()`, `min()`, `max()`, `clamp()` and `var()` worked out in pixels,
 * and an expression's simplest stored form, so `calc(var(--spacing) * 18)` is stored as `{ step: 18 }`.
 */

/** What a length expression is worked out against: what a % is of, the font size, and the viewport. */
export interface Basis {
  /** What 100% comes to: the parent's width for Width, the parent's font size for Font size. */
  percent: number
  fontSize?: number
  viewport?: { width: number; height: number }
}

/** The viewport a `vw` or `vh` is worked out against when the basis doesn't give one. */
const defaultViewport = { width: 1280, height: 800 }

type Lexeme =
  | { type: "number"; value: number; unit: string }
  | { type: "name"; value: string }
  | { type: "symbol"; value: string }

function lex(text: string): Lexeme[] | ReadFailure {
  const out: Lexeme[] = []
  let at = 0

  while (at < text.length) {
    const rest = text.slice(at)
    const space = /^\s+/.exec(rest)

    if (space) {
      at += space[0].length
      continue
    }

    const number = /^(\d*\.?\d+)(px|rem|em|vw|vh|%)?/i.exec(rest)

    if (number) {
      out.push({ type: "number", value: Number(number[1]), unit: (number[2] ?? "").toLowerCase() })
      at += number[0].length
      continue
    }

    const name = /^--?[a-z][\w-]*|^[a-z][\w-]*/i.exec(rest)

    if (name) {
      out.push({ type: "name", value: name[0].toLowerCase() })
      at += name[0].length
      continue
    }

    if ("+-*/(),".includes(rest[0]!)) {
      out.push({ type: "symbol", value: rest[0]! })
      at += 1
      continue
    }

    return readFailure("unreadable", `Can't read "${rest[0]}"`)
  }

  return out
}

/** A worked-out value: pixels, or a plain number to multiply or divide by. */
interface Amount {
  px: number
  plain: boolean
}

/** Thrown inside the evaluator to stop at the first failure; `evaluateLength` turns it back into its outcome. */
class Failed extends Error {
  readonly failure: ReadFailure

  constructor(failure: ReadFailure) {
    super(failure.reason)
    this.failure = failure
  }
}

/**
 * Works out a length expression in pixels, or says why it can't. `lengths` gives each length token's pixels by its
 * custom property's name without `--`, as `var()` names it.
 */
export function evaluateLength(
  text: string,
  basis: Basis,
  lengths: Readonly<Record<string, number>>
): number | ReadFailure {
  const lexed = lex(text)

  if (!Array.isArray(lexed)) {
    return lexed
  }

  let at = 0
  const peek = () => lexed[at]
  const isSymbol = (symbol: string) => peek()?.type === "symbol" && peek()!.value === symbol

  const fail = (code: ReadFailure["code"], reason: string): never => {
    throw new Failed(readFailure(code, reason))
  }

  const expect = (symbol: string) => {
    if (!isSymbol(symbol)) {
      fail(
        symbol === ")" ? "incomplete" : "unreadable",
        symbol === ")" ? "A bracket isn't closed" : `Expected "${symbol}"`
      )
    }

    at += 1
  }

  const unitPx = (value: number, unit: string): Amount => {
    const viewport = basis.viewport ?? defaultViewport

    const per = new Map([
      ["px", 1],
      ["rem", 16],
      ["em", basis.fontSize ?? 16],
      ["vw", viewport.width / 100],
      ["vh", viewport.height / 100],
      ["%", basis.percent / 100]
    ])

    if (unit === "") {
      return { px: value, plain: true }
    }

    return { px: value * per.get(unit)!, plain: false }
  }

  const args = (): Amount[] => {
    expect("(")
    const list = [sum()]

    while (isSymbol(",")) {
      at += 1
      list.push(sum())
    }

    expect(")")

    return list
  }

  const variable = (): Amount => {
    expect("(")
    const named = peek()

    if (named?.type !== "name" || !named.value.startsWith("--")) {
      return fail("unreadable", "var() takes a token, such as --spacing")
    }

    at += 1
    const name = named.value.slice(2)
    let fallback: Amount | undefined

    if (isSymbol(",")) {
      at += 1
      fallback = sum()
    }

    expect(")")
    const px = lengths[name]

    if (px !== undefined) {
      return { px, plain: false }
    }

    return fallback ?? fail("unknown-token", `There's no --${name} token`)
  }

  const call = (name: string): Amount => {
    const list = args()
    const values = list.map((amount) => amount.px)

    if (name === "calc") {
      return list.length === 1 ? list[0]! : fail("arguments", "calc() takes one sum")
    }

    if (name === "min") {
      return { px: Math.min(...values), plain: false }
    }

    if (name === "max") {
      return { px: Math.max(...values), plain: false }
    }

    if (name === "clamp") {
      if (list.length !== 3) {
        return fail("arguments", "clamp() takes three values: least, preferred and most")
      }

      return { px: Math.min(Math.max(values[1]!, values[0]!), values[2]!), plain: false }
    }

    return fail("unknown-function", `${name}() isn't a function a length takes`)
  }

  const factor = (): Amount => {
    const next = peek()

    if (!next) {
      return fail("incomplete", "It ends too soon")
    }

    at += 1

    if (next.type === "number") {
      return unitPx(next.value, next.unit)
    }

    if (next.type === "name") {
      return next.value === "var" ? variable() : call(next.value)
    }

    if (next.value === "-") {
      const operand = factor()

      return { ...operand, px: -operand.px }
    }

    if (next.value === "(") {
      const inner = sum()
      expect(")")

      return inner
    }

    if (next.value === ")" || next.value === ",") {
      return fail("incomplete", `Something's missing before "${next.value}"`)
    }

    return fail("unreadable", `Can't read "${next.value}" there`)
  }

  const product = (): Amount => {
    let left = factor()

    while (isSymbol("*") || isSymbol("/")) {
      const op = peek()!.value
      at += 1
      const right = factor()

      if (op === "*") {
        if (!left.plain && !right.plain) {
          fail("units", "Two lengths can't be multiplied")
        }

        left = { px: left.px * right.px, plain: left.plain && right.plain }
      } else {
        if (!right.plain) {
          fail("units", "Divide by a number, not a length")
        }

        if (right.px === 0) {
          fail("divide-by-zero", "It can't divide by 0")
        }

        left = { px: left.px / right.px, plain: left.plain }
      }
    }

    return left
  }

  function sum(): Amount {
    let left = product()

    while (isSymbol("+") || isSymbol("-")) {
      const op = peek()!.value
      at += 1
      const right = product()

      if (left.plain !== right.plain) {
        fail("units", "A length and a plain number can't be added")
      }

      left = { px: op === "+" ? left.px + right.px : left.px - right.px, plain: left.plain }
    }

    return left
  }

  try {
    const result = sum()

    if (at < lexed.length) {
      return readFailure("unreadable", `Can't read what's after ${text.slice(0, 24)}`)
    }

    return result.px
  } catch (error) {
    if (error instanceof Failed) {
      return error.failure
    }

    throw error
  }
}

/** What an expression is stored as: its simplest form, so it reads back the same way. */
export type ExpressionForm = { token: string; alpha?: { step: number } } | { step: number } | { value: string }

/**
 * An expression in its simplest stored form: a lone `var()` is its token (a color's without `color-`), a multiple of
 * `--spacing` a step, a token mixed toward transparent the token with its alpha, a whole number of pixels a step, and
 * anything else the value as written.
 */
export function expressionForm(text: string): ExpressionForm {
  const trimmed = text.trim()
  const named = /^var\(--([\w-]+)\)$/.exec(trimmed)?.[1]

  if (named !== undefined && named !== "spacing") {
    return { token: named.replace(/^color-/, "") }
  }

  const step = /^calc\(\s*var\(--spacing\)\s*\*\s*(\d*\.?\d+)\s*\)$/.exec(trimmed)?.[1]

  if (step !== undefined) {
    return { step: Number(step) }
  }

  const mix = /^color-mix\(\s*in\s+oklab\s*,\s*var\(--color-([\w-]+)\)\s+(\d*\.?\d+)%\s*,\s*transparent\s*\)$/.exec(
    trimmed
  )

  if (mix) {
    return { token: mix[1]!, alpha: { step: Number(mix[2]) } }
  }

  // Whole pixels are a spacing step, as every length writes them.
  const px = /^(\d*\.?\d+)(px)?$/.exec(trimmed)?.[1]
  const form = px === undefined ? undefined : lengthForm(Number(px))

  if (form !== undefined && "step" in form) {
    return form
  }

  return { value: trimmed }
}
