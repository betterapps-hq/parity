import type { Meta, StoryObj } from "@storybook/react-vite"
import { useState } from "react"
import { Field } from "../../chrome/fields.tsx"
import { FontFamilyField, resolveFont, WeightField } from "./font-fields.tsx"
import { Playground } from "./playground.tsx"
import { findFont, projectFonts } from "./text-data.ts"
import { TextSample } from "./text-preview.tsx"
import { type FontValue, fontWrites, type WeightValue, weightWrites } from "./text-writes.ts"
import { weightTokens } from "./tokens.ts"
import type { Writes } from "./writes.ts"

/**
 * Weight and style (PAR-186, design-options-values.md's Weight): the weight's name (Semibold), with its number and
 * class in the hint, and Italic beside it. Its menu lists the font's own weights first, each set in that weight, and
 * moving through it previews each on the text; a variable font adds a number field and a slider over its weight axis.
 * Up and Down on the field step through the font's weights. A weight the font has no face for is drawn with the
 * nearest face, or faked by the browser, and the field says so. Font is above it, so changing the font changes what
 * Weight offers.
 */
const meta = {
  title: "Parity/Explorations/Design panel controls/Weight and style",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const geist = projectFonts[0]!

/** Font and Weight's writes side by side, each property under its own key (call 4). */
function together(font: Writes, weight: Writes): Writes {
  const stored = { ...(font.stored === undefined ? {} : { fontFamily: font.stored }), ...(weight.stored as object) }
  return {
    stored: Object.keys(stored).length > 0 ? stored : undefined,
    css: [...font.css, ...weight.css],
    tailwind: [...font.tailwind, ...weight.tailwind]
  }
}

function Weight({
  font: fontStart,
  start,
  italic: italicStart,
  mixed
}: {
  font?: FontValue
  start?: WeightValue
  italic?: boolean
  mixed?: boolean
}) {
  const [font, setFont] = useState<FontValue | undefined>(fontStart)
  const [weight, setWeight] = useState(start)
  const [italic, setItalic] = useState(italicStart)
  const [preview, setPreview] = useState<number>()
  const [fontPreview, setFontPreview] = useState<FontValue>()
  const resolved = resolveFont(fontPreview ?? font)
  const family = (resolved && findFont(resolved.name)) ?? geist
  const token =
    weight !== undefined && "token" in weight ? weightTokens.find((each) => each.name === weight.token) : undefined
  let shown = 400
  if (weight !== undefined) shown = token?.weight ?? ("value" in weight ? weight.value : 400)
  return (
    <Playground
      writes={together(fontWrites(font), weightWrites(weight, italic))}
      preview={
        <TextSample
          style={{
            fontFamily: family.stack,
            fontWeight: preview ?? shown,
            fontStyle: italic ? "italic" : undefined
          }}
        />
      }
    >
      <Field label="Font">
        <FontFamilyField
          value={font}
          inherited={{ font: geist, from: "Plans" }}
          onChange={setFont}
          onPreview={setFontPreview}
        />
      </Field>
      <Field label="Weight" mixed={mixed && weight === undefined}>
        <WeightField
          font={family}
          value={weight}
          italic={italic}
          mixed={mixed}
          onChange={setWeight}
          onItalic={setItalic}
          onPreview={setPreview}
        />
      </Field>
    </Playground>
  )
}

/** Semibold in Geist, `font-semibold`. Up and Down step to Medium and Bold. */
export const Named: Story = { render: () => <Weight font={{ token: "sans" }} start={{ token: "semibold" }} /> }

/** Unset: Regular, muted, inherited. Nothing is written. */
export const Unset: Story = { render: () => <Weight font={{ token: "sans" }} /> }

/** 550 in Geist, a variable font: the menu has a slider over its axis, and 550, between tokens, is marked. */
export const VariableFont: Story = { render: () => <Weight font={{ token: "sans" }} start={{ value: 550 }} /> }

/** Semibold in Georgia, which has Regular and Bold: drawn with Bold, the nearest face, as the hint says. */
export const NearestFace: Story = { render: () => <Weight font={{ token: "serif" }} start={{ token: "semibold" }} /> }

/** Bold in Impact, which has one weight: faked by the browser, marked, and said under the row. */
export const FakedByTheBrowser: Story = {
  render: () => <Weight font={{ stack: "Impact, sans-serif" }} start={{ token: "bold" }} />
}

/** Italic in Georgia, which has an italic face: `italic`. */
export const Italic: Story = { render: () => <Weight font={{ token: "serif" }} italic /> }

/** Italic in Impact, which has none: the toggle is marked, and the hint says it's faked. */
export const FakedItalic: Story = { render: () => <Weight font={{ stack: "Impact, sans-serif" }} italic /> }

/** Layers with different weights: Mixed, until one is chosen for them all. */
export const Mixed: Story = { render: () => <Weight font={{ token: "sans" }} mixed /> }
