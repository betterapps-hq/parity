import { bodyAttribute } from "@parity-app/core"
import { isHTMLElement, isSVGElement } from "../lens-windows.ts"
import { unrecordedShadow } from "../shadow.ts"

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

/** The pseudo-elements whose look a picture keeps too. */
const pseudos = ["::before", "::after"] as const

/** What names the look a copied part is drawn by, one of the picture's own rules (`keepLook`). */
const lookAttribute = "data-picture-look"

/**
 * What an element does rather than how it looks, which a copy doesn't take from its layer: a picture is never hit, and
 * its copies don't take the layers' names.
 */
const unkept = new Set([
  "pointer-events",
  "cursor",
  "user-select",
  "-webkit-user-select",
  "touch-action",
  "anchor-name",
  "view-transition-name"
])

/**
 * A logical property, such as `margin-inline-start`, which says again what a physical one does: written beside it,
 * whichever came later would win, even over where a copy is put, so only the physical ones are kept.
 */
const logical = /(^|-)(inline|block)(-|$)/

/** How far past the picture's box its layers' own shadows and outlines still show. */
const bleed = 32

/** The properties that transform an element where it's drawn, without moving where it's laid out. */
const transforms = ["transform", "translate", "rotate", "scale"] as const

/** A box on screen by its edges, in client pixels. */
export interface Edges {
  left: number
  top: number
  right: number
  bottom: number
}

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
    const width = isHTMLElement(element) ? element.offsetWidth : rect.width / scale
    const height = isHTMLElement(element) ? element.offsetHeight : rect.height / scale
    const across = width > 0 ? rect.width / width : scale
    const down = height > 0 ? rect.height / height : scale

    return { width, height, toScreen: new DOMMatrix([across, 0, 0, down, rect.left, rect.top]) }
  }

  if (!(isHTMLElement(element) || isSVGElement(element))) {
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
  const laid = (isHTMLElement(element) && byPoints(element)) || byBox(element.getBoundingClientRect())
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
 * It's `box` on screen, the layers' box as the drag measures it, from what they draw that's seen (`nodeBox`), so the
 * picture sits where the drag places it; in screen pixels, at the frame's `scale` (screen pixels per pixel of the
 * frame). An element of theirs that isn't seen, such as a hidden input or one that's not displayed, is copied as it is,
 * where it is, but doesn't move the picture.
 *
 * The layers are copied into a shadow root of the picture's own, and each copy, and every part of it, is drawn as the
 * same part of its layer is drawn now, property by property, `::before` and `::after` too (`keepLook`): rules about
 * what a layer's in, what's beside it or the container it's in stop matching once its copy is somewhere else, so how
 * each part looks is kept rather than worked out again. The shadow root also adopts the frame's stylesheets, for what's
 * drawn but isn't kept that way, such as a list item's marker or a field's placeholder, and the frame's body is copied
 * without its children, for the classes and attributes the design's rules ask for. Each copy is drawn where its layer
 * is, at its size, so one that fills its layout keeps its size: scaled and turned as whatever the layer is in is, and by
 * its own transforms, which it keeps, from there. The copies keep their `data-canvas-node`, yet
 * aren't layers: hit testing and outlines look for layers in a frame's shadow root, never in the picture's, and nothing
 * in a picture is hit. What can't be copied this way, such as a canvas element's drawing or a scroll position, is left
 * out.
 *
 * Nothing when the host isn't a frame or there are no layers.
 */
