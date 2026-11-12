import type { CssDeclaration } from "./adapter.ts"
import { filterCss, shadowCss, transformCss } from "./effects.ts"
import { isHug, type Named, type NodeStyle, type Padding, type StyleKey, type Track } from "./model.ts"
import { transitionCss } from "./motion.ts"
import { colorCss, fillCss } from "./paint.ts"
import { formCss, namedCss, spacing } from "./value.ts"

/** One CSS declaration a style comes to, with the key that wrote it. */
export interface Declaration extends CssDeclaration {
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
  /**
   * Text whose tag draws inline (`span`, `strong`), which takes no width or alignment of its own outside a layout, as in
   * a component's slot.
   */
  inline?: boolean
  /**
   * One of the layer's children is placed against its edges (Absolute), so the layer is the box it's placed in: it's
   * drawn `relative`, unless its own placement already makes it that box.
   */
  anchors?: boolean
}

/**
 * A layer's style as CSS declarations, one for each property, in the order they're written. Where two keys write one
 * property, such as `fontSize` and `lineHeight` both writing `line-height`, the later one's value stands.
 */
export function declarations(style: NodeStyle, context: StyleContext): Declaration[] {
  const css = new Sheet()

  // A layer is drawn with what its code would write and no more (PAR-942): a layout isn't `relative` unless a child is
  // placed in it, and can't shrink below its content unless it fills, which writes its own `min-width: 0`.
  if (context.kind === "layout") {
    css.set("display", style.display === "grid" ? "grid" : "flex", "display")
  } else if (context.kind === "text") {
    css.set("margin", "0", "margin")
  }

  surface(css, style)
  spacingSides(css, style)
  box(css, style, context)

  if (context.kind === "layout") {
    layout(css, style)
  } else if (context.kind === "text") {
    text(css, style, context.inline ?? false)
  }

  // What no key owns is drawn after the keys, as written.
  for (const [property, declaration] of Object.entries(style.css ?? {})) {
    if (!declaration.off) {
      css.set(property, declaration.value, "css")
    }
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
function radiusCss(value: Named): string {
  const keyword = "token" in value ? radiusKeywords[value.token] : undefined

  return keyword === undefined || !("token" in value) ? namedCss(value) : `var(--${value.token}, ${keyword})`
}

const flexAlign = { start: "flex-start", center: "center", end: "flex-end", stretch: "stretch" } as const

const flexJustify = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  "space-between": "space-between",
  "space-around": "space-around",
  "space-evenly": "space-evenly"
} as const

/** A grid without tracks of its own has two columns, each Fill. */
const defaultColumns: readonly Track[] = [{ fr: 1 }, { fr: 1 }]

/** A Fill track shares what's left and can narrow below its content, as `grid-cols-3`'s tracks do. */
function trackCss(track: Track): string {
  return "fr" in track ? `minmax(0, ${track.fr}fr)` : spacing(track)
}

/** A grid's tracks as CSS: `repeat()` while they're all the same size, one a track otherwise. */
function tracksCss(tracks: readonly Track[]): string {
  const sizes = tracks.map(trackCss)
  const [first] = sizes

  return first !== undefined && sizes.every((size) => size === first)
    ? `repeat(${sizes.length}, ${first})`
    : sizes.join(" ")
}

/** A layout's own: its tracks or direction, its gaps, and where its children sit. */
function layout(css: Sheet, style: NodeStyle): void {
  const grid = style.display === "grid"

  if (grid) {
    css.set("grid-template-columns", tracksCss(style.gridTemplateColumns ?? defaultColumns), "gridTemplateColumns")

    if (style.gridTemplateRows !== undefined) {
      css.set("grid-template-rows", tracksCss(style.gridTemplateRows), "gridTemplateRows")
    }
  } else {
    css.set("flex-direction", style.flexDirection ?? "column", "flexDirection")

    if (style.flexWrap === "wrap") {
      css.set("flex-wrap", "wrap", "flexWrap")
    }
  }

  if (style.gap !== undefined) {
    css.set("gap", spacing(style.gap), "gap")
  }

  if (style.rowGap !== undefined) {
    css.set("row-gap", spacing(style.rowGap), "rowGap")
  }

  if (style.alignItems) {
    css.set("align-items", flexAlign[style.alignItems], "alignItems")
  }

  const { justifyContent: justify } = style

  if (justify) {
    // A grid places items within their cells along the row; distributing space is for the tracks themselves.
    const distributes = justify !== "start" && justify !== "center" && justify !== "end"

    if (grid && !distributes) {
      css.set("justify-items", flexAlign[justify], "justifyContent")
    } else {
      css.set("justify-content", flexJustify[justify], "justifyContent")
    }
  }
}

/** The keys an inline tag ignores until it's drawn as a block: its size, its alignment and a cut-off line. */
const boxKeys = ["width", "height", "minWidth", "maxWidth", "minHeight", "maxHeight", "textAlign", "lineClamp"] as const

/** Text's own: its width when it hugs, whether an inline tag is drawn as a block, and where it's cut off. */
function text(css: Sheet, style: NodeStyle, inline: boolean): void {
  // Hugging text is Figma's auto width: as wide as its line, never wrapped by its parent, only by a maximum width.
  if (isHug(style.width)) {
    css.set("width", "max-content", "width")
  }

  // An inline tag's box is its line, which takes no size or alignment; a flex or grid parent blockifies it, but a
  // component's slot may not. Several lines draw their own box below.
  const needsBox = inline ? boxKeys.find((key) => style[key] !== undefined) : undefined

  if (needsBox) {
    css.set("display", "block", needsBox)
  }

  if (style.lineClamp === 1) {
    css.set("overflow", "hidden", "lineClamp")
    css.set("text-overflow", "ellipsis", "lineClamp")
    css.set("white-space", "nowrap", "lineClamp")
  } else if (style.lineClamp !== undefined && style.lineClamp > 1) {
    css.set("display", "-webkit-box", "lineClamp")
    css.set("-webkit-box-orient", "vertical", "lineClamp")
    css.set("-webkit-line-clamp", String(style.lineClamp), "lineClamp")
    css.set("overflow", "hidden", "lineClamp")
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
  // A fill's style names its properties as the DOM does (`backgroundImage`).
  for (const [name, value] of Object.entries(fillCss(style.fills))) {
    css.set(
      name.replaceAll(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`),
      value,
      "fills"
    )
  }

  if (style.borderColor !== undefined || style.borderWidth !== undefined) {
    css.set("border-width", `${style.borderWidth ?? 1}px`, "borderWidth")
    css.set("border-style", style.borderStyle ?? "solid", "borderStyle")
    css.set(
      "border-color",
      style.borderColor ? colorCss(style.borderColor) : "var(--border, currentColor)",
      "borderColor"
    )
  }

  if (style.borderRadius) {
    css.set("border-radius", radiusCss(style.borderRadius), "borderRadius")
  }

  const boxShadow = shadowCss(style.boxShadow)

  if (boxShadow) {
    css.set("box-shadow", boxShadow, "boxShadow")
  }

  if (style.overflow) {
    css.set("overflow", style.overflow, "overflow")
  }
}

/**
 * What applies to any node, including a component's root: its size and place in the parent's layout, opacity, and
 * type, which the text inside inherits.
 */
function box(css: Sheet, style: NodeStyle, { kind, parent, anchors }: StyleContext): void {
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

  if (style.alignSelf) {
    css.set("align-self", flexAlign[style.alignSelf], "alignSelf")
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

    stretchBetweenEdges(css, style, kind)
  } else if (anchors) {
    css.set("position", "relative", "position")
  }

  // Every node is a flex or grid item, where z-index applies without a position.
  if (style.zIndex !== undefined) {
    css.set("z-index", formCss(style.zIndex, String), "zIndex")
  }

  if (style.opacity !== undefined) {
    css.set("opacity", String(style.opacity / 100), "opacity")
  }

  effects(css, style)
  type(css, style)

  const transition = transitionCss(style.transition)

  if (transition) {
    css.set("transition", transition, "transition")
  }
}

/**
 * Placed against both edges of an axis with no length of its own, a box spans between them, as CSS draws an element
 * with an auto size. A component's root often brings its own size in its classes, such as a separator's `w-full`, which
 * would win over the edges, so the auto size is written out for it.
 */
function stretchBetweenEdges(css: Sheet, style: NodeStyle, kind: LayerKind): void {
  if (kind !== "component" && kind !== "instance") {
    return
  }

  if (style.left !== undefined && style.right !== undefined && style.width === undefined) {
    css.set("width", "auto", "right")
  }

  if (style.top !== undefined && style.bottom !== undefined && style.height === undefined) {
    css.set("height", "auto", "bottom")
  }
}

/** Filters, the backdrop's filters and the transform. */
function effects(css: Sheet, style: NodeStyle): void {
  const transformKeys = {
    translate: "translate",
    rotate: "rotate",
    scale: "scale",
    transform: "transform",
    "transform-origin": "transformOrigin"
  } as const

  for (const [property, value] of Object.entries(transformCss(style))) {
    // SAFETY: `transformCss` writes only the properties `transformKeys` lists.
    css.set(property, value, transformKeys[property as keyof typeof transformKeys])
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
  if (style.color) {
    css.set("color", colorCss(style.color), "color")
  }

  if (style.fontFamily) {
    css.set("font-family", namedCss(style.fontFamily), "fontFamily")
  }

  if (style.fontSize) {
    css.set("font-size", namedCss(style.fontSize), "fontSize")

    // A font size token brings the line height the project pairs with it, as the framework's class does.
    if ("token" in style.fontSize) {
      css.set("line-height", `var(--${style.fontSize.token}--line-height, 1.5)`, "fontSize")
    }
  }

  if (style.lineHeight) {
    css.set("line-height", spacing(style.lineHeight), "lineHeight")
  }

  if (style.fontWeight !== undefined) {
    css.set("font-weight", String(style.fontWeight), "fontWeight")
  }

  if (style.letterSpacing) {
    css.set("letter-spacing", namedCss(style.letterSpacing), "letterSpacing")
  }

  if (style.textAlign) {
    css.set("text-align", style.textAlign, "textAlign")
  }

  if (style.textTransform) {
    css.set("text-transform", style.textTransform, "textTransform")
  }

  if (style.textDecorationLine) {
    css.set("text-decoration-line", style.textDecorationLine, "textDecorationLine")
  }

  if (style.fontStyle === "italic") {
    css.set("font-style", "italic", "fontStyle")
  }

  if (style.overflowWrap) {
    css.set("overflow-wrap", style.overflowWrap, "overflowWrap")
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

  if (isHug(length)) {
    css.set(axis, "fit-content", axis)
  } else if ("size" in length) {
    const placed = style.alignSelf !== undefined || style[axis === "width" ? "maxWidth" : "maxHeight"] !== undefined
    fill(css, axis, parent, axis, placed, length.share)
  } else {
    css.set(axis, spacing(length), axis)

    if (main) {
      css.set("flex-shrink", "0", axis)
    }
  }
}

/**
 * Across the parent, a fill stretches, unless the node is `placed`, with its own `self` or a maximum on this axis:
 * `self` would replace the stretch and leave it as wide as its content, and a stretched node stops at its maximum at
 * the start, ignoring the parent's alignment. Those take the whole parent instead, up to the maximum, and sit where
 * `self` or the parent's alignment puts them, as `w-full max-w-… mx-auto` does.
 */
function fill(
  css: Sheet,
  axis: "width" | "height",
  parent: Direction | undefined,
  from: StyleKey,
  placed = false,
  share = 1
): void {
  if (parent === undefined) {
    css.set(axis, "100%", from)
  } else if ((axis === "width") === (parent === "row")) {
    css.set("flex", `${share} 1 0%`, from)
    css.set(axis === "width" ? "min-width" : "min-height", "0", from)
  } else if (placed) {
    css.set(axis, "100%", from)
  } else {
    css.set("align-self", "stretch", from)
  }
}
