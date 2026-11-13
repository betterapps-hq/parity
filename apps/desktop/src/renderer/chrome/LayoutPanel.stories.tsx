import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, within } from "storybook/test"
import { slowly } from "./inspector-stories.tsx"
import { pick, renderSection, sectionStage } from "./layer-stories.tsx"
import { LayoutPanel } from "./LayoutPanel.tsx"

/**
 * A layout's Design panel (PAR-1057): Layout first, then its size and the box around it, where it sits and how it's
 * drawn. Typography folds until the layout sets it. Each section's own cases are in Sections.
 */
const meta = {
  title: "Parity/Inspector/Layers/Layout",
  component: LayoutPanel,
  render: renderSection(LayoutPanel),
  decorators: [sectionStage]
} satisfies Meta<typeof LayoutPanel>

export default meta

type Story = StoryObj<typeof meta>

/** Pricing's nav, a row inside the page: Layout leads, and Typography waits behind its +. */
export const InALayout: Story = {
  name: "In a layout",
  loaders: [pick("Pricing", "Nav")],
  play: async ({ canvasElement }) => {
    const panel = within(canvasElement)
    const titles = await panel.findAllByRole("heading", { level: 3 }, slowly)
    await expect(titles.map((title) => title.textContent)).toEqual(
      expect.arrayContaining(["Layout", "Size", "Position", "Typography"])
    )
    await expect(titles[0]).toHaveTextContent("Layout")
    await expect(panel.queryByRole("combobox", { name: /font/i })).toBeNull()
    await expect(panel.getByRole("button", { name: "Add typography" })).toBeVisible()
  }
}

/** Pricing's page, its design's root: nothing places it, so it has no Position. */
export const Root: Story = {
  loaders: [pick("Pricing", "Page")],
  play: async ({ canvasElement }) => {
    const panel = within(canvasElement)
    await expect(await panel.findByRole("heading", { name: "Layout" }, slowly)).toBeVisible()
    await expect(panel.queryByRole("heading", { name: "Position" })).toBeNull()
  }
}
