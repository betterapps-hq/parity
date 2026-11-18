import type { Meta, StoryObj } from "@storybook/react-vite"
import { useState } from "react"
import { expect, userEvent, within } from "storybook/test"
import { Field } from "./field-row.tsx"
import { type LineStyle, LineStyleField } from "./line-style.tsx"

/**
 * Line style (PAR-932, PAR-1308), Border's and Outline's Style: Solid, Dashed, Dotted or Double, as CSS names them,
 * each drawn beside its name. Unset is Solid.
 */
const meta = {
  title: "Parity/Fields/Line style"
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

function LineStyleRow({ start }: { start?: LineStyle }) {
  const [style, setStyle] = useState(start)

  return (
    <div className="w-80">
      <Field label="Style">
        <LineStyleField label="Border style" value={style} onChange={setStyle} />
      </Field>
    </div>
  )
}

/** Unset, which is Solid. */
export const Solid: Story = { render: () => <LineStyleRow /> }

/** Dashed, picked from the menu, which draws each style beside its name. */
export const Dashed: Story = {
  render: () => <LineStyleRow start="solid" />,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body)
    await userEvent.click(page.getByRole("combobox", { name: "Border style" }))
    await userEvent.click(await page.findByRole("option", { name: "Dashed" }))
    await expect(page.getByRole("combobox", { name: "Border style" })).toHaveTextContent("Dashed")
  }
}
