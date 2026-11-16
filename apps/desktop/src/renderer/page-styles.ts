import { hasFlag } from "./bits.ts"

/**
 * The boundary between a project's styles and Parity's own window (PAR-1187). A project's code runs in Parity's page,
 * so a stylesheet it adds there would restyle Parity's interface: a builder's development client adding the CSS a module
 * imports, a bundler's runtime linking a chunk's CSS, CSS-in-JS writing its rules, or the project's own code. Whichever
 * it is, a `<style>` or `<link rel="stylesheet">` that code from another origin than Parity's adds to the document is
 * switched off in the page (`media="not all"`, so its sheet still loads and its code can still edit it) and its CSS is
 * kept, by the origin of the code that added it, for that project's frames. No extension needs to know Parity shares a
 * page with the project.
 *
 * Only what's added straight into the document is caught: a stylesheet inside an element the project adds whole, and a
 * sheet it adopts into the document, aren't.
 */

/** A stylesheet a project's code added to the page, for its frames. */
export interface PageStylesheet {
  css: string
  /** What its `url()`s are relative to: a linked stylesheet's address, else the project's origin. */
  baseUrl: string
}

/** The stylesheets one origin's code added to the page, as they change. */
export interface PageStyles {
  /** Each stylesheet's CSS, in the order the page has them. */
  sheets(): PageStylesheet[]
  /** Calls `listener` once after any change, in a microtask. Gives back what stops it. */
  subscribe(listener: () => void): () => void
  /** Settles once the linked stylesheets asked for so far have been read. */
  settled(): Promise<void>
}

interface Caught {
  origin: string
  /** The `media` the project gave it, which the page's copy no longer has. */
  media: string | null
  /** A linked stylesheet's text once read, or `undefined` while it's read or if it can't be. */
  linked?: string
  /** Where `linked` came from in the end, after any redirect: what its relative `url()`s are relative to. */
  linkedFrom?: string
  /** The address `linked` was read from. */
  read?: string
  /** Whether its code changed its rules through the CSSOM, so its text no longer says what they are. */
  edited: boolean
}

const muted = "not all"
const caught = new Map<Element, Caught>()
const listeners = new Map<string, Set<() => void>>()

/** What settles once the linked stylesheets each origin's code added so far have been read. */
const read = new Map<string, Promise<void>>()
const changed = new Set<string>()
let installed = false

/** Catches what other origins' code adds to the page from now on. Once per page; later calls do nothing. */
export function guardPage(): void {
  if (installed) {
    return
  }

  installed = true
  changes = new MutationObserver(followChanges)
  removals = new MutationObserver(followRemovals)
  guardInsertions()
  guardRuleEdits()
}

