import { type DesignNode, type NodeStyle, textTags } from "@parity-app/core"

/**
 * What the page draws, as the canvas reads it from a component's elements to show what's inside it as layers (read-only
 * viewer, step 8): each element's tag, the attributes that name or fill it, the styles it's drawn with, and what's
 * inside it. Text between elements is a snapshot of its own, tagged `#text`. The app reads these from the page; this
 * module turns them into layers without a page.
 */
export interface ElementSnapshot {
  /** The layer id it becomes: unique in its design, and without a slash, which a path inside an instance uses. */
  id: string
  /** The element's tag in lower case, or `#text` for text. */
  tag: string
  /** A text's characters, with runs of spaces as one. */
  text?: string
  /** `src`, `alt`, `data-slot`, `role`, `aria-*`, and an input's `type` and `placeholder`, when it has them. */
  attributes: Readonly<Record<string, string>>
  /** Its computed styles, by CSS property name: what it's drawn with, not what its rules say. */
  style: Readonly<Record<string, string>>
  /** An `<svg>`'s markup, which its layer shows as an image. */
  markup?: string
  children: readonly ElementSnapshot[]
}

/** The kind of layer an element becomes. */
export type ElementLayerType = "layout" | "text" | "image" | "video"

/** Elements that show a picture, drawn as an image layer: `<svg>` from its markup. */
const pictureTags = new Set(["img", "svg", "canvas"])

/**
 * Elements that are text, which are a text layer when only text is in them. Any other element, a `div` or a `button`,
 * is a layout with its text as a layer inside, so every element a component draws is a layer.
 */
const textElements = new Set([
  "p",
  "span",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "strong",
  "em",
  "b",
  "i",
  "small",
  "label",
  "code",
  "a"
])

/** Form controls, which draw their own box: a layout with nothing inside, named for what they are. */
const controlTags = new Set(["input", "textarea", "select", "progress", "meter"])

/**
 * The layer an element is: a picture (`img`, `svg`, `canvas`) is an image, a `video` a video, text and a text element
 * (`textElements`) with only text in it is text, and anything else is a layout: a form control, an element holding
 * others, or a `div` or `button` with its text inside.
 */
export function elementLayerType(element: Pick<ElementSnapshot, "tag" | "children" | "text">): ElementLayerType {
  if (element.tag === "#text") {
    return "text"
  }

  if (pictureTags.has(element.tag)) {
    return "image"
  }

  if (element.tag === "video") {
    return "video"
  }

  if (controlTags.has(element.tag)) {
    return "layout"
  }

  const onlyText = element.children.every((child) => child.tag === "#text")

  return onlyText && textElements.has(element.tag) && textOf(element) !== "" ? "text" : "layout"
}

/** The layers a component's elements are (see `elementLayerType`), each named for what it is, with its styles. */
export function elementLayers(elements: readonly ElementSnapshot[]): DesignNode[] {
  return elements.flatMap((element) => (element.tag === "#text" && !element.text?.trim() ? [] : [layerOf(element)]))
}

function layerOf(element: ElementSnapshot): DesignNode {
  const type = elementLayerType(element)
  const name = layerName(element)
  const style = styleOfElement(element, type)

  if (type === "text") {
    const text: DesignNode = { type: "text", id: element.id, name, text: textOf(element), style }
    const tag = textTags.find((each) => each === element.tag)

    if (tag) {
      text.tag = tag
    }

    return text
  }

  if (type === "image") {
    const image: DesignNode = { type: "image", id: element.id, name, src: pictureOf(element), style }
    const alt = element.attributes.alt

    if (alt) {
      image.alt = alt
    }

    return image
  }

  if (type === "video") {
    return { type: "video", id: element.id, name, src: element.attributes.src ?? "", style }
  }

  return { type: "layout", id: element.id, name, style, children: elementLayers(element.children) }
}

/**
 * What a layer is called: its `data-slot`, as shadcn names its parts (`card-header`), else its role, else its tag, as
 * `button` or `input (email)`; text is called Text.
 */
export function layerName(element: Pick<ElementSnapshot, "tag" | "attributes">): string {
  if (element.tag === "#text") {
    return "Text"
  }

  const { attributes } = element
  const named = attributes["data-slot"] ?? attributes.role

  if (named) {
    return named
  }

  return element.tag === "input" && attributes.type ? `input (${attributes.type})` : element.tag
}

/** An element's text, with runs of spaces as one: its own for text, else its text children's together. */
function textOf(element: Pick<ElementSnapshot, "tag" | "text" | "children">): string {
  const text =
    element.tag === "#text" ? (element.text ?? "") : element.children.map((child) => child.text ?? "").join(" ")

  return text.replaceAll(/\s+/g, " ").trim()
}

/** The picture an image layer shows: an `<svg>` as a data URL of its markup, else the element's `src`. */
function pictureOf(element: ElementSnapshot): string {
  if (element.markup) {
    return `data:image/svg+xml,${encodeURIComponent(element.markup)}`
  }

  return element.attributes.src ?? ""
}

