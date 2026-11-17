import { type Channel, createChannel, domPort } from "@parity-app/channel"
import { bodyAttribute, prepareCanvasCss } from "@parity-app/core"
import { pageFrameUrl } from "@parity-app/editor"
import {
  type CopyKey,
  copyId,
  type FrozenElement,
  freezeLoadDeadline,
  freezeOrder,
  freezeQuiet,
  groupLeaders,
  type MarkupGroups,
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
  type SheetEntry,
  sharedMarkup,
  staleCopies,
  type TracedCopy,
  withMarkup
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
import { onPageFiles } from "./page-changes.ts"
import { parityChecks } from "./page-channel.ts"

/*
 * The freezer (docs/proposals/route-frames.md, "The pool" and "Frozen copies", PAR-1262): one frame per project that
 * makes every route board's frozen copy. Each route that needs one, nearest the view first, is loaded fresh in the
 * freezer's frame, which then takes a snapshot in each of the modes its boards draw, waiting for quiet in each. A
 * snapshot is parsed with its schema and passed through the sanitizers before it's kept, and the stylesheets it lists
 * are asked for once each, by content hash, or fetched by main when they're on another host. When the project's page
 * process fails under it, the freezer starts again after a pause, and stops after three failures in two minutes;
 * boards keep the copies they have.
 *
 * Copies are kept by `CopyKey`: the route's URL, the mode and the board's state (PAR-1264). Each keeps the trace it was
 * made from, and when the app's files change, the copies whose traces hold one are stale: they stay shown until they're
 * frozen again, nearest the view first. Modes whose snapshots drew the same markup at the last freeze form a markup
 * group, and a route frozen again takes one snapshot per group, which updates every copy in it at once; each other mode
 * is checked after, once no copy is missing or stale. A page that loads again while it's frozen says hello again: its
 * channel is replaced, it's waited for as a page loading, and the snapshot it was taking is taken again.
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
  /** The hash of the markup its snapshot drew, which puts its mode in a markup group. */
  markup: string
  /** The mode as drawn, its classes, attributes and window (`drawnAs`), which a changed mode no longer matches. */
  drawn: string
  /** The freezer's count of code changes when its route's freeze began: a change after it makes it stale. */
  changes: number
  /** The files its page was made from, relative to the project's root, or `"all"` when the builder couldn't say. */
  trace: readonly string[] | "all"
  /** Whether it was made from another mode's snapshot in its markup group and is still to be checked in its own. */
  unchecked?: true
}

/** Every copy the window has, by `copyStoreKey`. */
const copies = windowStore<ReadonlyMap<string, FrozenCopy>>(() => new Map())

/** A copy's key in the window: its project and its `CopyKey`. */
export function copyStoreKey(project: string, key: CopyKey): string {
  return `${project}
${copyId(key)}`
}

/** A mode as drawn, its classes, attributes and window, as one string: copies made in another are redone. */
function drawnAs(mode: PageMode, viewport: PageViewport): string {
  return JSON.stringify([mode, viewport])
}

/** One board's need of a copy. */
interface CopyNeed {
  /** Its key in the window, from `copyStoreKey`. */
  key: string
  url: string
  mode: PageMode
  viewport: PageViewport
  /** The mode as drawn (`drawnAs`), which the freezer snapshots once for every need that shares it. */
  drawn: string
  /** How urgent it is, lowest first, from where its board is against the view (`useFrameView`'s `rank`). */
  rank: () => number
}

/**
 * Until when each project's freezer waits, by project: while its live page is in use (`page.used`) and while its pool
 * refills, since a project's live frame, spares and freezer share one renderer process.
 */
const holds = new Map<string, number>()

/** Keeps a project's freezer from starting another page or snapshot until `until`, a time from `Date.now()`. */
export function holdFreezer(project: string, until: number): void {
  holds.set(project, Math.max(holds.get(project) ?? 0, until))
}

