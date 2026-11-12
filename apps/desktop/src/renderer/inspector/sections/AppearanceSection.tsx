import { AppearanceSection as ApprovedAppearance } from "../controls/controls.tsx"
import { useTokens } from "../controls/field-parts.tsx"
import { radiusOf } from "../style-values.ts"
import { mixedOf, rowState, type SectionProps } from "./section-edits.ts"

/**
 * Appearance, the approved section (PAR-186) as Storybook has it: Radius, with Corner shape and Each corner in its name
 * row. It edits the layers' `NodeStyle`, which holds one radius token, so a radius typed lands on the nearest token.
 * Corner shape and each corner are disabled until `NodeStyle` holds them (PAR-929).
 */
export function AppearanceSection({ editor, edit }: SectionProps) {
  const { style } = editor.selection
  const mixed = mixedOf(editor)
  const radii = useTokens("radius").tokens
  const radius = rowState(editor, "radius")

  return (
    <ApprovedAppearance
      draft={{ radius: style.radius }}
      set={(change) => {
        if ("radius" in change && !Array.isArray(change.radius)) {
          edit("radius", { radius: radiusOf(change.radius, radii) }, "Change radius")
        }
      }}
      tokensOnly
      mixed={mixed("radius")}
      changed={radius.changed ? { onReset: radius.onReset } : undefined}
    />
  )
}
