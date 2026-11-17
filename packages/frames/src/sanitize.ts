import { elementSourceAttribute } from "@parity-app/core"
import type { FrozenElement, FrozenNode, PageRoot } from "./snapshot.ts"

/** What a copy may load. */
export interface SanitizePolicy {
  /** The builder's origin, which a copy may load anything from. */
  pageOrigin: string
}

/** The empty element a dropped one becomes, so the layout keeps its place. */
export const removedTag = "parity-removed"

/** HTML's elements that draw or hold content. */
const htmlElements = new Set(
  [
    "a abbr address area article aside audio b bdi bdo blockquote body br button canvas caption cite code col colgroup",
    "data datalist dd del details dfn dialog div dl dt em fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6",
    "header hgroup hr i img input ins kbd label legend li main map mark menu meter nav ol optgroup option output p",
    "picture pre progress q rp rt ruby s samp search section select selectedcontent small source span strong sub",
    "summary sup table tbody td textarea tfoot th thead time tr track u ul var video wbr"
  ]
    .join(" ")
    .split(" ")
)

/** SVG's elements that draw or hold content, without `script`, `style` and the animations, which can set an `href`. */
const svgElements = new Set(
  [
    "svg a circle clipPath defs desc ellipse feBlend feColorMatrix feComponentTransfer feComposite feConvolveMatrix",
    "feDiffuseLighting feDisplacementMap feDistantLight feDropShadow feFlood feFuncA feFuncB feFuncG feFuncR",
    "feGaussianBlur feImage feMerge feMergeNode feMorphology feOffset fePointLight feSpecularLighting feSpotLight",
    "feTile feTurbulence filter foreignObject g image line linearGradient marker mask metadata path pattern polygon",
    "polyline radialGradient rect stop switch symbol text textPath title tspan use view"
  ]
    .join(" ")
    .split(" ")
)

/** MathML's elements that draw or hold content. */
const mathElements = new Set(
  [
    "math annotation maction merror mfrac mi mmultiscripts mn mo mover mpadded mphantom mprescripts mroot mrow ms",
    "mspace msqrt mstyle msub msubsup msup mtable mtd mtext mtr munder munderover none semantics"
  ]
    .join(" ")
    .split(" ")
)

/** Names that look like a custom element's but are reserved, so a document can't define them. */
const reservedCustomNames = new Set([
  "annotation-xml",
  "color-profile",
  "font-face",
  "font-face-src",
  "font-face-uri",
  "font-face-format",
  "font-face-name",
  "missing-glyph"
])

/** A valid custom element name, kept in lower case so the page's CSS still matches it. */
const customElementName = /^[a-z][a-z0-9._\u00b7\u00c0-\uffff]*-[a-z0-9._\u00b7\u00c0-\uffff-]*$/

/** Attributes any HTML element may keep. */
const htmlGlobal = new Set(
  [
    "class dir draggable enterkeyhint exportparts hidden id inert inputmode lang part role slot spellcheck style",
    "tabindex title translate"
  ]
    .join(" ")
    .split(" ")
)

