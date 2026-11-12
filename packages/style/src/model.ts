import { z } from "zod"
import { transition } from "./motion.ts"
import { nodeFill } from "./paint.ts"
import { finiteNumber, stored } from "./stored.ts"

// The stored style: what a layer's `style`, and a patch's, holds in a `.par` file. The file's other schemas are in
// `@parity-app/core`, which builds its nodes and patches on this one.

/** Steps of the spacing scale (`4` is `calc(var(--spacing) * 4)`), or the name of a length token. */
const length = z.union([finiteNumber, z.string()])

export type Length = z.infer<typeof length>

/** Whether a length, or a field's value, is a name (a length token's, or `"fill"` and `"hug"`) rather than steps. */
export function isNamedLength(value: number | string | undefined): value is string {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- a length is steps (number) or a name (string), with no tag to tell them apart
  return typeof value === "string"
}

/** A fixed length, or `"fill"` the parent, or `"hug"` the content: both are among Length's strings. */
export type Size = Length

// The lists come first, so a list of another length, or something that is neither a list nor a length, says what
// padding takes.
const sides = "expected a length, [vertical, horizontal] or [top, right, bottom, left]"
const padding = z.union([z.tuple([length, length], sides), z.tuple([length, length, length, length], sides), length])

/** All sides, `[vertical, horizontal]`, or `[top, right, bottom, left]`. */
export type Padding = z.infer<typeof padding>

const alignment = z.enum(["start", "center", "end", "stretch"])

/** A color token's name, with its alpha from 0 to 100 when it's see-through. */
const effectColor = stored({ color: z.string().min(1), alpha: finiteNumber.optional() })

export type EffectColor = z.infer<typeof effectColor>

/** Turned off with the eye: kept in the file, not drawn. */
const off = z.boolean().optional()

/**
 * One shadow in a layer's stack. A token's shadow draws the token's layers, with only their color changed; a shadow of
 * its own has offsets, blur and spread in px; a ring is a width in px, drawn outside the box or inside it. Drop and ring
 * are drawn outside, inner inside.
 */
const shadow = z.union([
  stored({ kind: z.enum(["drop", "inner"]), token: z.string().min(1), color: effectColor.optional(), off }),
  stored({
    kind: z.enum(["drop", "inner"]),
    x: finiteNumber,
    y: finiteNumber,
    blur: finiteNumber.nonnegative(),
    spread: finiteNumber,
    color: effectColor,
    off
  }),
  stored({
    kind: z.literal("ring"),
    width: finiteNumber.nonnegative(),
    inset: z.boolean().optional(),
    color: effectColor,
    off
  })
])

export type Shadow = z.infer<typeof shadow>

/** The filter adjustments, in the panel's order. Hue turns in degrees; the rest are percentages. */
export const filterAdjustments = ["brightness", "contrast", "saturate", "hue", "grayscale", "sepia", "invert"] as const

export type FilterAdjustment = (typeof filterAdjustments)[number]

/**
 * One entry of a layer's filters: a blur by a blur token's name, a set of adjustments (brightness, contrast and
 * saturation as a change from 100%, so +25 is 125%; hue in degrees; grayscale, sepia and invert from 0 to 100), or a
 * drop shadow that follows what's drawn rather than the box (the layer's own filters only).
 */
const filter = z.union([
  stored({ kind: z.literal("blur"), value: z.string().min(1), off }),
  stored({
    kind: z.literal("adjust"),
    values: stored({
      brightness: finiteNumber.optional(),
      contrast: finiteNumber.optional(),
      saturate: finiteNumber.optional(),
      hue: finiteNumber.optional(),
      grayscale: finiteNumber.optional(),
      sepia: finiteNumber.optional(),
      invert: finiteNumber.optional()
    }),
    off
  }),
  stored({ kind: z.literal("dropShadow"), shadow, off })
])

export type Filter = z.infer<typeof filter>

/** A move: steps of the spacing scale, a length token's name, or a percentage of the layer's own size. */
const move = z.union([length, stored({ percent: finiteNumber })])

export type Move = z.infer<typeof move>

/**
 * How the layer is drawn moved, turned, scaled and skewed about its origin, without moving anything around it. Scale is
 * a percentage, negative when flipped; rotation and skew are degrees; the origin is a point in the layer, in percent
 * from its top left, its center when unset.
 */
const transform = stored({
  x: move.optional(),
  y: move.optional(),
  rotate: finiteNumber.optional(),
  scaleX: finiteNumber.optional(),
  scaleY: finiteNumber.optional(),
  skewX: finiteNumber.optional(),
  skewY: finiteNumber.optional(),
  origin: stored({ x: finiteNumber, y: finiteNumber }).optional()
})

