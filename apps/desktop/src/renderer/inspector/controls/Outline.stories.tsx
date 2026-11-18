import type { Meta, StoryObj } from "@storybook/react-vite"
import { useState } from "react"
import { expect, userEvent, within } from "storybook/test"
import {
  type BorderValue,
  BorderSection,
  LinePreview,
  type OutlineValue,
  OutlineSection,
  outlineWrites
} from "./border-outline.tsx"
import { borderComparisons, outlinePoints } from "./comparisons.tsx"
import { Playground } from "./playground.tsx"

/**
 * Outline (PAR-1308), what Stroke was out of layout, named as CSS names it: a title with + until it's set, which adds a
 * 2px outline in the project's border color, and − takes it off. Then its color, width, style and offset. An outline
 * is drawn over the edge and takes no room, so the preview's card keeps its size and the line under it stays put. An
 * offset of 0 draws it against the edge, outside; above 0 leaves a gap, as a focus ring does; below 0 draws it inside.
 */
const meta = {
  title: "Parity/Inspector/Rows/Outline",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

function Outline({ start, border }: { start: OutlineValue; border?: BorderValue }) {
  const [value, set] = useState(start)
  const [borderValue, setBorder] = useState(border)

  return (
    <Playground
      writes={outlineWrites(value)}
      preview={<LinePreview border={borderValue} outline={value} />}
      comparisons={borderComparisons}
      points={outlinePoints}
    >
      {borderValue && <BorderSection value={borderValue} set={setBorder} />}
      <OutlineSection value={value} set={set} />
    </Playground>
  )
}

/** A 2px outline against the edge, outside it. */
export const Outside: Story = { render: () => <Outline start={{ color: "primary", width: 2 }} /> }

/** Outside, with what the control stores and writes as CSS beside it, updated as it's used. */
export const Demo: Story = { ...Outside, parameters: { demo: true } }

/** A focus ring: 2px, 2px out from the edge, so a gap shows between the layer and its outline. */
export const FocusRing: Story = { render: () => <Outline start={{ color: "ring", width: 2, offset: 2 }} /> }

/** Inside the edge: an offset of minus its width draws it over the layer, as Figma's inside stroke does. */
export const Inside: Story = { render: () => <Outline start={{ color: "primary", width: 2, offset: -2 }} /> }

/** A dotted outline, from Style. */
export const Dotted: Story = { render: () => <Outline start={{ color: "primary", width: 2, style: "dotted" }} /> }

/**
 * A border and an outline together, as the panel draws them, Border first: the border grows the card, and the outline
 * goes around it.
 */
export const WithABorder: Story = {
  render: () => (
    <Outline
      start={{ color: "ring", width: 2, offset: 2 }}
      border={{ color: "border", widths: [{ number: 1 }, { number: 1 }, { number: 1 }, { number: 1 }] }}
    />
  )
}

/** No outline yet: Outline is a title with +. */
export const Empty: Story = {
  render: () => <Outline start={{}} />,
  play: async ({ canvasElement }) => {
    const control = within(canvasElement)
    await userEvent.click(await control.findByRole("button", { name: "Add outline" }))
    await expect(control.getByRole("textbox", { name: "Outline offset" })).toBeVisible()
  }
}
