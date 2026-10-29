import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, fireEvent, userEvent, waitFor, within } from "storybook/test"
import { example, openProjects, ProjectStage } from "../stories/fixtures.tsx"
import { service } from "../stories/host.ts"
import { setLayout } from "./layout.ts"
import { LeftPanel } from "./LeftPanel.tsx"
import { TokensPanel } from "./TokensPanel.tsx"

/**
 * The Tokens tab: the project's own variables and its styling framework's theme, by kind. Any value can be edited,
 * and the change is written to the project's stylesheet. Shown in the left panel, as the app shows it.
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

/** Opens a token's editor from its swatch in the palette, or from its row, found by the token's name. */
async function edit(canvasElement: HTMLElement, token: string): Promise<HTMLElement> {
  const canvas = within(canvasElement)
  const trigger = canvas.queryByRole("button", { name: token }) ?? canvas.getByText(token).closest("button")
  if (!trigger) throw new Error(`No token named ${token} shows`)
  await userEvent.click(trigger)
  return within(document.body).findByRole("dialog")
}

/** Replaces a value in the open editor: `default` is the root (light) theme's, otherwise the theme's class. */
async function retype(dialog: HTMLElement, theme: string, value: string): Promise<void> {
  const field = dialog.querySelector<HTMLInputElement>(`input[name="${theme}"]`)
  if (!field) throw new Error(`The editor has no value for ${theme}`)
  await enter(field, value)
}

/**
 * Every token, as the tab opens: the project's colors with a swatch for each theme, then the theme's palette as a
 * grid, then type, spacing, radii, shadows and the rest, each section counted.
 */
export const AllTokens: Story = { loaders: [openTokens] }

/** Only the project's own variables, such as shadcn's `primary` and `background`. */
export const ProjectTokens: Story = {
  loaders: [openTokens],
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByText(/^Project \d+$/))
  }
}

/** Only the styling framework's theme: Tailwind's palette, type scale, spacing and the rest. */
export const ThemeScale: Story = {
  loaders: [openTokens],
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByText(/^Theme \d+$/))
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

/** A search that matches no token. */
export const NothingMatches: Story = {
  loaders: [openTokens],
  play: async ({ canvasElement }) => {
    await search(canvasElement, "qwerty")
    await within(canvasElement).findByText("No tokens match.")
  }
}

/** Editing a project color: a value for the root (light) theme and one for the dark theme, each with its swatch. */
export const EditingAColor: Story = {
  loaders: [openTokens],
  play: async ({ canvasElement }) => {
    await edit(canvasElement, "primary")
  }
}

/** Editing one of the palette's shades, which has a single value. */
export const EditingAPaletteShade: Story = {
  loaders: [openTokens],
  play: async ({ canvasElement }) => {
    await edit(canvasElement, "color-blue-500")
  }
}

/** A spacing step, which can't be edited on its own: it follows the scale's base. */
export const SpacingStep: Story = {
  loaders: [openTokens],
  play: async ({ canvasElement }) => {
    await search(canvasElement, "spacing-4")
    await edit(canvasElement, "spacing-4")
  }
}

/** A color token given something that isn't a color, refused before anything is saved. */
export const InvalidValue: Story = {
  loaders: [openTokens],
  play: async ({ canvasElement }) => {
    const dialog = await edit(canvasElement, "primary")
    await retype(dialog, "default", "very dark blue")
    await userEvent.click(within(dialog).getByRole("button", { name: "Save to stylesheet" }))
    await within(dialog).findByText(/isn't a valid color/)
  }
}

/** A color token set to another token: a reference is always allowed, whatever the other token holds. */
export const ReferenceToAnotherToken: Story = {
  loaders: [openTokens],
  play: async ({ canvasElement }) => {
    const dialog = await edit(canvasElement, "primary")
    await retype(dialog, "default", "var(--chart-1)")
    await userEvent.click(within(dialog).getByRole("button", { name: "Save to stylesheet" }))
    await waitFor(() => expect(dialog).toHaveAttribute("data-state", "closed"))
  }
}

/**
 * Saving a color when the stylesheet can't be written. The editor closes on Save, so the error only shows when it is
 * opened again, and the swatch keeps the value that wasn't saved.
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
    await userEvent.click(within(dialog).getByRole("button", { name: "Save to stylesheet" }))
    const reopened = await edit(canvasElement, "primary")
    await within(reopened).findByText(/EPERM/)
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

/** The same described tokens, scrolled to the ones no variable in the stylesheet matches, which frames can't use. */
export const DescribedOnly: Story = {
  loaders: DescribedTokens.loaders,
  play: async ({ canvasElement }) => {
    const heading = await within(canvasElement).findByText("Described only")
    heading.scrollIntoView({ block: "start" })
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
