import { type Channel, createChannel, domPort } from "@parity-app/channel"
import { pageFrameUrl } from "@parity-app/editor"
import {
  type LiveChoice,
  type LiveFrom,
  liveExpired,
  liveWindowTop,
  type PageLocation,
  type PageMode,
  parkedScale,
  pickLive,
  planPool,
  type PoolFrame,
  refillAfter,
  spareLimit,
  updatesItself,
  usedPause,
  warmAfter
} from "@parity-app/frames"
import {
  type FrameRole,
  frameName,
  type PageKey,
  type PageMethods,
  type PageViewport,
  pageDeadlines,
  pageProtocol,
  type ParityMethods,
  readHello
} from "@parity-app/page-runtime/protocol"
import { useEffect, useRef } from "react"
import type { Editor } from "tldraw"
import { z } from "zod"
import { getPreferences, subscribePreferences } from "../chrome/preferences.ts"
import { isNode, onEachWindow, openLensWindows, postAs } from "../lens-windows.ts"
import { track } from "../report-error.ts"
import { resetWithWindow, useStore, windowStore } from "../store.ts"
import { holdFreezer } from "./freezer.ts"
import { onPageFiles, showTokenPreview } from "./page-changes.ts"
import { parityChecks } from "./page-channel.ts"
import { onPageProcess, pageProcessOpen } from "./page-process.ts"

/*
 * Live route boards from a pool of spare frames (docs/proposals/route-frames.md, "Input on a live board", "Going live"
 * and "The pool", PAR-1263). With the Interact tool, each project keeps spare frames in a focused window, as many as
 * Settings' Spare route frames asks for (`spareCount`, PAR-1303): the app's own page in an iframe on the builder's
 * origin, parked in view at 1% so Chromium keeps laying it out, and moved by the app's router to the routes in view. Resting the pointer on a board sends a spare to its route; pressing it takes the quickest
 * frame and puts it over the board, engaged, so the page takes the pointer and keys. A press outside, Escape the page
 * didn't handle, or leaving Interact disengages it, and focus comes back to Parity's document. Live ends when another
 * board goes live or the board has been out of view for 10 s, and the frame is closed, never reused. When the
 * project's page process fails, live ends and every frame closes; the pool fills again after the pause
 * (`page-process.ts`), and while it waits, or once Parity stops trying, boards keep their copies.
 */

const memoryReport = z.object({ deviceMemory: z.number() })

/**
 * The machine's memory in GB, rounded, as Chromium tells it (`navigator.deviceMemory`), or nothing where it doesn't:
 * what caps the spares on a machine short of memory.
 */
function deviceMemory(): number | undefined {
  return memoryReport.safeParse(globalThis.navigator).data?.deviceMemory
}

/** The spares each project keeps per focused window while the Interact tool is on, from Settings and the memory. */
function spareCount(): number {
  return spareLimit(getPreferences().routeFrameSpares, deviceMemory())
}

/** How long a new frame has to load and hydrate before it counts as stuck: a route's first visit compiles. */
const loadDeadline = 60_000

/** A route board, as the pool sees it. */
export interface LiveBoard {
  /** The board's frame, unique in the window. */
  id: string
  project: string
  /** The URL its page draws at, on the builder's port. */
  url: string
  /** The page's design, by key. */
  design: string
  mode: PageMode
  viewport: PageViewport
  /** The board's own scale on the canvas. */
  scale: number
  /** The board's frame on screen, which the live frame is placed over. */
  element: () => HTMLElement | null
  /** How tall the board draws its page, in the page's CSS pixels. */
  pageHeight: () => number
  /** How near the view the board is, lowest first (`useFrameView`'s `rank`). */
  rank: () => number
}

/** What a board shows of the live frame. */
export interface LiveState {
  /** The board that holds the live frame. */
  board: string
  /** Whether the page has the pointer and keys. */
  engaged: boolean
  /** Where the live page is, once it has said. */
  location?: PageLocation
  /** Where the live page tried to go off the builder's origin, which main stopped. */
  stopped?: string
}

/** What a board knows of the pool: the live frame when it holds it, and whether a spare waits on it. */
export interface LiveBoardState {
  live: LiveState | undefined
  ready: boolean
}

/** Each project's live frame, by project. */
const liveStates = windowStore<ReadonlyMap<string, LiveState>>(() => new Map())

/** The board each project has a spare waiting on, sent there when the pointer rested on it, by project. */
const readyBoards = windowStore<ReadonlyMap<string, string>>(() => new Map())

/** Where a canvas puts live and spare frames: a layer in its page space, and the editor whose camera it follows. */
export interface LiveLayer {
  element: HTMLElement
  editor: Editor
}

