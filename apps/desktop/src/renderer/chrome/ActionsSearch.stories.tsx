import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, userEvent, waitFor, within } from "storybook/test"
import { design, example, openProjects } from "../stories/fixtures.tsx"
import { actions } from "./actions.ts"
import { ActionsSearch } from "./ActionsSearch.tsx"
import { openDialog } from "./app-dialogs.ts"
import { dialogStories, enter, exampleOpen, openOverExample } from "./chrome-fixtures.tsx"
import { formatKeys } from "./keys.ts"

/**
 * Search, from Help > Search actions or Ctrl+K, over the window: every command, and anything in the project (PAR-180).
 */
const meta = {
  title: "Parity/Chrome/Search",
  component: ActionsSearch,
  ...dialogStories
} satisfies Meta<typeof ActionsSearch>

export default meta

type Story = StoryObj<typeof meta>

/** Opens Search over the example and types `text` into it. */
async function search(text: string): Promise<HTMLElement> {
  const dialog = await openOverExample("actions", "Search")
  await enter(within(dialog).getByRole("combobox"), text)

  return dialog
}

/** Each option's text: its name, then its keys. */
const options = (dialog: HTMLElement) =>
  within(dialog)
    .getAllByRole("option")
    .map((option) => option.textContent)

/** The rows under each heading, as the headings and the rows' text. */
const groups = (dialog: HTMLElement) =>
  [...dialog.querySelectorAll<HTMLElement>("[cmdk-group]")].map((group) => ({
    heading: group.querySelector("[cmdk-group-heading]")?.textContent,
    rows: within(group)
      .getAllByRole("option")
      .map((option) => option.textContent)
  }))

/** Searched for "zoom", with nothing selected, so zooming to the selection is unavailable. */
export const Zoom: Story = {
  loaders: [exampleOpen],
  play: async () => {
    await search("zoom")
  }
}

/**
 * Searched for "new": New screen and New component, with their keys, in the Object group, then New tab in File. It
 * matches the start of words, so nothing with n, e and w scattered through its name comes up (PAR-546).
 */
export const New: Story = {
  loaders: [exampleOpen],
  play: async () => {
    const dialog = await search("new")
    await waitFor(() =>
      expect(options(dialog)).toEqual([
        `New screen${formatKeys("Ctrl Alt N")}`,
        `New component${formatKeys("Ctrl Alt Shift N")}`,
        `New tab${formatKeys("Ctrl T")}`
      ])
    )
  }
}

/**
 * With a design locked: Lock or unlock is named Unlock, as the menus name it, and searching "lock" finds it by the
 * keymap's name (PAR-971).
 */
export const NamesWhatItDoes: Story = {
  loaders: [
    async () => {
      await openProjects("example")
      example().selection.set({ design: design("Sign in") })
      void actions.lock.run("menu")
    }
  ],
  play: async () => {
    const dialog = await search("lock")
    await waitFor(() => expect(options(dialog)).toContain(`Unlock${formatKeys("Ctrl Shift L")}`))
  }
}

/**
 * Searched for "card": the designs named for it, then their layers, each with its design, the components to insert,
 * with where each is from, and the tokens. Picking a design selects it and zooms to it, a layer selects it, a component
 * inserts it at the selection, and a token opens Tokens searched for it.
 */
export const Everything: Story = {
  loaders: [exampleOpen],
  play: async () => {
    const dialog = await search("card")
    await waitFor(() =>
      expect(groups(dialog).map((group) => group.heading)).toEqual(["Designs", "Layers", "Components", "Tokens"])
    )
    await expect(groups(dialog)[0]!.rows).toEqual(["Plan card", "Stat card", "Project card"])
  }
}

/**
 * What was picked lately leads the list, latest first: after zooming to fit and picking the Plan card design, Search
 * opens with those two under Recent, and doesn't list them again below.
 */
export const Recent: Story = {
  loaders: [exampleOpen],
  play: async () => {
    for (const [text, pick] of [
      ["fit", "Zoom to fit"],
      ["plan", "Plan card"]
    ] as const) {
      const dialog = await search(text)
      // The first row of that name: the design rather than the component that inserts it.
      const [row] = await within(dialog).findAllByRole("option", { name: new RegExp(`^${pick}`) })
      await userEvent.click(row!)
      await waitFor(() => expect(within(document.body).queryByRole("dialog")).not.toBeInTheDocument())
    }

    await expect(example().selection.get().design).toBe(design("Plan card"))
    openDialog("actions")
    const dialog = await within(document.body).findByRole("dialog", { name: "Search" })
    await waitFor(() =>
      expect(groups(dialog)[0]).toEqual({
        heading: "Recent",
        rows: ["Plan card", `Zoom to fit${formatKeys("Shift 1")}`]
      })
    )
  }
}
