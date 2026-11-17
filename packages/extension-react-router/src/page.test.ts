// @vitest-environment happy-dom
import { createMemoryRouter, redirect } from "react-router"
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test"
import { createBrowserRouter, matchPath } from "./page-wrap/react-router.ts"
import { reactRouterPage } from "./page.ts"

// React Router's own data router, with routes that load, redirect, throw and stall. What draws it stands in for React:
// it takes the router's latest state a moment later, as `RouterProvider` does in a transition, writes the path into the
// page, and reports the commit to React's DevTools hook, as React does, with a tree whose `RouterProvider` holds that
// state as its first hook's.

const hook = { onCommitFiberRoot: (..._args: unknown[]) => undefined }

type AppRouter = ReturnType<typeof createMemoryRouter>

/**
 * A committed tree, with `react-router/dom`'s `RouterProvider` given `router`, and React Router's own under it holding
 * `state` as its first hook's, or neither.
 */
function tree(router?: AppRouter, state?: AppRouter["state"]) {
  const provider = router
    ? { child: null, sibling: null, memoizedProps: { router }, memoizedState: { memoizedState: state, next: null } }
    : null

  const wrapper = router ? { child: provider, sibling: null, memoizedProps: { router }, memoizedState: null } : null

  return { current: { child: wrapper, sibling: null, memoizedProps: {}, memoizedState: null } }
}

/** A commit of `root`, as React reports it to the hook, after `draw` changes the page, if it does. */
function commit(root: ReturnType<typeof tree>, draw?: () => void) {
  draw?.()
  hook.onCommitFiberRoot(1, root)
}

let stopDrawing: (() => void) | undefined

function appRouter(start = "/") {
  const router = createMemoryRouter(
    [
      { path: "/", Component: null },
      { path: "/settings", loader: () => null },
      { path: "/old", loader: () => redirect("/new") },
      { path: "/new", loader: () => null },
      {
        path: "/broken",
        loader: () => {
          throw new Error("No data")
        }
      },
      { path: "/stalled", loader: () => new Promise(() => undefined) }
    ],
    { initialEntries: [start] }
  )

  // A state that comes before the last was drawn replaces it, as a newer transition does.
  let drawing: ReturnType<typeof setTimeout> | undefined

  const stop = router.subscribe((state) => {
    clearTimeout(drawing)
    drawing = setTimeout(() => {
      commit(tree(router, state), () => (document.body.textContent = state.location.pathname))
    }, 5)
  })

  stopDrawing = () => {
    stop()
    clearTimeout(drawing)
  }

  Reflect.set(globalThis, "__reactRouterDataRouter", router)

  return router
}

beforeEach(() => {
  globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__ = hook
})

afterEach(() => {
  stopDrawing?.()
  Reflect.deleteProperty(globalThis, "__REACT_DEVTOOLS_GLOBAL_HOOK__")
  Reflect.deleteProperty(globalThis, "__reactRouterDataRouter")
  Reflect.deleteProperty(globalThis, "__parityDataRouter")
  document.body.textContent = ""
})