const pools = new Map<string, Pool>()

resetWithWindow(() => {
  for (const pool of pools.values()) {
    pool.dispose()
  }

  pools.clear()
})

/** A project's pool, made when it's first asked for. */
export function poolFor(project: string): Pool {
  let pool = pools.get(project)

  if (!pool) {
    pool = new Pool(project)
    pools.set(project, pool)
  }

  return pool
}

/**
 * A route board's part in the live frame: it's known to its project's pool while it's on the canvas, so spares wait
 * on the routes in view, and it says whether it holds the live frame, engaged or not, or has a spare waiting on it.
 */
export function useLiveBoard(board: LiveBoard): LiveBoardState {
  const latest = useRef(board)
  const pool = poolFor(board.project)

  useEffect(() => {
    latest.current = board
  })

  useEffect(() => {
    const known = latest.current
    pool.add(board.id, () => latest.current)

    return () => pool.remove(known.id)
  }, [pool, board.id])

  // A live board whose mode or window changes has its live page follow, as its copy does.
  const drawn = JSON.stringify([board.mode, board.viewport])

  useEffect(() => {
    pool.redraw(latest.current.id)
  }, [pool, drawn])

  // A board sent to another URL, as a param set in Props does, leaves its live page and any spare warming on it behind.
  const first = useRef(board.url)

  useEffect(() => {
    if (first.current !== board.url) {
      first.current = board.url
      pool.retarget(latest.current.id)
    }
  }, [pool, board.url])

  const live = useStore(liveStates).get(board.project)
  const ready = useStore(readyBoards).get(board.project) === board.id

  return { live: live?.board === board.id ? live : undefined, ready }
}

/** A frame of the pool: a spare, the one warming, or the live one. */
interface Frame {
  id: string
  iframe: HTMLIFrameElement
  channel: Channel<ParityMethods, PageMethods>
  origin: string
  state: "loading" | "ready"
  /** The route it was loaded at or sent to, its path and query; where it landed, after a redirect, is `location`. */
  route: string
  /** The page router that can move it, once it has said; none without one. */
  router: string | null | undefined
  ready: PromiseWithResolvers<void>
  viewport: PageViewport
  location?: PageLocation
  /** Busy being moved, so the pool's plan leaves it be. */
  busy: boolean
  /** The move it's making with the app's router, which going live waits for, and fails with when the move does. */
  moving?: Promise<void>
}

/** Fails a request that takes longer than `ms`, which `@parity-app/channel` leaves to the caller. */
function withDeadline<T>(request: Promise<T>, ms: number): Promise<T> {
  let timer = 0

  return Promise.race([
    request,
    new Promise<never>((_, reject) => {
      timer = window.setTimeout(() => reject(new Error(`No answer in ${ms} ms`)), ms)
    })
  ]).finally(() => window.clearTimeout(timer))
}

/** Whether the main window or a lens's own has the focus. */
function anyWindowFocused(): boolean {
  return [window, ...openLensWindows()].some((each) => each.document.hasFocus())
}

/** A URL's route, as the pool keeps it: its path and query. */
export function routeOf(url: string): string {
  const { pathname, search } = new URL(url)

  return pathname + search
}

/** One project's pool in this window: its spares, the one warming, the live frame, and the boards it serves. */
export class Pool {
  private readonly project: string
  private readonly boards = new Map<string, () => LiveBoard>()
  private readonly spares = new Map<string, Frame>()
  /** Frames on their way to going live, taken from the spares or new, until they're live. */
  private readonly pendingFrames = new Map<string, Frame>()
  private layer: LiveLayer | undefined
  private interacting = false
  private focused = typeof document === "undefined" ? true : document.hasFocus()
  /** Whether the app has a page router; assumed until a page says otherwise. */
  private movable = true
  private warming: { frame: Frame; board: string } | undefined
  private live: { frame: Frame; board: string; engaged: boolean; top: number; outSince?: number } | undefined
  /** The press on its way to going live: its board, and a token of its own, so a later press on the same board wins. */
  private going: { board: string; token: number } | undefined
  private presses = 0
  private hoverTimer = 0
  private refillTimer = 0
  private planTimer = 0
  private frameLoop = 0
  /** The project's previewed token values as a page's CSS, which each frame is shown when it connects (PAR-1264). */
  private preview = ""
  /** Frames on their way to going live when the app's files changed, which reload once they're live (PAR-1264). */
  private readonly outdated = new WeakSet<Frame>()
  private readonly stopListening: () => void

