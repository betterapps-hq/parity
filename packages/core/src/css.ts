/** Container name for a rendered mode's body; viewport media queries are rewritten to query it. */
export const viewportContainerName = "canvas-viewport"

/** Attribute on the element that stands in for `<body>` inside each rendered mode. */
export const bodyAttribute = "data-canvas-body"

export interface CanvasCss {
  /** Adopted by every rendered mode's shadow root. */
  scoped: string
  /** Rules that only work at document level (`@property`, `@font-face`). */
  global: string
}

export interface PrepareCssOptions {
  /** Origin that serves the project's assets; root-relative `url()`s are made absolute against it. */
  baseUrl: string
}

/**
 * Prepares a project's compiled CSS for rendering inside per-mode shadow roots without iframes:
 *
 * - viewport media queries become container queries, so each mode responds to its own width, not the window's
 * - `:root` and `html` become `:host`, and `body` becomes the mode's body element
 * - `@property` and `@font-face` move to the document, because shadow roots ignore them
 * - root-relative `url()`s point at the project's server instead of the canvas UI
 */
export function prepareCanvasCss(css: string, options: PrepareCssOptions): CanvasCss {
  const globals: string[] = []
  const scoped = serialize(parse(css), options, globals)
  return { scoped, global: globals.join("\n") }
}

export interface CustomPropertyDeclaration {
  /** Selector of the style rule that declares it, with at-rule wrappers (`@layer`, `@media`) ignored. */
  selector: string
  /** Property name without `--`. */
  name: string
  value: string
}

/** Every custom property declaration in a stylesheet, in source order. */
export function collectCustomProperties(css: string): CustomPropertyDeclaration[] {
  const declarations: CustomPropertyDeclaration[] = []
  const visit = (nodes: CssNode[], selector: string | undefined) => {
    for (const node of nodes) {
      if (node.kind === "block") {
        const prelude = node.prelude.trim()
        visit(node.children, prelude.startsWith("@") ? selector : prelude)
      } else if (selector) {
        for (const match of node.text.matchAll(/--([\w-]+)\s*:\s*([^;]+)/g)) {
          declarations.push({ selector, name: match[1]!, value: match[2]!.trim() })
        }
      }
    }
  }
  visit(parse(css), undefined)
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
      if (char === "(") parens++
      if (char === ")") parens = Math.max(0, parens - 1)
      if (parens > 0) {
        buffer += char
        continue
      }
      if (char === ";") {
        buffer += char
        afterLastSemicolon = buffer.length
      } else if (char === "{") {
        const text = buffer.slice(0, afterLastSemicolon)
        if (text) nodes.push({ kind: "text", text })
        nodes.push({ kind: "block", prelude: buffer.slice(afterLastSemicolon), children: parseLevel() })
        buffer = ""
        afterLastSemicolon = 0
      } else if (char === "}") {
        if (buffer) nodes.push({ kind: "text", text: buffer })
        return nodes
      } else {
        buffer += char
      }
    }
    if (buffer) nodes.push({ kind: "text", text: buffer })
    return nodes
  }

  const nodes: CssNode[] = []
  while (index < css.length) nodes.push(...parseLevel())
  return nodes
}

function findStringEnd(css: string, start: number): number {
  const quote = css[start]
  let index = start + 1
  while (index < css.length) {
    if (css[index] === "\\") index += 2
    else if (css[index] === quote) return index + 1
    else index++
  }
  return css.length
}

function serialize(nodes: CssNode[], options: PrepareCssOptions, globals: string[]): string {
  let output = ""
  for (const node of nodes) {
    if (node.kind === "text") {
      output += rewriteUrls(node.text, options.baseUrl)
      continue
    }
    const prelude = node.prelude.trim()
    const body = serialize(node.children, options, globals)
    if (/^@(property|font-face)\b/i.test(prelude)) {
      globals.push(`${prelude} {${body}}`)
      continue
    }
    const leading = node.prelude.slice(0, node.prelude.length - node.prelude.trimStart().length)
    output += `${leading}${rewritePrelude(prelude)} {${body}}`
  }
  return output
}

function rewritePrelude(prelude: string): string {
  if (/^@media\b/i.test(prelude)) return rewriteMedia(prelude)
  if (prelude.startsWith("@")) return prelude
  return rewriteSelector(prelude)
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
  if (conditions.length === 0 || !conditions.every((part) => widthFeature.test(part))) return prelude
  const condition = conditions.join(" and ")
  if (!negate) return `@container ${viewportContainerName} ${condition}`
  return `@container ${viewportContainerName} not ${conditions.length > 1 ? `(${condition})` : condition}`
}

function rewriteSelector(selector: string): string {
  return selector
    .replace(/:root(?![\w-])/g, ":host")
    .replace(/(^|[\s,>+~(])html(?![\w-])/g, "$1:host")
    .replace(/(^|[\s,>+~(])body(?![\w-])/g, `$1[${bodyAttribute}]`)
}

function rewriteUrls(text: string, baseUrl: string): string {
  return text.replace(
    /url\(\s*(["']?)(\/(?!\/)[^"')]*)\1\s*\)/g,
    (_match, quote: string, path: string) => `url(${quote}${new URL(path, baseUrl).href}${quote})`
  )
}
