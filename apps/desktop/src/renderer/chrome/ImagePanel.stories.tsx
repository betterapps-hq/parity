import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect } from "storybook/test"
import { ImagePanel } from "./KindPanels.tsx"
import { media, mediaFields, renderSection, sectionStage } from "./layer-stories.tsx"

/**
 * An image's Design panel (PAR-1059): its file first, then Size, Position, Appearance and Stroke. It has no Layout,
 * Typography or Fill. Each section's own cases are in Sections.
 */
const meta = {
  title: "Parity/Inspector/Layers/Image",
  component: ImagePanel,
  render: renderSection(ImagePanel),
  decorators: [sectionStage]
} satisfies Meta<typeof ImagePanel>

export default meta

type Story = StoryObj<typeof meta>

/** A team photo in Pricing's hero: its file, alt text, fit and credit lead, and nothing paints over the picture. */
export const TeamPhoto: Story = {
  name: "Team photo",
  loaders: [media({ type: "image", src: "/images/team-at-work.jpg" })],
  play: async ({ canvasElement }) => {
    const panel = await mediaFields(canvasElement)
    await expect(panel.getByRole("textbox", { name: "File" })).toHaveValue("/images/team-at-work.jpg")
    const titles = (await panel.findAllByRole("heading", { level: 3 })).map((title) => title.textContent)
    await expect(titles[0]).toBe("Content")
    await expect(titles).toEqual(expect.arrayContaining(["Size", "Position", "Appearance", "Stroke"]))
    await expect(titles).not.toContain("Layout")
    await expect(titles).not.toContain("Typography")
    await expect(titles).not.toContain("Fill")
  }
}
