import type { DetectionCorrections } from "@parity-app/core"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, fireEvent, userEvent, waitFor, within } from "storybook/test"
import { example, failingToDraw, keepingLinks, openProjects, ProjectStage } from "../stories/fixtures.tsx"
import { service } from "../stories/host.ts"
import { ComponentsPanel } from "./AssetsPanel.tsx"
import { setLayout } from "./layout.ts"
import { LeftPanel } from "./LeftPanel.tsx"

/**
 * The Components tab: what can be dragged into designs, by source. The project's component designs, then its own
 * components (its UI kit, the rest of the app, and its pages), then each library's. Shown in the left panel, as the app
 * shows it.
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
 * Every source, as the tab first opens: the component designs, the UI kit and each library open, the rest of the app's
 * components closed, since there are three sources or more.
 */
export const AllSources: Story = { loaders: [openComponents] }

/**
 * The project's own components, opened: the UI kit grouped under the file that defines them, as Card and CardHeader
 * are, and the rest of the app under its folders.
 */
export const ProjectComponents: Story = {
  loaders: [openComponents],
  play: async ({ canvasElement }) => {
    await userEvent.click(source(canvasElement, "Component designs"))
    await userEvent.click(source(canvasElement, "shadcn-vite"))
    await waitFor(() => expect(source(canvasElement, "shadcn-vite")).toHaveAttribute("aria-expanded", "true"))
  }
}

/**
 * A Next.js app's pages, under their routes and apart from its other components, until the routes lens can name them.
 * The example has none, so this story gives it four.
 */
export const Pages: Story = {
  loaders: [
    async () => {
      await openComponents()
      const { info } = example()
      // A new list, so the example's own stays as it is for the next story.
      info.sources = {
        ...info.sources,
        HomePage: { path: "src/app/page.tsx", export: "default", lazy: true },
        OrdersPage: { path: "src/app/(shop)/orders/page.tsx", export: "default", lazy: true },
        OrderPage: { path: "src/app/(shop)/orders/[id]/page.tsx", export: "default", lazy: true },
        "(shop)/ErrorPage": { path: "src/app/(shop)/error.tsx", export: "default", lazy: true }
      }
    }
  ],
  play: async ({ canvasElement }) => {
    await userEvent.click(source(canvasElement, "Component designs"))
    await userEvent.click(source(canvasElement, "UI kit"))
    await userEvent.click(source(canvasElement, "Pages"))
    await waitFor(() => expect(source(canvasElement, "Pages")).toHaveAttribute("aria-expanded", "true"))
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

/** Exports of the example's that the type checker left out, with the reasons it gives. */
const leftOut = [
  {
    name: "ThemeContext",
    path: "src/components/theme-provider.tsx",
    export: "ThemeContext",
    reason: "a context, which passes a value down rather than drawing anything"
  },
  {
    name: "ThemeScript",
    path: "src/components/theme-provider.tsx",
    export: "ThemeScript",
    reason: "returns any, so whether React can render it isn't known",
    undecided: true as const
  }
]

/** Opens the example on the Components tab, with exports the type checker left out. */
async function openWithLeftOut(): Promise<void> {
  await openComponents()
  example().info.leftOut = leftOut
}

/** Corrects the component list in the example's main project file, as the panel's menu and buttons do. */
function correcting(detection: DetectionCorrections): void {
  const { store } = example()
  const main = store.getDocuments().find((entry) => entry.path === store.mainPath)!.document
  store.applyDocuments("Correct the component list", [{ path: store.mainPath, document: { ...main, detection } }])
}

/**
 * A search that matches exports which aren't components: they're listed apart, with why the type checker left them
 * out, and each can be listed by hand.
 */
export const NotListed: Story = {
  loaders: [openWithLeftOut],
  play: async ({ canvasElement }) => {
    await enter(within(canvasElement).getByRole("textbox", { name: "Search components" }), "theme")
    await within(canvasElement).findByText("Not listed")
  }
}

/**
 * An export listed by hand: the main project file keeps it under `detection`, unsaved until the project is, and it's
 * listed with the components, its tooltip saying so.
 */
export const ListedByHand: Story = {
  loaders: [
    async () => {
      await openWithLeftOut()
      const ref = { path: "src/components/theme-provider.tsx", export: "ThemeScript" }
      correcting({ include: [ref] })
      // As the service lists it once it hears about the correction.
      const { info } = example()
      info.sources = { ...info.sources, ThemeScript: { ...ref, lazy: true, included: true } }
    }
  ],
  play: async ({ canvasElement }) => {
    await enter(within(canvasElement).getByRole("textbox", { name: "Search components" }), "theme")
    await userEvent.hover(await within(canvasElement).findByRole("button", { name: "ThemeScript" }))
    const hint = await within(document.body).findByRole("tooltip", undefined, { timeout: 3000 })
    await expect(hint).toHaveTextContent("ThemeScript, listed by hand")
  }
}

/** Right-clicking one of the project's own components offers to take it off the list. */
export const NotAComponent: Story = {
  loaders: [openComponents],
  play: async ({ canvasElement }) => {
    await userEvent.click(source(canvasElement, "Component designs"))
    const kit = source(canvasElement, "UI kit").closest("section")!
    const badge = within(kit as HTMLElement).getByRole("button", { name: "Badge" })
    const box = badge.getBoundingClientRect()
    // Where a pointer would be, so the menu opens beside the row.
    await fireEvent.contextMenu(badge, { clientX: box.left + 48, clientY: box.top + box.height / 2 })
    await within(document.body).findByRole("menuitem", { name: "Not a component" })
  }
}

/** A component taken off the list: it's gone from its source, and a search finds it under Not listed to list again. */
export const TakenOffTheList: Story = {
  loaders: [
    async () => {
      await openComponents()
      correcting({ exclude: [{ path: "src/components/ui/badge.tsx", export: "Badge" }] })
      // As the service lists them once it hears about the correction.
      const { info } = example()
      const { Badge: _, ...rest } = info.sources
      info.sources = rest
    }
  ],
  play: async ({ canvasElement }) => {
    await enter(within(canvasElement).getByRole("textbox", { name: "Search components" }), "badge")
    await within(canvasElement).findByRole("button", { name: "List it again" })
  }
}

/**
 * Components failing to draw on the canvas: a warning beside each, and its tooltip says why, here a missing provider,
 * which a decorator adds.
 */
export const FailingToDraw: Story = {
  loaders: [
    async () => {
      await openComponents()
      failingToDraw({
        Card: "useSidebar must be used within a SidebarProvider.",
        Table: "Cannot read properties of undefined (reading 'map')"
      })
    }
  ],
  play: async ({ canvasElement }) => {
    await userEvent.click(source(canvasElement, "Component designs"))
    const [card] = await within(canvasElement).findAllByLabelText("Fails to draw")
    await userEvent.hover(card!.closest("button")!)
    const hint = await within(document.body).findByRole("tooltip", undefined, { timeout: 3000 })
    await expect(hint).toHaveTextContent("Needs a provider, which a decorator can add")
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
  }
}

/** Opening Button's stories, while Storybook starts: a toast says it can take a minute the first time. */
export const OpeningStorybook: Story = {
  loaders: [openComponents],
  beforeEach: keepingLinks,
  play: async ({ canvasElement }) => {
    await userEvent.click(source(canvasElement, "Component designs"))
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
