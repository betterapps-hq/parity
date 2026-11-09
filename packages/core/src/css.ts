/** Container name for a rendered mode's body; viewport media queries are rewritten to query it. */
export const viewportContainerName = "canvas-viewport"

/** Attribute on the element that stands in for `<body>` inside each rendered mode. */
export const bodyAttribute = "data-canvas-body"

/**
 * Custom properties holding 1% of a frame's viewport width and height, which viewport units are rewritten to: in a frame,
 * `100vh` is the height of the screen the frame stands for, not of Parity's window.
 */
export const viewportWidthProperty = "--canvas-vw"
export const viewportHeightProperty = "--canvas-vh"

/**
 * The custom property `rem` is rewritten to: in a frame, the project's root font size, not Parity's. A frame sets it
 * from `rootFontSizeProperty`, a length registered so that `1em` on the frame's root becomes that root's font size.
 */
export const remProperty = "--canvas-rem"
export const rootFontSizeProperty = "--canvas-root-font-size"

/** A browser's default font size, `medium`, which a page's root font size is relative to. */
const mediumFontSize = 16

/**
 * Declarations that set each custom property to `initial`, the guaranteed-invalid value, so an element doesn't inherit
 * it and `var(--name, fallback)` takes its fallback, as where nothing defines it. A frame's root takes these for the
 * custom properties Parity's own page defines around it, which would otherwise inherit into the frame. Names that
 * aren't custom properties are left out, and characters a name can't hold as they are are escaped, so a name never
 * reads as a different declaration.
 */
export function resetCustomProperties(names: Iterable<string>): string {
  const declarations: string[] = []

  for (const name of names) {
    if (!name.startsWith("--") || name.length === 2) {
      continue
    }

    declarations.push(`--${escapeIdentifier(name.slice(2))}: initial;`)
  }

  return declarations.join(" ")
}

/** Escapes what can't stand as it is in the rest of an identifier: a character other than a letter, digit, `-` or `_`. */
function escapeIdentifier(text: string): string {
  let escaped = ""

  for (const char of text) {
    const code = char.codePointAt(0)!
    escaped += /[\w-]/.test(char) || code >= 0x80 ? char : `\\${code.toString(16)} `
  }

  return escaped
}

export interface CanvasCss {
  /** Adopted by every rendered mode's shadow root. */
  scoped: string
  /** Rules that only work at document level (`@property`, `@font-face`). */
  global: string
}

export interface PrepareCssOptions {
  /** Origin that serves the project's assets; root-relative `url()`s are made absolute against it. */
  baseUrl: string
  /**
   * Whether lengths a frame measures differently from Parity's page (viewport units, `rem` and the root's font size)
   * are rewritten, as they are for drawing. Tokens are read with `false`, so they keep the values the project wrote.
   */
  units?: boolean
  /**
   * Whether `prefers-color-scheme` blocks become rules for frames of that scheme, as they are for drawing (see
   * `colorSchemeAttribute`). Tokens are read with `false`, so the blocks stay as the project wrote them.
   */
  colorSchemes?: boolean
}

/** A colour scheme a `prefers-color-scheme` query asks for. */
export type ColorScheme = "dark" | "light"

/**
 * The attribute on a frame's body that says which colour scheme the frame shows, `dark` or `light`. Every frame shares
 * Parity's window, and with it one `prefers-color-scheme`, so a project's `@media (prefers-color-scheme: dark)` block
 * is drawn as rules for the body with `data-canvas-color-scheme="dark"` instead, which a frame whose mode shows the
 * dark theme gets (see `themeAttributes` in `@parity-app/tokens`).
 */
export const colorSchemeAttribute = "data-canvas-color-scheme"

/**
 * The colour scheme a media query asks for, when that's the whole query: `(prefers-color-scheme: dark)` is `dark`.
 * One that asks for more as well, such as `screen and (prefers-color-scheme: dark)`, is left alone.
 */
export function colorSchemeQuery(query: string): ColorScheme | undefined {
  const scheme = /^\(\s*prefers-color-scheme\s*:\s*(dark|light)\s*\)$/i.exec(query.trim())?.[1]?.toLowerCase()

  return scheme === "dark" || scheme === "light" ? scheme : undefined
}