/** Pixels, as a length: undefined for none, `auto` or `normal`. */
function pixels(value: string | undefined): { value: string } | undefined {
  if (!value || value === "auto" || value === "normal" || value === "none" || Number.parseFloat(value) === 0) {
    return undefined
  }

  return { value }
}

/** A color, unless it's transparent. */
function paintOf(value: string | undefined): { value: string } | undefined {
  if (!value || value === "transparent" || /^rgba\(.*,\s*0\)$/.test(value)) {
    return undefined
  }

  return { value }
}

/** A flex alignment as a layout's: `flex-start` is start; `normal` and `stretch` are left unset as the default. */
function alignmentOf(value: string | undefined): "start" | "center" | "end" | undefined {
  if (value === "flex-start" || value === "start" || value === "self-start") {
    return "start"
  }

  if (value === "center") {
    return "center"
  }

  return value === "flex-end" || value === "end" || value === "self-end" ? "end" : undefined
}

const spreads = ["space-between", "space-around", "space-evenly"] as const

/** A main-axis distribution as a layout's, as `alignmentOf` reads alignments, or a spread. */
function justifyOf(value: string | undefined): NodeStyle["justifyContent"] {
  return spreads.find((spread) => spread === value) ?? alignmentOf(value)
}

/** A text alignment as a text's: `left` reads as start and `right` as end. */
function textAlignOf(value: string | undefined): NodeStyle["textAlign"] {
  if (value === "center" || value === "justify") {
    return value
  }

  if (value === "right" || value === "end") {
    return "end"
  }

  return undefined
}

/**
 * An element's computed styles as a layer's: its size as drawn, a layout's direction, gap, padding and alignment, its
 * fill, border, corners and opacity, and the type it sets. A value it doesn't change from the default is left out.
 */
export function styleOfElement(element: Pick<ElementSnapshot, "style">, type: ElementLayerType): NodeStyle {
  const css = element.style
  const style: NodeStyle = {}

  const set = <Key extends keyof NodeStyle>(key: Key, value: NodeStyle[Key] | undefined) => {
    if (value !== undefined) {
      style[key] = value
    }
  }

  set("width", pixels(css.width))
  set("height", pixels(css.height))

  if (type === "layout") {
    const flex = css.display === "flex" || css.display === "inline-flex"
    set("display", css.display === "grid" || css.display === "inline-grid" ? "grid" : undefined)
    set("flexDirection", flex && !css["flex-direction"]?.startsWith("column") ? "row" : "column")
    set("gap", pixels(css["row-gap"] === css["column-gap"] ? css["column-gap"] : css.gap))
    set("alignItems", alignmentOf(css["align-items"]))
    set("justifyContent", justifyOf(css["justify-content"]))
    set("flexWrap", css["flex-wrap"] === "wrap" ? "wrap" : undefined)
    set("overflow", css.overflow === "hidden" || css.overflow === "auto" ? css.overflow : undefined)
  }

  const sides = ["top", "right", "bottom", "left"].map((side) => css[`padding-${side}`] ?? "0px")

  if (sides.some((side) => Number.parseFloat(side) !== 0)) {
    const [top, right, bottom, left] = sides.map((side) => ({ value: side }))
    set("padding", sides.every((side) => side === sides[0]) ? top! : [top!, right!, bottom!, left!])
  }

  const fill = paintOf(css["background-color"])
  set("fills", fill ? [{ type: "solid", color: fill }] : undefined)

  const border = css["border-top-style"]

  if (border && border !== "none" && Number.parseFloat(css["border-top-width"] ?? "0") > 0) {
    set("borderWidth", { value: css["border-top-width"]! })
    set("borderColor", paintOf(css["border-top-color"]))
    set("borderStyle", border === "dashed" || border === "dotted" ? border : "solid")
  }

  set("borderRadius", pixels(css["border-top-left-radius"]))

  const opacity = Number.parseFloat(css.opacity ?? "1")
  set("opacity", opacity < 1 ? { value: opacity } : undefined)

  if (type === "text") {
    set("color", paintOf(css.color))
    set("fontFamily", css["font-family"] ? { value: css["font-family"] } : undefined)
    set("fontSize", pixels(css["font-size"]))
    const weight = Number.parseFloat(css["font-weight"] ?? "")
    set("fontWeight", Number.isFinite(weight) ? { value: weight } : undefined)
    set("lineHeight", pixels(css["line-height"]))
    set("letterSpacing", pixels(css["letter-spacing"]))
    set("textAlign", textAlignOf(css["text-align"]))
  }

  return style
}

/** The computed styles `styleOfElement` reads, for the app to take from each element. */
export const readStyles = [
  "display",
  "flex-direction",
  "flex-wrap",
  "gap",
  "row-gap",
  "column-gap",
  "align-items",
  "justify-content",
  "overflow",
  "width",
  "height",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "background-color",
  "border-top-style",
  "border-top-width",
  "border-top-color",
  "border-top-left-radius",
  "opacity",
  "color",
  "font-family",
  "font-size",
  "font-weight",
  "line-height",
  "letter-spacing",
  "text-align"
] as const