  constructor(project: string) {
    this.project = project

    const hello = (event: MessageEvent) => this.hello(event)
    const pressed = (event: PointerEvent) => this.pressedOutside(event)
    const focus = () => this.focusChanged()

    // In each window the canvas may be in, the main one or a lens's own: a frame says hello to the window it's in.
    const stopWindows = onEachWindow((target) => {
      target.addEventListener("message", hello)
      // In the capture phase, before the board under it engages again.
      target.addEventListener("pointerdown", pressed, true)
      target.addEventListener("focus", focus)
      target.addEventListener("blur", focus)

      return () => {
        target.removeEventListener("message", hello)
        target.removeEventListener("pointerdown", pressed, true)
        target.removeEventListener("focus", focus)
        target.removeEventListener("blur", focus)
      }
    })

    const unstopped = window.canvasHost?.pages.onStopped((stop) => this.stopped(stop.frame, stop.url))

    const unpreviewed = showTokenPreview(project, (css) => {
      this.preview = css

      for (const frame of this.frames()) {
        this.sendPreview(frame)
      }
    })

    const unchanged = onPageFiles(project, () => this.filesChanged())

    const unprocess = onPageProcess(project, {
      gone: () => this.processGone(),
      resumed: () => this.plan()
    })

    let spares = getPreferences().routeFrameSpares

    const unpreferences = subscribePreferences(() => {
      const next = getPreferences().routeFrameSpares

      if (next !== spares) {
        // Fewer spares: the one warming on a hovered board is no longer kept back, so the plan can close it too.
        if (next < spares) {
          this.unwarm()
        }

        spares = next
        this.plan()
      }
    })

    this.stopListening = () => {
      stopWindows()
      unstopped?.()
      unpreviewed()
      unchanged()
      unprocess()
      unpreferences()
    }
  }

  add(id: string, board: () => LiveBoard): void {
    this.boards.set(id, board)
    this.plan()
  }

  remove(id: string): void {
    this.boards.delete(id)

    if (this.warming?.board === id) {
      this.unwarm()
    }

    if (this.live?.board === id) {
      this.endLive()
    }
  }

  /** The canvas's layer to put frames in, or none once it goes. */
  attach(layer: LiveLayer | undefined): void {
    if (this.layer?.element === layer?.element) {
      return
    }

    this.layer = layer
    this.endLive()
    this.closeSpares()
    this.plan()
  }

  /** The Interact tool picked or put down: spares only wait while it's on, and leaving it disengages. */
  setInteracting(interacting: boolean): void {
    this.interacting = interacting

    if (!interacting) {
      // A board on its way to going live stops there: it's closed once it's ready, rather than engaged under another tool.
      this.going = undefined
      this.disengage()
      this.unwarm()
    }

    this.plan()
  }

  /** A board now draws another URL: its live page ends and its board shows its copy at the new URL. */
  retarget(id: string): void {
    // A press on its way to going live at the old URL stops there.
    if (this.going?.board === id) {
      this.going = undefined
    }

    if (this.warming?.board === id) {
      this.unwarm()
    }

    if (this.live?.board === id) {
      this.endLive()
    }
  }

  /** A board's mode or window changed: when it holds the live frame, the page takes the new mode, sized to its window. */
  redraw(id: string): void {
    const board = this.boards.get(id)?.()

    if (!board || this.live?.board !== id) {
      return
    }

    this.size(this.live.frame, board.viewport)
    this.sendMode(this.live.frame, board)
  }

  /** The view stopped moving: spares park in it again, and wait on the routes in it. */
  viewSettled(): void {
    for (const frame of this.spares.values()) {
      this.park(frame)
    }

    this.plan()
  }

  /** The pointer came to rest on a board with Interact: after a moment, a spare is sent to its route. */
  hover(board: string): void {
    window.clearTimeout(this.hoverTimer)

    if (this.warming && this.warming.board !== board) {
      this.unwarm()
    }

    this.hoverTimer = window.setTimeout(() => void this.warm(board), warmAfter)
  }

  /** The pointer left a board before it warmed. */
  unhover(): void {
    window.clearTimeout(this.hoverTimer)
  }

