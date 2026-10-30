import { editNode } from "@parity-app/core"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { userEvent, within } from "storybook/test"
import { layersSelection } from "../selection.ts"
import { design, example, node } from "../stories/fixtures.tsx"
import { inspecting, InspectorStage, PanelColumn, search, SelectedProps, slowly } from "./inspector-stories.tsx"

/**
 * A component layer's props, as the layer panel shows them, inferred from the component's source: variants offer their
 * options, booleans a switch, numbers and strings an input, each with its default; attributes show once set.
 */
const meta = {
  title: "Parity/Inspector/Props",
  component: SelectedProps,
  decorators: [
    (Story) => (
      <InspectorStage>
        <PanelColumn>
          <Story />
        </PanelColumn>
      </InspectorStage>
    )
  ]
} satisfies Meta<typeof SelectedProps>

export default meta
type Story = StoryObj<typeof meta>

/** Selects one layer of an example design, in a state when one is named. */
const pick = (designName: string, layerName: string, state?: string) =>
  inspecting("design", () =>
    layersSelection(design(designName), [node(designName, layerName)], state ? { state } : undefined)
  )

/** Button's variants and its boolean, on Plan card's call to action: variant set to outline, size left at its default. */
export const VariantsAndBooleans: Story = { loaders: [pick("Plan card", "Call to action")] }

/** Badge with nothing set: each variant shows its default as a placeholder. */
export const AllDefaults: Story = { loaders: [pick("Plan card", "Popular")] }

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
        editNode(container, container.states[0]!.id, id, { props: { type: "submit" } })
      )
      return layersSelection(key, [id])
    })
  ]
}

/** A prop inferred as a number, the search field's size: a number input, with its default as the placeholder. */
export const NumberProp: Story = { loaders: [pick("Projects", "Search input")] }

/** Content given as a number rather than text: the children prop can only say it's set in layers. */
export const NumberAsContent: Story = {
  loaders: [
    inspecting("design", () => {
      const key = design("Pricing")
      const id = node("Pricing", "Badge")
      example().store.updateContainer(key, "Change children", (container) =>
        editNode(container, container.states[0]!.id, id, { props: { children: 12 } })
      )
      return layersSelection(key, [id])
    })
  ]
}

/** An icon from Lucide, whose props aren't read from source: only what it sets shows, and any prop can be added. */
export const IconProps: Story = { loaders: [pick("Plan card", "lucide/Check")] }

/** A component that takes no props of its own and sets none: there's nothing to set. */
export const NoProps: Story = { loaders: [pick("Plan card", "CardContent")] }

/** Before the project's props are read from source: it says so, and shows only the props the layer sets. */
export const PropsNotReadYet: Story = {
  loaders: [
    inspecting("design", () => {
      // Forgets the props read from source, as before they've been read.
      example().components.set({})
      return layersSelection(design("Plan card"), [node("Plan card", "Call to action")])
    })
  ]
}

/** Props a state changes, the password field's in Wrong password: their names in the agent color, each with a reset. */
export const ChangedInAState: Story = { loaders: [pick("Sign in", "Password input", "wrong-password")] }

/** A variant's options open: every option, and the default to go back to. */
export const ChoosingAVariant: Story = {
  loaders: [pick("Plan card", "Call to action")],
  play: async ({ canvasElement }) => {
    const [variant] = await within(canvasElement).findAllByRole("combobox", undefined, slowly)
    await userEvent.click(variant!)
    await within(document.body).findByRole("listbox", undefined, slowly)
  }
}

/** The add button opened: every prop the component accepts that isn't showing, grouped, with what kind each is. */
export const AddingAProp: Story = {
  loaders: [pick("Plan card", "Call to action")],
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Add a prop" }))
    await within(document.body).findByPlaceholderText("Search props", undefined, slowly)
  }
}

/** Searching the props to add, for aria attributes. */
export const SearchingProps: Story = {
  loaders: [pick("Plan card", "Call to action")],
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Add a prop" }))
    await search(await within(document.body).findByPlaceholderText("Search props", undefined, slowly), "aria-d")
  }
}

/** A search that matches no prop the component declares. */
export const NoPropMatches: Story = {
  loaders: [pick("Plan card", "Call to action")],
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Add a prop" }))
    await search(await within(document.body).findByPlaceholderText("Search props", undefined, slowly), "strokeWidth")
  }
}

/** Adding to an icon, whose props aren't known: whatever is typed can be added as a prop. */
export const AddingAnyProp: Story = {
  loaders: [pick("Plan card", "lucide/Check")],
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Add a prop" }))
    await search(await within(document.body).findByPlaceholderText("Search props", undefined, slowly), "strokeWidth")
  }
}
