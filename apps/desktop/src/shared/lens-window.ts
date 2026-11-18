/** The page a lens's own window opens on, on the window's own origin, before the lens is moved into it. */
export const lensWindowPage = "/lenses/popout/popout.html"

/** A window's place on the screen, as Electron gives a window's bounds. */
export interface WindowPlace {
  x: number
  y: number
  width: number
  height: number
}

/**
 * What a lens window's address says: the lens in front of it, whether it was let go somewhere on the screen, and the
 * place it was saved at, when the project's layout put it back.
 */
export interface LensWindowPage {
  lens: string
  placed: boolean
  place?: WindowPlace
}

/**
 * The page a lens's own window opens on, named for the lens in front of it, and saying when it was let go somewhere, so
 * it opens there rather than where that lens's window last was, or the place it was saved at.
 */
export function lensWindowUrl(page: string, { lens, placed, place }: LensWindowPage): string {
  const query = new URLSearchParams({ lens })

  if (placed) {
    query.set("placed", "")
  }

  if (place) {
    query.set("place", [place.x, place.y, place.width, place.height].map(Math.round).join(","))
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

  const read: LensWindowPage = { lens, placed: opened.searchParams.has("placed") }
  const place = readPlace(opened.searchParams.get("place"))

  return place ? { ...read, place } : read
}

/** A place written as `x,y,width,height` in whole pixels, with some width and height. */
function readPlace(written: string | null): WindowPlace | undefined {
  const numbers = written?.split(",").map(Number) ?? []

  if (numbers.length !== 4 || !numbers.every(Number.isSafeInteger)) {
    return undefined
  }

  const [x = 0, y = 0, width = 0, height = 0] = numbers

  return width > 0 && height > 0 ? { x, y, width, height } : undefined
}
