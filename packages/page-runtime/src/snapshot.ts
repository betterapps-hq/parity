import type {
  FrozenElement,
  FrozenNode,
  PageMode,
  PageRoot,
  PageSheet,
  PageSnapshot,
  SheetEntry
} from "@parity-app/frames"

/*
 * Taking a snapshot of the page (docs/proposals/route-frames.md, "The snapshot"): the body's tree as plain data with
 * every URL made absolute, `<html>`'s classes and attributes without the mode's, and the stylesheets by content hash,
 * kept here until Parity asks for the ones it hasn't got (`sheets.get`). A sheet on another origin, whose rules the
 * page can't read, is listed by its address for Parity's main process to fetch.
 */

/** Elements left out of a snapshot: they draw nothing, and the sheets are collected apart. */
const skipped = new Set(["script", "style", "link", "meta", "template", "noscript", "base"])

/** Attributes that hold one URL, made absolute against the page's address. */
const urlAttributes = new Set(["href", "src", "poster", "xlink:href", "action", "formaction", "data", "cite"])

const svgNamespace = "http://www.w3.org/2000/svg"
const mathNamespace = "http://www.w3.org/1998/Math/MathML"

/** How long lazy images, switched to eager, get to decode before the snapshot is taken, in milliseconds. */
export const lazyImageWait = 500

/** What `takeSnapshot` needs beside the page: the mode on `<html>`, its window, and where the page is. */
export interface SnapshotContext {
  mode: PageMode
  viewport: { width: number; height: number }
  location: PageSnapshot["location"]
  /** The sheets read so far, by hash, which `sheets.get` answers from. */
  sheets: Map<string, string>
}

/**
 * The page as a snapshot, in the mode it's drawn in. Lazy images are switched to eager first and given up to
 * `lazyImageWait` to decode, so a full-height copy isn't blank below the first window.
 */
export async function takeSnapshot(page: Window, context: SnapshotContext): Promise<PageSnapshot> {
  const document = page.document
  await eagerImages(page)

  const body = document.body ? frozenElement(document.body, document.baseURI) : emptyBody()
  const root = document.documentElement

  return {
    location: context.location,
    viewport: context.viewport,
    pageHeight: Math.ceil(Math.max(root.scrollHeight, document.body?.scrollHeight ?? 0)),
    root: rootOf(root, context.mode),
    body,
    sheets: pageSheets(document, context.sheets),
    markup: hashText(JSON.stringify(body))
  }
}

/** The sheets with these ids, from the ones read for a snapshot; an id never read is left out. */
export function sheetsById(sheets: ReadonlyMap<string, string>, ids: readonly string[]): PageSheet[] {
  return ids.flatMap((id) => {
    const text = sheets.get(id)

    return text === undefined ? [] : [{ id, text }]
  })
}

function emptyBody(): FrozenElement {
  return { tag: "body", attributes: [], children: [] }
}

/** Switches lazy images to eager and waits for them to decode, at most `lazyImageWait`. */
async function eagerImages(page: Window): Promise<void> {
  const lazy = [...page.document.querySelectorAll<HTMLImageElement>('img[loading="lazy"]')]

  if (lazy.length === 0) {
    return
  }

  for (const image of lazy) {
    image.loading = "eager"
  }

  await Promise.race([
    Promise.allSettled(lazy.map((image) => image.decode())),
    new Promise((resolve) => page.setTimeout(resolve, lazyImageWait))
  ])
}

/** `<html>`'s classes, attributes and inline style, less the mode's and what the runtime set itself. */
function rootOf(root: Element, mode: PageMode): PageRoot {
  const classes = [...root.classList].filter((name) => !mode.classes.includes(name))

  const attributes = [...root.attributes].flatMap((attribute): [string, string][] =>
    attribute.name === "class" || attribute.name === "style" || attribute.name in mode.attributes
      ? []
      : [[attribute.name, attribute.value]]
  )

  const style = root instanceof HTMLElement ? ownStyle(root.style) : ""

  return { classes, attributes, style }
}

/** An inline style without the scrollbar and color scheme the runtime and its mode put there. */
function ownStyle(style: CSSStyleDeclaration): string {
  const kept: string[] = []

  for (let index = 0; index < style.length; index++) {
    const name = style.item(index)

    if (name === "scrollbar-width" || name === "color-scheme") {
      continue
    }

    const priority = style.getPropertyPriority(name)
    kept.push(`${name}: ${style.getPropertyValue(name)}${priority ? ` !${priority}` : ""}`)
  }

  return kept.join("; ")
}

/** An element and what's in it, with its form state as attributes and its URLs made absolute against `base`. */
function frozenElement(element: Element, base: string): FrozenElement {
  const frozen: FrozenElement = {
    tag:
      element.namespaceURI === svgNamespace || element.namespaceURI === mathNamespace
        ? element.localName
        : element.localName.toLowerCase(),
    attributes: attributesOf(element, base),
    children: []
  }

  if (element.namespaceURI === svgNamespace) {
    frozen.namespace = "svg"
  } else if (element.namespaceURI === mathNamespace) {
    frozen.namespace = "math"
  }

  if (element instanceof HTMLCanvasElement) {
    return canvasPicture(element, frozen)
  }

  if (element instanceof HTMLTextAreaElement) {
    frozen.children = [element.value]

    return frozen
  }

  frozen.children = childrenOf(element, base)

  return frozen
}

function childrenOf(element: Element, base: string): FrozenNode[] {
  const children: FrozenNode[] = []

  for (const child of element.childNodes) {
    if (child instanceof Text) {
      children.push(child.data)
    } else if (child instanceof Element && !skipped.has(child.localName.toLowerCase())) {
      children.push(frozenElement(child, base))
    }
  }

  return children
}

