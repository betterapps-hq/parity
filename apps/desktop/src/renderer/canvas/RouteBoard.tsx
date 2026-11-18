import {
  type ContainerSpec,
  type DesignNode,
  type DrawnNodes,
  type FrameGeometry,
  mapNode,
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
import { type BoardTier, boardTier, type PageMode } from "@parity-app/frames"
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react"
import { useMaybeEditor, useValue } from "tldraw"
import { pageRenderJob } from "../../shared/render-job.ts"
import { usePreferences } from "../chrome/preferences.ts"
import { copyNodeAttribute, copyRootAttribute } from "../copy-sheets.ts"
import { findFrames, findNodeElements, registerFrame, setDrawnNodes, setInnerNodes } from "../frame.ts"
import { isText } from "../lens-windows.ts"
import { mountCopy } from "../page-copy.ts"
import { useProject } from "./context.ts"
import { bitmapScale } from "./frame-bitmaps.ts"
import type { FrameView } from "./frame-view.ts"
import { type FrozenCopy, useFrozenCopy } from "./freezer.ts"
import { type LiveState, poolFor, useLiveBoard } from "./live-frames.ts"
import { usePagePicture } from "./page-bitmaps.ts"
import { showTokenPreview, tokenPreviewSheet, useTokenPreview } from "./page-changes.ts"
import { routePagesFile, setCopyLayers, setPageLanding } from "./route-pages.ts"
import { TierDot } from "./TierDot.tsx"

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
 * page landed, when it isn't the route's own path, goes to the board's warning and Layers; the primary frame's copy gives
 * Layers its layers.
 * Its copy is kept by `CopyKey`, its route, mode and state, and frozen again when the app's code changes (PAR-1264).
 *
 * With the Interact tool it can go live (PAR-1263): resting the pointer on it sends one of the project's spare frames
 * to its route, and pressing it puts the app's own page over its copy, engaged (`useLiveBoard`). While it's live, the
 * copy hides its fixed and sticky elements, so a fixed header shows once, in the live window, and the board says where
 * the live page went.
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
  asleep,
  interactive
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
  /** With the Interact tool, the board goes live on a press, and warms a spare when the pointer rests on it. */
  interactive: boolean
}) {
  const { doc, tokens, loaded } = useProject()
  const host = useRef<HTMLDivElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const id = useId()
  const registry = useRef<CustomElementRegistry>(undefined)
  const drawn = useMemo(() => pageMode(mode), [mode])

  const viewport = useMemo(
    () => ({ width: frame.viewport.width, height: frame.viewport.height }),
    [frame.viewport.width, frame.viewport.height]
  )

  const { rank } = view
  const key = useMemo(() => ({ route: url, mode: mode.id, state }), [url, mode.id, state])
  const copy = useFrozenCopy(project, key, route, drawn, viewport, rank)

  const job = useMemo(
    () => pageRenderJob({ projectId: project, route, url, state, mode: drawn, frame, scale: bitmapScale * scale }),
    [project, route, url, state, drawn, frame, scale]
  )

  const picture = usePagePicture(job, copy, rank)
  // The copy's height while a token preview shows, which can make it taller or shorter than it was frozen.
  const [previewed, setPreviewed] = useState<number>()
  const height = frame.height ?? Math.max(viewport.height, previewed ?? copy?.pageHeight ?? picture.height ?? 0)

  // Token values edited and not saved show in the copy as in the design frames, through the project's preview sheet.
  useTokenPreview(project, tokens, loaded.themeAttributes)
  // The pointer rests on it with Interact, which brings a picture up to its copy first.
  const [pointed, setPointed] = useState(false)
  const drawnHeight = useRef(height)

  useEffect(() => {
    drawnHeight.current = height
  })

  const { live, ready } = useLiveBoard({
    id,
    project,
    url,
    design,
    mode: drawn,
    viewport,
    scale,
    element: () => box.current,
    pageHeight: () => drawnHeight.current,
    rank
  })

  // With Interact, a press on the board makes it live and engaged, and nothing else: the canvas doesn't select or drag,
  // and the next press lands on the page.
  useEffect(() => {
    const element = box.current

    if (!interactive || !element) {
      return undefined
    }

    const pool = poolFor(project)

    const enter = () => {
      setPointed(true)
      pool.hover(id)
    }

    const leave = () => {
      setPointed(false)
      pool.unhover()
    }

    const down = (event: PointerEvent) => {
      if (event.button !== 0) {
        return
      }

      event.stopPropagation()
      event.preventDefault()
      void pool.engage(id)
    }

    element.addEventListener("pointerenter", enter)
    element.addEventListener("pointerleave", leave)
    element.addEventListener("pointerdown", down)

    return () => {
      element.removeEventListener("pointerenter", enter)
      element.removeEventListener("pointerleave", leave)
      element.removeEventListener("pointerdown", down)
    }
  }, [id, interactive, project])

  const tier = useBoardTier(frame.width * scale, view, { copy: !!copy, live: !!live, pointed: interactive && pointed })
  const frozen = tier !== "picture" && !asleep && !!copy

  // Selecting, outlining and agents find the copy as they find a design's frames.
  useLayoutEffect(() => registerFrame(host.current!, design), [design])

  useLayoutEffect(() => {
    const element = host.current

    if (!copy || !element || !frozen) {
      return undefined
    }

    registry.current ??= new CustomElementRegistry()

    return showCopy(element, copy, drawn, viewport, registry.current, tokenPreviewSheet(project))
  }, [frozen, copy, drawn, viewport, project])

  // A token preview can change the page's height, so the copy measures what it draws while one shows.
  useEffect(() => {
    if (!copy || !frozen) {
      return undefined
    }

    const stop = showTokenPreview(project, (css) => {
      const root = host.current?.shadowRoot?.querySelector(`[${copyRootAttribute}]`)
      setPreviewed(css === "" || !root ? undefined : Math.ceil(root.scrollHeight))
    })

    return () => {
      stop()
      setPreviewed(undefined)
    }
  }, [frozen, copy, project])

  // A fixed header shows once, in the live window, rather than again on the copy around it. After the copy is built, so
  // a copy built again while the board is live is hidden too.
  useLayoutEffect(() => {
    const root = host.current?.shadowRoot

    if (!live || !copy || !frozen || !root) {
      return undefined
    }

    return hideFixed(root)
  }, [frozen, copy, drawn, live, viewport])

  // While it's live, where the live page went, or tried to go off the app's origin; otherwise where its copy landed.
  const landed = live?.location ?? copy?.location
  const elsewhere = live?.stopped ?? (landed ? landedElsewhere(url, landed.path) : undefined)

  // The board's warning and Layers say where the page landed, once its copy or its live page says.
  useEffect(() => {
    if (landed || live?.stopped) {
      setPageLanding(design, elsewhere)
    }
  }, [design, elsewhere, landed, live?.stopped])

  // What the page draws, as layers in the window, never in the project's document.
  useEffect(() => {
    if (copy && primary) {
      setCopyLayers(doc, design, elementLayers(frozenSnapshots(copy.body)))
    }
  }, [copy, design, doc, primary])

  const shown = !frozen && picture.src
  const tierDots = usePreferences().routeFrameTiers

  return (
    <>
      <div
        ref={box}
        className="mode-frame relative overflow-hidden bg-white shadow-lg ring-1 ring-black/15"
        data-tier={frozen ? "frozen" : "picture"}
        data-live={liveAttribute(live)}
        data-ready={ready ? "" : undefined}
        style={{
          width: Math.round(frame.width * scale),
          height: Math.round(height * scale),
          // With Interact the board takes the press that makes it live; otherwise the canvas has the pointer.
          pointerEvents: interactive ? "auto" : undefined
        }}
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
      {/* Beside the board rather than on it, where the live page would cover it. */}
      {tierDots && <TierDot project={project} url={url} live={!!live} ready={ready} />}
    </>
  )
}

