import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, fireEvent, screen, userEvent, within } from "storybook/test"
import { TypographyPresetExploration } from "./exploration.tsx"
import { detach, layerWith, projectById, setOwn } from "./presets.ts"

/**
 * Choosing a typography preset for a text layer, and how the Text section shows the rows it then sets, for PAR-707
 * (call 6 of docs/proposals/design-options.md). The same layer is shown three ways side by side: the rows the preset
 * sets hidden, folded into its row, or shown locked. Rows it doesn't set (color, alignment, decoration, and whatever
 * else it leaves out) stay editable in all three. Changing a row the preset sets overrides it there, in the override
 * color with a reset arrow, and the preset's menu detaches it. Presets are the fixture projects' own: Fluent's
 * typographyStyles, Material UI's typography variants (which grow with the viewport), Chakra's textStyles, and, for
 * Tailwind, Tailwind's documented `--text-tiny` and a DTCG token. Under each, what the layer stores, the same in every
 * project, and what Tailwind's adapter writes from it, beside the library's own for comparison (PAR-708).
 */
const meta = {
  title: "Parity/Explorations/Typography preset",
  component: TypographyPresetExploration
} satisfies Meta<typeof TypographyPresetExploration>

export default meta
type Story = StoryObj<typeof meta>

const version = (canvasElement: HTMLElement, name: string) =>
  within(within(canvasElement).getByRole("region", { name }))

/** Types a value into a focused field and presses Enter. `userEvent.type` changes the field without React's handler. */
async function enter(field: HTMLElement, text: string): Promise<void> {
  await fireEvent.input(field, { target: { value: text } })
  await userEvent.keyboard("{Enter}")
}

/** Fluent's subtitle1 on the layer, three ways. Fluent's presets set font, size, weight and line height. */
export const Compare: Story = {
  play: async ({ canvasElement }) => {
    for (const name of ["Hidden", "Folded into the preset", "Shown locked"]) {
      const section = version(canvasElement, name)
      await expect(section.getByRole("button", { name: "Typography preset: subtitle1" })).toBeVisible()
      await expect(section.getByRole("button", { name: "Italic" })).toBeEnabled()
    }
    await expect(version(canvasElement, "Hidden").queryByRole("textbox", { name: "Size" })).toBeNull()
    await expect(
      version(canvasElement, "Shown locked").getByRole("textbox", { name: "Size, set by subtitle1" })
    ).toBeDisabled()
  }
}

/**
 * The picker, open: the project's presets under where they come from, each drawn in its own font, size and weight.
 * Picking one fills in what it sets.
 */
export const Picking: Story = {
  play: async ({ canvasElement }) => {
    const folded = version(canvasElement, "Folded into the preset")
    await userEvent.click(folded.getByRole("button", { name: "Typography preset: subtitle1" }))
    const list = within(await screen.findByRole("listbox"))
    await expect(list.getByRole("group", { name: "From Fluent's typographyStyles" })).toBeInTheDocument()
    await userEvent.click(list.getByRole("option", { name: /^title3/ }))
    await expect(folded.getByRole("button", { name: "Typography preset: title3" })).toBeVisible()
    await expect(folded.getByRole("button", { name: "Show what title3 sets" })).toHaveTextContent(
      "Segoe UI 24/32 Semibold"
    )
    await userEvent.click(folded.getByRole("button", { name: "Typography preset: title3" }))
  }
}

const lineHeight24 = () => setOwn(layerWith("subtitle1"), "mobile", "lineHeight", { px: 24 })

/**
 * subtitle1 with its line height changed to 24 on the layer. The preset stays applied; Line height shows in the
 * override color with a reset arrow in all three, its chip gets a dot, and Tailwind writes `leading-6` after the
 * preset's class.
 */
