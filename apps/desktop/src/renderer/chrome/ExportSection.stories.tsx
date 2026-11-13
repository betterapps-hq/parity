import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, userEvent, within } from "storybook/test"
import { design, node } from "../stories/fixtures.tsx"
import type { ExportTarget } from "./commands.ts"
import { ExportSection } from "./ExportSection.tsx"
import { openInspector } from "./inspector-stories.tsx"
import { sectionStage } from "./layer-stories.tsx"
import { setPreferences } from "./preferences.ts"

/**
 * Exporting (PAR-185): the Design tab's Export section, at its foot for a design, a layer or several, writes each at
 * the sizes asked for, PNGs or JPGs at 1x to 3x, named after the layers. The canvas and Layers menus export the
 * selection the same way, as Ctrl+Shift+E does.
 */
const meta = {
  title: "Parity/Inspector/Sections/Export",
  decorators: [sectionStage]
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

type Sizes = Parameters<typeof setPreferences>[0]["exportSizes"]

/** Pricing's layers by name, or the design itself, to export at `sizes`. */
const exporting = (layers: string[], sizes: Sizes = [{ format: "png", scale: 2 }]): Story => ({
  loaders: [
    async () => {
      await openInspector()
      setPreferences({ exportSizes: sizes })
    }
  ],
  render: function Export() {
    const targets: ExportTarget[] =
      layers.length > 0
        ? layers.map((layer) => ({ design: design("Pricing"), node: node("Pricing", layer), name: layer }))
        : [{ design: design("Pricing"), name: "Pricing" }]

    const label = targets.length === 1 ? `Export ${targets[0]!.name}` : `Export ${targets.length} layers`

    return <ExportSection targets={targets} label={label} />
  }
})

/** A layer, the headline: one size, a PNG at 2x, which writes `Headline@2x.png`. */
export const Layer: Story = {
  ...exporting(["Headline"]),
  play: async ({ canvasElement }) => {
    const section = within(canvasElement)
    await section.findByText("Headline@2x.png")
    await expect(section.getByRole("button", { name: "Export Headline" })).toBeVisible()
  }
}

/**
 * Several sizes at once, PNGs at 1x, 2x and 3x and a JPG at 2x: four files, and a note that the JPG's see-through
 * parts are white.
 */
export const SeveralSizes: Story = {
  ...exporting(
    ["Headline"],
    [
      { format: "png", scale: 1 },
      { format: "png", scale: 2 },
      { format: "png", scale: 3 },
      { format: "jpg", scale: 2 }
    ]
  ),
  play: async ({ canvasElement }) => {
    const section = within(canvasElement)
    await section.findByText("Headline.png, Headline@2x.png, Headline@3x.png and 1 more")
    await section.findByText(/A JPG has no see-through parts/)
  }
}

/** Adding a size: the next one not asked for, a PNG at 3x after 2x. */
export const AddingASize: Story = {
  ...exporting(["Headline"]),
  play: async ({ canvasElement }) => {
    const section = within(canvasElement)
    await userEvent.click(section.getByRole("button", { name: "Add a size" }))
    await section.findByText("Headline@2x.png, Headline.png")
  }
}

/** Three layers at once: a file for each, named after it. */
export const SeveralLayers: Story = {
  ...exporting(["Headline", "Lede", "Billing period"]),
  play: async ({ canvasElement }) => {
    const section = within(canvasElement)
    await section.findByText("Headline@2x.png, Lede@2x.png, Billing period@2x.png")
    await expect(section.getByRole("button", { name: "Export 3 layers" })).toBeVisible()
  }
}

/** The whole design: one image of Pricing. */
export const WholeDesign: Story = {
  ...exporting([]),
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByText("Pricing@2x.png")
  }
}
