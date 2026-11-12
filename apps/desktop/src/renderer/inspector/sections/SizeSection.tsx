import type { NodeStyle } from "@parity-app/core"
import { shownSize, sizeEdit, type StyleValues } from "@parity-app/editor"
import { PanelSection } from "../../chrome/PanelSection.tsx"
import { Num, SizeField } from "../controls/controls.tsx"
import type { SizeMode } from "../controls/data.ts"
import { useTokens } from "../controls/field-parts.tsx"
import { Field, Segments } from "../controls/field-row.tsx"
import { RemoveButton } from "../controls/list-parts.tsx"
import { lengthPx, sizeOf, sizeShown } from "../style-values.ts"
import { mixedOf, rowState, type SectionProps } from "./section-edits.ts"

const limits = [
  { key: "minWidth", row: "min", label: "Min width" },
  { key: "maxWidth", row: "max", label: "Max width" },
  { key: "minHeight", row: "min", label: "Min height" },
  { key: "maxHeight", row: "max", label: "Max height" }
] as const

type LimitKey = (typeof limits)[number]["key"]

/** One limit set, or taken off, as the style holds it: steps of the spacing scale. */
function limitValues(key: LimitKey, steps: number | undefined): StyleValues {
  const values: StyleValues = {}
  values[key] = steps

  return values
}

const selfOptions = [
  { value: "start", label: "Start" },
  { value: "center", label: "Center" },
  { value: "end", label: "End" },
  { value: "stretch", label: "Stretch" }
] as const satisfies readonly { value: NonNullable<NodeStyle["self"]>; label: string }[]

/**
 * Size, on the approved size fields (PAR-186): W and H side by side, each a length, a word (Hug, or Fill where the
 * layer can fill: a parent to fill, or children to fill it with), or a spacing or container token. An unset size is
 * Auto, set by the layout, with what it comes to. Sizing's Add min and Add max add a limit's row under them, with −
 * to take it off. Align self follows in a flex layout, and a grid child's span until Grid placement has its own section.
 * A percentage, content's sizes and an aspect ratio aren't held by `NodeStyle` yet, so they aren't offered (PAR-926).
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

  const size = (axis: "width" | "height") => {
    const shown = sizeShown(shownSize(style, axis, parent), unit)
    const now = measured(axis)
    const label = axis === "width" ? "Width" : "Height"
    const min = axis === "width" ? "minWidth" : "minHeight"
    const max = axis === "width" ? "maxWidth" : "maxHeight"

    return (
      <Field half label={label} {...rowState(editor, axis)}>
        <SizeField
          axis={label}
          // Unset is Auto: the layout sizes it, to what it comes to on the canvas.
          value={shown ?? now ?? "hug"}
          setBy={shown === undefined ? "its layout" : undefined}
          measured={now}
          parent={undefined}
          modes={modes}
          takesPercent={false}
          mixed={mixed(axis) || (axis === "width" ? mixed("grow") : false)}
          limits={{ min: style[min] !== undefined, max: style[max] !== undefined }}
          onAddLimit={(which) => {
            const key = which === "min" ? min : max
            edit(which, limitValues(key, (now ?? 0) / unit), `Add ${which === "min" ? "minimum" : "maximum"} ${axis}`)
          }}
          onChange={(next) => edit(axis, sizeEdit(axis, sizeOf(next, unit), parent), `Change ${axis}`)}
        />
      </Field>
    )
  }

  return (
    <PanelSection title="Size">
      <div className="flex flex-col gap-2.5">
        <div className="grid grid-cols-2 items-start gap-x-2">
          {size("width")}
          {size("height")}
        </div>
        {limits.map(
          ({ key, row, label }) =>
            style[key] !== undefined && (
              <Field key={key} label={label} {...rowState(editor, row)}>
                <div className="flex items-center gap-1">
                  <div className="min-w-0 flex-1">
                    <Num
                      label={label}
                      pixels
                      spacing
                      mixed={mixed(key)}
                      value={lengthPx(style[key], unit, spacing)}
                      min={0}
                      onChange={(next) =>
                        edit(row, limitValues(key, (next ?? 0) / unit), `Change ${label.toLowerCase()}`)
                      }
                    />
                  </div>
                  <RemoveButton
                    label={`Remove ${label.toLowerCase()}`}
                    onClick={() => edit(row, limitValues(key, undefined), `Remove ${label.toLowerCase()}`)}
                  />
                </div>
              </Field>
            )
        )}
        {shows("alignSelf") && (
          <Field label="Align self" {...rowState(editor, "self")}>
            <Segments
              label="Align self"
              value={mixed("self") ? undefined : style.self}
              options={selfOptions}
              onChange={(self) =>
                edit("self", { self: self === style.self ? undefined : self }, "Change self alignment")
              }
            />
          </Field>
        )}
        {shows("span") && (
          <Field label="Span" {...rowState(editor, "span")}>
            <div className="grid grid-cols-2 gap-1">
              <Num
                label="Columns spanned"
                inner="C"
                value={style.colSpan}
                placeholder="1"
                mixed={mixed("colSpan")}
                min={1}
                onChange={(colSpan) => edit("span", { colSpan }, "Change span")}
              />
              <Num
                label="Rows spanned"
                inner="R"
                value={style.rowSpan}
                placeholder="1"
                mixed={mixed("rowSpan")}
                min={1}
                onChange={(rowSpan) => edit("span", { rowSpan }, "Change span")}
              />
            </div>
          </Field>
        )}
      </div>
    </PanelSection>
  )
}
