import { AppearanceSection as ApprovedAppearance } from "../controls/controls.tsx"
import { useTokens } from "../controls/field-parts.tsx"
import { Field } from "../controls/field-row.tsx"
import { ClipContentField } from "../controls/keyword-sets.tsx"
import { OpacityRow } from "../controls/opacity-blend.tsx"
import { opacityOf, opacityShown, optionOf, radiusOf } from "../style-values.ts"
import { mixedOf, rowState, type SectionProps } from "./section-edits.ts"

/**
 * How Clip content clips, as `NodeStyle` holds it: Clip is `overflow: hidden`, and Scroll when needed is its `scroll`,
 * which the canvas draws as `overflow: auto`.
 */
const overflowOf = { clip: "hidden", auto: "scroll" } as const

/**
 * Appearance, the approved section (PAR-186) as Storybook has it: Radius with Corner shape and Each corner in its name
 * row, then Opacity beside Blend mode, and Clip content. It edits the layers' `NodeStyle`, which holds one radius token,
 * so a radius typed lands on the nearest token. Corner shape, each corner, Blend mode and Scroll are disabled until
 * `NodeStyle` holds them (PAR-929).
 */
export function AppearanceSection({ editor, edit }: SectionProps) {
  const { style } = editor.selection
  const mixed = mixedOf(editor)
  const radii = useTokens("radius").tokens
  const radius = rowState(editor, "radius")
  let clip: { option: string } | undefined

  if (style.overflow === "hidden") {
    clip = { option: "clip" }
  } else if (style.overflow === "scroll") {
    clip = { option: "auto" }
  }

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
    >
      <Field label="Opacity" {...rowState(editor, "opacity")}>
        <OpacityRow
          opacity={opacityShown(style.opacity)}
          blend={undefined}
          mixed={mixed("opacity")}
          onOpacity={(opacity) => edit("opacity", { opacity: opacityOf(opacity) }, "Change opacity")}
          onBlend={() => undefined}
          onPreviewBlend={() => undefined}
        />
      </Field>
      <Field label="Clip content" {...rowState(editor, "overflow")}>
        <ClipContentField
          value={clip}
          mixed={mixed("overflow")}
          onChange={(value) => {
            const option = optionOf(value, ["clip", "auto"] as const)
            edit("overflow", { overflow: option && overflowOf[option] }, "Change clipping")
          }}
        />
      </Field>
    </ApprovedAppearance>
  )
}
