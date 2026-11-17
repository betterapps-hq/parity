import type { PageLocation, PageRouter } from "@parity-app/extension/page"

/*
 * TanStack Router's page router (docs/proposals/route-frames.md, PAR-1260): it drives the app's own router from inside
 * the app's page. `router-core` puts every client router on `window.__TSR_ROUTER__`, since about 1.121, not only
 * TanStack Start's. That global isn't public API, so it's read for what's used and passed over when it isn't there.
 */

/** A location as TanStack Router keeps it. */
interface RouterLocation {
  pathname: string
  /** With its `?`, or empty. */
  searchStr: string
  /** Without its `#`, or empty. */
  hash: string
  href: string
}

/** What's read of the app's router. */
interface AppRouter {
  state: {
    status: string
    location: RouterLocation
    resolvedLocation?: RouterLocation
    matches: { status: string; globalNotFound?: boolean }[]
  }
  navigate(options: { href: string }): Promise<void>
  subscribe(event: "onResolved", listener: () => void): () => void
}

declare global {
  /** Where `router-core` puts the app's router. */
  var __TSR_ROUTER__: unknown
}

/** The app's router, when the page has one. */
function appRouter(): AppRouter | undefined {
  const router = globalThis.__TSR_ROUTER__

  return isAppRouter(router) ? router : undefined
}

function isAppRouter(value: unknown): value is AppRouter {
  return (
    value instanceof Object &&
    "state" in value &&
    value.state instanceof Object &&
    "location" in value.state &&
    "navigate" in value &&
    value.navigate instanceof Function &&
    "subscribe" in value &&
    value.subscribe instanceof Function
  )
}

/** The app's router, or the error that says the page has none. */
function routerOrThrow(): AppRouter {
  const router = appRouter()

  if (!router) {
    throw new Error("The page has no TanStack router")
  }

  return router
}

/** Where the router is: where it last resolved, and whether that was its not-found route or an error. */
function locationOf(router: AppRouter): PageLocation {
  const { location, resolvedLocation, matches } = router.state
  const at = resolvedLocation ?? location

  return {
    path: at.pathname,
    search: at.searchStr,
    hash: at.hash === "" ? "" : `#${at.hash}`,
    outcome: outcomeOf(matches)
  }
}

/** How the router ended, from the routes it matched: on an error, on a not-found route, or on the route. */
function outcomeOf(matches: AppRouter["state"]["matches"]): PageLocation["outcome"] {
  if (matches.some((match) => match.status === "error")) {
    return "error"
  }

  if (matches.some((match) => match.status === "notFound" || match.globalNotFound === true)) {
    return "not-found"
  }

  return "landed"
}

/** Whether the router has finished moving: idle, with the page it resolved being the one it was sent to. */
function settled(router: AppRouter): boolean {
  const { status, location, resolvedLocation } = router.state

  return status === "idle" && resolvedLocation?.href === location.href
}

export const tanstackRouterPage: PageRouter = {
  id: "tanstack-router",
  found: () => appRouter() !== undefined,
  location: () => locationOf(routerOrThrow()),
  async navigate(to, signal) {
    const router = routerOrThrow()

    // The router says it's idle while the old page is still drawn, so this waits for it to resolve where it ended.
    let stop: (() => void) | undefined

    const resolved = new Promise<void>((resolve, reject) => {
      stop = router.subscribe("onResolved", () => {
        if (settled(router)) {
          resolve()
        }
      })

      signal.addEventListener("abort", () => reject(signal.reason), { once: true })
    })

    // Aborted after the router had settled, nothing waits on it.
    resolved.catch(() => undefined)

    try {
      // A loader that stalls keeps the router's own promise pending, so an abort mustn't wait for it.
      await Promise.race([router.navigate({ href: to }), resolved])

      if (!settled(router)) {
        await resolved
      }
    } finally {
      stop?.()
    }

    return locationOf(router)
  },
  watch(moved) {
    const router = appRouter()

    return router ? router.subscribe("onResolved", () => moved(locationOf(router))) : () => undefined
  }
}
