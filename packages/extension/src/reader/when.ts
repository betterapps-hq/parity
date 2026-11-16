/*
 * The expressions a manifest's `when` and `enablement` hold (PAR-1092): `node.type == route`, `selection.count > 1`,
 * `tool == select`, `project.uses(storybook)`, `fact.stories > 0`, an extension's own key such as `storybook.hasStories`,
 * and those joined with `&&`, `||`, `!` and parentheses. A key on its own holds when it's true, a number other than 0,
 * a string other than empty, or a list holding the key of what the command is shown for. On the left of a comparison is
 * a key, looked up; on the right a value, written as a word, a number or a quoted string. Numbers compare as numbers.
 */

/** A key's value: what Parity knows of where a command shows, or what an extension set. */
export type WhenValue = string | number | boolean | readonly string[]

/** What an expression is tested against. */
export interface WhenContext {
  /** A key's value, as `node.type` or `storybook.hasStories`, or nothing when it isn't set. */
  value(key: string): WhenValue | undefined
  /** Whether the project has a tool, by the prefix of the extension for it or the id of the adapter that reads it. */
  uses(tool: string): boolean
  /** The key of what the command is shown for, which a list key holds for. */
  target?: string
}

type Comparison = "==" | "!=" | ">" | ">=" | "<" | "<="

/** A parsed expression. */
export type When =
  | { kind: "key"; key: string }
  | { kind: "uses"; tool: string }
  | { kind: "compare"; key: string; op: Comparison; value: string }
  | { kind: "not"; of: When }
  | { kind: "and" | "or"; left: When; right: When }

type Token = { kind: "word" | "string"; text: string } | { kind: "op"; text: string }

const tokenPattern = /\s*(?:(&&|\|\||==|!=|>=|<=|[!()<>,])|'([^']*)'|"([^"]*)"|([\w.\-/]+))/y

function tokenize(text: string): Token[] {
  const tokens: Token[] = []
  tokenPattern.lastIndex = 0

  while (tokenPattern.lastIndex < text.length) {
    if (/^\s*$/.test(text.slice(tokenPattern.lastIndex))) {
      break
    }

    const at = tokenPattern.lastIndex
    const match = tokenPattern.exec(text)

    if (!match) {
      throw new Error(`can't read "${text.slice(at).trim()}"`)
    }

    const [, op, single, double, word] = match

    if (op !== undefined) {
      tokens.push({ kind: "op", text: op })
    } else if (word !== undefined) {
      tokens.push({ kind: "word", text: word })
    } else {
      tokens.push({ kind: "string", text: single ?? double ?? "" })
    }
  }

  return tokens
}

const comparisons = new Set<string>(["==", "!=", ">", ">=", "<", "<="])

function isComparison(text: string): text is Comparison {
  return comparisons.has(text)
}

/** Reads an expression, or throws saying what's wrong with it. */
export function parseWhen(text: string): When {
  const tokens = tokenize(text)
  let at = 0

  const peek = () => tokens[at]
  const isOp = (op: string) => peek()?.kind === "op" && peek()?.text === op

  const expect = (op: string) => {
    if (!isOp(op)) {
      throw new Error(`expected "${op}"${peek() ? ` before "${peek()?.text}"` : " at the end"}`)
    }

    at++
  }

  const word = (what: string): string => {
    const token = peek()

    if (token?.kind !== "word") {
      throw new Error(`expected ${what}${token ? ` before "${token.text}"` : " at the end"}`)
    }

    at++

    return token.text
  }

  const or = (): When => {
    let left = and()

    while (isOp("||")) {
      at++
      left = { kind: "or", left, right: and() }
    }

    return left
  }

  const and = (): When => {
    let left = unary()

    while (isOp("&&")) {
      at++
      left = { kind: "and", left, right: unary() }
    }

    return left
  }

  const unary = (): When => {
    if (isOp("!")) {
      at++

      return { kind: "not", of: unary() }
    }

    if (isOp("(")) {
      at++
      const inner = or()
      expect(")")

      return inner
    }

    const key = word("a key")

    if (isOp("(")) {
      if (key !== "project.uses") {
        throw new Error(`${key}() isn't something a when can call; project.uses(tool) is`)
      }

      at++
      const tool = word("a tool")
      expect(")")

      return { kind: "uses", tool }
    }

    const next = peek()

    if (next?.kind === "op" && isComparison(next.text)) {
      at++
      const value = peek()

      if (value?.kind !== "word" && value?.kind !== "string") {
        throw new Error(`expected a value after "${next.text}"`)
      }

      at++

      return { kind: "compare", key, op: next.text, value: value.text }
    }

    return { kind: "key", key }
  }

  if (tokens.length === 0) {
    throw new Error("is empty")
  }

  const parsed = or()

  if (at < tokens.length) {
    throw new Error(`didn't expect "${tokens[at]?.text}"`)
  }

  return parsed
}

