import type { NodeStyle } from "@parity-app/core"
import { PanelSection } from "../../chrome/PanelSection.tsx"
import { ColorInput } from "../controls/color-picker.tsx"
import { Field, SectionButton } from "../controls/field-row.tsx"
import { drawStrokeStyle, KeywordMenu, strokeStyleChoices } from "../controls/keyword-sets.tsx"
import { sideRules } from "../controls/sides-writes.ts"
import { SideField } from "../controls/sides.tsx"
import { optionOf, optionShown } from "../style-values.ts"
import { mixedOf, rowState, type SectionProps } from "./section-edits.ts"

/** The stroke styles `NodeStyle` holds. Double and the rest come with PAR-932, with a style for each side. */
const held = ["solid", "dashed", "dotted"] as const satisfies readonly NonNullable<NodeStyle["borderStyle"]>[]

const styles = strokeStyleChoices.filter((choice) => held.some((each) => each === choice.value))

/** One width on every side, in whole pixels, as `NodeStyle` holds it: no token, percentage or Auto. */
const widthRules = { ...sideRules.border, auto: false, percent: false }

/**
 * Stroke, a title with + until it's set, as the approved panel starts it (PAR-186): + adds the project's usual stroke,
 * `border-border` at 1px, and − takes it off. Color is a color token, Width one width for every side, and Style
 * solid, dashed or dotted. A width for each side and the stroke's position come with PAR-932.
 */
export function StrokeSection({ editor, edit }: SectionProps) {
  const { style } = editor.selection
  const mixed = mixedOf(editor)
  const stroked = style.border !== undefined || style.borderWidth !== undefined

  const action = (
    <SectionButton
      adds={!stroked}
      what="stroke"
      onClick={() =>
        edit(
          "stroke",
          stroked
            ? { border: undefined, borderWidth: undefined, borderStyle: undefined }
            : { border: "border", borderWidth: 1 },
          stroked ? "Remove stroke" : "Add stroke"
        )
      }
    />
  )

  if (!stroked) {
    return (
      <PanelSection title="Stroke" action={action}>
        {null}
      </PanelSection>
    )
  }

  return (
    <PanelSection title="Stroke" action={action}>
      <div className="flex flex-col gap-2.5">
        <Field label="Color" {...rowState(editor, "strokeColor")}>
          <ColorInput
            label="Stroke"
            value={style.border}
            alpha={undefined}
            withAlpha={false}
            tokensOnly
            mixed={mixed("border")}
            onChange={(border) => edit("strokeColor", { border }, "Change stroke color")}
          />
        </Field>
        <div className="grid grid-cols-2 items-start gap-x-2">
          <Field half label="Width" {...rowState(editor, "strokeWidth")}>
            <SideField
              label="Stroke width"
              rules={widthRules}
              // A stroke with no width set is drawn 1px wide.
              value={{ number: style.borderWidth ?? 1 }}
              mixed={mixed("borderWidth")}
              onChange={(width) => {
                const px = width !== undefined && width !== "auto" && "number" in width ? width.number : undefined
                edit(
                  "strokeWidth",
                  { borderWidth: px === undefined ? undefined : Math.round(px) },
                  "Change stroke width"
                )
              }}
            />
          </Field>
          <Field half label="Style" {...rowState(editor, "strokeStyle")}>
            <KeywordMenu
              label="Stroke style"
              property="border-style"
              choices={styles}
              value={optionShown(style.borderStyle)}
              placeholder="Solid"
              mixed={mixed("borderStyle")}
              draw={drawStrokeStyle}
              onChange={(value) => edit("strokeStyle", { borderStyle: optionOf(value, held) }, "Change stroke style")}
              onPreview={(value) =>
                value === undefined
                  ? editor.endPreview?.()
                  : editor.preview?.("strokeStyle", { borderStyle: held.find((each) => each === value) })
              }
            />
          </Field>
        </div>
      </div>
    </PanelSection>
  )
}
