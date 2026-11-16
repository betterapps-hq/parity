import { importsIn, type prepareCanvasCss, withImports, withMedia } from "@parity-app/core"
import { fetchStylesheet } from "./page-styles.ts"

type CanvasCss = ReturnType<typeof prepareCanvasCss>

/**
 * Stylesheets a project's code writes into a frame while it runs, drawn as its stylesheets are (PAR-1210). CSS-in-JS
 * writes its rules into whatever container it's given, and a library's decorator gives it the frame, as Chakra's and
 * MUI's give Emotion's cache. Those rules were written for a page, so `html`, `:root` and `body` in them name a page's
 * root and body, their media queries ask the window's width and colour scheme, and `@font-face` in them does nothing in
 * a shadow root. So a `<style>` the project's code puts in a frame is switched off there (`media="not all"`, so its
 * sheet still holds the rules its code inserts) and its CSS, its inserted rules included, is prepared as the project's
 * own stylesheets are (core's `prepareCanvasCss`) and drawn in that frame: the root becomes the frame's host, the body
 * its body, media queries the frame's, and what only the document can hold goes to the document. It's the frame's side
 * of what `page-styles.ts` does for what the project's code adds to the page, so no extension needs to know where it's
 * drawn.
 *
 * Only `<style>` elements are caught: a sheet the project's code constructs and adopts into a frame keeps its rules as
 * written, with their lengths measuring the frame (`frame.ts`).
 */

/** How a frame's caught CSS is prepared: core's `prepareCanvasCss`, against the project's origin. */
export type PrepareCss = (css: string) => CanvasCss

interface FrameEntry {
  shadow: ShadowRoot
  prepare: PrepareCss
  /** The project's origin, which caught CSS's `@import`s are read from. */
  origin: string
  /** What the frame draws its caught stylesheets with, adopted by the frame. */
  sheet: CSSStyleSheet
  /** The media the project gave each caught element, which the frame's copy no longer has. */
  media: Map<HTMLStyleElement, string | null>
  /** Caught elements whose rules its code changed through the CSSOM, so their text no longer says what they are. */
  edited: Set<HTMLStyleElement>
  shown: string
  scheduled: boolean
  /** Follows the frame's elements and their text. */
  observer?: MutationObserver
}

const muted = "not all"
const frames = new WeakMap<ShadowRoot, FrameEntry>()
const owners = new WeakMap<HTMLStyleElement, FrameEntry>()

/** Caught CSS with what it `@import`s in place, once read, by origin and CSS; the frames still waiting for each. */
const imported = new Map<string, string>()
const awaitingImports = new Map<string, Set<FrameEntry>>()

/** Each piece of CSS prepared once per way of preparing it: frames of a project share their CSS-in-JS rules. */
const preparedBy = new WeakMap<PrepareCss, Map<string, CanvasCss>>()

/**
 * What only the document can hold, `@font-face` and `@property`, from every frame's caught CSS, in one sheet the
 * document adopts. A font a frame's code declared stays declared, as it does in a page after the element that declared
 * it goes.
 */
let documentSheet: CSSStyleSheet | undefined
const documentRules = new Set<string>()

/**
 * Catches the stylesheets the project's code writes into `shadow` from now on, drawn with `prepare`. Gives back the
 * sheet they're drawn in, for the frame to adopt where the elements' own sheets would have been: before every adopted
 * sheet. Called again for the same frame, it keeps catching and gives back the same sheet.
 */
export function catchFrameStyles(shadow: ShadowRoot, prepare: PrepareCss, origin: string): CSSStyleSheet {
  const known = frames.get(shadow)

  if (known) {
    known.prepare = prepare
    known.origin = origin
    schedule(known)

    return known.sheet
  }

  const entry: FrameEntry = {
    shadow,
    prepare,
    origin,
    sheet: new CSSStyleSheet(),
    media: new Map(),
    edited: new Set(),
    shown: "",
    scheduled: false
  }

  frames.set(shadow, entry)

  for (const element of shadow.querySelectorAll("style")) {
    catchElement(entry, element)
  }

  entry.observer = new MutationObserver((records) => follow(entry, records))
  entry.observer.observe(shadow, {
    attributeFilter: ["media"],
    childList: true,
    characterData: true,
    subtree: true
  })

  return entry.sheet
}

/**
 * Tells the frame a caught element's rules changed through the CSSOM (`insertRule`, `deleteRule`), as CSS-in-JS
 * changes them in production. Does nothing for any other sheet.
 */
export function frameRulesEdited(sheet: CSSStyleSheet): void {
  const owner = sheet.ownerNode

  if (!(owner instanceof HTMLStyleElement)) {
    return
  }

  // Code that adds a `<style>` and inserts its rules straight away, as Emotion does, edits it before the frame's
  // observer has seen it go in.
  const root = owner.getRootNode()
  const entry = owners.get(owner) ?? (root instanceof ShadowRoot ? frames.get(root) : undefined)

  if (entry) {
    // A change to its text made before this edit, still queued, is followed first, so it doesn't undo the edit.
    follow(entry, entry.observer?.takeRecords() ?? [])
    catchElement(entry, owner)
    entry.edited.add(owner)
    schedule(entry)
  }
}

