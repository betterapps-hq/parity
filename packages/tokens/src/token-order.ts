import { type PreviewKind, valueParts } from "./kinds.ts"

/**
 * The one order tokens are listed in, wherever Parity lists them: the Tokens panel, the inspector's token pickers and
 * the spacing picker read it from here, so they can't fall out of step. Each kind with a size or a number lists
 * smallest first; ties, and kinds with no one order, go by name the way people count.
 */

/** A length in pixels from px, rem or em; NaN for anything else, such as `calc()`, which only a browser can work out. */
export function parsedLength(value: string): number {
  const match = /^(-?\d*\.?\d+)(px|rem|em)?$/.exec(value.trim())
  return match ? Number(match[1]) * (match[2] === "rem" || match[2] === "em" ? 16 : 1) : Number.NaN
}

/** A duration in milliseconds, from ms or s; NaN for anything else. */
export function parsedDuration(value: string): number {
  const match = /^(\d*\.?\d+)(ms|s)$/.exec(value.trim())
  return match ? Number(match[1]) * (match[2] === "s" ? 1000 : 1) : Number.NaN
}

/**
 * How far a shadow reaches past its box, in pixels: for its furthest layer, its offset plus its blur and spread. Read
 * from the value, as `0 4px 6px -1px rgb(0 0 0 / 0.1)` reaches 9, so shadows order by size whatever they're named.
 * `none` reaches 0. Undefined when no layer has a length it can read, as when the lengths are variables. `length` reads
 * each length, so a `calc()` one counts when it's given a measurer that can work it out, as `scaleValue`'s is.
 */
export function shadowReach(value: string, length: (value: string) => number = parsedLength): number | undefined {
  if (value.trim() === "none") return 0
  let furthest: number | undefined
  for (const layer of valueParts(value)) {
    const lengths = topLevelWords(layer)
      .map(length)
      .filter((each) => !Number.isNaN(each))
    if (lengths.length === 0) continue
    const [x = 0, y = 0, blur = 0, spread = 0] = lengths
    const reach = Math.max(Math.abs(x), Math.abs(y)) + Math.max(0, blur) + spread
    furthest = Math.max(furthest ?? reach, reach)
  }
  return furthest
}

/**
 * A value's words outside brackets, so a color function's numbers aren't taken for lengths. Of the words with brackets,
 * only math (`calc()`, `min()`, `max()`, `clamp()`) is kept, as a length; a color or a `var()` isn't one.
 */