/** Resolves once a project's freezer isn't held. */
async function unheld(project: string): Promise<void> {
  for (let left = (holds.get(project) ?? 0) - Date.now(); left > 0; left = (holds.get(project) ?? 0) - Date.now()) {
    await new Promise((resolve) => window.setTimeout(resolve, left))
  }
}

/** Whether a project's freezer has stopped after its page process failed too often. */
export const stoppedFreezers = windowStore<ReadonlySet<string>>(() => new Set())

const freezers = new Map<string, Freezer>()

resetWithWindow(() => {
  for (const freezer of freezers.values()) {
    freezer.dispose()
  }

  freezers.clear()
  holds.clear()
  sheetTexts.clear()
  preparedSheets.clear()
})

/**
 * The copy of a route's page in a mode, once the project's freezer has made it, for a board drawn at `url`. While the
 * board is on the canvas, the freezer knows it needs one, and how near the view it is.
 */
export function useFrozenCopy(
  project: string,
  key: CopyKey,
  mode: PageMode,
  viewport: PageViewport,
  rank: () => number
): FrozenCopy | undefined {
  const stored = copyStoreKey(project, key)
  const drawn = drawnAs(mode, viewport)
  const ranked = useRef(rank)
  const id = useId()

  useEffect(() => {
    ranked.current = rank
  })

  useEffect(() => {
    const freezer = freezerFor(project)
    freezer.need(id, { key: stored, url: key.route, mode, viewport, drawn, rank: () => ranked.current() })

    return () => freezer.drop(id)
    // `drawn` holds the mode and viewport, and `stored` the route.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [project, id, stored, drawn])

  const copy = useStore(copies).get(stored)

  // A copy made in a mode since changed isn't this mode's; it's frozen again.
  return copy?.drawn === drawn ? copy : undefined
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
      sheet.replaceSync(throughCopyRoot(prepared.scoped))
      preparedSheets.set(key, sheet)
      addGlobals(key, prepared.global)
    }

    return [sheet]
  })
}

/**
 * A web component's shadow-root styles in a copy, prepared as the copy's sheets are, so their media queries and viewport
 * units measure the copy's mode too. A `prefers-color-scheme` query is answered for the mode's scheme here, since the
 * body the copy's sheets scope those rules to is outside the shadow root, and its roots stay its own `:host`. They've
 * been through `sanitizePage`.
 */
export function copyShadowStyle(copy: Pick<FrozenCopy, "origin">, css: string, scheme: PageMode["scheme"]): string {
  const answered = scheme
    ? css.replaceAll(/\(\s*prefers-color-scheme\s*:\s*(dark|light)\s*\)/gi, (_query, asked: string) =>
        asked.toLowerCase() === scheme ? "(min-width: 0px)" : "(max-width: -1px)"
      )
    : css

  const prepared = prepareCanvasCss(answered, {
    baseUrl: copy.origin,
    colorSchemes: false,
    qualifiedRoots: false
  })

  addGlobals(`${copy.origin}\nshadow:${answered}`, prepared.global)

  return prepared.scoped
}

/** The attribute on the element around a copy's body that carries `<html>`'s classes and attributes. */
export const copyRootAttribute = "data-copy-root"

/**
 * Prepared CSS with the root's children (`html > body`, which became `:host > [data-canvas-body]`) found through the
 * element around a copy's body, which adds nothing to their specificity.
 */
