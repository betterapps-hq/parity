import {
  bodyAttribute,
  type FrameViewport,
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
  const shadow = host.shadowRoot ?? host.attachShadow({ mode: "open" })
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
