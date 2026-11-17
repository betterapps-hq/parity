import type { PageLocation, PageRouter } from "@parity-app/extension/page"

/*
 * Next.js's page router (docs/proposals/route-frames.md, PAR-1265): it drives the app's own router from inside the
 * app's page, through `window.next.router`. Under the App Router that's the instance `useRouter` returns, whose `push`
 * starts a transition and returns nothing; the address changes as React commits the new tree. Under the Pages Router
 * it's the router itself, whose `push` resolves once the new page has committed. That global isn't public API, so it's
 * read for what's used and passed over when it isn't there.
 */

/** The App Router's instance. */
interface AppRouterInstance {
  push(href: string): void
  prefetch(href: string): void
}

/** The Pages Router's router. */
interface PagesRouter {
  /** The page drawn, as `/404` or `/_error` when it's one of those. */
  route: string
  push(url: string): Promise<boolean>
  events: {
    on(event: "routeChangeComplete", handler: () => void): void
    off(event: "routeChangeComplete", handler: () => void): void
  }
}

type NextRouter = { kind: "app"; router: AppRouterInstance } | { kind: "pages"; router: PagesRouter }

declare global {
  /** Where Next puts its version and router. */
  var next: unknown
}

/** The app's router, when the page has one, by which of Next's routers it is. */
function appRouter(): NextRouter | undefined {
  const next = globalThis.next
  const router = next instanceof Object && "router" in next ? next.router : undefined

  if (!(router instanceof Object) || !("push" in router) || !(router.push instanceof Function)) {
    return undefined
  }

  if ("events" in router && router.events instanceof Object && "on" in router.events && "route" in router) {
    // SAFETY: only the Pages Router's router has `events` and `route` beside `push`; Next's own code reads them so.
    return { kind: "pages", router: router as PagesRouter }
  }

  // SAFETY: the App Router's instance is the one with `push` and `prefetch` and no `events`.
  return "prefetch" in router ? { kind: "app", router: router as AppRouterInstance } : undefined
}

/** The app's router, or the error that says the page has none. */
function routerOrThrow(): NextRouter {
  const router = appRouter()

  if (!router) {
    throw new Error("The page has no Next.js router")
  }

  return router
}

/** Where the page is, and whether Next drew its not-found or error page there. */
function locationOf(found: NextRouter): PageLocation {
  const { pathname, search, hash } = location

  return { path: pathname, search, hash, outcome: outcomeOf(found) }
}

function outcomeOf(found: NextRouter): PageLocation["outcome"] {
  if (found.kind === "pages") {
    return pagesOutcome(found.router.route)
  }

  // The App Router marks its not-found, forbidden and unauthorized pages in development, which is what Parity runs.
  const fallback = document.querySelector('meta[name="boundary-next-error"]')?.getAttribute("content")

  if (!fallback) {
    return "landed"
  }

  return fallback === "not-found" ? "not-found" : "error"
}

/** How the Pages Router ended, from the page it drew: its own for a path it has no page for, or for an error. */
function pagesOutcome(route: string): PageLocation["outcome"] {
  if (route === "/404") {
    return "not-found"
  }

  return route === "/_error" ? "error" : "landed"
}

/**
 * Calls `changed` each time the App Router writes the page's address, by `history` or the back button: as it commits a
 * new tree, so the page holds what the address says. Returns what stops it.
 */
function onAddressWrite(changed: () => void): () => void {
  const push = history.pushState
  const replace = history.replaceState

  history.pushState = function (...args) {
    push.apply(this, args)
    changed()
  }

  history.replaceState = function (...args) {
    replace.apply(this, args)
    changed()
  }

  addEventListener("popstate", changed)

  return () => {
    history.pushState = push
    history.replaceState = replace
    removeEventListener("popstate", changed)
  }
}

/** Moves the App Router, resolving at its next commit, when it writes the address, redirected or not. */
async function appNavigate(router: AppRouterInstance, to: string, signal: AbortSignal): Promise<void> {
  const { promise, resolve, reject } = Promise.withResolvers<void>()
  const stop = onAddressWrite(resolve)
  signal.addEventListener("abort", () => reject(signal.reason), { once: true })

  try {
    router.push(to)
    await promise
  } finally {
    stop()
  }
}

/** Moves the Pages Router, which resolves once the new page has committed, unless it's sent away by a full load. */
async function pagesNavigate(router: PagesRouter, to: string, signal: AbortSignal): Promise<void> {
  const aborted = new Promise<never>((_, reject) => {
    signal.addEventListener("abort", () => reject(signal.reason), { once: true })
  })

  aborted.catch(() => undefined)
  await Promise.race([router.push(to), aborted])
}

export const nextjsPage: PageRouter = {
  id: "nextjs",
  found: () => appRouter() !== undefined,
  location: () => locationOf(routerOrThrow()),
  async navigate(to, signal) {
    const found = routerOrThrow()

    await (found.kind === "app" ? appNavigate(found.router, to, signal) : pagesNavigate(found.router, to, signal))

    return locationOf(found)
  },
  watch(moved) {
    const found = appRouter()

    if (!found) {
      return () => undefined
    }

    if (found.kind === "pages") {
      const complete = () => moved(locationOf(found))
      found.router.events.on("routeChangeComplete", complete)

      return () => found.router.events.off("routeChangeComplete", complete)
    }

    // The App Router writes the address on every commit, so only a new one is a move.
    let last = location.href

    return onAddressWrite(() => {
      if (location.href !== last) {
        last = location.href
        moved(locationOf(found))
      }
    })
  }
}
