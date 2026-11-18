/** The page a lens's own window opens on, on the window's own origin, before the lens is moved into it. */
export const lensWindowPage = "/lenses/popout/popout.html"

/** What a lens window's address says: the lens in front of it, and whether it was let go somewhere on the screen. */
export interface LensWindowPage {
  lens: string
  placed: boolean
}

/**
 * The page a lens's own window opens on, named for the lens in front of it, and saying when it was let go somewhere, so
 * it opens there rather than where that lens's window last was.
 */
export function lensWindowUrl(page: string, { lens, placed }: LensWindowPage): string {
  const query = new URLSearchParams({ lens })

  if (placed) {
    query.set("placed", "")
  }

  return `${page}?${query}`
}

/**
 * What a window about to open is, when it's a lens window on the same scheme and host as the app's page, `page`, such
 * as `parity://app/index.html`: nothing for any other address. Hosts are compared rather than origins, since a scheme
 * of the app's own has none outside the browser.
 */
export function readLensWindowUrl(url: string, page: string): LensWindowPage | undefined {
  if (!URL.canParse(url) || !URL.canParse(page)) {
    return undefined
  }

  const opened = new URL(url)
  const app = new URL(page)
  const lens = opened.searchParams.get("lens")

  if (opened.protocol !== app.protocol || opened.host !== app.host || opened.pathname !== lensWindowPage || !lens) {
    return undefined
  }

  return { lens, placed: opened.searchParams.has("placed") }
}
