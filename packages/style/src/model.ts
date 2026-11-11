import { z } from "zod"

// The stored style: what a layer's `style`, and a patch's, holds in a `.par` file. The file's other schemas are in
// `@parity-app/core`, which builds its nodes and patches on this one.

/** A number other than NaN or ±Infinity, which zod 4 refuses on its own. */
const finiteNumber = z.number()

/** Zod's own copy of an object, without the keys whose values are `undefined`, as JSON leaves them out. */
function withoutUnset<T extends object>(value: T): T {
  for (const [key, entry] of Object.entries(value)) {
    if (entry === undefined) {
      Reflect.deleteProperty(value, key)
    }
  }

  return value
}

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

// A key the schema doesn't know is an error, and a key set to `undefined` is left out, as core's `fileObject` does for
// every object in a file Parity owns.
export const nodeStyle = z
  .strictObject({
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
    background: z.string().optional(),
    foreground: z.string().optional(),
    /** Border color. */
    border: z.string().optional(),
    /** Border width in pixels, as in Tailwind: 0, 1, 2, 4 or 8. */
    borderWidth: finiteNumber.optional(),
    borderStyle: z.enum(["solid", "dashed", "dotted"]).optional(),
    radius: z.string().optional(),
    shadow: z.string().optional(),
    /** Percent, 0 to 100. */
    opacity: finiteNumber.optional(),
    overflow: z.enum(["visible", "hidden", "scroll"]).optional(),

    // Type. Set on a layout, it applies to the text inside.
    font: z.string().optional(),
    size: z.string().optional(),
    weight: finiteNumber.optional(),
    leading: z.string().optional(),
    tracking: z.string().optional(),
    textAlign: z.enum(["start", "center", "end", "justify"]).optional(),
    transform: z.enum(["uppercase", "lowercase", "capitalize"]).optional(),
    decoration: z.enum(["underline", "line-through"]).optional(),
    italic: z.boolean().optional(),
    /** Lines of text before it's cut off with an ellipsis. */
    lines: finiteNumber.optional()
  })
  .overwrite(withoutUnset)

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