/** Attributes only some HTML elements keep, each with the elements that keep it. */
const htmlByElement = new Map<string, readonly string[]>([
  ["abbr", ["th"]],
  [
    "align",
    [
      "caption",
      "col",
      "colgroup",
      "div",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "hr",
      "img",
      "p",
      "table",
      "tbody",
      "td",
      "tfoot",
      "th",
      "thead",
      "tr"
    ]
  ],
  ["alt", ["area", "img", "input"]],
  ["checked", ["input"]],
  ["cite", ["blockquote", "del", "ins", "q"]],
  ["cols", ["textarea"]],
  ["colspan", ["td", "th"]],
  ["controls", ["audio", "video"]],
  ["coords", ["area"]],
  ["datetime", ["del", "ins", "time"]],
  ["decoding", ["img"]],
  ["default", ["track"]],
  ["disabled", ["button", "fieldset", "input", "optgroup", "option", "select", "textarea"]],
  ["headers", ["td", "th"]],
  ["height", ["canvas", "img", "input", "source", "video"]],
  ["high", ["meter"]],
  ["href", ["a", "area"]],
  ["hreflang", ["a", "area"]],
  ["kind", ["track"]],
  ["label", ["optgroup", "option", "track"]],
  ["list", ["input"]],
  ["loading", ["img"]],
  ["loop", ["audio", "video"]],
  ["low", ["meter"]],
  ["max", ["input", "meter", "progress"]],
  ["maxlength", ["input", "textarea"]],
  ["media", ["source"]],
  ["min", ["input", "meter"]],
  ["minlength", ["input", "textarea"]],
  ["multiple", ["input", "select"]],
  ["muted", ["audio", "video"]],
  ["name", ["button", "fieldset", "input", "map", "output", "select", "textarea", "details"]],
  ["open", ["details", "dialog"]],
  ["optimum", ["meter"]],
  ["placeholder", ["input", "textarea"]],
  ["playsinline", ["video"]],
  ["poster", ["video"]],
  ["readonly", ["input", "textarea"]],
  ["rel", ["a", "area"]],
  ["required", ["input", "select", "textarea"]],
  ["reversed", ["ol"]],
  ["rows", ["textarea"]],
  ["rowspan", ["td", "th"]],
  ["scope", ["th"]],
  ["selected", ["option"]],
  ["shape", ["area"]],
  ["size", ["input", "select"]],
  ["sizes", ["img", "source"]],
  ["span", ["col", "colgroup"]],
  ["src", ["audio", "img", "input", "source", "track", "video"]],
  ["srclang", ["track"]],
  ["srcset", ["img", "source"]],
  ["start", ["ol"]],
  ["step", ["input"]],
  ["type", ["a", "button", "input", "ol", "source"]],
  ["usemap", ["img"]],
  ["value", ["button", "data", "input", "li", "meter", "option", "output", "progress", "textarea"]],
  ["width", ["canvas", "col", "img", "input", "source", "table", "td", "th", "video"]],
  ["wrap", ["textarea"]]
])

/** SVG's attributes that draw: geometry, presentation, gradients, filters, text and references. */
const svgAttributes = new Set(
  [
    "alignment-baseline amplitude azimuth baseFrequency baseline-shift bias class clip clip-path clip-rule clipPathUnits",
    "color color-interpolation color-interpolation-filters cx cy d diffuseConstant direction display divisor",
    "dominant-baseline dx dy edgeMode elevation exponent fill fill-opacity fill-rule filter filterUnits flood-color",
    "flood-opacity font-family font-size font-size-adjust font-stretch font-style font-variant font-weight fr fx fy",
    "gradientTransform gradientUnits height href id image-rendering in in2 intercept k k1 k2 k3 k4 kernelMatrix",
    "kernelUnitLength lang lengthAdjust letter-spacing lighting-color limitingConeAngle marker-end marker-mid",
    "marker-start markerHeight markerUnits markerWidth mask mask-type maskContentUnits maskUnits method mode",
    "numOctaves offset opacity operator order orient overflow paint-order pathLength patternContentUnits",
    "patternTransform patternUnits points pointsAtX pointsAtY pointsAtZ preserveAlpha preserveAspectRatio",
    "primitiveUnits r radius refX refY result role rotate rx ry scale seed shape-rendering side slope spacing",
    "specularConstant specularExponent spreadMethod startOffset stdDeviation stitchTiles stop-color stop-opacity",
    "stroke stroke-dasharray stroke-dashoffset stroke-linecap stroke-linejoin stroke-miterlimit stroke-opacity",
    "stroke-width style surfaceScale systemLanguage tabindex tableValues targetX targetY text-anchor text-decoration",
    "text-rendering textLength transform transform-origin type unicode-bidi values vector-effect version viewBox",
    "visibility width word-spacing writing-mode x x1 x2 xChannelSelector xlink:href xml:lang xml:space y y1 y2",
    "yChannelSelector z"
  ]
    .join(" ")
    .split(" ")
)

/** MathML's attributes that lay out or draw. */
const mathAttributes = new Set(
  [
    "accent accentunder class columnalign columnlines columnspacing columnspan depth dir display displaystyle fence",
    "frame framespacing height id largeop linethickness lspace mathbackground mathcolor mathsize mathvariant maxsize",
    "minsize movablelimits rowalign rowlines rowspacing rowspan rspace scriptlevel separator stretchy style symmetric",
    "voffset width"
  ]
    .join(" ")
    .split(" ")
)