  /**
   * A press on a board with Interact: it goes live and engaged, with the quickest frame there is, or engages again if
   * it's live already. The press itself only does that; the next one lands on the page.
   */
  async engage(id: string): Promise<void> {
    window.clearTimeout(this.hoverTimer)
    const board = this.boards.get(id)?.()

    if (!board || !this.layer || this.going?.board === id) {
      return
    }

    // While the page process waits to start again, or has stopped, the board keeps its copy.
    if (!pageProcessOpen(this.project)) {
      return
    }

    if (this.live?.board === id) {
      this.setEngaged(true)

      return
    }

    const token = ++this.presses
    this.going = { board: id, token }
    const started = performance.now()
    const route = routeOf(board.url)

    const choice: LiveChoice = {
      route,
      spares: [...this.spares.values()].map((frame) => ({ id: frame.id, state: frame.state, route: frame.route })),
      movable: this.movable
    }

    if (this.warming?.board === id) {
      choice.warming = this.warming.frame.id
    }

    const pick = pickLive(choice)

    let frame: Frame | undefined

    try {
      if (pick.from === "new") {
        track("routeFrame.miss", {})
        frame = this.open(board.url, "live", board)
      } else {
        frame = this.spares.get(pick.frame)
      }

      if (!frame) {
        return
      }

      this.spares.delete(frame.id)
      this.pendingFrames.set(frame.id, frame)

      if (this.warming?.frame === frame) {
        this.warming = undefined
      }

      frame.busy = true
      await withDeadline(frame.ready.promise, loadDeadline)
      // A spare the pool or a hover is moving finishes that move first, so it's where it says it is.
      await frame.moving

      // A spare that turned out to have no page router can't be sent: a new frame loads at the board's URL instead.
      if (frame.route !== route && frame.router === null) {
        this.pendingFrames.delete(frame.id)
        this.close(frame)
        frame = this.open(board.url, "live", board)
        this.pendingFrames.set(frame.id, frame)
        frame.busy = true
        await withDeadline(frame.ready.promise, loadDeadline)
      }

      if (frame.route !== route) {
        await this.send(frame, route)
      }

      this.size(frame, board.viewport)
      await withDeadline(
        frame.channel.request("mode.set", { mode: board.mode, viewport: board.viewport }),
        pageDeadlines["mode.set"]
      )
      await withDeadline(frame.channel.request("role.set", { role: "live" }), pageDeadlines["role.set"])

      // Another board was pressed, the board went, or Interact was put down, while this one was on its way.
      if (this.going?.token !== token || !this.boards.has(id) || !this.interacting) {
        this.close(frame)

        return
      }

      this.endLive()
      this.live = { frame, board: id, engaged: false, top: -1 }
      frame.iframe.inert = false
      frame.iframe.removeAttribute("aria-hidden")
      frame.iframe.title = `Live page at ${route}`
      const state: LiveState = { board: id, engaged: false }

      if (frame.location) {
        state.location = frame.location
      }

      this.setLiveState(state)
      this.place()
      this.setEngaged(true)

      if (this.outdated.delete(frame)) {
        this.reload(frame)
      }

      this.startLoop()
      track("routeFrame.live", { from: pick.from satisfies LiveFrom, ms: Math.round(performance.now() - started) })
      this.refillSoon()
    } catch {
      // A page that's stuck or gone: closed, and the board keeps its copy.
      if (frame && this.live?.frame !== frame) {
        this.close(frame)
      }
    } finally {
      if (frame) {
        this.pendingFrames.delete(frame.id)
      }

      if (this.going?.token === token) {
        this.going = undefined
      }

      this.unready()
    }
  }

  /**
   * The page gives the pointer and keys back: its frame takes no pointer and stays live, so a click engages it again at
   * once, and Parity takes focus back, since a page with focus keeps getting keys.
   */
  disengage(): void {
    this.setEngaged(false)
  }

  dispose(): void {
    this.stopListening()
    window.clearTimeout(this.hoverTimer)
    window.clearTimeout(this.refillTimer)
    window.clearTimeout(this.planTimer)
    this.endLive()
    this.closeSpares()
  }

  private setEngaged(engaged: boolean): void {
    const live = this.live

    if (!live || live.engaged === engaged) {
      return
    }

    live.engaged = engaged
    live.frame.iframe.style.pointerEvents = engaged ? "auto" : "none"

    if (engaged) {
      live.frame.iframe.focus()
    } else {
      this.takeFocusBack(live.frame.iframe)
    }

    this.updateLiveState({ engaged })
  }

  private takeFocusBack(iframe: HTMLIFrameElement): void {
    if (iframe.ownerDocument.activeElement === iframe) {
      iframe.blur()
    }

    this.layer?.editor.focus()
  }

  /** A press in Parity's document is outside the live page, which takes its own presses. */
  private pressedOutside(event: PointerEvent): void {
    if (this.live?.engaged && event.target !== this.live.frame.iframe) {
      this.disengage()
    }

    // A press anywhere but the board on its way to going live moves on from it: it's closed once ready, never engaged.
    const pending = this.going && this.boards.get(this.going.board)?.().element()

    if (this.going && !(isNode(event.target) && pending?.contains(event.target))) {
      this.going = undefined
    }
  }