export function throughCopyRoot(css: string): string {
  return css.replaceAll(
    new RegExp(String.raw`(:host(?:\([^()]*\))?)\s*>\s*(?=\[${bodyAttribute}\])`, "g"),
    `$1 > :where([${copyRootAttribute}]) > `
  )
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

/** How many times a page may load again while one route is frozen before the freezer takes it to be stuck. */
const reloadLimit = 3

/** A mode a route is frozen in, and the boards' needs that share it. */
interface FreezeUnit {
  drawn: string
  mode: PageMode
  viewport: PageViewport
  needs: CopyNeed[]
}

/** What the freezer's frame has said: hellos counted, so a reload is told from a failure, and when it's ready. */
interface FrameLoad {
  hellos: number
  ready: PromiseWithResolvers<void>
}

/** One project's freezer: its frame, its queue, its markup groups, the copies code changes made stale, its failures. */
class Freezer {
  private readonly needs = new Map<string, CopyNeed>()
  /**
   * Copies refused for a cap or the schema, by their key and the mode as drawn (`refusal`), not asked for again until
   * their board's mode or the code changes.
   */
  private readonly refused = new Set<string>()
  /** How many times the app's files have changed in a way that made a copy stale. */
  private changes = 0
  /** The count of changes when each stale copy last went stale, by its key. */
  private readonly stale = new Map<string, number>()
  /** Each route's modes, as drawn, with the markup each drew at its last snapshot. */
  private groups: MarkupGroups = new Map()
  private running = false
  private disposed = false
  private timer = 0
  private failures: number[] = []
  private frame: HTMLIFrameElement | undefined
  private readonly project: string
  private readonly unhear: () => void

  constructor(project: string) {
    this.project = project
    this.unhear = onPageFiles(project, (paths) => this.filesChanged(paths))
  }

  need(id: string, need: CopyNeed): void {
    this.needs.set(id, need)
    this.share(need)
    this.poke()
  }

  drop(id: string): void {
    this.needs.delete(id)
  }

  dispose(): void {
    this.disposed = true
    this.unhear()
    window.clearTimeout(this.timer)
    this.frame?.remove()
  }

  /**
   * A board in another state of a route and mode shares the copy one has, as both draw the same page: a route's page
   * doesn't know the board's state.
   */
  private share(need: CopyNeed): void {
    const have = copies.get()

    if (have.has(need.key)) {
      return
    }

    for (const other of this.needs.values()) {
      const copy = have.get(other.key)

      if (other.url === need.url && copy?.drawn === need.drawn) {
        const stale = this.stale.get(other.key)

        // A copy a code change made stale is stale for the board that shares it too, until it's frozen again.
        if (stale !== undefined) {
          this.stale.set(need.key, stale)
        }

        copies.set(new Map(have).set(need.key, copy))

        return
      }
    }
  }

  /**
   * The app's files changed: the project's copies whose traces hold one are stale, and frozen again, nearest the view
   * first. Every copy the window keeps counts, a board's that isn't drawn now too, as with the Interact tool, so it isn't
   * shown from before the change when it comes back. Refused copies are asked for again, as the change may fix them.
   */
  private filesChanged(paths: readonly string[]): void {
    // Its copies' keys in the window start with it (`copyStoreKey`).
    const prefix = `${this.project}\n`
    const traced: TracedCopy[] = []

    for (const [key, copy] of copies.get()) {
      if (key.startsWith(prefix)) {
        // The copy's key in the window stands in for its state, so it's found again by it.
        traced.push({ key: { route: key, mode: copy.drawn, state: key }, files: copy.trace })
      }
    }

    const stale = staleCopies(paths, traced, { distance: new Map() }).map((key) => key.state)
    const have = copies.get()

    // A board whose first copy is still to come has no trace yet, so its snapshot, which may have been taken before the
    // change, is taken again.
    for (const need of this.needs.values()) {
      if (!have.has(need.key)) {
        stale.push(need.key)
      }
    }

    if (stale.length > 0) {
      this.changes++

      for (const key of stale) {
        this.stale.set(key, this.changes)
      }
    }

    this.refused.clear()
    this.poke()
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

  /** Whether a need's copy is missing, made in a mode since changed, or stale after a code change. */
  private wants(need: CopyNeed, have: ReadonlyMap<string, FrozenCopy>): boolean {
    const copy = have.get(need.key)

    return !copy || copy.drawn !== need.drawn || (this.stale.get(need.key) ?? -1) > copy.changes
  }

  /** What needs a copy first: needs with none, a stale one or one made in another mode, and not refused. */
  private missing(): CopyNeed[] {
    const have = copies.get()

    return [...this.needs.values()].filter((need) => this.wants(need, have) && !this.refused.has(refusal(need)))
  }

  /** What needs checking once nothing is missing: copies made from another mode's snapshot in their markup group. */
  private unchecked(): CopyNeed[] {
    const have = copies.get()

    return [...this.needs.values()].filter((need) => have.get(need.key)?.unchecked && !this.refused.has(refusal(need)))
  }

  private async run(): Promise<void> {
    this.running = true
    let failure: "gone" | "hung" | undefined

    try {
      while (!this.disposed) {
        const missing = this.missing()
        // Once nothing is missing, each mode a group's snapshot stood in for is checked with its own.
        const checking = missing.length === 0
        const needs = checking ? this.unchecked() : missing

        if (needs.length === 0) {
          break
        }

        const [url] = freezeOrder(needs.map((need) => ({ url: need.url, distance: need.rank() })))
        await unheld(this.project)
        await this.freeze(url!, units(needs.filter((need) => need.url === url)), checking)
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

  /**
   * Loads `url` fresh in the freezer's frame and takes a snapshot in its modes: one per markup group, which stands in
   * for the group's other modes until they're checked, or, when `checking`, one in each mode.
   */
  private async freeze(url: string, modes: readonly FreezeUnit[], checking: boolean): Promise<void> {
    const [first] = modes

    if (!first) {
      return
    }

    const changes = this.changes
    const groups = this.groups
    const drawn = modes.map((unit) => unit.drawn)

    const leaders = checking ? modes : pick(modes, groupLeaders(url, drawn, groups))

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

    const load: FrameLoad = { hellos: 0, ready: Promise.withResolvers<void>() }

    const channel = createChannel<ParityMethods, PageMethods>({
      checks: parityChecks,
      handlers: {
        "page.ready": () => {
          load.ready.resolve()

          return null
        },
        "page.moved": () => null,
        "page.height": () => null,
        "page.used": () => null,
        "page.scrolled": () => null,
        "page.zoom": () => null,
        "page.key": () => null
      }
    })

    const hello = (event: MessageEvent) => {
      const said = readHello(event.data)

      if (!said || said.frame !== id || event.origin !== origin || event.source !== frame.contentWindow) {
        return
      }

      // A page that loads again says hello again: it's loading until it's ready, and the snapshot it was taking goes,
      // as its new port replaces the old one, which fails what was asked on it.
      load.hellos++

      if (load.hellos > 1) {
        load.ready = Promise.withResolvers<void>()
      }

      const ports = new MessageChannel()
      channel.connect(domPort(ports.port1))
      frame.contentWindow?.postMessage({ parity: "port", frame: id }, origin, [ports.port2])
    }

    window.addEventListener("message", hello)
    this.frame = frame
    frame.src = src
    document.body.append(frame)

    try {
      for (const unit of leaders) {
        for (let reloads = 0; ; reloads++) {
          if (this.disposed) {
            return
          }

          const hellos = load.hellos

          try {
            await withDeadline(load.ready.promise, freezeLoadDeadline)
            await unheld(this.project)
            sizeFrame(frame, unit.viewport)
            await withDeadline(
              channel.request("mode.set", { mode: unit.mode, viewport: unit.viewport }),
              pageDeadlines["mode.set"]
            )
            await this.snapshot(channel, url, unit, origin, changes, checking ? [] : others(url, unit, modes, groups))
            break
          } catch (error) {
            // The page loaded again under the request: wait for it to be ready, and ask again.
            if (load.hellos !== hellos && reloads < reloadLimit) {
              continue
            }

            throw error
          }
        }
      }
    } finally {
      window.removeEventListener("message", hello)
      channel.close(new Error("The freezer is done with the page"))
      frame.remove()
      this.frame = undefined
    }
  }

  /**
   * Takes one mode's snapshot, checks and sanitizes it, gets the sheets it lists, and keeps its copy for every board
   * that draws the mode, and as a stand-in for the `group`'s other modes, which keep their own heights until they're
   * checked.
   */
  private async snapshot(
    channel: Channel<ParityMethods, PageMethods>,
    url: string,
    unit: FreezeUnit,
    origin: string,
    changes: number,
    group: readonly FreezeUnit[]
  ): Promise<void> {
    let taken: unknown

    try {
      taken = await withDeadline(
        channel.request("snapshot.take", { quiet: freezeQuiet }),
        snapshotDeadline(freezeQuiet)
      )
    } catch (error) {
      if (error instanceof Deadline) {
        this.refuse("deadline")
      }

      throw error
    }

    let snapshot: ReturnType<typeof parsePageSnapshot>

    try {
      snapshot = parsePageSnapshot(taken)
    } catch (error) {
      this.refuse(String(error).includes("at most") ? "cap" : "schema", unit)

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
      this.refuse(String(error).includes("at most") ? "cap" : "schema", unit)

      return
    }

    const copy: FrozenCopy = {
      location: snapshot.location,
      pageHeight: snapshot.pageHeight,
      root: root.root,
      body: body.body,
      sheets: snapshot.sheets.map(sheetId),
      origin,
      markup: snapshot.markup,
      drawn: unit.drawn,
      changes,
      // Until traces by builder (route-frames.md, step 6), any change to the app's files makes a copy stale.
      trace: "all"
    }

    this.groups = withMarkup(this.groups, url, unit.drawn, snapshot.markup)

    const next = new Map(copies.get())

    for (const need of unit.needs) {
      next.set(need.key, copy)
    }

    for (const other of group) {
      for (const need of other.needs) {
        const before = next.get(need.key)

        next.set(need.key, {
          ...copy,
          pageHeight: before?.drawn === other.drawn ? before.pageHeight : copy.pageHeight,
          drawn: other.drawn,
          unchecked: true
        })
      }
    }

    copies.set(next)
  }

  /** Tells telemetry a snapshot was refused, and for a cap or the schema, leaves its mode's boards as they are. */
  private refuse(reason: Refusal, unit?: FreezeUnit): void {
    track("routeFrame.refused", { reason })

    for (const need of unit?.needs ?? []) {
      this.refused.add(refusal(need))
    }
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

/** A refused copy's entry: its key and the mode as drawn, so a board whose mode changes is asked for again. */
function refusal(need: Pick<CopyNeed, "key" | "drawn">): string {
  return `${need.key}\n${need.drawn}`
}

/** A route's needs as the modes they're drawn in, each with the needs that share it, in the needs' order. */
function units(needs: readonly CopyNeed[]): FreezeUnit[] {
  const found = new Map<string, FreezeUnit>()

  for (const need of needs) {
    const unit = found.get(need.drawn)

    if (unit) {
      unit.needs.push(need)
    } else {
      found.set(need.drawn, { drawn: need.drawn, mode: need.mode, viewport: need.viewport, needs: [need] })
    }
  }

  return [...found.values()]
}

/** The units of these modes, in their order. */
function pick(modes: readonly FreezeUnit[], drawn: readonly string[]): FreezeUnit[] {
  return drawn.flatMap((each) => modes.filter((unit) => unit.drawn === each))
}

/** The other modes being frozen that drew `unit`'s markup at the last freeze, which its snapshot stands in for. */
function others(url: string, unit: FreezeUnit, modes: readonly FreezeUnit[], groups: MarkupGroups): FreezeUnit[] {
  return pick(modes, sharedMarkup(url, unit.drawn, groups).slice(1))
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
