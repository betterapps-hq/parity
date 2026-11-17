import type { PageLocation } from "@parity-app/extension/page"
import type { PageMode, PageSheet, PageSnapshot } from "@parity-app/frames"

/*
 * How Parity and the page runtime talk (docs/proposals/route-frames.md, "The page runtime's channel"): the frame's name,
 * the hello the page posts to Parity, the port Parity answers with, and each side's requests over
 * `@parity-app/channel`. It imports nothing at runtime, so Parity's window and the app's page both read it.
 */

/** The handshake's version. A page served by a builder from another copy of Parity is refused, not misread. */
export const pageProtocol = 1

/** What a frame's name starts with, followed by its `FrameName` as JSON. */
const namePrefix = "parity:"

/** The mode a route's page draws in, from `@parity-app/frames`, where Parity's side of route frames keeps it. */
export type { PageMode }

/** The mode's window, in CSS pixels, which the page's height is measured in. */
export interface PageViewport {
  width: number
  height: number
}

/** What a frame is for, which the page reads from `window.parityFrame.role`. */
export type FrameRole = "spare" | "live" | "freezer" | "picture"

/** What Parity names a frame with, so the page runtime in it knows who it is and whom to say hello to. */
export interface FrameName {
  protocol: number
  /** The frame's id, which its hello carries back. */
  frame: string
  /** Parity's origin, the only one the page posts its hello to. */
  parent: string
  role?: FrameRole
  /** The mode it opens in, so the app's first render is already in it; `mode.set` changes it later. */
  mode?: PageMode
  viewport?: PageViewport
}

/** A frame's name: `parity:` and its `FrameName` as JSON. */
export function frameName(name: FrameName): string {
  return `${namePrefix}${JSON.stringify(name)}`
}

/** What a window's name says, when Parity named it in this protocol's version; nothing otherwise. */
export function readFrameName(name: string): FrameName | undefined {
  if (!name.startsWith(namePrefix)) {
    return undefined
  }

  let said: unknown

  try {
    said = JSON.parse(name.slice(namePrefix.length))
  } catch {
    return undefined
  }

  if (
    !isObject(said) ||
    !("protocol" in said && said.protocol === pageProtocol) ||
    !("frame" in said && isText(said.frame)) ||
    !("parent" in said && isText(said.parent))
  ) {
    return undefined
  }

  const read: FrameName = { protocol: pageProtocol, frame: said.frame, parent: said.parent }

  if ("role" in said && isRole(said.role)) {
    read.role = said.role
  }

  const mode = "mode" in said ? readMode(said.mode) : undefined

  if (mode) {
    read.mode = mode
  }

  const viewport = "viewport" in said ? readViewport(said.viewport) : undefined

  if (viewport) {
    read.viewport = viewport
  }

  return read
}

/** What the page posts to Parity's origin first, so Parity can hand it a port. */
export interface PageHello {
  parity: "hello"
  protocol: number
  frame: string
}

/** A hello, when that's what arrived. */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- the I/O boundary: whatever a frame posted, read here
export function readHello(data: unknown): PageHello | undefined {
  return isObject(data) &&
    "parity" in data &&
    data.parity === "hello" &&
    "protocol" in data &&
    data.protocol === pageProtocol &&
    "frame" in data &&
    isText(data.frame)
    ? { parity: "hello", protocol: pageProtocol, frame: data.frame }
    : undefined
}

/** What Parity posts back to a hello, with the channel's port transferred beside it. */
export interface PagePort {
  parity: "port"
  frame: string
}

/** A port message for `frame`, when that's what arrived. */
export function isPortFor(data: unknown, frame: string): data is PagePort {
  return isObject(data) && "parity" in data && data.parity === "port" && "frame" in data && data.frame === frame
}

