import { type Channel, createChannel, domPort } from "@parity-app/channel"
import { prepareCanvasCss } from "@parity-app/core"
import { pageFrameUrl } from "@parity-app/editor"
import {
  type FrozenElement,
  freezeLoadDeadline,
  freezeOrder,
  freezeQuiet,
  type PageLocation,
  type PageMode,
  type PageRoot,
  parsePageSheets,
  parsePageSnapshot,
  restartAfter,
  type SanitizePolicy,
  sanitizePage,
  sanitizeRoot,
  sanitizeSheet,
  type SheetEntry
} from "@parity-app/frames"
import { withConditions } from "@parity-app/page-runtime"
import {
  frameName,
  type PageMethods,
  type PageViewport,
  pageDeadlines,
  pageProtocol,
  type ParityMethods,
  readHello,
  snapshotDeadline
} from "@parity-app/page-runtime/protocol"
import { useEffect, useId, useRef } from "react"
import { track } from "../report-error.ts"
import { resetWithWindow, useStore, windowStore } from "../store.ts"
import { parityChecks } from "./page-channel.ts"

/*
 * The freezer (docs/proposals/route-frames.md, "The pool" and "Frozen copies", PAR-1262): one frame per project that
 * makes every route board's frozen copy. Each route that needs one, nearest the view first, is loaded fresh in the
 * freezer's frame, which then takes a snapshot in each of the modes its boards draw, waiting for quiet in each. A
 * snapshot is parsed with its schema and passed through the sanitizers before it's kept, and the stylesheets it lists
 * are asked for once each, by content hash, or fetched by main when they're on another host. When the project's page
 * process fails under it, the freezer starts again after a pause, and stops after three failures in two minutes;
 * boards keep the copies they have.
 */

/** A route's page in one mode, as plain data that's been through the sanitizers, ready for `buildCopy`. */
export interface FrozenCopy {
  /** Where the page landed: on its route, or where it redirected. */
  location: PageLocation
  /** The page's whole height in the mode's window, in CSS pixels. */
  pageHeight: number
  root: PageRoot
  body: FrozenElement
  /** Its stylesheets, in the page's order, by the ids `copySheets` keeps them under. */
  sheets: string[]
  /** The builder's origin, which the copy was sanitized against and its sheets prepared for. */
  origin: string
}

/** Every copy the window has, by `copyKey`. */
const copies = windowStore<ReadonlyMap<string, FrozenCopy>>(() => new Map())

/** A copy's key: the project, the URL its page draws at, and the mode and window it's drawn in. */
export function copyKey(project: string, url: string, mode: PageMode, viewport: PageViewport): string {
  return JSON.stringify([project, url, mode, viewport])
}

/** One board's need of a copy. */
interface CopyNeed {
  key: string
  url: string
  mode: PageMode
  viewport: PageViewport
  /** How urgent it is, lowest first, from where its board is against the view (`useFrameView`'s `rank`). */
  rank: () => number
}

/** Whether a project's freezer has stopped after its page process failed too often. */
export const stoppedFreezers = windowStore<ReadonlySet<string>>(() => new Set())

const freezers = new Map<string, Freezer>()

resetWithWindow(() => {
  for (const freezer of freezers.values()) {
    freezer.dispose()
  }

  freezers.clear()
  sheetTexts.clear()
  preparedSheets.clear()
})

/**
 * The copy of a route's page in a mode, once the project's freezer has made it, for a board drawn at `url`. While the
 * board is on the canvas, the freezer knows it needs one, and how near the view it is.
 */
