import { z } from "zod"
import { ownerOf } from "./ledger.ts"
import { transition } from "./motion.ts"
import { color, paint } from "./paint.ts"
import { finiteNumber, stored } from "./stored.ts"
import { exprForm, keywordForm, off, stepForm, tokenForm, valueForm } from "./value.ts"

// The stored style: what a layer's `style`, and a patch's, holds in a `.par` file. The file's other schemas are in
// `@parity-app/core`, which builds its nodes and patches on this one. A key is named after the CSS property it writes,
// and a value that can be a token is stored with its form (value.ts), so nothing is guessed from its text.

const lengthForms = "expected { step }, { token }, { value }, { keyword } or { expr }"

/**
 * A length: steps of the spacing scale (`{ step: 4 }` is `calc(var(--spacing) * 4)`), a length token, a value with its
 * unit (`{ value: "280px" }`, `{ value: "50%" }`), a keyword (`auto`) or an expression (`clamp(…)`).
 */
const length = z.union([stepForm, tokenForm, valueForm, keywordForm, exprForm], lengthForms)

export type Length = z.infer<typeof length>

const hug = stored({ size: z.literal("hug") })

/** Fill the parent, with the share of the free space it takes beside other fills when that isn't one. */
const fill = stored({ size: z.literal("fill"), share: finiteNumber.positive().optional() })

/** A length, or `{ size: "fill" }` the parent, or `{ size: "hug" }` the content. */
const size = z.union([stepForm, tokenForm, valueForm, keywordForm, exprForm, hug, fill], `${lengthForms}, or { size }`)

export type Size = z.infer<typeof size>

/**
 * What a length field holds for a length: its steps as a number, or a name, which is a length token's, `"fill"` or
 * `"hug"`. A field edits steps and names; the stored form says which a value is.
 */
export type FieldLength = number | string

/** Whether a field's length is a name (a length token's, or `"fill"` and `"hug"`) rather than steps. */
export function isNamedLength(value: FieldLength | undefined): value is string {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- a field's length is steps (number) or a name (string), with no tag to tell them apart
  return typeof value === "string"
}

/** Whether a size fills its parent. */
export function isFill(value: Size | undefined): value is z.infer<typeof fill> {
  return value !== undefined && "size" in value && value.size === "fill"
}

/** Whether a size hugs its content. */
export function isHug(value: Size | undefined): value is z.infer<typeof hug> {
  return value !== undefined && "size" in value && value.size === "hug"
}

/** The steps a length is, when it's steps of the spacing scale. */
export function lengthSteps(value: Size | undefined): number | undefined {
  return value !== undefined && "step" in value ? value.step : undefined
}

/** The length token a length names, when it names one. */
export function lengthToken(value: Size | undefined): string | undefined {
  return value !== undefined && "token" in value ? value.token : undefined
}

/**
 * A stored length as a length field holds it: its steps, its token's name, or `"fill"` and `"hug"`. A length written
 * out (`50%`, `auto`, `clamp(…)`) is shown as it's written, which no field edits yet.
 */
export function lengthField(value: Size | undefined): FieldLength | undefined {
  if (value === undefined) {
    return undefined
  }

  if ("size" in value) {
    return value.size
  }

  if ("step" in value) {
    return value.step
  }

  if ("token" in value) {
    return value.token
  }

  if ("value" in value) {
    return value.value
  }

  return "keyword" in value ? value.keyword : value.expr
}

/** What a length field holds, as a stored length: steps, or the length token it names. */
export function fieldLength(value: FieldLength): Length {
  return isNamedLength(value) ? { token: value } : { step: value }
}

/** What a size field holds, as a stored size: steps, `"fill"`, `"hug"`, or the length token it names. */
export function fieldSize(value: FieldLength): Size {
  return value === "fill" || value === "hug" ? { size: value } : fieldLength(value)
}

// The lists come first, so a list of another length, or something that is neither a list nor a length, says what
// padding takes.
const sides = "expected a length, [vertical, horizontal] or [top, right, bottom, left]"
const padding = z.union([z.tuple([length, length], sides), z.tuple([length, length, length, length], sides), length])

/** All sides, `[vertical, horizontal]`, or `[top, right, bottom, left]`. */
export type Padding = z.infer<typeof padding>

const alignment = z.enum(["start", "center", "end", "stretch"])

/** A value that names a token of its kind, or is written out: a radius, a font size, a family. */
const named = z.union(
  [tokenForm, valueForm, keywordForm, exprForm],
  "expected { token }, { value }, { keyword } or { expr }"
)

export type Named = z.infer<typeof named>

/** A line height: a token, steps of the spacing scale (`leading-6`), or written out. */
const lineHeight = z.union([tokenForm, stepForm, valueForm, keywordForm, exprForm], lengthForms)