/** What Parity asks the page. */
export interface PageMethods {
  /**
   * Applies a mode: classes and attributes on `<html>`, its color scheme, and `prefers-color-scheme` answered with it.
   * `viewport` is the mode's window, which the page's height is measured in. The frame's size is Parity's to set.
   */
  "mode.set": { params: { mode: PageMode; viewport: PageViewport }; result: null }
  /**
   * Moves the app to `to` with its own router and answers once the new page has painted twice (at most 250 ms of
   * waiting for paints after the router lands). It fails when the page has no router to move it.
   */
  "route.go": { params: { to: string }; result: PageLocation }
  /** Scrolls the page to `top`. */
  "page.scroll": { params: { top: number }; result: null }
  /**
   * Takes a snapshot of the page in its mode, after it has been quiet for `quiet.ms` (at most `quiet.max`), or at once.
   * Its sheets come by content hash; `sheets.get` gives the ones Parity hasn't got.
   */
  "snapshot.take": { params: { quiet?: SnapshotQuiet }; result: PageSnapshot }
  /** The stylesheets with these ids, from the page's snapshots; an id it never read is left out. */
  "sheets.get": { params: { ids: string[] }; result: PageSheet[] }
  /**
   * Puts a style preview's rules in the page over its own, replacing the last; an empty string takes them out. They're
   * never in a snapshot, so a preview never becomes a copy.
   */
  "preview.set": { params: { css: string }; result: null }
  /**
   * Loads the page again where it is now, its path, query and hash kept, after answering: a page that keeps the modules
   * it loaded takes a code change this way.
   */
  "page.reload": { params: Record<string, never>; result: null }
}

/** The most text one `preview.set` may carry. */
export const maxPreviewCss = 1_000_000

/** How long a page waits to go quiet before a snapshot: `ms` without a change in its DOM, at most `max`. */
export interface SnapshotQuiet {
  ms: number
  max: number
}

/** The longest a page may be asked to wait for quiet before a snapshot, in milliseconds. */
export const maxSnapshotWait = 10_000

/** The most sheets one `sheets.get` may ask for. */
export const maxSheetIds = 1000

/** What the page asks Parity, which answers each with `null`. */
export interface ParityMethods {
  /**
   * The app has hydrated, and `router` is the page router that can move it, or none when it has none. Sent once per
   * load.
   */
  "page.ready": { params: { location: PageLocation; router: string | null }; result: null }
  /** The app moved by itself, from a link or a redirect, outside a `route.go`. */
  "page.moved": { params: { location: PageLocation }; result: null }
  /** The page's height in the mode's window changed, in CSS pixels, rounded up. */
  "page.height": { params: { height: number }; result: null }
  /** Someone pressed a key or the pointer in the page. Sent at most once a second while they do. */
  "page.used": { params: Record<string, never>; result: null }
}

/** How long Parity waits for each of its requests, in milliseconds, before it takes the frame to be stuck. */
export const pageDeadlines: Record<keyof PageMethods, number> = {
  "mode.set": 1000,
  // A route's first visit compiles it.
  "route.go": 15_000,
  "page.scroll": 1000,
  // Past the quiet it waits for, which `snapshotDeadline` adds.
  "snapshot.take": 2000,
  "sheets.get": 5000,
  "preview.set": 1000,
  "page.reload": 1000
}

/** How long Parity waits for a snapshot: the quiet it asked the page to wait for, and two seconds more. */
export function snapshotDeadline(quiet: SnapshotQuiet | undefined): number {
  return (quiet?.max ?? 0) + pageDeadlines["snapshot.take"]
}

/** A mode, when that's what arrived. */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- the I/O boundary: a mode as Parity sent it, read here
export function readMode(value: unknown): PageMode | undefined {
  if (
    !isObject(value) ||
    !("classes" in value && Array.isArray(value.classes) && value.classes.every(isText)) ||
    !("attributes" in value && isObject(value.attributes))
  ) {
    return undefined
  }

  const attributes: Record<string, string> = {}

  for (const [name, given] of Object.entries(value.attributes)) {
    if (!isText(given)) {
      return undefined
    }

    attributes[name] = given
  }

  const mode: PageMode = { classes: value.classes, attributes }

  if ("scheme" in value && (value.scheme === "dark" || value.scheme === "light")) {
    mode.scheme = value.scheme
  }

  return mode
}

/** A viewport, when that's what arrived. */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- the I/O boundary: a viewport as Parity sent it, read here
export function readViewport(value: unknown): PageViewport | undefined {
  return isObject(value) && "width" in value && isSize(value.width) && "height" in value && isSize(value.height)
    ? { width: value.width, height: value.height }
    : undefined
}

/** Whether a value that arrived is an object, whose fields can then be read by name with `in`. */
export function isObject(value: unknown): value is object {
  return value instanceof Object && !Array.isArray(value)
}

/** Whether a value that arrived is a string: one that `String` gives back unchanged. */
export function isText(value: unknown): value is string {
  return String(value) === value
}

function isSize(value: unknown): value is number {
  return Number.isFinite(value) && Number(value) > 0
}

function isRole(value: unknown): value is FrameRole {
  return value === "spare" || value === "live" || value === "freezer" || value === "picture"
}