  private focusChanged(): void {
    // Focus in a frame is still the window's; the check waits a moment, as it moves there through the window's blur.
    window.setTimeout(() => {
      const focused = anyWindowFocused()

      if (focused !== this.focused) {
        this.focused = focused
        this.plan()
      }
    }, 0)
  }

  /** Sends a spare to the hovered board's route and mode, so a press there finds it ready. */
  private async warm(id: string): Promise<void> {
    const board = this.boards.get(id)?.()

    if (!board || this.live?.board === id || this.going || this.warming?.board === id) {
      return
    }

    const route = routeOf(board.url)
    const spares = [...this.spares.values()].filter((frame) => frame.state === "ready" && !frame.busy)
    const frame = spares.find((each) => each.route === route) ?? (this.movable ? spares[0] : undefined)

    if (!frame) {
      return
    }

    this.warming = { frame, board: id }
    frame.busy = true

    try {
      if (frame.route !== route) {
        await this.send(frame, route)
      }

      this.size(frame, board.viewport)
      await withDeadline(
        frame.channel.request("mode.set", { mode: board.mode, viewport: board.viewport }),
        pageDeadlines["mode.set"]
      )

      if (this.warming?.frame === frame) {
        readyBoards.set(new Map(readyBoards.get()).set(this.project, id))
      }
    } catch {
      if (this.warming?.frame === frame) {
        this.warming = undefined
      }

      this.closeSpare(frame)
    } finally {
      frame.busy = false
    }
  }

  private unwarm(): void {
    this.warming = undefined
    this.unready()
  }

  private unready(): void {
    if (readyBoards.get().has(this.project)) {
      const next = new Map(readyBoards.get())
      next.delete(this.project)
      readyBoards.set(next)
    }
  }

  /** Moves a frame to `route` with the app's router, keeping where it ended. */
  private send(frame: Frame, route: string): Promise<void> {
    frame.route = route

    const moving = withDeadline(frame.channel.request("route.go", { to: route }), pageDeadlines["route.go"]).then(
      (location) => {
        frame.location = location
      }
    )

    // Kept failing, so going live sees a move that failed and closes the frame; nobody else need hear of it.
    moving.catch(() => undefined)
    frame.moving = moving

    return moving
  }

  /** Opens a frame at `url`, parked, with the runtime told what it's for. */
  private open(url: string, role: FrameRole, board: LiveBoard): Frame {
    const src = pageFrameUrl(url, this.project)
    const id = `${role}-${crypto.randomUUID()}`
    const iframe = document.createElement("iframe")

    iframe.name = frameName({
      protocol: pageProtocol,
      frame: id,
      parent: window.location.origin,
      role,
      mode: board.mode,
      viewport: board.viewport
    })
    iframe.title = "Spare page"
    iframe.tabIndex = -1
    iframe.inert = true
    iframe.setAttribute("aria-hidden", "true")
    iframe.dataset.liveFrame = role
    Object.assign(iframe.style, {
      position: "absolute",
      left: "0",
      top: "0",
      border: "0",
      background: "white",
      transformOrigin: "0 0",
      pointerEvents: "none"
    })

    const frame: Frame = {
      id,
      iframe,
      channel: this.channelFor(() => frame),
      origin: new URL(src).origin,
      state: "loading",
      route: routeOf(url),
      router: undefined,
      ready: Promise.withResolvers<void>(),
      viewport: board.viewport,
      busy: false
    }

    // Nobody waits on a spare's load, so a failure there doesn't go unheard.
    frame.ready.promise.catch(() => undefined)
    this.size(frame, board.viewport)
    this.park(frame)
    iframe.src = src
    this.layer?.element.append(iframe)

    return frame
  }

  private channelFor(frame: () => Frame): Channel<ParityMethods, PageMethods> {
    return createChannel<ParityMethods, PageMethods>({
      checks: parityChecks,
      handlers: {
        "page.ready": ({ location, router }) => {
          const it = frame()
          it.state = "ready"
          it.router = router
          it.location = location

          if (router === null) {
            this.movable = false
          }

          it.ready.resolve()
          this.moved(it, location)
          this.plan()

          return null
        },
        "page.moved": ({ location }) => {
          const it = frame()
          it.location = location
          this.moved(it, location)

          return null
        },
        "page.height": () => null,
        "page.used": () => {
          if (this.live?.frame === frame()) {
            holdFreezer(this.project, Date.now() + usedPause)
          }

          return null
        },
        "page.scrolled": ({ top }) => {
          if (this.live?.frame === frame() && this.live.engaged) {
            this.live.top = top
            this.place()
          }

          return null
        },
        "page.zoom": (zoom) => {
          if (this.live?.frame === frame()) {
            this.zoom(zoom)
          }

          return null
        },
        "page.key": (key) => {
          if (this.live?.frame === frame()) {
            this.key(key)
          }

          return null
        }
      }
    })
  }