export function layerPicture(
  host: HTMLElement,
  layers: readonly Element[],
  scale: number,
  box: Edges
): HTMLElement | undefined {
  const frame = host.shadowRoot

  if (!frame || layers.length === 0 || scale <= 0) {
    return undefined
  }

  const origin = host.getBoundingClientRect()
  const { left, top, right, bottom } = box
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
  const stand = isHTMLElement(body) ? body : document.createElement("div")

  // Only the layers show: the body's own background, border and padding are left out.
  for (const [name, value] of Object.entries(standIn)) {
    stand.style.setProperty(name, value, "important")
  }

  shadow.append(stand)

  // The screen, as the stand-in's pixels: the frame's, from its top-left.
  const fromScreen = new DOMMatrix().scale(1 / scale).translate(-origin.left, -origin.top)

  // How the copies' parts look, each look once, however many parts share it.
  const looks = new Map<string, Look>()

  layers.forEach((layer) => {
    // Where the layer's drawn, through what it's in but without its own transforms, which its copy keeps.
    const { width, height, toScreen } = laidOut(layer, scale)
    // Holds the copy where the layer is drawn, scaled and turned as what the layer's in is, and blended as it blends it.
    const context = document.createElement("div")
    const { opacity, filter } = blendedBy(layer)
    context.style.cssText = `position: absolute; left: 0; top: 0; width: 0; height: 0; transform-origin: 0 0; transform: ${fromScreen.multiply(toScreen).toString()}; opacity: ${opacity}; filter: ${filter}`

    // SAFETY: a deep clone of an element is an element of the same kind, and an HTML or SVG element has a style.
    const copy = layer.cloneNode(true) as HTMLElement
    keepLook(layer, copy, looks)
    keepPlaced(layer, copy, toScreen)

    // Placed from its left and top, whichever way its text runs.
    const place = {
      position: "absolute",
      left: "0",
      top: "0",
      right: "auto",
      bottom: "auto",
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

  if (looks.size > 0) {
    const sheet = new CSSStyleSheet()
    sheet.replaceSync([...looks.values()].flatMap(lookRules).join("\n"))
    shadow.adoptedStyleSheets = [...shadow.adoptedStyleSheets, sheet]
  }

  return picture
}

/**
 * Keeps what's placed absolutely, or fixed, inside a layer where it's drawn in its copy. Each is placed against a box,
 * its containing block, which for a layer that isn't positioned or transformed is outside the layer; its copy is placed
 * absolutely, so what's inside is placed against the copy instead. The layer is given a transform that moves nothing
 * for a moment, which makes it what they're placed against too, and how far each moves on screen is how far its box was
 * from the layer, turned back into the layer's own pixels by `toScreen`; each copy is placed that much the other way,
 * from its left and top. Only those placed against something outside the layer are: one inside something in the layer
 * that holds it (`holds`), such as another placed part, is placed against that, and goes wherever that goes. A layer
 * that transforms itself is what they're placed against already, in its copy too.
 */
function keepPlaced(layer: Element, copy: Element, toScreen: DOMMatrix): void {
  if (!(isHTMLElement(layer) || isSVGElement(layer))) {
    return
  }

  const own = getComputedStyle(layer)

  if (transforms.some((name) => own.getPropertyValue(name) !== "none")) {
    return
  }

  const placed = [...layer.querySelectorAll("*")].flatMap((element, index) => {
    const style = getComputedStyle(element)
    const fixed = style.position === "fixed"

    if ((style.position !== "absolute" && !fixed) || heldWithin(element, layer, fixed)) {
      return []
    }

    return [
      {
        index,
        element,
        fixed,
        left: parseFloat(style.left),
        top: parseFloat(style.top),
        was: element.getBoundingClientRect()
      }
    ]
  })

  if (placed.length === 0) {
    return
  }

  const { style } = layer

  const saved = (["transition", "transform"] as const).map((name) => ({
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
  style.setProperty("transform", "translate(0px)", "important")

  const moves = placed.map(({ element, was }) => {
    const now = element.getBoundingClientRect()

    return { x: now.left - was.left, y: now.top - was.top }
  })

  put(saved[1]!)
  // Placed as it was again before its transition comes back.
  layer.getBoundingClientRect()
  put(saved[0]!)

  const back = new DOMMatrix([toScreen.a, toScreen.b, toScreen.c, toScreen.d, 0, 0]).inverse()
  const parts = [...copy.querySelectorAll("*")]

  // What's fixed is placed against the copy too, as it was measured against the layer, not against what holds it.
  if (isHTMLElement(copy) && placed.some(({ fixed }) => fixed)) {
    copy.style.setProperty("transform", "translate(0px)", "important")
  }

  placed.forEach(({ index, left, top }, at) => {
    const move = moves[at]!
    const part = parts[index]
    const by = back.transformPoint(move)

    if (
      !(isHTMLElement(part) || isSVGElement(part)) ||
      (Math.abs(move.x) < 0.01 && Math.abs(move.y) < 0.01) ||
      ![by.x, by.y, left, top].every(Number.isFinite)
    ) {
      return
    }

    part.style.setProperty("left", `${left - by.x}px`, "important")
    part.style.setProperty("top", `${top - by.y}px`, "important")
    part.style.setProperty("right", "auto", "important")
    part.style.setProperty("bottom", "auto", "important")
  })
}

/** Whether something between `element` and `layer` holds it, so it's placed against that, inside the layer. */
function heldWithin(element: Element, layer: Element, fixed: boolean): boolean {
  for (let at = element.parentElement; at && at !== layer; at = at.parentElement) {
    if (holds(getComputedStyle(at), fixed)) {
      return true
    }
  }

  return false
}

/**
 * Whether an element is what's placed absolutely inside it is placed against, its containing block: one that's
 * positioned, or anything that also holds what's fixed, as transforming, filtering or containing its layout does.
 */
function holds(style: CSSStyleDeclaration, fixed: boolean): boolean {
  if (!fixed && style.position !== "static") {
    return true
  }

  return (
    transforms.some((name) => style.getPropertyValue(name) !== "none") ||
    style.perspective !== "none" ||
    style.filter !== "none" ||
    style.backdropFilter !== "none" ||
    /layout|paint|strict|content/.test(style.contain) ||
    style.containerType !== "normal" ||
    style.contentVisibility === "auto" ||
    /transform|perspective|filter/.test(style.willChange)
  )
}

/** How a layer's drawn into what's behind it: how faint, and through which filters. */
interface Blend {
  opacity: number
  filter: string
}

/**
 * How what a layer's in blends it, which isn't inherited, so its copy wouldn't carry it: every opacity it's in, which
 * multiply, and every filter, the nearest first, as each one's applied to what's drawn inside it. A filter's lengths,
 * such as a blur's, are taken in the layer's own pixels, which is how they're drawn unless something between scales
 * it. A filter drawn by an SVG element (`url()`) is left out, as the picture doesn't have the element.
 */
function blendedBy(layer: Element): Blend {
  let opacity = 1
  const filters: string[] = []

  for (let at = layer.parentElement; at; at = at.parentElement) {
    const style = getComputedStyle(at)
    const own = parseFloat(style.opacity)
    opacity *= Number.isFinite(own) ? own : 1

    if (style.filter !== "none" && !style.filter.includes("url(")) {
      filters.push(style.filter)
    }
  }

  return { opacity, filter: filters.join(" ") || "none" }
}

/** How a copied part is drawn: its declarations, and its `pseudos`' (empty for one that isn't drawn). */
interface Look {
  id: string
  own: string
  pseudo: string[]
}

/**
 * Draws `copy`, and each part inside it, as the same part of `layer` is drawn now, every property as it's resolved
 * there, `::before` and `::after` too, and never to be hit. Each part is marked with its look, added to `looks` unless
 * another part looks the same; their rules win over the frame's, but not over what's written on the copy to place it.
 * Custom properties are kept on the copy itself, for what's inside it to inherit.
 */
function keepLook(layer: Element, copy: Element, looks: Map<string, Look>): void {
  const drawn = [layer, ...layer.querySelectorAll("*")]
  const parts = [copy, ...copy.querySelectorAll("*")]
  // Every element has the same properties, but for custom ones: they're listed once, as listing them is slow.
  const all = [...getComputedStyle(layer)].filter((name) => !unkept.has(name) && !logical.test(name))
  const names = all.filter((name) => !name.startsWith("--"))

  parts.forEach((part, index) => {
    const from = drawn[index]

    if (!from) {
      return
    }

    const own = `${declarations(getComputedStyle(from), index === 0 ? all : names)}pointer-events: none !important`

    const pseudo = pseudos.map((name) => {
      const look = getComputedStyle(from, name)

      return look.content === "none" || look.content === "normal" ? "" : declarations(look, names)
    })

    const key = [own, ...pseudo].join("\n")
    const look = looks.get(key) ?? { id: String(looks.size), own, pseudo }
    looks.set(key, look)
    part.setAttribute(lookAttribute, look.id)
  })
}

/** `names` as `style` resolves them, as important declarations. */
function declarations(style: CSSStyleDeclaration, names: readonly string[]): string {
  let text = ""

  for (const name of names) {
    text += `${name}: ${style.getPropertyValue(name)} !important; `
  }

  return text
}

/** The rules that draw parts with `look`. */
function lookRules({ id, own, pseudo }: Look): string[] {
  const parts = `[${lookAttribute}="${id}"]`

  return [
    `${parts} { ${own} }`,
    ...pseudo.flatMap((text, index) => (text ? [`${parts}${pseudos[index]} { ${text} }`] : []))
  ]
}
