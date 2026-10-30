import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, fireEvent, spyOn, userEvent, waitFor, within } from "storybook/test"
import { example, openProjects, ProjectStage } from "../stories/fixtures.tsx"
import { service } from "../stories/host.ts"
import { setLayout } from "./layout.ts"
import { LeftPanel } from "./LeftPanel.tsx"
import { TokensPanel } from "./TokensPanel.tsx"

/**
 * The Tokens tab: the project's own variables and its styling framework's theme, in sections by what they're for, each
 * drawn as it looks. Any value can be edited; the change is undoable, and saving the project writes it to the project's
 * stylesheet. A token's name copies from its row. Shown in the left panel, as the app shows it.
 */
const meta = {
  title: "Parity/Left panel/Tokens",
  component: TokensPanel,
  render: () => <LeftPanel />,
  decorators: [
    (Story) => (
      <ProjectStage>
        <Story />
      </ProjectStage>
    )
  ]
} satisfies Meta<typeof TokensPanel>

export default meta
type Story = StoryObj<typeof meta>

/** Opens the example on the Tokens tab. */
async function openTokens(): Promise<void> {
  await openProjects("example")
  setLayout({ leftTab: "tokens" })
}

/**
 * Enters text in a field, as typing it would. `userEvent.type` changes the field without React's change handler
 * seeing it, so the value is set the way React reads it.
 */
async function enter(field: HTMLElement, text: string): Promise<void> {
  field.focus()
  await fireEvent.input(field, { target: { value: text } })
}

/** Searches the tokens. */
async function search(canvasElement: HTMLElement, text: string): Promise<void> {
  await enter(within(canvasElement).getByPlaceholderText(/^Search \d+ tokens$/), text)
}

/** Opens a token's detail from its row, found by the token's name. */
async function open(canvasElement: HTMLElement, token: string): Promise<HTMLElement> {
  const canvas = within(canvasElement)
  const trigger = canvas.queryByRole("button", { name: token }) ?? canvas.getByText(token).closest("button")
  if (!trigger) throw new Error(`No token named ${token} shows`)
  await userEvent.click(trigger)
  return within(document.body).findByRole("dialog")
}

/** Opens a token's detail and presses Edit, which turns its values into fields. */
async function edit(canvasElement: HTMLElement, token: string): Promise<HTMLElement> {
  const dialog = await open(canvasElement, token)
  await userEvent.click(within(dialog).getByRole("button", { name: "Edit" }))
  return dialog
}

/** Replaces a value in the detail being edited: `default` is the root (light) theme's, otherwise the theme's key. */
async function retype(dialog: HTMLElement, theme: string, value: string): Promise<void> {
  const field = dialog.querySelector<HTMLInputElement>(`input[name="${theme}"]`)
  if (!field) throw new Error(`The editor has no value for ${theme}`)
  await enter(field, value)
}

/**
 * Every token, as the tab opens: the project's colors with a swatch for each theme, then the theme's palette as a
 * grid, then fonts, type, spacing, radii, shadows, blur, motion and the rest, each section counted and each row with
 * its preview. Nothing moves until a motion token is hovered.
 */
export const AllTokens: Story = {
  loaders: [openTokens],
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByText("Project colors")
    await expect(document.getAnimations()).toHaveLength(0)
  }
}

/** The same tokens as tiles, two across, each a larger preview with its name and what it comes to. */
export const Tiles: Story = {
  loaders: [openTokens],
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("radio", { name: "Tiles" }))
    await search(canvasElement, "shadow")
  }
}

/**
 * Copying a token's name: its row's button, or Ctrl+C on the row, copies it as CSS writes it, and the button turns
 * into a check. A palette shade copies on a click, and says so.
 */