  /** A frame's hello: checked against its origin and its window, then answered with a port. */
  private hello(event: MessageEvent): void {
    const said = readHello(event.data)

    if (!said) {
      return
    }

    const frame = this.frameById(said.frame)

    if (!frame || event.origin !== frame.origin || event.source !== frame.iframe.contentWindow) {
      return
    }

    const ports = new MessageChannel()
    frame.channel.connect(domPort(ports.port1))
    const page = frame.iframe.contentWindow

    // From the window the frame is in, which may be a lens's own.
    if (page) {
      postAs(
        frame.iframe.ownerDocument.defaultView ?? window,
        page,
        { parity: "port", frame: frame.id },
        frame.origin,
        [ports.port2]
      )
    }

    // A live page that loaded again starts from its frame's name, which says spare and the mode it opened in: it's told
    // again that it's live, and in its board's mode.
    const board = this.live?.frame === frame ? this.boards.get(this.live.board)?.() : undefined

    if (board) {
      void withDeadline(frame.channel.request("role.set", { role: "live" }), pageDeadlines["role.set"]).catch(
        () => undefined
      )
      this.sendMode(frame, board)
    }

    if (this.preview !== "") {
      this.sendPreview(frame)
    }
  }

  /** Shows a frame the project's previewed token values (`preview.set`), giving up past its deadline. */
  private sendPreview(frame: Frame): void {
    void withDeadline(frame.channel.request("preview.set", { css: this.preview }), pageDeadlines["preview.set"]).catch(
      () => undefined
    )
  }

  /**
   * Each route a spare is on, "ready" when one waits there and "warming" while one loads or moves there, for the tier
   * dot (`TierDot`).
   */
  spareRoutes(): ReadonlyMap<string, "warming" | "ready"> {
    const routes = new Map<string, "warming" | "ready">()

    for (const frame of [...this.spares.values(), ...this.pendingFrames.values()]) {
      const warming = frame.busy || frame.state === "loading"

      if (routes.get(frame.route) !== "ready") {
        routes.set(frame.route, warming ? "warming" : "ready")
      }
    }

    return routes
  }

  /** The pool's frames: the live one, the spares, and those on their way to going live. */
  private frames(): Frame[] {
    return [
      ...new Set([...(this.live ? [this.live.frame] : []), ...this.spares.values(), ...this.pendingFrames.values()])
    ]
  }

  /**
   * The app's files changed (PAR-1264). A page under Vite or a webpack-compatible builder keeps the modules it loaded, so
   * it's loaded again: the live page where it is (`page.reload`), or at where it last said it was when it doesn't
   * answer, and it says hello again; spares are closed, and the pool fills again. Next's pages take its hot updates.
   */
  private filesChanged(): void {
    const live = this.live?.frame

    if (live && !updatesItself(live.router)) {
      this.reload(live)
    }

    // A frame on its way to going live reloads once it's live, as going live waits on it as it is.
    for (const frame of this.pendingFrames.values()) {
      if (!updatesItself(frame.router)) {
        this.outdated.add(frame)
      }
    }

    if ([...this.spares.values()].some((frame) => !updatesItself(frame.router))) {
      this.closeSpares()
      this.plan()
    }
  }

  /** Loads a frame's page again where it is (`page.reload`), or at where it last said it was when it doesn't answer. */
  private reload(frame: Frame): void {
    const { iframe, location } = frame

    const fallback = () => {
      iframe.src = location
        ? new URL(`${location.path}${location.search}${location.hash}`, iframe.src).href
        : iframe.src
    }

    void withDeadline(frame.channel.request("page.reload", {}), pageDeadlines["page.reload"]).catch(fallback)
  }

  /** Sets a frame's mode to its board's, giving up past `mode.set`'s deadline, as a stuck page answers nothing. */
  private sendMode(frame: Frame, board: LiveBoard): void {
    void withDeadline(
      frame.channel.request("mode.set", { mode: board.mode, viewport: board.viewport }),
      pageDeadlines["mode.set"]
    ).catch(() => undefined)
  }

  private frameById(id: string): Frame | undefined {
    if (this.live?.frame.id === id) {
      return this.live.frame
    }

    return this.spares.get(id) ?? this.pendingFrames.get(id)
  }

  /** The live page moved by itself: its board says where, as a redirect does, and no longer where it was stopped. */
  private moved(frame: Frame, location: PageLocation): void {
    const state = liveStates.get().get(this.project)

    if (this.live?.frame === frame && state) {
      this.setLiveState({ board: state.board, engaged: state.engaged, location })
    }
  }

