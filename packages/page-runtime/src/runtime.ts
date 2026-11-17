import { type Checks, createChannel, domPort } from "@parity-app/channel"
import type { PageHydration, PageLocation, PageRouter } from "@parity-app/extension/page"
import {
  type FrameRole,
  isObject,
  isRole,
  maxSheetIds,
  maxSnapshotWait,
  isPortFor,
  isText,
  type PageMethods,
  type PageMode,
  type PageViewport,
  pageDeadlines,
  pageProtocol,
  type ParityMethods,
  passesBack,
  readFrameName,
  readMode,
  readViewport
} from "./protocol.ts"
import { sheetsById, takeSnapshot } from "./snapshot.ts"

/*
 * The page runtime (docs/proposals/route-frames.md, PAR-1260): what runs first in the app's own page when Parity draws
 * a route in a frame. It says hello to Parity's window, takes the port Parity hands back and runs
 * `@parity-app/channel` on it. Over it, Parity sets the page's mode without a reload and moves it with the app's own
 * router, and the page says how tall it is in the mode's window, when it has hydrated, where it moved by itself and
 * that someone used it. Opened anywhere other than a frame Parity named, it does nothing.
 */

/** What the extensions give the runtime, from their page modules (`@parity-app/extension/page`). */
export interface PageRuntimeOptions {
  routers?: readonly PageRouter[]
  hydration?: readonly PageHydration[]
}

/** How long the DOM stays unchanged before a page without a hydration module counts as hydrated, in milliseconds. */
export const quietTime = 150

/** The longest a page waits to go quiet, so a page that animates for ever still counts as hydrated. */
const quietLimit = 5000

/** How long after load a hydration module has to say the app committed, before the runtime waits for quiet instead. */
const hydrationLimit = 10_000

/** The longest `route.go` waits for the new page's two paints once the router has landed. */
const paintLimit = 250

/** How often `page.used` is sent at most while someone uses the page. */
const usedInterval = 1000

/**
 * Starts the runtime in `page`, the app's own window, when Parity named its frame: installs the hydration modules,
 * applies the mode the frame opened in, hides the scrollbar and says hello to Parity. Returns what stops it, or nothing
 * when the window isn't Parity's frame or the runtime already runs in it.
 */
declare global {
  /** What the frame is for, which an app can read to hold back what it doesn't want run on Parity's behalf. */
  var parityFrame: { role: FrameRole } | undefined
}

