import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, within } from "storybook/test"
import { slowly } from "./inspector-stories.tsx"
import { LayoutPanel } from "./KindPanels.tsx"
import { pick, renderSection, sectionStage } from "./layer-stories.tsx"

/**
 * A layout's Design panel (PAR-1057): its size and the box around it and where it sits, then Layout, and how it's
 * drawn. Each section's own cases are in Sections.
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
    const names = titles.map((title) => title.textContent ?? "")
    // Its own size and where it sits come before how it lays out its children.
    await expect(names[0]).toBe("Size")
    await expect(names.indexOf("Position")).toBeLessThan(names.indexOf("Layout"))
    // How it is drawn as a whole comes before the text inside it and its fill.
    await expect(names.indexOf("Appearance")).toBeLessThan(names.indexOf("Typography"))
    await expect(names.indexOf("Typography")).toBeLessThan(names.indexOf("Fill"))
    // Typography shows the type the text inside it inherits, open like every other section.
    await expect(panel.queryByRole("button", { name: "Add typography" })).toBeNull()
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
