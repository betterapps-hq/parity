// Compiled by the customer's build tool, with the guest: this runs in the same window as the canvas, and `react` is the
// customer's copy.
import type { FrameViewport } from "@parity/core"
import * as React from "react"

/**
 * Every frame's code runs in Parity's one window, so `matchMedia("(max-width: 767px)")` or `innerWidth` would describe
 * Parity's window, not the screen a frame stands for. A frame's window answers those questions for the frame:
 *
 * - while React renders the frame or runs its effects, at any time, where React's development build says which
 *   component it's working on, as it does on a dev server
 * - while the frame renders from the canvas, synchronously, so its first effects run then too
 * - through the media query lists and resize listeners the frame made
 * - otherwise, in an event handler or a timer, to the project's code, for the frame last drawn or used
 *
 * Parity's own code always gets Parity's window.
 */
export interface FrameWindow {
  /** Runs the frame's code as if in its own window. */
  run<T>(work: () => T): T
  /** The frame's window changed size: media queries that change and resize listeners hear about it. */
  resize(viewport: FrameViewport): void
  dispose(): void
}

interface Scope {
  viewport: FrameViewport
  /** Media query lists with change listeners. */
  queries: Set<FrameQueryList>
  resizeListeners: Set<EventListenerOrEventListenerObject>
}

/** The frames whose code is running, innermost last. */
const running: Scope[] = []
/** The frame last drawn, pointed at, typed in or focused. */
let active: Scope | undefined
/** Frames by the element React renders them into, to tell which one an event or a component is in. */
const frames = new Map<unknown, Scope>()

/** Gives the frame React renders into `container` its own window, the size of `viewport`. */
export function frameWindow(container: Element, viewport: FrameViewport): FrameWindow {
  install()
  const self: Scope = { viewport, queries: new Set(), resizeListeners: new Set() }
  frames.set(container, self)
  const run = <T>(work: () => T): T => {
    if (frames.get(container) === self) active = self
    running.push(self)
    try {
      return work()
    } finally {
      running.pop()
    }
  }
  return {
    run,
    resize(next) {
      if (next.width === self.viewport.width && next.height === self.viewport.height) return
      self.viewport = next
      run(() => {
        for (const query of self.queries) query.update()
        const event = new Event("resize")
        for (const listener of self.resizeListeners) {
          if (typeof listener === "function") listener.call(window, event)
          else listener.handleEvent(event)
        }
      })
    },
    dispose() {
      frames.delete(container)
      if (active === self) active = undefined
      self.queries.clear()
      self.resizeListeners.clear()
    }
  }
}

/**
 * The frame asking: the one React is working on, else the one whose code is running, else the one last used if the
 * project's code is asking.
 */
function asking(): Scope | undefined {
  const fiber = workingOn()
  if (fiber) return frames.get(rootOf(fiber))
  return running.at(-1) ?? (active && projectIsAsking() ? active : undefined)
}

interface Fiber {
  return: Fiber | null
  stateNode: unknown
}

const internals = React as unknown as {
  __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE?: { A?: { getOwner?(): Fiber | null } | null }
}

/** The component React's development build is rendering or running effects for, as its warnings name it. */
function workingOn(): Fiber | null {
  return internals.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE?.A?.getOwner?.() ?? null
}

/** The element a component's React root renders into. */
function rootOf(fiber: Fiber): unknown {
  let top = fiber
  while (top.return) top = top.return
  return (top.stateNode as { containerInfo?: unknown } | null)?.containerInfo
}

/**
 * Where the code on each line of a stack trace came from, as in `at render (http://localhost:5173/src/App.tsx:12:7)`: a
 * URL, or `<anonymous>` for code evaluated without one, as in DevTools. Built-in functions, as in
 * `at Array.map (<anonymous>)`, have no position, so they aren't listed.
 */
const stackLine = /([^\s()]+):\d+:\d+\)?$/

function callers(): string[] {
  return (new Error().stack ?? "").split("\n").flatMap((line) => {
    const url = stackLine.exec(line)?.[1]
    return url ? [url] : []
  })
}

function siteOf(url: string): string | undefined {
  try {
    const { protocol, host } = new URL(url)
    return protocol + host
  } catch {
    return undefined
  }
}

/** Where the project's code comes from, the same server as this module, unless Parity's comes from there too. */
let projectSite: string | undefined

/**
 * Whether the code asking is the project's, rather than Parity's or its libraries' (tldraw reads `innerHeight`): all of
 * it was served from the project's server. Code evaluated without a source, from DevTools or a script driving Parity,
 * is Parity's.
 */
function projectIsAsking(): boolean {
  return projectSite !== undefined && callers().every((url) => siteOf(url) === projectSite)
}

let installed = false