/**
 * Prepares a project's compiled CSS for rendering inside per-mode shadow roots without iframes:
 *
 * - viewport media queries become container queries, so each mode responds to its own width, not the window's
 * - `prefers-color-scheme` blocks become rules for the frame's body in that scheme, so each mode shows its own theme,
 *   not the window's (see `colorSchemeAttribute`)
 * - viewport units (`vw`, `vh`, `svh`, `dvh`, `vmin` and the rest) become the frame's, through custom properties
 * - `rem` becomes the frame's root font size, through a custom property
 * - `:root` and `html` become `:host`, and `body` becomes the mode's body element; the root's font size, when it's
 *   relative (`62.5%`, `1.2em`, `1.25rem`), is worked out from a browser's default, since around a frame's root is
 *   Parity's canvas, not a browser's defaults
 * - `@property` and `@font-face` move to the document, because shadow roots ignore them
 * - root-relative `url()`s point at the project's server instead of the canvas UI
 */
export function prepareCanvasCss(css: string, options: PrepareCssOptions): CanvasCss {
  const globals: string[] = []
  const scoped = serialize(parse(css), options, globals)

  return { scoped, global: globals.join("\n") }
}

/** An at-rule a declaration sits under, such as `@media (prefers-color-scheme: dark)`. */
export interface EnclosingAtRule {
  /** Lowercase, without `@`: `media`, `layer`, `supports`… */
  name: string
  /** What follows the name, trimmed: `(prefers-color-scheme: dark)`, or empty for an anonymous `@layer`. */
  prelude: string
}

export interface CustomPropertyDeclaration {
  /**
   * Selector of the innermost style rule that declares it, or empty for a declaration directly in an at-rule, as in
   * Tailwind's `@theme`.
   */
  selector: string
  /** The at-rules it sits under, outermost first, whether outside or nested inside its style rule. */
  atRules: EnclosingAtRule[]
  /** Property name without `--`. */
  name: string
  value: string
}

/** Every custom property declaration in a stylesheet, in source order. */
export function collectCustomProperties(css: string): CustomPropertyDeclaration[] {
  const declarations: CustomPropertyDeclaration[] = []

  const visit = (nodes: CssNode[], selector: string | undefined, atRules: EnclosingAtRule[]) => {
    for (const node of nodes) {
      if (node.kind === "block") {
        const prelude = node.prelude.trim()
        const atRule = /^@([\w-]+)\s*([\s\S]*)$/.exec(prelude)

        if (atRule) {
          visit(node.children, selector, [...atRules, { name: atRule[1]!.toLowerCase(), prelude: atRule[2]!.trim() }])
        } else {
          visit(node.children, prelude, atRules)
        }
      } else if (selector !== undefined || atRules.length > 0) {
        for (const match of node.text.matchAll(/--([\w-]+)\s*:\s*([^;]+)/g)) {
          declarations.push({ selector: selector ?? "", atRules, name: match[1]!, value: match[2]!.trim() })
        }
      }
    }
  }

  visit(parse(css), undefined, [])

  return declarations
}

type CssNode = { kind: "text"; text: string } | { kind: "block"; prelude: string; children: CssNode[] }

function parse(css: string): CssNode[] {
  let index = 0

  function parseLevel(): CssNode[] {
    const nodes: CssNode[] = []
    let buffer = ""
    let afterLastSemicolon = 0
    let parens = 0

    while (index < css.length) {
      const char = css[index]!

      if (char === "/" && css[index + 1] === "*") {
        const end = css.indexOf("*/", index + 2)
        index = end === -1 ? css.length : end + 2
        continue
      }

      // Escaped characters are literal, e.g. Tailwind's `.\[\&_svg\:not\(\[class\*\=\'size-\'\]\)\]`.
      if (char === "\\") {
        buffer += css.slice(index, index + 2)
        index += 2
        continue
      }

      if (char === '"' || char === "'") {
        const end = findStringEnd(css, index)
        buffer += css.slice(index, end)
        index = end
        continue
      }

      index++

      if (char === "(") {
        parens++
      }

      if (char === ")") {
        parens = Math.max(0, parens - 1)
      }

      if (parens > 0) {
        buffer += char
        continue
      }

      if (char === ";") {
        buffer += char
        afterLastSemicolon = buffer.length
      } else if (char === "{") {
        const text = buffer.slice(0, afterLastSemicolon)

        if (text) {
          nodes.push({ kind: "text", text })
        }

        nodes.push({ kind: "block", prelude: buffer.slice(afterLastSemicolon), children: parseLevel() })
        buffer = ""
        afterLastSemicolon = 0
      } else if (char === "}") {
        if (buffer) {
          nodes.push({ kind: "text", text: buffer })
        }

        return nodes
      } else {
        buffer += char
      }
    }

    if (buffer) {
      nodes.push({ kind: "text", text: buffer })
    }

    return nodes
  }

  const nodes: CssNode[] = []

  while (index < css.length) {
    nodes.push(...parseLevel())
  }

  return nodes
}

