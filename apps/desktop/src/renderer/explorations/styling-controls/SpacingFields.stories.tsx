import type { Meta, StoryObj } from "@storybook/react-vite"
import { useState } from "react"
import { PanelSection } from "../../chrome/PanelSection.tsx"
import { type Measured, SpacingPreview, type SpacingHover } from "./box-model.tsx"
import { Playground } from "./playground.tsx"
import { type Sides, sideRules, sidesWrites } from "./sides-writes.ts"
import { FourSidesField } from "./sides.tsx"
import { mergeWrites } from "./writes.ts"

/**
 * Spacing as fields (PAR-186, PAR-652's Spacing): Padding's and Margin's rows, each two fields, vertical and
 * horizontal, or four once Each side is pressed, as Padding's and Margin's own stories show them. It's the other way to
 * Spacing's Box model, kept for where rows suit better than a box. Hovering a field highlights its sides in the
 * preview, padding in modes' green and margin in pink, as the box draws them.
 */
const meta = {
  title: "Parity/Explorations/Design panel controls/Controls/Spacing fields",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

const px = (number: number) => ({ number })
const none: Sides = [undefined, undefined, undefined, undefined]

function Spacing({ padding: startPadding, margin: startMargin = none }: { padding: Sides; margin?: Sides }) {
  const [padding, setPadding] = useState(startPadding)
  const [margin, setMargin] = useState(startMargin)
  const [hover, setHover] = useState<SpacingHover>()
  const [measured, setMeasured] = useState<Measured>()
  const hovered = (box: "padding" | "margin") => (sides: number[] | undefined) => setHover(sides && { box, sides })

  return (
    <Playground
      writes={mergeWrites({ padding: sidesWrites("padding", padding), margin: sidesWrites("margin", margin) })}
      preview={<SpacingPreview padding={padding} margin={margin} hover={hover} onMeasure={setMeasured} />}
    >
      <PanelSection title="Spacing">
        <div className="flex flex-col gap-2">
          <FourSidesField
            label="Padding"
            rules={sideRules.padding}
            sides={padding}
            hint="Space inside the layer, between its edge and its content"
            onChange={(next) => setPadding(next)}
            onHover={hovered("padding")}
          />
          <FourSidesField
            label="Margin"
            rules={sideRules.margin}
            sides={margin}
            measured={measured?.margin.map(Math.round)}
            hint="Space outside the layer, between it and what's around it"
            onChange={(next) => setMargin(next)}
            onHover={hovered("margin")}
          />
        </div>
      </PanelSection>
    </Playground>
  )
}

/** Padding alone: margin's fields are unset, 0 and muted. */
export const PaddingOnly: Story = { render: () => <Spacing padding={[px(16), px(24), px(16), px(24)]} /> }

/** A margin of 8 above and below, under the padding: two fields each. */
export const WithMargin: Story = {
  render: () => <Spacing padding={[px(16), px(24), px(16), px(24)]} margin={[px(8), undefined, px(8), undefined]} />
}

/** Padding of 16 with 24 at the bottom: its Each side opens, four fields in CSS's order, and margin keeps two. */
export const EachSide: Story = {
  render: () => <Spacing padding={[px(16), px(16), px(24), px(16)]} margin={[px(8), undefined, px(8), undefined]} />
}

/** Auto across: margin's horizontal field holds Auto as a chip, with what it comes to in its hint, as it's narrow. */
export const AutoMargin: Story = {
  render: () => <Spacing padding={[px(12), px(12), px(12), px(12)]} margin={[undefined, "auto", undefined, "auto"]} />
}

/** A token across: the project's gutter, a chip with what it comes to after it. */
export const Token: Story = {
  render: () => <Spacing padding={[px(16), { token: "spacing-gutter" }, px(16), { token: "spacing-gutter" }]} />
}