/** `data-*` and `aria-*`, with a name `setAttribute` takes. */
const dataOrAria = /^(?:data|aria)-[a-z0-9._-]+$/

/** What a URL attribute or `url()` points at, which decides where it may come from. */
type UrlUse = "image" | "media" | "link"

/** Elements whose `src`, `srcset` or `href` load an image or media, which may come from any `https:` host. */
const mediaSources = new Map<string, UrlUse>([
  ["audio", "media"],
  ["feImage", "image"],
  ["image", "image"],
  ["img", "image"],
  ["input", "image"],
  ["source", "media"],
  ["track", "link"],
  ["video", "media"]
])

/** `data:` URLs of an image or a font. */
const dataImageOrFont = /^data:(?:image\/[a-z0-9.+-]+|font\/[a-z0-9.+-]+|application\/(?:x-)?font-[a-z0-9.+-]+)[;,]/i

/** A sanitized body, and how many elements and attributes were taken out of it. */
export interface SanitizedPage {
  body: FrozenElement
  removed: number
}

/** A sanitized `<html>`, and how many attributes were taken out of it. */
export interface SanitizedRoot {
  root: PageRoot
  removed: number
}

/** The tree with only allowed elements, attributes and URLs left. */
export function sanitizePage(body: FrozenElement, policy: SanitizePolicy): SanitizedPage {
  const count = { removed: 0 }

  return { body: { ...sanitizeElement(body, policy, count), tag: "body" }, removed: count.removed }
}

/**
 * `<html>`'s classes, attributes and inline style with only what a copy's host may carry: the attributes `<html>` may
 * keep, with their URLs checked, since they go on an element in Parity's document.
 */
export function sanitizeRoot(root: PageRoot, policy: SanitizePolicy): SanitizedRoot {
  const count = { removed: 0 }
  const attributes = sanitizeAttributes("html", undefined, root.attributes, policy, count)

  return {
    root: {
      classes: root.classes.filter((name) => name.length > 0),
      attributes,
      style: sanitizeCss(root.style, policy)
    },
    removed: count.removed
  }
}

/** A sheet's text with every `url()` outside the policy taken out; `@import` is refused, as the page inlined them. */
export function sanitizeSheet(text: string, policy: SanitizePolicy): string {
  const css = rewriteImports(readLoadNames(withoutComments(cssNewlines(text))), () => "")

  // Taking a rule out can join the text around it into another (`@im@import "";port …`). Any such one is renamed, in one
  // pass, to an at-rule CSS doesn't know and skips; a name that starts "@-" can't join into another.
  return sanitizeCss(
    rewriteImports(css, (rule) => `@-parity-removed-import${rule.slice("@import".length)}`),
    policy
  )
}

/**
 * CSS with each `@import` rule outside a string, from its name to its `;`, its block's end or the text's end, as
 * `rewrite` gives it back. Strings are skipped whole, so text that only says `@import` stays as it is.
 */
function rewriteImports(css: string, rewrite: (rule: string) => string): string {
  const name = /@import(?![\w-])/iy
  let out = ""
  let from = 0

  for (let at = 0; at < css.length; at += 1) {
    const char = css.charAt(at)

    if (char === "\\") {
      at += 1
    } else if (char === '"' || char === "'") {
      at = stringEnd(css, at)
    } else if (char === "@") {
      name.lastIndex = at
      const end = name.test(css) ? ruleEnd(css, at) : undefined

      if (end !== undefined) {
        out += `${css.slice(from, at)}${rewrite(css.slice(at, end))}`
        from = end
        at = end - 1
      }
    }
  }

  return out + css.slice(from)
}

/** Where an at-rule that starts at `start` ends: after its `;`, after its block's `}`, or at the text's end. */
function ruleEnd(css: string, start: number): number {
  for (let at = start; at < css.length; at += 1) {
    const char = css.charAt(at)

    if (char === "\\") {
      at += 1
    } else if (char === '"' || char === "'") {
      at = stringEnd(css, at)
    } else if (char === ";") {
      return at + 1
    } else if (char === "{") {
      return Math.min(closingBrace(css, at + 1) + 1, css.length)
    }
  }

  return css.length
}