export const OverridingOneRow: Story = {
  args: { start: lineHeight24 },
  play: async ({ canvasElement }) => {
    for (const name of ["Hidden", "Folded into the preset", "Shown locked"]) {
      const section = version(canvasElement, name)
      await expect(
        section.getByRole("button", { name: "Typography preset: subtitle1, 1 value overridden" })
      ).toBeVisible()
      await expect(section.getByRole("textbox", { name: "Line height" })).toHaveValue("24")
    }
    const locked = version(canvasElement, "Shown locked")
    await userEvent.click(locked.getByRole("button", { name: "Reset Line height to subtitle1" }))
    await expect(locked.getByRole("textbox", { name: "Line height, set by subtitle1" })).toHaveValue("28")
    await expect(locked.getByRole("button", { name: "Typography preset: subtitle1" })).toBeVisible()
  }
}

/** Overriding from each: Hidden brings the row back from the preset's menu, Shown locked unlocks it. */
export const Overriding: Story = {
  play: async ({ canvasElement }) => {
    const locked = version(canvasElement, "Shown locked")
    await userEvent.click(locked.getByRole("button", { name: "Unlock Size to override it" }))
    const size = locked.getByRole("textbox", { name: "Size" })
    await expect(size).toHaveFocus()
    await enter(size, "22")
    await expect(locked.getByRole("button", { name: "Reset Size to subtitle1" })).toBeVisible()

    const hidden = version(canvasElement, "Hidden")
    await userEvent.click(hidden.getByRole("button", { name: "More for subtitle1" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "Line height" }))
    await expect(hidden.getByRole("textbox", { name: "Line height" })).toHaveValue("28")
  }
}

/**
 * subtitle1 detached: the layer keeps its font, size, weight and line height as values of its own, and the rows are
 * ordinary ones in all three.
 */
export const Detached: Story = {
  args: { start: (project) => detach(project, layerWith("subtitle1")) },
  play: async ({ canvasElement }) => {
    const hidden = version(canvasElement, "Hidden")
    await expect(hidden.getByRole("button", { name: "Typography preset: none" })).toBeVisible()
    await expect(hidden.getByRole("textbox", { name: "Size" })).toHaveValue("20")
  }
}

/** Detaching from the preset's menu. */
export const Detaching: Story = {
  play: async ({ canvasElement }) => {
    const folded = version(canvasElement, "Folded into the preset")
    await userEvent.click(folded.getByRole("button", { name: "More for subtitle1" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "Detach preset" }))
    await expect(folded.getByRole("button", { name: "Typography preset: none" })).toBeVisible()
    await expect(folded.getByRole("textbox", { name: "Line height" })).toHaveValue("28")
  }
}

/**
 * Material UI's h4, which `responsiveFontSizes` takes from 25px on phones to 34px at 1200px wide, at the Tablet
 * viewport. The preset's row and Size have a dot for differing by viewport, and the layer keeps one class: the
 * utility holds each width's size. Changing a row here writes this viewport's patch (`sm:` in Tailwind), with the label
 * in the mode color.
 */
export const PerViewport: Story = {
  args: { project: "mui", viewport: "tablet", folded: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const folded = version(canvasElement, "Folded into the preset")
    await expect(folded.getByRole("textbox", { name: "Size" })).toHaveValue("29.15")
    await userEvent.click(canvas.getByRole("button", { name: "Desktop 1440" }))
    await expect(folded.getByRole("textbox", { name: "Size" })).toHaveValue("34")
    await userEvent.click(canvas.getByRole("button", { name: "Tablet 768" }))
  }
}

/**
 * Chakra's lg, which sets only size and line height: font, weight and letter spacing stay ordinary rows, inherited
 * from the page, in all three.
 */
export const SomeRowsSet: Story = {
  args: { project: "chakra", start: () => layerWith(projectById("chakra").initial) },
  play: async ({ canvasElement }) => {
    const hidden = version(canvasElement, "Hidden")
    await expect(hidden.getByRole("combobox", { name: "Weight" })).toBeEnabled()
    await expect(hidden.queryByRole("textbox", { name: "Size" })).toBeNull()
  }
}
