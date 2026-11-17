import type { PageLocation, PageRouter } from "@parity-app/extension/page"

/*
 * React Router's page router (docs/proposals/route-frames.md, PAR-1265): it drives the app's own data router from
 * inside the app's page. Framework mode's `HydratedRouter` puts it on `window.__reactRouterDataRouter`, in v7 and v8.
 * Library mode has no global, so the builder serves the app's `createBrowserRouter` and `createHashRouter` through
 * `./page-wrap/react-router.ts`, which hands what they make to `window.__parityDataRouter`. A declarative
 * `<BrowserRouter>` makes no router object, so its pages have no page router, and their spares stay parked. Neither
 * global is public API, so each is read for what's used and passed over when it isn't there.
 */

/** A location as React Router keeps it. */
interface RouterLocation {
  pathname: string
  /** With its `?`, or empty. */
  search: string
  /** With its `#`, or empty. */
  hash: string
  key?: string
}

/** What a route threw, of which only an error response's status is read: React Router's 404, or a loader's. */
interface Thrown {
  status?: number
}

/** What's read of the app's router. */
interface DataRouter {
  state: {
    location: RouterLocation
    navigation: { state: string }
    /** By route id, what a route's loader or component threw. */
    errors: Record<string, Thrown | null | undefined> | null
  }
  navigate(to: string): Promise<void>
  subscribe(listener: (state: DataRouter["state"]) => void): () => void
}

declare global {
  /** Where framework mode's `HydratedRouter` puts the app's router. */
  var __reactRouterDataRouter: unknown
  /** Where Parity's wrapped `createBrowserRouter` and `createHashRouter` put the router they made, in library mode. */
  var __parityDataRouter: unknown
  /** Where React reports its commits, as DevTools reads them. */
  var __REACT_DEVTOOLS_GLOBAL_HOOK__: unknown
}

/** Without a hook to hear React's commits on, how long a move waits for the page to change before it counts as drawn. */
const unchangedLimit = 100

/** The app's router, when the page has one: framework mode's, or the one library mode made. */
function appRouter(): DataRouter | undefined {
  return [globalThis.__reactRouterDataRouter, globalThis.__parityDataRouter].find(isDataRouter)
}

function isDataRouter(value: unknown): value is DataRouter {
  return (
    value instanceof Object &&
    "state" in value &&
    value.state instanceof Object &&
    "location" in value.state &&
    value.state.location instanceof Object &&
    "navigation" in value.state &&
    "navigate" in value &&
    value.navigate instanceof Function &&
    "subscribe" in value &&
    value.subscribe instanceof Function
  )
}

/** The app's router, or the error that says the page has none. */
function routerOrThrow(): DataRouter {
  const router = appRouter()

  if (!router) {
    throw new Error("The page has no React Router data router")
  }

  return router
}

/** Where the router is, and whether it ended on its error boundary, or on a 404 for a path no route matched. */
function locationOf(state: DataRouter["state"]): PageLocation {
  const { pathname, search, hash } = state.location

  return { path: pathname, search, hash, outcome: outcomeOf(state.errors) }
}

function outcomeOf(errors: DataRouter["state"]["errors"]): PageLocation["outcome"] {
  const thrown = Object.values(errors ?? {})

  if (thrown.length === 0) {
    return "landed"
  }

  // React Router throws a 404 error response when no route matches, and a loader can throw one of its own.
  return thrown.some((error) => error?.status === 404) ? "not-found" : "error"
}

/** What React calls on the DevTools hook as it commits. */
interface CommitHook {
  onCommitFiberRoot(...args: unknown[]): void
}

function isCommitHook(value: unknown): value is CommitHook {
  return value instanceof Object && "onCommitFiberRoot" in value && value.onCommitFiberRoot instanceof Function
}

/** What's called on each of React's commits, while a move waits for one. */
const commitListeners = new Set<() => void>()

/** The hook this module listens to commits on, once it has. */
let listenedHook: object | undefined

/**
 * Listens to React's commits, through the `__REACT_DEVTOOLS_GLOBAL_HOOK__` React reports each commit to: the one React's
 * hydration module installs before the app loads, or DevTools' or Fast Refresh's. React reads the hook's
 * `onCommitFiberRoot` on every commit, so wrapping it now still hears them. Says whether there's a hook to listen on.
 */
function listenToCommits(): boolean {
  const hook = globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__

  if (hook === listenedHook) {
    return hook !== undefined
  }

  if (!isCommitHook(hook)) {
    return false
  }

  const before = hook.onCommitFiberRoot.bind(hook)

  hook.onCommitFiberRoot = (...args) => {
    before(...args)
    commitListeners.forEach((listener) => listener())
  }

  listenedHook = hook

  return true
}

/**
 * Resolves once React has drawn the router's new state: at React's first commit after the router settles. React
 * Router hands its state to React in a transition, so the router settling isn't the new page being in the DOM, and a
 * route that suspends keeps the old page, with no commit, until it's ready. A commit that leaves the DOM as it was
 * counts too. Without a hook to hear commits on, it's the page's first change after the router settles, or
 * `unchangedLimit` without one.
 */
function drawn(router: DataRouter, signal: AbortSignal): Promise<void> {
  const { promise, resolve, reject } = Promise.withResolvers<void>()
  const from = router.state.location.key
  const commits = listenToCommits()
  let settled = false
  let limit: ReturnType<typeof setTimeout> | undefined

  const changes = new MutationObserver(() => {
    if (settled) {
      resolve()
    }
  })

  const settle = (state: DataRouter["state"]) => {
    if (settled || state.navigation.state !== "idle" || state.location.key === from) {
      return
    }

    settled = true

    if (commits) {
      commitListeners.add(resolve)
    } else {
      changes.observe(document, { subtree: true, childList: true, attributes: true, characterData: true })
      limit = setTimeout(resolve, unchangedLimit)
    }
  }

  const stop = router.subscribe(settle)
  signal.addEventListener("abort", () => reject(signal.reason), { once: true })

  return promise.finally(() => {
    commitListeners.delete(resolve)
    changes.disconnect()
    stop()
    clearTimeout(limit)
  })
}

export const reactRouterPage: PageRouter = {
  id: "react-router",
  found: () => appRouter() !== undefined,
  location: () => locationOf(routerOrThrow().state),
  async navigate(to, signal) {
    const router = routerOrThrow()
    const done = drawn(router, signal)

    // Aborted after the page was drawn, nothing waits on it.
    done.catch(() => undefined)

    // A loader that stalls keeps the router's own promise pending, so an abort mustn't wait for it.
    await Promise.race([router.navigate(to), done])
    await done

    return locationOf(router.state)
  },
  watch(moved) {
    const router = appRouter()

    if (!router) {
      return () => undefined
    }

    let last = router.state.location.key

    return router.subscribe((state) => {
      if (state.navigation.state === "idle" && state.location.key !== last) {
        last = state.location.key
        moved(locationOf(state))
      }
    })
  }
}