/** Answers the window's size questions for the frame asking. Once per window; with no frame asking, nothing changes. */
function install(): void {
  if (installed) return
  installed = true
  const own = siteOf(callers()[0] ?? "")
  // In Parity's own Storybook the project and Parity share a server, so only a frame's own work gets its window.
  projectSite = own === siteOf(location.href) ? undefined : own

  const realMatchMedia = window.matchMedia.bind(window)
  const real = (condition: string) => realMatchMedia(condition).matches
  window.matchMedia = (query: string) => {
    const parsed = sizeQuery(query)
    const frame = parsed ? asking() : undefined
    if (!frame || !parsed) return realMatchMedia(query)
    return new FrameQueryList(query, parsed, frame, real) as unknown as MediaQueryList
  }

  for (const [name, side] of [
    ["innerWidth", "width"],
    ["innerHeight", "height"],
    ["outerWidth", "width"],
    ["outerHeight", "height"]
  ] as const) {
    answer(window, name, (frame) => frame.viewport[side])
  }
  answer(document.documentElement, "clientWidth", (frame) => frame.viewport.width)
  answer(document.documentElement, "clientHeight", (frame) => frame.viewport.height)

  // A frame's resize listeners hear its window resize, not Parity's.
  const add = window.addEventListener.bind(window)
  const remove = window.removeEventListener.bind(window)
  window.addEventListener = ((
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions
  ) => {
    const frame = type === "resize" && listener ? asking() : undefined
    if (!frame || !listener) return add(type, listener as EventListenerOrEventListenerObject, options)
    frame.resizeListeners.add(listener)
    if (typeof options === "object") {
      options.signal?.addEventListener("abort", () => frame.resizeListeners.delete(listener), { once: true })
    }
  }) as typeof window.addEventListener
  window.removeEventListener = ((
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions
  ) => {
    if (type === "resize" && listener) for (const frame of frames.values()) frame.resizeListeners.delete(listener)
    remove(type, listener as EventListenerOrEventListenerObject, options)
  }) as typeof window.removeEventListener

  // Using a frame makes it the one its project's later code is about, as in a handler's timer or the render it causes.
  const use = (event: Event) => {
    for (const node of event.composedPath()) {
      const frame = frames.get(node)
      if (frame) return void (active = frame)
    }
  }
  for (const type of ["pointerdown", "pointerover", "keydown", "focusin", "wheel", "touchstart"]) {
    add(type, use, { capture: true, passive: true })
  }
}

/** Makes a size property read the frame asking's, and the real one otherwise. */
function answer(target: object, name: string, value: (frame: Scope) => number): void {
  let owner: object | null = target
  let real: PropertyDescriptor | undefined
  while (owner && !(real = Object.getOwnPropertyDescriptor(owner, name))) owner = Object.getPrototypeOf(owner)
  const read = real?.get ?? (() => real?.value as number)
  Object.defineProperty(target, name, {
    configurable: true,
    enumerable: real?.enumerable ?? true,
    get() {
      const frame = asking()
      return frame ? value(frame) : read.call(target)
    }
  })
}

type ChangeListener = ((this: MediaQueryList, event: MediaQueryListEvent) => unknown) | null

/** A media query about size, answered for its frame, which tells its listeners when the frame's answer changes. */
class FrameQueryList extends EventTarget {
  readonly media: string
  readonly #query: SizeQuery
  readonly #frame: Scope
  readonly #real: (condition: string) => boolean
  #matches: boolean
  #onchange: ChangeListener = null
  readonly #listeners = new Set<unknown>()

  constructor(media: string, query: SizeQuery, frame: Scope, real: (condition: string) => boolean) {
    super()
    this.media = media
    this.#query = query
    this.#frame = frame
    this.#real = real
    this.#matches = matchesQuery(query, frame.viewport, real)
  }

  get matches(): boolean {
    return this.#matches
  }

  get onchange(): ChangeListener {
    return this.#onchange
  }

  set onchange(listener: ChangeListener) {
    this.#onchange = listener
    this.#watch()
  }

