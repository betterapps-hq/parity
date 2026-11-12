import { shownSize, sizeEdit, styleValues, type StyleValues } from "@parity-app/editor"
import { SizeSection as ApprovedSize } from "../controls/controls.tsx"
import type { Draft, SizeMode } from "../controls/data.ts"
import { useTokens } from "../controls/field-parts.tsx"
import { eachLength, lengthPx, sizeOf, sizeShown } from "../style-values.ts"
import { mixedOf, type SectionProps } from "./section-edits.ts"

const limits = [
  { key: "minWidth", row: "min", label: "min width" },
  { key: "maxWidth", row: "max", label: "max width" },
  { key: "minHeight", row: "min", label: "min height" },
  { key: "maxHeight", row: "max", label: "max height" }
] as const

type LimitKey = (typeof limits)[number]["key"]

/** One limit set, or taken off, as the style holds it: steps of the spacing scale. */
function limitValues(key: LimitKey, steps: number | undefined): StyleValues {
  const values: StyleValues = {}
  values[key] = steps

  return values
}

/**
 * Size, the approved section (PAR-186) as Storybook has it: W and H on one line with the aspect lock between them, and
 * a row for each limit Sizing adds. It reads and writes the layers' `NodeStyle`: lengths as steps of the spacing scale,
 * Hug, Fill where the layer can fill, and spacing and container tokens. The aspect lock is disabled until `NodeStyle`
 * holds a ratio (PAR-926). Align self and a grid child's span have no approved control here: Grid placement and a flex
 * child's alignment bring them back.
 */
export function SizeSection({ editor, edit, shows }: SectionProps) {
  const { style, parent } = editor.selection
  const { unit } = editor
  const mixed = mixedOf(editor)
  const spacing = useTokens("spacing").tokens
  const modes: SizeMode[] = shows("sizeFill") ? ["hug", "fill"] : ["hug"]

  const measured = (axis: "width" | "height") => {
    const steps = editor.measure(axis, (exact) => exact)

    return steps === undefined ? undefined : Math.round(steps * unit)
  }

  const width = measured("width")
  const height = measured("height")

  const draft: Draft = {
    width: sizeShown(shownSize(style, "width", parent), unit),
    height: sizeShown(shownSize(style, "height", parent), unit),
    minWidth: lengthPx(style.minWidth, unit, spacing),
    maxWidth: lengthPx(style.maxWidth, unit, spacing),
    minHeight: lengthPx(style.minHeight, unit, spacing),
    maxHeight: lengthPx(style.maxHeight, unit, spacing)
  }

  const set = (change: Partial<Draft>) => {
    for (const axis of ["width", "height"] as const) {
      const next = change[axis]

      if (axis in change) {
        edit(axis, sizeEdit(axis, next === undefined ? undefined : sizeOf(next, unit), parent), `Change ${axis}`)
      }
    }

    for (const { key, row, label } of limits) {
      if (key in change) {
        const px = change[key]
        const verb = px === undefined ? "Remove" : "Change"
        edit(row, limitValues(key, px === undefined ? undefined : px / unit), `${verb} ${label}`)
      }
    }
  }

  return (
    <ApprovedSize
      draft={draft}
      set={set}
      measured={width === undefined || height === undefined ? undefined : { width, height, parent: width }}
      modes={modes}
      takesPercent={false}
      mixedAxes={{ width: mixed("width") || mixed("grow"), height: mixed("height") }}
      eachAxis={(axis, update) =>
        edit(
          axis,
          (layer, edited) => {
            const next = eachLength(layer[axis], update, unit, spacing)

            return next === undefined ? {} : styleValues(sizeEdit(axis, next, parent), layer, edited)
          },
          `Change ${axis}`
        )
      }
    />
  )
}
