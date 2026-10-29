import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, fireEvent, userEvent, waitFor, within } from "storybook/test"
import { example, keepingLinks, openProjects, ProjectStage } from "../stories/fixtures.tsx"
import { service } from "../stories/host.ts"
import { ComponentsPanel } from "./AssetsPanel.tsx"
import { setLayout } from "./layout.ts"
import { LeftPanel } from "./LeftPanel.tsx"

/**
 * The Components tab: what can be dragged into designs, by source. The project's component designs, then its own
 * components, then each library's. Shown in the left panel, as the app shows it.
 */
const meta = {
  title: "Parity/Left panel/Components",
  component: ComponentsPanel,
  render: () => <LeftPanel />,
  decorators: [
    (Story, { parameters }) =>
      parameters.blank ? (
        <ProjectStage project="empty">
          <Story />
        </ProjectStage>
      ) : (
        <ProjectStage>
          <Story />
        </ProjectStage>
      )
  ]
} satisfies Meta<typeof ComponentsPanel>

export default meta
type Story = StoryObj<typeof meta>

/** Long enough that a request to the stand-in service never answers while the story is open. */
const forever = 24 * 60 * 60 * 1000

/** Opens the example on the Components tab. */
async function openComponents(): Promise<void> {
  await openProjects("example")
  setLayout({ leftTab: "components" })
}

/**
 * Enters text in a field, as typing it would. `userEvent.type` changes the field without React's change handler
 * seeing it, so the value is set the way React reads it.
 */
async function enter(field: HTMLElement, text: string): Promise<void> {
  field.focus()
  await fireEvent.input(field, { target: { value: text } })
}

/** A source's heading, by its title, as in `Component designs`; clicking it opens or closes the source. */
function source(canvasElement: HTMLElement, title: string): HTMLElement {
  return within(canvasElement).getByRole("button", { name: new RegExp(`^${title} \\d+$`) })
}

/**
 * Every source, as the tab first opens: the component designs and each library open, the project's own components
 * closed, since there are three sources or more.
 */
export const AllSources: Story = { loaders: [openComponents] }

/** The project's own components, opened, grouped under the file that defines them, as Card and CardHeader are. */
export const ProjectComponents: Story = {
  loaders: [openComponents],
  play: async ({ canvasElement }) => {
    await userEvent.click(source(canvasElement, "Component designs"))
    await userEvent.click(source(canvasElement, "shadcn-vite"))
    await waitFor(() => expect(source(canvasElement, "shadcn-vite")).toHaveAttribute("aria-expanded", "true"))
  }
}

/** A library's components, with the sources above it closed. */
export const LibraryComponents: Story = {
  loaders: [openComponents],
  play: async ({ canvasElement }) => {
    await userEvent.click(source(canvasElement, "Component designs"))
  }
}

/** A search: every source opens to what matches, by component name or by the file that defines it. */
export const Searching: Story = {
  loaders: [openComponents],
  play: async ({ canvasElement }) => {
    await enter(within(canvasElement).getByRole("textbox", { name: "Search components" }), "card")
  }
}

/** A search that matches nothing. */
export const NothingMatches: Story = {
  loaders: [openComponents],
  play: async ({ canvasElement }) => {
    await enter(within(canvasElement).getByRole("textbox", { name: "Search components" }), "carousel slide")
    await within(canvasElement).findByText("Nothing matches.")
  }
}

/**
 * Clicking a component with nothing selected: a toast says to select where it goes first, or to drag it there. It is
 * pointed at, so it stays rather than fading after a few seconds.
 */
export const AddingWithNothingSelected: Story = {
  loaders: [openComponents],
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Stat card" }))
    const toast = await within(document.body).findByText("Select a design or layer first, or drag it onto a design")
    await userEvent.hover(toast)
  }
}

/**
 * A component with stories in the project's Storybook, Button: a book button beside it opens them. It shows only while
 * the row is pointed at, which a story can't do, so it is shown here as if it were.
 */
export const StorybookLink: Story = {
  loaders: [openComponents],
  decorators: [
    (Story) => (
      <>
        <style>{'[aria-label="Open Button in Storybook"] { opacity: 1 }'}</style>
        <Story />
      </>
    )
  ],
  play: async ({ canvasElement }) => {
    await userEvent.click(source(canvasElement, "Component designs"))
    await userEvent.click(source(canvasElement, "shadcn-vite"))
  }
}

/** Opening Button's stories, while Storybook starts: a toast says it can take a minute the first time. */
export const OpeningStorybook: Story = {
  loaders: [openComponents],
  beforeEach: keepingLinks,
  play: async ({ canvasElement }) => {
    await userEvent.click(source(canvasElement, "Component designs"))
    await userEvent.click(source(canvasElement, "shadcn-vite"))
    service.latency = forever
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Open Button in Storybook" }))
    await within(document.body).findByText("Opening Storybook…")
  }
}

/**
 * Adding a library: the catalog lists the component libraries that can be installed, with the ones the project has
 * already marked as added.
 */
export const AddingALibrary: Story = {
  loaders: [openComponents],
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Add a library" }))
    await within(document.body).findByText("Radix Themes")
  }
}

/** The library catalog while the service lists it. */
export const CatalogLoading: Story = {
  loaders: [openComponents],
  beforeEach: keepingLinks,
  play: async ({ canvasElement }) => {
    service.latency = forever
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Add a library" }))
    await within(document.body).findByRole("dialog")
  }
}

/** A library installing with the project's package manager, after Add was clicked in the catalog. */
export const InstallingALibrary: Story = {
  loaders: [openComponents],
  beforeEach: keepingLinks,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Add a library" }))
    const radix = await within(document.body).findByText("Radix Themes")
    service.latency = forever
    await userEvent.click(within(radix.closest("li")!).getByRole("button", { name: "Add" }))
    await waitFor(() => expect(within(document.body).getByText("Installing Radix Themes…")).toBeVisible())
  }
}

/**
 * A library whose styles the project's stylesheet doesn't import yet, so its components would render unstyled: a note
 * under its heading offers to import them. The component designs are closed, to bring it into view.
 */
export const LibraryStylesMissing: Story = {
  loaders: [
    async () => {
      await openComponents()
      for (const library of example().info.libraries) {
        if (library.kind !== "icons") library.stylesImported = false
      }
    }
  ],
  play: async ({ canvasElement }) => {
    await userEvent.click(source(canvasElement, "Component designs"))
  }
}

/** A project with no designs yet: only its own components and its libraries'. */
export const BlankProject: Story = {
  parameters: { blank: true },
  loaders: [
    async () => {
      await openProjects("empty")
      setLayout({ leftTab: "components" })
    }
  ]
}
