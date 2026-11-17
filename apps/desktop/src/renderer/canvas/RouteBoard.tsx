import {
  colorSchemeAttribute,
  type DesignNode,
  type DrawnNodes,
  remProperty,
  rootFontSizeProperty,
  rewriteFrameUnits,
  type FrameGeometry,
  type ResolvedMode
} from "@parity-app/core"
import {
  elementLayers,
  frozenSnapshots,
  landedElsewhere,
  pageMode,
  readStyles,
  styleOfElement
} from "@parity-app/editor"
import { buildCopy, type PageMode, type PageRoot } from "@parity-app/frames"
import { useEffect, useLayoutEffect, useMemo, useRef } from "react"
import { findFrames, findNodeElements, prepareFrame, registerFrame, setDrawnNodes, setInnerNodes } from "../frame.ts"
import { useProject } from "./context.ts"
import { copyRootAttribute, copyShadowStyle, copySheets, type FrozenCopy, useFrozenCopy } from "./freezer.ts"
import { tokenPreviewSheet, useTokenPreview } from "./page-changes.ts"
import { routePagesFile, setCopyLayers, setPageLanding } from "./route-pages.ts"

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

/**
 * A route board's frame drawn from a frozen copy of its page (docs/proposals/route-frames.md, PAR-1262): the page's DOM
 * without its scripts, made by the project's freezer frame, built in a shadow root from `prepareFrame` with a custom
 * element registry of its own, and styled with the page's own stylesheets through `prepareCanvasCss`. `<html>`'s
 * classes and attributes go on the host, `<body>`'s on the body stand-in, and the mode's on both. Its host is a frame,
 * registered under the page's design with its mode and state, so selection, hit-testing and outlines find the copy's
 * elements by their ids (`buildCopy`'s `DrawnNodes`). It's as tall as the page in the mode's window, unless the frame has
 * a height of its own, which clips it. It's inert, so its links and forms can't be followed or sent, and nothing in it
 * takes focus. Until its copy comes, a placeholder stands in at the window's height. Where the page landed, when it
 * isn't the route's own path, goes to the board's warning and Layers; the primary frame's copy gives Layers its layers.
 * Its copy is kept by `CopyKey`, its route, mode and state, and frozen again when the app's code changes (PAR-1264).
 */
export function RouteBoard({
  url,
  project,
  design,
  state,
  frame,
  mode,
  scale,
  primary,
  rank,
  asleep
}: {
  url: string
  project: string
  /** The page's design, by key. */
  design: string
  state: string
  frame: FrameGeometry
  mode: ResolvedMode
  scale: number
  /** The board's main frame, whose copy gives Layers what the page draws. */
  primary: boolean
  /** How urgent the copy is, lowest first, from where the frame is against the view. */
  rank: () => number
  /**
   * Whether the board sleeps, small on screen or out of view: it lets go of its copy's elements and shows a placeholder,
   * until pictures come (route-frames.md, step 6), and builds the copy again from what it kept when it wakes.
   */
  asleep: boolean
}) {
  const { doc, tokens } = useProject()
  const host = useRef<HTMLDivElement>(null)
  const registry = useRef<CustomElementRegistry>(undefined)
  const drawn = useMemo(() => pageMode(mode), [mode])

  const viewport = useMemo(
    () => ({ width: frame.viewport.width, height: frame.viewport.height }),
    [frame.viewport.width, frame.viewport.height]
  )

  const key = useMemo(() => ({ route: url, mode: mode.id, state }), [url, mode.id, state])
  const copy = useFrozenCopy(project, key, drawn, viewport, rank)
  const height = frame.height ?? Math.max(viewport.height, copy?.pageHeight ?? 0)

  // Token values edited and not saved show in the copy as in the design frames, through the project's preview sheet.
  useTokenPreview(project, tokens)

  // Selecting, outlining and agents find the copy as they find a design's frames.
  useLayoutEffect(() => registerFrame(host.current!, design), [design])

  useLayoutEffect(() => {
    const element = host.current

    if (!copy || !element || asleep) {
      return undefined
    }

    registry.current ??= new CustomElementRegistry()

    return showCopy(element, copy, drawn, viewport, registry.current, tokenPreviewSheet(project))
  }, [asleep, copy, drawn, viewport, project])

  const elsewhere = copy ? landedElsewhere(url, copy.location.path) : undefined

  // The board's warning and Layers say where the page landed, once its copy says.
  useEffect(() => {
    if (copy) {
      setPageLanding(design, elsewhere)
    }
  }, [copy, design, elsewhere])

  // What the page draws, as layers in the window, never in the project's document.
  useEffect(() => {
    if (copy && primary) {
      setCopyLayers(doc, design, elementLayers(frozenSnapshots(copy.body)))
    }
  }, [copy, design, doc, primary])

  return (
    <div
      className="mode-frame relative overflow-hidden bg-white shadow-lg ring-1 ring-black/15"
      style={{ width: Math.round(frame.width * scale), height: Math.round(height * scale) }}
    >
      <div data-frame-box="">
        <div
          ref={host}
          data-frame=""
          data-design={design}
          data-mode={mode.id}
          data-state={state}
          data-primary={primary}
          data-copy={copy && !asleep ? "" : undefined}
          inert
          style={{ width: frame.width, height, zoom: scale }}
        />
      </div>
      {(!copy || asleep) && <div className="frame-placeholder" data-placeholder aria-hidden />}
    </div>
  )
}

