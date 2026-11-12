/**
 * What Parity's windows may show (PAR-975). Project code runs in the editor's page and in the offscreen render windows,
 * so a link or script there could otherwise replace Parity's page with another one that keeps the preload bridge and
 * gets a channel to the project service on every load. Nothing here knows Electron, so its tests run without it.
 */

/** A page's address without its query or hash: its scheme, host and path. */
function pageOf(url: string): string | undefined {
  if (!URL.canParse(url)) {
    return undefined
  }

  const { protocol, host, pathname } = new URL(url)

  return `${protocol}//${host}${pathname}`
}

/**
 * Whether `url` shows the page at `page`: the same scheme, host and path, as `http://localhost:5310/` in development
 * or `parity://app/index.html` installed. A query or hash doesn't make it another page; another path, host or scheme
 * does.
 */
export function onPage(url: string, page: string): boolean {
  const here = pageOf(url)

  return here !== undefined && here === pageOf(page)
}

/** Whether an address opens in the person's browser: a web page, or a dev server on this machine such as Storybook. */
export function opensInBrowser(url: string): boolean {
  return url.startsWith("https://") || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(url)
}

/** A navigation as Electron's `will-navigate` and `will-redirect` events give it. */
export interface Navigation {
  readonly url: string
  readonly isMainFrame: boolean
  preventDefault(): void
}

export interface PageGuardOptions {
  /** The one page the window shows. */
  page: string
  /** Opens a refused link in the person's browser. A window nobody sees, such as a render window, leaves it out. */
  openBrowser?: (url: string) => void
}

/** What a window does with its page's navigations, for its `will-navigate` and `will-redirect` events. */
export interface PageGuard {
  navigate: (navigation: Navigation) => void
  redirect: (navigation: Navigation) => void
}

/**
 * Keeps a window on its own page. A navigation or a server's redirect to anywhere else is refused, and a refused link
 * opens in the browser when the window has one, as a link that opens a new window does. Reloading the page, or changing
 * its query or hash, stays. Frames inside the page, such as a design's embedded video, go where they like.
 */
export function pageGuard({ page, openBrowser }: PageGuardOptions): PageGuard {
  /** Refuses a navigation of the window's main frame away from its page, saying whether it refused. */
  const refuse = (navigation: Navigation) => {
    if (!navigation.isMainFrame || onPage(navigation.url, page)) {
      return false
    }

    // Called on the event itself: Electron's is a native object, whose method isn't bound to it.
    navigation.preventDefault()

    return true
  }

  return {
    navigate: (navigation) => {
      if (refuse(navigation) && openBrowser && opensInBrowser(navigation.url)) {
        openBrowser(navigation.url)
      }
    },
    redirect: (navigation) => void refuse(navigation)
  }
}
