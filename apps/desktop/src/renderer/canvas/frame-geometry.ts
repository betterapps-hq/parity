import type { Point, Rect, SnapBox } from "@parity-app/editor"
import { findNodeElement, nodeBox } from "../frame.ts"

/**
 * Where a frame and what it draws are on screen, and how big a pixel of the design is there. Everything the canvas
 * measures in a frame asks here: resizing, dragging and nudging a layer, what it snaps to, padding and gap handles, the
 * text editor, Paste here and the sizes the overlay and the panel show.
 *
 * Boxes are in screen pixels, as the browser gives them and as pointer events and tldraw take them. Lengths a design
 * writes are in the frame's own pixels. `scale` is the one number between the two, read from where the frame is drawn
 * rather than worked out from the camera, so it always agrees with the boxes beside it.
 *
 * Nothing is read until it's asked for, so a caller pays only for what it uses (PAR-577), and nothing is kept, so there
 * is nothing to go stale as the camera moves (PAR-653). A gesture that wants the frame as it was when it began keeps
 * the numbers it read then.
 */

/** A length on each side of a box. */
export type Sides = Record<"left" | "top" | "right" | "bottom", number>

/** A box on the overlay: screen pixels from the canvas area's corner. */
export interface Box {
  x: number
  y: number
  w: number
  h: number
}

/** A frame as it's drawn now. */
export interface FrameGeometry {
  /** Screen pixels per pixel of the frame: the camera's zoom, the frame's own scale and anything else between. */
  readonly scale: number
  /** The frame on screen. */
  readonly rect: Rect
  /** A node as the frame draws it, or nothing when it draws nothing. */
  node(id: string): NodeGeometry | undefined
  /** An element inside the frame. */
  element(element: Element): ElementGeometry
}

/** An element in a frame as it's drawn now. */
export interface ElementGeometry {
  /** Its border box on screen. */
  readonly borderBox: Rect
  /**
   * Screen pixels per pixel of its own layout: the frame's scale, times any transform the design puts on it or around
   * it. A box turned or stretched unevenly has no one scale, so the frame's stands in.
   */
  readonly scale: number
  /** Its border's widths, in its own pixels. */
  readonly border: Sides
  /** Its padding, in its own pixels. */
  readonly padding: Sides
  /** Inside its border, on screen. */
  readonly paddingBox: Rect
  /** Inside its border and padding, on screen: where its children and its text go. */
  readonly contentBox: Rect
}

/** A node in a frame as it's drawn now. Its own sides are its first element's. */
export interface NodeGeometry extends ElementGeometry {
  /** Around everything it draws at its top level, on screen: what outlines and sizes show. */
  readonly box: Rect
  /** Whether it draws an element. One that draws only text has a box, and nothing to resize. */
  readonly hasElement: boolean
  /** The content box of the element it's laid out in, on screen. */
  readonly parentContentBox: Rect | undefined
  /** The box its insets count from, on screen: inside the border of its containing block. */
  readonly offsetBox: Rect | undefined
  /**
   * From that box's sides to its own, in that box's pixels: the frame's, or the box's own where the design transforms
   * it. A containing block outside the frame is counted in the frame's pixels, which the layer's insets are written in.
   */
  readonly insets: Sides | undefined
}

/** A box's width and height as it's laid out, before anything scales it. */
export interface LaidOut {
  width: number
  height: number
}

/** The furthest a drawn side may be from where one scale puts it, in pixels, before the box counts as uneven. */
const evenWithin = 0.5

/**
 * Screen pixels per layout pixel of a box drawn at `drawn` and laid out at `size`, by its longer side, which is read
 * the most exactly. Nothing when it isn't drawn, or its other side doesn't fit that scale: it's turned or stretched.
 */
export function scaleOf(drawn: Rect, size: LaidOut | undefined): number | undefined {
  const width = drawn.right - drawn.left
  const height = drawn.bottom - drawn.top

  if (!size) {
    return undefined
  }

  const wide = width >= height
  const long = wide ? { drawn: width, laid: size.width } : { drawn: height, laid: size.height }
  const short = wide ? { drawn: height, laid: size.height } : { drawn: width, laid: size.width }

  if (!(long.drawn > 0) || !(long.laid > 0)) {
    return undefined
  }

  const scale = long.drawn / long.laid
  // Half a pixel either way, on screen or as it's laid out, since an offset size is rounded to the pixel, and 1%.
  const within = evenWithin * Math.max(1, scale) + short.drawn * 0.01
  const uneven = short.laid > 0 && Math.abs(short.drawn - short.laid * scale) > within

  return uneven ? undefined : scale
}