/** Where the brace opened just before `start` closes, skipping strings and escapes, or the text's end. */
function closingBrace(css: string, start: number): number {
  let depth = 1

  for (let at = start; at < css.length; at += 1) {
    const char = css.charAt(at)

    if (char === "\\") {
      at += 1
    } else if (char === '"' || char === "'") {
      at = stringEnd(css, at)
    } else if (char === "{") {
      depth += 1
    } else if (char === "}") {
      depth -= 1

      if (depth === 0) {
        return at
      }
    }
  }

  return css.length
}

function sanitizeNode(node: FrozenNode, policy: SanitizePolicy, count: { removed: number }): FrozenNode {
  if (!(node instanceof Object)) {
    return node
  }

  return allowedElement(node) ? sanitizeElement(node, policy, count) : removed(count)
}

function sanitizeElement(element: FrozenElement, policy: SanitizePolicy, count: { removed: number }): FrozenElement {
  const clean: FrozenElement = {
    tag: element.tag,
    attributes: sanitizeAttributes(element.tag, element.namespace, element.attributes, policy, count),
    children: element.children.map((child) => sanitizeNode(child, policy, count))
  }

  if (element.namespace) {
    clean.namespace = element.namespace
  }

  return clean
}

function removed(count: { removed: number }): FrozenElement {
  count.removed += 1

  return { tag: removedTag, attributes: [], children: [] }
}

/** Whether an element is on its namespace's allowlist, or a custom element in HTML's. */
function allowedElement({ tag, namespace }: FrozenElement): boolean {
  if (namespace === "svg") {
    return svgElements.has(tag)
  }

  if (namespace === "math") {
    return mathElements.has(tag)
  }

  return htmlElements.has(tag) || (customElementName.test(tag) && !reservedCustomNames.has(tag) && tag !== removedTag)
}

function sanitizeAttributes(
  tag: string,
  namespace: FrozenElement["namespace"],
  attributes: readonly [string, string][],
  policy: SanitizePolicy,
  count: { removed: number }
): [string, string][] {
  const kept: [string, string][] = []

  for (const [name, value] of attributes) {
    const clean = allowedAttribute(tag, namespace, name)
      ? sanitizeValue(tag, namespace, name, value, policy)
      : undefined

    if (clean === undefined) {
      count.removed += 1
    } else {
      kept.push([name, clean])
    }
  }

  return kept
}

function allowedAttribute(tag: string, namespace: FrozenElement["namespace"], name: string): boolean {
  if (name === elementSourceAttribute || dataOrAria.test(name)) {
    return true
  }

  if (namespace === "svg") {
    return svgAttributes.has(name)
  }

  if (namespace === "math") {
    return mathAttributes.has(name)
  }

  return htmlGlobal.has(name) || (htmlByElement.get(name)?.includes(tag) ?? false)
}

/** An allowed attribute's value with its URLs checked, or undefined when it can't be kept. */
function sanitizeValue(
  tag: string,
  namespace: FrozenElement["namespace"],
  name: string,
  value: string,
  policy: SanitizePolicy
): string | undefined {
  const use = mediaSources.get(tag) ?? "link"

  switch (name) {
    case "style":
      return sanitizeCss(value, policy)
    case "srcset":
      return sanitizeSrcset(value, use, policy)
    case "poster":
      return allowedUrl(value, "image", policy) ? value : undefined
    case "href":
    case "src":
    case "xlink:href":
      return allowedUrl(value, use, policy) ? value : undefined
    default:
      // SVG's presentation attributes take CSS values, so `fill`, `filter`, `mask` and the rest can load a `url()`.
      return namespace === "svg" ? sanitizeCss(value, policy) : value
  }
}

/**
 * Whether a copy may load a URL: anything on `pageOrigin`, an image, font or media file on any `https:` host, a `data:`
 * URL of an image or a font, and a reference to an element in the same copy (`#gradient`).
 */
