import type { Color, OutlineOffset } from "@parity-app/core"
import { listColor, storedColors } from "../color-values.ts"
import {
  type BorderValue,
  BorderSection as BorderFields,
  type OutlineValue,
  OutlineSection as OutlineFields
} from "../controls/border-outline.tsx"
import { sameValue } from "../controls/css-values.ts"
import type { Sides } from "../controls/sides-writes.ts"
import { borderSidesShown, borderWidthsOf, lineWidthOf, lineWidthShown } from "../style-values.ts"
import { mixedOf, type SectionProps } from "./section-edits.ts"

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
  widthToken: "width",
  alpha: "color",
  widths: "width",
  width: "width",
  style: "style",
  offset: "offset"
} as const satisfies Record<keyof LineValue, string>

const isSet = (value: LineValue) => Object.keys(value).length > 0

/** The one field an edit changed, by the field's key. */
function changedField(was: LineValue, next: LineValue): keyof LineValue | undefined {
  // SAFETY: `fieldNames` is a record by LineValue's keys, so each of its keys is one.
  return (Object.keys(fieldNames) as (keyof LineValue)[]).find((key) => !sameValue(was[key], next[key]))
}

/** What an edit to a border or outline did, for its undo label: added it, took it off, or changed one field. */
function changeLabel(what: "border" | "outline", was: LineValue, next: LineValue): string {
  if (!isSet(was)) {
    return `Add ${what}`
  }

  if (!isSet(next)) {
    return `Remove ${what}`
  }

  const changed = changedField(was, next)

  return changed === undefined ? `Change ${what}` : `Change ${what} ${fieldNames[changed]}`
}

const noSides: Sides = [undefined, undefined, undefined, undefined]

/** The sides whose width an edit changed. */
const sidesChanged = (was: Sides | undefined, next: Sides | undefined) =>
  [0, 1, 2, 3].filter((index) => !sameValue(was?.[index], next?.[index]))

/** A written outline offset as the Offset field shows it: whole pixels, or nothing for one it can't show. */
function offsetShown(offset: OutlineOffset | undefined): number | undefined {
  if (offset === undefined) {
    return undefined
  }

  if ("step" in offset) {
    return offset.step
  }

  const px = "value" in offset && offset.value.endsWith("px") ? Number.parseFloat(offset.value) : Number.NaN

  return Number.isFinite(px) ? px : undefined
}

/**
 * Border (PAR-932): + adds the project's usual border, `border border-border`, and − takes it off; then its width,
 * one or each side's, its style and its color. A border is part of the box, so its width also shows in Spacing's box
 * model. Each field writes only its own property, and Width only the sides it changed, so several layers keep the
 * rest of their own borders.
 */
export function BorderSection({ editor, edit }: SectionProps) {
  const { style } = editor.selection
  const mixed = mixedOf(editor)
  // Widths that differ across the selected layers show as Mixed, so any width typed is an edit, 1px included.
  const mixedWidths = mixed("borderWidth")
  const bordered = style.borderColor !== undefined || style.borderWidth !== undefined || mixedWidths

  const value: BorderValue = bordered
    ? {
        ...colorShown(style.borderColor),
        widths: mixedWidths ? noSides : borderSidesShown(style.borderWidth ?? { step: 1 }),
        ...(style.borderStyle && { style: style.borderStyle })
      }
    : {}

  const set = (next: BorderValue) => {
    const label = changeLabel("border", value, next)

    if (!isSet(next)) {
      edit("border", { borderColor: undefined, borderWidth: undefined, borderStyle: undefined }, label)
    } else if (!isSet(value)) {
      edit(
        "border",
        {
          borderColor: colorStored(next, undefined),
          borderWidth: borderWidthsOf(undefined, next.widths ?? noSides, [0, 1, 2, 3]),
          borderStyle: next.style
        },
        label
      )
    } else {
      const field = changedField(value, next)

      if (field === "color" || field === "alpha") {
        edit("borderColor", (layer) => ({ borderColor: colorStored(next, layer.borderColor) }), label)
      } else if (field === "widths") {
        const reached = sidesChanged(value.widths, next.widths)
        const widths = next.widths ?? noSides
        edit("borderWidth", (layer) => ({ borderWidth: borderWidthsOf(layer.borderWidth, widths, reached) }), label)
      } else if (field === "style") {
        edit("borderStyle", { borderStyle: next.style }, label)
      }
    }
  }

  return <BorderFields value={value} set={set} mixedWidths={mixedWidths} />
}

/**
 * Outline (PAR-1308): + adds a 2px outline in the project's border color, and − takes it off; then its width, style,
 * color and offset. An outline is drawn over the edge, so it never moves the layout. Each field writes only its own
 * property, so an offset or a width the field can't show is kept.
 */
export function OutlineSection({ editor, edit }: SectionProps) {
  const { style } = editor.selection
  const mixedWidth = mixedOf(editor)("outlineWidth")
  const outlined = style.outlineColor !== undefined || style.outlineWidth !== undefined || mixedWidth
  // A width that differs across the selected layers shows as Mixed, so any width typed is an edit.
  const width = mixedWidth ? undefined : lineWidthShown(style.outlineWidth ?? { step: 1 })
  const offset = offsetShown(style.outlineOffset)

  const value: OutlineValue = outlined
    ? {
        ...colorShown(style.outlineColor),
        ...(width !== undefined && width !== "auto" && "number" in width && { width: width.number }),
        ...(width !== undefined && width !== "auto" && "token" in width && { widthToken: width.token }),
        ...(style.outlineStyle && { style: style.outlineStyle }),
        ...(offset !== undefined && { offset })
      }
    : {}

  const set = (next: OutlineValue) => {
    const label = changeLabel("outline", value, next)

    if (!isSet(next)) {
      edit(
        "outline",
        { outlineColor: undefined, outlineWidth: undefined, outlineStyle: undefined, outlineOffset: undefined },
        label
      )
    } else if (!isSet(value)) {
      edit(
        "outline",
        { outlineColor: colorStored(next, undefined), outlineWidth: lineWidthOf({ number: next.width ?? 1 }) },
        label
      )
    } else {
      const field = changedField(value, next)

      if (field === "color" || field === "alpha") {
        edit("outlineColor", (layer) => ({ outlineColor: colorStored(next, layer.outlineColor) }), label)
      } else if (field === "width") {
        const stored = next.width === undefined ? undefined : lineWidthOf({ number: next.width })
        edit("outlineWidth", { outlineWidth: stored }, label)
      } else if (field === "style") {
        edit("outlineStyle", { outlineStyle: next.style }, label)
      } else if (field === "offset") {
        edit("outlineOffset", { outlineOffset: next.offset ? { step: next.offset } : undefined }, label)
      }
    }
  }

  return <OutlineFields value={value} set={set} mixedWidth={mixedWidth} />
}
