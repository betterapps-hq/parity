import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, within } from "storybook/test"
import { MediaPanel } from "./KindPanels.tsx"
import { media, mediaFields, renderSection, sectionStage } from "./layer-stories.tsx"

/**
 * An image's or a video's Design panel (PAR-1059, PAR-1060): its file first, then Size, Position, Appearance, Border and Outline.
 * It has no Layout, Typography or Fill. Each section's own cases are in Sections.
 */
const meta = {
  title: "Parity/Inspector/Layers/Image and video",
  component: MediaPanel,
  render: renderSection(MediaPanel),
  decorators: [sectionStage]
} satisfies Meta<typeof MediaPanel>

export default meta

type Story = StoryObj<typeof meta>

/** The sections both kinds get: Content first, then Size, Position, Appearance, Border and Outline, with nothing painted over it. */
async function mediaSections(canvasElement: HTMLElement, src: string) {
  await mediaFields(canvasElement)
  const panel = within(canvasElement)
  await expect(panel.getByRole("textbox", { name: "File" })).toHaveValue(src)
  const titles = (await panel.findAllByRole("heading", { level: 3 })).map((title) => title.textContent)
  await expect(titles[0]).toBe("Content")
  await expect(titles).toEqual(expect.arrayContaining(["Size", "Position", "Appearance", "Border", "Outline"]))
  await expect(titles).not.toContain("Layout")
  await expect(titles).not.toContain("Typography")
  await expect(titles).not.toContain("Fill")

  return panel
}

/** A team photo in Pricing's hero: its file, alt text, fit and credit lead. */
export const Image: Story = {
  loaders: [media({ type: "image", src: "/images/team-at-work.jpg" })],
  play: async ({ canvasElement }) => {
    await mediaSections(canvasElement, "/images/team-at-work.jpg")
  }
}

/** A clip in the same place: an image's sections, and whether it shows the browser's controls. */
export const Video: Story = {
  loaders: [media({ type: "video", src: "/videos/team-at-work.mp4", controls: true })],
  play: async ({ canvasElement }) => {
    const panel = await mediaSections(canvasElement, "/videos/team-at-work.mp4")
    await expect(panel.getByRole("switch", { name: "Controls" })).toBeChecked()
  }
}
