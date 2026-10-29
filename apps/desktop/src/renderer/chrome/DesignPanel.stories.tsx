import type { Meta, StoryObj } from "@storybook/react-vite"
import { userEvent, within } from "storybook/test"
import { design, example } from "../stories/fixtures.tsx"
import { DesignTab } from "./DesignPanel.tsx"
import { inspecting, InspectorStage, slowly } from "./inspector-stories.tsx"
import { Inspector } from "./Inspector.tsx"

/**
 * The inspector's Design tab, which follows the selection: a prompt when nothing is selected, then the selected design
 * (its name, kind, states, components or params, and the modes it's shown in), a mode column, or text on the canvas.
 */
const meta = {
  title: "Parity/Inspector/Design",
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

/** Nothing selected: a prompt to select a design, and how to reach its layers. */
export const NothingSelected: Story = { loaders: [inspecting("design")] }

/** A screen selected: Pricing, with its two states, the button that finds repeated parts, and its modes. */
export const ScreenSelected: Story = { loaders: [inspecting("design", () => ({ design: design("Pricing") }))] }

/** A component design selected: Plan card's params with their defaults, and the three places it's used. */
export const ComponentSelected: Story = { loaders: [inspecting("design", () => ({ design: design("Plan card") }))] }

/** A component with many params, Project card's nineteen: switches for its booleans, inputs for the rest. */
export const ComponentWithManyParams: Story = {
  loaders: [inspecting("design", () => ({ design: design("Project card") }))]
}

/** A component with no params and eleven states, App sidebar: every instance looks the same. */
export const ComponentWithoutParams: Story = {
  loaders: [inspecting("design", () => ({ design: design("App sidebar") }))]
}

/** A screen just switched to a component: no params yet, and not used anywhere yet. */
export const NewComponent: Story = {
  loaders: [
    inspecting("design", () => {
      const key = design("Button")
      example().store.updateContainer(key, "Change design kind", (current) => ({ ...current, kind: "component" }))
      return { design: key }
    })
  ]
}

/** One of Dashboard's mode columns selected on the canvas: its row is highlighted under Modes. */
export const ModeSelected: Story = {
  loaders: [inspecting("design", () => ({ design: design("Dashboard"), mode: "mobile-light" }))]
}

/** A design shown in every mode: each mode's switch is on beside the main one. */
export const EveryModeShown: Story = {
  loaders: [
    inspecting("design", () => {
      const key = design("Sign in")
      example().store.updateView(key, (view) => ({
        ...view,
        modes: ["desktop-dark", "tablet-light", "mobile-light"]
      }))
      return { design: key }
    })
  ]
}

/** A design whose main frame is another mode than the project's primary: Mobile Light is its main mode. */
export const OtherMainMode: Story = {
  loaders: [
    inspecting("design", () => {
      const key = design("Sign in")
      example().store.updateView(key, (view) => ({ ...view, mode: "mobile-light", modes: ["desktop-light"] }))
      return { design: key }
    })
  ]
}

/** Looking at another state than the base: Sign in showing Wrong password, its changes listed under States. */
export const ShowingAnotherState: Story = {
  loaders: [
    inspecting("design", () => {
      const key = design("Sign in")
      example().store.updateView(key, (view) => ({ ...view, state: "wrong-password", allStates: false }))
      return { design: key }
    })
  ]
}

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

/** Find repeated parts clicked on Pricing: each part that repeats, with its copies and the params it would get. */
export const RepeatedParts: Story = {
  loaders: [inspecting("design", () => ({ design: design("Pricing") }))],
  play: async ({ canvasElement }) => {
    const panel = within(canvasElement)
    await userEvent.click(panel.getByRole("button", { name: "Find repeated parts" }))
    await panel.findAllByRole("button", { name: "Extract component" }, slowly)
  }
}

/** Find repeated parts clicked on a design with nothing repeated: it says so, and how to extract a part used once. */
export const NothingRepeats: Story = {
  loaders: [inspecting("design", () => ({ design: design("Button") }))],
  play: async ({ canvasElement }) => {
    const panel = within(canvasElement)
    await userEvent.click(panel.getByRole("button", { name: "Find repeated parts" }))
    await panel.findByText(/Nothing repeats/, undefined, slowly)
  }
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
