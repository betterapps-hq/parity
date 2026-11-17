// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vite-plus/test"
import { nextjsPage } from "./page.ts"

// `window.next.router` as each of Next's routers leaves it, as far as the page router reads them.

/**
 * The App Router's instance: `push` starts a transition and returns nothing, and the address changes as React commits
 * the new tree, a moment later.
 */
function appRouter(redirects: Record<string, string> = {}) {
  const router = {
    push(href: string) {
      setTimeout(() => window.history.pushState({ __NA: true }, "", redirects[href] ?? href), 5)
    },
    prefetch: () => undefined
  }

  Reflect.set(globalThis, "next", { version: "16.4.6", router })

  return router
}

/** Where the Pages Router draws its own pages instead. */
const errorPages = new Map([
  ["/missing", "/404"],
  ["/broken", "/_error"]
])

/** The Pages Router: `push` resolves once the new page has committed, and `routeChangeComplete` follows. */
function pagesRouter() {
  const handlers = new Set<() => void>()

  const router = {
    route: "/",
    async push(url: string) {
      window.history.pushState({}, "", url)
      await new Promise((resolve) => setTimeout(resolve, 5))
      router.route = errorPages.get(url) ?? new URL(url, location.href).pathname

      for (const handler of handlers) {
        handler()
      }

      return true
    },
    events: {
      on: (_event: string, handler: () => void) => handlers.add(handler),
      off: (_event: string, handler: () => void) => handlers.delete(handler)
    },
    handlers
  }

  Reflect.set(globalThis, "next", { version: "16.4.6", router })

  return router
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, "next")
  document.head.replaceChildren()
  window.history.replaceState(null, "", "/")
})

describe("nextjsPage", () => {
  it("finds either of Next's routers on the page's window, and nothing when there isn't one", () => {
    expect(nextjsPage.found()).toBe(false)

    Reflect.set(globalThis, "next", { version: "16.4.6" })
    expect(nextjsPage.found()).toBe(false)

    appRouter()
    expect(nextjsPage.found()).toBe(true)

    pagesRouter()
    expect(nextjsPage.found()).toBe(true)
  })

  it("says where the page is, with its search and hash", () => {
    appRouter()
    window.history.replaceState(null, "", "/projects?tab=open#top")

    expect(nextjsPage.location()).toEqual({ path: "/projects", search: "?tab=open", hash: "#top", outcome: "landed" })
  })

  it("resolves an App Router navigation once the new tree commits, where it was redirected", async () => {
    appRouter({ "/old": "/new" })

    await expect(nextjsPage.navigate("/settings", new AbortController().signal)).resolves.toMatchObject({
      path: "/settings",
      outcome: "landed"
    })
    await expect(nextjsPage.navigate("/old", new AbortController().signal)).resolves.toMatchObject({ path: "/new" })
  })

  it("says when the App Router drew its not-found page or another fallback", () => {
    appRouter()
    const marker = document.createElement("meta")
    marker.name = "boundary-next-error"
    marker.content = "not-found"
    document.head.append(marker)

    expect(nextjsPage.location().outcome).toBe("not-found")

    marker.content = "forbidden"
    expect(nextjsPage.location().outcome).toBe("error")
  })

  it("gives up an App Router navigation that never commits when it's aborted, and leaves history as it was", async () => {
    const router = appRouter()
    router.push = () => undefined
    const before = Object.getOwnPropertyDescriptor(window.history, "pushState")

    const abort = new AbortController()
    const going = nextjsPage.navigate("/stalled", abort.signal)
    abort.abort(new Error("Too slow"))

    await expect(going).rejects.toThrow("Too slow")
    expect(Object.getOwnPropertyDescriptor(window.history, "pushState")).toEqual(before)
  })

  it("resolves a Pages Router navigation once the new page has committed, with its 404 and error pages", async () => {
    pagesRouter()

    await expect(nextjsPage.navigate("/settings", new AbortController().signal)).resolves.toMatchObject({
      path: "/settings",
      outcome: "landed"
    })
    await expect(nextjsPage.navigate("/missing", new AbortController().signal)).resolves.toMatchObject({
      outcome: "not-found"
    })
    await expect(nextjsPage.navigate("/broken", new AbortController().signal)).resolves.toMatchObject({
      outcome: "error"
    })
  })

  it("gives up a Pages Router navigation that's sent away by a full load when it's aborted", async () => {
    const router = pagesRouter()
    router.push = () => new Promise(() => undefined)

    const abort = new AbortController()
    const going = nextjsPage.navigate("/elsewhere", abort.signal)
    abort.abort(new Error("Too slow"))

    await expect(going).rejects.toThrow("Too slow")
  })

  it("tells the watcher each time the App Router commits a new address, until it stops watching", () => {
    appRouter()
    const moves: string[] = []
    const stop = nextjsPage.watch((location) => moves.push(location.path))

    window.history.pushState(null, "", "/billing")
    // The App Router writes the address on every commit, the same one included.
    window.history.replaceState(null, "", "/billing")
    stop()
    window.history.pushState(null, "", "/after")

    expect(moves).toEqual(["/billing"])
  })

  it("tells the watcher each time the Pages Router completes a move, until it stops watching", async () => {
    const router = pagesRouter()
    const moves: string[] = []
    const stop = nextjsPage.watch((location) => moves.push(location.path))

    await router.push("/billing")
    stop()

    expect(moves).toEqual(["/billing"])
    expect(router.handlers.size).toBe(0)
  })
})
