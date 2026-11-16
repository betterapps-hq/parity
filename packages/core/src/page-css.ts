/**
 * What a project's stylesheets need to be drawn in its frames rather than in Parity's page: whose code added one, read
 * from its stack; its relative addresses resolved; what it `@import`s put in place; and its media kept.
 */

/**
 * The origin of the code that called the method being guarded, or `undefined` when it's Parity's own, or there's no
 * telling (code with no address). `stack` is a V8 stack whose first frame is that code's.
 */
export function callerOrigin(stack: string, pageOrigin: string): string | undefined {
  for (const line of stack.split("\n")) {
    const address = /\b([a-z][a-z\d+.-]*:\/\/[^\s()]+?):\d+:\d+/i.exec(line)?.[1]

    if (!address) {
      continue
    }

    const origin = new URL(address).origin

    // An opaque origin, as `webpack-internal://` code has, says nothing about whose code it is: look further out.
    if (origin === "null") {
      continue
    }

    return origin === pageOrigin ? undefined : origin
  }

  return undefined
}

/**
 * `css` with each relative `url()`, from the root too, resolved against `address`, the linked stylesheet it was read
 * from, as a browser resolves them. Frames take it as a sheet of Parity's own, where they'd resolve against Parity's
 * page, and an imported stylesheet's root may be another origin's. Addresses with a scheme and fragments stay as
 * they are, and so do comments and strings, such as a `content` that reads `url(…)`.
 */
export function relativeUrlsFrom(css: string, address: string): string {
  // Read left to right, so a comment or string is passed over whole, whatever it holds. A quoted address is read
  // whole, parentheses and all; an unquoted one ends at whitespace or `)`.
  return css.replace(
    /\/\*[\s\S]*?(?:\*\/|$)|"(?:[^"\\\n]|\\[\s\S])*"|'(?:[^'\\\n]|\\[\s\S])*'|(?<![\w-])url\(\s*(?:"([^"]*)"|'([^']*)'|([^"'\s)]+))\s*\)/gi,
    (match, double?: string, single?: string, bare?: string) => {
      if (double === undefined && single === undefined && bare === undefined) {
        return match
      }

      const path = double ?? single ?? bare ?? ""
      const quote = [double === undefined ? "" : '"', single === undefined ? "" : "'"].join("")

      return /^(?:[a-z][a-z\d+.-]*:|#)/i.test(path) ? match : `url(${quote}${new URL(path, address).href}${quote})`
    }
  )
}

/** `css` as a stylesheet with `media` applies it, when that's narrower than every medium. */
export function withMedia(css: string, media: string | null): string {
  const query = media?.trim()

  return !query || query === "all" ? css : `@media ${query} {\n${css}\n}`
}

/** `@import` statements: the address, plain or in `url()`, and what follows it (layer, supports, media). */
function importPattern(): RegExp {
  // A quoted address is read whole, semicolons and all, as Google Fonts' carry.
  return /@import\s+(?:url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))\s*\)|"([^"]*)"|'([^']*)')\s*([^;]*);/g
}

/** An `@import` match's address, whichever way it was written. */
function importAddress(match: readonly (string | undefined)[]): string {
  return match[1] ?? match[2] ?? match[3] ?? match[4] ?? match[5] ?? ""
}

/**
 * `css`'s `@import` statements outside comments and strings: where each starts and ends, its address and its
 * conditions.
 */
export function importsIn(css: string): { start: number; end: number; address: string; conditions: string }[] {
  // Read left to right, so a comment or a string, such as a `content` that reads `@import`, is passed over whole.
  const tokens = new RegExp(
    `${importPattern().source}|\\/\\*[\\s\\S]*?(?:\\*\\/|$)|"(?:[^"\\\\\\n]|\\\\[\\s\\S])*"|'(?:[^'\\\\\\n]|\\\\[\\s\\S])*'`,
    "g"
  )

  return [...css.matchAll(tokens)].flatMap((match) =>
    match[0].startsWith("@")
      ? [
          {
            start: match.index,
            end: match.index + match[0].length,
            address: importAddress(match),
            conditions: match[6] ?? ""
          }
        ]
      : []
  )
}

/**
 * `css`, read from `address`, with each `@import` replaced by what it imports, read the same way and wrapped in its
 * layer, supports condition and media, as a browser applies it. A frame's stylesheet ignores `@import`, so what a
 * stylesheet imports would otherwise be lost. `readSheet` gives a stylesheet's text by its address, and where it came
 * from in the end; one it can't read is left out. Imports nest five deep at most.
 */
export async function withImports(
  css: string,
  address: string,
  readSheet: (address: string) => Promise<{ text: string; from: string } | undefined>,
  depth = 0
): Promise<string> {
  const statements = importsIn(css)

  if (statements.length === 0 || depth > 5) {
    return css
  }

  const contents = await Promise.all(
    statements.map(async (statement) => {
      const answer = await readSheet(new URL(statement.address, address).href)

      return answer ? withImports(relativeUrlsFrom(answer.text, answer.from), answer.from, readSheet, depth + 1) : ""
    })
  )

  let from = 0

  const parts = statements.map((statement, index) => {
    const before = css.slice(from, statement.start)

    from = statement.end

    return before + importConditions(contents[index] ?? "", statement.conditions)
  })

  return parts.join("") + css.slice(from)
}

/** Imported CSS wrapped in the layer, supports condition and media its `@import` names, in that order outward. */
export function importConditions(css: string, conditions: string): string {
  let rest = conditions.trim()
  let wrapped = css
  const layer = /^layer(?:\(\s*([^)]*?)\s*\))?/.exec(rest)

  if (layer) {
    wrapped = `@layer${layer[1] ? ` ${layer[1]}` : ""} {\n${wrapped}\n}`
    rest = rest.slice(layer[0].length).trim()
  }

  const supports = rest.startsWith("supports(") ? balanced(rest, "supports".length) : undefined

  if (supports !== undefined) {
    const condition = rest.slice("supports(".length, supports).trim()
    // A bare declaration, `display: grid`, needs parentheses; a whole condition, `selector(:has(*))`, has them.
    const declaration = /^-*[a-z_][\w-]*\s*:/i.test(condition)
    wrapped = `@supports ${declaration ? `(${condition})` : condition} {\n${wrapped}\n}`
    rest = rest.slice(supports + 1).trim()
  }

  return withMedia(wrapped, rest)
}

/** Where the parenthesis that opens at `open` in `text` closes, however deep what's inside nests. */
function balanced(text: string, open: number): number | undefined {
  let depth = 0

  for (let index = open; index < text.length; index++) {
    if (text[index] === "(") {
      depth++
    } else if (text[index] === ")" && --depth === 0) {
      return index
    }
  }

  return undefined
}
