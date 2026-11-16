import { bodyAttribute } from "@parity-app/core"
import { unrecordedShadow } from "../shadow.ts"

/**
 * The properties an element inherits from what it's drawn in, which a picture of it takes from its parent: a frame's
 * stylesheets give it its own rules and the body's, but not those of the layers between.
 */
const inherited = [
  "color",
  "font-family",
  "font-size",
  "font-style",
  "font-weight",
  "font-stretch",
  "font-variant",
  "font-feature-settings",
  "font-variation-settings",
  "line-height",
  "letter-spacing",
  "word-spacing",
  "text-align",
  "text-indent",
  "text-transform",
  "text-shadow",
  "text-rendering",
  "white-space",
  "word-break",
  "overflow-wrap",
  "hyphens",
  "direction",
  "writing-mode",
  "visibility",
  "list-style",
  "caret-color",
  "color-scheme",
  "tab-size",
  "quotes",
  "border-collapse",
  "border-spacing",
  "-webkit-font-smoothing"
]

/** How the frame's body is drawn in a picture: where the layers are placed from, and nothing of its own. */
const standIn = {
  position: "absolute",
  inset: "0",
  margin: "0",
  padding: "0",
  border: "none",
  background: "none",
  "box-shadow": "none",
  outline: "none",
  filter: "none",
  opacity: "1",
  overflow: "visible"
}

/** How far past the picture's box its layers' own shadows and outlines still show. */
const bleed = 32

/** The properties that transform an element where it's drawn, without moving where it's laid out. */
const transforms = ["transform", "translate", "rotate", "scale"] as const

/** Where an element is drawn, leaving out its own transforms (see `laidOut`). */
interface LaidOut {
  /** Its border box's size, in its own pixels. */
  width: number
  height: number
  /** What takes a point in its border box, in its own pixels from the top-left, to the screen. */
  toScreen: DOMMatrix
}

/** How far apart the points that find an element's matrix are, in its own pixels. */
const reach = 100

/**
 * Where an element is drawn on screen, through every transform around it but leaving out its own: what takes a point in
 * its box to the screen, whatever scales or turns what it's in. Its own transforms are switched off for as long as it
 * takes to measure, and put back before its transition is, so putting them back doesn't animate. Three points are put
 * in it, at its corner and a way along each side, and where they're drawn gives the matrix. An element that can't draw
 * what it holds, such as an image, is measured by its box instead, which leaves out a rotation of what it's in.
 */
function laidOut(element: Element, scale: number): LaidOut {
  const byBox = (rect: DOMRect): LaidOut => {
    const width = element instanceof HTMLElement ? element.offsetWidth : rect.width / scale
    const height = element instanceof HTMLElement ? element.offsetHeight : rect.height / scale
    const across = width > 0 ? rect.width / width : scale
    const down = height > 0 ? rect.height / height : scale

    return { width, height, toScreen: new DOMMatrix([across, 0, 0, down, rect.left, rect.top]) }
  }

  if (!(element instanceof HTMLElement || element instanceof SVGElement)) {
    return byBox(element.getBoundingClientRect())
  }

  const { style } = element

  const saved = (["transition", ...transforms] as const).map((name) => ({
    name,
    value: style.getPropertyValue(name),
    priority: style.getPropertyPriority(name)
  }))

  const put = ({ name, value, priority }: (typeof saved)[number]) => {
    if (value) {
      style.setProperty(name, value, priority)
    } else {
      style.removeProperty(name)
    }
  }

  style.setProperty("transition", "none", "important")

  for (const name of transforms) {
    style.setProperty(name, "none", "important")
  }

  // A transform that moves nothing, so the points put in it are placed from its own box.
  style.setProperty("transform", "translate(0px)", "important")
  const laid = (element instanceof HTMLElement && byPoints(element)) || byBox(element.getBoundingClientRect())
  saved.slice(1).forEach(put)
  // Drawn transformed again before its transition comes back.
  element.getBoundingClientRect()
  put(saved[0]!)

  return laid
}

/** An element's matrix, from where three points put in it are drawn (see `laidOut`). Nothing if it can't draw them. */
function byPoints(element: HTMLElement): LaidOut | undefined {
  const drawn = getComputedStyle(element)
  // The points are placed from inside its border, so they're moved out to its corner.
  const corner = { x: -(parseFloat(drawn.borderLeftWidth) || 0), y: -(parseFloat(drawn.borderTopWidth) || 0) }

  const points = [
    { x: 0, y: 0 },
    { x: reach, y: 0 },
    { x: 0, y: reach }
  ].map(({ x, y }) => {
    const point = document.createElement("span")
    point.style.cssText = `position: absolute !important; display: block !important; left: ${corner.x + x}px !important; top: ${corner.y + y}px !important; width: 0 !important; height: 0 !important; margin: 0 !important; padding: 0 !important; border: 0 !important`
    element.append(point)

    return point
  })

  const at = points.map((point) => (point.getClientRects().length > 0 ? point.getBoundingClientRect() : undefined))

  for (const point of points) {
    point.remove()
  }

  const [o, x, y] = at

  if (!o || !x || !y) {
    return undefined
  }

  return {
    width: element.offsetWidth,
    height: element.offsetHeight,
    toScreen: new DOMMatrix([
      (x.left - o.left) / reach,
      (x.top - o.top) / reach,
      (y.left - o.left) / reach,
      (y.top - o.top) / reach,
      o.left,
      o.top
    ])
  }
}