/**
 * A board's tier from its width on screen, in CSS pixels at zoom 1, whether it's near the view, which follows the camera
 * as it zooms, and what it has: a copy, the live frame, the pointer with Interact.
 */
function useBoardTier(
  width: number,
  view: FrameView,
  has: { copy: boolean; live: boolean; pointed: boolean }
): BoardTier {
  const editor = useMaybeEditor()
  const last = useRef<BoardTier>("picture")
  const { copy, live, pointed } = has

  const tier = useValue(
    "board tier",
    () =>
      boardTier({
        width: width * (editor?.getZoomLevel() ?? 1),
        near: view.near.get(),
        last: last.current,
        copy,
        live,
        pointed
      }),
    [editor, width, view, copy, live, pointed]
  )

  useEffect(() => {
    last.current = tier
  })

  return tier
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
  const { built, body, unmount } = mountCopy(host, copy, mode, viewport, registry, [preview])
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
      if (isText(child)) {
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
      // A style edit's preview finds it by its layer (`StylePreview`).
      element.setAttribute(copyNodeAttribute, id)
      texts(element, id, id)
    }
  }

  // Clicking finds the text layers too, each drawn by its text node inside its element.
  const drawn: DrawnNodes = {
    ids,
    elements: (id) => (textParents.has(id) ? [] : built.drawn.elements(id)),
    texts: (id) => {
      const node = textParents.has(id) ? nodes.get(id) : undefined

      return isText(node) ? [node] : []
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

/** What a board says of the live frame for tools to read: engaged, live, or nothing. */
function liveAttribute(live: LiveState | undefined): string | undefined {
  if (!live) {
    return undefined
  }

  return live.engaged ? "engaged" : ""
}

/**
 * Hides a copy's elements whose computed position is fixed or sticky, as the live page over the copy draws them.
 * Returns what shows them again.
 */
function hideFixed(root: ShadowRoot): () => void {
  const hidden: { element: HTMLElement | SVGElement; value: string; priority: string }[] = []

  for (const element of root.querySelectorAll<HTMLElement | SVGElement>("*")) {
    const { position } = getComputedStyle(element)

    if (position === "fixed" || position === "sticky") {
      hidden.push({
        element,
        value: element.style.getPropertyValue("visibility"),
        priority: element.style.getPropertyPriority("visibility")
      })
      element.style.setProperty("visibility", "hidden", "important")
    }
  }

  return () => {
    for (const { element, value, priority } of hidden) {
      element.style.setProperty("visibility", value, priority)
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

/**
 * A page's layers with the ones in `ids` styled as their copy draws them (`withCopyStyle`), for a style edit to start
 * from what's shown rather than from no style at all.
 */
export function withCopyStyles<Entry extends { key: string; path: string }>(
  entry: Entry,
  container: ContainerSpec,
  ids: readonly string[]
): ContainerSpec {
  if (entry.path !== routePagesFile) {
    return container
  }

  const root = ids.reduce((each, id) => mapNode(each, id, (node) => withCopyStyle(entry, id, node)), container.root)

  return root === container.root ? container : { ...container, root }
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
