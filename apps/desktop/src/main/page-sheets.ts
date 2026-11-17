import { maxSheetText } from "@parity-app/frames"

/*
 * Stylesheets on other hosts, for frozen copies (docs/proposals/route-frames.md, "Frozen copies"): a page can't read
 * the rules of a `<link>` on another origin, such as a web font's stylesheet, so its snapshot lists the sheet by its
 * address and main fetches it, as Parity's own requests aren't held to the page's CORS. The window sanitizes it as it
 * does the page's own sheets.
 */

/** How long main waits for another host's stylesheet, in milliseconds. */
const sheetDeadline = 5000

/**
 * Another host's stylesheet as text, or nothing when it isn't one: only `https:` addresses, a CSS answer that succeeded,
 * within `maxSheetText`. It never fails.
 */
export async function fetchPageSheet(
  href: string,
  fetch: (url: string, init: RequestInit) => Promise<Response>
): Promise<string | null> {
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

    return text.length > maxSheetText ? null : text
  } catch {
    return null
  }
}