function topLevelWords(value: string): string[] {
  const words: string[] = []
  let depth = 0
  let word = ""
  for (const char of value) {
    if (char === "(") depth++
    else if (char === ")") depth--
    if (depth === 0 && /\s/.test(char)) {
      if (word) words.push(word)
      word = ""
    } else word += char
  }
  if (word) words.push(word)
  return words.filter((each) => !each.includes("(") || /^(?:calc|min|max|clamp)\(/i.test(each))
}

/**
 * Where a token falls in its scale, for the kinds whose values are measured: a length in pixels, a duration in
 * milliseconds, a weight, a ratio, how far a shadow reaches, an animation's duration, or a plain number. `none` is 0.
 * Undefined for the kinds with no one order (colors, fonts, easings, cursors) and for a value that can't be measured.
 * A value still holding a `var()` can't be measured either, whichever part holds it, since the variable could be
 * anything: a shadow of `0 var(--y) black` has no reach of 0. `length` measures what plain parsing can't, such as
 * `calc()`; the app passes one that asks the browser.
 */
export function scaleValue(
  kind: PreviewKind,
  value: string,
  length: (value: string) => number = parsedLength
): number | undefined {
  const text = value.trim()
  if (/\bvar\(/i.test(text)) return undefined
  let measured: number
  switch (kind) {
    case "spacing":
    case "radius":
    case "font-size":
    case "tracking":
    case "border-width":
    case "blur":
    case "backdrop-blur":
    case "perspective":
    case "breakpoint":
    case "container":
      measured = text === "none" ? 0 : length(text)
      break
    case "duration":
      measured = parsedDuration(text)
      break
    case "shadow":
    case "inset-shadow":
    case "drop-shadow":
    case "text-shadow":
      measured = shadowReach(text, length) ?? Number.NaN
      break
    case "animation":
      measured =
        (text.match(/[\w-]+\([^)]*\)|\S+/g) ?? []).map(parsedDuration).find((time) => !Number.isNaN(time)) ?? Number.NaN
      break
    case "font-weight":
    case "leading":
    case "opacity":
    case "z-index":
    case "number":
      measured = Number(text)
      break
    case "aspect": {
      const [width = Number.NaN, height = 1] = text.split("/").map((part) => Number(part.trim()))
      measured = width / height
      break
    }
    default:
      return undefined
  }
  return Number.isFinite(measured) ? measured : undefined
}

/**
 * Items in token order: smallest first by `scaleValue`, ties by name, and those that can't be measured (or whose kind
 * has no one order) after the rest, by name. `describe` says each item's name, kind and the value it comes to.
 */
export function orderTokens<T>(
  items: readonly T[],
  describe: (item: T) => { name: string; kind: PreviewKind; value: string },
  length?: (value: string) => number
): T[] {
  return items
    .map((item) => {
      const { name, kind, value } = describe(item)
      return { item, name, value: scaleValue(kind, value, length) }
    })
    .toSorted((a, b) => {
      if (a.value === undefined || b.value === undefined) {
        return (a.value === undefined ? 1 : 0) - (b.value === undefined ? 1 : 0) || compareNames(a.name, b.name)
      }
      return a.value - b.value || compareNames(a.name, b.name)
    })
    .map(({ item }) => item)
}

const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" })

/**
 * Names in the order people count them: word by word (split at dashes, underscores and camelCase), numbers by value
 * (`chart-2` before `chart-10`, `fontSizeBase100` before `fontSizeBase1000`), and size words smallest first, so
 * `none`, `2xs`, `xs`, `sm`, `md`, `lg`, `xl`, `2xl` and Fluent's `XXS` to `XXL` and `Small` to `XLarge` keep their
 * order whatever library names them. Where a size word meets another word, the size word comes first, so the order
 * never runs in a circle (`sm` before `lg` by size, `lg` before `normal` and `normal` before `sm` alphabetically). A
 * name that is the start of another comes first.
 */
export function compareNames(a: string, b: string): number {
  const left = nameWords(a)
  const right = nameWords(b)
  for (let index = 0; index < Math.min(left.length, right.length); index++) {
    const x = left[index]!
    const y = right[index]!
    const [xSize, ySize] = [sizeRank(x), sizeRank(y)]
    let order: number
    if (xSize !== undefined && ySize !== undefined) order = xSize - ySize
    else if (xSize !== undefined || ySize !== undefined) order = xSize === undefined ? 1 : -1
    else if (/^\d*\.?\d+$/.test(x) && /^\d*\.?\d+$/.test(y)) order = Number(x) - Number(y)
    else order = collator.compare(x, y)
    if (order) return order
  }
  return left.length - right.length
}

function nameWords(name: string): string[] {
  return name.split(/[-_]+|(?<=[a-z\d])(?=[A-Z])/).filter(Boolean)
}

/**
 * Where a size word falls, small to large: `none` first, `sm`, `s` and `Small` -1, `md`, `m`, `Medium` and `base` 0,
 * `lg`, `l` and `Large` 1, and each x, or the number before it, takes one step further out: `xs` -2, `2xs` and `XXS`
 * -3, `xl` and `XLarge` 2, `2xl` 3. Undefined for any other word.
 */
function sizeRank(word: string): number | undefined {
  if (word.toLowerCase() === "none") return Number.NEGATIVE_INFINITY
  const match = /^(?:(\d+)x|(x*))(s|sm|small|m|md|medium|base|l|lg|large)$/i.exec(word)
  if (!match) return undefined
  const size = match[3]!.toLowerCase()
  let side = 0
  if (["s", "sm", "small"].includes(size)) side = -1
  else if (["l", "lg", "large"].includes(size)) side = 1
  const steps = match[1] ? Number(match[1]) : match[2]!.length
  return side * (1 + steps)
}