/**
 * A picture of layers drawn in a frame, as they're drawn now, for a drag to carry over the canvas (`CarriedPicture`).
 * It's their box on screen, in screen pixels, at the frame's `scale` (screen pixels per pixel of the frame).
 *
 * The layers are copied into a shadow root of the picture's own that adopts the frame's stylesheets, so the copies are
 * styled as the layers are: a frame's styles live in its shadow root, and plain copies outside it would lose them. The
 * root is laid out as the frame is, its size and the custom properties its host sets, so the project's media queries,
 * which ask the frame's size, still match; the frame's body is copied without its children, for the classes and
 * attributes the design's rules ask for; and each copy takes what its layer inherits from its parent. Each is drawn
 * where its layer is, at its size, so one that fills its layout keeps its size: scaled and turned as whatever the layer
 * is in is, and by its own transforms, which it keeps, from there. The copies keep their `data-canvas-node`,
 * which the frame's own rules are written against (`nodeSelector`), yet aren't layers: hit testing and outlines look
 * for layers in a frame's shadow root, never in the picture's. What can't be copied this way, such as a canvas
 * element's drawing or a scroll position, is left out.
 *
 * Nothing when the host isn't a frame or no layer is drawn.
 */
export function layerPicture(host: HTMLElement, layers: readonly Element[], scale: number): HTMLElement | undefined {
  const frame = host.shadowRoot
  const rects = layers.map((layer) => layer.getBoundingClientRect())

  if (!frame || rects.length === 0 || scale <= 0) {
    return undefined
  }

  const origin = host.getBoundingClientRect()
  const left = Math.min(...rects.map((rect) => rect.left))
  const top = Math.min(...rects.map((rect) => rect.top))
  const right = Math.max(...rects.map((rect) => rect.right))
  const bottom = Math.max(...rects.map((rect) => rect.bottom))
  const own = (value: number) => `${value / scale}px`

  const picture = document.createElement("div")
  picture.dataset.layerPicture = ""
  picture.style.cssText = `position: relative; width: ${right - left}px; height: ${bottom - top}px; overflow: clip; overflow-clip-margin: ${bleed}px`

  // The frame's stand-in: its size, scaled to the screen, with the layers' box at the picture's top-left. A project's
  // rules for its page's root are drawn on a frame's host, so its background is left out here too.
  const stage = document.createElement("div")
  stage.style.cssText = `position: absolute; left: 0; top: 0; width: ${host.offsetWidth}px; height: ${host.offsetHeight}px; transform-origin: 0 0; transform: scale(${scale}) translate(-${own(left - origin.left)}, -${own(top - origin.top)}); pointer-events: none; background: none !important`

  for (const name of host.style) {
    if (name.startsWith("--")) {
      stage.style.setProperty(name, host.style.getPropertyValue(name))
    }
  }

  picture.append(stage)
  const shadow = unrecordedShadow(stage)
  shadow.adoptedStyleSheets = [...frame.adoptedStyleSheets]

  for (const sheet of frame.querySelectorAll(":scope > style, :scope > link[rel='stylesheet']")) {
    shadow.append(sheet.cloneNode(true))
  }

  const body = frame.querySelector(`[${bodyAttribute}]`)?.cloneNode(false)
  const stand = body instanceof HTMLElement ? body : document.createElement("div")

  // Only the layers show: the body's own background, border and padding are left out.
  for (const [name, value] of Object.entries(standIn)) {
    stand.style.setProperty(name, value, "important")
  }

  shadow.append(stand)

  // The screen, as the stand-in's pixels: the frame's, from its top-left.
  const fromScreen = new DOMMatrix().scale(1 / scale).translate(-origin.left, -origin.top)

  layers.forEach((layer) => {
    // Where the layer's drawn, through what it's in but without its own transforms, which its copy keeps.
    const { width, height, toScreen } = laidOut(layer, scale)
    // Holds the copy where the layer is drawn, scaled and turned as what the layer's in is, and inherits what the layer
    // does from its parent.
    const context = document.createElement("div")
    context.style.cssText = `position: absolute; left: 0; top: 0; width: 0; height: 0; transform-origin: 0 0; transform: ${fromScreen.multiply(toScreen).toString()}`

    if (layer.parentElement) {
      const from = getComputedStyle(layer.parentElement)

      for (const name of [...inherited, ...[...from].filter((property) => property.startsWith("--"))]) {
        context.style.setProperty(name, from.getPropertyValue(name))
      }
    }

    // SAFETY: a deep clone of an element is an element of the same kind, and an HTML or SVG element has a style.
    const copy = layer.cloneNode(true) as HTMLElement

    const place = {
      position: "absolute",
      left: "0",
      top: "0",
      width: `${width}px`,
      height: `${height}px`,
      margin: "0",
      "box-sizing": "border-box",
      "max-width": "none",
      "max-height": "none",
      "min-width": "0",
      "min-height": "0"
    }

    for (const [name, value] of Object.entries(place)) {
      copy.style.setProperty(name, value, "important")
    }

    context.append(copy)
    stand.append(context)
  })

  return picture
}