export type LineHeight = z.infer<typeof lineHeight>

/** A grid track: Fill, taking a share of what's left (`minmax(0, 1fr)`), or a length. */
const track = z.union(
  [stored({ fr: finiteNumber.positive() }), stepForm, tokenForm, valueForm, keywordForm, exprForm],
  `expected { fr } or a length: ${lengthForms}`
)

export type Track = z.infer<typeof track>

const tracks = z.array(track).min(1, "expected at least one track")

/**
 * One shadow in a layer's stack. A token's shadow draws the token's layers, with only their color changed; a shadow of
 * its own has offsets, blur and spread in px; a ring is a width in px, drawn outside the box or inside it. Drop and ring
 * are drawn outside, inner inside.
 */
const shadow = z.union([
  stored({ type: z.enum(["drop", "inner"]), token: z.string().min(1), color: color.optional(), off }),
  stored({
    type: z.enum(["drop", "inner"]),
    x: finiteNumber,
    y: finiteNumber,
    blur: finiteNumber.nonnegative(),
    spread: finiteNumber,
    color,
    off
  }),
  stored({
    type: z.literal("ring"),
    width: finiteNumber.nonnegative(),
    inset: z.boolean().optional(),
    color,
    off
  })
])

export type Shadow = z.infer<typeof shadow>

/** The filter adjustments, in the panel's order. Hue turns in degrees; the rest are percentages. */
export const filterAdjustments = ["brightness", "contrast", "saturate", "hue", "grayscale", "sepia", "invert"] as const

export type FilterAdjustment = (typeof filterAdjustments)[number]

/**
 * One entry of a layer's filters: a blur by a blur token or a length, a set of adjustments (brightness, contrast and
 * saturation as a change from 100%, so +25 is 125%; hue in degrees; grayscale, sepia and invert from 0 to 100), or a
 * drop shadow that follows what's drawn rather than the box (the layer's own filters only).
 */
