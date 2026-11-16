import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, userEvent, waitFor, within } from "storybook/test"
import { design } from "../stories/fixtures.tsx"
import { inspecting, InspectorStage } from "./inspector-stories.tsx"
import { Inspector } from "./Inspector.tsx"
import { panelLimits, setLayout } from "./layout.ts"

/**
 * The right panel on its own, at the window's right edge: open or collapsed, and resized. What each tab shows is in
 * Layers and Sections for the Design tab, and in Panel › Modes tab and Panel › Accessibility tab.
 */
const meta = {
  title: "Parity/Inspector/Panel/Inspector",
  component: Inspector,
  decorators: [
    (Story) => (
      <InspectorStage>
        <Story />
      </InspectorStage>
    )
  ]
} satisfies Meta<typeof Inspector>

export default meta

type Story = StoryObj<typeof meta>

const pricing = () => ({ design: design("Pricing") })

/** Open on the Design tab, the default, with the Pricing screen selected. */
export const Expanded: Story = { loaders: [inspecting("design", pricing)] }

/** Collapsed to a slim rail: the button that opens it again, then each tab, the open one highlighted. */
export const Collapsed: Story = {
  loaders: [
    async () => {
      await inspecting("design", pricing)()
      setLayout({ right: false })
    }
  ]
}

/** Dragged to its narrowest, 260 pixels: labels truncate and rows stay on one line. */
export const Narrowest: Story = {
  loaders: [
    async () => {
      await inspecting("design", pricing)()
      setLayout({ rightWidth: panelLimits.right[0] })
    }
  ]
}

/** Dragged to its widest, 520 pixels. */
export const Widest: Story = {
  loaders: [
    async () => {
      await inspecting("design", pricing)()
      setLayout({ rightWidth: panelLimits.right[1] })
    }
  ]
}

/** The resize edge focused from the keyboard and moved with the arrow keys: it lights up, and the panel widens. */
export const ResizingWithKeys: Story = {
  loaders: [inspecting("design", pricing)],
  play: async ({ canvasElement }) => {
    const edge = within(canvasElement).getByRole("button", { name: /^Resize panel/ })
    edge.focus()
    await userEvent.keyboard("{ArrowLeft}{ArrowLeft}{Shift>}{ArrowLeft}{/Shift}")
    await waitFor(() => expect(edge).toHaveAccessibleName("Resize panel, 400 pixels wide"))
  }
}
