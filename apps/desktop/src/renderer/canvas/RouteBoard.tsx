import { colorSchemeAttribute, type DesignNode, type FrameGeometry, type ResolvedMode } from "@parity-app/core"
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
import { copySheets, type FrozenCopy, useFrozenCopy } from "./freezer.ts"
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
  rank
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
}) {
  const host = useRef<HTMLDivElement>(null)
  const registry = useRef<CustomElementRegistry>(undefined)
  const drawn = useMemo(() => pageMode(mode), [mode])

  const viewport = useMemo(
    () => ({ width: frame.viewport.width, height: frame.viewport.height }),
    [frame.viewport.width, frame.viewport.height]
  )

  const copy = useFrozenCopy(project, url, drawn, viewport, rank)
  const height = frame.height ?? Math.max(viewport.height, copy?.pageHeight ?? 0)

  // Selecting, outlining and agents find the copy as they find a design's frames.
  useLayoutEffect(() => registerFrame(host.current!, design), [design])

  useLayoutEffect(() => {
    const element = host.current

    if (!copy || !element) {
      return undefined
    }

    registry.current ??= new CustomElementRegistry()

    return showCopy(element, copy, drawn, viewport, registry.current)
  }, [copy, drawn, viewport])

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
      setCopyLayers(design, elementLayers(frozenSnapshots(copy.body)))
    }
  }, [copy, design, primary])

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
          data-copy={copy ? "" : undefined}
          inert
          style={{ width: frame.width, height, zoom: scale }}
        />
      </div>
      {!copy && <div className="frame-placeholder" data-placeholder aria-hidden />}
    </div>
  )
}

/**
 * Builds `copy` in `host`'s shadow root and has the frame's lookups go through its elements. Returns what takes the
 * copy's root and mode off the host again.
 */
function showCopy(
  host: HTMLElement,
  copy: FrozenCopy,
  mode: PageMode,
  viewport: { width: number; height: number },
  registry: CustomElementRegistry
): () => void {
  const target = prepareFrame(host, copySheets(copy), { classNames: [], attributes: {}, viewport, registry })
  const built = buildCopy(document, copy.body, registry)
  const body = built.fragment.firstElementChild

  if (body) {
    body.classList.add(...mode.classes)
    setAttributes(body, Object.entries(mode.attributes))

    if (mode.scheme) {
      body.setAttribute(colorSchemeAttribute, mode.scheme)
    }
  }

  // The stand-in `prepareFrame` made gives way to the copy's, which carries `<body>`'s attributes.
  target.parentElement?.replaceWith(built.fragment)
  const unroot = rootOnHost(host, copy.root, mode)
  const nodes = new Map<string, Element>()

  for (const id of built.drawn.ids) {
    const [element] = built.drawn.elements(id)

    if (element) {
      nodes.set(id, element)
    }
  }

  setInnerNodes(host, nodes)
  setDrawnNodes(host, () => built.drawn)

  return () => {
    setDrawnNodes(host, undefined)
    setInnerNodes(host, new Map())
    unroot()
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
  if (entry.path !== routePagesFile || !node.element || Object.keys(node.style ?? {}).length > 0) {
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
