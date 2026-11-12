import { filterCss, shadowCss, spacing, token, transformCss } from "./effects.ts"
import { isNamedLength, type NodeStyle, type Padding, type StyleKey } from "./model.ts"

/** One CSS declaration a style comes to. */
export interface Declaration {
  /** As CSS spells it: `background-color`, `align-self`. */
  property: string
  /** As CSS reads it: `var(--primary)`, `calc(var(--spacing) * 4)`. */
  value: string
  /** The state, viewport or theme it applies in. Unset, it always applies. */
  when?: { state?: string; viewport?: string; theme?: string }
  /**
   * The key that wrote it. What a kind of layer draws before any key is set, such as a layout's `display: flex`, is
   * from the key that would change it.
   */
  from: StyleKey
}

/** The direction a layout lays its children along. */
export type Direction = "row" | "column"

/** The kinds of layer a style can be on, which are a design node's types. */
export type LayerKind = "layout" | "text" | "component" | "instance" | "image" | "video"

/** What a style's meaning depends on besides the style itself. */
export interface StyleContext {
  kind: LayerKind
  /** The direction of the layout the layer sits in. Unset at a design's root and inside a component's slots. */
  parent?: Direction
}

/**
 * A layer's style as CSS declarations, one for each property, in the order they're written. Where two keys write one
 * property, such as `size` and `leading` both writing `line-height`, the later one's value stands.
 */
export function declarations(style: NodeStyle, context: StyleContext): Declaration[] {
  const css = new Sheet()

  if (context.kind === "layout") {
    css.set("display", style.display === "grid" ? "grid" : "flex", "display")
    css.set("position", "relative", "position")
    css.set("min-width", "0", "minWidth")
  } else if (context.kind === "text") {
    css.set("margin", "0", "margin")
  }

  surface(css, style)
  spacingSides(css, style)
  box(css, style, context.parent)

  if (context.kind === "layout") {
    layout(css, style)
  } else if (context.kind === "text") {
    text(css, style)
  }

  return css.declarations()
}

/** Declarations by property, in the order each property was first written, as a rule set holds them. */
class Sheet {
  readonly #written = new Map<string, Declaration>()

  set(property: string, value: string, from: StyleKey): void {
    this.#written.set(property, { property, value, from })
  }

  declarations(): Declaration[] {
    return [...this.#written.values()]
  }
}

/**
 * Values the radius field takes that the styling framework writes as a keyword rather than a variable, with the CSS
 * each comes to. `radius-full` is Tailwind's `rounded-full`: a corner as round as the box allows, so a square is a
 * circle and a wide box a pill at any size. Tailwind's theme has no `--radius-full`, so the name isn't a token; a
 * project that declares one keeps its own value.
 */
export const radiusKeywords: RadiusKeywords = { "radius-full": "calc(infinity * 1px)" }

/** The CSS each radius keyword comes to, by keyword. */
export interface RadiusKeywords {
  readonly [keyword: string]: string
}

/** The CSS for a radius: the token's variable, falling back to the keyword's value for a keyword. */
function radiusCss(name: string): string {
  const keyword = radiusKeywords[name]

  return keyword === undefined ? token(name) : `var(--${name}, ${keyword})`
}

const flexAlign = { start: "flex-start", center: "center", end: "flex-end", stretch: "stretch" } as const

const flexJustify = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  between: "space-between",
  around: "space-around",
  evenly: "space-evenly"
} as const

