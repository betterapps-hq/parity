import { runInNewContext } from "node:vm"
import { describe, expect, it } from "vite-plus/test"
import { appPageModeScript } from "./app-page.ts"

interface Posted {
  parity: string
  height?: number
  path?: string
}

/** Runs the script in a page whose window and document are stand-ins, and returns what it posts and how to resize it. */
function page(name: string) {
  const posted: Posted[] = []
  const listeners = new Map<string, () => void>()
  const observers: (() => void)[] = []
  const listen = (type: string, listener: () => void) => listeners.set(type, listener)

  const root = {
    scrollHeight: 800,
    classList: { add: (added: string) => added },
    setAttribute: (attribute: string) => attribute,
    style: { scrollbarWidth: "" }
  }

  const location = { pathname: "/settings" }

  const history = {
    pushState: (_state: null, _title: string, path: string) => (location.pathname = path),
    replaceState: (_state: null, _title: string, path: string) => (location.pathname = path)
  }

  const window = {
    name,
    innerHeight: 800,
    location,
    history,
    parent: { postMessage: (message: Posted) => posted.push(message) },
    addEventListener: listen
  }

  const document = { documentElement: root, body: { children: [] }, addEventListener: listen }

  class ResizeObserver {
    constructor(changed: () => void) {
      observers.push(changed)
    }

    observe = (node: typeof root) => node
  }

  runInNewContext(appPageModeScript, { window, document, ResizeObserver })

  return {
    posted,
    heights: () => posted.filter((message) => message.parity === "page-height"),
    landings: () => posted.filter((message) => message.parity === "page-landed"),
    root,
    history: window.history,
    use: () => listeners.get("pointerdown")?.(),
    load: () => listeners.get("load")?.(),
    resize: (height: number, inner = window.innerHeight) => {
      root.scrollHeight = height
      window.innerHeight = inner
      listeners.get("resize")?.()
      observers.forEach((changed) => changed())
    }
  }
}

const framed = `parity:${JSON.stringify({ classes: [], attributes: {} })}`

describe("appPageModeScript", () => {
  it("tells the frame's parent how tall the page is once it loads, and again when the page grows", () => {
    const drawn = page(framed)
    drawn.load()
    drawn.resize(1400.5)

    expect(drawn.heights()).toEqual([
      { parity: "page-height", height: 800 },
      { parity: "page-height", height: 1401 }
    ])
  })

  it("tells nothing once the frame is taller than its screen, so a page sized to the window doesn't grow without end", () => {
    const drawn = page(framed)
    drawn.resize(849)
    drawn.resize(898, 849)
    drawn.resize(947, 849)

    expect(drawn.heights()).toEqual([{ parity: "page-height", height: 849 }])
  })

  it("hides the page's scrollbar while the frame is taller than its screen, and gives it back otherwise", () => {
    const drawn = page(framed)
    drawn.resize(898, 849)
    expect(drawn.root.style.scrollbarWidth).toBe("none")

    drawn.resize(800, 600)
    expect(drawn.root.style.scrollbarWidth).toBe("")
  })

  it("tells the frame's parent the path the page opens on, and where the app's router moves it", () => {
    const drawn = page(framed)
    drawn.history.replaceState(null, "", "/settings/profile")

    expect(drawn.landings()).toEqual([
      { parity: "page-landed", path: "/settings" },
      { parity: "page-landed", path: "/settings/profile" }
    ])
  })

  it("stops telling where the page goes once someone uses it", () => {
    const drawn = page(framed)
    drawn.use()
    drawn.history.pushState(null, "", "/settings/billing")

    expect(drawn.landings()).toEqual([{ parity: "page-landed", path: "/settings" }])
  })

  it("tells nothing outside a page's frame", () => {
    const drawn = page("")
    drawn.load()
    drawn.resize(1400)

    expect(drawn.posted).toEqual([])
  })
})