  /** Main stopped a frame leaving the builder's origin: its board says where it tried to go. */
  private stopped(id: string, url: string): void {
    if (this.live?.frame.id === id) {
      this.updateLiveState({ stopped: url })
    }
  }

  /** The canvas's zoom, from the zoom wheel or a pinch over the engaged page, at its point on screen. */
  private zoom({ deltaY, x, y }: { deltaY: number; x: number; y: number }): void {
    const live = this.live
    const editor = this.layer?.editor

    if (!live || !editor) {
      return
    }

    const box = live.frame.iframe.getBoundingClientRect()
    const scale = box.width / live.frame.viewport.width
    const step = Math.abs(deltaY) > 10 ? 10 * Math.sign(deltaY) : deltaY
    const container = editor.getContainer().getBoundingClientRect()

    // As tldraw reads the wheel with Ctrl (`normalizeWheel`), at the point in its container.
    editor.dispatch({
      type: "wheel",
      name: "wheel",
      delta: { x: 0, y: deltaY === 0 ? 0 : -deltaY, z: -step / 100 },
      point: { x: box.left + x * scale - container.left, y: box.top + y * scale - container.top, z: 0 },
      shiftKey: false,
      altKey: false,
      ctrlKey: true,
      metaKey: false,
      accelKey: true
    })
  }

