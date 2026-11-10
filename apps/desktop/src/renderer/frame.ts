import {
  bodyAttribute,
  type DrawnNodes,
  type FrameViewport,
  emptyLayoutAttribute,
  qualifiedRootLayer,
  remProperty,
  resetCustomProperties,
  rewriteFrameUnits,
  rewriteSheetFrameUnits,
  rootFontSizeProperty,
  viewportContainerName,
  viewportHeightProperty,
  viewportWidthProperty
} from "@parity-app/core"
import { hasFlag } from "./bits.ts"
import { unrecordedShadow } from "./shadow.ts"

export interface FrameEnvironment {
  classNames: string[]
  attributes: Record<string, string>
  /** The window the frame stands for, which the project's `vw` and `vh` measure. */
  viewport?: FrameViewport
}

let rootSheet: CSSStyleSheet | undefined

/** The custom properties a frame's root sets to `initial`: every one Parity's page has given a frame's host to inherit. */
const resetNames = new Set<string>()

/**
 * How tall a frame was measured or kept with its bitmap, set around its host for the canvas's own `[data-frame]` rules
 * to read on the host, so a frame that skips drawing keeps its height (see styles.css). The root leaves it inherited.
 */
export const frameHeightProperty = "--frame-height"

/** The least an empty layout takes on the canvas each way, in the design's pixels. */
export const emptyLayoutSize = 24

/**
 * A frame's root starts from what a browser gives a page's root, not from the canvas around it. Otherwise text that sets
 * no size of its own takes the canvas's 12px and 18px line height instead of a browser's 16px and normal, and the
 * canvas's color scheme and font. Its body has a browser's 8px margin, which, as at a page's root, stays inside the
 * frame. It's the first layer, so the project's own `html` and `body` rules still win. Pointer events, the cursor and
 * text selection stay inherited, since the canvas decides those.
 *
 * `all` leaves custom properties alone, so the root also sets every custom property Parity's page passes the frame to
 * `initial` (`keepOutInherited`), and a variable the project uses but never defines takes its fallback, as in Chrome,
 * rather than Parity's value: shadcn's names, `--background` and `--border`, are Parity's too.
 *
 * A layout with nothing in it would draw nothing, where it can't be seen, selected or dropped into, so on the canvas it
 * takes at least `emptyLayoutSize` along each axis its content would size, dashed. Along an axis the design sizes it
 * keeps that size (see core's `emptyLayoutAttribute`). The least size has to be important to beat the `min-width: 0`
 * every layout is drawn with. It's found by the attribute core puts on empty layouts, not by `:empty`: that pseudo-class
 * in this sheet, shared by every frame, kept closed projects' frames in memory (PAR-193).
 *
 * The root is also the size container the project's (rewritten) media queries ask, so they respond to the frame's
 * width. A container lays out on its own, as a page's root does, and fixed elements place themselves in it, as in a
 * browser's viewport. On the body it would keep a first heading's margin from joining the body's.
 *
 * `rem` in a shadow root measures Parity's own root, so the project's is rewritten to `--canvas-rem` (see core's
 * `rewriteFrameUnits`), which the root sets to its font size, the project's `html { font-size }` included. That size is
 * read through a registered length (`registerRootFontSize`), since `1em` in an ordinary custom property would measure
 * each element that uses it. It's a rule of its own, after the first, so nothing that resets custom properties in the
 * first can undo it.
 *
 * The layers come before the project's, lowest first: these rules, then a qualified root drawn on the body (core's
 * `qualifiedRootLayer`), so any rule of the project's for the body beats it.
 */
function frameRootCss(): string {
  return `@layer canvas-frame-root, ${qualifiedRootLayer};
@layer canvas-frame-root {
  :host {
    all: initial;
    display: flow-root;
    container: ${viewportContainerName} / inline-size;
    pointer-events: inherit;
    cursor: inherit;
    user-select: inherit;
    ${resetCustomProperties(resetNames)}
  }
  :host {
    ${rootFontSizeProperty}: 1em;
    ${remProperty}: var(${rootFontSizeProperty});
  }
  [${bodyAttribute}] { margin: 8px; }
  [${emptyLayoutAttribute}] {
    outline: 1px dashed color-mix(in oklab, currentColor 35%, transparent);
    outline-offset: -1px;
  }
  [${emptyLayoutAttribute}~="width"] { min-width: ${emptyLayoutSize}px !important; }
  [${emptyLayoutAttribute}~="height"] { min-height: ${emptyLayoutSize}px !important; }
}`
}