export const Copying: Story = {
  loaders: [openTokens],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // Stands in for the clipboard while the checks run, then puts it back so the story copies for real.
    const writes = spyOn(navigator.clipboard, "writeText").mockResolvedValue()
    try {
      await userEvent.click(await canvas.findByRole("button", { name: "Copy --primary" }))
      await expect(writes).toHaveBeenLastCalledWith("--primary")
      await expect(canvas.getByRole("button", { name: "Copy --primary" })).toHaveAttribute("data-copied", "copied")
      canvas.getByText("secondary").closest("button")!.focus()
      await userEvent.keyboard("{Control>}c{/Control}")
      await expect(writes).toHaveBeenLastCalledWith("--secondary")
      // The theme's tokens on their own put the palette at the top.
      await userEvent.click(canvas.getByRole("radio", { name: /^Theme/ }))
      await userEvent.click(await canvas.findByRole("button", { name: "Copy --color-blue-500" }))
      await expect(writes).toHaveBeenLastCalledWith("--color-blue-500")
      await waitFor(() => expect(within(document.body).getAllByText("Copied").length).toBeGreaterThan(0))
    } finally {
      writes.mockRestore()
    }
  }
}

/** The motion tokens: durations, easings and animations, which play while hovered. */
export const Motion: Story = {
  loaders: [openTokens],
  play: async ({ canvasElement }) => {
    await search(canvasElement, "ease")
  }
}

/** Only the project's own variables, such as shadcn's `primary` and `background`. */
export const ProjectTokens: Story = {
  loaders: [openTokens],
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("radio", { name: /^Project/ }))
  }
}

/** Only the styling framework's theme: Tailwind's palette, type scale, spacing and the rest. */
export const ThemeScale: Story = {
  loaders: [openTokens],
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("radio", { name: /^Theme/ }))
  }
}

/** A search for `primary`: the project's color and its foreground. */
export const Searching: Story = {
  loaders: [openTokens],
  play: async ({ canvasElement }) => {
    await search(canvasElement, "primary")
  }
}

/** The radius steps, each previewed as a rounded corner, listed by name rather than size. */
export const Radii: Story = {
  loaders: [openTokens],
  play: async ({ canvasElement }) => {
    await search(canvasElement, "radius")
  }
}

/** The spacing scale: its base, then each step as a bar and in pixels. */
export const Spacing: Story = {
  loaders: [openTokens],
  play: async ({ canvasElement }) => {
    await search(canvasElement, "spacing")
  }
}

/**
 * A search for `text-`: the type scale's font sizes, listed by name rather than size, and the text shadows, whose names
 * match too.
 */
export const TypeScale: Story = {
  loaders: [openTokens],
  play: async ({ canvasElement }) => {
    await search(canvasElement, "text-")
  }
}

/** The shadows, each previewed on a small card. */
export const Shadows: Story = {
  loaders: [openTokens],
  play: async ({ canvasElement }) => {
    await search(canvasElement, "shadow")
  }
}

/** Font weights from thin to black, as each measured kind lists smallest first, rather than by name. */
export const InValueOrder: Story = {
  loaders: [openTokens],
  play: async ({ canvasElement }) => {
    await search(canvasElement, "font-weight")
    const names = [...canvasElement.querySelectorAll("[data-tokens-list] .font-mono")].map((name) => name.textContent)
    await expect(names).toEqual([
      "font-weight-thin",
      "font-weight-extralight",
      "font-weight-light",
      "font-weight-normal",
      "font-weight-medium",
      "font-weight-semibold",
      "font-weight-bold",
      "font-weight-extrabold",
      "font-weight-black"
    ])
  }
}

/**
 * The panel at its narrowest: the open tab shows only its icon, the filters keep their names and drop their counts, and
 * nothing runs out of its box.
 */
export const Narrow: Story = {
  loaders: [openTokens],
  // The width is the app's layout, which outlives the story, so it's put back after.
  beforeEach: () => {
    setLayout({ leftWidth: 232 })
    return () => setLayout({ leftWidth: 256 })
  },
  play: async ({ canvasElement }) => {
    const panel = within(canvasElement)
    await panel.findByText("Project colors")
    const filters = panel.getAllByRole("radio")
    for (const filter of filters) await expect(filter.scrollWidth).toBeLessThanOrEqual(filter.clientWidth + 1)
    const tabs = panel.getByRole("tablist")
    await expect(tabs.scrollWidth).toBeLessThanOrEqual(tabs.clientWidth + 1)
  }
}

