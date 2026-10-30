import { editNode } from "@parity-app/core"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { userEvent, within } from "storybook/test"
import { useProject } from "../canvas/context.ts"
import { useContainerEntry } from "../design-store.ts"
import { useSelection } from "../selection.ts"
import { design, example, node } from "../stories/fixtures.tsx"
import { inspecting, InspectorStage, PanelColumn, slowly, typing } from "./inspector-stories.tsx"
import { StatesSection } from "./StatesSection.tsx"

/**
 * A design's states, like a Storybook file's stories: the base first, then each state with how many changes it makes.
 * The state the canvas shows is marked, and its changes are listed by layer, each one resettable.
 */
const meta = {
  title: "Parity/Inspector/States",
  component: SelectedStates,
  decorators: [
    (Story) => (
      <InspectorStage>
        <PanelColumn>
          <Story />
        </PanelColumn>
      </InspectorStage>
    )
  ]
} satisfies Meta<typeof SelectedStates>

export default meta
type Story = StoryObj<typeof meta>

/** The selected design's states. */
function SelectedStates() {
  const { store, selection } = useProject()
  const entry = useContainerEntry(store, useSelection(selection).design)
  return entry ? <StatesSection entry={entry} /> : null
}

/** Selects a design, showing one of its states on the canvas when one is named, after `change` edits it. */
const showing = (designName: string, state?: string, change?: (key: string) => void) =>
  inspecting("design", () => {
    const key = design(designName)
    change?.(key)
    if (state) example().store.updateView(key, (view) => ({ ...view, state, allStates: false }))
    return { design: key }
  })

/** Sign in showing its base state: Default marked, the others with their number of changes. */
export const BaseShown: Story = { loaders: [showing("Sign in", "default")] }

/** Sign in showing Signing in: its eight changes listed by layer, each with what it sets. */
export const StateShown: Story = { loaders: [showing("Sign in", "signing-in")] }

/** A state that changes styles too: Pricing's Yearly with the headline recolored, values shown as tokens. */
export const StateWithStyleChanges: Story = {
  loaders: [
    showing("Pricing", "yearly", (key) =>
      example().store.updateContainer(key, "Change style", (container) =>
        editNode(container, "yearly", node("Pricing", "Headline"), {
          style: { foreground: "primary", weight: 700, textAlign: "start" }
        })
      )
    )
  ]
}

/** A state that changes nothing yet: it says how to add changes. */
export const StateWithoutChanges: Story = {
  loaders: [
    showing("Sign in", "hovered", (key) =>
      example().store.updateContainer(key, "Add state", (container) => ({
        ...container,
        states: [...container.states, { id: "hovered", name: "Hovered" }]
      }))
    )
  ]
}

/** A state that changes a layer since deleted: the change is listed under the layer's id. */
export const ChangeToADeletedLayer: Story = {
  loaders: [
    showing("Settings", "saved", (key) =>
      example().store.updateContainer(key, "Change deleted layer", (container) => ({
        ...container,
        states: container.states.map((state) =>
          state.id === "saved"
            ? {
                ...state,
                overrides: { ...state.overrides, "removed-banner": { text: "Saved just now", hidden: false } }
              }
            : state
        )
      }))
    )
  ]
}

/** Every state shown on the canvas at once: none is marked, and no changes are listed. */
export const EveryStateShown: Story = {
  loaders: [
    inspecting("design", () => {
      const key = design("Sign in")
      example().store.updateView(key, (view) => ({ ...view, allStates: true }))
      return { design: key }
    })
  ]
}

/** A design with eleven states, App sidebar, one per page it highlights. */
export const ManyStates: Story = { loaders: [showing("App sidebar", "inbox")] }

/** States with long names truncate before their change counts. */
export const LongStateNames: Story = {
  loaders: [
    showing("Settings", "invalid-email", (key) =>
      example().store.updateContainer(key, "Rename states", (container) => ({
        ...container,
        states: container.states.map((state) => ({
          ...state,
          name: `${state.name} after the person changes their email and presses save`
        }))
      }))
    )
  ]
}

/** Add state clicked: a new state is shown, named New state, with its name selected to type over. */
export const AddingAState: Story = {
  loaders: [showing("Sign in", "default")],
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Add state" }))
    await within(canvasElement).findByDisplayValue("New state", undefined, slowly)
  }
}

/** A state's menu open: rename, duplicate or delete it. */
export const StateMenu: Story = {
  loaders: [showing("Sign in", "wrong-password")],
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Wrong password actions" }))
    await within(document.body).findByRole("menu", undefined, slowly)
  }
}

/** The base state's menu open: it can't be deleted, since it's the design itself. */
export const BaseStateMenu: Story = {
  loaders: [showing("Sign in", "default")],
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Default actions" }))
    await within(document.body).findByRole("menu", undefined, slowly)
  }
}

/** A state being renamed, from its menu or a double-click. */
export const RenamingAState: Story = {
  loaders: [showing("Sign in", "wrong-password")],
  play: async ({ canvasElement }) => {
    await userEvent.dblClick(within(canvasElement).getByRole("button", { name: "Wrong password" }))
    const input = await within(canvasElement).findByDisplayValue("Wrong password", undefined, slowly)
    await userEvent.clear(input)
    await userEvent.type(input, "Wrong password, third try", typing)
  }
}