export function startPageRuntime(options: PageRuntimeOptions = {}, page: Window = window): (() => void) | undefined {
  const name = readFrameName(page.name)

  if (!name || "parityFrame" in page) {
    return undefined
  }

  const routers = options.routers ?? []
  const hydration = options.hydration ?? []

  // Before the app's code runs, so React's hook is there when React loads.
  for (const module of hydration) {
    module.install()
  }

  let role: FrameRole = name.role ?? "live"
  Object.assign(page, { parityFrame: { role } })

  const document = page.document
  const root = document.documentElement
  const stopped = new AbortController()
  const { signal } = stopped
  const cleanups: (() => void)[] = []

  // A scrollbar takes width from the page's layout, so the page lays out at the mode's whole width.
  root.style.setProperty("scrollbar-width", "none")

  const modes = modeApplier(page)
  let viewport: PageViewport | undefined = name.viewport

  if (name.mode) {
    modes.apply(name.mode)
  }

  // The path Parity asked the frame for: where it loaded, then each `route.go`'s. A page elsewhere was sent there.
  let asked = page.location.pathname
  // While Parity moves the page, the router's own moves are its answer, not `page.moved`.
  let going = 0

  const channel = createChannel<PageMethods, ParityMethods>({ checks: pageChecks() })
  // The sheets the page's snapshots read, by hash, which `sheets.get` answers from.
  const sheets = new Map<string, string>()

  const tell = <M extends keyof ParityMethods>(method: M, params: ParityMethods[M]["params"]) => {
    channel.request(method, params).catch(() => undefined)
  }

  const located = (location: PageLocation): PageLocation =>
    location.outcome === "landed" && trimmed(location.path) !== trimmed(asked)
      ? { ...location, outcome: "redirected" }
      : location

  let told = 0

  // The page's height, in the mode's window only: once Parity grows the frame to the page, whatever is sized to the
  // window grows with it, so a page with a section as tall as the window would grow without end.
  const measure = () => {
    if (viewport && Math.abs(page.innerHeight - viewport.height) > 1) {
      return
    }

    const height = Math.ceil(root.scrollHeight)

    if (height <= 0 || height === told) {
      return
    }

    told = height
    tell("page.height", { height })
  }

  const sizes = new ResizeObserver(measure)
  sizes.observe(root)
  cleanups.push(() => sizes.disconnect())

  const observeBody = () => {
    if (!document.body) {
      return
    }

    sizes.observe(document.body)

    for (const child of document.body.children) {
      sizes.observe(child)
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", observeBody, { signal })
  } else {
    observeBody()
  }

  page.addEventListener("load", measure, { signal })
  page.addEventListener("resize", measure, { signal })

  let lastUsed = 0

  const used = () => {
    const now = Date.now()

    if (now - lastUsed < usedInterval) {
      return
    }

    lastUsed = now
    tell("page.used", {})
  }

  page.addEventListener("pointerdown", used, { capture: true, signal })
  page.addEventListener("keydown", used, { capture: true, signal })

  // The live page's own scrolling moves its live window down its board.
  page.addEventListener(
    "scroll",
    () => {
      if (role === "live") {
        tell("page.scrolled", { top: page.scrollY })
      }
    },
    { passive: true, signal }
  )

  // A pinch, or the wheel with Ctrl or Cmd, is the canvas's zoom, once the page has had its turn: in the bubbling phase,
  // and only when the page didn't take it. The page never zooms itself.
  page.addEventListener(
    "wheel",
    (event) => {
      if (!event.ctrlKey && !event.metaKey) {
        return
      }

      const taken = event.defaultPrevented
      event.preventDefault()

      if (!taken) {
        tell("page.zoom", { deltaY: event.deltaY, x: event.clientX, y: event.clientY })
      }
    },
    { passive: false, signal }
  )

  // Escape and Parity's shortcuts go back to Parity when the page didn't handle them.
  page.addEventListener(
    "keydown",
    (event) => {
      // A keydown made by script may carry no key.
      if (!isText(event.key)) {
        return
      }

      const key = { key: event.key, ctrl: event.ctrlKey, meta: event.metaKey, shift: event.shiftKey, alt: event.altKey }

      if (!event.defaultPrevented && !event.isComposing && passesBack(key)) {
        tell("page.key", key)
      }
    },
    { signal }
  )

  const ready = hydrated(page, hydration, signal).then(() => routers.find((router) => isFound(router)))

  channel.serve({
    "mode.set": ({ mode, viewport: window }) => {
      modes.apply(mode)
      viewport = window
      told = 0
      measure()

      return null
    },
    "route.go": async ({ to }) => {
      const router = await ready

      if (!router) {
        throw new Error("The page has no router that can move it")
      }

      going++
      asked = new URL(to, page.location.href).pathname

      try {
        const location = await router.navigate(
          to,
          AbortSignal.any([signal, AbortSignal.timeout(pageDeadlines["route.go"])])
        )

        await paints(page, 2, paintLimit)

        return located(location)
      } finally {
        going--
      }
    },
    "page.scroll": ({ top }) => {
      page.scrollTo(0, top)

      return null
    },
    "snapshot.take": async ({ quiet: wait }) => {
      const router = await ready

      if (wait) {
        await quietFor(page, wait.ms, wait.max, signal)
      }

      return takeSnapshot(page, {
        mode: modes.current(),
        viewport: viewport ?? { width: page.innerWidth, height: page.innerHeight },
        location: located(router?.location() ?? windowLocation(page)),
        sheets
      })
    },
    "sheets.get": ({ ids }) => sheetsById(sheets, ids),
    "role.set": ({ role: next }) => {
      role = next
      Object.assign(page, { parityFrame: { role } })

      return null
    }
  })

  void ready.then((router) => {
    if (signal.aborted) {
      return
    }

    tell("page.ready", { location: located(router?.location() ?? windowLocation(page)), router: router?.id ?? null })

    const moved = (location: PageLocation) => {
      if (going === 0) {
        tell("page.moved", { location: located(location) })
      }
    }

    cleanups.push(router ? router.watch(moved) : historyMoves(page, moved))
  })

  // The hello goes to Parity's origin only, and the port it answers with is taken only from there.
  page.addEventListener(
    "message",
    (event) => {
      const port = event.ports[0]

      if (event.source === page.parent && event.origin === name.parent && isPortFor(event.data, name.frame) && port) {
        channel.connect(domPort(port))
      }
    },
    { signal }
  )

  if (page.parent !== page) {
    try {
      page.parent.postMessage({ parity: "hello", protocol: pageProtocol, frame: name.frame }, name.parent)
    } catch {
      // Not an origin a page can post to: there's no Parity to talk to.
    }
  }

  return () => {
    stopped.abort()

    for (const cleanup of cleanups.splice(0)) {
      cleanup()
    }

    modes.restore()
    channel.close(new Error("The page runtime stopped"))
  }
}

/** What reads Parity's requests' params, as they come from another origin. */
function pageChecks(): Checks<PageMethods> {
  return {
    "mode.set": (params) => {
      const mode = isObject(params) && "mode" in params ? readMode(params.mode) : undefined
      const viewport = isObject(params) && "viewport" in params ? readViewport(params.viewport) : undefined

      if (!mode || !viewport) {
        throw new Error("mode.set needs a mode and its viewport")
      }

      return { mode, viewport }
    },
    "route.go": (params) => {
      const to = isObject(params) && "to" in params ? params.to : undefined

      if (!isText(to) || !to.startsWith("/")) {
        throw new Error("route.go needs a path on the page's own origin")
      }

      return { to }
    },
    "page.scroll": (params) => {
      const top = isObject(params) && "top" in params ? params.top : undefined

      if (!Number.isFinite(top)) {
        throw new Error("page.scroll needs a number")
      }

      return { top: Number(top) }
    },
    "snapshot.take": (params) => {
      const quiet = isObject(params) && "quiet" in params ? params.quiet : undefined

      if (quiet === undefined) {
        return {}
      }

      const ms = isObject(quiet) && "ms" in quiet ? quiet.ms : undefined
      const max = isObject(quiet) && "max" in quiet ? quiet.max : undefined

      if (!isWait(ms) || !isWait(max)) {
        throw new Error(`snapshot.take waits for quiet from 0 to ${maxSnapshotWait} ms`)
      }

      return { quiet: { ms, max } }
    },
    "sheets.get": (params) => {
      const ids = isObject(params) && "ids" in params ? params.ids : undefined

      if (!Array.isArray(ids) || ids.length > maxSheetIds || !ids.every(isText)) {
        throw new Error(`sheets.get takes at most ${maxSheetIds} ids`)
      }

      return { ids }
    },
    "role.set": (params) => {
      const role = isObject(params) && "role" in params ? params.role : undefined

      if (!isRole(role)) {
        throw new Error("role.set needs a frame's role")
      }

      return { role }
    }
  }
}

function isWait(value: unknown): value is number {
  return Number.isFinite(value) && Number(value) >= 0 && Number(value) <= maxSnapshotWait
}

/**
 * Puts a mode on `<html>`: its classes and attributes, taking off the last mode's, and its color scheme, which
 * `prefers-color-scheme` answers with too, telling the queries the app made when the answer changes.
 */
function modeApplier(page: Window) {
  const root = page.document.documentElement
  let applied: PageMode = { classes: [], attributes: {} }
  const original = page.matchMedia.bind(page)
  const queries = new Set<MediaQueryList>()

  // The browser's own list for the query, answering with the mode's scheme while the mode has one.
  page.matchMedia = (query: string) => {
    const list = original(query)
    const asked = /prefers-color-scheme:\s*(dark|light)/.exec(query)

    if (!asked) {
      return list
    }

    Object.defineProperty(list, "matches", {
      configurable: true,
      get: () => (applied.scheme === undefined ? original(query).matches : applied.scheme === asked[1])
    })

    queries.add(list)

    return list
  }

  return {
    apply(mode: PageMode) {
      const before = new Map([...queries].map((list) => [list, list.matches]))

      for (const name of applied.classes) {
        if (!mode.classes.includes(name)) {
          root.classList.remove(name)
        }
      }

      for (const name of Object.keys(applied.attributes)) {
        if (!(name in mode.attributes)) {
          root.removeAttribute(name)
        }
      }

      for (const name of mode.classes) {
        root.classList.add(name)
      }

      for (const [name, value] of Object.entries(mode.attributes)) {
        root.setAttribute(name, value)
      }

      root.style.colorScheme = mode.scheme ?? ""
      applied = mode

      for (const [list, matched] of before) {
        if (list.matches !== matched) {
          list.dispatchEvent(new MediaQueryListEvent("change", { matches: list.matches, media: list.media }))
        }
      }
    },
    current: () => applied,
    restore() {
      page.matchMedia = original
    }
  }
}

/**
 * Resolves once the app has hydrated: when a hydration module says its first render committed, or, with none, once
 * the page has loaded and its DOM has been quiet for `quietTime`. A module that hasn't said so within
 * `hydrationLimit` of load gives way to waiting for quiet.
 */
async function hydrated(page: Window, hydration: readonly PageHydration[], signal: AbortSignal): Promise<void> {
  if (hydration.length === 0) {
    await quiet(page, signal)

    return
  }

  const said = Promise.any(hydration.map((module) => module.hydrated(signal)))

  const late = loaded(page).then(async () => {
    await delay(page, hydrationLimit, signal)
    await quiet(page, signal)
  })

  await Promise.race([said, late]).catch(() => quiet(page, signal))
}

/** Resolves once the page has loaded and its DOM hasn't changed for `quietTime`, waiting at most `quietLimit`. */
function quiet(page: Window, signal: AbortSignal): Promise<void> {
  return quietFor(page, quietTime, quietLimit, signal)
}

/** Resolves once the page has loaded and its DOM hasn't changed for `ms`, waiting at most `max`. */
async function quietFor(page: Window, ms: number, max: number, signal: AbortSignal): Promise<void> {
  await loaded(page)

  return new Promise((resolve) => {
    let timer = 0

    const done = () => {
      observer.disconnect()
      page.clearTimeout(timer)
      page.clearTimeout(limit)
      resolve()
    }

    const observer = new MutationObserver(() => {
      page.clearTimeout(timer)
      timer = page.setTimeout(done, ms)
    })

    observer.observe(page.document, { subtree: true, childList: true, attributes: true, characterData: true })
    timer = page.setTimeout(done, ms)
    const limit = page.setTimeout(done, max)
    signal.addEventListener("abort", done, { once: true })
  })
}

/** Resolves once the page's `load` has fired. */
function loaded(page: Window): Promise<void> {
  return page.document.readyState === "complete"
    ? Promise.resolve()
    : new Promise((resolve) => page.addEventListener("load", () => resolve(), { once: true }))
}

function delay(page: Window, ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = page.setTimeout(resolve, ms)
    signal.addEventListener("abort", () => page.clearTimeout(timer), { once: true })
  })
}