/** Every key an expression looks up, as a manifest's check reads them. */
export function whenKeys(when: When): string[] {
  switch (when.kind) {
    case "key":
    case "compare":
      return [when.key]
    case "uses":
      return []
    case "not":
      return whenKeys(when.of)
    case "and":
    case "or":
      return [...whenKeys(when.left), ...whenKeys(when.right)]
  }
}

/**
 * The first part of each key Parity sets itself: what a command shows for, the selection, the tool, facts, `layer`,
 * which holds for a layer that isn't a component's, and `process`, what a process's menu is for.
 */
export const builtInKeys: readonly string[] = ["node", "selection", "tool", "fact", "layer", "process"]

/** Whether a key is one Parity sets rather than an extension. */
export function isBuiltInKey(key: string): boolean {
  return builtInKeys.some((root) => key === root || key.startsWith(`${root}.`))
}

/** Whether an expression holds. */
export function evaluateWhen(when: When, context: WhenContext): boolean {
  switch (when.kind) {
    case "key":
      return truthy(context.value(when.key), context.target)
    case "uses":
      return context.uses(when.tool)
    case "compare":
      return compare(context.value(when.key), when.op, when.value)
    case "not":
      return !evaluateWhen(when.of, context)
    case "and":
      return evaluateWhen(when.left, context) && evaluateWhen(when.right, context)
    case "or":
      return evaluateWhen(when.left, context) || evaluateWhen(when.right, context)
  }
}

/** Reads and tests an expression; one that doesn't read doesn't hold. Nothing at all holds. */
export function holdsWhen(text: string | undefined, context: WhenContext): boolean {
  if (text === undefined) {
    return true
  }

  try {
    return evaluateWhen(parseWhen(text), context)
  } catch {
    return false
  }
}

function truthy(value: WhenValue | undefined, target: string | undefined): boolean {
  if (Array.isArray(value)) {
    return target !== undefined && value.includes(target)
  }

  return value !== undefined && value !== false && value !== 0 && value !== ""
}

function compare(value: WhenValue | undefined, op: Comparison, written: string): boolean {
  if (value === undefined) {
    return op === "!="
  }

  // A list is equal to a value it holds.
  if (Array.isArray(value)) {
    return op === "==" ? value.includes(written) : op === "!=" && !value.includes(written)
  }

  const left = Number(value)
  const right = Number(written)

  const numeric =
    value !== true && value !== false && written.trim() !== "" && !Number.isNaN(left) && !Number.isNaN(right)

  if (numeric) {
    switch (op) {
      case "==":
        return left === right
      case "!=":
        return left !== right
      case ">":
        return left > right
      case ">=":
        return left >= right
      case "<":
        return left < right
      case "<=":
        return left <= right
    }
  }

  const text = String(value)

  switch (op) {
    case "==":
      return text === written
    case "!=":
      return text !== written
    default:
      return false
  }
}
