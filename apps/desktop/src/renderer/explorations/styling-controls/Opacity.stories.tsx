import type { Meta, StoryObj } from "@storybook/react-vite"
import { useState } from "react"
import { userEvent, within } from "storybook/test"
import { Field } from "../../chrome/fields.tsx"
import { OpacityRow } from "./opacity-blend.tsx"
import { Playground } from "./playground.tsx"
import { type BlendMode, opacityTokens } from "./text-data.ts"
import { OverShapes } from "./text-preview.tsx"
import { type Opacity, opacityWrites } from "./text-writes.ts"

/**
 * Opacity and blend mode (PAR-186, design-options-values.md's Percentage and opacity), Appearance's row on its own: a
 * percentage with opacity tokens, then the blend menu. Opacity on its steps, a quarter of a percent, is written bare
 * (`opacity-47.5`); finer, it's a value of its own in brackets and marked. Up and Down step 1%, Shift 10%, and the icon
 * scrubs. Hovering or moving through the blend menu previews each mode on the layer. A color's own alpha isn't here: it's
 * the % beside its swatch.
 */
const meta = {
  title: "Parity/Explorations/Design panel controls/Opacity and blend mode",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function Appearance({
  opacity: start,
  blend: blendStart,
  mixed
}: {
  opacity?: Opacity
  blend?: BlendMode
  mixed?: boolean
}) {
  const [opacity, setOpacity] = useState(start)
  const [blend, setBlend] = useState(blendStart)
  const [preview, setPreview] = useState<BlendMode>()
  let percent = 100
  if (opacity !== undefined && "token" in opacity)
    percent = opacityTokens.find((each) => each.name === opacity.token)!.percent
  else if (opacity !== undefined) percent = opacity.percent
  return (
    <Playground
      writes={opacityWrites(opacity, blend)}
      preview={<OverShapes style={{ opacity: percent / 100, mixBlendMode: preview ?? blend }} />}
    >
      <Field label="Opacity" mixed={mixed && opacity === undefined}>
        <OpacityRow
          opacity={opacity}
          blend={blend}
          mixed={mixed}
          onOpacity={setOpacity}
          onBlend={setBlend}
          onPreviewBlend={setPreview}
        />
      </Field>
    </Playground>
  )
}

/** Unset: 100, faint, and Normal, which blends as the parent does. Nothing is written. */
export const Unset: Story = { render: () => <Appearance /> }

/** 50%, a step: `opacity-50`. Up makes it 51%; drag the icon to scrub. */
export const Step: Story = { render: () => <Appearance opacity={{ percent: 50 }} /> }

/** 47.5%, on a quarter of a percent, still a step: `opacity-47.5`, unmarked. */
export const OnAQuarterStep: Story = { render: () => <Appearance opacity={{ percent: 47.5 }} /> }

/** 47.3%, finer than the steps: `opacity-[.473]`, marked, with opacity-47.25 as the nearest step. */
export const ValueOfItsOwn: Story = { render: () => <Appearance opacity={{ percent: 47.3 }} /> }

/** An opacity token, `disabled`, as a chip showing 50%. Up steps to `muted`. */
export const Token: Story = { render: () => <Appearance opacity={{ token: "disabled" }} /> }

/** Layers with different opacities and blends: Mixed in both. */
export const Mixed: Story = { render: () => <Appearance mixed /> }

/** Multiply: `mix-blend-multiply`. Open the menu and move through it to preview each mode on the layer. */
export const BlendMultiply: Story = { render: () => <Appearance opacity={{ percent: 90 }} blend="multiply" /> }

/** Plus lighter, which Firefox doesn't draw: † after the value and beside the option. */
export const NotBaseline: Story = { render: () => <Appearance blend="plus-lighter" /> }

/** `150` typed: kept at 100%, and the field says so. */
export const KeptInRange: Story = {
  render: () => <Appearance opacity={{ percent: 80 }} />,
  play: async ({ canvasElement }) => {
    const field = within(canvasElement).getByRole("textbox", { name: "Opacity" })
    await userEvent.clear(field)
    await userEvent.type(field, "150{Enter}")
  }
}

/** `half` typed and Enter pressed: it isn't a percentage, so it stays, outlined, with the reason under it. */
export const InvalidAsTyped: Story = {
  render: () => <Appearance opacity={{ percent: 80 }} />,
  play: async ({ canvasElement }) => {
    const field = within(canvasElement).getByRole("textbox", { name: "Opacity" })
    await userEvent.clear(field)
    await userEvent.type(field, "half{Enter}")
  }
}
