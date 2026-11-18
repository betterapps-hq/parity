// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vite-plus/test"
import { reactRouterPage } from "../page.ts"
import { createBrowserRouter, createHashRouter, matchPath } from "./react-router-dom.ts"

// Against `react-router-dom` 7's own routers, which it re-exports from React Router 7.

afterEach(() => {
  Reflect.deleteProperty(globalThis, "__parityDataRouter")
})

describe("Parity's react-router-dom", () => {
  it("hands the router createBrowserRouter makes to the page router, and passes the rest through", () => {
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

  it("hands over the router createHashRouter makes, which the page router moves", async () => {
    window.history.replaceState(null, "", "/#/projects")

    const router = createHashRouter([
      { path: "/projects", Component: null },
      { path: "/settings", Component: null }
    ])

    expect(globalThis.__parityDataRouter).toBe(router)
    // Without React's hook to hear commits on, a move is done a moment after the router lands.
    await expect(reactRouterPage.navigate("/settings", new AbortController().signal)).resolves.toMatchObject({
      path: "/settings",
      outcome: "landed"
    })

    router.dispose()
  })
})