/** The box inside `rect`, `sides` in from each of its sides at `scale`, never turned inside out. */
export function insideOf(rect: Rect, sides: Sides, scale: number): Rect {
  const left = rect.left + sides.left * scale
  const top = rect.top + sides.top * scale

  return {
    left,
    top,
    right: Math.max(left, rect.right - sides.right * scale),
    bottom: Math.max(top, rect.bottom - sides.bottom * scale)
  }
}

/** How far each side of `rect` is inside `around`, in pixels `scale` screen pixels big. */
export function insetsWithin(rect: Rect, around: Rect, scale: number): Sides {
  return {
    left: (rect.left - around.left) / scale,
    top: (rect.top - around.top) / scale,
    right: (around.right - rect.right) / scale,
    bottom: (around.bottom - rect.bottom) / scale
  }
}

/** Each side times `scale`: an element's own border or padding, on screen. */
export function scaleSides(sides: Sides, scale: number): Sides {
  return {
    left: sides.left * scale,
    top: sides.top * scale,
    right: sides.right * scale,
    bottom: sides.bottom * scale
  }
}

/** A box on screen in the frame's own pixels, from the frame's corner. */
export function toFrame(frame: Pick<FrameGeometry, "rect" | "scale">, rect: Rect): SnapBox {
  const { rect: origin, scale } = frame

  return {
    x: (rect.left - origin.left) / scale,
    y: (rect.top - origin.top) / scale,
    w: (rect.right - rect.left) / scale,
    h: (rect.bottom - rect.top) / scale
  }
}

/** A point in the frame's own pixels, from its corner, on screen. */
export function toScreen(frame: Pick<FrameGeometry, "rect" | "scale">, point: Point): Point {
  const { rect: origin, scale } = frame

  return { x: origin.left + point.x * scale, y: origin.top + point.y * scale }
}

/** A box's width and height in the frame's own pixels. */
export function frameSize(frame: Pick<FrameGeometry, "scale">, rect: Rect): LaidOut {
  const { scale } = frame

  return { width: (rect.right - rect.left) / scale, height: (rect.bottom - rect.top) / scale }
}

/** Takes what's on screen to the overlay's pixels, which count from the canvas area's corner. */
export interface AreaSpace {
  box: (rect: Rect) => Box
  rect: (rect: Rect) => Rect
  point: (point: Point) => Point
}

/** The overlay's pixels for a canvas area whose corner is at `origin` on screen. */
export function areaSpaceAt(origin: { left: number; top: number }): AreaSpace {
  return {
    box: (rect) => ({
      x: rect.left - origin.left,
      y: rect.top - origin.top,
      w: rect.right - rect.left,
      h: rect.bottom - rect.top
    }),
    rect: (rect) => ({
      left: rect.left - origin.left,
      top: rect.top - origin.top,
      right: rect.right - origin.left,
      bottom: rect.bottom - origin.top
    }),
    point: (point) => ({ x: point.x - origin.left, y: point.y - origin.top })
  }
}

/** The overlay's pixels for a canvas area, where it is now. */
export function areaSpace(area: Element): AreaSpace {
  return areaSpaceAt(area.getBoundingClientRect())
}

/** A frame's geometry, read from its host element as each part is asked for. */
export function frameGeometry(host: HTMLElement): FrameGeometry {
  return new DrawnFrame(host)
}

const noSides: Sides = { left: 0, top: 0, right: 0, bottom: 0 }

function sidesOf(style: CSSStyleDeclaration, prefix: string, suffix = ""): Sides {
  const side = (name: string) => parseFloat(style.getPropertyValue(`${prefix}-${name}${suffix}`)) || 0

  return { left: side("left"), top: side("top"), right: side("right"), bottom: side("bottom") }
}

/**
 * An element's border box as it's laid out. Its computed width and height are exact where they apply; an inline box
 * has none, so its offset size, which is rounded to the pixel, stands in.
 */
function laidOut(element: Element, style: CSSStyleDeclaration): LaidOut | undefined {
  const width = parseFloat(style.width)
  const height = parseFloat(style.height)

  if (Number.isFinite(width) && Number.isFinite(height)) {
    if (style.boxSizing === "border-box") {
      return { width, height }
    }

    const border = sidesOf(style, "border", "-width")
    const padding = sidesOf(style, "padding")

    return {
      width: width + border.left + border.right + padding.left + padding.right,
      height: height + border.top + border.bottom + padding.top + padding.bottom
    }
  }

  return element instanceof HTMLElement ? { width: element.offsetWidth, height: element.offsetHeight } : undefined
}

