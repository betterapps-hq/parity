import { maxSheetText } from "@parity-app/frames"
import { absoluteCss } from "@parity-app/page-runtime"

/*
 * Stylesheets on other hosts, for frozen copies (docs/proposals/route-frames.md, "Frozen copies"): a page can't read
 * the rules of a `<link>` on another origin, such as a web font's stylesheet, so its snapshot lists the sheet by its
 * address and main fetches it, as Parity's own requests aren't held to the page's CORS. The window sanitizes it as it
 * does the page's own sheets.
 */

/** How long main waits for another host's stylesheet, in milliseconds. */
const sheetDeadline = 5000

/** How deep `@import`s are followed inside a fetched sheet. */
const importDepth = 4

type Fetch = (url: string, init: RequestInit) => Promise<Response>

/**
 * Another host's stylesheet as text, or nothing when it isn't one: only `https:` addresses, a CSS answer that succeeded,
 * within `maxSheetText`. Its `@import`s are fetched and inlined, with their layer, `supports()` and media conditions, as
 * the page runtime inlines its readable sheets', since the sanitizer refuses `@import`. Each sheet's `url()`s are made
 * absolute against the address it came from after any redirect, since the sanitizer keeps no relative URL. It never
 * fails.
 */
export async function fetchPageSheet(href: string, fetch: Fetch): Promise<string | null> {
  const text = await fetchSheet(href, fetch, importDepth)

  return text === null || text.length > maxSheetText ? null : text
}

async function fetchSheet(href: string, fetch: Fetch, depth: number): Promise<string | null> {
  let url: URL

  try {
    url = new URL(href)
  } catch {
    return null
  }

  if (url.protocol !== "https:") {
    return null
  }

  try {
    const response = await fetch(url.href, {
      signal: AbortSignal.timeout(sheetDeadline),
      credentials: "omit",
      redirect: "follow"
    })

    const type = response.headers.get("content-type") ?? ""

    if (!response.ok || (type !== "" && !type.includes("text/css"))) {
      return null
    }

    const text = await response.text()

    if (text.length > maxSheetText) {
      return null
    }

    const base = response.url || url.href

    return await inlineImports(absoluteCss(text, base), base, fetch, depth)
  } catch {
    return null
  }
}

/** An `@import` statement: its address, as a string or `url()`, and the conditions after it. */
const importRule = /@import\s+(?:url\(\s*(['"]?)([^'")]*)\1\s*\)|(['"])([^'"]*)\3)\s*([^;]*);/gi

/** A sheet with each `@import` replaced by the sheet it names, inside its conditions; one that can't be fetched goes. */
async function inlineImports(css: string, base: string, fetch: Fetch, depth: number): Promise<string> {
  const found = [...css.matchAll(importRule)]

  if (found.length === 0) {
    return css
  }

  const inlined = await Promise.all(
    found.map(async (match) => {
      const address = match[2] ?? match[4] ?? ""
      const href = new URL(address, base).href
      const text = depth > 0 ? await fetchSheet(href, fetch, depth - 1) : null

      return text === null ? "" : conditioned(text, match[5] ?? "")
    })
  )

  let index = 0

  return css.replace(importRule, () => inlined[index++] ?? "")
}

/** Rules inside an `@import`'s conditions: its media, then `supports()`, then its layer, outermost. */
function conditioned(css: string, conditions: string): string {
  let rest = conditions.trim()
  let layer: string | undefined
  let supports: string | undefined

  const layered = /^layer(?:\(\s*([^)]*?)\s*\))?/i.exec(rest)

  if (layered) {
    layer = layered[1] ?? ""
    rest = rest.slice(layered[0].length).trim()
  }

  const supported = /^supports\((.*)\)(?=\s|$)/i.exec(rest)

  if (supported) {
    supports = supported[1]
    rest = rest.slice(supported[0].length).trim()
  }

  let text = rest && rest !== "all" ? `@media ${rest} {\n${css}\n}` : css

  if (supports !== undefined) {
    text = `@supports (${supports}) {\n${text}\n}`
  }

  return layer === undefined ? text : `@layer${layer ? ` ${layer}` : ""} {\n${text}\n}`
}
