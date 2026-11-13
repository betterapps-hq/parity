import type { Meta, StoryObj } from "@storybook/react-vite"
import { useState } from "react"
import { userEvent, within } from "storybook/test"
import { PanelSection } from "../../chrome/PanelSection.tsx"
import { LayerOrderField, PositionPreview } from "./pin-box.tsx"
import { Playground } from "./playground.tsx"
import { layerOrderWrites, type Position } from "./position-writes.ts"
import type { Side } from "./sides-writes.ts"
import { mixedWrites } from "./writes.ts"

/**
 * Layer order (PAR-186, PAR-652's Number and count), Position's `z-index`: a whole number, or a z-index token, Auto
 * when unset. Up and Down step by one, Shift by ten, and a token steps through the scale in order; dragging the icon
 * scrubs it. Its hint names the stacking context it orders within. It needs nothing more in a flex or grid layout; In
 * layout in a Block layout, it adds `relative`. A count never needs brackets: `z-37`, `-z-5`.
 */
const meta = {
  title: "Parity/Inspector/Fields/Layer order",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

/** Plans, Absolute over Hero, which has a layer order of 1. */
const overHero: Position = {
  placement: "absolute",
  insets: [{ number: 40 }, undefined, undefined, { number: 100 }]
}

function LayerOrder({ start, mixed, inBlock = false }: { start: Side; mixed?: boolean; inBlock?: boolean }) {
  const [value, setValue] = useState(start)
  const [mixedNow, setMixed] = useState(mixed ?? false)

  return (
    <Playground
      writes={mixedNow && value === undefined ? mixedWrites : layerOrderWrites(value, inBlock)}
      preview={
        <PositionPreview
          position={inBlock ? { placement: "static", insets: [undefined, undefined, undefined, undefined] } : overHero}
          layerOrder={value}
        />
      }
    >
      <PanelSection title="Position">
        <LayerOrderField
          value={value}
          mixed={mixedNow}
          context={inBlock ? "Main, the page's root" : "Pricing, a stacking context because it isolates"}
          onChange={(next) => {
            setMixed(false)
            setValue(next)
          }}
        />
      </PanelSection>
    </Playground>
  )
}

/** Unset: Auto, muted, and nothing written; Plans is drawn in its order in Layers, behind Hero. */
export const Unset: Story = { render: () => <LayerOrder start={undefined} /> }

/** 10: in front of Hero, `z-10`. Up makes it 11, Shift+Up 20. */
export const InFront: Story = { render: () => <LayerOrder start={{ number: 10 }} /> }

/** InFront, with what the control stores and writes as CSS and Tailwind beside it, updated as it's used. */
export const Demo: Story = { ...InFront, parameters: { demo: true } }

/** −5: behind Hero, `-z-5`. */
export const Behind: Story = { render: () => <LayerOrder start={{ number: -5 }} /> }

/** The project's overlay token: a chip, `z-(--z-overlay)`. Up steps to z-modal. */
export const Token: Story = { render: () => <LayerOrder start={{ token: "z-overlay" }} /> }

/** In layout in a Block layout: `z-index` needs a position there, so it also writes `relative`. */
export const InABlockLayout: Story = { render: () => <LayerOrder start={{ number: 10 }} inBlock /> }

/** The selected layers' orders differ: Mixed, until a number is typed for them all. */
export const Mixed: Story = { render: () => <LayerOrder start={undefined} mixed /> }

/** `1.5` typed and Enter pressed: Layer order takes a whole number, so it's refused, with the reason under it. */
export const InvalidAsTyped: Story = {
  render: () => <LayerOrder start={{ number: 10 }} />,
  play: async ({ canvasElement }) => {
    const field = within(canvasElement).getByRole("textbox", { name: "Layer order" })
    await userEvent.clear(field)
    await userEvent.type(field, "1.5{Enter}")
  }
}
