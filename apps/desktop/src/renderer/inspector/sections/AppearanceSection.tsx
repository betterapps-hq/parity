import { PanelSection } from "../../chrome/PanelSection.tsx"
import { RadiusChoice } from "../controls/controls.tsx"
import { useTokens } from "../controls/field-parts.tsx"
import { Field } from "../controls/field-row.tsx"
import { ClipContentField, clipChoices } from "../controls/keyword-sets.tsx"
import { OpacityField } from "../controls/opacity-blend.tsx"
import { opacityOf, opacityShown, optionOf, radiusOf } from "../style-values.ts"
import { mixedOf, rowState, type SectionProps } from "./section-edits.ts"

/**
 * How Clip content clips, as `NodeStyle` holds it: Clip is `overflow: hidden`, and Scroll when needed is its `scroll`,
 * which the canvas draws as `overflow: auto`. Scrolling always isn't held yet.
 */
const clips = clipChoices.filter((choice) => choice.value === "clip" || choice.value === "auto")

const overflowOf = { clip: "hidden", auto: "scroll" } as const

/**
 * Appearance, on the approved fields (PAR-186): Radius, a radius token, Opacity, and Clip content. The style holds one
 * radius token, so each corner, corner shape and a radius of its own wait for PAR-929, as Blend mode and Cursor do;
 * a radius typed lands on the nearest token.
 */
export function AppearanceSection({ editor, edit }: SectionProps) {
  const { style } = editor.selection
  const mixed = mixedOf(editor)
  const radii = useTokens("radius").tokens
  let clip: { option: string } | undefined

  if (style.overflow === "hidden") {
    clip = { option: "clip" }
  } else if (style.overflow === "scroll") {
    clip = { option: "auto" }
  }

  return (
    <PanelSection title="Appearance">
      <div className="flex flex-col gap-2.5">
        <Field label="Radius" {...rowState(editor, "radius")}>
          <RadiusChoice
            label="Radius"
            value={style.radius}
            tokensOnly
            takesPercent={false}
            mixed={mixed("radius")}
            onChange={(radius) => edit("radius", { radius: radiusOf(radius, radii) }, "Change radius")}
          />
        </Field>
        <Field label="Opacity" {...rowState(editor, "opacity")}>
          <OpacityField
            value={opacityShown(style.opacity)}
            mixed={mixed("opacity")}
            onChange={(opacity) => edit("opacity", { opacity: opacityOf(opacity) }, "Change opacity")}
          />
        </Field>
        <Field label="Clip content" {...rowState(editor, "overflow")}>
          <ClipContentField
            value={clip}
            mixed={mixed("overflow")}
            choices={clips}
            onChange={(value) => {
              const option = optionOf(value, ["clip", "auto"] as const)
              edit("overflow", { overflow: option && overflowOf[option] }, "Change clipping")
            }}
          />
        </Field>
      </div>
    </PanelSection>
  )
}