function frameRootSheet(): CSSStyleSheet {
  if (rootSheet) {
    return rootSheet
  }

  registerRootFontSize()
  rootSheet = new CSSStyleSheet()
  rootSheet.replaceSync(frameRootCss())

  return rootSheet
}

/**
 * Registers the length a frame's root reads its font size into, so `1em` there becomes pixels before `--canvas-rem`
 * passes it down. Registering is the document's, and once: a second registration of the name, as when this module is
 * loaded again in development, is refused, and the first still holds.
 */
function registerRootFontSize(): void {
  try {
    CSS.registerProperty({ name: rootFontSizeProperty, syntax: "<length>", inherits: false, initialValue: "16px" })
  } catch (error) {
    if (!(error instanceof DOMException && error.name === "InvalidModificationError")) {
      throw error
    }
  }
}

/**
 * Keeps the custom properties a host would inherit from Parity's page out of its frame, by adding any its root doesn't
 * set to `initial` yet. They're read from the computed style of the element around the host, which lists every custom
 * property that reaches it, from any rule or inline style. One sheet serves every frame, and setting a property nothing
 * passes down changes nothing, so the list only grows; it's written again only when it does, normally for the first
 * frame alone. A property defined on the frame's host, as the project's `:root` rules and its viewport are, still wins.
 * `frameHeightProperty` stays: the canvas's rules read it on the host itself, where a reset would leave a sleeping
 * frame no height to keep, and its board would shrink to its caption (PAR-157).
 */
function keepOutInherited(host: HTMLElement): void {
  const parent = host.parentNode instanceof ShadowRoot ? host.parentNode.host : host.parentElement

  if (!parent) {
    return
  }

  const style = getComputedStyle(parent)
  let added = false

  for (let index = 0; index < style.length; index++) {
    const name = style.item(index)

    if (!name.startsWith("--") || name === frameHeightProperty || resetNames.has(name)) {
      continue
    }

    resetNames.add(name)
    added = true
  }

  if (added) {
    frameRootSheet().replaceSync(frameRootCss())
  }
}

/**
 * Turns a host element into a frame: a shadow root with the project's styles and a body element that stands in for
 * `<body>`. Returns the element a guest renders into.
 */
export function prepareFrame(host: HTMLElement, sheet: CSSStyleSheet, environment: FrameEnvironment): HTMLElement {
  rewriteAddedRules()
  const shadow = unrecordedShadow(host)
  watchFrameStyles(shadow)
  shadow.adoptedStyleSheets = [frameRootSheet(), sheet]
  keepOutInherited(host)

  if (environment.viewport) {
    setFrameViewport(host, environment.viewport)
  }

  const body = document.createElement("div")
  body.setAttribute(bodyAttribute, "")

  for (const [name, value] of Object.entries(environment.attributes)) {
    body.setAttribute(name, value)
  }

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
 * Viewport units and `rem` in rules the project's code adds to a stylesheet while it runs, as CSS-in-JS does in
 * production, measure the frame's window and root font too, as its stylesheets' do. They're rewritten as they're added,
 * wherever that is. That changes nothing outside a frame, where the custom properties aren't set, so the units still
 * measure Parity's window and root.
 */
function rewriteAddedRules(): void {
  if (rewritingRules) {
    return
  }

  rewritingRules = true
  // The originals, called with each sheet as `this`.
  const original = Object.getOwnPropertyDescriptors(CSSStyleSheet.prototype)
  const insertRule = original.insertRule.value!
  const replace = original.replace.value!
  const replaceSync = original.replaceSync.value!
  CSSStyleSheet.prototype.insertRule = function (rule, index) {
    return insertRule.call(this, rewriteSheetFrameUnits(rule), index)
  }

  CSSStyleSheet.prototype.replace = function (text) {
    return replace.call(this, rewriteSheetFrameUnits(text))
  }

  CSSStyleSheet.prototype.replaceSync = function (text) {
    replaceSync.call(this, rewriteSheetFrameUnits(text))
  }
}

const watched = new WeakSet<ShadowRoot>()

/**
 * Viewport units and `rem` the project's code writes into a frame while it runs measure the frame's window and root
 * font too: in inline styles (`style={{ minHeight: "100dvh" }}`, however they're set) and in text in its `<style>`
 * elements, as CSS-in-JS writes in development. They're rewritten as soon as they're written, before the frame is next
 * drawn, though code that measures straight after, as a layout effect can, still sees them measure Parity's window and
 * root. A browser keeps inline style properties to itself, so they can't be caught as they're set without slowing every
 * style Parity sets.
 */
function watchFrameStyles(shadow: ShadowRoot): void {
  if (watched.has(shadow)) {
    return
  }

  watched.add(shadow)
  new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === "attributes" && record.target instanceof Element) {
        rewriteStyleAttribute(record.target)
      } else if (record.type === "characterData") {
        rewriteStyleText(record.target)
      } else {
        for (const node of record.addedNodes) {
          rewriteAdded(node)
        }
      }
    }
  }).observe(shadow, { childList: true, characterData: true, attributeFilter: ["style"], subtree: true })
}

