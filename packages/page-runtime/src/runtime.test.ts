// @vitest-environment happy-dom
import { createChannel, domPort } from "@parity-app/channel"
import type { PageHydration, PageLocation, PageRouter } from "@parity-app/extension/page"
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"
import {
  frameName,
  type PageHello,
  type PageMethods,
  type ParityMethods,
  pageProtocol,
  passesBack
} from "./protocol.ts"
import { startPageRuntime } from "./runtime.ts"

const parent = "parity://app"
const desktop = { width: 1280, height: 800 }

/** What Parity heard from the page, by method. */
interface Heard {
  ready: ParityMethods["page.ready"]["params"][]
  moved: PageLocation[]
  heights: number[]
  used: number
  scrolled: number[]
  zooms: ParityMethods["page.zoom"]["params"][]
  keys: string[]
}

let stop: (() => void) | undefined
let posted: { message: PageHello; origin: string }[]

beforeEach(() => {
  posted = []
  Reflect.deleteProperty(window, "parityFrame")
  document.documentElement.className = ""
  document.documentElement.removeAttribute("style")
  document.body.innerHTML = "<main>Pricing</main>"
  window.history.replaceState(null, "", "/pricing")
  // The page is in Parity's frame: its parent is Parity's window, which hears its hello.
  Object.defineProperty(window, "parent", {
    configurable: true,
    value: { postMessage: (message: PageHello, origin: string) => posted.push({ message, origin }) }
  })
})

afterEach(() => {
  stop?.()
  stop = undefined
  window.name = ""
  Reflect.deleteProperty(window, "parent")
  vi.useRealTimers()
})

/** Starts the runtime in a frame Parity named, and connects Parity's end of the channel the way Parity's window does. */
function framed(
  options: Parameters<typeof startPageRuntime>[0] = {},
  name: Partial<Parameters<typeof frameName>[0]> = {}
) {
  window.name = frameName({ protocol: pageProtocol, frame: "f1", parent, viewport: desktop, ...name })
  stop = startPageRuntime(options)
  const heard: Heard = { ready: [], moved: [], heights: [], used: 0, scrolled: [], zooms: [], keys: [] }

  const parity = createChannel<ParityMethods, PageMethods>({
    handlers: {
      "page.ready": (params) => {
        heard.ready.push(params)

        return null
      },
      "page.moved": ({ location }) => {
        heard.moved.push(location)

        return null
      },
      "page.height": ({ height }) => {
        heard.heights.push(height)

        return null
      },
      "page.used": () => {
        heard.used++

        return null
      },
      "page.scrolled": ({ top }) => {
        heard.scrolled.push(top)

        return null
      },
      "page.zoom": (params) => {
        heard.zooms.push(params)

        return null
      },
      "page.key": ({ key, ctrl }) => {
        heard.keys.push(ctrl ? `Ctrl+${key}` : key)

        return null
      }
    }
  })

  const { port1, port2 } = new MessageChannel()
  parity.connect(domPort(port1))
  window.dispatchEvent(
    new MessageEvent("message", {
      data: { parity: "port", frame: "f1" },
      origin: parent,
      source: window.parent,
      ports: [port2]
    })
  )

  return { parity, heard }
}

/** A router for a page whose app moves by itself, as a page router reads one. */
function testRouter(found = true): PageRouter & { move(path: string): void } {
  let path = window.location.pathname
  const watchers = new Set<(location: PageLocation) => void>()
  const location = (): PageLocation => ({ path, search: "", hash: "", outcome: "landed" })

  return {
    id: "test-router",
    found: () => found,
    location,
    async navigate(to) {
      path = to === "/old" ? "/new" : to

      for (const watcher of watchers) {
        watcher(location())
      }

      return location()
    },
    watch(moved) {
      watchers.add(moved)

      return () => watchers.delete(moved)
    },
    move(to) {
      path = to

      for (const watcher of watchers) {
        watcher(location())
      }
    }
  }
}

/** A hydration module that commits when the test says so. */
function testHydration(): PageHydration & { commit(): void; installed: number } {
  const { promise: committed, resolve: commit } = Promise.withResolvers<void>()

  return {
    installed: 0,
    install() {
      this.installed++
    },
    hydrated: () => committed,
    commit: () => commit()
  }
}

async function until(check: () => boolean): Promise<void> {
  await vi.waitFor(() => expect(check()).toBe(true), { timeout: 2000, interval: 10 })
}