function findStringEnd(css: string, start: number): number {
  const quote = css[start]
  let index = start + 1

  while (index < css.length) {
    if (css[index] === "\\") {
      index += 2
    } else if (css[index] === quote) {
      return index + 1
    } else {
      index++
    }
  }

  return css.length
}

/** Where the nodes being serialized sit. */
interface SerializeContext {
  /** The declarations are the root's: in a rule for `:root` or `html`, or in an at-rule inside one. */
  root?: boolean
  /** Inside a style rule, where a nested rule is relative to it. */
  inRule?: boolean
  /** Inside a `prefers-color-scheme` block that isn't in a style rule, so its rules apply in frames of this scheme. */
  scheme?: ColorScheme
}

/** Serializes rules for a frame. */
function serialize(
  nodes: CssNode[],
  options: PrepareCssOptions,
  globals: string[],
  context: SerializeContext = {}
): string {
  let output = ""

  for (const node of nodes) {
    if (node.kind === "text") {
      const text = rewriteUrls(node.text, options.baseUrl)

      if (options.units === false) {
        output += text
      } else {
        output += rewriteFrameUnits(context.root ? rewriteRootFontSize(text) : text)
      }

      continue
    }

    const prelude = node.prelude.trim()
    const leading = node.prelude.slice(0, node.prelude.length - node.prelude.trimStart().length)

    if (prelude.startsWith("@")) {
      const scheme = schemeOfBlock(node, options)

      if (scheme && context.inRule) {
        // Nested in a rule, as Tailwind's `dark:` utilities are: the rule's elements in a frame of that scheme.
        const body = serialize(node.children, options, globals, { root: context.root, inRule: true })
        output += `${leading}${inColorScheme(scheme)} & {${body}}`
      } else if (scheme) {
        output += leading + serialize(node.children, options, globals, { ...context, scheme })
      } else {
        const body = serialize(node.children, options, globals, context)

        if (/^@(property|font-face)\b/i.test(prelude)) {
          globals.push(`${prelude} {${body}}`)
        } else {
          output += `${leading}${/^@media\b/i.test(prelude) ? rewriteMedia(prelude) : prelude} {${body}}`
        }
      }

      continue
    }

    const selector = rewriteSelector(prelude)
    const selectors = splitSelectorList(selector)
    const roots = selectors.filter((part) => rootSelector.test(part))
    const scope = (list: string) => (context.scheme ? scopeToColorScheme(list, context.scheme) : list)

    // A colour-scheme block in the root's own rule can't reach the frame's body as a nested rule, so it follows the rule.
    const hoisted =
      roots.length === selectors.length ? node.children.filter((child) => schemeOfBlock(child, options)) : []

    const children = node.children.filter((child) => !hoisted.includes(child))

    if (roots.length === 0) {
      output += `${leading}${scope(selector)} {${serialize(children, options, globals, { inRule: true })}}`
      continue
    }

    const rootBody = serialize(children, options, globals, { root: true, inRule: true })
    const others = selectors.filter((part) => !rootSelector.test(part))
    const otherBody = others.length > 0 ? serialize(children, options, globals, { inRule: true }) : rootBody

    // A rule for the root and other elements at once, as `html, body`, is split when the root's font size changes, so
    // only the root's does.
    if (rootBody === otherBody) {
      output += `${leading}${scope(selector)} {${rootBody}}`
    } else {
      output += `${leading}${scope(roots.join(", "))} {${rootBody}} ${scope(others.join(", "))} {${otherBody}}`
    }

    for (const block of hoisted) {
      if (block.kind !== "block") {
        continue
      }

      const body = serialize(block.children, options, globals, { root: true, inRule: true })
      output += ` ${scopeToColorScheme(selector, schemeOfBlock(block, options)!)} {${body}}`
    }
  }

  return output
}

/** A selector for the frame's root alone, as `:root` and `html` become: `:host`, or `:host(.dark)`. */
const rootSelector = /^:host(?:\([^()]*\))?$/