/** A `<canvas>` as an `<img>` of itself, when the page can read it; otherwise the canvas, empty. */
function canvasPicture(canvas: HTMLCanvasElement, frozen: FrozenElement): FrozenElement {
  let src: string

  try {
    src = canvas.toDataURL()
  } catch {
    return frozen
  }

  return {
    tag: "img",
    attributes: [...frozen.attributes.filter(([name]) => name !== "src"), ["src", src]],
    children: []
  }
}

/** An element's attributes, its form state written in, and every URL made absolute. */
function attributesOf(element: Element, base: string): [string, string][] {
  const attributes = new Map<string, string>()

  for (const attribute of element.attributes) {
    attributes.set(attribute.name, absoluteAttribute(attribute.name, attribute.value, base))
  }

  if (element instanceof HTMLInputElement) {
    if (element.type === "checkbox" || element.type === "radio") {
      setFlag(attributes, "checked", element.checked)
    } else if (element.type !== "password" && element.type !== "file") {
      attributes.set("value", element.value)
    }
  } else if (element instanceof HTMLOptionElement) {
    setFlag(attributes, "selected", element.selected)
  }

  return [...attributes]
}

function setFlag(attributes: Map<string, string>, name: string, on: boolean): void {
  if (on) {
    attributes.set(name, "")
  } else {
    attributes.delete(name)
  }
}

function absoluteAttribute(name: string, value: string, base: string): string {
  if (urlAttributes.has(name)) {
    return absoluteUrl(value, base)
  }

  if (name === "srcset" || name === "imagesrcset") {
    return value
      .split(",")
      .map((candidate) => {
        const [url, ...descriptors] = candidate.trim().split(/\s+/)

        return url ? [absoluteUrl(url, base), ...descriptors].join(" ") : ""
      })
      .filter(Boolean)
      .join(", ")
  }

  return name === "style" ? absoluteCss(value, base) : value
}

/** A URL made absolute against `base`, or as it was when it isn't one, as a `#hash` or a `javascript:` link. */
function absoluteUrl(value: string, base: string): string {
  const trimmed = value.trim()

  if (trimmed === "" || trimmed.startsWith("#")) {
    return value
  }

  try {
    return new URL(trimmed, base).href
  } catch {
    return value
  }
}

/** CSS with every `url()` made absolute against `base`. */
export function absoluteCss(css: string, base: string): string {
  return css.replaceAll(/url\(\s*(['"]?)(.*?)\1\s*\)/g, (whole, _quote: string, url: string) =>
    url.startsWith("data:") || url.startsWith("#") ? whole : `url("${absoluteUrl(url, base).replaceAll('"', "%22")}")`
  )
}

/**
 * The page's stylesheets in document order, then its adopted ones: each one the page can read as its text by hash,
 * kept in `kept` for `sheets.get`, with its `@import`s inlined, and each it can't by its address.
 */
function pageSheets(document: Document, kept: Map<string, string>): SheetEntry[] {
  const entries: SheetEntry[] = []
  const sheets = [...document.styleSheets, ...document.adoptedStyleSheets]

  for (const sheet of sheets) {
    if (sheet.disabled) {
      continue
    }

    const base = sheet.href ?? document.baseURI
    const read = sheetText(sheet, base, entries)

    if (read === undefined) {
      if (sheet.href) {
        entries.push({ href: sheet.href })
      }

      continue
    }

    const media = sheet.media.mediaText
    const text = media && media !== "all" ? `@media ${media} {\n${read}\n}` : read

    if (text.trim() === "") {
      continue
    }

    const hash = hashText(text)
    kept.set(hash, text)
    entries.push({ hash })
  }

  return entries
}

/**
 * A sheet's rules as text, `url()`s absolute against `base` and readable `@import`s inlined; an import the page can't
 * read goes into `entries` by its address, before the sheet that imports it. Undefined when the sheet itself can't be
 * read.
 */
function sheetText(sheet: CSSStyleSheet, base: string, entries: SheetEntry[]): string | undefined {
  let rules: CSSRuleList

  try {
    rules = sheet.cssRules
  } catch {
    return undefined
  }

  const parts: string[] = []

  for (const rule of rules) {
    if (isImportRule(rule)) {
      const imported = rule.styleSheet
      const importBase = imported?.href ?? new URL(rule.href, base).href
      const inner = imported ? sheetText(imported, importBase, entries) : undefined

      if (inner === undefined) {
        entries.push({ href: importBase })
        continue
      }

      const media = rule.media.mediaText
      let text = media && media !== "all" ? `@media ${media} {\n${inner}\n}` : inner

      if (rule.layerName !== null) {
        text = `@layer${rule.layerName ? ` ${rule.layerName}` : ""} {\n${text}\n}`
      }

      parts.push(text)
      continue
    }

    parts.push(absoluteCss(rule.cssText, base))
  }

  return parts.join("\n")
}

/** Whether a rule is an `@import`, read by its shape, since not every window names `CSSImportRule`. */
function isImportRule(rule: CSSRule): rule is CSSImportRule {
  return "styleSheet" in rule && "href" in rule && "media" in rule
}

/** A short, stable hash of some text: two rolling hashes and its length, which content-address sheets and tell markup apart. */
export function hashText(text: string): string {
  let first = 7
  let second = 11

  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index)
    first = (first * 31 + code) % 2_147_483_647
    second = (second * 131 + code) % 4_294_967_291
  }

  return `${first.toString(36)}${second.toString(36)}-${text.length.toString(36)}`
}