function allowedUrl(value: string, use: UrlUse, policy: SanitizePolicy): boolean {
  const trimmed = value.trim()

  if (/^#[^\s]*$/.test(trimmed)) {
    return true
  }

  let url: URL

  try {
    url = new URL(trimmed)
  } catch {
    return false
  }

  if (url.origin === policy.pageOrigin && (url.protocol === "http:" || url.protocol === "https:")) {
    return true
  }

  if (use === "link") {
    return false
  }

  return url.protocol === "https:" || (url.protocol === "data:" && dataImageOrFont.test(trimmed))
}

/** A `srcset` with only the candidates whose URLs are allowed, or undefined when none are. */
function sanitizeSrcset(value: string, use: UrlUse, policy: SanitizePolicy): string | undefined {
  const kept = srcsetCandidates(value).filter(({ url }) => allowedUrl(url, use === "link" ? "image" : use, policy))

  return kept.length > 0
    ? kept.map(({ url, descriptor }) => [url, descriptor].filter(Boolean).join(" ")).join(", ")
    : undefined
}

/** A `srcset`'s candidates, read as HTML does: a URL up to whitespace, which may hold commas, then its descriptor. */
function srcsetCandidates(value: string): { url: string; descriptor: string }[] {
  const candidates: { url: string; descriptor: string }[] = []
  let at = 0

  while (at < value.length) {
    while (at < value.length && /[\s,]/.test(value.charAt(at))) {
      at += 1
    }

    const start = at

    while (at < value.length && !/\s/.test(value.charAt(at))) {
      at += 1
    }

    let url = value.slice(start, at)
    let descriptor = ""

    if (url.endsWith(",")) {
      url = url.replace(/,+$/, "")
    } else {
      const end = value.indexOf(",", at)
      descriptor = value.slice(at, end === -1 ? value.length : end).trim()
      at = end === -1 ? value.length : end + 1
    }

    if (url) {
      candidates.push({ url, descriptor })
    }
  }

  return candidates
}

/**
 * A CSS escape, matched one way only: a hex escape takes all its digits, up to six, and its one optional space, and any
 * other escape is a backslash before a character that isn't a hex digit or a newline. Overlapping alternatives would
 * let a failing match retry every way of splitting a run of escapes.
 */
const cssEscape = String.raw`\\(?:(?:[0-9a-f]{6}|[0-9a-f]{1,5}(?![0-9a-f]))\s?|[^\n0-9a-f])`

/**
 * CSS with each `url()`, `image-set()` and `src()` load outside the policy replaced by `none`. A stylesheet or inline
 * style loads images and fonts, so any `https:` host is allowed.
 */
function sanitizeCss(css: string, policy: SanitizePolicy): string {
  // Comments go first: a quote inside one is no string's, and the passes after skip strings.
  return sanitizeLoads(readLoadNames(withoutComments(cssNewlines(css))), policy)
}

/** CSS with CR LF, CR and form feed as LF, as CSS reads its text before anything else, so an escape before one holds. */
function cssNewlines(css: string): string {
  return css.replace(/\r\n?|\f/g, "\n")
}

