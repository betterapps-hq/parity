import type { Meta, StoryObj } from "@storybook/react-vite"
import { useState } from "react"
import { expect, userEvent, within } from "storybook/test"
import { UnitMenu } from "./field-parts.tsx"

/**
 * A field's unit as a button that opens its unit menu (`UnitMenu`): the units the field takes, each with what it is,
 * then a keyword where the field takes one. Choosing a unit shows the value in it. Each field's own story shows it in
 * place, as Number field's In Rem; these are what any unit menu does.
 */
const meta = {
  title: "Parity/Fields/Parts/Unit menu",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

type Unit = "×" | "px" | "%"

const units: { unit: Unit; label: string }[] = [
  { unit: "×", label: "× Times the font size" },
  { unit: "px", label: "px Pixels" },
  { unit: "%", label: "% Of the font size" }
]

/** Line height's units, kept here, with Auto after them. */
function LineHeightUnit() {
  const [unit, setUnit] = useState<Unit>("×")

  return (
    <div className="flex w-60 justify-end p-4 text-xs">
      <UnitMenu
        label="Line height"
        unit={unit}
        units={units}
        extra={{ label: "Auto", run: () => undefined }}
        onUnit={setUnit}
      />
    </div>
  )
}

/** At rest: the unit, ×, as a button named for the field and its unit. */
export const AtRest: Story = { render: () => <LineHeightUnit /> }

/** Opened and px chosen: the button shows px. */
export const Choosing: Story = {
  render: () => <LineHeightUnit />,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Line height unit: ×" }))
    // The menu opens in a portal, outside the story's canvas.
    await userEvent.click(await within(document.body).findByRole("menuitemradio", { name: /^px/ }))
    await expect(within(canvasElement).getByRole("button", { name: "Line height unit: px" })).toBeInTheDocument()
  }
}