  override addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions
  ): void {
    super.addEventListener(type, listener, options)
    if (type === "change" && listener) this.#listeners.add(listener)
    this.#watch()
  }

  override removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions
  ): void {
    super.removeEventListener(type, listener, options)
    if (type === "change") this.#listeners.delete(listener)
    this.#watch()
  }

  addListener(listener: ChangeListener): void {
    if (listener) this.addEventListener("change", listener as EventListener)
  }

  removeListener(listener: ChangeListener): void {
    if (listener) this.removeEventListener("change", listener as EventListener)
  }

  update(): void {
    const matches = matchesQuery(this.#query, this.#frame.viewport, this.#real)
    if (matches === this.#matches) return
    this.#matches = matches
    const event = new MediaQueryListEvent("change", { matches, media: this.media })
    this.#onchange?.call(this as unknown as MediaQueryList, event)
    this.dispatchEvent(event)
  }

  /** Lists are made on every render by some hooks, so the frame keeps only the ones listened to. */
  #watch(): void {
    if (this.#onchange || this.#listeners.size > 0) this.#frame.queries.add(this)
    else this.#frame.queries.delete(this)
  }
}

/** A media query's comma-separated alternatives, each a list of conditions that all hold, or don't with `not`. */
export type SizeQuery = { negate: boolean; conditions: Condition[] }[]

/** A test of the frame's size, or a condition to ask the real window, such as `(hover: hover)` or `print`. */
type Condition = ((viewport: FrameViewport) => boolean) | string

/**
 * A media query with a condition on size, such as `(max-width: 767px)` or `screen and (width >= 40rem) and (hover:
 * hover)`. Undefined for one without, such as `(prefers-color-scheme: dark)`, and for nesting it doesn't read, which
 * the real window answers.
 */
export function sizeQuery(query: string): SizeQuery | undefined {
  let sized = false
  const alternatives: SizeQuery = []
  for (const alternative of query.toLowerCase().split(",")) {
    let text = alternative.trim()
    const negate = text.startsWith("not ")
    text = text.replace(/^(not|only)\s+/, "")
    const conditions: Condition[] = []
    for (const part of text.split(/\s+and\s+/)) {
      if (part === "all" || part === "screen") continue
      if (/^[a-z-]+$/.test(part)) {
        conditions.push(part)
        continue
      }
      const size = sizeCondition(part)
      if (size === null) return undefined
      if (size) sized = true
      conditions.push(size ?? part)
    }
    alternatives.push({ negate, conditions })
  }
  return sized ? alternatives : undefined
}

export function matchesQuery(query: SizeQuery, viewport: FrameViewport, real: (condition: string) => boolean): boolean {
  return query.some(
    ({ negate, conditions }) =>
      negate !==
      conditions.every((condition) => (typeof condition === "string" ? real(condition) : condition(viewport)))
  )
}

/** One parenthesized condition on size as a test; undefined for one not on size, and null for one this can't read. */
function sizeCondition(part: string): ((viewport: FrameViewport) => boolean) | undefined | null {
  const inner = /^\((.*)\)$/.exec(part)?.[1]?.trim()
  const onSize = /\b(width|height|aspect-ratio|orientation)\b/
  if (inner === undefined || /[()]|\bor\b|\bnot\b/.test(inner))
    return inner !== undefined && !onSize.test(inner) ? undefined : null
  const feature = /^(min-|max-)?(width|height|aspect-ratio)\s*:\s*(.+)$/.exec(inner)
  if (feature) {
    const [, bound, name, raw] = feature
    const value = (name === "aspect-ratio" ? ratio : length)(raw!)
    if (value === undefined) return null
    const measure = measurer(name!)
    return (viewport) => {
      if (bound === "min-") return measure(viewport) >= value
      if (bound === "max-") return measure(viewport) <= value
      return measure(viewport) === value
    }
  }
  const orientation = /^orientation\s*:\s*(portrait|landscape)$/.exec(inner)?.[1]
  if (orientation) return (viewport) => (viewport.height >= viewport.width ? "portrait" : "landscape") === orientation
  // Range syntax: `width >= 40rem`, `400px <= width < 800px`.
  const range = /^(?:([^<>=]+?)\s*(<=|<|>=|>|=)\s*)?(width|height|aspect-ratio)(?:\s*(<=|<|>=|>|=)\s*([^<>=]+))?$/.exec(
    inner
  )
  if (range && (range[1] !== undefined || range[5] !== undefined)) {
    const [, low, lowOperator, name, highOperator, high] = range
    const parse = name === "aspect-ratio" ? ratio : length
    const lowValue = low === undefined ? undefined : parse(low)
    const highValue = high === undefined ? undefined : parse(high)
    if ((low !== undefined && lowValue === undefined) || (high !== undefined && highValue === undefined)) return null
    const measure = measurer(name!)
    return (viewport) =>
      (lowValue === undefined || compare(lowValue, lowOperator!, measure(viewport))) &&
      (highValue === undefined || compare(measure(viewport), highOperator!, highValue))
  }
  return onSize.test(inner) ? null : undefined
}

function measurer(name: string): (viewport: FrameViewport) => number {
  if (name === "width") return (viewport) => viewport.width
  if (name === "height") return (viewport) => viewport.height
  return (viewport) => viewport.width / viewport.height
}

function compare(left: number, operator: string, right: number): boolean {
  switch (operator) {
    case "<":
      return left < right
    case "<=":
      return left <= right
    case ">":
      return left > right
    case ">=":
      return left >= right
    default:
      return left === right
  }
}

/** A length in pixels, with rem and em as 16px, as media queries take them. */
function length(raw: string): number | undefined {
  const match = /^(-?[\d.]+)(px|rem|em)?$/.exec(raw.trim())
  const number = Number(match?.[1])
  if (!match || !Number.isFinite(number)) return undefined
  return match[2] === "rem" || match[2] === "em" ? number * 16 : number
}

function ratio(raw: string): number | undefined {
  const match = /^([\d.]+)\s*(?:\/\s*([\d.]+))?$/.exec(raw.trim())
  const value = Number(match?.[1]) / Number(match?.[2] ?? 1)
  return match && Number.isFinite(value) ? value : undefined
}