/** The stylesheets code served from `origin` added to the page. */
export function pageStyles(origin: string): PageStyles {
  return {
    sheets: () =>
      [...caught]
        .filter(([element, entry]) => entry.origin === origin && inPage(element))
        .sort(([a], [b]) => (hasFlag(a.compareDocumentPosition(b), Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1))
        .flatMap(([element, entry]) => {
          const css = sheetText(element, entry)

          return css === undefined
            ? []
            : [{ css: withMedia(css, entry.media), baseUrl: baseUrl(element, entry, origin) }]
        }),
    subscribe(listener) {
      const set = listeners.get(origin) ?? new Set()
      listeners.set(origin, set)
      set.add(listener)

      return () => set.delete(listener)
    },
    async settled() {
      await read.get(origin)
    }
  }
}

/**
 * The origin of the code that called the method being guarded, or `undefined` when it's Parity's own, or there's no
 * telling (code with no address). `stack` is a V8 stack whose first frame is that code's.
 */
export function callerOrigin(stack: string, pageOrigin: string): string | undefined {
  for (const line of stack.split("\n")) {
    const address = /\b([a-z][a-z\d+.-]*:\/\/[^\s()]+?):\d+:\d+/i.exec(line)?.[1]

    if (!address) {
      continue
    }

    const origin = new URL(address).origin

    return origin === pageOrigin ? undefined : origin
  }

  return undefined
}

/**
 * `css` with each relative `url()` resolved against `address`, the linked stylesheet it was read from, as a browser
 * resolves them. Frames take it as a sheet of Parity's own, where they'd resolve against Parity's page. Addresses with
 * a scheme, from the root, and fragments stay as they are.
 */
export function relativeUrlsFrom(css: string, address: string): string {
  return css.replace(
    /url\(\s*(["']?)(?![a-z][a-z\d+.-]*:|\/|#)([^"')]+)\1\s*\)/gi,
    (_match, quote: string, path: string) => `url(${quote}${new URL(path, address).href}${quote})`
  )
}

/** `css` as a stylesheet with `media` applies it, when that's narrower than every medium. */
export function withMedia(css: string, media: string | null): string {
  const query = media?.trim()

  return !query || query === "all" ? css : `@media ${query} {\n${css}\n}`
}

function sheetText(element: Element, entry: Caught): string | undefined {
  if (element instanceof HTMLLinkElement) {
    return isStylesheet(element) && entry.read === element.href && entry.linked !== undefined
      ? relativeUrlsFrom(entry.linked, entry.linkedFrom ?? element.href)
      : undefined
  }

  const sheet = element instanceof HTMLStyleElement ? element.sheet : null

  if (entry.edited && sheet) {
    return [...sheet.cssRules].map((rule) => rule.cssText).join("\n")
  }

  return element.textContent ?? ""
}

function baseUrl(element: Element, entry: Caught, origin: string): string {
  return element instanceof HTMLLinkElement ? (entry.linkedFrom ?? element.href) : `${origin}/`
}

function isStylesheet(link: HTMLLinkElement): boolean {
  return link.relList.contains("stylesheet")
}

/** Tells `origin`'s listeners once, in a microtask, however many of its stylesheets change before then. */
function tell(origin: string): void {
  if (changed.size === 0) {
    queueMicrotask(() => {
      const origins = [...changed]
      changed.clear()

      for (const each of origins) {
        for (const listener of listeners.get(each) ?? []) {
          listener()
        }
      }
    })
  }

  changed.add(origin)
}

/** Reads a caught link's stylesheet, as its frames can't take it by address. */
function readLink(link: HTMLLinkElement, entry: Caught): void {
  const address = link.href

  if (!isStylesheet(link) || !address || entry.read === address) {
    return
  }

  entry.read = address
  delete entry.linked
  delete entry.linkedFrom

  const reading = fetch(address)
    .then(async (response) =>
      response.ok ? { text: await response.text(), from: response.url || address } : undefined
    )
    .catch(() => undefined)
    .then((answer) => {
      if (entry.read === address && answer) {
        entry.linked = answer.text
        entry.linkedFrom = answer.from
        tell(entry.origin)
      }
    })

  // Settles once this one and every one read before it for the origin have.
  read.set(
    entry.origin,
    Promise.all([read.get(entry.origin), reading]).then(() => undefined)
  )
}

/** Switches a stylesheet another origin's code adds off in the page, and keeps it for that origin's frames. */
function catchElement(element: HTMLStyleElement | HTMLLinkElement, origin: string, media: string | null): void {
  const known = caught.get(element)

  // Moved within the page: its frames take it in its new place.
  if (known) {
    watch(element)
    tell(known.origin)

    return
  }

  const entry: Caught = { origin, media, edited: false }
  caught.set(element, entry)
  watch(element)

  if (element instanceof HTMLLinkElement) {
    readLink(element, entry)
  }

  tell(origin)
}

/** The elements `changes` watches, which it goes on watching after they leave the page. */
const watched = new WeakSet<Element>()

function mute(element: Element): void {
  // A link that isn't a stylesheet keeps its media: a preload with none that matches isn't loaded, and its code may wait.
  if (element.getAttribute("media") !== muted && (!(element instanceof HTMLLinkElement) || isStylesheet(element))) {
    setOwnMedia(element, muted)
  }
}

/**
 * Sets an element's media as the boundary. The project's changes queued before it are followed first, and its own
 * change, queued as it's made, is dropped, so it's never taken for the project's.
 */
function setOwnMedia(element: Element, media: string | null): void {
  const watching = changes && watched.has(element) ? changes : undefined

  if (watching) {
    followChanges(watching.takeRecords())
  }

  if (media === null) {
    element.removeAttribute("media")
  } else {
    element.setAttribute("media", media)
  }

  watching?.takeRecords()
}

/** Follows caught elements' text and attributes, set up with the guard: Node has no `MutationObserver`. */
let changes: MutationObserver | undefined

/** Follows the parents of caught elements, to let go of an element taken out of the page. */
let removals: MutationObserver | undefined

function followChanges(records: MutationRecord[]): void {
  // Of several media changes to one element, only the last counts, with the media the project left it, read before
  // anything here switches the element off again.
  const lastMedia = new Map<Node, { record: MutationRecord; media: string | null }>()

  for (const record of records) {
    if (record.attributeName === "media" && record.target instanceof Element) {
      lastMedia.set(record.target, { record, media: record.target.getAttribute("media") })
    }
  }

  for (const record of records) {
    const element = record.target instanceof Element ? record.target : record.target.parentElement
    const entry = element ? caught.get(element) : undefined

    const media = element ? lastMedia.get(element) : undefined

    if (!element || !entry || (record.attributeName === "media" && media?.record !== record)) {
      continue
    }

    if (media && record.attributeName === "media") {
      // The project changed its media, which it means for the stylesheet, not for Parity's page, even to `not all`.
      entry.media = media.media
      mute(element)
    } else if (element instanceof HTMLLinkElement) {
      mute(element)
      readLink(element, entry)
    } else {
      entry.edited = false
    }

    tell(entry.origin)
  }
}

/** Whether a node is in Parity's own document tree: not out of the page, nor in a frame's shadow root. */
function inPage(node: Node): boolean {
  return node.isConnected && node.getRootNode() === document
}

/**
 * Lets go of every caught element no longer in the page's own tree: taken out itself or with an element around it, or
 * moved into a frame's shadow root, where it styles only that frame.
 */
function followRemovals(records: MutationRecord[]): void {
  if (!records.some((record) => record.removedNodes.length > 0)) {
    return
  }

  for (const [element, entry] of caught) {
    if (!inPage(element)) {
      caught.delete(element)
      // It leaves with the media the project gave it, so it's caught with that again if it comes back.
      setOwnMedia(element, entry.media)
      tell(entry.origin)
    }
  }
}

const parents = new WeakSet<Node>()

function watch(element: Element): void {
  if (changes) {
    watched.add(element)
  }

  changes?.observe(element, {
    attributes: true,
    attributeFilter: ["media", "href", "rel"],
    childList: true,
    characterData: true,
    subtree: true
  })

  // Its parent and every element around it, so it's let go of however it leaves the page.
  for (let node = element.parentNode; node; node = node.parentNode) {
    if (!parents.has(node)) {
      parents.add(node)
      removals?.observe(node, { childList: true })
    }
  }
}

/** The style and link elements among nodes about to be inserted. */
function stylesheetsIn(nodes: readonly unknown[]): (HTMLStyleElement | HTMLLinkElement)[] {
  const found: (HTMLStyleElement | HTMLLinkElement)[] = []

  for (const node of nodes) {
    if (node instanceof HTMLStyleElement || node instanceof HTMLLinkElement) {
      found.push(node)
    } else if (node instanceof DocumentFragment) {
      found.push(...node.querySelectorAll<HTMLStyleElement | HTMLLinkElement>("style, link"))
    }
  }

  return found
}

/**
 * Puts a node in a parent through `insert`, the original DOM method. A stylesheet among `inserted` going into the
 * document, added by code from another origin, is caught on the way: switched off before it's in the page, so the page
 * never draws with it. Only a style or link element, or a fragment, going into the document costs anything more.
 */
function guarded<R>(parent: Node | null, inserted: readonly unknown[], insert: () => R): R {
  const found = stylesheetsIn(inserted)

  if (found.length === 0 || !parent || !inPage(parent)) {
    return insert()
  }

  const holder = { stack: "" }
  Error.captureStackTrace(holder, guarded)
  // The first frame left is the wrapper that called this; the code that called it is next.
  const frames = holder.stack.split("\n").filter((line) => line.trimStart().startsWith("at "))
  const origin = callerOrigin(frames.slice(1).join("\n"), location.origin)

  if (!origin) {
    return insert()
  }

  const media = found.map((element) => element.getAttribute("media"))
  found.forEach(mute)
  const result = insert()
  found.forEach((element, index) => catchElement(element, origin, media[index] ?? null))

  return result
}

/** Every DOM method that puts a node in a parent goes through `guarded`. */
function guardInsertions(): void {
  const node = Object.getOwnPropertyDescriptors(Node.prototype)
  const element = Object.getOwnPropertyDescriptors(Element.prototype)
  const appendChild = node.appendChild.value!
  const insertBefore = node.insertBefore.value!
  const replaceChild = node.replaceChild.value!
  const append = element.append.value!
  const prepend = element.prepend.value!
  const replaceChildren = element.replaceChildren.value!
  const before = element.before.value!
  const after = element.after.value!
  const replaceWith = element.replaceWith.value!
  const insertAdjacentElement = element.insertAdjacentElement.value!

  // Each gives back the node it's given, as the originals do.
  Node.prototype.appendChild = function <T extends Node>(child: T): T {
    guarded(this, [child], () => appendChild.call(this, child))

    return child
  }

  Node.prototype.insertBefore = function <T extends Node>(child: T, reference: Node | null): T {
    guarded(this, [child], () => insertBefore.call(this, child, reference))

    return child
  }

  Node.prototype.replaceChild = function <T extends Node>(child: Node, old: T): T {
    guarded(this, [child], () => replaceChild.call(this, child, old))

    return old
  }

  Element.prototype.append = function (...nodes) {
    guarded(this, nodes, () => append.apply(this, nodes))
  }

  Element.prototype.prepend = function (...nodes) {
    guarded(this, nodes, () => prepend.apply(this, nodes))
  }

  Element.prototype.replaceChildren = function (...nodes) {
    guarded(this, nodes, () => replaceChildren.apply(this, nodes))
  }

  Element.prototype.before = function (...nodes) {
    guarded(this.parentNode, nodes, () => before.apply(this, nodes))
  }

  Element.prototype.after = function (...nodes) {
    guarded(this.parentNode, nodes, () => after.apply(this, nodes))
  }

  Element.prototype.replaceWith = function (...nodes) {
    guarded(this.parentNode, nodes, () => replaceWith.apply(this, nodes))
  }

  Element.prototype.insertAdjacentElement = function (where, inserted) {
    const parent = where === "beforebegin" || where === "afterend" ? this.parentNode : this

    return guarded(parent, [inserted], () => insertAdjacentElement.call(this, where, inserted))
  }
}

/** Rules a project's code adds to or takes from a caught stylesheet through the CSSOM, as CSS-in-JS does. */
function guardRuleEdits(): void {
  const prototype = CSSStyleSheet.prototype
  const original = Object.getOwnPropertyDescriptors(prototype)
  const insertRule = original.insertRule.value!
  const deleteRule = original.deleteRule.value!

  const edited = (sheet: CSSStyleSheet) => {
    const owner = sheet.ownerNode
    const entry = owner instanceof Element ? caught.get(owner) : undefined

    if (entry) {
      // A change to its text made before this edit, still queued, is followed first, so it doesn't undo the edit.
      if (changes) {
        followChanges(changes.takeRecords())
      }

      entry.edited = true
      tell(entry.origin)
    }
  }

  prototype.insertRule = function (rule, index) {
    const at = insertRule.call(this, rule, index)
    edited(this)

    return at
  }

  prototype.deleteRule = function (index) {
    deleteRule.call(this, index)
    edited(this)
  }
}
