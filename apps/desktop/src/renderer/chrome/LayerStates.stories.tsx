import type { Meta, StoryObj } from "@storybook/react-vite"
import { userEvent, within } from "storybook/test"
import { DesignTab } from "./DesignPanel.tsx"
import { slowly } from "./inspector-stories.tsx"
import { inspectorStage, pick, renderSection } from "./layer-stories.tsx"
import { LayerStateSelector } from "./LayerPanel.tsx"

/**
 * A component's layer picked in one of its states: the component state selector says where edits go, and picks another
 * state to send them to (PAR-1022). It shows on a component's own layers only.
 */
const meta = {
  title: "Parity/Inspector/Sections/State selector",
  component: DesignTab,
  render: renderSection(LayerStateSelector),
  decorators: [inspectorStage]
} satisfies Meta<typeof DesignTab>

export default meta

type Story = StoryObj<typeof meta>

/**
 * Stat card's note picked in Loading: the selector turns the component color and says edits change only this state.
 */
export const EditingAState: Story = { loaders: [pick("Stat card", "Note", "loading")] }

/**
 * Stat card's note picked in its base state: the selector says edits change every state, and opens to pick another,
 * where they'd change only that one.
 */
export const ChoosingTheState: Story = {
  loaders: [pick("Stat card", "Note")],
  play: async ({ canvasElement }) => {
    await userEvent.click(await within(canvasElement).findByRole("combobox", undefined, slowly))
    await within(document.body).findByRole("option", { name: "Loading" }, slowly)
  }
}
