import { bodyAttribute, viewportContainerName } from "@parity/core"

export interface FrameEnvironment {
  classNames: string[]
  attributes: Record<string, string>
}

let rootSheet: CSSStyleSheet | undefined

/**
 * A frame's root starts from what a browser gives a page's root, not from the canvas around it. Otherwise text that sets
 * no size of its own takes the canvas's 12px and 18px line height instead of a browser's 16px and normal, and the
 * canvas's color scheme and font. It's the first layer, so the project's own `html` and `body` rules still win. Pointer
 * events, the cursor and text selection stay inherited, since the canvas decides those.
 */
function frameRootSheet(): CSSStyleSheet {
  if (rootSheet) return rootSheet
  rootSheet = new CSSStyleSheet()
  rootSheet.replaceSync(`@layer canvas-frame-root {
  :host { all: initial; display: block; pointer-events: inherit; cursor: inherit; user-select: inherit; }
}`)
  return rootSheet
}

/**
 * Turns a host element into a frame: a shadow root with the project's styles and a body element that stands in for
 * `<body>`. The body is a size container, so components' (rewritten) media queries respond to the frame's width.
 * Returns the element a guest renders into.
 */
export function prepareFrame(host: HTMLElement, sheet: CSSStyleSheet, environment: FrameEnvironment): HTMLElement {
  const shadow = host.shadowRoot ?? host.attachShadow({ mode: "open" })
  shadow.adoptedStyleSheets = [frameRootSheet(), sheet]
  const body = document.createElement("div")
  body.setAttribute(bodyAttribute, "")
  for (const [name, value] of Object.entries(environment.attributes)) body.setAttribute(name, value)
  body.classList.add(...environment.classNames)
  body.style.container = `${viewportContainerName} / inline-size`
  // A frame with a fixed height passes it down, so a design's root can fill it.
  body.style.height = "100%"
  const target = document.createElement("div")
  target.style.height = "100%"
  body.append(target)
  shadow.replaceChildren(body)
  return target
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