export function useFrozenCopy(
  project: string,
  url: string,
  mode: PageMode,
  viewport: PageViewport,
  rank: () => number
): FrozenCopy | undefined {
  const key = copyKey(project, url, mode, viewport)
  const ranked = useRef(rank)
  const id = useId()

  useEffect(() => {
    ranked.current = rank
  })

  useEffect(() => {
    const freezer = freezerFor(project)
    freezer.need(id, { key, url, mode, viewport, rank: () => ranked.current() })

    return () => freezer.drop(id)
    // The key holds the mode and viewport.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [project, id, key, url])

  return useStore(copies).get(key)
}

function freezerFor(project: string): Freezer {
  let freezer = freezers.get(project)

  if (!freezer) {
    freezer = new Freezer(project)
    freezers.set(project, freezer)
  }

  return freezer
}

/** The text of each stylesheet a copy lists, by its id: a page's own by content hash, another host's as `href:` and its address. */
const sheetTexts = new Map<string, string>()

/** Each stylesheet prepared for a copy's shadow root, by its origin and id, shared by every copy that lists it. */
const preparedSheets = new Map<string, CSSStyleSheet>()

/** The rules only the document can hold, `@font-face` and `@property`, from every copy's sheets, and their sheet. */
interface CopyGlobals {
  sheet?: CSSStyleSheet
  /** Each prepared sheet's rules for the document, by its origin and id. */
  texts: Map<string, string>
}

const copyGlobals: CopyGlobals = { texts: new Map() }

/** A sheet entry's id among `sheetTexts`. */
function sheetId(entry: SheetEntry): string {
  if ("hash" in entry) {
    return entry.hash
  }

  return `href:${JSON.stringify([entry.href, entry.conditions ?? []])}`
}

/**
 * A copy's stylesheets, each sanitized and gone through `prepareCanvasCss` once per content hash and shared by every
 * copy that lists it, so its media queries, viewport units, fonts and root rules measure the copy's mode. What only the
 * document can hold goes into one sheet the document adopts.
 */
export function copySheets(copy: Pick<FrozenCopy, "sheets" | "origin">): CSSStyleSheet[] {
  const policy: SanitizePolicy = { pageOrigin: copy.origin }

  return copy.sheets.flatMap((id) => {
    const key = `${copy.origin}\n${id}`
    let sheet = preparedSheets.get(key)

    if (!sheet) {
      const text = sheetTexts.get(id)

      if (text === undefined) {
        return []
      }

      const prepared = prepareCanvasCss(sanitizeSheet(text, policy), { baseUrl: copy.origin })
      sheet = new CSSStyleSheet()
      sheet.replaceSync(prepared.scoped)
      preparedSheets.set(key, sheet)
      addGlobals(key, prepared.global)
    }

    return [sheet]
  })
}

/**
 * A web component's shadow-root styles in a copy, prepared as the copy's sheets are, so their media queries and viewport
 * units measure the copy's mode too. They've been through `sanitizePage`.
 */
export function copyShadowStyle(copy: Pick<FrozenCopy, "origin">, css: string): string {
  const prepared = prepareCanvasCss(css, { baseUrl: copy.origin })
  addGlobals(`${copy.origin}\nshadow:${css}`, prepared.global)

  return prepared.scoped
}

function addGlobals(key: string, css: string): void {
  if (!css.trim() || copyGlobals.texts.has(key)) {
    return
  }

  copyGlobals.texts.set(key, css)

  if (!copyGlobals.sheet) {
    copyGlobals.sheet = new CSSStyleSheet()
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, copyGlobals.sheet]
  }

  copyGlobals.sheet.replaceSync([...copyGlobals.texts.values()].join("\n"))
}

/** Why a snapshot was refused, as `routeFrame.refused` says it. */
type Refusal = "cap" | "schema" | "deadline"

/** A request that got no answer before its deadline: the page is stuck. */
class Deadline extends Error {}

/** Fails a request that takes longer than `ms`, which `@parity-app/channel` leaves to the caller. */
function withDeadline<T>(request: Promise<T>, ms: number): Promise<T> {
  let timer = 0

  return Promise.race([
    request,
    new Promise<never>((_, reject) => {
      timer = window.setTimeout(() => reject(new Deadline(`No answer in ${ms} ms`)), ms)
    })
  ]).finally(() => window.clearTimeout(timer))
}

/** One project's freezer: its frame, its queue, and its failures. */
class Freezer {
  private readonly needs = new Map<string, CopyNeed>()
  /** Copies refused for a cap or the schema, which aren't asked for again until their board's mode changes. */
  private readonly refused = new Set<string>()
  private running = false
  private disposed = false
  private timer = 0
  private failures: number[] = []
  private frame: HTMLIFrameElement | undefined
  private readonly project: string

  constructor(project: string) {
    this.project = project
  }

  need(id: string, need: CopyNeed): void {
    this.needs.set(id, need)
    this.poke()
  }

  drop(id: string): void {
    this.needs.delete(id)
  }

  dispose(): void {
    this.disposed = true
    window.clearTimeout(this.timer)
    this.frame?.remove()
  }

  /** Runs the queue soon, unless it runs or waits to start again already. */
  private poke(delay = 0): void {
    if (this.running || this.timer || this.disposed || stoppedFreezers.get().has(this.project)) {
      return
    }

    this.timer = window.setTimeout(() => {
      this.timer = 0
      void this.run()
    }, delay)
  }

  /** What still needs a copy: needs with no copy, and not refused. */
  private missing(): CopyNeed[] {
    const have = copies.get()

    return [...this.needs.values()].filter((need) => !have.has(need.key) && !this.refused.has(need.key))
  }

  private async run(): Promise<void> {
    this.running = true
    let failure: "gone" | "hung" | undefined

    try {
      for (let missing = this.missing(); missing.length > 0 && !this.disposed; missing = this.missing()) {
        const [url] = freezeOrder(missing.map((need) => ({ url: need.url, distance: need.rank() })))
        const modes = new Map(missing.filter((need) => need.url === url).map((need) => [need.key, need]))
        await this.freeze(url!, [...modes.values()])
      }
    } catch (error) {
      failure = error instanceof Deadline ? "hung" : "gone"
    } finally {
      this.running = false
    }

    // Once it's stopped running, so the retry it schedules isn't turned away as running already.
    if (failure) {
      this.failed(failure)
    }
  }

  /** Loads `url` fresh in the freezer's frame and takes a snapshot in each mode that needs one. */
  private async freeze(url: string, modes: readonly CopyNeed[]): Promise<void> {
    const [first] = modes

    if (!first) {
      return
    }

    const src = pageFrameUrl(url, this.project)
    const origin = new URL(src).origin
    const id = `freezer-${crypto.randomUUID()}`
    const frame = document.createElement("iframe")

    frame.name = frameName({
      protocol: pageProtocol,
      frame: id,
      parent: window.location.origin,
      role: "freezer",
      mode: first.mode,
      viewport: first.viewport
    })
    frame.title = "Page snapshots"
    frame.tabIndex = -1
    frame.inert = true
    frame.setAttribute("aria-hidden", "true")
    frame.dataset.freezer = this.project
    // Parked in view at 1%, as the pool's spares are: a frame off-screen, clipped, hidden or behind the canvas runs no
    // animation frames or `ResizeObserver`, and would be frozen half laid out.
    Object.assign(frame.style, {
      position: "fixed",
      left: "0",
      top: "0",
      border: "0",
      transform: "scale(0.01)",
      transformOrigin: "0 0",
      pointerEvents: "none",
      zIndex: "2147483647"
    })
    sizeFrame(frame, first.viewport)

    const channel = createChannel<ParityMethods, PageMethods>({
      checks: parityChecks,
      handlers: {
        "page.ready": () => {
          ready.resolve()

          return null
        },
        "page.moved": () => null,
        "page.height": () => null,
        "page.used": () => null
      }
    })

    const ready = Promise.withResolvers<void>()

    const hello = (event: MessageEvent) => {
      const said = readHello(event.data)

      if (!said || said.frame !== id || event.origin !== origin || event.source !== frame.contentWindow) {
        return
      }

      // A page that loads again says hello again, and gets a new port.
      const ports = new MessageChannel()
      channel.connect(domPort(ports.port1))
      frame.contentWindow?.postMessage({ parity: "port", frame: id }, origin, [ports.port2])
    }

    window.addEventListener("message", hello)
    this.frame = frame
    frame.src = src
    document.body.append(frame)

    try {
      await withDeadline(ready.promise, freezeLoadDeadline)

      for (const need of modes) {
        if (this.disposed) {
          return
        }

        sizeFrame(frame, need.viewport)
        await withDeadline(
          channel.request("mode.set", { mode: need.mode, viewport: need.viewport }),
          pageDeadlines["mode.set"]
        )
        await this.snapshot(channel, need, origin)
      }
    } finally {
      window.removeEventListener("message", hello)
      channel.close(new Error("The freezer is done with the page"))
      frame.remove()
      this.frame = undefined
    }
  }

  /** Takes one mode's snapshot, checks and sanitizes it, gets the sheets it lists, and keeps its copy. */
  private async snapshot(channel: Channel<ParityMethods, PageMethods>, need: CopyNeed, origin: string): Promise<void> {
    let taken: unknown

    try {
      taken = await withDeadline(
        channel.request("snapshot.take", { quiet: freezeQuiet }),
        snapshotDeadline(freezeQuiet)
      )
    } catch (error) {
      if (error instanceof Deadline) {
        this.refuse(need, "deadline")
      }

      throw error
    }

    let snapshot: ReturnType<typeof parsePageSnapshot>

    try {
      snapshot = parsePageSnapshot(taken)
    } catch (error) {
      this.refuse(need, String(error).includes("at most") ? "cap" : "schema")
      this.refused.add(need.key)

      return
    }

    const policy: SanitizePolicy = { pageOrigin: origin }
    const body = sanitizePage(snapshot.body, policy)
    const root = sanitizeRoot(snapshot.root, policy)

    if (body.removed > 0 || root.removed > 0) {
      track("routeFrame.removed", { elements: body.removed, attributes: root.removed })
    }

    try {
      await getSheets(channel, snapshot.sheets)
    } catch (error) {
      if (error instanceof Deadline) {
        throw error
      }

      // A sheet past its cap, or one that isn't what the schema reads.
      this.refuse(need, String(error).includes("at most") ? "cap" : "schema")
      this.refused.add(need.key)

      return
    }

    const copy: FrozenCopy = {
      location: snapshot.location,
      pageHeight: snapshot.pageHeight,
      root: root.root,
      body: body.body,
      sheets: snapshot.sheets.map(sheetId),
      origin
    }

    copies.set(new Map(copies.get()).set(need.key, copy))
  }

  private refuse(_need: CopyNeed, reason: Refusal): void {
    track("routeFrame.refused", { reason })
  }

  /**
   * The page process failed under the frame, or stopped answering: start again after a pause, or stop after three
   * failures in two minutes, keeping the copies boards have.
   */
  private failed(how: "gone" | "hung"): void {
    if (this.disposed) {
      return
    }

    const now = Date.now()
    this.failures = [...this.failures.filter((at) => now - at < 120_000), now]
    const next = restartAfter(this.failures, now)
    track("routeFrame.process", { how, stopped: next === "stop" })

    if (next === "stop") {
      stoppedFreezers.set(new Set(stoppedFreezers.get()).add(this.project))

      return
    }

    this.poke(next.delay)
  }
}

/** Sizes the freezer's frame to a mode's window, which the page lays out in. */
function sizeFrame(frame: HTMLIFrameElement, viewport: PageViewport): void {
  frame.style.width = `${viewport.width}px`
  frame.style.height = `${viewport.height}px`
}

/**
 * Gets the stylesheets a snapshot lists that the window hasn't got: the page's own from the page, by content hash, and
 * another host's from main, by address. One main can't fetch is kept empty, so it isn't asked for again.
 */
async function getSheets(channel: Channel<ParityMethods, PageMethods>, entries: readonly SheetEntry[]): Promise<void> {
  const ids = entries.flatMap((entry) => ("hash" in entry && !sheetTexts.has(entry.hash) ? [entry.hash] : []))

  if (ids.length > 0) {
    const sheets = parsePageSheets(
      await withDeadline(channel.request("sheets.get", { ids }), pageDeadlines["sheets.get"])
    )

    for (const sheet of sheets) {
      sheetTexts.set(sheet.id, sheet.text)
    }
  }

  await Promise.all(
    entries.flatMap((entry) => {
      if (!("href" in entry) || sheetTexts.has(sheetId(entry))) {
        return []
      }

      return [
        Promise.resolve()
          .then(() => window.canvasHost.pages.sheet(entry.href))
          .catch(() => null)
          // Inside the conditions the page applied it in, so a print sheet or a layered import stays one.
          .then((text) => sheetTexts.set(sheetId(entry), text ? withConditions(text, entry.conditions ?? []) : ""))
      ]
    })
  )
}
