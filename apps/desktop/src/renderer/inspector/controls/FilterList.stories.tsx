import type { Meta, StoryObj } from "@storybook/react-vite"
import { useState } from "react"
import { userEvent, within } from "storybook/test"
import { AdjustmentsEditor, FilterList, FilterPreview } from "./filter-list.tsx"
import type { Adjustments, FilterEntry } from "./lists-data.ts"
import { filterWrites } from "./lists-writes.ts"
import { Playground } from "./playground.tsx"
import { PreviewStage } from "./preview-card.tsx"
import { standInTokenSets } from "./stand-in-tokens.ts"

/**
 * The filter list (PAR-652's Filter list): `filter` on the layer and `backdrop-filter` behind it. Layer blur, Background
 * blur and a Drop shadow that follows the shape are entries of their own; Adjustments is one entry of sliders,
 * brightness, contrast and saturation centered on no change, then hue, grayscale, sepia and invert, each slider's hint
 * naming its class. They're written in Tailwind's filter order, so the list isn't reordered. A filter read from code in
 * another order is one Custom entry, edited as text, with Put in order where that doesn't change what's drawn.
 */
const meta = {
  title: "Parity/Inspector/Lists/Filter list",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

function Filters({ start, tokensOnly, openId }: { start: FilterEntry[]; tokensOnly?: boolean; openId?: string }) {
  const [entries, setEntries] = useState(start)

  return (
    <Playground
      writes={filterWrites(entries, standInTokenSets)}
      preview={
        <PreviewStage>
          <FilterPreview entries={entries} />
        </PreviewStage>
      }
    >
      <FilterList entries={entries} tokensOnly={tokensOnly} openId={openId} onChange={setEntries} />
    </Playground>
  )
}

const adjust = (id: string, values: Adjustments, behind = false): FilterEntry => ({
  id,
  kind: "adjust",
  behind,
  values
})

/** No effects yet: Effects is a title with +, which offers each entry once. */
export const Empty: Story = { render: () => <Filters start={[]} /> }

/** Layer blur at `blur-sm`: the card and its picture are blurred. */
export const LayerBlur: Story = { render: () => <Filters start={[{ id: "blur", kind: "blur", value: "blur-sm" }]} /> }

/** LayerBlur, with what the control stores and writes as CSS and Tailwind beside it, updated as it's used. */
export const Demo: Story = { ...LayerBlur, parameters: { demo: true } }

/** Background blur of 6px, a value of its own: what shows through the card is blurred. */
export const BackgroundBlur: Story = {
  render: () => <Filters start={[{ id: "blur", kind: "backdropBlur", value: { px: 6 } }]} />
}

/**
 * Locked to tokens (`tokensOnly`), as a company can ask so its apps match its design language. Unlocked, the default, a
 * blur takes any length. Its blur opens on only the tokens, with no Custom tab to type a length of its own in.
 */
export const LockedToTokens: Story = {
  render: () => <Filters start={[{ id: "blur", kind: "backdropBlur", value: { px: 6 } }]} tokensOnly />
}

/**
 * Adjustments, open: +25 brightness and −10 saturation write `brightness-125 saturate-90`. Double-click a slider to put
 * it back to no change, which writes nothing.
 */
export const AdjustmentsEntry: Story = {
  render: () => <Filters start={[adjust("adjust", { brightness: 25, saturate: -10 })]} openId="adjust" />
}

/** Background adjustments: what's behind made brighter and more saturated, with a background blur. */
export const BackgroundAdjustments: Story = {
  render: () => (
    <Filters
      start={[
        { id: "blur", kind: "backdropBlur", value: "blur-md" },
        adjust("behind", { brightness: 10, saturate: 50 }, true)
      ]}
      openId="behind"
    />
  )
}

/** A drop shadow that follows the shape, `drop-shadow-md`, last in the filter. Its editor has no spread. */
export const DropShadow: Story = {
  render: () => (
    <Filters
      start={[
        {
          id: "shadow",
          kind: "dropShadow",
          shadow: {
            id: "drop",
            kind: "drop",
            follow: true,
            token: "drop-shadow-md",
            layer: { x: 0, y: 4, blur: 6, spread: 0, color: "black", alpha: 15 }
          }
        }
      ]}
      openId="shadow"
    />
  )
}

/** Blur, adjustments and a drop shadow together, written in Tailwind's order whatever order they were added in. */
export const InTailwindsOrder: Story = {
  render: () => (
    <Filters
      start={[
        {
          id: "shadow",
          kind: "dropShadow",
          shadow: {
            id: "drop",
            kind: "drop",
            follow: true,
            token: "drop-shadow-lg",
            layer: { x: 0, y: 4, blur: 4, spread: 0, color: "black", alpha: 15 }
          }
        },
        adjust("adjust", { grayscale: 100, contrast: 10 }),
        { id: "blur", kind: "blur", value: "blur-xs" }
      ]}
    />
  )
}

/** The blur's eye is off: kept in the file but neither drawn nor written. */
export const Hidden: Story = {
  render: () => (
    <Filters start={[{ id: "blur", kind: "blur", value: "blur-sm", off: true }, adjust("adjust", { sepia: 60 })]} />
  )
}

/**
 * `contrast(1.2) blur(4px)`, read from code: blur after the adjustments isn't Tailwind's order, so it's one Custom entry.
 * Only blur moves, which draws the same, so Put in order offers to write it as utilities.
 */
export const CustomThatCanBePutInOrder: Story = {
  render: () => <Filters start={[{ id: "custom", kind: "custom", text: "contrast(1.2) blur(4px)" }]} />
}

/** `invert(1) brightness(1.5)`: putting brightness first would change what's drawn, so it stays as text and says why. */
export const CustomThatStays: Story = {
  render: () => <Filters start={[{ id: "custom", kind: "custom", text: "invert(1) brightness(1.5)" }]} />
}

/** Image's Adjustments, on an image layer: the first four sliders only. */
export const OnAnImage: Story = {
  render: function OnAnImage() {
    const [values, setValues] = useState<Adjustments>({ contrast: 15, hue: -20 })
    const entries: FilterEntry[] = [adjust("adjust", values)]

    return (
      <Playground
        writes={filterWrites(entries, standInTokenSets)}
        preview={
          <PreviewStage>
            <FilterPreview entries={entries} />
          </PreviewStage>
        }
      >
        <AdjustmentsEditor values={values} only={["brightness", "contrast", "saturate", "hue"]} onChange={setValues} />
      </Playground>
    )
  }
}

/** `blur(4px` typed into Custom and Enter pressed: CSS can't read it, so it stays, outlined, with the reason under it. */
export const InvalidAsTyped: Story = {
  render: () => <Filters start={[{ id: "custom", kind: "custom", text: "contrast(1.2) blur(4px)" }]} />,
  play: async ({ canvasElement }) => {
    const field = within(canvasElement).getByRole("textbox", { name: "Custom filter" })
    await userEvent.clear(field)
    await userEvent.type(field, "blur(4px{Enter}")
  }
}
