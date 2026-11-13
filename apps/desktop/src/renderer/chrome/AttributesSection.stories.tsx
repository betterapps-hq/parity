import { designStates, editNode } from "@parity-app/core"
import { layersSelection } from "@parity-app/editor"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { userEvent, within } from "storybook/test"
import { AttributesSection } from "../inspector/sections/PropsSection.tsx"
import { design, example, node } from "../stories/fixtures.tsx"
import { inspecting, InspectorStage, PanelColumn, search, slowly } from "./inspector-stories.tsx"

/**
 * What a component instance passes on to its component's root element (PAR-1026): attributes, aria ones and events,
 * added from a searchable list and removed from their row.
 */
const meta = {
  title: "Parity/Inspector/Attributes",
  render: () => <AttributesSection />,
  decorators: [
    (Story) => (
      <InspectorStage>
        <PanelColumn>
          <Story />
        </PanelColumn>
      </InspectorStage>
    )
  ]
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

/** Selects one layer of an example design. */
const pick = (designName: string, layerName: string) =>
  inspecting("design", () => layersSelection(design(designName), [node(designName, layerName)]))

/** Nothing passed on yet, on Plan card's call to action: the section with its add button. */
export const NoneSet: Story = { loaders: [pick("Plan card", "Call to action")] }

/**
 * Attributes Pricing's billing toggle sets: an accessible name, an array shown as JSON, and a prop the component
 * doesn't declare. Each says where it comes from on hover.
 */
export const AttributesSet: Story = { loaders: [pick("Pricing", "Period toggle")] }

/** A checkbox's attributes: its id as text, and defaultChecked as a switch. */
export const BooleanAttribute: Story = { loaders: [pick("Sign in", "Remember checkbox")] }

/** An attribute with options, the submit button's type, picked from a list. */
export const AttributeWithOptions: Story = {
  loaders: [
    inspecting("design", () => {
      const key = design("Sign in")
      const id = node("Sign in", "Sign in button")
      example().store.updateContainer(key, "Change type", (container) =>
        editNode(container, designStates(container)[0]!.id, id, { props: { type: "submit" } })
      )

      return layersSelection(key, [id])
    })
  ]
}

/** Attributes' add button opened: every attribute the component passes on that isn't set, grouped, with its kind. */
export const AddingAnAttribute: Story = {
  loaders: [pick("Plan card", "Call to action")],
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Add an attribute" }))
    await within(document.body).findByPlaceholderText("Search attributes", undefined, slowly)
  }
}

/** Searching the attributes to add, for aria ones. */
export const SearchingAttributes: Story = {
  loaders: [pick("Plan card", "Call to action")],
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Add an attribute" }))
    await search(await within(document.body).findByPlaceholderText("Search attributes", undefined, slowly), "aria-d")
  }
}

/** A search that matches no attribute the component passes on. */
export const NoAttributeMatches: Story = {
  loaders: [pick("Plan card", "Call to action")],
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Add an attribute" }))
    await search(
      await within(document.body).findByPlaceholderText("Search attributes", undefined, slowly),
      "strokeWidth"
    )
  }
}
