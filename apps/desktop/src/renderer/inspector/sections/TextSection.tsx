import type { NodeStyle } from "@parity-app/core"
import { PanelSection } from "../../chrome/PanelSection.tsx"
import { ColorInput } from "../controls/color-picker.tsx"
import { TagField } from "../controls/controls.tsx"
import { Unstored, useTokens } from "../controls/field-parts.tsx"
import { Field } from "../controls/field-row.tsx"
import { FontFamilyField, LetterSpacingField, LineHeightField, WeightField } from "../controls/font-fields.tsx"
import { alignChoices, caseChoices, KeywordToggles } from "../controls/keyword-sets.tsx"
import { PresetPicker } from "../controls/preset-text.tsx"
import type { FontFamily } from "../controls/text-data.ts"
import {
  fontOf,
  leadingOf,
  optionOf,
  optionShown,
  tokenShown,
  trackingOf,
  weightOf,
  weightShown
} from "../style-values.ts"
import { mixedOf, rowState, type SectionProps } from "./section-edits.ts"

const textAligns = ["start", "center", "end", "justify"] as const satisfies readonly NonNullable<
  NodeStyle["textAlign"]
>[]

/** Case as `NodeStyle` holds it; Small caps is `font-variant-caps`, which it doesn't hold yet, so it's disabled. */
const cases = ["uppercase", "lowercase", "capitalize"] as const satisfies readonly NonNullable<
  NodeStyle["textTransform"]
>[]

/** Every weight a hundred apart, which a project's font is taken to have until fonts are read from the project. */
const everyWeight = [100, 200, 300, 400, 500, 600, 700, 800, 900]

/**
 * Text, on the approved type fields (PAR-186) only: the typography preset, color, font, weight with italic, line height,
 * letter spacing, align and case, and the tag for a text layer. Set on a layout, a component or an instance, it's Text
 * inside, which the text in it inherits. `NodeStyle` holds type as the project's tokens, so the fields take tokens only,
 * and a value of its own lands on the nearest token. The preset, the color's opacity, small caps and the tag are
 * disabled until it holds them (PAR-930). Size, Resizing, decoration and Max lines have no approved control yet.
 */
export function TextSection({ editor, edit, can }: SectionProps) {
  const { style } = editor.selection
  const mixed = mixedOf(editor)
  const fonts = useTokens("font").tokens
  const sizes = useTokens("size").tokens
  const weights = useTokens("weight").tokens
  const leadings = useTokens("leading").tokens
  const trackings = useTokens("tracking").tokens
  const sizeToken = sizes.find((token) => token.name === style.size)
  const fontPx = sizeToken?.px ?? 16
  const fontToken = fonts.find((token) => token.name === style.font) ?? fonts[0]

  const family: FontFamily = {
    name: fontToken?.detail ?? "Inherited",
    stack: fontToken?.stack ?? "sans-serif",
    weights: everyWeight,
    axis: [100, 900],
    italic: true
  }

  return (
    <PanelSection title={can.text ? "Text" : "Text inside"}>
      <div className="flex flex-col gap-2.5">
        <Field label="Typography preset">
          <Unstored part="preset">
            <PresetPicker preset={undefined} overrides={0} onPick={() => undefined} onDetach={() => undefined} />
          </Unstored>
        </Field>
        <Field label="Color" {...rowState(editor, "textColor")}>
          <ColorInput
            label="Text color"
            value={style.foreground}
            alpha={undefined}
            alphaPart="alpha"
            tokensOnly
            mixed={mixed("foreground")}
            onChange={(foreground) => edit("textColor", { foreground }, "Change text color")}
          />
        </Field>
        <Field label="Font" {...rowState(editor, "font")}>
          <FontFamilyField
            value={tokenShown(style.font)}
            inherited={{ font: family, from: "its parent" }}
            mixed={mixed("font")}
            tokensOnly
            onChange={(font) => edit("font", { font: fontOf(font) }, "Change font")}
            onPreview={(font) =>
              font === undefined ? editor.endPreview?.() : editor.preview?.("font", { font: fontOf(font) })
            }
          />
        </Field>
        <Field label="Weight" {...rowState(editor, "weight")}>
          <WeightField
            font={family}
            value={weightShown(style.weight)}
            italic={style.italic}
            mixed={mixed("weight")}
            onChange={(weight) => edit("weight", { weight: weightOf(weight, weights) }, "Change weight")}
            onItalic={(italic) => edit("decoration", { italic: italic || undefined }, "Toggle italic")}
            onPreview={(weight) =>
              weight === undefined ? editor.endPreview?.() : editor.preview?.("weight", { weight })
            }
          />
        </Field>
        <div className="grid grid-cols-2 items-start gap-x-2 gap-y-2.5">
          <Field half label="Line height" {...rowState(editor, "lineHeight")}>
            <LineHeightField
              value={tokenShown(style.leading)}
              size={sizeToken}
              fontSize={fontPx}
              mixed={mixed("leading")}
              onChange={(leading) =>
                edit("lineHeight", { leading: leadingOf(leading, leadings, fontPx) }, "Change line height")
              }
            />
          </Field>
          <Field half label="Letter spacing" {...rowState(editor, "letterSpacing")}>
            <LetterSpacingField
              value={tokenShown(style.tracking)}
              fontSize={fontPx}
              mixed={mixed("tracking")}
              onChange={(tracking) =>
                edit("letterSpacing", { tracking: trackingOf(tracking, trackings, fontPx) }, "Change letter spacing")
              }
            />
          </Field>
        </div>
        <Field label="Align" {...rowState(editor, "textAlign")}>
          <KeywordToggles
            label="Align"
            property="text-align"
            choices={alignChoices}
            value={optionShown(style.textAlign)}
            inherited="start"
            mixed={mixed("textAlign")}
            inherits={!can.text}
            onChange={(value) => edit("textAlign", { textAlign: optionOf(value, textAligns) }, "Change text alignment")}
          />
        </Field>
        <Field label="Case" {...rowState(editor, "case")}>
          <KeywordToggles
            label="Case"
            property="text-transform"
            choices={caseChoices}
            value={optionShown(style.textTransform)}
            inherited="none"
            mixed={mixed("textTransform")}
            inherits={!can.text}
            onChange={(value) => edit("case", { textTransform: optionOf(value, cases) }, "Change case")}
          />
        </Field>
        {can.text && (
          <Unstored part="tag">
            <TagField tag={undefined} onChange={() => undefined} />
          </Unstored>
        )}
      </div>
    </PanelSection>
  )
}
