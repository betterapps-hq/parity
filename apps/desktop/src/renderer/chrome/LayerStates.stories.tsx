import { mapNode } from "@parity-app/core"
import { layersSelection } from "@parity-app/editor"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, userEvent, within } from "storybook/test"
import { design, example, node } from "../stories/fixtures.tsx"
import { DesignTab } from "./DesignPanel.tsx"
import { inspecting, slowly } from "./inspector-stories.tsx"
import { inspectorStage, pick, renderPart } from "./layer-stories.tsx"

/**
 * A component's layer picked in one of its states: the component state selector says where edits go, and picks another
 * state to send them to (PAR-1022). It shows on a component's own layers only.
 */
const meta = {
  title: "Parity/Inspector/Layer/States",
  component: DesignTab,
  render: renderPart("state"),
  decorators: [inspectorStage]
} satisfies Meta<typeof DesignTab>

export default meta

type Story = StoryObj<typeof meta>

/**
 * Stat card's note picked in Loading: the selector turns the component color and says edits change only this state.
 */
export const EditingAState: Story = { loaders: [pick("Stat card", "Note", "loading")] }

/**
 * A prop the base design turns on, turned off in one state (PAR-421): Button's button is disabled in the base, and in
 * Outline its `disabled` switch turns off there only. The field is marked as changed, and Reset takes the state's change
 * back, so the switch is on again.
 */
export const TurningAPropOffInAState: Story = {
  render: renderPart("props"),
  loaders: [
    inspecting("design", () => {
      const key = design("Button")
      const id = node("Button", "Button")
      example().store.updateContainer(key, "Disable button", (container) => ({
        ...container,
        root: mapNode(container.root, id, (current) =>
          current.type === "component" ? { ...current, props: { ...current.props, disabled: true } } : current
        )
      }))

      return layersSelection(key, [id], { state: "outline" })
    })
  ],
  play: async ({ canvasElement }) => {
    const panel = within(canvasElement)
    const disabled = await panel.findByRole("switch", { name: "Disabled" }, slowly)
    await expect(disabled).toBeChecked()
    await userEvent.click(disabled)
    await expect(panel.getByRole("switch", { name: "Disabled" })).not.toBeChecked()
    await userEvent.click(await panel.findByRole("button", { name: "Reset Disabled to Default" }, slowly))
    await expect(await panel.findByRole("switch", { name: "Disabled" }, slowly)).toBeChecked()
    await expect(panel.queryByRole("button", { name: "Reset Disabled to Default" })).toBeNull()
  }
}

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