/** A search that matches no token. */
export const NothingMatches: Story = {
  loaders: [openTokens],
  play: async ({ canvasElement }) => {
    await search(canvasElement, "qwerty")
    await within(canvasElement).findByText("No tokens match.")
  }
}

/**
 * A token's detail, opened from its row: a large preview of each theme, the name with a copy button and Copy as, its
 * value in each theme, and Edit. Themes are named as the Modes panel names them, Light and Dark, never by the class
 * that switches them on.
 */
export const Detail: Story = {
  loaders: [openTokens],
  play: async ({ canvasElement }) => {
    const dialog = await open(canvasElement, "primary")
    const detail = within(dialog)
    await detail.findByRole("heading", { name: "--primary" })
    await expect(detail.getAllByText("Light").length).toBeGreaterThan(0)
    await expect(detail.getAllByText("Dark").length).toBeGreaterThan(0)
    await expect(dialog).not.toHaveTextContent(".dark")
    await expect(detail.getByRole("button", { name: "Copy --primary" })).toBeInTheDocument()
    await expect(detail.getByRole("button", { name: "Copy as" })).toBeInTheDocument()
  }
}

/** Editing a project color: a value for the root (light) theme and one for the dark theme, each with its swatch. */
export const EditingAColor: Story = {
  loaders: [openTokens],
  play: async ({ canvasElement }) => {
    await edit(canvasElement, "primary")
  }
}

/**
 * Editing one of the palette's shades, which has a single value. In the grid a click copies a shade, so a search lists
 * the shades that match as rows, which open the editor.
 */
export const EditingAPaletteShade: Story = {
  loaders: [openTokens],
  play: async ({ canvasElement }) => {
    await search(canvasElement, "blue-500")
    await edit(canvasElement, "color-blue-500")
  }
}

/** A spacing step, which can't be edited on its own: it follows the scale's base. */
export const SpacingStep: Story = {
  loaders: [openTokens],
  play: async ({ canvasElement }) => {
    await search(canvasElement, "spacing-4")
    const dialog = await open(canvasElement, "spacing-4")
    await within(dialog).findByText("--spacing × 4")
    await expect(within(dialog).getByRole("button", { name: "Edit" })).toBeDisabled()
  }
}

/** A color token given something that isn't a color, refused before it changes anything. */
export const InvalidValue: Story = {
  loaders: [openTokens],
  play: async ({ canvasElement }) => {
    const dialog = await edit(canvasElement, "primary")
    await retype(dialog, "default", "very dark blue")
    await within(dialog).findByText("That isn't a color. Try oklch(0.6 0.2 250) or #2563eb.")
    await expect(within(dialog).getByRole("button", { name: "Apply" })).toBeDisabled()
  }
}

/**
 * A value with a bracket left open, which the browser would close by itself and take: refused, saying what's missing,
 * as is a reference to a token there isn't. Neither changes anything.
 */
export const UnclosedBracket: Story = {
  loaders: [openTokens],
  play: async ({ canvasElement }) => {
    await search(canvasElement, "radius")
    const dialog = await edit(canvasElement, "radius")
    await retype(dialog, "default", "calc(var(--spacing) * 2.6")
    await within(dialog).findByText("A bracket isn't closed. Add ) at the end.")
    await retype(dialog, "default", "calc(var(--radius-huge) * 2)")
    await within(dialog).findByText("There's no token named --radius-huge.")
    await expect(within(dialog).getByRole("button", { name: "Apply" })).toBeDisabled()
  }
}

/**
 * A color token set to another token: a reference is always allowed, whatever the other token holds. The change is
 * unsaved, like any edit, and Undo takes it back.
 */