/** The colour scheme a `prefers-color-scheme` block asks for, unless it's left alone. */
function schemeOfBlock(node: CssNode, options: PrepareCssOptions): ColorScheme | undefined {
  if (node.kind !== "block" || options.colorSchemes === false) {
    return undefined
  }

  const media = /^@media\s+([\s\S]*)$/i.exec(node.prelude.trim())

  return media ? colorSchemeQuery(media[1]!) : undefined
}

/** The frame's body in a colour scheme, adding nothing to a selector's specificity, as a media query adds nothing. */
function inColorScheme(scheme: ColorScheme): string {
  return `:where([${bodyAttribute}][${colorSchemeAttribute}="${scheme}"])`
}

/**
 * A selector list from a colour-scheme block, as it applies in frames of that scheme. The root (`:host`, which `:root`
 * became) becomes the frame's body in the scheme, with no specificity, so the body's own rules and a theme's class on
 * it still win, as they would over values the body inherits from the root. `body` (the body element) keeps its own
 * specificity, and anything else is looked for inside that body.
 */
function scopeToColorScheme(list: string, scheme: ColorScheme): string {
  const body = `[${bodyAttribute}]`

  return splitSelectorList(list)
    .map((part) => {
      if (/^:host(?![\w(-])/.test(part)) {
        return inColorScheme(scheme) + part.slice(":host".length)
      }

      if (part.startsWith(body)) {
        return `${body}:where([${colorSchemeAttribute}="${scheme}"])${part.slice(body.length)}`
      }

      return `${inColorScheme(scheme)} ${part}`
    })
    .join(", ")
}

/** A selector list's selectors, split at commas outside parentheses, brackets and strings, each trimmed. */
function splitSelectorList(list: string): string[] {
  const selectors: string[] = []
  let depth = 0
  let start = 0

  for (let index = 0; index < list.length; index++) {
    const char = list[index]!

    if (char === "\\") {
      index++
    } else if (char === '"' || char === "'") {
      index = findStringEnd(list, index) - 1
    } else if (char === "(" || char === "[") {
      depth++
    } else if (char === ")" || char === "]") {
      depth = Math.max(0, depth - 1)
    } else if (char === "," && depth === 0) {
      selectors.push(list.slice(start, index).trim())
      start = index + 1
    }
  }

  selectors.push(list.slice(start).trim())

  return selectors
}

/** A `font-size` declaration's value, not a custom property's whose name ends in `font-size`. */
const fontSizeDeclaration = /(^|[;\s])(font-size\s*:)([^;]*)/gi

/** A percentage, or a length in `em` or `rem`, not inside a word or another number. */
const relativeFontLength = /(^|[^\w.-])(-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?)(%|r?em)(?![\w-])/g

/**
 * Works out a relative root font size as a browser does for a page's root, from its default font size: a percentage
 * or `em`, since the root's parent would be Parity's canvas, and `rem`, which in the root's own font size means the
 * default. `larger`, `smaller` and the `font` shorthand are left as they are.
 */
function rewriteRootFontSize(text: string): string {
  return text.replace(fontSizeDeclaration, (_match, before: string, property: string, value: string) => {
    const absolute = value.replace(relativeFontLength, (_length, start: string, number: string, unit: string) =>
      unit === "%"
        ? `${start}calc(${number} / 100 * ${mediumFontSize}px)`
        : `${start}calc(${number} * ${mediumFontSize}px)`
    )

    return `${before}${property}${absolute}`
  })
}

const widthFeature =
  /^\(\s*(?:(?:min-|max-)?width\s*:\s*[^()]+|(?:[\d.]+[a-z%]*\s*[<>]=?\s*)?width(?:\s*[<>]=?\s*[\d.]+[a-z%]*)?)\s*\)$/i

/** Rewrites a media query to a viewport container query when it only tests width; anything else is left alone. */
export function rewriteMedia(prelude: string): string {
  let query = prelude.replace(/^@media\s+/i, "").trim()
  let negate = false

  if (/^not\s+all\s+and\s+/i.test(query)) {
    negate = true
    query = query.replace(/^not\s+all\s+and\s+/i, "")
  }

  query = query.replace(/^(?:only\s+)?(?:screen|all)\s+and\s+/i, "")
  const conditions = query.split(/\s+and\s+/i).map((part) => part.trim())

  if (conditions.length === 0 || !conditions.every((part) => widthFeature.test(part))) {
    return prelude
  }

  const condition = conditions.join(" and ")

  if (!negate) {
    return `@container ${viewportContainerName} ${condition}`
  }

  return `@container ${viewportContainerName} not ${conditions.length > 1 ? `(${condition})` : condition}`
}

function rewriteSelector(selector: string): string {
  return selector
    .replace(/:root(?![\w-])/g, ":host")
    .replace(/(^|[\s,>+~(])html(?![\w-])/g, "$1:host")
    .replace(/(^|[\s,>+~(])body(?![\w-])/g, `$1[${bodyAttribute}]`)
}

/** A number with a viewport unit or `rem`, not inside a word (`img-100vw`) or another number. */
const frameLength = /(^|[^\w.-])(-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?)(?:([sld]?)(vw|vh|vi|vb|vmin|vmax)|rem)(?![\w-])/g

/** Text without this has no viewport length or `rem` in it, as most of what styles are set to doesn't. */
const maybeFrameLength = /\d(?:[sld]?v|rem)/

/** Strings, urls and lengths already rewritten, whose contents aren't lengths to rewrite. */
const literal = new RegExp(
  String.raw`"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|url\([^)]*\)|var\((?:${viewportWidthProperty}|${viewportHeightProperty}|${remProperty}),[^)]*\)`,
  "g"
)

/**
 * Rewrites the lengths in declarations that a frame measures differently from Parity's page, falling back to the real
 * unit where a frame doesn't set the properties. Viewport lengths measure the frame's viewport: `100svh` becomes
 * `calc(100 * var(--canvas-vh, 1svh))`, inline and block units taken as horizontal writing, as almost every page is.
 * `rem` measures the frame's root font: `1.6rem` becomes `calc(1.6 * var(--canvas-rem, 1rem))`. Rewriting again
 * changes nothing.
 */
export function rewriteFrameUnits(text: string): string {
  if (!maybeFrameLength.test(text)) {
    return text
  }

  let output = ""
  let last = 0

  for (const match of text.matchAll(literal)) {
    output += rewriteLengths(text.slice(last, match.index)) + match[0]
    last = match.index + match[0].length
  }

  return output + rewriteLengths(text.slice(last))
}

/** Strings, comments and urls, inside which a brace or semicolon ends nothing, and what ends a selector or declaration. */
const sheetToken = /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\/\*[\s\S]*?\*\/|url\([^)]*\)|[{};]/g

/**
 * Rewrites viewport lengths and `rem` in a stylesheet's declarations, as {@link rewriteFrameUnits} does, and leaves its
 * selectors and at-rules' preludes alone, so `.h-[100vh]` still matches and `@media (width >= 40rem)` still counts a
 * browser's default font to the rem, as a media query does. For rules added while the project runs, which aren't
 * parsed as its stylesheets are.
 */
export function rewriteSheetFrameUnits(css: string): string {
  if (!maybeFrameLength.test(css)) {
    return css
  }

  let output = ""
  let start = 0

  for (const { 0: token, index } of css.matchAll(sheetToken)) {
    if (token !== "{" && token !== "}" && token !== ";") {
      continue
    }

    const text = css.slice(start, index)
    output += (token === "{" ? text : rewriteFrameUnits(text)) + token
    start = index + 1
  }

  return output + rewriteFrameUnits(css.slice(start))
}

function rewriteLengths(text: string): string {
  return text.replace(frameLength, (_match, before: string, number: string, kind?: string, unit?: string) => {
    // Without a viewport unit, the length is in rem.
    if (kind === undefined || unit === undefined) {
      return `${before}calc(${number} * var(${remProperty}, 1rem))`
    }

    const width = `var(${viewportWidthProperty}, 1${kind}vw)`
    const height = `var(${viewportHeightProperty}, 1${kind}vh)`
    let one: string

    if (unit === "vw" || unit === "vi") {
      one = width
    } else if (unit === "vh" || unit === "vb") {
      one = height
    } else {
      one = `${unit === "vmin" ? "min" : "max"}(${width}, ${height})`
    }

    return `${before}calc(${number} * ${one})`
  })
}

function rewriteUrls(text: string, baseUrl: string): string {
  return text.replace(
    /url\(\s*(["']?)(\/(?!\/)[^"')]*)\1\s*\)/g,
    (_match, quote: string, path: string) => `url(${quote}${new URL(path, baseUrl).href}${quote})`
  )
}
