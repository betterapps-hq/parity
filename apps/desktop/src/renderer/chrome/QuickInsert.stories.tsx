import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, userEvent, within } from "storybook/test"
import { AppWindow } from "../App.tsx"
import { layersSelection } from "../selection.ts"
import {
  clearNotifications,
  design,
  example,
  frameDesigns,
  holdToast,
  node,
  openProjects,
  typeInto
} from "../stories/fixtures.tsx"
import { Window } from "./chrome-fixtures.tsx"
import { QuickInsert } from "./QuickInsert.tsx"

/**
 * The insert picker, opened with `/` (or Shift+I, or Edit > Insert) on the canvas: basic layers, component designs,
 * the project's and its libraries' components, and icons, searchable from the keyboard.
 */
const meta = {
  title: "Parity/Chrome/Quick insert",
  component: QuickInsert,
  render: () => <AppWindow />,
  decorators: [Window],
  loaders: [clearNotifications]
} satisfies Meta<typeof QuickInsert>

export default meta
type Story = StoryObj<typeof meta>

const body = () => within(document.body)

/** The example with Pricing's hero layout selected, where an insert would go. */
const heroSelected = async () => {
  await openProjects("example")
  example().selection.set(layersSelection(design("Pricing"), [node("Pricing", "Hero")]))
}

/** Frames Pricing and presses `/` on the canvas, then types a search if given. */
const openWith = (query?: string) => async () => {
  await frameDesigns("Pricing")
  await userEvent.keyboard("/")
  const input = await body().findByPlaceholderText("Insert a layer, component or icon")
  if (query) await typeInto(input as HTMLInputElement, query)
}

/**
 * Just opened: basic layers first, then the component designs, then the project's own components, then its libraries',
 * each under its source, and, when the project has an icon library, a hint that its icons can be searched too. Internal
 * parts, providers and the app's plumbing are left out until they're searched for by name (PAR-178).
 */
export const Open: Story = { loaders: [heroSelected], play: openWith() }

/**
 * Searching for "card": names that match first, the closest first, then names that only the file or folder they're
 * in matches. Each row says where it's from.
 */
export const Searching: Story = { loaders: [heroSelected], play: openWith("card") }

/**
 * Searching for "badge": Badge is in the UI kit and in Shadcn Nova, so it's one row with both. Enter inserts the
 * project's own, and clicking Shadcn Nova inserts Nova's; "nova badge" picks Nova's too.
 */
export const FoundInTwoPlaces: Story = {
  loaders: [heroSelected],
  play: async () => {
    await openWith("badge")()
    await expect(await body().findByRole("button", { name: "Insert Badge from Shadcn Nova" })).toBeInTheDocument()
  }
}

/** Searching for "theme" finds ThemeProvider, which the picker leaves out until it's searched for by name. */
export const SearchedByName: Story = { loaders: [heroSelected], play: openWith("theme") }

/** Searching for "arrow": matching icons from the project's icon library, up to 48 of them. */
export const SearchingIcons: Story = { loaders: [heroSelected], play: openWith("arrow") }

/** Searching for something nothing matches. */
export const NoResults: Story = {
  loaders: [heroSelected],
  play: async () => {
    await openWith("zebra crossing")()
    await expect(await body().findByText("Nothing matches.")).toBeInTheDocument()
  }
}

/**
 * Picking a component with nothing selected: the picker closes and a notification says to select where it should go.
 */
export const NothingToInsertInto: Story = {
  loaders: [() => openProjects("example")],
  play: async () => {
    await openWith("badge")()
    await userEvent.keyboard("{Enter}")
    await holdToast("Select a design or a layout to insert into")
  }
}