const filter = z.union([
  stored({ type: z.literal("blur"), value: z.union([tokenForm, valueForm, exprForm]), off }),
  stored({
    type: z.literal("adjust"),
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
  stored({ type: z.literal("dropShadow"), shadow, off })
])

export type Filter = z.infer<typeof filter>

/** How far the layer is drawn moved, without moving anything around it: a length each way, 0 when unset. */
const translate = stored({ x: length.optional(), y: length.optional() })

export type Translate = z.infer<typeof translate>

/** How large the layer is drawn, as a percentage each way, negative when flipped. 100 when unset. */
const scale = stored({ x: finiteNumber.optional(), y: finiteNumber.optional() })

export type Scale = z.infer<typeof scale>

/** One function of `transform`, which applies after `translate`, `rotate` and `scale`, in the list's order. */
const transformFunction = stored({ type: z.enum(["skewX", "skewY"]), value: finiteNumber, off })

export type TransformFunction = z.infer<typeof transformFunction>

/** A declaration no key owns, as CSS reads it. */
const cssDeclaration = stored({ value: z.string().min(1), off })

/**
 * The CSS map: declarations by property, for what no key holds. A property a key owns is that key's alone, so one row
 * of the panel answers for it.
 */
const cssMap = z.record(z.string().regex(/^-{0,2}[a-z][a-z0-9-]*$/i, "expected a CSS property"), cssDeclaration)

export type CssMap = z.infer<typeof cssMap>

export const nodeStyle = stored({
  // Layout (layouts only).
  /** Auto layout (flex, the default) or a grid. */
  display: z.enum(["flex", "grid"]).optional(),
  flexDirection: z.enum(["row", "column"]).optional(),
  /** A grid's columns, and its rows: each track Fill (`{ fr: 1 }`) or a length. */
  gridTemplateColumns: tracks.optional(),
  gridTemplateRows: tracks.optional(),
  gap: length.optional(),
  /** In a grid or wrapping layout, the gap between rows when it differs from `gap`. */
  rowGap: length.optional(),
  /** All sides, `[vertical, horizontal]`, or `[top, right, bottom, left]`. */
  padding: padding.optional(),
  /** Space outside the node, in the same forms as padding. */
  margin: padding.optional(),
  /** Children on the cross axis. */
  alignItems: alignment.optional(),
  /** Children on the main axis. In a grid, `start`, `center` and `end` place each child in its cell. */
  justifyContent: z.enum(["start", "center", "end", "space-between", "space-around", "space-evenly"]).optional(),
  /** `nowrap` is what a layout does unset: a patch sets it to take a wrap off. */
  flexWrap: z.enum(["wrap", "nowrap"]).optional(),

  // Size, within the parent's layout.
  width: size.optional(),
  height: size.optional(),
  minWidth: length.optional(),
  maxWidth: length.optional(),
  minHeight: length.optional(),
  maxHeight: length.optional(),
  /** Grid cells the node spans, in a grid. */
  colSpan: finiteNumber.optional(),
  rowSpan: finiteNumber.optional(),
  /** Fill along the parent's direction. Same as `{ size: "fill" }` for the parent's main axis. */
  grow: z.boolean().optional(),
  /** Where this node sits on its parent's cross axis, overriding the parent's `alignItems`. */
  alignSelf: alignment.optional(),

  // Position: taken out of the layout and placed against the parent's edges.
  position: z.enum(["absolute"]).optional(),
  top: length.optional(),
  right: length.optional(),
  bottom: length.optional(),
  left: length.optional(),
  /**
   * Layer order among its siblings' stacking context: a whole number, higher in front, or a z-index token. Unset is
   * auto, the order of the layers.
   */
  zIndex: z.union([stored({ step: finiteNumber.int() }), tokenForm], "expected { step } or { token }").optional(),

  // Appearance.
  /** The stack of paints, top first: colors, gradients and images. It writes `background-color` and `background-image`. */
  fills: z.array(paint).optional(),
  /** The color of text. Set on a layout, it applies to the text inside. */
  color: color.optional(),
  borderColor: color.optional(),
  /** Border width in pixels, as in Tailwind: 0, 1, 2, 4 or 8. */
  borderWidth: finiteNumber.optional(),
  borderStyle: z.enum(["solid", "dashed", "dotted"]).optional(),
  borderRadius: named.optional(),
  /** The stack of shadows, top first. */
  boxShadow: z.array(shadow).optional(),
  /** Percent, 0 to 100. */
  opacity: finiteNumber.optional(),
  /** `auto` scrolls what doesn't fit. */
  overflow: z.enum(["visible", "hidden", "auto"]).optional(),

  // Effects.
  /** The layer's own filters, in the order they apply. */
  filter: z.array(filter).optional(),
  /** Filters on what's behind the layer, seen through it. */
  backdropFilter: z.array(filter).optional(),
  // CSS applies translate, rotate and scale in that order whatever the order they're set, and `transform` after them.
  translate: translate.optional(),
  /** Degrees, clockwise. */
  rotate: finiteNumber.optional(),
  scale: scale.optional(),
  /** Skew, in the order it applies. */
  transform: z.array(transformFunction).optional(),
  /** The point the layer turns and scales about, in percent from its top left. Its center when unset. */
  transformOrigin: stored({ x: finiteNumber, y: finiteNumber }).optional(),

  // Type. Set on a layout, it applies to the text inside.
  fontFamily: named.optional(),
  fontSize: named.optional(),
  fontWeight: finiteNumber.optional(),
  lineHeight: lineHeight.optional(),
  letterSpacing: named.optional(),
  textAlign: z.enum(["start", "center", "end", "justify"]).optional(),
  textTransform: z.enum(["uppercase", "lowercase", "capitalize"]).optional(),
  textDecorationLine: z.enum(["underline", "line-through"]).optional(),
  /** `normal` is what text is unset: a patch sets it to take italic off. */
  fontStyle: z.enum(["italic", "normal"]).optional(),
  /** Lines of text before it's cut off with an ellipsis. */
  lineClamp: finiteNumber.optional(),
  /**
   * Where a word too long for its line may break: `anywhere`, which also lets a table cell or hugging layout narrow to
   * fit it, or `break-word`, only once it can't fit on a line of its own. Unset, a long word spills out.
   */
  overflowWrap: z.enum(["anywhere", "break-word"]).optional(),

  // Motion.
  /** How the layer moves from one look to the next, as a state change shows it. */
  transition: z.array(transition).optional(),

  // Everything else.
  /** Declarations for the properties no key above owns, drawn after them. */
  css: cssMap
    .check((context) => {
      for (const property of Object.keys(context.value)) {
        const key = ownerOf(property)

        if (key !== undefined) {
          context.issues.push({
            code: "custom",
            input: context.value,
            path: [property],
            message: `${property} is set by the ${key} key`
          })
        }
      }
    })
    .optional()
})

/**
 * Visual properties, as the project's code would write them: each key is named after its CSS property, a length is
 * steps of the spacing scale (multiples of `--spacing`), a token or a written value, and colors, radii and type values
 * name one of the project's CSS custom properties (without `--`) or are written out. Layout is Figma's auto layout, a
 * flex box, or a grid; children size themselves to fill, hug, or a length.
 */
export type NodeStyle = z.infer<typeof nodeStyle>

export const styleKey = nodeStyle.keyof()

export type StyleKey = z.infer<typeof styleKey>

/** Every style key, in the order panels show them. */
export const styleKeys = styleKey.options