class DrawnFrame implements FrameGeometry {
  constructor(private readonly host: HTMLElement) {}

  get rect(): Rect {
    return this.host.getBoundingClientRect()
  }

  get scale(): number {
    // A frame that isn't drawn has no scale. Nothing is measured in it, so 1 stands in.
    return scaleOf(this.rect, laidOut(this.host, getComputedStyle(this.host))) ?? 1
  }

  node(id: string): NodeGeometry | undefined {
    // Its box says whether it's drawn at all, so it's read here rather than when it's asked for.
    const box = nodeBox(this.host, id)

    return box && new DrawnNode(this, findNodeElement(this.host, id), box)
  }

  element(element: Element): ElementGeometry {
    return new DrawnElement(this, element)
  }
}

/** An element's box on screen, its computed style and its scale, each read once for an answer. */
interface Read {
  rect: Rect
  style: CSSStyleDeclaration
  scale: number
}

class DrawnElement implements ElementGeometry {
  constructor(
    protected readonly frame: FrameGeometry,
    protected readonly drawn: Element | undefined,
    /** The scale to measure it at, for an element outside the frame, which the frame doesn't scale. */
    private readonly at?: number
  ) {}

  get borderBox(): Rect {
    return this.drawn?.getBoundingClientRect() ?? this.frame.rect
  }

  get scale(): number {
    return this.read()?.scale ?? this.at ?? this.frame.scale
  }

  get border(): Sides {
    return this.drawn ? sidesOf(getComputedStyle(this.drawn), "border", "-width") : noSides
  }

  get padding(): Sides {
    return this.drawn ? sidesOf(getComputedStyle(this.drawn), "padding") : noSides
  }

  get paddingBox(): Rect {
    const read = this.read()

    return read ? insideOf(read.rect, sidesOf(read.style, "border", "-width"), read.scale) : this.borderBox
  }

  get contentBox(): Rect {
    const read = this.read()

    if (!read) {
      return this.borderBox
    }

    const inside = insideOf(read.rect, sidesOf(read.style, "border", "-width"), read.scale)

    return insideOf(inside, sidesOf(read.style, "padding"), read.scale)
  }

  /** Its box, style and scale, from one read of each. */
  private read(): Read | undefined {
    const { drawn } = this

    if (!drawn) {
      return undefined
    }

    const rect = drawn.getBoundingClientRect()
    const style = getComputedStyle(drawn)

    return { rect, style, scale: this.at ?? scaleOf(rect, laidOut(drawn, style)) ?? this.frame.scale }
  }
}

/** A node's own sides are its first element's; one that draws only text has none, and its box stands in. */
class DrawnNode extends DrawnElement implements NodeGeometry {
  constructor(
    frame: FrameGeometry,
    element: Element | undefined,
    readonly box: Rect
  ) {
    super(frame, element)
  }

  get hasElement(): boolean {
    return this.drawn !== undefined
  }

  override get borderBox(): Rect {
    return this.drawn?.getBoundingClientRect() ?? this.box
  }

  override get paddingBox(): Rect {
    return this.drawn ? super.paddingBox : this.box
  }

  override get contentBox(): Rect {
    return this.drawn ? super.contentBox : this.box
  }

  get parentContentBox(): Rect | undefined {
    const parent = this.drawn?.parentElement

    return parent ? this.frame.element(parent).contentBox : undefined
  }

  get offsetBox(): Rect | undefined {
    return this.offsetParent()?.paddingBox
  }

  get insets(): Sides | undefined {
    const around = this.offsetParent()

    return around && insetsWithin(this.borderBox, around.paddingBox, around.scale)
  }

  /**
   * Its containing block, which `offsetParent` gives: a transformed or contained ancestor as well as a positioned one.
   * One outside the frame's shadow tree, as the frame's own outline is for a layer with no positioned ancestor in the
   * design, isn't scaled by the frame, so it's measured at the frame's scale: the layer's insets are written in the
   * frame's pixels.
   */
  private offsetParent(): ElementGeometry | undefined {
    const { drawn } = this
    const around = drawn instanceof HTMLElement ? drawn.offsetParent : undefined

    if (!drawn || !(around instanceof HTMLElement)) {
      return undefined
    }

    return around.getRootNode() === drawn.getRootNode()
      ? this.frame.element(around)
      : new DrawnElement(this.frame, around, this.frame.scale)
  }
}
