import type { Meta, StoryObj } from "@storybook/react-vite"
import { userEvent, within } from "storybook/test"
import { design } from "../stories/fixtures.tsx"
import { ComponentsSection } from "./ComponentsSection.tsx"
import { inspecting, slowly } from "./inspector-stories.tsx"
import { sectionStage, renderDesignSection } from "./layer-stories.tsx"

/** A screen's repeated parts, found on request, each with its copies and the params extracting it would give. */
const meta = {
  title: "Parity/Inspector/Sections/Components",
  render: renderDesignSection(ComponentsSection),
  decorators: [sectionStage]
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

/** Selects a design. */
const selecting = (designName: string) => inspecting("design", () => ({ design: design(designName) }))

/** Pricing before anything is found: the button that finds repeated parts. */
export const NothingFoundYet: Story = { loaders: [selecting("Pricing")] }

/** Find repeated parts clicked on Pricing: each part that repeats, with its copies and the params it would get. */
export const RepeatedParts: Story = {
  loaders: [selecting("Pricing")],
  play: async ({ canvasElement }) => {
    const panel = within(canvasElement)
    await userEvent.click(panel.getByRole("button", { name: "Find repeated parts" }))
    await panel.findAllByRole("button", { name: "Extract component" }, slowly)
  }
}

/** Find repeated parts clicked on a design with nothing repeated: it says so, and how to extract a part used once. */
export const NothingRepeats: Story = {
  loaders: [selecting("Button")],
  play: async ({ canvasElement }) => {
    const panel = within(canvasElement)
    await userEvent.click(panel.getByRole("button", { name: "Find repeated parts" }))
    await panel.findByText(/Nothing repeats/, undefined, slowly)
  }
}