function rewriteAdded(node: Node): void {
  if (!(node instanceof Element)) {
    return rewriteStyleText(node)
  }

  for (const element of [node, ...node.querySelectorAll("[style], style")]) {
    if (element.localName !== "style") {
      rewriteStyleAttribute(element)
    } else {
      for (const text of element.childNodes) {
        rewriteStyleText(text)
      }
    }
  }
}

function rewriteStyleAttribute(element: Element): void {
  const style = element.getAttribute("style")

  if (style === null) {
    return
  }

  const rewritten = rewriteFrameUnits(style)

  if (rewritten !== style) {
    element.setAttribute("style", rewritten)
  }
}

function rewriteStyleText(node: Node): void {
  if (!(node instanceof Text) || node.parentElement?.localName !== "style") {
    return
  }

  const rewritten = rewriteSheetFrameUnits(node.data)

  if (rewritten !== node.data) {
    node.data = rewritten
  }
}

/** How each frame's guest says where its design nodes are drawn, by the frame's host element. */
const drawnBy = new WeakMap<Element, () => DrawnNodes | undefined>()

/**
 * Lets a frame's lookups go through its guest, which reads where each node is drawn from the framework's own tree. Set
 * when a guest mounts in the frame, and cleared when it unmounts. Without one, or when it can't say, nodes are found by
 * their `data-canvas-node` attribute, which a component that ignores its props never renders.
 */
export function setDrawnNodes(host: Element, drawnNodes: (() => DrawnNodes | undefined) | undefined): void {
  if (drawnNodes) {
    drawnBy.set(host, drawnNodes)
  } else {
    drawnBy.delete(host)
  }

  // Its layers are found another way now, and the overlay measures them again.
  if (host instanceof HTMLElement && isRegistered(host)) {
    tellFrameListeners(host, true)
  }
}

/**
 * Calls `drawn` once the guest has put its design in `target`, the element `prepareFrame` gave it to mount in. Gives
 * back what stops waiting.
 */
export function whenDrawn(target: HTMLElement, drawn: () => void): () => void {
  if (target.firstChild) {
    drawn()

    return () => undefined
  }

  const observer = new MutationObserver(() => {
    if (!target.firstChild) {
      return
    }

    observer.disconnect()
    drawn()
  })

  observer.observe(target, { childList: true })

  return () => observer.disconnect()
}

function drawnNodes(host: Element): DrawnNodes | undefined {
  return drawnBy.get(host)?.()
}

/** The elements a node draws at its top level, in order: several for a fragment, none when it draws nothing. */
export function findNodeElements(host: Element, nodeId: string): HTMLElement[] {
  const drawn = drawnNodes(host)

  if (drawn) {
    // SAFETY: read as HTML elements, as the fallback's `querySelector<HTMLElement>` below reads them; an SVG element at
    // a node's top level has the style and layout callers read.
    return drawn.elements(nodeId) as HTMLElement[]
  }

  const element = host.shadowRoot?.querySelector<HTMLElement>(`[data-canvas-node="${CSS.escape(nodeId)}"]`)

  return element ? [element] : []
}

