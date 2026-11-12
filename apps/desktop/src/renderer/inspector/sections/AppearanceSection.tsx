import { AppearanceSection as ApprovedAppearance } from "../controls/controls.tsx"
import type { Draft } from "../controls/data.ts"
import { useTokens } from "../controls/field-parts.tsx"
import { opacityOf, opacityShown, optionOf, radiusOf } from "../style-values.ts"
import { mixedOf, rowState, type SectionProps } from "./section-edits.ts"

/**
 * How Clip content clips, as `NodeStyle` holds it: Clip is `overflow: hidden`, and Scroll when needed is its `scroll`,
 * which the canvas draws as `overflow: auto`.
 */
const overflowOf = { clip: "hidden", auto: "scroll" } as const

/**
 * Appearance, the approved section (PAR-186) as Storybook has it: Opacity beside Blend mode, Radius with Corner shape
 * and Each corner in its name row, then Clip content. It edits the layers' `NodeStyle`, which holds an opacity, one
 * radius token and how the layer clips, so a radius typed lands on the nearest token. Blend mode, Corner shape and each
 * corner aren't saved until `NodeStyle` holds them (PAR-929).
 */
export function AppearanceSection({ editor, edit }: SectionProps) {
  const { style } = editor.selection
  const mixed = mixedOf(editor)
  const radii = useTokens("radius").tokens
  const radius = rowState(editor, "radius")
  let clip: Draft["clip"]

  if (style.overflow === "hidden") {
    clip = { option: "clip" }
  } else if (style.overflow === "scroll") {
    clip = { option: "auto" }
  }

  const set = (change: Partial<Draft>) => {
    if ("radius" in change && !Array.isArray(change.radius)) {
      edit("radius", { radius: radiusOf(change.radius, radii) }, "Change radius")
    }

    if ("opacity" in change) {
      edit("opacity", { opacity: opacityOf(change.opacity) }, "Change opacity")
    }

    if ("clip" in change) {
      const option = optionOf(change.clip, ["clip", "auto"] as const)
      edit("overflow", { overflow: option && overflowOf[option] }, "Change clipping")
    }
  }

  return (
    <ApprovedAppearance
      draft={{ radius: style.radius, opacity: opacityShown(style.opacity), clip }}
      set={set}
      tokensOnly
      mixed={mixed("radius")}
      changed={radius.changed ? { onReset: radius.onReset } : undefined}
    />
  )
}
