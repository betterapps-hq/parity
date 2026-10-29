import {
  bodyAttribute,
  type FrameViewport,
  rewriteSheetViewportUnits,
  rewriteViewportUnits,
  viewportContainerName,
  viewportHeightProperty,
  viewportWidthProperty
} from "@parity/core"

export interface FrameEnvironment {
  classNames: string[]
  attributes: Record<string, string>
  /** The window the frame stands for, which the project's `vw` and `vh` measure. */
  viewport?: FrameViewport
}

let rootSheet: CSSStyleSheet | undefined

/**
 * A frame's root starts from what a browser gives a page's root, not from the canvas around it. Otherwise text that sets
 * no size of its own takes the canvas's 12px and 18px line height instead of a browser's 16px and normal, and the
 * canvas's color scheme and font. Its body has a browser's 8px margin, which, as at a page's root, stays inside the
 * frame. It's the first layer, so the project's own `html` and `body` rules still win. Pointer events, the cursor and
 * text selection stay inherited, since the canvas decides those.
 *
 * The root is also the size container the project's (rewritten) media queries ask, so they respond to the frame's
 * width. A container lays out on its own, as a page's root does, and fixed elements place themselves in it, as in a
 * browser's viewport. On the body it would keep a first heading's margin from joining the body's.
 */
function frameRootSheet(): CSSStyleSheet {
  if (rootSheet) return rootSheet
  rootSheet = new CSSStyleSheet()
  rootSheet.replaceSync(`@layer canvas-frame-root {
  :host {
    all: initial;
    display: flow-root;
    container: ${viewportContainerName} / inline-size;
    pointer-events: inherit;
    cursor: inherit;
    user-select: inherit;
  }
  [${bodyAttribute}] { margin: 8px; }
}`)
  return rootSheet
}

/**
 * Turns a host element into a frame: a shadow root with the project's styles and a body element that stands in for
 * `<body>`. Returns the element a guest renders into.
 */
export function prepareFrame(host: HTMLElement, sheet: CSSStyleSheet, environment: FrameEnvironment): HTMLElement {
  rewriteAddedRules()
  const shadow = host.shadowRoot ?? host.attachShadow({ mode: "open" })
  watchFrameStyles(shadow)
  shadow.adoptedStyleSheets = [frameRootSheet(), sheet]
  if (environment.viewport) setFrameViewport(host, environment.viewport)
  const body = document.createElement("div")
  body.setAttribute(bodyAttribute, "")
  for (const [name, value] of Object.entries(environment.attributes)) body.setAttribute(name, value)
  body.classList.add(...environment.classNames)
  // A frame with a fixed height passes it down, so a design's root can fill it. Its margin box fills the frame, so a
  // body margin doesn't push it past the bottom.
  body.style.height = "stretch"
  const target = document.createElement("div")
  target.style.height = "100%"
  body.append(target)
  shadow.replaceChildren(body)
  return target
}

/** Sizes the window a frame stands for: the project's viewport units measure it. */
export function setFrameViewport(host: HTMLElement, viewport: FrameViewport): void {
  host.style.setProperty(viewportWidthProperty, `${viewport.width / 100}px`)
  host.style.setProperty(viewportHeightProperty, `${viewport.height / 100}px`)
}

let rewritingRules = false

/**
 * Viewport units in rules the project's code adds to a stylesheet while it runs, as CSS-in-JS does in production,
 * measure the frame's window too, as its stylesheets' do. They're rewritten as they're added, wherever that is. That
 * changes nothing outside a frame, where the custom properties aren't set, so the units still measure Parity's window.
 */
function rewriteAddedRules(): void {
  if (rewritingRules) return
  rewritingRules = true
  const { insertRule, replace, replaceSync } = CSSStyleSheet.prototype
  CSSStyleSheet.prototype.insertRule = function (rule, index) {
    return insertRule.call(this, rewriteSheetViewportUnits(rule), index)
  }
  CSSStyleSheet.prototype.replace = function (text) {
    return replace.call(this, rewriteSheetViewportUnits(text))
  }
  CSSStyleSheet.prototype.replaceSync = function (text) {
    replaceSync.call(this, rewriteSheetViewportUnits(text))
  }
}

const watched = new WeakSet<ShadowRoot>()

/**
 * Viewport units the project's code writes into a frame while it runs measure the frame's window too: in inline styles
 * (`style={{ minHeight: "100dvh" }}`, however they're set) and in text in its `<style>` elements, as CSS-in-JS writes
 * in development. They're rewritten as soon as they're written, before the frame is next drawn, though code that
 * measures straight after, as a layout effect can, still sees them measure Parity's window. A browser keeps inline style
 * properties to itself, so they can't be caught as they're set without slowing every style Parity sets.
 */
function watchFrameStyles(shadow: ShadowRoot): void {
  if (watched.has(shadow)) return
  watched.add(shadow)
  new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === "attributes") rewriteStyleAttribute(record.target as Element)
      else if (record.type === "characterData") rewriteStyleText(record.target)
      else for (const node of record.addedNodes) rewriteAdded(node)
    }
  }).observe(shadow, { childList: true, characterData: true, attributeFilter: ["style"], subtree: true })
}

function rewriteAdded(node: Node): void {
  if (!(node instanceof Element)) return rewriteStyleText(node)
  for (const element of [node, ...node.querySelectorAll("[style], style")]) {
    if (element.localName !== "style") rewriteStyleAttribute(element)
    else for (const text of element.childNodes) rewriteStyleText(text)
  }
}

function rewriteStyleAttribute(element: Element): void {
  const style = element.getAttribute("style")
  if (style === null) return
  const rewritten = rewriteViewportUnits(style)
  if (rewritten !== style) element.setAttribute("style", rewritten)
}

function rewriteStyleText(node: Node): void {
  if (!(node instanceof Text) || node.parentElement?.localName !== "style") return
  const rewritten = rewriteSheetViewportUnits(node.data)
  if (rewritten !== node.data) node.data = rewritten
}

export function frameBody(host: Element): HTMLElement | undefined {
  return (host.shadowRoot?.firstElementChild as HTMLElement | null) ?? undefined
}

export function findNodeElement(host: Element, nodeId: string): HTMLElement | undefined {
  return (
    (host.shadowRoot?.querySelector(`[data-canvas-node="${CSS.escape(nodeId)}"]`) as HTMLElement | null) ?? undefined
  )
}

/** Every element in a frame that stands for a design node, in document order. */
export function nodeElements(host: Element): HTMLElement[] {
  return [...(host.shadowRoot?.querySelectorAll<HTMLElement>("[data-canvas-node]") ?? [])]
}

/** The frames drawn for a design, optionally one mode or state. */
export function findFrames(
  root: ParentNode,
  design: string,
  filter: { mode?: string; state?: string } = {}
): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>("[data-frame]")].filter(
    (host) =>
      host.dataset.design === design &&
      (filter.mode === undefined || host.dataset.mode === filter.mode) &&
      (filter.state === undefined || host.dataset.state === filter.state)
  )
}