/** A node's first element, which sits where the node does among its siblings. */
export function findNodeElement(host: Element, nodeId: string): HTMLElement | undefined {
  return findNodeElements(host, nodeId)[0]
}

/**
 * A node's box on screen: around everything it draws at its top level, its elements and any text it draws outside
 * them. An element that isn't drawn (display: none) has an empty box at the frame's corner, so it's left out unless
 * nothing else is drawn.
 */
export function nodeBox(host: Element, nodeId: string): DOMRect | undefined {
  const drawn = drawnNodes(host)

  return drawn ? boxAround(drawnBoxes(drawn, nodeId)) : boxAround(findNodeElements(host, nodeId).map(elementBox))
}

/** The boxes of what a node draws at its top level, as its frame's guest says: its elements, then its text. */
function drawnBoxes(drawn: DrawnNodes, nodeId: string): DOMRect[] {
  return [...drawn.elements(nodeId).map(elementBox), ...drawn.texts(nodeId).map(textBox)]
}

/** The box around a text's characters. */
function textBox(text: Text): DOMRect {
  const range = document.createRange()
  range.selectNodeContents(text)

  return range.getBoundingClientRect()
}

/** Whether each element is clipped to nothing, read once, since a hidden input stays hidden. */
const clippedAway = new WeakMap<Element, boolean>()

/**
 * An element's box on screen, or an empty one where it is when it's visually hidden: clipped to nothing, as the hidden
 * input a checkbox, radio, switch or select draws beside its control is. Such an input sits at the frame's corner, a
 * pixel square, so counting it stretched its layer's box from the corner to the control, over the layers between.
 */
export function elementBox(element: Element): DOMRect {
  const rect = element.getBoundingClientRect()
  let hidden = clippedAway.get(element)

  if (hidden === undefined) {
    const style = getComputedStyle(element)
    hidden = style.clip === "rect(0px, 0px, 0px, 0px)" || style.clipPath === "inset(50%)"
    clippedAway.set(element, hidden)
  }

  return hidden ? new DOMRect(rect.left, rect.top, 0, 0) : rect
}

/**
 * The boxes of what a layout element lays out, in order: its children, and theirs through elements that don't draw a
 * box of their own (display: contents), leaving out those placed absolutely and those not drawn.
 */
export function flowingBoxes(layout: Element): DOMRect[] {
  return [...layout.children].flatMap((child) => {
    const style = getComputedStyle(child)

    if (style.display === "contents") {
      return flowingBoxes(child)
    }

    if (style.display === "none" || style.position === "absolute" || style.position === "fixed") {
      return []
    }

    const box = child.getBoundingClientRect()

    return box.width > 0 || box.height > 0 ? [box] : []
  })
}

/** The box around a node's elements' boxes, leaving out empty ones unless they're all empty. */
export function boxAround(rects: readonly DOMRect[]): DOMRect | undefined {
  const drawn = rects.filter((rect) => rect.width > 0 || rect.height > 0)

  if (drawn.length === 0) {
    return rects[0]
  }

  if (drawn.length === 1) {
    return drawn[0]
  }

  const left = Math.min(...drawn.map((rect) => rect.left))
  const top = Math.min(...drawn.map((rect) => rect.top))
  const right = Math.max(...drawn.map((rect) => rect.right))
  const bottom = Math.max(...drawn.map((rect) => rect.bottom))

  return new DOMRect(left, top, right - left, bottom - top)
}

/** Every node a frame draws, parents before their children. */
export function drawnNodeIds(host: Element): string[] {
  const drawn = drawnNodes(host)

  if (drawn) {
    return [...drawn.ids]
  }

  return attributeElements(host).map((element) => element.dataset.canvasNode!)
}

/** Every node whose box holds a point (client coordinates), outermost first. */
export function nodesAt(host: Element, point: { x: number; y: number }): string[] {
  const holds = (rect: DOMRect | undefined) =>
    !!rect && point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom

  const drawn = drawnNodes(host)

  if (drawn) {
    return drawn.ids.filter((id) => holds(boxAround(drawnBoxes(drawn, id))))
  }

  return attributeElements(host)
    .filter((element) => holds(boxAround([elementBox(element)])))
    .map((element) => element.dataset.canvasNode!)
}

