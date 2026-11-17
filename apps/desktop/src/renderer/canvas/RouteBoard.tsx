import { type DesignNode, type DrawnNodes, type FrameGeometry, type ResolvedMode } from "@parity-app/core"
import {
  elementLayers,
  frozenSnapshots,
  landedElsewhere,
  pageMode,
  readStyles,
  styleOfElement
} from "@parity-app/editor"
import { type BoardTier, boardTier, type PageMode } from "@parity-app/frames"
import { useEffect, useLayoutEffect, useMemo, useRef } from "react"
import { useMaybeEditor, useValue } from "tldraw"
import { pageRenderJob } from "../../shared/render-job.ts"
import { findFrames, findNodeElements, registerFrame, setDrawnNodes, setInnerNodes } from "../frame.ts"
import { mountCopy } from "../page-copy.ts"
import { useProject } from "./context.ts"
import { bitmapScale } from "./frame-bitmaps.ts"
import type { FrameView } from "./frame-view.ts"
import { type FrozenCopy, useFrozenCopy } from "./freezer.ts"
import { usePagePicture } from "./page-bitmaps.ts"
import { routePagesFile, setCopyLayers, setPageLanding } from "./route-pages.ts"

/**
 * A route board's frame (docs/proposals/route-frames.md, PAR-1262, PAR-1200), drawn as a picture when it's small on
 * screen or away from the view, and as a frozen copy of its page when it's near and readable (`boardTier`). The copy is
 * the page's DOM without its scripts, made by the project's freezer frame, built in a shadow root from `prepareFrame`
 * with a custom element registry of its own, and styled with the page's own stylesheets through `prepareCanvasCss`
 * (`mountCopy`). The picture is a capture of the copy, kept on disk with the page's trace (`usePagePicture`). Its host is
 * a frame, registered under the page's design with its mode and state, so selection, hit-testing and outlines find the
 * copy's elements by their ids (`buildCopy`'s `DrawnNodes`). It's as tall as the page in the mode's window, unless the
 * frame has a height of its own, which clips it. It's inert, so its links and forms can't be followed or sent, and
 * nothing in it takes focus. Until its copy or picture comes, a placeholder stands in at the window's height. Where the
 * page landed, when it isn't the route's own path, goes to the board's warning and Layers; the primary frame's copy
 * gives Layers its layers.
 */
export function RouteBoard({
  url,
  project,
  design,
  route,
  state,
  frame,
  mode,
  scale,
  primary,
  view,
  asleep
}: {
  url: string
  project: string
  /** The page's design, by key. */
  design: string
  /** The route's id, which the picture's trace starts from. */
  route: string
  state: string
  frame: FrameGeometry
  mode: ResolvedMode
  scale: number
  /** The board's main frame, whose copy gives Layers what the page draws. */
  primary: boolean
  /** Where the frame is against the view: how urgent its copy and picture are, and whether it's near. */
  view: FrameView
  /** Whether the board sleeps, as a hidden tab's do: it lets go of its copy's elements and shows its picture. */
  asleep: boolean
}) {
  const { doc } = useProject()
  const host = useRef<HTMLDivElement>(null)
  const registry = useRef<CustomElementRegistry>(undefined)
  const drawn = useMemo(() => pageMode(mode), [mode])

  const viewport = useMemo(
    () => ({ width: frame.viewport.width, height: frame.viewport.height }),
    [frame.viewport.width, frame.viewport.height]
  )

  const copy = useFrozenCopy(project, url, drawn, viewport, view.rank)

  const job = useMemo(
    () => pageRenderJob({ projectId: project, route, url, state, mode: drawn, frame, scale: bitmapScale * scale }),
    [project, route, url, state, drawn, frame, scale]
  )

  const picture = usePagePicture(job, copy, view.rank)
  const tier = useBoardTier(frame.width * scale, view, !!copy)
  const frozen = tier !== "picture" && !asleep && !!copy
  const height = frame.height ?? Math.max(viewport.height, copy?.pageHeight ?? picture.height ?? 0)

  // Selecting, outlining and agents find the copy as they find a design's frames.
  useLayoutEffect(() => registerFrame(host.current!, design), [design])

  useLayoutEffect(() => {
    const element = host.current

    if (!copy || !element || !frozen) {
      return undefined
    }

    registry.current ??= new CustomElementRegistry()

    return showCopy(element, copy, drawn, viewport, registry.current)
  }, [frozen, copy, drawn, viewport])

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

  const shown = !frozen && picture.src

  return (
    <div
      className="mode-frame relative overflow-hidden bg-white shadow-lg ring-1 ring-black/15"
      style={{ width: Math.round(frame.width * scale), height: Math.round(height * scale) }}
      data-tier={frozen ? "frozen" : "picture"}
    >
      <div data-frame-box="">
        <div
          ref={host}
          data-frame=""
          data-design={design}
          data-mode={mode.id}
          data-state={state}
          data-primary={primary}
          data-copy={frozen ? "" : undefined}
          inert
          style={{ width: frame.width, height, zoom: scale }}
        />
      </div>
      {shown && <img className="page-picture" data-picture="" src={shown} alt="" draggable={false} />}
      {!frozen && !shown && <div className="frame-placeholder" data-placeholder aria-hidden />}
    </div>
  )
}

/**
 * A board's tier from its width on screen, in CSS pixels at zoom 1, and whether it's near the view, which follows the
 * camera as it zooms. Live boards are step 5's; until then a board is a picture or a copy.
 */
function useBoardTier(width: number, view: FrameView, copy: boolean): BoardTier {
  const editor = useMaybeEditor()
  const last = useRef<BoardTier>("picture")

  const tier = useValue(
    "board tier",
    () =>
      boardTier({
        width: width * (editor?.getZoomLevel() ?? 1),
        near: view.near.get(),
        last: last.current,
        copy,
        live: false,
        pointed: false
      }),
    [editor, width, view, copy]
  )

  useEffect(() => {
    last.current = tier
  })

  return tier
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
  const { built, body, unmount } = mountCopy(host, copy, mode, viewport, registry)
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
    unmount()
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