/** A layout's own: its tracks or direction, its gaps, and where its children sit. */
function layout(css: Sheet, style: NodeStyle): void {
  const grid = style.display === "grid"

  if (grid) {
    css.set("grid-template-columns", `repeat(${style.columns ?? 2}, minmax(0, 1fr))`, "columns")

    if (style.rows !== undefined) {
      css.set("grid-template-rows", `repeat(${style.rows}, minmax(0, 1fr))`, "rows")
    }
  } else {
    css.set("flex-direction", style.direction ?? "column", "direction")

    if (style.wrap) {
      css.set("flex-wrap", "wrap", "wrap")
    }
  }

  if (style.gap !== undefined) {
    css.set("gap", spacing(style.gap), "gap")
  }

  if (style.rowGap !== undefined) {
    css.set("row-gap", spacing(style.rowGap), "rowGap")
  }

  if (style.align) {
    css.set("align-items", flexAlign[style.align], "align")
  }

  const { justify } = style

  if (justify) {
    // A grid places items within their cells along the row; distributing space is for the tracks themselves.
    const distributes = justify === "between" || justify === "around" || justify === "evenly"

    if (grid && !distributes) {
      css.set("justify-items", flexAlign[justify], "justify")
    } else {
      css.set("justify-content", flexJustify[justify], "justify")
    }
  }
}

/** Text's own: its width when it hugs, and where it's cut off. */
function text(css: Sheet, style: NodeStyle): void {
  // Hugging text is Figma's auto width: as wide as its line, never wrapped by its parent, only by a maximum width.
  if (style.width === "hug") {
    css.set("width", "max-content", "width")
  }

  if (style.lines === 1) {
    css.set("overflow", "hidden", "lines")
    css.set("text-overflow", "ellipsis", "lines")
    css.set("white-space", "nowrap", "lines")
  } else if (style.lines !== undefined && style.lines > 1) {
    css.set("display", "-webkit-box", "lines")
    css.set("-webkit-box-orient", "vertical", "lines")
    css.set("-webkit-line-clamp", String(style.lines), "lines")
    css.set("overflow", "hidden", "lines")
  }
}

/** Padding and margin, each on all sides, per axis, or per side. */
function spacingSides(css: Sheet, style: NodeStyle): void {
  if (style.padding !== undefined) {
    css.set("padding", sidesCss(style.padding), "padding")
  }

  if (style.margin !== undefined) {
    css.set("margin", sidesCss(style.margin), "margin")
  }
}

function sidesCss(value: Padding): string {
  return (Array.isArray(value) ? value : [value]).map(spacing).join(" ")
}

/** Fill, border, corners, shadow and clipping. */
function surface(css: Sheet, style: NodeStyle): void {
  if (style.background) {
    css.set("background", token(style.background), "background")
  }

  if (style.border !== undefined || style.borderWidth !== undefined) {
    css.set("border-width", `${style.borderWidth ?? 1}px`, "borderWidth")
    css.set("border-style", style.borderStyle ?? "solid", "borderStyle")
    css.set("border-color", style.border ? token(style.border) : "var(--border, currentColor)", "border")
  }

  if (style.radius) {
    css.set("border-radius", radiusCss(style.radius), "radius")
  }

  const boxShadow = shadowCss(style.shadow)

  if (boxShadow) {
    css.set("box-shadow", boxShadow, "shadow")
  }

  if (style.overflow) {
    css.set("overflow", style.overflow === "scroll" ? "auto" : style.overflow, "overflow")
  }
}

/**
 * What applies to any node, including a component's root: its size and place in the parent's layout, opacity, and
 * type, which the text inside inherits.
 */
