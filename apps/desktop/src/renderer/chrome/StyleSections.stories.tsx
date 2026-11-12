import { designStates, editNode, type NodeStyle } from "@parity-app/core"
import { layersSelection } from "@parity-app/editor"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, userEvent, within } from "storybook/test"
import { z } from "zod"
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
    (Story, { parameters }) => {
      // A story may set the panel's width; the rest take the column's own.
      const width = z.number().safeParse(parameters.panelWidth)

      return (
        <InspectorStage>
          <PanelColumn width={width.success ? width.data : undefined}>
            <Story />
          </PanelColumn>
        </InspectorStage>
      )
    }
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
        editNode(container, state ?? designStates(container)[0]!.id, id, { style })
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
export const WrappingLayout: Story = {
  loaders: [pick("Pricing", "Nav links", { flexWrap: "wrap", rowGap: { step: 2 } })]
}

/** A layer in a grid, the Pro plan: how many columns and rows it spans, instead of self alignment. */
export const InAGrid: Story = { loaders: [pick("Pricing", "Pro plan", { colSpan: 2 })] }

/** A fixed size and a fill color, Pricing's brand mark: 8 steps square, in the primary color. */
export const FixedSizeAndFill: Story = { loaders: [pick("Pricing", "Brand mark")] }

/** Shows `value` whole in a field, not clipped by the field's width. */
async function expectWhole(canvasElement: HTMLElement, name: string, value: string) {
  const field = within(canvasElement).getByRole<HTMLInputElement>("textbox", { name })
  await expect(field).toHaveValue(value)
  await expect(field.scrollWidth).toBeLessThanOrEqual(field.clientWidth)
}

/**
 * A 96 by 48 brand mark with the inspector at its narrowest, 260 pixels: Width and Height show 96 and 48 whole
 * (PAR-496).
 */
export const SizeAtNarrowest: Story = {
  parameters: { panelWidth: 260 },
  loaders: [pick("Pricing", "Brand mark", { width: { step: 24 }, height: { step: 12 } })],
  play: async ({ canvasElement }) => {
    await expectWhole(canvasElement, "Width", "96")
    await expectWhole(canvasElement, "Height", "48")
  }
}

/** A 1440 by 900 brand mark at the inspector's usual width: four digits fit whole (PAR-496). */
export const LargeSize: Story = {
  loaders: [pick("Pricing", "Brand mark", { width: { step: 360 }, height: { step: 225 } })],
  play: async ({ canvasElement }) => {
    await expectWhole(canvasElement, "Width", "1440")
    await expectWhole(canvasElement, "Height", "900")
  }
}

/** A button that fills its parent's width, Plan card's call to action. */
export const FillWidth: Story = { loaders: [pick("Plan card", "Call to action")] }

/** A separator that grows along its row, written the older way, shown and replaced as fill. */
export const GrowsAsFill: Story = { loaders: [pick("Sign in", "Separator")] }

/** Min and max limits set, Pricing's lede: the limits open by themselves, with a button to hide them. */
export const MinAndMax: Story = { loaders: [pick("Pricing", "Lede", { minWidth: { step: 80 } })] }

/** A length given as a token rather than a step: the container size names show in a code font. */
export const LengthTokens: Story = {
  loaders: [pick("Sign in", "Sign in card", { width: { token: "container-sm" }, maxWidth: { token: "container-md" } })]
}

/** Placed absolutely in its layout: the insets from each edge. */
export const Absolute: Story = {
  loaders: [pick("Pricing", "Billing period", { position: "absolute", top: { step: 2 }, right: { step: 4 } })]
}

/** Every appearance property set on Sign in's card: fill, radius, shadow, opacity and clipping. */
export const Appearance: Story = {
  loaders: [
    pick("Sign in", "Sign in card", {
      fills: [{ type: "solid", color: { token: "card" } }],
      borderRadius: { token: "radius-2xl" },
      boxShadow: [{ type: "drop", token: "shadow-lg" }],
      opacity: { step: 80 },
      overflow: "hidden"
    })
  ]
}

/** A stroke: its color, width and dashed style, and a button to remove it. */
export const Stroke: Story = {
  loaders: [
    pick("Sign in", "Sign in card", {
      borderColor: { token: "primary" },
      borderWidth: { step: 2 },
      borderStyle: "dashed"
    })
  ]
}

/** A text layer, Pricing's headline: color, size, weight, letter spacing, centered, and its max lines. */
export const Text: Story = { loaders: [pick("Pricing", "Headline")] }

/** Text decorations: underlined and italic, in title case. */
export const TextDecorations: Story = {
  loaders: [pick("Sign in", "Create an account", { fontStyle: "italic", textTransform: "capitalize" })]
}

/** Text styles on a layout, Pricing's footer: they apply to the text inside, which says so. */
export const TextInside: Story = { loaders: [pick("Pricing", "Footer")] }

/** Styles a state changes, Stat card's label in Loading: each control with the change dot, and a reset. */
export const ChangedInAState: Story = {
  loaders: [pick("Stat card", "Label", { color: { token: "primary" }, fontWeight: { value: 700 } }, "loading")]
}

/** Opens the picker a button names, which is labelled as the button is. A color's swatch and its end both open it. */
async function opens(canvasElement: HTMLElement, name: string) {
  await userEvent.click(within(canvasElement).getAllByRole("button", { name })[0]!)
  await within(document.body).findByRole("dialog", { name }, slowly)
}

/** The fill picker open: the project's colors with swatches, searchable, and None. */
export const PickingAColor: Story = {
  loaders: [pick("Pricing", "Brand mark")],
  play: async ({ canvasElement }) => opens(canvasElement, "Fill 1 picker")
}

/** The gap's options open: the project's spacing tokens, with each one's size. */
export const PickingASpacing: Story = {
  loaders: [pick("Pricing", "Hero")],
  play: async ({ canvasElement }) => opens(canvasElement, "Gap options")
}

/** The weight list open on the headline. */
export const PickingAWeight: Story = {
  loaders: [pick("Pricing", "Headline")],
  play: async ({ canvasElement }) => opens(canvasElement, "Weight picker")
}

/** Width's sizing menu open: hug, fill, and limits to add. */
export const PickingASizing: Story = {
  loaders: [pick("Plan card", "Call to action")],
  play: async ({ canvasElement }) => opens(canvasElement, "Width sizing")
}

/**
 * A width off the spacing scale, the brand mark at 281px: kept as it is. A length can be any number of pixels; only
 * values `NodeStyle` holds as tokens, such as a font size, land on the nearest token.
 */
export const OffScaleSize: Story = {
  loaders: [pick("Pricing", "Brand mark", { width: { step: 70.25 }, height: { step: 12 } })],
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("textbox", { name: "Width" })).toHaveValue("281")
  }
}

/** Insets off the scale on an absolutely placed layer, 3px from the top and 281px from the left. */
export const OffScaleInsets: Story = {
  loaders: [pick("Pricing", "Billing period", { position: "absolute", top: { step: 0.75 }, left: { step: 70.25 } })]
}

/** 281 typed into Width stays 281px rather than landing on a step. */
export const TypingOffScale: Story = {
  loaders: [pick("Pricing", "Brand mark")],
  play: async ({ canvasElement }) => {
    const width = within(canvasElement).getByRole("textbox", { name: "Width" })
    await userEvent.clear(width)
    await userEvent.type(width, "281{Enter}")
    await expect(width).toHaveValue("281")
  }
}