/** Resolves after `count` animation frames, or after `limit` ms, as a hidden page runs none. */
function paints(page: Window, count: number, limit: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = page.setTimeout(resolve, limit)

    const frame = (left: number) => {
      if (left === 0) {
        page.clearTimeout(timer)
        resolve()

        return
      }

      page.requestAnimationFrame(() => frame(left - 1))
    }

    frame(count)
  })
}

/** Whether a router is the app's, reading a router that throws as not. */
function isFound(router: PageRouter): boolean {
  try {
    return router.found()
  } catch {
    return false
  }
}

/** Where the page is by its address, for a page without a router that can say. */
function windowLocation(page: Window): PageLocation {
  const { pathname, search, hash } = page.location

  return { path: pathname, search, hash, outcome: "landed" }
}

/**
 * Calls `moved` whenever the page's address changes by `history` or the back button, for a page without a router that
 * can say. Returns what stops it.
 */
function historyMoves(page: Window, moved: (location: PageLocation) => void): () => void {
  const { history } = page
  const push = history.pushState.bind(history)
  const replace = history.replaceState.bind(history)
  let last = page.location.href

  const check = () => {
    if (page.location.href !== last) {
      last = page.location.href
      moved(windowLocation(page))
    }
  }

  history.pushState = (...args) => {
    push(...args)
    check()
  }

  history.replaceState = (...args) => {
    replace(...args)
    check()
  }

  page.addEventListener("popstate", check)

  return () => {
    history.pushState = push
    history.replaceState = replace
    page.removeEventListener("popstate", check)
  }
}

/** A path without its trailing slashes, so `/a/` and `/a` are one place. */
function trimmed(path: string): string {
  return path.length > 1 ? path.replace(/\/+$/, "") : path
}