export const ReferenceToAnotherToken: Story = {
  loaders: [openTokens],
  play: async ({ canvasElement }) => {
    const dialog = await edit(canvasElement, "primary")
    await retype(dialog, "default", "var(--chart-1)")
    await userEvent.click(within(dialog).getByRole("button", { name: "Apply" }))
    await within(dialog).findByText("Applied. Saving writes it to src/index.css.")
    // Apply took away the button that had the keyboard, so Edit has it now.
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Edit" })).toHaveFocus())
    await expect(example().store.getHistory().undoLabel).toBe("Edit --primary")
    await expect(example().store.hasUnsaved()).toBe(true)
    // The detail's Undo takes it back, as Ctrl+Z would.
    await userEvent.click(within(dialog).getByRole("button", { name: "Undo" }))
    await within(dialog).findByText("oklch(0.205 0 0)")
    await expect(example().store.hasUnsaved()).toBe(false)
  }
}

/**
 * Saving a color when the stylesheet can't be written: the panel says which token couldn't be written and why, with a
 * way to try again, marks its row, and the canvas keeps the value, unsaved.
 */
export const SaveFails: Story = {
  loaders: [
    async () => {
      await openTokens()
      service.saveFails = true
    }
  ],
  play: async ({ canvasElement }) => {
    const dialog = await edit(canvasElement, "primary")
    await retype(dialog, "default", "oklch(0.55 0.2 260)")
    await userEvent.click(within(dialog).getByRole("button", { name: "Apply" }))
    await example()
      .store.flush()
      .catch(() => undefined)
    const canvas = within(canvasElement)
    const title = await canvas.findByText(/^Couldn't write --primary to .+\.css$/)
    await expect(title.closest('[role="alert"]')).toHaveTextContent(/EPERM/)
    await waitFor(() => expect(canvas.getAllByText("Not written to the stylesheet").length).toBeGreaterThan(0))
  }
}

/**
 * Tokens a library's `.lib.par` describes: matching variables show its description, and a file that couldn't be read
 * says so at the top.
 */
export const DescribedTokens: Story = {
  loaders: [
    async () => {
      await openTokens()
      example().info.describedTokens = [
        {
          name: "Acme brand",
          manifest: "acme-brand.lib.par",
          tokens: [
            {
              path: "color.primary",
              type: "color",
              description: "Buttons, links and focus rings",
              values: { default: "oklch(0.205 0 0)", dark: "oklch(0.922 0 0)" }
            },
            {
              path: "color.destructive",
              type: "color",
              description: "Errors, and actions that can't be undone",
              values: { default: "oklch(0.577 0.245 27.325)", dark: "oklch(0.704 0.191 22.216)" }
            },
            {
              path: "color.brand-accent",
              type: "color",
              description: "Marketing highlights only",
              values: { default: "#7c3aed", dark: "#a78bfa" }
            },
            {
              path: "radius.panel",
              type: "dimension",
              description: "Corners of panels and dialogs",
              values: { default: "12px" }
            }
          ]
        },
        {
          name: "Charts kit",
          manifest: "node_modules/charts-kit/charts.lib.par",
          tokens: [],
          error: "Expected a $value for color.series.1."
        }
      ]
    }
  ]
}

/**
 * The same described tokens, scrolled to the end, where the ones no variable in the stylesheet matches are listed, as
 * frames can't use them. The list draws only the rows in view, so they're there once it's scrolled.
 */
export const DescribedOnly: Story = {
  loaders: DescribedTokens.loaders,
  play: async ({ canvasElement }) => {
    const list = canvasElement.querySelector("[data-tokens-list]")!
    // Rows measured as they draw can make the list longer, so it's scrolled again until the end shows.
    await waitFor(() => {
      list.scrollTop = list.scrollHeight
      // A page out of sight sends no scroll events of its own, so the list hears of it here.
      list.dispatchEvent(new Event("scroll"))
      return expect(within(canvasElement).getByText("Described only")).toBeInTheDocument()
    })
    await within(canvasElement).findByText("color.brand-accent")
  }
}

/** The project's stylesheet couldn't be read, so its theme may be incomplete; the reason shows at the top. */
export const StylesheetError: Story = {
  loaders: [
    async () => {
      await openTokens()
      const { styles } = example().info
      if (styles) styles.error = "Couldn't compile src/index.css: Cannot apply unknown utility class `bg-brand`"
    }
  ]
}
