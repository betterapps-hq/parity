// @vitest-environment happy-dom
import { createMemoryRouter, redirect } from "react-router"
import { afterEach, describe, expect, it } from "vite-plus/test"
import { createBrowserRouter, matchPath } from "./page-wrap/react-router.ts"
import { reactRouterPage } from "./page.ts"

// React Router's own data router, with routes that load, redirect, throw and stall. What draws it stands in for React:
// it takes the router's latest state a moment later, as `RouterProvider` does in a transition, and writes the path
// into the page.

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
      document.body.textContent = state.location.pathname
    }, 5)
  })

  stopDrawing = () => {
    stop()
    clearTimeout(drawing)
  }

  Reflect.set(globalThis, "__reactRouterDataRouter", router)

  return router
}

afterEach(() => {
  stopDrawing?.()
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

  it("resolves a navigation to the same routes that draws nothing new", async () => {
    const router = appRouter("/settings")
    stopDrawing?.()

    await expect(reactRouterPage.navigate("/settings?tab=2", new AbortController().signal)).resolves.toMatchObject({
      path: "/settings",
      search: "?tab=2"
    })
    expect(router.state.location.search).toBe("?tab=2")
  })

  it("waits as long as React takes to draw other routes, as when a route suspends", async () => {
    const router = appRouter()
    stopDrawing?.()

    let drawnAt = 0

    const unsubscribe = router.subscribe((state) => {
      if (state.navigation.state === "idle") {
        setTimeout(() => {
          drawnAt = Date.now()
          document.body.textContent = state.location.pathname
        }, 300)
      }
    })

    const start = Date.now()
    await reactRouterPage.navigate("/settings", new AbortController().signal)
    unsubscribe()

    expect(document.body.textContent).toBe("/settings")
    expect(drawnAt - start).toBeGreaterThanOrEqual(250)
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