describe("reactRouterPage", () => {
  it("finds framework mode's router on the page's window, and nothing when there isn't one", () => {
    expect(reactRouterPage.found()).toBe(false)

    Reflect.set(globalThis, "__reactRouterDataRouter", { state: {} })
    expect(reactRouterPage.found()).toBe(false)

    appRouter()
    expect(reactRouterPage.found()).toBe(true)
  })

  it("finds the router library mode made through Parity's createBrowserRouter, which passes the rest through", () => {
    window.history.replaceState(null, "", "/projects?tab=open#top")
    const router = createBrowserRouter([{ path: "/projects", Component: null }])

    expect(globalThis.__parityDataRouter).toBe(router)
    expect(reactRouterPage.location()).toEqual({
      path: "/projects",
      search: "?tab=open",
      hash: "#top",
      outcome: "landed"
    })
    expect(matchPath("/projects/:id", "/projects/7")?.params).toEqual({ id: "7" })

    router.dispose()
  })

  it("says when the router ended on its error boundary, or on a 404 for a path no route matches", async () => {
    appRouter()

    await reactRouterPage.navigate("/nowhere", new AbortController().signal)
    expect(reactRouterPage.location().outcome).toBe("not-found")

    await reactRouterPage.navigate("/broken", new AbortController().signal)
    expect(reactRouterPage.location().outcome).toBe("error")
  })

  it("resolves a navigation once the new page is drawn, not when the router lands", async () => {
    appRouter()

    await expect(reactRouterPage.navigate("/settings", new AbortController().signal)).resolves.toMatchObject({
      path: "/settings",
      outcome: "landed"
    })
    expect(document.body.textContent).toBe("/settings")

    await expect(reactRouterPage.navigate("/old", new AbortController().signal)).resolves.toMatchObject({
      path: "/new"
    })
    expect(document.body.textContent).toBe("/new")
  })

  it("resolves a navigation that React commits without changing the page", async () => {
    const router = appRouter()
    stopDrawing?.()

    const unsubscribe = router.subscribe((state) => {
      if (state.navigation.state === "idle") {
        setTimeout(() => commit(tree(router, state)), 5)
      }
    })

    await expect(reactRouterPage.navigate("/settings", new AbortController().signal)).resolves.toMatchObject({
      path: "/settings"
    })
    unsubscribe()
  })

  it("waits as long as React takes to commit the new routes, as when a route suspends", async () => {
    const router = appRouter()
    stopDrawing?.()

    let drawnAt = 0

    const unsubscribe = router.subscribe((state) => {
      if (state.navigation.state === "idle") {
        setTimeout(() => {
          drawnAt = Date.now()
          commit(tree(router, state), () => (document.body.textContent = state.location.pathname))
        }, 300)
      }
    })

    const start = Date.now()
    await reactRouterPage.navigate("/settings", new AbortController().signal)
    unsubscribe()

    expect(document.body.textContent).toBe("/settings")
    expect(drawnAt - start).toBeGreaterThanOrEqual(250)
  })

  it("isn't done by another root's commit, nor by one of the old location, as when the new route suspends", async () => {
    const router = appRouter()
    stopDrawing?.()
    const before = router.state
    const other = createMemoryRouter([{ path: "/", Component: null }])
    let done = false
    let doneEarly = false

    const unsubscribe = router.subscribe((state) => {
      if (state.navigation.state === "idle") {
        setTimeout(() => {
          commit(tree())
          commit(tree(other, state))
          commit(tree(router, before))
        }, 5)
        setTimeout(() => {
          doneEarly = done
          commit(tree(router, state))
        }, 50)
      }
    })

    await reactRouterPage.navigate("/settings", new AbortController().signal).then(() => (done = true))
    unsubscribe()
    other.dispose()

    expect(doneEarly).toBe(false)
    expect(done).toBe(true)
  })

  it("without React's hook, resolves at the page's first change, or after a moment with none", async () => {
    Reflect.deleteProperty(globalThis, "__REACT_DEVTOOLS_GLOBAL_HOOK__")
    const router = appRouter()
    stopDrawing?.()

    await expect(reactRouterPage.navigate("/settings", new AbortController().signal)).resolves.toMatchObject({
      path: "/settings"
    })
    expect(router.state.location.pathname).toBe("/settings")
  })

  it("gives up a navigation when it's aborted while a loader is still pending", async () => {
    appRouter()

    const abort = new AbortController()
    const going = reactRouterPage.navigate("/stalled", abort.signal)
    abort.abort(new Error("Too slow"))

    await expect(going).rejects.toThrow("Too slow")
  })

  it("tells the watcher each time the app moves by itself, until it stops watching", async () => {
    const router = appRouter()
    const moves: string[] = []
    const stop = reactRouterPage.watch((location) => moves.push(location.path))

    await router.navigate("/settings")
    await router.navigate("/old")
    stop()
    await router.navigate("/")

    expect(moves).toEqual(["/settings", "/new"])
  })
})
