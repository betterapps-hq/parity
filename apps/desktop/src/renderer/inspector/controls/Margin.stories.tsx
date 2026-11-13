import type { Meta, StoryObj } from "@storybook/react-vite"
import { useState } from "react"
import { PanelSection } from "../../chrome/PanelSection.tsx"
import { type Measured, SpacingPreview } from "./box-model.tsx"
import { MessageLine } from "./field-parts.tsx"
import { Playground } from "./playground.tsx"
import { type Sides, sideRules, sidesWrites } from "./sides-writes.ts"
import { FourSidesField } from "./sides.tsx"

/**
 * Margin (PAR-186, PAR-652's Four sides), in Spacing once it's set or added from the section's More. It lays out and
 * types as Padding does, and also takes negatives (`-mt-2`) and Auto, which shows what it comes to, measured. In a
 * Block layout, vertical margins collapse and a first child's top margin passes through the layout's edge; the row
 * says so and offers Contain margins (`flow-root`). Auto top and bottom margins do nothing there, so the row dims.
 */
const meta = {
  title: "Parity/Inspector/Rows/Margin",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

const px = (number: number) => ({ number })

function Margin({
  start,
  mixed = [],
  layout = "flex",
  first = false,
  collapses = false
}: {
  start: Sides
  mixed?: boolean[]
  layout?: "flex" | "block"
  first?: boolean
  /** Plans' top margin passes through Pricing's edge, which the row says, offering Contain margins. */
  collapses?: boolean
}) {
  const [sides, setSides] = useState(start)
  const [mixedNow, setMixed] = useState(mixed)
  const [hover, setHover] = useState<number[]>()
  const [measured, setMeasured] = useState<Measured>()
  const [contained, setContained] = useState(false)
  // Auto top and bottom margins center nothing in a Block layout, where they come to 0.
  const autoDown = layout === "block" && (sides[0] === "auto" || sides[2] === "auto")

  return (
    <Playground
      writes={sidesWrites("margin", sides, mixedNow)}
      preview={
        <SpacingPreview
          margin={sides}
          layout={layout}
          first={first}
          contained={contained}
          hover={hover && { box: "margin", sides: hover }}
          onMeasure={setMeasured}
        />
      }
    >
      <PanelSection title="Spacing">
        <FourSidesField
          label="Margin"
          rules={sideRules.margin}
          sides={sides}
          mixed={mixedNow}
          measured={measured?.margin.map(Math.round)}
          hint="Space outside the layer, between it and what's around it"
          doesNothing={
            autoDown
              ? "Auto top and bottom margins do nothing in a Block layout. They center only in a flex or grid layout."
              : undefined
          }
          onChange={(next, cleared) => {
            setSides(next)
            setMixed((current) => current.map((was, index) => was && !cleared.includes(index)))
          }}
          onHover={setHover}
        />
        {collapses && (
          // Under the fields, past the labels' column.
          <div className="pl-24">
            <MessageLine
              message={
                contained
                  ? { tone: "note", text: "Pricing contains its children's margins now, with flow-root." }
                  : {
                      tone: "note",
                      text: "This top margin passes through Pricing's top edge, which has no padding or stroke.",
                      action: { label: "Contain margins", run: () => setContained(true) }
                    }
              }
            />
          </div>
        )}
      </PanelSection>
    </Playground>
  )
}

/** Auto across, centering Plans: `mx-auto`, a chip in the field, with what each side comes to in its hint. */
export const AutoAcross: Story = { render: () => <Margin start={[undefined, "auto", undefined, "auto"]} /> }

/** AutoAcross, with what the control stores and writes as CSS and Tailwind beside it, updated as it's used. */
export const Demo: Story = { ...AutoAcross, parameters: { demo: true } }

/** −8 at the top, pulling Plans up over the header: the top side alone, `-mt-2`. */
export const Negative: Story = { render: () => <Margin start={[px(-8), undefined, undefined, undefined]} /> }

/**
 * Plans is Pricing's first child in a Block layout, with 24 at the top: the margin passes through Pricing's edge,
 * and the row offers Contain margins.
 */
export const CollapsesInABlockLayout: Story = {
  render: () => <Margin start={[px(24), undefined, undefined, undefined]} layout="block" first collapses />
}

/** Auto top and bottom in a Block layout: they come to 0, so the row dims, with why in its label's hint. */
export const AutoDownDoesNothing: Story = {
  render: () => <Margin start={["auto", undefined, "auto", undefined]} layout="block" />
}
