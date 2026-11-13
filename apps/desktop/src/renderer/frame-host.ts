import type { MountHandle, MountOptions, RenderNode } from "@parity-app/core"
import { type FrameMode, frameSetup } from "./frame-setup.ts"
import { adoptFrameSheet, prepareFrame, setDrawnNodes, setFrameViewport, showFrameRules, whenDrawn } from "./frame.ts"
import type { LoadedGuest } from "./guest.ts"

/**
 * A frame's host side, in one place: mounting a design in a frame, the nodes it draws, and taking it apart, for the
 * canvas's frames (`ModeView`) and the offscreen page's (`render.ts`) alike. A frame is a shadow root on its host
 * element, and only this module and `frame.ts` know that: the rest of the app asks here for what it reads of a frame.
 */

/** What a frame mounts: the project's guest and styles, the mode, and what the guest reports back. */
export interface FrameMount {
  loaded: Pick<LoadedGuest, "guest" | "sheet" | "themeAttributes" | "rules">
  mode: FrameMode
  /** Stylesheets after the project's own, such as the classes Parity writes for its layers. */
  sheets?: readonly CSSStyleSheet[]
  /** The tree drawn first, with its rules. Without one the frame starts empty, until `update`. */
  tree?: RenderNode[]
  onError?: MountOptions["onError"]
  onFailures?: MountOptions["onFailures"]
}

/** A design mounted in a frame, from `mountFrame`. */
export interface MountedFrame {
  /** The element the guest draws the design in. */
  target: HTMLElement
  /** Draws `tree` in place, keeping its components' state, with its rules changed in the same task. */
  update(tree: RenderNode[]): void
  /** The window the frame stands for changed size: its styles and its code measure the new one. */
  resize(viewport: FrameMode["viewport"]): void
  /** Calls `drawn` once the design is in the frame. Gives back what stops waiting. */
  whenDrawn(drawn: (target: HTMLElement) => void): () => void
  /** Adds a stylesheet after the frame's own, as a component preview's for what it draws inside itself. */
  adopt(sheet: CSSStyleSheet): void
  /**
   * Takes the design out of the frame: lookups stop going through its guest, the frame is emptied, and the guest
   * unmounts. `soon` lets the guest go in a microtask, so never inside a React commit of the caller's, should the two
   * share a React; the frame is emptied straight away either way, so a design mounted after it starts clean.
   */
  unmount(options?: { soon?: boolean }): void
}

/** The mount each host shows now, so a mount taken apart after the next one started leaves the new one alone. */
const current = new WeakMap<Element, MountedFrame>()

/**
 * Mounts a design in `host`: prepares the frame for the mode, with the project's styles, gives it the tree's rules,
 * mounts the guest, and has the frame's node lookups (`findNodeElements` and the rest in frame.ts) go through what the
 * guest says it drew. The frame's host stays the caller's, as do its size and where it sits.
 */
export function mountFrame(host: HTMLElement, mount: FrameMount): MountedFrame {
  const { loaded } = mount
  const { environment, options } = frameSetup(mount.mode, loaded.themeAttributes, mount.sheets)
  const target = prepareFrame(host, loaded.sheet, environment)
  flushWatchers(host)
  const tree = mount.tree ?? []

  if (tree.length > 0) {
    showFrameRules(host, loaded.rules(tree))
  }

  const mountOptions: MountOptions = { ...options }

  if (mount.onError) {
    mountOptions.onError = mount.onError
  }

  if (mount.onFailures) {
    mountOptions.onFailures = mount.onFailures
  }

  const handle: MountHandle = loaded.guest.mount(target, tree, mountOptions)
  setDrawnNodes(host, handle.drawnNodes?.bind(handle))
  let mounted = true

  const frame: MountedFrame = {
    target,
    update(next) {
      if (!mounted) {
        return
      }

      showFrameRules(host, loaded.rules(next))
      handle.update(next)
    },
    resize(viewport) {
      setFrameViewport(host, viewport)

      if (mounted) {
        handle.resize?.(viewport)
      }
    },
    whenDrawn: (drawn) => whenDrawn(target, () => drawn(target)),
    adopt: (sheet) => adoptFrameSheet(host, sheet),
    unmount({ soon = false } = {}) {
      if (!mounted) {
        return
      }

      mounted = false

      if (current.get(host) === frame) {
        current.delete(host)
        setDrawnNodes(host, undefined)
        host.shadowRoot?.replaceChildren()
      }

      if (soon) {
        queueMicrotask(() => handle.unmount())
      } else {
        handle.unmount()
      }
    }
  }

  current.set(host, frame)

  return frame
}

/** What `watchFrame` watches a frame for, besides its elements and text changing. */
export interface FrameWatch {
  /** Attributes changing too: all of them, or those named. */
  attributes?: boolean | string[]
  /** An image or other resource loading in the frame. */
  loads?: boolean
}

/** Watchers asked for before their frame was first mounted, which start when it is. */
const waiting = new WeakMap<Element, Set<() => void>>()

/**
 * Calls `changed` whenever what a frame draws changes: an element added or removed or its text changed, anywhere in it,
 * and as `watch` asks, an attribute or a resource loading. A frame not mounted yet is watched from when it is. Gives back
 * what stops watching.
 */
export function watchFrame(host: Element, changed: () => void, watch: FrameWatch = {}): () => void {
  let stop: (() => void) | undefined
  let stopped = false

  const start = () => {
    const root = host.shadowRoot

    if (stopped || !root) {
      return
    }

    const observer = new MutationObserver(changed)
    const init: MutationObserverInit = { subtree: true, childList: true, characterData: true }

    if (Array.isArray(watch.attributes)) {
      init.attributeFilter = watch.attributes
    } else if (watch.attributes) {
      init.attributes = true
    }

    observer.observe(root, init)

    if (watch.loads) {
      root.addEventListener("load", changed, true)
    }

    stop = () => {
      observer.disconnect()
      root.removeEventListener("load", changed, true)
    }
  }

  if (host.shadowRoot) {
    start()
  } else {
    let starts = waiting.get(host)

    if (!starts) {
      waiting.set(host, (starts = new Set()))
    }

    starts.add(start)
    stop = () => starts.delete(start)
  }

  return () => {
    stopped = true
    stop?.()
  }
}

function flushWatchers(host: Element): void {
  const starts = waiting.get(host)

  if (!starts) {
    return
  }

  waiting.delete(host)

  for (const start of starts) {
    start()
  }
}

/**
 * The root of what a frame draws, to query or walk: its body is the first thing in it, and what the guest puts beside
 * it is in it too. Nothing before the frame is first mounted.
 */
export function frameContent(host: Element): ParentNode | undefined {
  return host.shadowRoot ?? undefined
}

/** The element in a frame that stands in for its page's `<body>`, which the design is drawn in. */
export function frameBody(host: Element): HTMLElement | undefined {
  const body = host.shadowRoot?.firstElementChild

  return body instanceof HTMLElement ? body : undefined
}

/** Whether a frame has drawn its design: one of its nodes is in it. */
export function frameDrawsDesign(host: Element): boolean {
  return !!host.shadowRoot?.querySelector("[data-canvas-node]")
}

/** Whether an animation or a transition runs in a frame. */
export function frameAnimates(host: Element): boolean {
  return !!host.shadowRoot?.getAnimations().some((animation) => animation.playState === "running")
}

/** Takes focus away from whatever has it in a frame, so its keys go back to the page around it. */
export function blurFrame(host: Element): void {
  const focused = host.shadowRoot?.activeElement

  if (focused instanceof HTMLElement) {
    focused.blur()
  }
}