  /** A key the page didn't handle: Escape disengages, and a shortcut runs in Parity's document. */
  private key(key: PageKey): void {
    if (key.key === "Escape" && !key.ctrl && !key.meta) {
      this.disengage()

      return
    }

    document.body.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: key.key,
        code: key.code,
        ctrlKey: key.ctrl,
        metaKey: key.meta,
        shiftKey: key.shift,
        altKey: key.alt,
        bubbles: true,
        cancelable: true
      })
    )
  }

  /** Parks a spare in the view, at its mode's full size, drawn at 1% on screen, taking no pointer. */
  private park(frame: Frame): void {
    const editor = this.layer?.editor

    if (!editor) {
      return
    }

    const view = editor.getViewportPageBounds()
    const zoom = editor.getZoomLevel()
    Object.assign(frame.iframe.style, {
      left: `${view.x}px`,
      top: `${view.y}px`,
      transform: `scale(${parkedScale / zoom})`,
      pointerEvents: "none"
    })
  }

  private size(frame: Frame, viewport: PageViewport): void {
    frame.viewport = viewport
    frame.iframe.style.width = `${viewport.width}px`
    frame.iframe.style.height = `${viewport.height}px`
  }

  /**
   * Puts the live frame over its board: one mode window tall, over the part of the board in view while disengaged, with
   * the page scrolled to match, and where the page scrolled itself while engaged. Live ends once the board has been out
   * of view for 10 s, or has gone.
   */
  private place(): void {
    const live = this.live
    const layer = this.layer
    const board = live ? this.boards.get(live.board)?.() : undefined
    const element = board?.element()

    if (!live || !layer || !board || !element) {
      this.endLive()

      return
    }

    const box = element.getBoundingClientRect()
    const origin = layer.element.getBoundingClientRect()
    const view = layer.editor.getContainer().getBoundingClientRect()
    const zoom = layer.editor.getZoomLevel()
    const now = performance.now()
    const inView = box.right > view.left && box.left < view.right && box.bottom > view.top && box.top < view.bottom

    live.outSince = inView ? undefined : (live.outSince ?? now)

    if (liveExpired(live.outSince, now)) {
      this.endLive()

      return
    }

    const pageHeight = board.pageHeight()
    const windowHeight = Math.min(board.viewport.height, pageHeight)

    const top = live.engaged
      ? Math.min(live.top, Math.max(0, pageHeight - windowHeight))
      : liveWindowTop({
          viewTop: view.top,
          boardTop: box.top,
          scale: zoom * board.scale,
          pageHeight,
          windowHeight
        })

    if (!live.engaged && top !== live.top) {
      void withDeadline(live.frame.channel.request("page.scroll", { top }), pageDeadlines["page.scroll"]).catch(
        () => undefined
      )
    }

    live.top = Math.max(0, top)

    Object.assign(live.frame.iframe.style, {
      left: `${(box.left - origin.left) / zoom}px`,
      top: `${(box.top - origin.top) / zoom + live.top * board.scale}px`,
      width: `${board.viewport.width}px`,
      height: `${windowHeight}px`,
      transform: `scale(${board.scale})`
    })
  }

  private startLoop(): void {
    if (this.frameLoop) {
      return
    }

    const step = () => {
      if (!this.live) {
        this.frameLoop = 0

        return
      }

      this.place()
      this.frameLoop = requestAnimationFrame(step)
    }

    this.frameLoop = requestAnimationFrame(step)
  }

  /** Live ends: the frame is closed, since it may hold what someone typed or opened, and its board shows its copy. */
  private endLive(): void {
    const live = this.live

    if (!live) {
      return
    }

    this.live = undefined
    cancelAnimationFrame(this.frameLoop)
    this.frameLoop = 0

    if (live.engaged) {
      this.takeFocusBack(live.frame.iframe)
    }

    this.close(live.frame)
    const next = new Map(liveStates.get())
    next.delete(this.project)
    liveStates.set(next)
  }

  private setLiveState(state: LiveState): void {
    liveStates.set(new Map(liveStates.get()).set(this.project, state))
  }

  private updateLiveState(change: Partial<LiveState>): void {
    const state = liveStates.get().get(this.project)

    if (state) {
      this.setLiveState({ ...state, ...change })
    }
  }

  /** The pool refills a moment after a frame goes live, once the live frame has settled; the freezer waits meanwhile. */
  private refillSoon(): void {
    window.clearTimeout(this.refillTimer)
    holdFreezer(this.project, Date.now() + refillAfter)
    this.refillTimer = window.setTimeout(() => this.plan(), refillAfter)
  }

  /** Works out the pool's plan soon, once for a burst of changes. */
  private plan(): void {
    window.clearTimeout(this.planTimer)
    this.planTimer = window.setTimeout(() => this.runPlan(), 0)
  }

  private runPlan(): void {
    const layer = this.layer
    const boards = [...this.boards.values()].map((board) => board())
    const [first] = boards

    if (!layer || !first) {
      this.closeSpares()

      return
    }

    const view = layer.editor.getContainer().getBoundingClientRect()

    const inView = boards
      .filter((board) => {
        const box = board.element()?.getBoundingClientRect()

        return box && box.right > view.left && box.left < view.right && box.bottom > view.top && box.top < view.bottom
      })
      .toSorted((a, b) => a.rank() - b.rank())

    const frames: PoolFrame[] = [...this.spares.values()].map((frame) => ({
      id: frame.id,
      state: frame.busy || this.warming?.frame === frame ? "loading" : frame.state,
      route: frame.route
    }))

    const plan = planPool({
      spares: this.interacting && !this.going && pageProcessOpen(this.project) ? spareCount() : 0,
      focused: this.focused,
      frames,
      routes: inView.map((board) => routeOf(board.url)),
      movable: this.movable,
      root: "/"
    })

    // Kept off the freezer while spares load or move, as a project's pages share one process.
    if (plan.open.length > 0 || plan.move.length > 0) {
      holdFreezer(this.project, Date.now() + refillAfter)
    }

    const boardFor = (route: string) => inView.find((board) => routeOf(board.url) === route) ?? inView[0] ?? first

    for (const id of plan.close) {
      const frame = this.spares.get(id)

      if (frame && this.warming?.frame !== frame) {
        this.closeSpare(frame)
      }
    }

    for (const { frame: id, route } of plan.move) {
      const frame = this.spares.get(id)

      if (!frame || frame.busy) {
        continue
      }

      frame.busy = true
      void this.send(frame, route)
        .then(() => this.size(frame, boardFor(route).viewport))
        .catch(() => this.closeSpare(frame))
        .finally(() => {
          frame.busy = false
        })
    }

    for (const { route } of plan.open) {
      const board = boardFor(route)
      const frame = this.open(new URL(route, board.url).href, "spare", board)
      this.spares.set(frame.id, frame)
      void withDeadline(frame.ready.promise, loadDeadline).catch(() => this.closeSpare(frame))
    }
  }

  /**
   * The project's page process went or hung: live ends, and every frame closes, the ones on their way to going live
   * too. The pool fills again once the pause is over.
   */
  private processGone(): void {
    this.going = undefined
    this.endLive()
    this.closeSpares()

    for (const frame of this.pendingFrames.values()) {
      this.close(frame)
    }
  }

  /** Closes a spare, unless it has left the spares to go live, when going live owns it. */
  private closeSpare(frame: Frame): void {
    if (this.spares.get(frame.id) !== frame) {
      return
    }

    this.spares.delete(frame.id)

    if (this.warming?.frame === frame) {
      this.unwarm()
    }

    this.close(frame)
  }

  private closeSpares(): void {
    for (const frame of this.spares.values()) {
      this.close(frame)
    }

    this.spares.clear()
    this.unwarm()
  }

  private close(frame: Frame): void {
    frame.ready.reject(new Error("The frame closed"))
    frame.channel.close(new Error("The frame closed"))
    frame.iframe.remove()
  }
}