function follow(entry: FrameEntry, records: MutationRecord[]): void {
  let changed = false

  for (const record of records) {
    if (record.type === "attributes") {
      const element = record.target

      // The project changed its media, which it means for the stylesheet, even to `not all`. Read now, before it's
      // switched off again: Parity's own changes are never queued (see `setOwnMedia`).
      if (element instanceof HTMLStyleElement && owners.get(element) === entry) {
        entry.media.set(element, element.getAttribute("media"))
        setOwnMedia(entry, element)
        changed = true
      }

      continue
    }

    if (record.type === "characterData") {
      const element = record.target.parentElement

      if (element instanceof HTMLStyleElement && owners.get(element) === entry) {
        // New text replaces its rules, edits and all.
        entry.edited.delete(element)
        changed = true
      }

      continue
    }

    const parent = record.target

    // Text added to or taken from a caught element replaces its rules too.
    if (parent instanceof HTMLStyleElement && owners.get(parent) === entry) {
      entry.edited.delete(parent)
      changed = true
    }

    for (const node of record.addedNodes) {
      for (const element of stylesIn(node)) {
        catchElement(entry, element)
        changed = true
      }
    }

    if (record.removedNodes.length > 0) {
      changed = true
    }
  }

  if (changed) {
    schedule(entry)
  }
}

function stylesIn(node: Node): HTMLStyleElement[] {
  if (node instanceof HTMLStyleElement) {
    return [node]
  }

  return node instanceof Element || node instanceof DocumentFragment ? [...node.querySelectorAll("style")] : []
}

function catchElement(entry: FrameEntry, element: HTMLStyleElement): void {
  if (owners.get(element) === entry) {
    return
  }

  owners.set(element, entry)
  entry.media.set(element, element.getAttribute("media"))
  setOwnMedia(entry, element)
}

/**
 * Switches a caught element off. The project's changes queued before it are followed first, and this change, queued as
 * it's made, is dropped, so it's never taken for the project's.
 */
function setOwnMedia(entry: FrameEntry, element: HTMLStyleElement): void {
  if (element.getAttribute("media") === muted) {
    return
  }

  const queued = entry.observer?.takeRecords() ?? []

  if (queued.length > 0) {
    follow(entry, queued)
  }

  element.setAttribute("media", muted)
  entry.observer?.takeRecords()
}

/** Draws the frame's caught CSS again once, in a microtask, however many changes come before then. */
function schedule(entry: FrameEntry): void {
  if (entry.scheduled) {
    return
  }

  entry.scheduled = true
  queueMicrotask(() => {
    entry.scheduled = false
    show(entry)
  })
}

function show(entry: FrameEntry): void {
  const scoped: string[] = []
  let global = false

  // The caught elements still in the frame, in its order, as the page would cascade them.
  for (const element of entry.shadow.querySelectorAll("style")) {
    if (owners.get(element) !== entry) {
      continue
    }

    const media = entry.media.get(element) ?? null
    const sheet = element.sheet

    // Inserted rules are only in the CSSOM. Each is prepared on its own, so a rule added later costs only itself.
    const pieces =
      entry.edited.has(element) && sheet ? [...sheet.cssRules].map((rule) => rule.cssText) : [element.textContent ?? ""]

    for (const piece of pieces) {
      const prepared = preparedOnce(entry.prepare, withMedia(withFrameImports(entry, piece), media))
      scoped.push(prepared.scoped)

      if (prepared.global && !documentRules.has(prepared.global)) {
        documentRules.add(prepared.global)
        global = true
      }
    }
  }

  const text = scoped.join("\n")

  if (text !== entry.shown) {
    entry.shown = text
    entry.sheet.replaceSync(text)
  }

  if (global) {
    showDocumentRules()
  }
}

/**
 * Caught CSS with what it `@import`s in place, once read, as `page-styles.ts` reads a style element's: a frame's sheet
 * ignores `@import`. Until then it's its own CSS; the frames waiting for it draw again once it's in.
 */
function withFrameImports(entry: FrameEntry, css: string): string {
  if (importsIn(css).length === 0) {
    return css
  }

  const key = `${entry.origin}\n${css}`
  const done = imported.get(key)

  if (done !== undefined) {
    return done
  }

  const waiting = awaitingImports.get(key)

  if (waiting) {
    waiting.add(entry)

    return css
  }

  awaitingImports.set(key, new Set([entry]))
  void withImports(css, `${entry.origin}/`, fetchStylesheet).then((expanded) => {
    imported.set(key, expanded)

    for (const each of awaitingImports.get(key) ?? []) {
      schedule(each)
    }

    awaitingImports.delete(key)
  })

  return css
}

function preparedOnce(prepare: PrepareCss, css: string): CanvasCss {
  const cache = preparedBy.get(prepare) ?? new Map<string, CanvasCss>()
  preparedBy.set(prepare, cache)
  const known = cache.get(css)

  if (known) {
    return known
  }

  const made = prepare(css)
  cache.set(css, made)

  return made
}

function showDocumentRules(): void {
  if (!documentSheet) {
    documentSheet = new CSSStyleSheet()
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, documentSheet]
  }

  documentSheet.replaceSync([...documentRules].join("\n"))
}
