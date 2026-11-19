import { colorSchemeAttribute, remProperty, rewriteFrameUnits, rootFontSizeProperty } from "@parity-app/core"
import {
  type BuiltCopy,
  buildingCopy,
  type FrozenElement,
  type PageMode,
  type PageRoot,
  runSteps
} from "@parity-app/frames"
import { copyRootAttribute, copyShadowStyle, type CopySheets, copySheets } from "./copy-sheets.ts"
import { prepareFrame } from "./frame.ts"

/*
 * Building a frozen copy in a frame's shadow root (docs/proposals/route-frames.md, "Frozen copies"), the same way on the
 * canvas, where a route board shows it, and in the render window, which captures it for the board's picture.
 */

/** What a copy is built from: its page's root and body, sanitized, and its sheets. */
export interface CopyContent extends CopySheets {
  root: PageRoot
  body: FrozenElement
}

/** A copy built in a host: its elements and the nodes they draw, its body stand-in, and what takes it down. */
export interface MountedCopy {
  built: BuiltCopy
  /** The stand-in for `<body>`, which carries its attributes. */
  body: Element | null
  unmount: () => void
}

/** Attributes on a copy's host that are Parity's own, which neither the page's root nor its mode may set. */
const hostAttributes = new Set([
  "class",
  "style",
  "id",
  "inert",
  "data-frame",
  "data-design",
  "data-mode",
  "data-state"
])

/** A copy built and not yet in its host: its elements and the nodes they draw, its body stand-in, and what puts it in. */
export interface PreparedCopy {
  built: BuiltCopy
  /** The stand-in for `<body>`, which carries its attributes. */
  body: Element | null
  /** Puts the copy in its host's shadow root, and gives what takes it out again. */
  mount: () => () => void
}

/**
 * Builds `copy` in `host`'s shadow root from `prepareFrame`, with a custom element registry of its own, styled with the
 * page's own stylesheets through `prepareCanvasCss`. `<html>`'s classes and attributes go on the host and on an element
 * around the body, `<body>`'s on the body stand-in, and the mode's on all three. `sheets` come after the page's own.
 */
export function mountCopy(
  host: HTMLElement,
  copy: CopyContent,
  mode: PageMode,
  viewport: { width: number; height: number },
  registry: CustomElementRegistry,
  sheets: readonly CSSStyleSheet[] = []
): MountedCopy {
  const { built, body, mount } = runSteps(preparingCopy(host, copy, mode, viewport, registry, sheets))

  return { built, body, unmount: mount() }
}

/**
 * Builds `copy` as `mountCopy` does, outside any document, pausing between steps so a board can spread it over several
 * frames while its picture shows (PAR-1336). Only `mount` touches the host.
 */
export function* preparingCopy(
  host: HTMLElement,
  copy: CopyContent,
  mode: PageMode,
  viewport: { width: number; height: number },
  registry: CustomElementRegistry,
  sheets: readonly CSSStyleSheet[] = []
): Generator<void, PreparedCopy> {
  // Inline styles' viewport lengths and `rem` measure the board, as its sheets' do.
  const built = yield* buildingCopy(document, copy.body, registry, {
    sheet: (css) => copyShadowStyle(copy, css, mode.scheme),
    inline: rewriteFrameUnits
  })

  const body = built.fragment.firstElementChild

  if (body) {
    body.classList.add(...mode.classes)
    setAttributes(body, Object.entries(mode.attributes))

    if (mode.scheme) {
      body.setAttribute(colorSchemeAttribute, mode.scheme)
    }
  }

  // `<html>`'s classes and attributes go on an element around the body, since selectors in the shadow root can't reach
  // the host: a page's `.font-page { … }` or `[data-theme]` rule for its root matches it and reaches the body by
  // inheritance, as on the page, so the body's own rules still win over it. It's as tall as the mode's window, as the
  // page's root was, so a body or `main` at `height: 100%` is too, while the rest of the page runs on below it.
  const root = document.createElementNS("http://www.w3.org/1999/xhtml", "div", { customElementRegistry: registry })
  // The mode's too, as the page had them on `<html>`, so `.dark body { … }` still finds the body.
  root.classList.add(...copy.root.classes, ...mode.classes)
  setAttributes(root, [...copy.root.attributes, ...Object.entries(mode.attributes)])
  root.setAttribute(copyRootAttribute, "")
  // Its font size is the root's, which `rem` measures: a `.font-page { font-size: 10px }` on it sets the copy's rem.
  root.setAttribute(
    "style",
    `display: block; height: ${viewport.height}px; ${rootFontSizeProperty}: 1em; ${remProperty}: var(${rootFontSizeProperty})`
  )
  root.append(built.fragment)

  const mount = () => {
    const target = prepareFrame(host, copySheets(copy), { classNames: [], attributes: {}, viewport, registry, sheets })
    // The stand-in `prepareFrame` made gives way to the copy's, which carries `<body>`'s attributes.
    target.parentElement?.replaceWith(root)
    const unroot = rootOnHost(host, copy.root, mode)

    return () => {
      unroot()
      // Nothing keeps the copy's elements once it's gone, as a sleeping frame keeps none.
      host.shadowRoot?.replaceChildren()
    }
  }

  return { built, body, mount }
}

/**
 * Puts `<html>`'s classes, attributes and inline style on the host, which the page's `html` and `:root` rules map to,
 * with the mode's classes and attributes. Returns what takes them off.
 */
function rootOnHost(host: HTMLElement, root: PageRoot, mode: PageMode): () => void {
  const classes = [...root.classes, ...mode.classes].filter((name) => !host.classList.contains(name))
  host.classList.add(...classes)

  const attributes = [...root.attributes, ...Object.entries(mode.attributes)].filter(
    ([name]) => !hostAttributes.has(name) && !host.hasAttribute(name)
  )

  setAttributes(host, attributes)

  const probe = document.createElement("div")
  probe.setAttribute("style", root.style)

  const properties: string[] = []

  for (let index = 0; index < probe.style.length; index++) {
    const name = probe.style.item(index)

    if (name !== "width" && name !== "height" && name !== "zoom") {
      host.style.setProperty(name, probe.style.getPropertyValue(name), probe.style.getPropertyPriority(name))
      properties.push(name)
    }
  }

  // The scheme the runtime put on `<html>` for the mode, which native controls draw in.
  if (mode.scheme && !properties.includes("color-scheme")) {
    host.style.setProperty("color-scheme", mode.scheme)
    properties.push("color-scheme")
  }

  return () => {
    host.classList.remove(...classes)

    for (const [name] of attributes) {
      host.removeAttribute(name)
    }

    for (const name of properties) {
      host.style.removeProperty(name)
    }
  }
}

function setAttributes(element: Element, attributes: readonly (readonly [string, string])[]): void {
  for (const [name, value] of attributes) {
    try {
      element.setAttribute(name, value)
    } catch {
      // A name the DOM won't take as an attribute's.
    }
  }
}