describe("startPageRuntime", () => {
  it("does nothing in a window Parity didn't name", () => {
    window.name = "checkout"

    expect(startPageRuntime()).toBeUndefined()
    expect(posted).toEqual([])
    expect("parityFrame" in window).toBe(false)
  })

  it("says hello to Parity's origin alone, with its frame's id", () => {
    framed()

    expect(posted).toEqual([{ message: { parity: "hello", protocol: pageProtocol, frame: "f1" }, origin: parent }])
    expect(window.parityFrame).toEqual({ role: "live" })
  })

  it("refuses a frame named in another version of the protocol", () => {
    window.name = `parity:${JSON.stringify({ protocol: 2, frame: "f1", parent })}`

    expect(startPageRuntime()).toBeUndefined()
    expect(posted).toEqual([])
  })

  it("takes a port only from Parity's origin", async () => {
    window.name = frameName({ protocol: pageProtocol, frame: "f1", parent })
    stop = startPageRuntime()
    const { port1, port2 } = new MessageChannel()
    const elsewhere = createChannel<ParityMethods, PageMethods>({})
    elsewhere.connect(domPort(port1))
    window.dispatchEvent(
      new MessageEvent("message", {
        data: { parity: "port", frame: "f1" },
        origin: "http://evil.localhost",
        source: window.parent,
        ports: [port2]
      })
    )

    await expect(
      Promise.race([
        elsewhere.request("page.scroll", { top: 0 }),
        new Promise((resolve) => setTimeout(() => resolve("unanswered"), 100))
      ])
    ).resolves.toBe("unanswered")
  })

  it("hides the scrollbar, so the page lays out at the mode's whole width", () => {
    framed()

    expect(document.documentElement.style.getPropertyValue("scrollbar-width")).toBe("none")
  })

  it("opens in the mode its frame's name gives, and changes mode without a reload", async () => {
    const { parity } = framed(
      {},
      { mode: { classes: ["dark", "compact"], attributes: { "data-brand": "acme" }, scheme: "dark" } }
    )

    const root = document.documentElement

    expect([...root.classList]).toEqual(["dark", "compact"])
    expect(root.getAttribute("data-brand")).toBe("acme")
    expect(root.style.colorScheme).toBe("dark")

    const query = window.matchMedia("(prefers-color-scheme: dark)")
    const changes: boolean[] = []
    query.addEventListener("change", (event) => changes.push(event.matches))

    expect(query.matches).toBe(true)

    await parity.request("mode.set", {
      mode: { classes: ["light"], attributes: {}, scheme: "light" },
      viewport: desktop
    })

    expect([...root.classList]).toEqual(["light"])
    expect(root.hasAttribute("data-brand")).toBe(false)
    expect(root.style.colorScheme).toBe("light")
    expect(query.matches).toBe(false)
    expect(changes).toEqual([false])
  })

  it("refuses a mode.set it can't read", async () => {
    const { parity } = framed()

    // @ts-expect-error -- what another origin might send
    await expect(parity.request("mode.set", { mode: { classes: "dark" } })).rejects.toThrow("mode and its viewport")
  })

  it("says how tall the page is while its window is the mode's, and not once it's grown", async () => {
    vi.spyOn(document.documentElement, "scrollHeight", "get").mockReturnValue(2400.4)
    Object.defineProperty(window, "innerHeight", { configurable: true, value: desktop.height })
    const { heard } = framed()
    window.dispatchEvent(new Event("resize"))

    await until(() => heard.heights.length > 0)

    expect(heard.heights).toEqual([2401])

    // Grown to the page, the frame's window is the page's height: what's sized to the window would grow with it.
    vi.spyOn(document.documentElement, "scrollHeight", "get").mockReturnValue(4000)
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 2401 })
    window.dispatchEvent(new Event("resize"))
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(heard.heights).toEqual([2401])
    Reflect.deleteProperty(window, "innerHeight")
  })

  it("is ready once a page without a hydration module has loaded and gone quiet, without a router", async () => {
    const { heard } = framed()

    await until(() => heard.ready.length > 0)

    expect(heard.ready).toEqual([
      { location: { path: "/pricing", search: "", hash: "", outcome: "landed" }, router: null }
    ])
  })

  it("installs hydration modules at once, and is ready when one says the app committed", async () => {
    const hydration = testHydration()
    const { heard } = framed({ hydration: [hydration], routers: [testRouter()] })

    expect(hydration.installed).toBe(1)
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(heard.ready).toEqual([])

    hydration.commit()
    await until(() => heard.ready.length > 0)

    expect(heard.ready[0]?.router).toBe("test-router")
  })

  it("passes over a router that isn't the app's", async () => {
    const { heard } = framed({ routers: [testRouter(false)] })

    await until(() => heard.ready.length > 0)

    expect(heard.ready[0]?.router).toBeNull()
  })

  it("moves the app with its router, says where it ended, and keeps that from page.moved", async () => {
    const router = testRouter()
    const { parity, heard } = framed({ routers: [router] })
    await until(() => heard.ready.length > 0)

    await expect(parity.request("route.go", { to: "/settings" })).resolves.toEqual({
      path: "/settings",
      search: "",
      hash: "",
      outcome: "landed"
    })
    await expect(parity.request("route.go", { to: "/old" })).resolves.toMatchObject({
      path: "/new",
      outcome: "redirected"
    })
    expect(heard.moved).toEqual([])

    router.move("/billing")
    await until(() => heard.moved.length > 0)

    expect(heard.moved).toEqual([{ path: "/billing", search: "", hash: "", outcome: "redirected" }])
  })

  it("refuses route.go on a page without a router", async () => {
    const { parity } = framed()

    await expect(parity.request("route.go", { to: "/settings" })).rejects.toThrow("no router")
  })

  it("says where a page without a router moved, by its address", async () => {
    const { heard } = framed()
    await until(() => heard.ready.length > 0)

    window.history.pushState(null, "", "/login")
    await until(() => heard.moved.length > 0)

    expect(heard.moved).toEqual([{ path: "/login", search: "", hash: "", outcome: "redirected" }])
  })

  it("says the page was used at most once a second", async () => {
    const { heard } = framed()

    window.dispatchEvent(new Event("pointerdown"))
    window.dispatchEvent(new Event("keydown"))
    window.dispatchEvent(new Event("pointerdown"))
    await until(() => heard.used > 0)
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(heard.used).toBe(1)
  })

  it("says when the live page scrolls itself, and not while it's a spare", async () => {
    const { parity, heard } = framed({}, { role: "spare" })
    Object.defineProperty(window, "scrollY", { configurable: true, value: 300 })

    window.dispatchEvent(new Event("scroll"))
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(heard.scrolled).toEqual([])

    await parity.request("role.set", { role: "live" })
    expect(window.parityFrame).toEqual({ role: "live" })
    window.dispatchEvent(new Event("scroll"))
    await until(() => heard.scrolled.length > 0)

    expect(heard.scrolled).toEqual([300])
    Reflect.deleteProperty(window, "scrollY")
  })

  it("passes back the zoom wheel the page didn't take, and stops the page zooming", async () => {
    const { heard } = framed()
    const taken = (event: WheelEvent) => event.deltaY > 0 && event.preventDefault()
    document.body.addEventListener("wheel", taken)

    // happy-dom's WheelEvent takes no modifiers or point, which Chromium's does.
    const wheel = (init: WheelEventInit) =>
      Object.defineProperties(new WheelEvent("wheel", { ...init, cancelable: true }), {
        ctrlKey: { value: init.ctrlKey ?? false },
        clientX: { value: init.clientX ?? 0 },
        clientY: { value: init.clientY ?? 0 }
      })

    const zoom = wheel({ ctrlKey: true, deltaY: -40, clientX: 10, clientY: 20 })
    document.body.dispatchEvent(wheel({ deltaY: -40, bubbles: true }))
    document.body.dispatchEvent(wheel({ ctrlKey: true, deltaY: 40, bubbles: true }))
    window.dispatchEvent(zoom)
    await until(() => heard.zooms.length > 0)
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(heard.zooms).toEqual([{ deltaY: -40, x: 10, y: 20 }])
    expect(zoom.defaultPrevented).toBe(true)
    document.body.removeEventListener("wheel", taken)
  })

  it("passes back Escape and shortcuts the page didn't handle, and keeps text keys", async () => {
    const { heard } = framed()
    const handled = (event: KeyboardEvent) => event.key === "k" && event.preventDefault()
    document.body.addEventListener("keydown", handled)

    for (const init of [
      { key: "Escape" },
      { key: "k", ctrlKey: true },
      { key: "c", ctrlKey: true },
      { key: "d", ctrlKey: true },
      { key: "d" }
    ]) {
      document.body.dispatchEvent(new KeyboardEvent("keydown", { ...init, bubbles: true, cancelable: true }))
    }

    await until(() => heard.keys.length >= 2)
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(heard.keys).toEqual(["Escape", "Ctrl+d"])
    document.body.removeEventListener("keydown", handled)
  })
})

describe("passesBack", () => {
  const key = (name: string, ctrl = false, meta = false) => ({ key: name, ctrl, meta, shift: false, alt: false })

  it("passes back Escape and Ctrl or Cmd shortcuts, but not keys that edit or move through text", () => {
    expect(passesBack(key("Escape"))).toBe(true)
    expect(passesBack(key("k", true))).toBe(true)
    expect(passesBack(key("K", false, true))).toBe(true)
    expect(passesBack(key("C", true))).toBe(false)
    expect(passesBack(key("ArrowLeft", true))).toBe(false)
    expect(passesBack(key("k"))).toBe(false)
  })
})
