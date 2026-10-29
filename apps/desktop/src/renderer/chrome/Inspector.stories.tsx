import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, userEvent, waitFor, within } from "storybook/test"
import { design } from "../stories/fixtures.tsx"
import { checkAgain, inspecting, InspectorStage, slowly } from "./inspector-stories.tsx"
import { Inspector } from "./Inspector.tsx"
import { panelLimits, setLayout } from "./layout.ts"

/** The right panel on its own, at the window's right edge: what's selected, the project's modes, and accessibility. */
const meta = {
  title: "Parity/Inspector/Panel",
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

/** The Design tab open, the default, with the Pricing screen selected. */
export const DesignTab: Story = { loaders: [inspecting("design", pricing)] }

/** The Modes tab open: the project's modes and the variables they combine. */
export const ModesTab: Story = { loaders: [inspecting("modes", pricing)] }

/** The Accessibility tab open, checking the selected Pricing screen and listing what it found. */
export const AccessibilityTab: Story = {
  loaders: [inspecting("accessibility", pricing)],
  play: ({ canvasElement }) => checkAgain(canvasElement, "Button has no name")
}

/** Hovering a tab that isn't open names it in a tooltip, since closed tabs show only their icon. */
export const TabTooltip: Story = {
  loaders: [inspecting("design", pricing)],
  play: async ({ canvasElement }) => {
    await userEvent.hover(within(canvasElement).getByRole("tab", { name: "Modes" }))
    await within(document.body).findByRole("tooltip", undefined, slowly)
  }
}

/** Hovering the collapse button: its tooltip names the shortcut, Ctrl \. */
export const CollapseTooltip: Story = {
  loaders: [inspecting("design", pricing)],
  play: async ({ canvasElement }) => {
    await userEvent.hover(within(canvasElement).getByRole("button", { name: "Hide inspector" }))
    await within(document.body).findByRole("tooltip", undefined, slowly)
  }
}

/** Collapsed to a slim rail: the button that opens it again, then each tab, the open one highlighted. */
export const Collapsed: Story = {
  loaders: [
    async () => {
      await inspecting("design", pricing)()
      setLayout({ right: false })
    }
  ]
}

/** Collapsed while the Modes tab was open: the rail marks Modes, and clicking any icon opens the panel on that tab. */
export const CollapsedOnModes: Story = {
  loaders: [
    async () => {
      await inspecting("modes", pricing)()
      setLayout({ right: false })
    }
  ]
}

/** Collapsed, with the pointer on a tab: its tooltip opens toward the canvas. */
export const CollapsedTooltip: Story = {
  loaders: [
    async () => {
      await inspecting("design", pricing)()
      setLayout({ right: false })
    }
  ],
  play: async ({ canvasElement }) => {
    await userEvent.hover(within(canvasElement).getByRole("button", { name: "Accessibility" }))
    await within(document.body).findByRole("tooltip", undefined, slowly)
  }
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

/** The Modes tab at its narrowest, where each mode's variable pickers have the least room. */
export const NarrowestModes: Story = {
  loaders: [
    async () => {
      await inspecting("modes", pricing)()
      setLayout({ rightWidth: panelLimits.right[0] })
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
