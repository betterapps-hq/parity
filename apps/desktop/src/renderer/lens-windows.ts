/**
 * The windows the app draws in: the main one, and each lens's own window, a same-origin child window the main one opens
 * and draws into (lens-layout.md). Shortcuts and other listeners that would be on `window` listen on each of these
 * instead, so they work in whichever window has the focus.
 */

import type { PagePort } from "@parity-app/page-runtime/protocol"
import { createContext, useContext } from "react"

declare global {
  interface Window {
    /** A lens window's own `postMessage`, defined in its page, so what it posts comes from it (`postAs`). */
    postFromHere?: (target: Window, message: PagePort, origin: string, transfer: Transferable[]) => void
  }
}

/** What's called with a window, and what it returns to stop when the window goes or the caller stops. */
type Listen = (target: Window) => (() => void) | void

const lensWindows = new Set<Window>()
const listening = new Set<Listen>()

/** What each listener left to undo in each lens window. */
const undo = new Map<Window, Map<Listen, () => void>>()

/** The lens windows open now. */
export function openLensWindows(): readonly Window[] {
  return [...lensWindows]
}

/**
 * The system clipboard of the window with the focus: a lens window's own, or else the main one's. The clipboard is only
 * open to a focused document, so copy and paste in a lens window go through its own.
 */
export function focusedClipboard(): Clipboard {
  const focused = [...lensWindows].find((opened) => !opened.closed && opened.document.hasFocus())

  return focused?.navigator.clipboard ?? navigator.clipboard
}

/**
 * Notes a lens window that opened, so `onEachWindow`'s listeners listen there too. Returns what notes it closed, which
 * is also done once its page unloads.
 */
export function addLensWindow(opened: Window): () => void {
  if (lensWindows.has(opened)) {
    return () => removeLensWindow(opened)
  }

  lensWindows.add(opened)
  const undone = new Map<Listen, () => void>()
  undo.set(opened, undone)

  for (const listen of listening) {
    const stop = listen(opened)

    if (stop) {
      undone.set(listen, stop)
    }
  }

  opened.addEventListener("pagehide", () => removeLensWindow(opened), { once: true })

  return () => removeLensWindow(opened)
}

function removeLensWindow(closed: Window): void {
  if (!lensWindows.delete(closed)) {
    return
  }

  for (const stop of undo.get(closed)?.values() ?? []) {
    stop()
  }

  undo.delete(closed)
}

/**
 * Calls `listen` with the main window and each lens window, now and as they open, and undoes what it returns as a lens
 * window closes. Returns what undoes it everywhere.
 */
export function onEachWindow(listen: Listen, main: Window = window): () => void {
  const stopMain = listen(main)
  listening.add(listen)

  for (const opened of lensWindows) {
    const stop = listen(opened)

    if (stop) {
      undo.get(opened)?.set(listen, stop)
    }
  }

  return () => {
    listening.delete(listen)
    stopMain?.()

    for (const undone of undo.values()) {
      undone.get(listen)?.()
      undone.delete(listen)
    }
  }
}

/** The window an event happened in: a lens's own, or the main one. */
export function windowOf(event: { readonly view?: Window | null }): Window {
  return event.view ?? window
}

/** The window a lens's canvas is in now, the main one or a lens's own, as `WindowPortals` provides it. */
export const ShownIn = createContext<Window | undefined>(undefined)

/** The window the canvas is in now. It changes as the lens's tab moves between windows. */
export function useShownIn(): Window {
  return useContext(ShownIn) ?? window
}

/**
 * Posts Parity's port message to `target`, a page in a frame in the window `from`, as `from`. A message's source is the window whose code posted it, so
 * the main window posting to a page in a lens window would come from the main window, which the page doesn't take as
 * Parity: it checks the message came from its parent. A lens window posts it with a function of its own page.
 */
export function postAs(
  from: Window,
  target: Window,
  message: PagePort,
  origin: string,
  transfer: Transferable[] = []
): void {
  const post = from === window ? undefined : from.postFromHere

  if (post) {
    post(target, message, origin, transfer)
  } else {
    target.postMessage(message, origin, transfer)
  }
}

/*
 * What a node is, in the main window's document or a lens window's. A node made in a lens window isn't an `instanceof`
 * the main window's `Element` or `Text`, so these tell it by its node type and namespace instead.
 */

type Maybe = EventTarget | null | undefined

/** Whether `value` is a DOM node, in any of the app's windows. */
export function isNode(value: Maybe): value is Node {
  return !!value && "nodeType" in value && "parentNode" in value
}

/** Whether `value` is an element. */
export function isElement(value: Maybe): value is Element {
  return isNode(value) && value.nodeType === 1
}

/** Whether `value` is an HTML element. */
export function isHTMLElement(value: Maybe): value is HTMLElement {
  return isElement(value) && value.namespaceURI === "http://www.w3.org/1999/xhtml"
}

/** Whether `value` is an SVG element. */
export function isSVGElement(value: Maybe): value is SVGElement {
  return isElement(value) && value.namespaceURI === "http://www.w3.org/2000/svg"
}

/** Whether `value` is an `<input>`. */
export function isHTMLInputElement(value: Maybe): value is HTMLInputElement {
  return isHTMLElement(value) && value.localName === "input"
}

/** Whether `value` is a `<style>`. */
export function isHTMLStyleElement(value: Maybe): value is HTMLStyleElement {
  return isHTMLElement(value) && value.localName === "style"
}

/** Whether `value` is a text node. */
export function isText(value: Maybe): value is Text {
  return isNode(value) && value.nodeType === 3
}

/** Whether `value` is a document fragment, a shadow root included. */
export function isDocumentFragment(value: Maybe): value is DocumentFragment {
  return isNode(value) && value.nodeType === 11
}

/** Whether `value` is a shadow root. */
export function isShadowRoot(value: Maybe): value is ShadowRoot {
  return isDocumentFragment(value) && "host" in value && "mode" in value
}

/** Whether `event` is a key event, from any of the app's windows. */
export function isKeyboardEvent(event: Event): event is KeyboardEvent {
  return "key" in event && "repeat" in event
}

/** Whether `event` is a mouse or pointer event, from any of the app's windows. */
export function isMouseEvent(event: Event): event is MouseEvent {
  return "button" in event && "clientX" in event && "buttons" in event
}
