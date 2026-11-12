import { PanelSection } from "../../chrome/PanelSection.tsx"
import { ColorInput } from "../controls/color-picker.tsx"
import { Field } from "../controls/field-row.tsx"
import { mixedOf, rowState, type SectionProps } from "./section-edits.ts"

/**
 * Fill: the one color token `NodeStyle` holds as its background, on the approved color field (PAR-186). PAR-931 makes
 * it the paint stack, with gradients and images.
 */
export function FillSection({ editor, edit }: SectionProps) {
  const { style } = editor.selection

  return (
    <PanelSection title="Fill">
      <Field label="Color" {...rowState(editor, "fill")}>
        <ColorInput
          label="Fill"
          value={style.background}
          alpha={undefined}
          withAlpha={false}
          tokensOnly
          mixed={mixedOf(editor)("background")}
          onChange={(background) => edit("fill", { background }, "Change fill")}
        />
      </Field>
    </PanelSection>
  )
}
