import { colorText, fieldColor } from "../color-values.ts"
import { useTokens } from "../controls/field-parts.tsx"
import type { PresetLayer, TypeField, TypeValues } from "../controls/preset-data.ts"
import { PresetTextSection } from "../controls/preset-text.tsx"
import { fontOf, fontSizeOf, leadingOf, tokenShown, trackingOf, weightOf, weightShown } from "../style-values.ts"
import type { SectionProps } from "./section-edits.ts"

/**
 * Typography, the approved section (PAR-186, call 6) as Storybook has it: Preset, then Font, Size, Weight with italic,
 * Line height, Letter spacing and Color. On a layout, a component or an instance, the text inside inherits it. It edits the
 * layers' `NodeStyle`, whose type fields take the project's tokens, so a value of its own lands on the nearest token. The
 * preset isn't saved until `NodeStyle` holds one (PAR-930).
 */
export function TypographySection({ editor, edit }: SectionProps) {
  const { style } = editor.selection
  const sizes = useTokens("size").tokens
  const leadings = useTokens("leading").tokens
  const trackings = useTokens("tracking").tokens
  const fontPx = sizes.find((token) => token.name === tokenShown(style.fontSize)?.token)?.px ?? 16

  const own: TypeValues = {
    font: tokenShown(style.fontFamily),
    size: tokenShown(style.fontSize),
    weight: weightShown(style.fontWeight),
    lineHeight: tokenShown(style.lineHeight),
    letterSpacing: tokenShown(style.letterSpacing)
  }

  const italic = style.fontStyle === "italic"
  const layer: PresetLayer = { own, italic }

  const differs = (next: PresetLayer, field: TypeField) =>
    JSON.stringify(next.own[field]) !== JSON.stringify(own[field])

  // Each row changed on the layer is its own edit of the style.
  const onChange = (next: PresetLayer) => {
    // A preset picked, used or detached isn't held yet, so it mustn't clear the rows it would set.
    if (next.preset !== layer.preset) {
      return
    }

    if (differs(next, "font")) {
      edit("font", { fontFamily: fontOf(next.own.font) }, "Change font")
    }

    if (differs(next, "size")) {
      edit("textSize", { fontSize: fontSizeOf(next.own.size, sizes) }, "Change text size")
    }

    if (differs(next, "weight")) {
      edit("weight", { fontWeight: weightOf(next.own.weight) }, "Change weight")
    }

    if (differs(next, "lineHeight")) {
      edit("lineHeight", { lineHeight: leadingOf(next.own.lineHeight, leadings, fontPx) }, "Change line height")
    }

    if (differs(next, "letterSpacing")) {
      edit(
        "letterSpacing",
        { letterSpacing: trackingOf(next.own.letterSpacing, trackings, fontPx) },
        "Change letter spacing"
      )
    }

    if (Boolean(next.italic) !== italic) {
      edit("decoration", { fontStyle: next.italic ? "italic" : undefined }, "Toggle italic")
    }
  }

  return (
    <PresetTextSection
      layer={layer}
      inheritsFrom="its parent"
      onChange={onChange}
      color={style.color && colorText(style.color)}
      onColor={(text) => edit("textColor", (layer) => ({ color: fieldColor(text, layer.color) }), "Change text color")}
    />
  )
}
