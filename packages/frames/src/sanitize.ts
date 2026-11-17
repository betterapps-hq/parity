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
const customElementName = /^[a-z][a-z0-9._·À-￿]*-[a-z0-9._·À-￿-]*$/

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
  return sanitizeCss(text.replace(/@import\b(?:[^;"']|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')*;?/gi, ""), policy)
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
    const clean = allowedAttribute(tag, namespace, name) ? sanitizeValue(tag, name, value, policy) : undefined

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
function sanitizeValue(tag: string, name: string, value: string, policy: SanitizePolicy): string | undefined {
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
      return value
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
 * CSS with each `url()` and `image-set()` string outside the policy replaced by `none`. A stylesheet or inline style
 * loads images and fonts, so any `https:` host is allowed.
 */
function sanitizeCss(css: string, policy: SanitizePolicy): string {
  const urls = css.replace(
    /\burl\(\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|([^)"'\s]*))\s*\)/gi,
    (whole, double?: string, single?: string, bare?: string) =>
      allowedUrl(cssString(double ?? single ?? bare ?? ""), "image", policy) ? whole : "none"
  )

  return urls.replace(/(image-set\()([^)]*)\)/gi, (_whole, open: string, inner: string) => {
    const strings = inner.replace(
      /"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'/g,
      (quoted, double?: string, single?: string) =>
        allowedUrl(cssString(double ?? single ?? ""), "image", policy) ? quoted : "none"
    )

    return `${open}${strings})`
  })
}

/** A CSS string's text with its escapes read, so `\6a avascript:` is checked as what it says. */
function cssString(text: string): string {
  return text.replace(/\\([0-9a-f]{1,6}\s?|[\s\S])/gi, (_whole, escaped: string) => {
    const hex = escaped.trim()

    if (!/^[0-9a-f]+$/i.test(hex)) {
      return escaped
    }

    const code = Number.parseInt(hex, 16)

    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "�"
  })
}