/** The CSS functions that load what they're given. */
const loadOpening = /url\(|(?:-webkit-)?image-set\(|src\(/iy

/** A character that would make a function's name part of a longer identifier. */
const identifierPart = /[\w-]/

/**
 * CSS with every load the policy doesn't allow replaced, read forward once as CSS reads it: a string is skipped whole,
 * so a function's name inside one is only text, and each `url()`, `image-set()` and `src()` is read to where CSS ends
 * it, so nothing in one can hide the next.
 */
function sanitizeLoads(css: string, policy: SanitizePolicy): string {
  let out = ""
  let from = 0

  for (let at = 0; at < css.length; at += 1) {
    const char = css.charAt(at)

    if (char === "\\") {
      at += 1
      continue
    }

    if (char === '"' || char === "'") {
      at = stringEnd(css, at)
      continue
    }

    loadOpening.lastIndex = at
    const opening = identifierPart.test(css.charAt(at - 1)) ? null : loadOpening.exec(css)

    if (!opening) {
      continue
    }

    const start = at + opening[0].length

    const load = /^url\($/i.test(opening[0])
      ? sanitizeUrl(css, at, start, policy)
      : sanitizeImageSource(css, at, start, policy)

    out += `${css.slice(from, at)}${load.text}`
    from = load.end
    at = load.end - 1
  }

  return out + css.slice(from)
}

/** A load's text as it stays, and where in the CSS it ended. */
interface CheckedLoad {
  text: string
  end: number
}

/** `url()` with a string or without one, as CSS reads each: `none` when it loads what the policy doesn't allow. */
function sanitizeUrl(css: string, open: number, start: number, policy: SanitizePolicy): CheckedLoad {
  let at = start

  while (at < css.length && /\s/.test(css.charAt(at))) {
    at += 1
  }

  const quote = css.charAt(at)

  if (quote === '"' || quote === "'") {
    // Before a string, `url(` is a function, which ends at its balanced closing parenthesis.
    const end = Math.min(closingParenthesis(css, start) + 1, css.length)
    const close = stringEnd(css, at)
    const value = css.slice(at + 1, close > at && css.charAt(close) === quote ? close : close + 1)

    return { text: allowedUrl(cssString(value), "image", policy) ? css.slice(open, end) : "none", end }
  }

  // Without one, the URL runs to the first `)`, and a quote, `(` or space in it makes a bad URL, which loads nothing.
  let close = at

  while (close < css.length && css.charAt(close) !== ")") {
    close += css.charAt(close) === "\\" ? 2 : 1
  }

  close = Math.min(close, css.length)
  const end = Math.min(close + 1, css.length)
  const value = css.slice(at, close).trimEnd()
  const bad = /["'(\s]/.test(value.replace(new RegExp(cssEscape, "gi"), ""))

  return { text: !bad && allowedUrl(cssString(value), "image", policy) ? css.slice(open, end) : "none", end }
}

/** CSS with each comment outside a string replaced by a space, as CSS reads one, so no pattern after can miss a load. */
function withoutComments(css: string): string {
  let out = ""
  let from = 0

  for (let at = 0; at < css.length; at += 1) {
    const char = css.charAt(at)

    if (char === "\\") {
      at += 1
    } else if (char === '"' || char === "'") {
      at = stringEnd(css, at)
    } else if (char === "/" && css.charAt(at + 1) === "*") {
      const close = css.indexOf("*/", at + 2)
      const end = close === -1 ? css.length : close + 2
      out += `${css.slice(from, at)} `
      from = end
      at = end - 1
    }
  }

  return out + css.slice(from)
}

/** An image that loads nothing: none, or a gradient. */
const inertImage = /^\s*(?:none\b|(?:-webkit-)?(?:repeating-)?(?:linear|radial|conic)-gradient\()/i

/**
 * `image-set()` or `src()`, read to its balanced closing parenthesis, with each candidate the policy doesn't allow
 * given `none`. A candidate's image is its leading string, checked as a URL; a string later in it, as in
 * `type("image/png")`, is a descriptor. A `url()` is checked as anywhere else, a gradient stays, and any other image,
 * such as `var()` or `attr()`, which would only say what it loads once it's drawn, goes.
 */
function sanitizeImageSource(css: string, open: number, start: number, policy: SanitizePolicy): CheckedLoad {
  const close = closingParenthesis(css, start)
  const inner = css.slice(start, close)
  const parts = /^src\($/i.test(css.slice(open, start)) ? [inner] : topLevelParts(inner)

  const candidates = parts.map((candidate) => {
    const leading = /^(\s*)(?:"((?:[^"\\]|\\[\s\S])*)"|'((?:[^'\\]|\\[\s\S])*)')/.exec(candidate)

    if (leading) {
      return allowedUrl(cssString(leading[2] ?? leading[3] ?? ""), "image", policy)
        ? candidate
        : `${leading[1]}none${candidate.slice(leading[0].length)}`
    }

    if (/^\s*url\(/i.test(candidate)) {
      return sanitizeLoads(candidate, policy)
    }

    return inertImage.test(candidate) ? candidate : "none"
  })

  return {
    text: `${css.slice(open, start)}${candidates.join(",")}${close < css.length ? ")" : ""}`,
    end: Math.min(close + 1, css.length)
  }
}

/** Where the parenthesis opened just before `start` closes, skipping strings and escapes, or the text's end. */
function closingParenthesis(css: string, start: number): number {
  let depth = 1

  for (let at = start; at < css.length; at += 1) {
    const char = css.charAt(at)

    if (char === "\\") {
      at += 1
    } else if (char === '"' || char === "'") {
      at = stringEnd(css, at)
    } else if (char === "(") {
      depth += 1
    } else if (char === ")") {
      depth -= 1

      if (depth === 0) {
        return at
      }
    }
  }

  return css.length
}

/**
 * The index of the quote that closes the string opened at `start`, or of its last character when a newline or the
 * text's end cuts it short, as CSS ends a string; what follows a newline is read as CSS again.
 */
function stringEnd(css: string, start: number): number {
  const quote = css.charAt(start)

  for (let at = start + 1; at < css.length; at += 1) {
    const char = css.charAt(at)

    if (char === "\\") {
      at += 1
    } else if (char === quote) {
      return at
    } else if (char === "\n" || char === "\r" || char === "\f") {
      return at - 1
    }
  }

  return css.length - 1
}

/** A function's arguments split at its top-level commas, outside nested functions and strings. */
function topLevelParts(inner: string): string[] {
  const parts: string[] = []
  let depth = 0
  let from = 0

  for (let at = 0; at < inner.length; at += 1) {
    const char = inner.charAt(at)

    if (char === "\\") {
      at += 1
    } else if (char === '"' || char === "'") {
      at = stringEnd(inner, at)
    } else if (char === "(") {
      depth += 1
    } else if (char === ")") {
      depth -= 1
    } else if (char === "," && depth === 0) {
      parts.push(inner.slice(from, at))
      from = at + 1
    }
  }

  return [...parts, inner.slice(from)]
}

/** A CSS identifier, escapes and all, as a function's or an at-rule's name can be written. */
const cssIdentifier = String.raw`(?:[\w-]|${cssEscape})+`

/** Each name, whole: a match takes its identifier to the end, so the scan goes forward once and never retries. */
const cssName = new RegExp(String.raw`(@?)(${cssIdentifier})`, "gi")

/** What follows a function's name or an at-rule's. */
const afterName = /[\s("';{]/

/** The function names that load something, which an escape could hide from the patterns that check them. */
const loadFunctions = new Set(["url", "image-set", "-webkit-image-set", "src"])

/**
 * CSS with the names of `url()`, `image-set()` and `@import` written plainly where escapes spelled them (`u\72l(`,
 * `@\69mport`), as a browser reads them, so the checks after see every load. Every other name keeps its escapes.
 */
function readLoadNames(css: string): string {
  const strings = stringRanges(css)
  let next = 0

  return css.replace(cssName, (whole, at: string, name: string, offset: number) => {
    while (next < strings.length && (strings[next]?.[1] ?? 0) < offset) {
      next += 1
    }

    const inString = (strings[next]?.[0] ?? Infinity) <= offset

    if (inString || !name.includes("\\") || !afterName.test(css.charAt(offset + whole.length))) {
      return whole
    }

    const read = cssString(name).toLowerCase()
    const loads = at === "@" ? read === "import" : loadFunctions.has(read)

    return loads ? `${at}${read}` : whole
  })
}

/** Where each string in some CSS starts and ends, its quotes included, in order. */
function stringRanges(css: string): [start: number, end: number][] {
  const ranges: [number, number][] = []

  for (let at = 0; at < css.length; at += 1) {
    const char = css.charAt(at)

    if (char === "\\") {
      at += 1
    } else if (char === '"' || char === "'") {
      const end = stringEnd(css, at)
      ranges.push([at, end])
      at = end
    }
  }

  return ranges
}

/** A CSS string's text with its escapes read, so `\6a avascript:` is checked as what it says. */
function cssString(text: string): string {
  return text.replace(/\\([0-9a-f]{1,6}\s?|[\s\S])/gi, (_whole, escaped: string) => {
    // A backslash before a newline continues the string onto the next line, and stands for nothing.
    if (/^[\n\r\f]$/.test(escaped)) {
      return ""
    }

    const hex = escaped.trim()

    if (!/^[0-9a-f]+$/i.test(hex)) {
      return escaped
    }

    const code = Number.parseInt(hex, 16)

    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "\ufffd"
  })
}
