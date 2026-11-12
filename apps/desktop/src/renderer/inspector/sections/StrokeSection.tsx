import { borderWidthPixels, tokenColor } from "@parity-app/core"
import { colorText, fieldColor } from "../color-values.ts"
import { StrokeSection as ApprovedStroke } from "../controls/controls.tsx"
import type { Draft } from "../controls/data.ts"
import type { Sides } from "../controls/sides-writes.ts"
import type { SectionProps } from "./section-edits.ts"

/** One width on every side, as the Width field shows the one width `NodeStyle` holds. */
const everySide = (px: number): Sides => [{ number: px }, { number: px }, { number: px }, { number: px }]

/** The one width the sides come to, in whole pixels, when they're all one width of their own. */
function oneWidth(sides: Sides | undefined): number | undefined {
  const first = sides?.[0]

  if (first === undefined || first === "auto" || !("number" in first)) {
    return undefined
  }

  const px = first.number

  return sides?.every((side) => side !== undefined && side !== "auto" && "number" in side && side.number === px)
    ? Math.max(0, Math.round(px))
    : undefined
}

/**
 * Stroke, the approved section (PAR-186) as Storybook has it: + adds the project's usual stroke, `border-border` at
 * 1px, and − takes it off; then its color, its width, and its position. It edits the layers' `NodeStyle`, which holds a
 * color token and one width in pixels. The color's opacity, a width for each side and the position aren't saved until
 * `NodeStyle` holds them (PAR-932).
 */
export function StrokeSection({ editor, edit }: SectionProps) {
  const { style } = editor.selection

  const width = borderWidthPixels(style.borderWidth)

  const draft: Draft = {
    border: style.borderColor && colorText(style.borderColor),
    borderWidth: width === undefined ? undefined : everySide(width)
  }

  const set = (change: Partial<Draft>) => {
    // + and − set the color and the width together.
    if ("border" in change && "borderWidth" in change) {
      if (change.border === undefined) {
        edit("stroke", { borderColor: undefined, borderWidth: undefined, borderStyle: undefined }, "Remove stroke")
      } else {
        edit(
          "stroke",
          { borderColor: tokenColor(change.border), borderWidth: { step: oneWidth(change.borderWidth) ?? 1 } },
          "Add stroke"
        )
      }

      return
    }

    if ("border" in change) {
      const text = change.border
      edit("strokeColor", (layer) => ({ borderColor: fieldColor(text, layer.borderColor) }), "Change stroke color")
    }

    if ("borderWidth" in change) {
      const next = oneWidth(change.borderWidth)

      if (next !== undefined || change.borderWidth === undefined) {
        edit("strokeWidth", { borderWidth: next === undefined ? undefined : { step: next } }, "Change stroke width")
      }
    }
  }

  return <ApprovedStroke draft={draft} set={set} tokensOnly />
}
