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

/**
 * Where an element is laid out, on screen, leaving out its own transforms: its box as it'd be drawn without its own
 * scale, rotation or translation, which are switched off for as long as it takes to measure it. They're put back before
 * its transition is, so putting them back doesn't animate.
 */
function laidOut(element: Element): DOMRect {
  const drawn = getComputedStyle(element)

  if (
    !(element instanceof HTMLElement || element instanceof SVGElement) ||
    transforms.every((name) => drawn.getPropertyValue(name) === "none")
  ) {
    return element.getBoundingClientRect()
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

  const rect = element.getBoundingClientRect()
  saved.slice(1).forEach(put)
  // Drawn transformed again before its transition comes back.
  element.getBoundingClientRect()
  put(saved[0]!)

  return rect
}

/**
 * A picture of layers drawn in a frame, as they're drawn now, for a drag to carry over the canvas (`CarriedPicture`).
 * It's their box on screen, in screen pixels, at the frame's `scale` (screen pixels per pixel of the frame).
 *
 * The layers are copied into a shadow root of the picture's own that adopts the frame's stylesheets, so the copies are
 * styled as the layers are: a frame's styles live in its shadow root, and plain copies outside it would lose them. The
 * root is laid out as the frame is, its size and the custom properties its host sets, so the project's media queries,
 * which ask the frame's size, still match; the frame's body is copied without its children, for the classes and
 * attributes the design's rules ask for; and each copy takes what its layer inherits from its parent. Each sits where
 * its layer is laid out, at its size, so one that fills its layout keeps its size, and keeps its own transforms, so
 * it's scaled, turned or moved from there just as its layer is. The copies keep their `data-canvas-node`,
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

  layers.forEach((layer) => {
    // Where the layer's laid out, without its own transforms, which its copy keeps.
    const rect = laidOut(layer)
    // Inherits what the layer does from its parent, without being laid out itself.
    const context = document.createElement("div")
    context.style.display = "contents"

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
      left: own(rect.left - origin.left),
      top: own(rect.top - origin.top),
      width: own(rect.width),
      height: own(rect.height),
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
