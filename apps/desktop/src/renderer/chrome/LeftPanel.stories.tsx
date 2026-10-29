import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, userEvent, waitFor, within } from "storybook/test"
import { design, example, node, openProjects, ProjectStage } from "../stories/fixtures.tsx"
import { panelLimits, setLayout } from "./layout.ts"
import { LeftPanel } from "./LeftPanel.tsx"

/** The left panel on its own, beside where the canvas would be: layers, then what can go into designs, then tokens. */
const meta = {
  title: "Parity/Left panel/Panel",
  component: LeftPanel,
  decorators: [
    (Story) => (
      <ProjectStage>
        <Story />
      </ProjectStage>
    )
  ]
} satisfies Meta<typeof LeftPanel>

export default meta
type Story = StoryObj<typeof meta>

/** Opens the example with the panel on one of its tabs. */
function openOn(tab: string) {
  return async () => {
    await openProjects("example")
    setLayout({ leftTab: tab })
  }
}

/** Opens the example with a layer deep inside the Plan card selected, so its rows nest and their names run long. */
async function deepLayerSelected(): Promise<void> {
  await openProjects("example")
  example().selection.set({ design: design("Plan card"), node: node("Plan card", "Feature 3 text") })
}

/** Every design's layers, components first, then screens. */
export const Layers: Story = { loaders: [() => openProjects("example")] }

/** A design selected on the canvas: its row is highlighted and open to its layers. */
export const DesignSelected: Story = {
  loaders: [
    async () => {
      await openProjects("example")
      example().selection.set({ design: design("Pricing") })
    }
  ],
  // Pricing is a screen, listed below every component design; the panel doesn't scroll to the selection on its own.
  play: async () => {
    const row = await waitFor(() => {
      const found = document.getElementById(`layer-${design("Pricing")}`)
      if (!found) throw new Error("Pricing has no row yet")
      return found
    })
    row.scrollIntoView({ block: "center" })
  }
}

/** Collapsed to a rail of its tabs, each a click away. */
export const Collapsed: Story = {
  loaders: [
    async () => {
      await openProjects("example")
      setLayout({ left: false })
    }
  ]
}

/** Collapsed while the Tokens tab was open: the rail marks Tokens, and opening the panel goes back to it. */
export const CollapsedOnTokens: Story = {
  loaders: [
    async () => {
      await openProjects("example")
      setLayout({ left: false, leftTab: "tokens" })
    }
  ]
}

/** The Components tab open: the open tab shows its name, the others only their icon. */
export const ComponentsTab: Story = { loaders: [openOn("components")] }

/** The Icons tab open. */
export const IconsTab: Story = { loaders: [openOn("icons")] }

/** The Images tab open. */
export const ImagesTab: Story = { loaders: [openOn("images")] }

/** The Tokens tab open. */
export const TokensTab: Story = { loaders: [openOn("tokens")] }

/** Pointing at a tab's icon names it in a tooltip. */
export const TabTooltip: Story = {
  loaders: [() => openProjects("example")],
  play: async ({ canvasElement }) => {
    await userEvent.hover(within(canvasElement).getByRole("tab", { name: "Tokens" }))
    await waitFor(() => expect(within(document.body).getByRole("tooltip")).toHaveTextContent("Tokens"))
  }
}

/** Dragged to its narrowest, 200 pixels: a deep layer's name has little room left beside its nesting. */
export const Narrowest: Story = {
  loaders: [
    async () => {
      await deepLayerSelected()
      setLayout({ leftWidth: panelLimits.left[0] })
    }
  ]
}

/** Dragged to its widest, 480 pixels. */
export const Widest: Story = {
  loaders: [
    async () => {
      await deepLayerSelected()
      setLayout({ leftWidth: panelLimits.left[1] })
    }
  ]
}

/** Resized from the keyboard: three presses of the right arrow on its focused edge widen it 48 pixels, to 304. */
export const ResizingWithKeyboard: Story = {
  loaders: [deepLayerSelected],
  play: async ({ canvasElement }) => {
    const edge = within(canvasElement).getByRole("button", { name: /^Resize panel/ })
    edge.focus()
    await userEvent.keyboard("{ArrowRight}{ArrowRight}{ArrowRight}")
    await waitFor(() => expect(edge).toHaveAccessibleName("Resize panel, 304 pixels wide"))
  }
}

/** The app's light theme, with a layer selected. */
export const LightTheme: Story = {
  globals: { theme: "light" },
  loaders: [deepLayerSelected]
}
