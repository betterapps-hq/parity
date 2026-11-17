/*
 * A typography preset token's parts: the font, size, weight and line height a `font` shorthand sets together, as MUI's
 * `--mui-font-h1: 300 6rem/1.167 "Roboto", sans-serif` does. Each part is as the token writes it, a value or a
 * `var()`, so a part that names another token stays that token.
 */

/** What a `font` shorthand sets, each as written; a part it leaves out is the shorthand's initial value. */
export interface TypeStyleParts {
  style?: string
  weight?: string
  size: string
  lineHeight?: string
  family: string
}

const fontStyles = new Set(["italic", "oblique", "normal"])

const sizeKeywords = new Set([
  "xx-small",
  "x-small",
  "small",
  "medium",
  "large",
  "x-large",
  "xx-large",
  "smaller",
  "larger"
])

const weightKeywords = new Set(["bold", "bolder", "lighter"])
const length = /^-?\d*\.?\d+(?:px|r?em|%|pt|vw|vh|ch|ex|cap|lh|rlh)$/i
const call = /^(?:var|calc|clamp|min|max)\(/i

/** A list split at the spaces outside quotes and brackets: `600 1rem/1.5 "Open Sans", serif` is four words. */
function words(text: string): string[] {
  const found: string[] = []
  let depth = 0
  let quote: string | undefined
  let word = ""

  for (const char of text) {
    if (quote) {
      quote = char === quote ? undefined : quote
    } else if (char === '"' || char === "'") {
      quote = char
    } else {
      depth += Number(char === "(") - Number(char === ")")
    }

    if (!quote && depth === 0 && /\s/.test(char)) {
      found.push(word)
      word = ""
    } else {
      word += char
    }
  }

  // A size and its line height are one word, however the slash between them is spaced: `16px / 1.5` is `16px/1.5`.
  return [...found, word]
    .filter((part) => part !== "")
    .reduce<string[]>((joined, part) => {
      const last = joined.at(-1)

      if (last !== undefined && (last.endsWith("/") || part.startsWith("/"))) {
        joined[joined.length - 1] = last + part
      } else {
        joined.push(part)
      }

      return joined
    }, [])
}

/** A size as a shorthand writes one: a length, a keyword, or a `var()` or `calc()`, before an optional line height. */
const isSize = (word: string) => length.test(word) || sizeKeywords.has(word.toLowerCase()) || call.test(word)

/**
 * The parts of a `font` shorthand: its style and weight, its size, its line height after the size's slash, and its
 * family, everything after the size. Undefined for a value that isn't one, as a system font keyword (`caption`) or
 * `inherit` is.
 */
export function typeStyleParts(value: string): TypeStyleParts | undefined {
  const all = words(value.trim())
  // The size is the word with the line height's slash, or else the first that reads as a size with words after it.
  let at = all.findIndex((word) => word.includes("/") && !word.startsWith('"') && !word.startsWith("'"))

  if (at === -1) {
    at = all.findIndex((word, index) => index < all.length - 1 && isSize(word) && !weightLike(word, all, index))
  }

  const sized = all[at]
  const family = all.slice(at + 1).join(" ")

  if (at === -1 || sized === undefined || family === "") {
    return undefined
  }

  const [size = "", lineHeight] = sized.split("/").map((part) => part.trim())
  const parts: TypeStyleParts = { size, family }

  if (lineHeight) {
    parts.lineHeight = lineHeight
  }

  for (const word of all.slice(0, at)) {
    if (fontStyles.has(word.toLowerCase()) && word.toLowerCase() !== "normal") {
      parts.style = word
    } else if (/^\d{1,4}$/.test(word) || weightKeywords.has(word.toLowerCase()) || call.test(word)) {
      parts.weight = word
    }
  }

  return parts
}

/** A `var()` before the size is the weight's, when another one after it can still be the size. */
function weightLike(word: string, all: readonly string[], index: number) {
  return call.test(word) && index + 2 < all.length && isSize(all[index + 1] ?? "")
}