function box(css: Sheet, style: NodeStyle, parent: Direction | undefined): void {
  if (style.grow) {
    fill(css, parent === "column" ? "height" : "width", parent ?? "row", "grow")
  }

  size(css, "width", style, parent)
  size(css, "height", style, parent)

  if (style.minWidth !== undefined) {
    css.set("min-width", spacing(style.minWidth), "minWidth")
  }

  if (style.maxWidth !== undefined) {
    css.set("max-width", spacing(style.maxWidth), "maxWidth")
  }

  if (style.minHeight !== undefined) {
    css.set("min-height", spacing(style.minHeight), "minHeight")
  }

  if (style.maxHeight !== undefined) {
    css.set("max-height", spacing(style.maxHeight), "maxHeight")
  }

  if (style.self) {
    css.set("align-self", flexAlign[style.self], "self")
  }

  if (style.colSpan !== undefined) {
    css.set("grid-column", `span ${style.colSpan} / span ${style.colSpan}`, "colSpan")
  }

  if (style.rowSpan !== undefined) {
    css.set("grid-row", `span ${style.rowSpan} / span ${style.rowSpan}`, "rowSpan")
  }

  if (style.position === "absolute") {
    css.set("position", "absolute", "position")

    for (const side of ["top", "right", "bottom", "left"] as const) {
      if (style[side] !== undefined) {
        css.set(side, spacing(style[side]), side)
      }
    }
  }

  // Every node is a flex or grid item, where z-index applies without a position.
  if (style.zIndex !== undefined) {
    css.set("z-index", isNamedLength(style.zIndex) ? token(style.zIndex) : String(style.zIndex), "zIndex")
  }

  if (style.opacity !== undefined) {
    css.set("opacity", String(style.opacity / 100), "opacity")
  }

  effects(css, style)
  type(css, style)
}

/** Filters, the backdrop's filters and the transform. */
function effects(css: Sheet, style: NodeStyle): void {
  for (const [property, value] of Object.entries(transformCss(style.transform))) {
    css.set(property, value, "transform")
  }

  const filter = filterCss(style.filter)
  const backdrop = filterCss(style.backdropFilter)

  if (filter) {
    css.set("filter", filter, "filter")
  }

  if (backdrop) {
    css.set("backdrop-filter", backdrop, "backdropFilter")
  }
}

/** Type, which the text inside a layout inherits. */
function type(css: Sheet, style: NodeStyle): void {
  if (style.foreground) {
    css.set("color", token(style.foreground), "foreground")
  }

  if (style.font) {
    css.set("font-family", token(style.font), "font")
  }

  if (style.size) {
    css.set("font-size", token(style.size), "size")
    css.set("line-height", `var(--${style.size}--line-height, 1.5)`, "size")
  }

  if (style.leading) {
    css.set("line-height", token(style.leading), "leading")
  }

  if (style.weight !== undefined) {
    css.set("font-weight", String(style.weight), "weight")
  }

  if (style.tracking) {
    css.set("letter-spacing", token(style.tracking), "tracking")
  }

  if (style.textAlign) {
    css.set("text-align", style.textAlign, "textAlign")
  }

  if (style.textTransform) {
    css.set("text-transform", style.textTransform, "textTransform")
  }

  if (style.decoration) {
    css.set("text-decoration-line", style.decoration, "decoration")
  }

  if (style.italic) {
    css.set("font-style", "italic", "italic")
  }
}

/**
 * Figma's sizing in flex terms. Filling the parent's main axis grows into the free space; filling the cross axis
 * stretches. A fixed length doesn't shrink along the main axis. Outside a layout, fill is the whole parent.
 */
function size(css: Sheet, axis: "width" | "height", style: NodeStyle, parent: Direction | undefined): void {
  const length = style[axis]

  if (length === undefined) {
    return
  }

  const main = parent !== undefined && (axis === "width") === (parent === "row")

  if (length === "hug") {
    css.set(axis, "fit-content", axis)
  } else if (length === "fill") {
    fill(css, axis, parent, axis)
  } else {
    css.set(axis, spacing(length), axis)

    if (main) {
      css.set("flex-shrink", "0", axis)
    }
  }
}

function fill(css: Sheet, axis: "width" | "height", parent: Direction | undefined, from: StyleKey): void {
  if (parent === undefined) {
    css.set(axis, "100%", from)
  } else if ((axis === "width") === (parent === "row")) {
    css.set("flex", "1 1 0%", from)
    css.set(axis === "width" ? "min-width" : "min-height", "0", from)
  } else {
    css.set("align-self", "stretch", from)
  }
}
