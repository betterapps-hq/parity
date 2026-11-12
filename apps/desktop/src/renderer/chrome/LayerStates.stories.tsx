import { mapNode } from "@parity-app/core"
import { layersSelection } from "@parity-app/editor"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, userEvent, within } from "storybook/test"
import { design, example, node } from "../stories/fixtures.tsx"
import { DesignTab } from "./DesignPanel.tsx"
import { inspecting, slowly } from "./inspector-stories.tsx"
import { inspectorStage, pick, renderInspector } from "./layer-stories.tsx"

/** A layer picked in one of its design's states: where edits go, and what that state changes. */
const meta = {
  title: "Parity/Inspector/Layer/States",
  component: DesignTab,
  render: renderInspector,
  decorators: [inspectorStage]
} satisfies Meta<typeof DesignTab>

export default meta

type Story = StoryObj<typeof meta>

/**
 * A layer picked in another state, Sign in's password field in Wrong password: the editing bar turns the agent color
 * and says edits change only this state, and the props that state changes can each be reset.
 */
export const EditingAState: Story = { loaders: [pick("Sign in", "Password input", "wrong-password")] }

/**
 * A prop the base design turns on, turned off in one state (PAR-421): Sign in's button is disabled in the base, and in
 * Wrong password its `disabled` switch turns off there only. The field is marked as changed, and Reset takes the
 * state's change back, so the switch is on again.
 */
export const TurningAPropOffInAState: Story = {
  loaders: [
    inspecting("design", () => {
      const key = design("Sign in")
      const id = node("Sign in", "Sign in button")
      example().store.updateContainer(key, "Disable button", (container) => ({
        ...container,
        root: mapNode(container.root, id, (current) =>
          current.type === "component" ? { ...current, props: { ...current.props, disabled: true } } : current
        )
      }))

      return layersSelection(key, [id], { state: "wrong-password" })
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

/** The state picker opened from the editing bar: every state of the design, to send edits to another. */
export const ChoosingTheState: Story = {
  loaders: [pick("Sign in", "Password input")],
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getAllByRole("combobox")[0]!)
    await within(document.body).findByRole("listbox", undefined, slowly)
  }
}
