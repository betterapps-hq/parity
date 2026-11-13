import { designStates, editNode } from "@parity-app/core"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { userEvent, within } from "storybook/test"
import { useProject } from "../canvas/context.ts"
import { useContainerEntry } from "../design-store.ts"
import { useSelection } from "../selection.ts"
import { design, example } from "../stories/fixtures.tsx"
import { inspecting, InspectorStage, PanelColumn, slowly, typing } from "./inspector-stories.tsx"
import { StatesSection } from "./StatesSection.tsx"

/**
 * A component's states, like a Storybook file's stories: the base first, then each state with how many changes it makes.
 * The state the canvas shows is marked, and its changes are listed by layer, each one resettable. Only a component has
 * states, so a screen's Design tab has no States section (PAR-1002).
 */
const meta = {
  title: "Parity/Inspector/Sections/States",
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

/** The selected component's states. */
function SelectedStates() {
  const { store, selection } = useProject()
  const entry = useContainerEntry(store, useSelection(selection).design)

  return entry ? <StatesSection entry={entry} /> : null
}

/** Selects a component, showing one of its states on the canvas when one is named, after `change` edits it. */
const showing = (designName: string, state?: string, change?: (key: string) => void) =>
  inspecting("design", () => {
    const key = design(designName)
    change?.(key)

    if (state) {
      example().store.updateView(key, `Show ${state}`, (view) => ({ ...view, state, allStates: false }))
    }

    return { design: key }
  })

/** Button showing its first state: Default marked, the others with their number of changes. */
export const DefaultShown: Story = { loaders: [showing("Button", "default")] }

/** Stat card showing Loading: its changes listed by layer, each with what it sets. */
export const StateShown: Story = { loaders: [showing("Stat card", "loading")] }

/** A state that changes styles too: Stat card's Loading with its frame recolored, values shown as tokens. */
export const StateWithStyleChanges: Story = {
  loaders: [
    showing("Stat card", "loading", (key) =>
      example().store.updateContainer(key, "Change style", (container) =>
        editNode(container, "loading", container.root.id, {
          style: { color: { token: "primary" }, fontWeight: { value: 700 }, textAlign: "start" }
        })
      )
    )
  ]
}

/** A state that changes nothing yet: it says how to add changes. */
export const StateWithoutChanges: Story = {
  loaders: [
    showing("Button", "hovered", (key) =>
      example().store.updateContainer(key, "Add state", (container) => ({
        ...container,
        states: [...designStates(container), { id: "hovered", name: "Hovered" }]
      }))
    )
  ]
}

/** A state that changes a layer since deleted: the change is listed under the layer's id. */
export const ChangeToADeletedLayer: Story = {
  loaders: [
    showing("Stat card", "loading", (key) =>
      example().store.updateContainer(key, "Change deleted layer", (container) => ({
        ...container,
        states: designStates(container).map((state) =>
          state.id === "loading"
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
      const key = design("Button")
      example().store.updateView(key, "Show every state", (view) => ({ ...view, allStates: true }))

      return { design: key }
    })
  ]
}

/** A component with eleven states, App sidebar, one per page it highlights. */
export const ManyStates: Story = { loaders: [showing("App sidebar", "inbox")] }

/** States with long names truncate before their change counts. */
export const LongStateNames: Story = {
  loaders: [
    showing("Button", "disabled", (key) =>
      example().store.updateContainer(key, "Rename states", (container) => ({
        ...container,
        states: designStates(container).map((state) => ({
          ...state,
          name: `${state.name} while the project saves and the person waits for it`
        }))
      }))
    )
  ]
}

/** Add state clicked: a new state is shown, named New state, with its name selected to type over. */
export const AddingAState: Story = {
  loaders: [showing("Button", "default")],
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Add state" }))
    await within(canvasElement).findByDisplayValue("New state", undefined, slowly)
  }
}

/** A state's menu open: rename, duplicate or delete it. */
export const StateMenu: Story = {
  loaders: [showing("Button", "disabled")],
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Disabled actions" }))
    await within(document.body).findByRole("menu", undefined, slowly)
  }
}

/** The first state's menu open: it can't be deleted, since every other state changes it. */
export const DefaultStateMenu: Story = {
  loaders: [showing("Button", "default")],
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Default actions" }))
    await within(document.body).findByRole("menu", undefined, slowly)
  }
}

/** A state being renamed, from its menu or a double-click. */
export const RenamingAState: Story = {
  loaders: [showing("Button", "disabled")],
  play: async ({ canvasElement }) => {
    await userEvent.dblClick(within(canvasElement).getByRole("button", { name: "Disabled" }))
    const input = await within(canvasElement).findByDisplayValue("Disabled", undefined, slowly)
    await userEvent.clear(input)
    await userEvent.type(input, "Disabled while saving", typing)
  }
}
