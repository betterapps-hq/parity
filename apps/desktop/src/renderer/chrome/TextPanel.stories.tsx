import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, within } from "storybook/test"
import { slowly } from "./inspector-stories.tsx"
import { pick, renderSection, sectionStage } from "./layer-stories.tsx"
import { TextPanel } from "./TextPanel.tsx"

/**
 * A text layer's Design panel (PAR-1058): the text it shows, then Typography with its color, how it sizes, where it sits
 * and how it's drawn. It has no Layout, and Fill, its background, folds until it's set. Each section's own cases are in
 * Sections.
 */
const meta = {
  title: "Parity/Inspector/Layers/Text",
  component: TextPanel,
  render: renderSection(TextPanel),
  decorators: [sectionStage]
} satisfies Meta<typeof TextPanel>

export default meta

type Story = StoryObj<typeof meta>

/** Pricing's headline: Typography leads its styles, set large and centered. */
export const Headline: Story = {
  loaders: [pick("Pricing", "Headline")],
  play: async ({ canvasElement }) => {
    const panel = within(canvasElement)
    const titles = await panel.findAllByRole("heading", { level: 3 }, slowly)
    const names = titles.map((title) => title.textContent)
    await expect(names.indexOf("Typography")).toBeLessThan(names.indexOf("Size"))
    await expect(names).not.toContain("Layout")
  }
}