/** The node a node is drawn inside, in the frame. */
export function nodeParent(host: Element, nodeId: string): string | undefined {
  const drawn = drawnNodes(host)

  if (drawn) {
    return drawn.parent(nodeId)
  }

  return findNodeElement(host, nodeId)?.parentElement?.closest<HTMLElement>("[data-canvas-node]")?.dataset.canvasNode
}

/** The node an element in a frame belongs to: the innermost one drawing it or an element around it. */
export function nodeOfElement(host: Element, element: Element): string | undefined {
  const drawn = drawnNodes(host)

  if (drawn) {
    return drawn.nodeOf(element)
  }

  return element.closest<HTMLElement>("[data-canvas-node]")?.dataset.canvasNode
}

/** Every element in a frame marked with the node it stands for, in document order. */
function attributeElements(host: Element): HTMLElement[] {
  return [...(host.shadowRoot?.querySelectorAll<HTMLElement>("[data-canvas-node]") ?? [])]
}

/**
 * Every frame's host element by its design, kept as frames mount and unmount (`registerFrame`), so finding a design's
 * frames doesn't search the canvas. The selection overlay finds them several times each time it measures (PAR-522).
 */
const framesByDesign = new Map<string, Set<HTMLElement>>()

/** Who hears of a frame mounting, unmounting or being drawn afresh, with whether it's mounted. */
const frameListeners = new Set<(host: HTMLElement, mounted: boolean) => void>()

/**
 * Puts a frame's host element (`data-frame`) in the index `findFrames` reads, for as long as it's mounted, under the
 * design it draws. Returns what takes it out again.
 */
export function registerFrame(host: HTMLElement, design: string): () => void {
  let hosts = framesByDesign.get(design)

  if (!hosts) {
    framesByDesign.set(design, (hosts = new Set()))
  }

  hosts.add(host)
  tellFrameListeners(host, true)

  return () => {
    hosts.delete(host)

    if (hosts.size === 0 && framesByDesign.get(design) === hosts) {
      framesByDesign.delete(design)
    }

    tellFrameListeners(host, false)
  }
}

/**
 * Hears of frames mounting and unmounting, and of a mounted frame being drawn afresh, as when it wakes or its guest
 * mounts. Returns what stops it.
 */
export function subscribeFrames(listener: (host: HTMLElement, mounted: boolean) => void): () => void {
  frameListeners.add(listener)

  return () => frameListeners.delete(listener)
}

function tellFrameListeners(host: HTMLElement, mounted: boolean): void {
  for (const listener of frameListeners) {
    listener(host, mounted)
  }
}

function isRegistered(host: HTMLElement): boolean {
  const design = host.dataset.design

  return design !== undefined && !!framesByDesign.get(design)?.has(host)
}

/** The frames drawn for a design inside `root`, in the page's order, optionally one mode or state. */
export function findFrames(root: Node, design: string, filter: { mode?: string; state?: string } = {}): HTMLElement[] {
  const found: HTMLElement[] = []

  for (const host of framesByDesign.get(design) ?? []) {
    if (filter.mode !== undefined && host.dataset.mode !== filter.mode) {
      continue
    }

    if (filter.state !== undefined && host.dataset.state !== filter.state) {
      continue
    }

    if (root.contains(host)) {
      found.push(host)
    }
  }

  return inPageOrder(found)
}

/** Every frame drawn inside `root`, in the page's order. */
export function allFrames(root: Node): HTMLElement[] {
  const found: HTMLElement[] = []

  for (const hosts of framesByDesign.values()) {
    for (const host of hosts) {
      if (root.contains(host)) {
        found.push(host)
      }
    }
  }

  return inPageOrder(found)
}

/** Frames mount in the page's order, but one that mounts again goes last, so they're put back in it. */
function inPageOrder(hosts: HTMLElement[]): HTMLElement[] {
  return hosts.length < 2
    ? hosts
    : hosts.sort((a, b) => (hasFlag(a.compareDocumentPosition(b), Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1))
}