/**
 * Builds `copy` in `host`'s shadow root and has the frame's lookups go through its elements. The project's token values
 * edited and not saved come after the copy's own sheets, in a sheet every copy of its routes shares. Returns what
 * takes the copy's root and mode off the host again.
 */
function showCopy(
  host: HTMLElement,
  copy: FrozenCopy,
  mode: PageMode,
  viewport: { width: number; height: number },
  registry: CustomElementRegistry,
  preview: CSSStyleSheet
): () => void {
  const target = prepareFrame(host, copySheets(copy), {
    classNames: [],
    attributes: {},
    viewport,
    registry,
    sheets: [preview]
  })

  // Inline styles' viewport lengths and `rem` measure the board, as its sheets' do.
  const built = buildCopy(document, copy.body, registry, {
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

  // The stand-in `prepareFrame` made gives way to the copy's, which carries `<body>`'s attributes.
  target.parentElement?.replaceWith(root)
  const unroot = rootOnHost(host, copy.root, mode)
  const nodes = new Map<string, Element | Text>()
  const textParents = new Map<string, string | undefined>()
  const ids: string[] = []
  // Only text that's a layer of its own, beside elements or in a layout such as a button: a paragraph's own text is
  // the paragraph's layer.
  const layers = layerIds(elementLayers(frozenSnapshots(copy.body)))

  // Text between elements is a layer of its own (`frozenSnapshots`), as `<parent>.t<index>`: its node is found by its
  // place among its parent's children, which `buildCopy` made in the snapshot's order.
  const texts = (parent: Element, id: string, parentId: string | undefined) => {
    for (const [index, child] of [...parent.childNodes].entries()) {
      if (child instanceof Text) {
        const textId = `${id}.t${index}`

        if (layers.has(textId)) {
          nodes.set(textId, child)
          textParents.set(textId, parentId)
          ids.push(textId)
        }
      }
    }
  }

  if (body) {
    texts(body, "body", undefined)
  }

  for (const id of built.drawn.ids) {
    const [element] = built.drawn.elements(id)
    ids.push(id)

    if (element) {
      nodes.set(id, element)
      texts(element, id, id)
    }
  }

  // Clicking finds the text layers too, each drawn by its text node inside its element.
  const drawn: DrawnNodes = {
    ids,
    elements: (id) => (textParents.has(id) ? [] : built.drawn.elements(id)),
    texts: (id) => {
      const node = textParents.has(id) ? nodes.get(id) : undefined

      return node instanceof Text ? [node] : []
    },
    parent: (id) => (textParents.has(id) ? textParents.get(id) : built.drawn.parent(id)),
    nodeOf: (element) => built.drawn.nodeOf(element)
  }

  setInnerNodes(host, nodes)
  setDrawnNodes(host, () => drawn)

  return () => {
    setDrawnNodes(host, undefined)
    setInnerNodes(host, new Map())
    unroot()
    // Nothing keeps the copy's elements once it's gone, as a sleeping frame keeps none.
    host.shadowRoot?.replaceChildren()
  }
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

/**
 * A page copy's element as its panel shows it, with its styles read from how its main frame draws it now: a copy's
 * layers are made without styles, which are read only when a panel shows one. Any other layer is as it was.
 */
export function withCopyStyle<Entry extends { key: string; path: string }>(
  entry: Entry,
  nodeId: string,
  node: DesignNode
): DesignNode {
  // A text layer has no element of its own; its text node's id finds its parent's.
  if (
    entry.path !== routePagesFile ||
    (!node.element && node.type !== "text") ||
    Object.keys(node.style ?? {}).length > 0
  ) {
    return node
  }

  const hosts = findFrames(document, entry.key)
  const host = hosts.find((each) => each.dataset.primary === "true") ?? hosts[0]
  const [element] = host ? findNodeElements(host, nodeId) : []

  if (!element) {
    return node
  }

  const computed = getComputedStyle(element)
  const style = Object.fromEntries(readStyles.map((name) => [name, computed.getPropertyValue(name)]))
  const type = node.type === "text" || node.type === "image" ? node.type : "layout"

  return { ...node, style: styleOfElement({ style }, type) }
}

/** Every layer's id in a tree of layers. */
function layerIds(layers: readonly DesignNode[]): Set<string> {
  const ids = new Set<string>()
  const pending = [...layers]

  for (let node = pending.pop(); node; node = pending.pop()) {
    ids.add(node.id)

    if ("children" in node && node.children) {
      pending.push(...node.children)
    }
  }

  return ids
}
