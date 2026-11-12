import { PanelSection } from "../../chrome/PanelSection.tsx"
import { BoxModel } from "../controls/box-model.tsx"
import { useTokens } from "../controls/field-parts.tsx"
import { type Sides, sideNumber, sideRules } from "../controls/sides-writes.ts"
import { paddingOf, sidesShown } from "../style-values.ts"
import { mixedOf, type SectionProps } from "./section-edits.ts"

/** What padding's and margin's sides take as `NodeStyle` holds them: lengths and tokens, and no percentage or Auto. */
const rules = {
  padding: { ...sideRules.padding, percent: false },
  margin: { ...sideRules.margin, percent: false, auto: false }
}

const everySide = [true, true, true, true]

/**
 * Spacing, the approved box model (PAR-186) as Storybook has it: margin's ring around padding's around the layer's
 * size, each side's value where the side is, opening its field. A design's root has no margin, so its box is padding's alone. An edit of
 * some sides changes only those sides of each selected layer.
 */
export function SpacingSection({ editor, edit, shows }: SectionProps) {
  const { style } = editor.selection
  const { unit } = editor
  const mixed = mixedOf(editor)
  const spacing = useTokens("spacing").tokens
  const margin = shows("margin")
  const padding = sidesShown(style.padding, unit)
  const width = editor.measure("width", (exact) => exact)
  const height = editor.measure("height", (exact) => exact)

  const inside = (sides: readonly number[]) =>
    sides.reduce((sum, index) => sum + (sideNumber(padding[index], spacing) ?? 0), 0)

  const size =
    width === undefined || height === undefined
      ? undefined
      : {
          width: Math.max(0, Math.round(width * unit - inside([1, 3]))),
          height: Math.max(0, Math.round(height * unit - inside([0, 2])))
        }

  const sidesEdit = (name: "padding" | "margin") => (sides: Sides, reached: number[]) =>
    edit(
      name,
      (layer) => {
        const next = paddingOf(layer[name], sides, reached, unit)

        return name === "padding" ? { padding: next } : { margin: next }
      },
      `Change ${name}`
    )

  return (
    <PanelSection title="Spacing">
      <BoxModel
        padding={padding}
        margin={margin ? sidesShown(style.margin, unit) : undefined}
        paddingMixed={mixed("padding") ? everySide : []}
        marginMixed={mixed("margin") ? everySide : []}
        size={size}
        rules={rules}
        onPadding={sidesEdit("padding")}
        onMargin={sidesEdit("margin")}
      />
    </PanelSection>
  )
}
