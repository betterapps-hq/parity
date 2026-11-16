// @vitest-environment happy-dom
import type { GuestDecorators, LibraryDecorator, MountHandle, MountOptions } from "@parity-app/core"
import { createElement, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"
import { createGuest } from "./guest.ts"

// A page of the app drawn as a frame (PAR-1205): the router's page decorator around it in place of its frame decorator,
// made from the app's own route tree, which loads the first time a page is drawn.

/** A module as the guest gets it: its exports, or the error it failed to load with. */
type Loaded = GuestDecorators["modules"][string]

const mounted: MountHandle[] = []
let target: HTMLElement

beforeEach(() => {
  target = document.createElement("div")
  document.body.append(target)
})

afterEach(() => {
  for (const handle of mounted.splice(0)) {
    handle.unmount()
  }

  target.remove()
})

/** A memory history, as a router's: where it is, and who hears when it goes elsewhere. */
interface History {
  location: { pathname: string; search: string; hash: string }
  subscribe(listener: (change: { location: History["location"] }) => void): () => void
  replace(path: string): void
}

function createMemoryHistory({ initialEntries }: { initialEntries: string[] }): History {
  const listeners = new Set<(change: { location: History["location"] }) => void>()
  const at = (path: string) => ({ pathname: path.split("?")[0] ?? path, search: "", hash: "" })

  const history: History = {
    location: at(initialEntries[0] ?? "/"),
    subscribe(listener) {
      listeners.add(listener)

      return () => listeners.delete(listener)
    },
    replace(path) {
      history.location = at(path)

      for (const listener of listeners) {
        listener({ location: history.location })
      }
    }
  }

  return history
}

/** A router over a route tree whose routes may redirect, as `beforeLoad` does. */
interface Router {
  history: History
  routeTree: { redirects: Record<string, string> }
}

function createRouter(options: Router): Router {
  return options
}

/** Draws the page the router is at, sending it on first where its route redirects. */
function RouterProvider({ router, children }: { router: Router; children?: ReactNode }) {
  const to = router.routeTree.redirects[router.history.location.pathname]

  if (to) {
    router.history.replace(to)
  }

  return createElement("article", { "data-page": router.history.location.pathname }, children)
}

const router: Loaded = { createRouter, createMemoryHistory, RouterProvider }

/** The frame decorator: a router with nothing in it, around every frame. */
const frameDecorator: LibraryDecorator = { wrap: { import: "router", component: "FrameRouter" } }

/** The page decorator: the router made from the app's route tree, at the page's URL, which says where it landed. */
const pageDecorator: LibraryDecorator = {
  wrap: {
    import: "router",
    component: "RouterProvider",
    props: {
      router: {
        $call: { import: "router", export: "createRouter" },
        args: [
          {
            routeTree: { $import: "./src/routeTree.gen.ts", export: "routeTree" },
            history: {
              $call: { import: "router", export: "createMemoryHistory" },
              args: [{ initialEntries: [{ $frame: "url" }] }],
              methods: [{ method: "subscribe", args: [{ $frame: "landed" }] }]
            }
          }
        ]
      }
    }
  }
}

function mount(options: MountOptions, routeTree: () => Promise<Loaded>) {
  const loads = { routeTree: vi.fn<() => Promise<Loaded>>(routeTree) }

  const decorators: GuestDecorators = {
    list: [
      { library: "router", decorator: frameDecorator },
      { library: "ui", decorator: { wrap: { import: "ui", component: "Provider" } } }
    ],
    modules: {
      router: {
        ...router,
        FrameRouter: ({ children }: { children?: ReactNode }) => createElement("nav", null, children)
      },
      ui: { Provider: ({ children }: { children?: ReactNode }) => createElement("main", null, children) }
    },
    pages: {
      list: [{ library: "router", decorator: pageDecorator }],
      modules: { router: async () => router, "./src/routeTree.gen.ts": () => loads.routeTree() },
      hides: ["__TEST_ROUTER__"]
    }
  }

  const guest = createGuest({ components: {}, css: "", decorators })
  const handle = guest.mount(target, [], options)
  mounted.push(handle)

  return { guest, loads }
}

const tree =
  (redirects: Record<string, string> = {}) =>
  async () => ({ routeTree: { redirects } })

describe("a page drawn as a frame", () => {
  it("draws the router made from the app's routes at its URL, in place of the frame's router", async () => {
    const { guest } = mount({ page: true, url: "/pricing" }, tree())

    await guest.loaded?.()

    expect(guest.drawsPages).toBe(true)
    expect(target.querySelector("[data-page]")?.getAttribute("data-page")).toBe("/pricing")
    expect(target.querySelector("nav")).toBeNull()
    expect(target.querySelector("article > main")).not.toBeNull()
  })

  it("says where it landed when its route redirects", async () => {
    const landed: string[] = []

    const { guest } = mount(
      { page: true, url: "/settings", onLanded: (path) => landed.push(path) },
      tree({ "/settings": "/settings/profile" })
    )

    await guest.loaded?.()

    await vi.waitFor(() => expect(landed).toEqual(["/settings", "/settings/profile"]))
  })

  it("loads the route tree once, for every page", async () => {
    const { guest, loads } = mount({ page: true, url: "/" }, tree())

    guest.mount(target.appendChild(document.createElement("div")), [], { page: true, url: "/pricing" })
    await guest.loaded?.()

    expect(loads.routeTree).toHaveBeenCalledTimes(1)
  })

  it("keeps the frame's router on a frame that isn't a page, and never loads the route tree", async () => {
    const { guest, loads } = mount({}, tree())

    await guest.loaded?.()

    expect(target.querySelector("nav > main")).not.toBeNull()
    expect(loads.routeTree).not.toHaveBeenCalled()
  })

  it("hides the router's global while the route tree loads, keeping what a frame's router sets on it meanwhile", async () => {
    // SAFETY: the global is only ever a string or unset, here and in the guest it's hidden by.
    const global = globalThis as { __TEST_ROUTER__?: string }
    global.__TEST_ROUTER__ = "before"
    const seen: (string | undefined)[] = []

    const { guest } = mount({ page: true, url: "/" }, async () => {
      seen.push(global.__TEST_ROUTER__)
      global.__TEST_ROUTER__ = "a frame's router"
      seen.push(global.__TEST_ROUTER__)

      return { routeTree: { redirects: {} } }
    })

    await guest.loaded?.()

    expect(seen).toEqual([undefined, undefined])
    expect(global.__TEST_ROUTER__).toBe("a frame's router")
    delete global.__TEST_ROUTER__
  })

  it("says why when the route tree didn't load", async () => {
    const errors: unknown[] = []

    const { guest } = mount({ page: true, url: "/", onError: (cause) => errors.push(cause) }, async () => ({
      loadError: "Failed to fetch"
    }))

    await guest.loaded?.()

    await vi.waitFor(() => expect(String(errors[0])).toContain("./src/routeTree.gen.ts couldn't load: Failed to fetch"))
  })
})
