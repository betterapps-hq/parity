import { afterEach, describe, expect, it } from "vite-plus/test"
import { tanstackRouterPage } from "./page.ts"

// The router as `router-core` puts it on the page's window: its state, `navigate` and `subscribe`, as far as the page
// router reads them.

interface FakeLocation {
  pathname: string
  searchStr: string
  hash: string
  href: string
}

function at(href: string): FakeLocation {
  const url = new URL(href, "http://app.localhost")

  return { pathname: url.pathname, searchStr: url.search, hash: url.hash.slice(1), href }
}

/** A router that moves in two steps, as TanStack's does: idle on the new location first, then resolved there. */
function fakeRouter(start: string, redirects: Record<string, string> = {}) {
  const matches: { status: string; globalNotFound?: boolean }[] = [{ status: "success" }]
  const listeners = new Set<() => void>()

  const resolve = () => {
    for (const listener of listeners) {
      listener()
    }
  }

  const router = {
    state: {
      status: "idle",
      location: at(start),
      resolvedLocation: at(start),
      matches
    },
    async navigate({ href }: { href: string }) {
      const target = at(redirects[href] ?? href)
      router.state = { ...router.state, status: "idle", location: target }
      // The resolved location follows a moment later, once the new page is drawn.
      setTimeout(() => {
        router.state = { ...router.state, resolvedLocation: target }
        resolve()
      }, 5)
    },
    subscribe(_event: "onResolved", listener: () => void) {
      listeners.add(listener)

      return () => listeners.delete(listener)
    },
    listeners,
    resolve
  }

  Reflect.set(globalThis, "__TSR_ROUTER__", router)

  return router
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, "__TSR_ROUTER__")
})

describe("tanstackRouterPage", () => {
  it("finds the app's router on the page's window, and nothing when there isn't one", () => {
    expect(tanstackRouterPage.found()).toBe(false)

    Reflect.set(globalThis, "__TSR_ROUTER__", { state: {} })
    expect(tanstackRouterPage.found()).toBe(false)

    fakeRouter("/")
    expect(tanstackRouterPage.found()).toBe(true)
  })

  it("says where the router resolved, with its search and hash", () => {
    fakeRouter("/projects?tab=open#top")

    expect(tanstackRouterPage.location()).toEqual({
      path: "/projects",
      search: "?tab=open",
      hash: "#top",
      outcome: "landed"
    })
  })

  it("says when the router ended on its not-found route or an error", () => {
    const router = fakeRouter("/nowhere")
    router.state.matches = [{ status: "success" }, { status: "notFound" }]

    expect(tanstackRouterPage.location().outcome).toBe("not-found")

    router.state.matches = [{ status: "success", globalNotFound: true }]
    expect(tanstackRouterPage.location().outcome).toBe("not-found")

    router.state.matches = [{ status: "error" }]
    expect(tanstackRouterPage.location().outcome).toBe("error")
  })

  it("resolves a navigation once the router has resolved where it ended, not when it first says it's idle", async () => {
    fakeRouter("/", { "/old": "/new" })

    await expect(tanstackRouterPage.navigate("/settings", new AbortController().signal)).resolves.toMatchObject({
      path: "/settings"
    })
    await expect(tanstackRouterPage.navigate("/old", new AbortController().signal)).resolves.toMatchObject({
      path: "/new"
    })
  })

  it("gives up a navigation when it's aborted", async () => {
    const router = fakeRouter("/")
    // The router stays pending: it never resolves where it ended.
    router.navigate = () => Promise.resolve()
    router.state.status = "pending"

    const abort = new AbortController()
    const going = tanstackRouterPage.navigate("/slow", abort.signal)
    abort.abort(new Error("Too slow"))

    await expect(going).rejects.toThrow("Too slow")
    expect(router.listeners.size).toBe(0)
  })

  it("gives up a navigation when it's aborted while the router's own navigation is still pending", async () => {
    const router = fakeRouter("/")
    // A loader that never finishes.
    router.navigate = () => new Promise(() => undefined)

    const abort = new AbortController()
    const going = tanstackRouterPage.navigate("/stalled", abort.signal)
    abort.abort(new Error("Too slow"))

    await expect(going).rejects.toThrow("Too slow")
    expect(router.listeners.size).toBe(0)
  })

  it("tells the watcher each time the router resolves, until it stops watching", () => {
    const router = fakeRouter("/")
    const moves: string[] = []
    const stop = tanstackRouterPage.watch((location) => moves.push(location.path))

    router.state.resolvedLocation = at("/billing")
    router.resolve()
    stop()
    router.resolve()

    expect(moves).toEqual(["/billing"])
  })
})
