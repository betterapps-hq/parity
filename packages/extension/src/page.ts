/*
 * What router and renderer extensions give the page runtime (docs/proposals/route-frames.md, PAR-1260): modules that
 * run inside the app's own page when the canvas draws a route, served by the builder beside the runtime. This entry
 * holds only types, so a page module imports nothing of Parity's at runtime.
 */

/** Where the app's page is, as its router says. */
export interface PageLocation {
  path: string
  search: string
  hash: string
  /** How the router ended: on the route, sent elsewhere, on its not-found route, or on its error boundary. */
  outcome: "landed" | "redirected" | "not-found" | "error"
}

/** How the page runtime drives the app's router, from inside the app's page. A router extension provides it. */
export interface PageRouter {
  /** The router's name, for `page.ready`, such as "tanstack-router". */
  id: string
  /** Whether this page's app uses this router, checked once the app has hydrated. */
  found(): boolean
  /** Where the router is now. */
  location(): PageLocation
  /** Moves the app to `to`, and resolves once the router has resolved where it ended and the page holds the new route. */
  navigate(to: string, signal: AbortSignal): Promise<PageLocation>
  /** Calls `moved` after each navigation the app makes by itself. Returns what stops watching. */
  watch(moved: (location: PageLocation) => void): () => void
}

/** When the app's page has hydrated. A renderer extension provides it. */
export interface PageHydration {
  /** Installed before the app's code runs, where the builder can manage it. */
  install(): void
  /** Resolves once the app's first render has committed in the page. */
  hydrated(signal: AbortSignal): Promise<void>
}
