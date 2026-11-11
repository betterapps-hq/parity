import type { Meta, StoryObj } from "@storybook/react-vite"
import { useState } from "react"
import { userEvent, within } from "storybook/test"
import { useTokens } from "./field-parts.tsx"
import { Field } from "./field-row.tsx"
import { OpacityRow } from "./opacity-blend.tsx"
import { Card, Playground, PreviewStage } from "./playground.tsx"
import type { BlendMode } from "./text-data.ts"
import { filledLayer } from "./text-preview.tsx"
import { type Opacity, opacityWrites } from "./text-writes.ts"

/**
 * Opacity and blend mode (PAR-186, design-options-values.md's Percentage and opacity), Appearance's row on its own: a
 * percentage with opacity tokens, then the blend menu. Opacity on its steps, a quarter of a percent, is written bare
 * (`opacity-47.5`); finer, it's a value of its own in brackets, with no mark. Up and Down step 1%, Shift 10%, Alt a
 * quarter, and the icon scrubs. Hovering or moving through the blend menu previews each mode on the layer. A color's
 * own alpha isn't here: it's the % beside its swatch.
 */
const meta = {
  title: "Parity/Inspector/Controls/Controls/Opacity and blend mode",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

/** The layer over the stage's shapes, at its opacity and blend, a token's included, one made here too. */
function Layer({ opacity, blend }: { opacity: Opacity | undefined; blend: BlendMode | undefined }) {
  const { tokens } = useTokens("opacity")
  let percent = 100

  if (opacity !== undefined && "token" in opacity) {
    percent = tokens.find((each) => each.name === opacity.token)?.percent ?? 100
  } else if (opacity !== undefined) {
    percent = opacity.percent
  }

  return (
    <PreviewStage>
      <Card style={{ ...filledLayer, opacity: percent / 100, mixBlendMode: blend }} />
    </PreviewStage>
  )
}

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

  return (
    <Playground writes={opacityWrites(opacity, blend)} preview={<Layer opacity={opacity} blend={preview ?? blend} />}>
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

/** 47.3%, finer than the steps: `opacity-[.473]`, with no mark: Tokens offers disabled, the nearest, first. */
export const ValueOfItsOwn: Story = { render: () => <Appearance opacity={{ percent: 47.3 }} /> }

/** An opacity token, `disabled`, as a chip with 50% in its hint. Up steps to `muted`; the chevron lists them. */
export const Token: Story = { render: () => <Appearance opacity={{ token: "disabled" }} /> }

/** Layers with different opacities and blends: Mixed in both. */
export const Mixed: Story = { render: () => <Appearance mixed /> }

/** Multiply: `mix-blend-multiply`. Open the menu and move through it to preview each mode on the layer. */
export const BlendMultiply: Story = { render: () => <Appearance opacity={{ percent: 90 }} blend="multiply" /> }

/** Plus lighter, which Firefox doesn't draw: † after the value and beside the option. */
export const NotBaseline: Story = { render: () => <Appearance blend="plus-lighter" /> }

/** `150` typed: it stops at 100%. */
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