export type Transform = z.infer<typeof transform>

export const nodeStyle = stored({
  // Layout (layouts only).
  /** Auto layout (flex, the default) or a grid. */
  display: z.enum(["flex", "grid"]).optional(),
  direction: z.enum(["row", "column"]).optional(),
  /** A grid's columns, all the same width; or rows, all the same height. */
  columns: finiteNumber.optional(),
  rows: finiteNumber.optional(),
  gap: length.optional(),
  /** In a grid or wrapping layout, the gap between rows when it differs from `gap`. */
  rowGap: length.optional(),
  /** All sides, `[vertical, horizontal]`, or `[top, right, bottom, left]`. */
  padding: padding.optional(),
  /** Space outside the node, in the same forms as padding. */
  margin: padding.optional(),
  /** Children on the cross axis. */
  align: alignment.optional(),
  /** Children on the main axis. */
  justify: z.enum(["start", "center", "end", "between", "around", "evenly"]).optional(),
  wrap: z.boolean().optional(),

  // Size, within the parent's layout.
  width: length.optional(),
  height: length.optional(),
  minWidth: length.optional(),
  maxWidth: length.optional(),
  minHeight: length.optional(),
  maxHeight: length.optional(),
  /** Grid cells the node spans, in a grid. */
  colSpan: finiteNumber.optional(),
  rowSpan: finiteNumber.optional(),
  /** Fill along the parent's direction. Same as `fill` for the parent's main axis. */
  grow: z.boolean().optional(),
  /** Where this node sits on its parent's cross axis, overriding the parent's `align`. */
  self: alignment.optional(),

  // Position: taken out of the layout and placed against the parent's edges.
  position: z.enum(["absolute"]).optional(),
  top: length.optional(),
  right: length.optional(),
  bottom: length.optional(),
  left: length.optional(),
  /**
   * Layer order (CSS `z-index`) among its siblings' stacking context: a whole number, higher in front, or a z-index
   * token's name. Unset is auto, the order of the layers.
   */
  zIndex: z.union([finiteNumber.int(), z.string()]).optional(),

  // Appearance.
  /** One color token, or a stack of paints, top first: colors, gradients and images (PAR-931). */
  background: nodeFill.optional(),
  foreground: z.string().optional(),
  /** Border color. */
  border: z.string().optional(),
  /** Border width in pixels, as in Tailwind: 0, 1, 2, 4 or 8. */
  borderWidth: finiteNumber.optional(),
  borderStyle: z.enum(["solid", "dashed", "dotted"]).optional(),
  radius: z.string().optional(),
  /** One shadow token's name, or the stack of shadows, top first. */
  shadow: z.union([z.string(), z.array(shadow)]).optional(),
  /** Percent, 0 to 100. */
  opacity: finiteNumber.optional(),
  overflow: z.enum(["visible", "hidden", "scroll"]).optional(),

  // Effects.
  /** The layer's own filters, in the order they apply. */
  filter: z.array(filter).optional(),
  /** Filters on what's behind the layer, seen through it. */
  backdropFilter: z.array(filter).optional(),
  transform: transform.optional(),

  // Type. Set on a layout, it applies to the text inside.
  font: z.string().optional(),
  size: z.string().optional(),
  weight: finiteNumber.optional(),
  leading: z.string().optional(),
  tracking: z.string().optional(),
  textAlign: z.enum(["start", "center", "end", "justify"]).optional(),
  textTransform: z.enum(["uppercase", "lowercase", "capitalize"]).optional(),
  decoration: z.enum(["underline", "line-through"]).optional(),
  italic: z.boolean().optional(),
  /** Lines of text before it's cut off with an ellipsis. */
  lines: finiteNumber.optional(),

  // Motion.
  /** How the layer moves from one look to the next, as a state change shows it. */
  transitions: z.array(transition).optional()
})

/**
 * Visual properties, locked to the project's tokens: lengths are steps of the spacing scale (multiples of `--spacing`)
 * or name a length token, and colors, radii, shadows and type values name one of the project's CSS custom properties
 * (without `--`). Layout is Figma's auto layout, a flex box, or a grid; children size themselves to fill, hug, or a
 * fixed length.
 */
export type NodeStyle = z.infer<typeof nodeStyle>

export const styleKey = nodeStyle.keyof()

export type StyleKey = z.infer<typeof styleKey>

/** Every style key, in the order panels show them. */
export const styleKeys = styleKey.options
