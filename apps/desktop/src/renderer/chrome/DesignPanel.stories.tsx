import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, within } from "storybook/test"
import { design, example } from "../stories/fixtures.tsx"
import { DesignTab } from "./DesignPanel.tsx"
import { inspecting, InspectorStage } from "./inspector-stories.tsx"
import { Inspector } from "./Inspector.tsx"

/**
 * The inspector's Design tab, which follows the selection: a prompt when nothing is selected, then the selected design
 * (its name, kind, states, components or params, and the modes it's shown in), or text on the canvas. Each section's
 * own cases are in Sections: Props › Component design, Components, States and Modes.
 */
const meta = {
  title: "Parity/Inspector/Layers/Designs",
  component: DesignTab,
  render: () => <Inspector />,
  decorators: [
    (Story) => (
      <InspectorStage>
        <Story />
      </InspectorStage>
    )
  ]
} satisfies Meta<typeof DesignTab>

export default meta

type Story = StoryObj<typeof meta>

/**
 * Nothing selected: it asks for a screen, component or frame on the canvas or in Layers, in the glossary's words, and says how
 * to reach their layers. It says the same whatever is on the canvas, since every project opens on a screen (PAR-560).
 */
export const NothingSelected: Story = {
  loaders: [inspecting("design")],
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText("Select a screen, component or frame on the canvas or in Layers.")
    ).toBeVisible()
  }
}

/** A screen selected: Pricing, with its two states, the button that finds repeated parts, and its modes. */
export const ScreenSelected: Story = { loaders: [inspecting("design", () => ({ design: design("Pricing") }))] }

/** A component design selected: Plan card's params with their defaults, and the three places it's used. */
export const ComponentSelected: Story = { loaders: [inspecting("design", () => ({ design: design("Plan card") }))] }

/** A design with a very long name: the name field scrolls and the file badge truncates. */
export const LongName: Story = {
  loaders: [
    inspecting("design", () => {
      const key = design("Pricing")
      example().store.updateContainer(key, "Rename design", (current) => ({
        ...current,
        name: "Pricing page for the enterprise launch, with annual billing and the comparison table"
      }))

      return { design: key }
    })
  ]
}

/** Text on the canvas selected: its words, ready to edit, and the file they're saved in. */
export const NoteSelected: Story = {
  loaders: [
    inspecting("design", () => {
      const { store } = example()

      const note = store.addNote(store.mainPath, {
        id: "launch-note",
        text: "Launch checklist: swap the hero photo, confirm yearly prices with finance, and check the FAQ copy with legal.",
        position: { x: 0, y: -1200 }
      })

      return { note }
    })
  ]
}
