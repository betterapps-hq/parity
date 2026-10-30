import { editNode, type NodeStyle } from "@parity-app/core"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { userEvent, within } from "storybook/test"
import { layersSelection } from "../selection.ts"
import { design, example, node } from "../stories/fixtures.tsx"
import { inspecting, InspectorStage, PanelColumn, SelectedStyles, slowly } from "./inspector-stories.tsx"

/**
 * A layer's style, in Figma's order: layout (for layouts), spacing, size, position (inside a layout or when placed
 * absolutely), appearance, stroke and text. Values are steps of the spacing scale or the project's tokens.
 */
const meta = {
  title: "Parity/Inspector/Styles",
  component: SelectedStyles,
  decorators: [
    (Story) => (
      <InspectorStage>
        <PanelColumn>
          <Story />
        </PanelColumn>
      </InspectorStage>
    )
  ]
} satisfies Meta<typeof SelectedStyles>

export default meta
type Story = StoryObj<typeof meta>

/** Selects one layer of an example design, after setting styles on it in the base design when given. */
const pick = (designName: string, layerName: string, style?: NodeStyle, state?: string) =>
  inspecting("design", () => {
    const key = design(designName)
    const id = node(designName, layerName)
    if (style) {
      example().store.updateContainer(key, "Change style", (container) =>
        editNode(container, state ?? container.states[0]!.id, id, { style })
      )
    }
    return layersSelection(key, [id], state ? { state } : undefined)
  })

/** A vertical layout, Pricing's hero: children centered, a gap, and padding set per side. */
export const VerticalLayout: Story = { loaders: [pick("Pricing", "Hero")] }

/** A horizontal layout, Pricing's nav: space between its children, padding on two axes. */
export const HorizontalLayout: Story = { loaders: [pick("Pricing", "Nav")] }

/** A grid, Pricing's three plans: its tracks, and a gap for columns and rows, at a fixed width. */
export const GridLayout: Story = { loaders: [pick("Pricing", "Plans")] }

/** A horizontal layout that wraps: the wrap toggle on, and a gap for each axis. */
export const WrappingLayout: Story = { loaders: [pick("Pricing", "Nav links", { wrap: true, rowGap: 2 })] }

/** A layer in a grid, the Pro plan: how many columns and rows it spans, instead of self alignment. */
export const InAGrid: Story = { loaders: [pick("Pricing", "Pro plan", { colSpan: 2 })] }

/** A fixed size and a fill color, Pricing's brand mark: 8 steps square, in the primary color. */
export const FixedSizeAndFill: Story = { loaders: [pick("Pricing", "Brand mark")] }

/** A button that fills its parent's width, Plan card's call to action. */
export const FillWidth: Story = { loaders: [pick("Plan card", "Call to action")] }

/** A separator that grows along its row, written the older way, shown and replaced as fill. */
export const GrowsAsFill: Story = { loaders: [pick("Sign in", "Separator")] }

/** Min and max limits set, Pricing's lede: the limits open by themselves, with a button to hide them. */
export const MinAndMax: Story = { loaders: [pick("Pricing", "Lede", { minWidth: 80 })] }

/** A length given as a token rather than a step: the container size names show in a code font. */
export const LengthTokens: Story = {
  loaders: [pick("Sign in", "Sign in card", { width: "container-sm", maxWidth: "container-md" })]
}

/** Placed absolutely in its layout: the insets from each edge. */
export const Absolute: Story = {
  loaders: [pick("Pricing", "Billing period", { position: "absolute", top: 2, right: 4 })]
}

/** Every appearance property set on Sign in's card: fill, radius, shadow, opacity and clipping. */
export const Appearance: Story = {
  loaders: [
    pick("Sign in", "Sign in card", {
      background: "card",
      radius: "radius-2xl",
      shadow: "shadow-lg",
      opacity: 80,
      overflow: "hidden"
    })
  ]
}

/** A stroke: its color, width and dashed style, and a button to remove it. */
export const Stroke: Story = {
  loaders: [pick("Sign in", "Sign in card", { border: "primary", borderWidth: 2, borderStyle: "dashed" })]
}

/** A text layer, Pricing's headline: color, size, weight, letter spacing, centered, and its max lines. */
export const Text: Story = { loaders: [pick("Pricing", "Headline")] }

/** Text decorations: underlined and italic, in title case. */
export const TextDecorations: Story = {
  loaders: [pick("Sign in", "Create an account", { italic: true, transform: "capitalize" })]
}

/** Text styles on a layout, Pricing's footer: they apply to the text inside, which says so. */
export const TextInside: Story = { loaders: [pick("Pricing", "Footer")] }

/** Styles a state changes, the headline in Yearly: their names in the agent color, each with a reset. */
export const ChangedInAState: Story = {
  loaders: [pick("Pricing", "Headline", { foreground: "primary", weight: 700 }, "yearly")]
}

/** The fill picker open: the project's colors with swatches, searchable, and None. */
export const PickingAColor: Story = {
  loaders: [pick("Pricing", "Brand mark")],
  play: async ({ canvasElement }) => {
    // Fill comes before the text color, which names a primary token too.
    await userEvent.click(within(canvasElement).getAllByRole("button", { name: /primary/ })[0]!)
    await within(document.body).findByPlaceholderText("Search tokens", undefined, slowly)
  }
}

/** The gap's picker open: the project's length tokens, then the spacing scale with each step's size. */
export const PickingASpacing: Story = {
  loaders: [pick("Pricing", "Hero")],
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Pick a token for gap" }))
    await within(document.body).findByPlaceholderText("Search spacing", undefined, slowly)
  }
}

/** The weight list open on the headline. */
export const PickingAWeight: Story = {
  loaders: [pick("Pricing", "Headline")],
  play: async ({ canvasElement }) => {
    const weight = within(canvasElement).getByText("Semibold 600")
    await userEvent.click(weight.closest("button")!)
    await within(document.body).findByRole("listbox", undefined, slowly)
  }
}

/** Width's sizing list open: fixed, fill or hug. */
export const PickingASizing: Story = {
  loaders: [pick("Plan card", "Call to action")],
  play: async ({ canvasElement }) => {
    const width = within(canvasElement).getAllByRole("combobox")[0]!
    await userEvent.click(width)
    await within(document.body).findByRole("listbox", undefined, slowly)
  }
}
