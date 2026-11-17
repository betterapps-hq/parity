import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, within } from "storybook/test"
import { slowly } from "./inspector-stories.tsx"
import { InstancePanel } from "./KindPanels.tsx"
import { filledInstance, pick, renderSection, sectionStage } from "./layer-stories.tsx"

/**
 * A component instance's Design panel (PAR-1062): its props, with the slots it fills, and its attributes, then Size,
 * Position, Typography for the text inside it, and Appearance. It has no Layout. Each section's own cases are in Sections,
 * and an instance's edge cases in Layers › Instances.
 */
const meta = {
  title: "Parity/Inspector/Layers/Component instance",
  component: InstancePanel,
  render: renderSection(InstancePanel),
  decorators: [sectionStage]
} satisfies Meta<typeof InstancePanel>

export default meta

type Story = StoryObj<typeof meta>

/** The section titles, top to bottom. */
async function titles(canvasElement: HTMLElement) {
  const found = await within(canvasElement).findAllByRole("heading", { level: 3 }, slowly)

  return found.map((title) => title.textContent)
}

/** Plan card's call to action, a code component: Button's props lead, then its style, with Typography for its label. */
export const CodeComponent: Story = {
  name: "Code component",
  loaders: [pick("Plan card", "Call to action")],
  play: async ({ canvasElement }) => {
    const names = await titles(canvasElement)
    await expect(names[0]).toBe("Component instance")
    await expect(names).toEqual(expect.arrayContaining(["Size", "Position", "Typography", "Appearance"]))
    await expect(names).not.toContain("Layout")
  }
}

/** Pricing's Starter plan, an instance of Plan card filling its features slot: its props and slots lead. */
export const DesignInstance: Story = {
  name: "Design instance",
  loaders: [filledInstance()],
  play: async ({ canvasElement }) => {
    const names = await titles(canvasElement)
    await expect(names[0]).toBe("Component instance")
    await expect(names).toContain("Size")
    await expect(names).not.toContain("Layout")
  }
}
