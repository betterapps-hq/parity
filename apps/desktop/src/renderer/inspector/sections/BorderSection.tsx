import type { Color, NodeStyle } from "@parity-app/core"
import { listColor, storedColors } from "../color-values.ts"
import {
  type BorderValue,
  BorderSection as BorderFields,
  type OutlineValue,
  OutlineSection as OutlineFields
} from "../controls/border-outline.tsx"
import { sameValue } from "../controls/css-values.ts"
import { borderSidesShown, borderWidthsOf, lineWidthOf, lineWidthShown } from "../style-values.ts"
import type { SectionProps } from "./section-edits.ts"

/** A stored color as the Color field holds it, with its alpha. */
function colorShown(color: Color | undefined): Pick<BorderValue, "color" | "alpha"> {
  return color === undefined ? {} : listColor(color)
}

/** The Color field's color back as the style holds it, keeping the layer's when it didn't change. */
function colorStored(next: Pick<BorderValue, "color" | "alpha">, was: Color | undefined): Color | undefined {
  if (next.color === undefined) {
    return undefined
  }

  return storedColors(was === undefined ? [] : [was])(
    next.alpha === undefined ? { color: next.color } : { color: next.color, alpha: next.alpha }
  )
}

/** A border's or an outline's fields, each optional, so one label reads either. */
type LineValue = BorderValue & OutlineValue

/** The fields a border or outline has, each as its undo label names it. */
const fieldNames = {
  color: "color",
  alpha: "color",
  widths: "width",
  width: "width",
  style: "style",
  offset: "offset"
} as const satisfies Record<keyof LineValue, string>

/** What an edit to a border or outline did, for its undo label: added it, took it off, or changed one field. */
function changeLabel(what: "border" | "outline", was: LineValue, next: LineValue): string {
  const isSet = (value: LineValue) => Object.keys(value).length > 0

  if (!isSet(was)) {
    return `Add ${what}`
  }

  if (!isSet(next)) {
    return `Remove ${what}`
  }

  // SAFETY: `fieldNames` is a record by LineValue's keys, so each of its keys is one.
  const changed = (Object.keys(fieldNames) as (keyof LineValue)[]).find((key) => !sameValue(was[key], next[key]))

  return changed === undefined ? `Change ${what}` : `Change ${what} ${fieldNames[changed]}`
}

/**
 * Border (PAR-932): + adds the project's usual border, `border border-border`, and − takes it off; then its width,
 * one or each side's, its style and its color. A border is part of the box, so its width also shows in Spacing's box
 * model.
 */
export function BorderSection({ editor, edit }: SectionProps) {
  const { style } = editor.selection
  const bordered = style.borderColor !== undefined || style.borderWidth !== undefined

  const value: BorderValue = bordered
    ? {
        ...colorShown(style.borderColor),
        widths: borderSidesShown(style.borderWidth ?? { step: 1 }),
        ...(style.borderStyle && { style: style.borderStyle })
      }
    : {}

  return (
    <BorderFields
      value={value}
      set={(next) =>
        edit(
          "border",
          (layer: NodeStyle) =>
            next.color === undefined && next.widths === undefined
              ? { borderColor: undefined, borderWidth: undefined, borderStyle: undefined }
              : {
                  borderColor: colorStored(next, layer.borderColor),
                  borderWidth: borderWidthsOf(
                    layer.borderWidth,
                    next.widths ?? [undefined, undefined, undefined, undefined],
                    [0, 1, 2, 3]
                  ),
                  borderStyle: next.style
                },
          changeLabel("border", value, next)
        )
      }
    />
  )
}

/**
 * Outline (PAR-1308): + adds a 2px outline in the project's border color, and − takes it off; then its width, style,
 * color and offset. An outline is drawn over the edge, so it never moves the layout.
 */
export function OutlineSection({ editor, edit }: SectionProps) {
  const { style } = editor.selection
  const outlined = style.outlineColor !== undefined || style.outlineWidth !== undefined
  const width = lineWidthShown(style.outlineWidth ?? { step: 1 })
  const offset = style.outlineOffset && "step" in style.outlineOffset ? style.outlineOffset.step : undefined

  const value: OutlineValue = outlined
    ? {
        ...colorShown(style.outlineColor),
        ...(width !== undefined && width !== "auto" && "number" in width && { width: width.number }),
        ...(style.outlineStyle && { style: style.outlineStyle }),
        ...(offset !== undefined && { offset })
      }
    : {}

  return (
    <OutlineFields
      value={value}
      set={(next) =>
        edit(
          "outline",
          (layer: NodeStyle) =>
            next.color === undefined && next.width === undefined
              ? { outlineColor: undefined, outlineWidth: undefined, outlineStyle: undefined, outlineOffset: undefined }
              : {
                  outlineColor: colorStored(next, layer.outlineColor),
                  outlineWidth: next.width === undefined ? layer.outlineWidth : lineWidthOf({ number: next.width }),
                  outlineStyle: next.style,
                  outlineOffset: next.offset ? { step: next.offset } : undefined
                },
          changeLabel("outline", value, next)
        )
      }
    />
  )
}
