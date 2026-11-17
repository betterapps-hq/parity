import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, within } from "storybook/test"
import { slowly } from "./inspector-stories.tsx"
import { IconPanel } from "./KindPanels.tsx"
import { pick, renderSection, sectionStage } from "./layer-stories.tsx"

/**
 * An icon's Design panel (PAR-1061): which icon it is and its set's props, then Size, Position and Appearance. Its
 * color and stroke are its own, so it has no Typography, Fill or Stroke. Each section's own cases are in Sections.
 */
const meta = {
  title: "Parity/Inspector/Layers/Icon",
  component: IconPanel,
  render: renderSection(IconPanel),
  decorators: [sectionStage]
} satisfies Meta<typeof IconPanel>

export default meta

type Story = StoryObj<typeof meta>

/**
 * Plan card's check mark, from Lucide: the icon and the props Lucide's icons share, read from one of them, lead, and
 * nothing paints it but the icon itself.
 */
export const Check: Story = {
  loaders: [pick("Plan card", "lucide/Check")],
  play: async ({ canvasElement }) => {
    const panel = within(canvasElement)
    const titles = (await panel.findAllByRole("heading", { level: 3 }, slowly)).map((title) => title.textContent)
    await expect(titles[0]).toBe("Component instance")
    await expect(await panel.findByRole("switch", { name: "AbsoluteStrokeWidth" }, slowly)).toBeVisible()
    await expect(titles).toEqual(expect.arrayContaining(["Size", "Position", "Appearance"]))
    await expect(titles).not.toContain("Typography")
    await expect(titles).not.toContain("Fill")
    await expect(titles).not.toContain("Stroke")
  }
}
