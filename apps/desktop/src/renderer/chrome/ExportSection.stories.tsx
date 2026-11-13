import { layersSelection } from "@parity-app/editor"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, userEvent, within } from "storybook/test"
import { AppWindow } from "../App.tsx"
import { design, example, node, onCanvas } from "../stories/fixtures.tsx"
import { setLayout } from "./layout.ts"
import { setPreferences } from "./preferences.ts"

/**
 * Exporting (PAR-185): the Design tab's Export section, at its foot for a design, a layer or several, writes each at
 * the sizes asked for, PNGs or JPGs at 1x to 3x, named after the layers; the canvas and Layers menus export the
 * selection the same way, as Ctrl+Shift+E does.
 */
const meta = {
  title: "Parity/Inspector/Sections/Export",
  component: AppWindow,
  decorators: [
    (Story) => (
      <div className="h-screen">
        <Story />
      </div>
    )
  ]
} satisfies Meta<typeof AppWindow>

export default meta

type Story = StoryObj<typeof meta>

const page = () => within(document.body)

/** Pricing on the canvas with `layers` selected, or the design itself, at `sizes`, scrolled to the Export section. */
const exporting = (
  layers: string[],
  sizes: Parameters<typeof setPreferences>[0]["exportSizes"] = [{ format: "png", scale: 2 }],
  then?: (section: HTMLElement) => Promise<void>
) =>
  onCanvas(
    ["Pricing"],
    () => {
      setPreferences({ exportSizes: sizes })
      setLayout({ right: true, rightTab: "design", left: true, leftTab: "layers" })
      example().selection.set(
        layers.length > 0
          ? layersSelection(
              design("Pricing"),
              layers.map((layer) => node("Pricing", layer))
            )
          : { design: design("Pricing") }
      )
    },
    async () => {
      const heading = await page().findByRole("heading", { name: "Export" }, { timeout: 10_000 })
      const section = heading.closest("section")!
      section.scrollIntoView({ block: "end" })
      await then?.(section)
    }
  )

/** A layer, the headline: one size, a PNG at 2x, which writes `Headline@2x.png`. */
export const Layer: Story = exporting(["Headline"], undefined, async (section) => {
  await within(section).findByText("Headline@2x.png")
  await expect(within(section).getByRole("button", { name: "Export Headline" })).toBeVisible()
})

/**
 * Several sizes at once, PNGs at 1x, 2x and 3x and a JPG at 2x: four files, and a note that the JPG's see-through
 * parts are white.
 */
export const SeveralSizes: Story = exporting(
  ["Headline"],
  [
    { format: "png", scale: 1 },
    { format: "png", scale: 2 },
    { format: "png", scale: 3 },
    { format: "jpg", scale: 2 }
  ],
  async (section) => {
    await within(section).findByText("Headline.png, Headline@2x.png, Headline@3x.png and 1 more")
    await within(section).findByText(/A JPG has no see-through parts/)
  }
)

/** Adding a size: the next one not asked for, a PNG at 3x after 2x. */
export const AddingASize: Story = exporting(["Headline"], undefined, async (section) => {
  await userEvent.click(within(section).getByRole("button", { name: "Add a size" }))
  await within(section).findByText("Headline@2x.png, Headline.png")
})

/** Three layers at once: a file for each, named after it. */
export const SeveralLayers: Story = exporting(["Headline", "Lede", "Billing period"], undefined, async (section) => {
  await within(section).findByText("Headline@2x.png, Lede@2x.png, Billing period@2x.png")
  await expect(within(section).getByRole("button", { name: "Export 3 layers" })).toBeVisible()
})

/** The whole design: one image of Pricing. */
export const WholeDesign: Story = exporting([], undefined, async (section) => {
  await within(section).findByText("Pricing@2x.png")
})
