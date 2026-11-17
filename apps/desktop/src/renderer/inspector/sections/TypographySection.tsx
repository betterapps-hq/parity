import { isHug } from "@parity-app/core"
import { colorText, fieldColor } from "../color-values.ts"
import { sameValue } from "../controls/css-values.ts"
import { useTokens } from "../controls/field-parts.tsx"
import { Field } from "../controls/field-row.tsx"
import { KeywordMenu, wrapChoices } from "../controls/keyword-sets.tsx"
import { coveredBy, type PresetLayer, type TypeField, typeFields, type TypeValues } from "../controls/preset-data.ts"
import { PresetTextSection } from "../controls/preset-text.tsx"
import {
  fontOf,
  fontSizeOf,
  leadingOf,
  type PresetStyle,
  presetStyle,
  tokenShown,
  trackingOf,
  weightOf,
  weightShown
} from "../style-values.ts"
import type { SectionProps } from "./section-edits.ts"

/** The style key each row a preset sets is held in. */
const presetKeys = {
  font: "fontFamily",
  size: "fontSize",
  weight: "fontWeight",
  lineHeight: "lineHeight",
  letterSpacing: "letterSpacing"
} as const satisfies Record<TypeField, keyof PresetStyle>

/**
 * Typography, the approved section (PAR-186, call 6) as Storybook has it: Preset, then Font, Size, Weight with italic,
 * Line height, Letter spacing, Color and Wrap. On a layout, a component or an instance, the text inside inherits it. It
 * edits the layers' `NodeStyle`, whose type fields take the project's tokens, so a value of its own lands on the nearest
 * token. A preset is one of the project's typography tokens (PAR-930): picking it writes `typePreset` and its parts as
 * the preset gives them, so a row still holding its part follows the preset, and one that differs overrides it.
 */
export function TypographySection({ editor, edit, can }: SectionProps) {
  const { style } = editor.selection
  const sizes = useTokens("size").tokens
  const leadings = useTokens("leading").tokens
  const trackings = useTokens("tracking").tokens
  const presets = useTokens("typeStyle").tokens
  const fontPx = sizes.find((token) => token.name === tokenShown(style.fontSize)?.token)?.px ?? 16
  const preset = presets.find((each) => each.name === style.typePreset?.token)
  const fromPreset = preset && presetStyle(preset.values)

  // A row still holding the preset's part follows it; the rest are the layer's own.
  const follows = (field: TypeField) =>
    fromPreset?.[presetKeys[field]] !== undefined && sameValue(style[presetKeys[field]], fromPreset[presetKeys[field]])

  const shown: TypeValues = {
    font: tokenShown(style.fontFamily),
    size: tokenShown(style.fontSize),
    weight: weightShown(style.fontWeight),
    lineHeight: tokenShown(style.lineHeight),
    letterSpacing: tokenShown(style.letterSpacing)
  }

  const own: TypeValues = Object.fromEntries(
    typeFields.flatMap(({ field }) => (follows(field) ? [] : [[field, shown[field]]]))
  )

  const italic = style.fontStyle === "italic"
  // Unset rows show what the text draws in, read from the canvas.
  const layer: PresetLayer = { preset, own, italic, inherited: editor.type?.() }

  // What a row comes to as the style holds it: the layer's own value, else the preset's part, exactly as it gives it.
  const stored = (next: PresetLayer): PresetStyle => {
    const parts = next.preset ? presetStyle(next.preset.values) : {}

    return {
      fontFamily: next.own.font === undefined ? parts.fontFamily : fontOf(next.own.font),
      fontSize: next.own.size === undefined ? parts.fontSize : fontSizeOf(next.own.size, sizes),
      fontWeight: next.own.weight === undefined ? parts.fontWeight : weightOf(next.own.weight),
      lineHeight:
        next.own.lineHeight === undefined ? parts.lineHeight : leadingOf(next.own.lineHeight, leadings, fontPx),
      letterSpacing:
        next.own.letterSpacing === undefined
          ? parts.letterSpacing
          : trackingOf(next.own.letterSpacing, trackings, fontPx)
    }
  }

  const rowLabels: Record<TypeField, [row: "font" | "textSize" | "weight" | "lineHeight" | "letterSpacing", string]> = {
    font: ["font", "Change font"],
    size: ["textSize", "Change text size"],
    weight: ["weight", "Change weight"],
    lineHeight: ["lineHeight", "Change line height"],
    letterSpacing: ["letterSpacing", "Change letter spacing"]
  }

  const onChange = (next: PresetLayer) => {
    const values = stored(next)
    const changed = typeFields.flatMap(({ field }) => (sameValue(next.own[field], layer.own[field]) ? [] : [field]))
    const changes = Object.fromEntries(changed.map((field) => [presetKeys[field], values[presetKeys[field]]]))

    if (next.preset?.name !== preset?.name && !next.preset && changed.length > 0 && changed.every((f) => next.own[f])) {
      // Detach keeps every value the preset gave, so only the link goes.
      edit("preset", { typePreset: undefined }, "Detach preset")
    } else if (next.preset?.name !== preset?.name) {
      // Picking a preset, or taking it off, changes it and the rows it sets together, as one change.
      // A row that followed the old preset follows it no more; one the layer set stays its own.
      const rows = new Set([...changed, ...coveredBy(next.preset), ...coveredBy(preset).filter(follows)])

      const swapped = Object.fromEntries(
        [...rows].flatMap((field) => {
          const key = presetKeys[field]

          return sameValue(values[key], style[key]) ? [] : [[key, values[key]]]
        })
      )

      const label = next.preset ? "Apply preset" : "Remove preset"
      edit("preset", { typePreset: next.preset && { token: next.preset.name }, ...swapped }, label)
    } else if (next.preset && changed.length > 1) {
      // Picking the preset applied again takes back every override, as one change.
      edit("preset", { typePreset: { token: next.preset.name }, ...changes }, "Apply preset")
    } else {
      for (const field of changed) {
        const [row, label] = rowLabels[field]
        edit(row, { [presetKeys[field]]: values[presetKeys[field]] }, label)
      }
    }

    if (Boolean(next.italic) !== italic) {
      edit("decoration", { fontStyle: next.italic ? "italic" : undefined }, "Toggle italic")
    }
  }

  // Text as wide as its line never wraps, so a hugging text layer has no Wrap.
  const wraps = !(can.text && isHug(style.width))

  return (
    <PresetTextSection
      layer={layer}
      inheritsFrom="its parent"
      onChange={onChange}
      color={style.color && colorText(style.color)}
      onColor={(text) => edit("textColor", (layer) => ({ color: fieldColor(text, layer.color) }), "Change text color")}
      after={
        wraps && (
          <Field label="Wrap">
            <KeywordMenu
              label="Wrap"
              property="text-wrap"
              choices={wrapChoices}
              value={style.textWrap && { option: style.textWrap }}
              placeholder="Wrap"
              inherits
              onChange={(value) =>
                edit(
                  "wrap",
                  { textWrap: wrapChoice(value && "option" in value ? value.option : undefined) },
                  "Change wrap"
                )
              }
            />
          </Field>
        )
      }
    />
  )
}

/** A Wrap option as the style holds it. */
const wrapChoice = (option: string | undefined) =>
  (["wrap", "nowrap", "balance", "pretty"] as const).find((each) => each === option)
