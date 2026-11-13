import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, userEvent, waitFor, within } from "storybook/test"
import { design, example } from "../stories/fixtures.tsx"
import { ModesSection } from "./DesignPanel.tsx"
import { inspecting } from "./inspector-stories.tsx"
import { inspectorStage, renderDesignSection } from "./layer-stories.tsx"

/**
 * The modes a screen or component is shown in, in its own order, each put in place by its handle. The first always
 * shows; each other's switch shows it beside the first. The project's modes themselves are in Panel › Modes tab.
 */
const meta = {
  title: "Parity/Inspector/Sections/Modes",
  render: renderDesignSection(ModesSection),
  decorators: [inspectorStage]
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

/** Dashboard's modes, in its own order. */
export const PrimaryModeShown: Story = { loaders: [inspecting("design", () => ({ design: design("Dashboard") }))] }

/** One of Dashboard's mode columns selected on the canvas: its row is highlighted. */
export const ModeSelected: Story = {
  loaders: [inspecting("design", () => ({ design: design("Dashboard"), mode: "mobile-light" }))]
}

/** A design shown in every mode: each mode's switch is on beside the main one. */
export const EveryModeShown: Story = {
  loaders: [
    inspecting("design", () => {
      const key = design("Sign in")
      example().store.updateView(key, "Show Desktop Dark, Tablet Light and Mobile Light", (view) => ({
        ...view,
        modes: ["desktop-dark", "tablet-light", "mobile-light"]
      }))

      return { design: key }
    })
  ]
}

/**
 * A screen that shows Mobile Light first, rather than the project's primary mode: it heads the list, and its switch
 * stays on, since the first mode always shows. Up on Desktop Light's handle moves it first, and Mobile Light still
 * shows beside it.
 */
export const AnotherModeFirst: Story = {
  loaders: [
    inspecting("design", () => {
      const key = design("Sign in")
      example().store.updateView(key, "Show Mobile Light first", (view) => ({
        ...view,
        mode: "mobile-light",
        modes: ["desktop-light"]
      }))

      return { design: key }
    })
  ],
  play: async ({ canvasElement }) => {
    const panel = within(canvasElement)
    const switches = () => panel.getAllByRole("switch", { name: /^Show / })

    await expect(switches()[0]).toHaveAccessibleName("Show Mobile Light")
    await expect(switches()[0]).toBeChecked()
    await expect(switches()[0]).toHaveAttribute("aria-disabled", "true")

    panel.getByRole("button", { name: "Move Desktop Light" }).focus()
    await userEvent.keyboard("{ArrowUp}")

    await waitFor(() => expect(switches()[0]).toHaveAccessibleName("Show Desktop Light"))
    await expect(switches()[0]).toHaveAttribute("aria-disabled", "true")
    await expect(panel.getByRole("switch", { name: "Show Mobile Light" })).toBeChecked()
    await expect(panel.getByRole("switch", { name: "Show Mobile Light" })).not.toHaveAttribute("aria-disabled")
  }
}
