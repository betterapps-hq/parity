import { mapNode } from "@parity-app/core"
import { layersSelection } from "@parity-app/editor"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, userEvent, within } from "storybook/test"
import { design, example, node } from "../stories/fixtures.tsx"
import { DesignTab } from "./DesignPanel.tsx"
import { inspecting, slowly } from "./inspector-stories.tsx"
import { inspectorStage, pick, renderInspector } from "./layer-stories.tsx"

/** A layer picked in one of its component's states: where edits go, and what that state changes. */
const meta = {
  title: "Parity/Inspector/Layer/States",
  component: DesignTab,
  render: renderInspector,
  decorators: [inspectorStage]
} satisfies Meta<typeof DesignTab>

export default meta

type Story = StoryObj<typeof meta>

/**
 * A layer picked in another state, Stat card's value skeleton in Loading: the editing bar turns the agent color and says
 * edits change only this state, and what that state changes can be reset.
 */
export const EditingAState: Story = { loaders: [pick("Stat card", "Value skeleton", "loading")] }

/** A layer of a screen, Sign in's password field: a screen has no states, so there's no editing bar (PAR-1002). */
export const LayerOfAScreen: Story = { loaders: [pick("Sign in", "Password input")] }

/**
 * A prop the base design turns on, turned off in one state (PAR-421): Button's button is disabled in the base, and in
 * Outline its `disabled` switch turns off there only. The field is marked as changed, and Reset takes the state's change
 * back, so the switch is on again.
 */
export const TurningAPropOffInAState: Story = {
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

/** The state picker opened from the editing bar: every state of the component, to send edits to another. */
export const ChoosingTheState: Story = {
  loaders: [pick("Stat card", "Value")],
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getAllByRole("combobox")[0]!)
    await within(document.body).findByRole("listbox", undefined, slowly)
  }
}
