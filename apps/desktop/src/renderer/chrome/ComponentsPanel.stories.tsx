import type { DetectionCorrections } from "@parity-app/core"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, fireEvent, userEvent, waitFor, within } from "storybook/test"
import {
  example,
  failingToDraw,
  keepingLinks,
  makingPreviews,
  openProjects,
  ProjectStage
} from "../stories/fixtures.tsx"
import { service } from "../stories/host.ts"
import { answerPreviews } from "../stories/previews.ts"
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

/** A source's heading, by its title, as in `Local components`; clicking it opens or closes the source. */
function source(canvasElement: HTMLElement, title: string): HTMLElement {
  return within(canvasElement).getByRole("button", { name: new RegExp(`^${title} \\d+$`) })
}

/**
 * Every source, as the tab first opens: the component designs, the UI kit and each library open, the rest of the app's
 * components closed, since there are three sources or more.
 */
export const AllSources: Story = { loaders: [openComponents] }

/** Opens the example on the Components tab with its previews, the UI kit's open and the other sources closed. */
async function openWithPreviews(): Promise<void> {
  answerPreviews()
  await openComponents()
  makingPreviews()
}

/** The UI kit's Button row, the first of the example's rows named Button. */
function kitButton(canvasElement: HTMLElement): HTMLElement {
  return within(canvasElement).getAllByRole("button", { name: "Button" })[0]!
}

/** Closes the component designs, which have no pictures yet, so the UI kit's previews come first. */
async function showKit(canvasElement: HTMLElement): Promise<void> {
  await userEvent.click(source(canvasElement, "Local components"))
  await waitFor(() => expect(source(canvasElement, "Local components")).toHaveAttribute("aria-expanded", "false"))
}

/**
 * The List view, the tab's default (PAR-208): each component's picture beside its name, and under the name why it has
 * none, in words: Draws nothing, Needs a provider, Fails to draw and Server only. Badge's code changed, so its last
 * picture shows dimmed with a mark until the new one is made; the rest wait their turn, and one is being drawn.
 */
export const ListView: Story = {
  loaders: [openWithPreviews],
  play: async ({ canvasElement }) => {
    await showKit(canvasElement)
    const view = within(canvasElement).getByRole("group", { name: "Show components as" })
    await expect(within(view).getByRole("button", { name: "List" })).toHaveAttribute("aria-pressed", "true")
    await expect(
      await within(canvasElement).findByRole("button", { name: "AvatarFallback Needs a provider" })
    ).toBeVisible()
    await expect(within(canvasElement).getByRole("button", { name: "AvatarBadge Draws nothing" })).toBeVisible()
    await expect(within(canvasElement).getByRole("button", { name: "CardAction Fails to draw" })).toBeVisible()
  }
}

/** The Grid view: larger pictures two to a row, the words under each name as in the list. Parity remembers the view. */
export const GridView: Story = {
  loaders: [openWithPreviews],
  play: async ({ canvasElement }) => {
    await showKit(canvasElement)
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Grid" }))
    await expect(within(canvasElement).getByRole("button", { name: "Grid" })).toHaveAttribute("aria-pressed", "true")
    await expect(JSON.parse(localStorage.getItem("parity.preferences") ?? "{}")).toMatchObject({
      componentsView: "grid"
    })
  }
}

/** The Names view: names alone, as the tab was before previews, for a long list read by name. */
export const NamesView: Story = {
  loaders: [openWithPreviews],
  play: async ({ canvasElement }) => {
    await showKit(canvasElement)
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Names" }))
    await expect(canvasElement.querySelector("img")).toBeNull()
  }
}

/**
 * Resting on a component opens its card: the large picture, its variants (made when the card first opens; pointing at
 * one shows it large), its file, how often it's used and its stories, and Insert, Open file and Open in Storybook.
 */
export const ComponentCardOpen: Story = {
  loaders: [openWithPreviews],
  play: async ({ canvasElement }) => {
    await showKit(canvasElement)
    await userEvent.hover(kitButton(canvasElement))
    const card = await within(document.body).findByRole("dialog")
    await expect(within(card).getByText("src/components/ui/button.tsx")).toBeInTheDocument()

    for (const name of ["Insert", "Open file", "variant outline"]) {
      await expect(within(card).getByRole("button", { name })).toBeInTheDocument()
    }

    await userEvent.hover(within(card).getByRole("button", { name: "variant destructive" }))
  }
}

/**
 * From the keyboard: the right arrow on a row opens its card and moves focus into it, Tab goes through its variants and
 * buttons, and Escape closes it, giving focus back to the row.
 */
export const ComponentCardFromKeyboard: Story = {
  loaders: [openWithPreviews],
  play: async ({ canvasElement }) => {
    await showKit(canvasElement)
    const row = kitButton(canvasElement)
    row.focus()
    await userEvent.keyboard("{ArrowRight}")
    const card = await within(document.body).findByRole("dialog")
    await waitFor(() => expect(card.contains(document.activeElement)).toBe(true))
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(row).toHaveFocus())
  }
}

/**
 * The project's own components, opened: the UI kit grouped under the file that defines them, as Card and CardHeader
 * are, and the rest of the app under its folders.
 */
export const ProjectComponents: Story = {
  loaders: [openComponents],
  play: async ({ canvasElement }) => {
    await userEvent.click(source(canvasElement, "Local components"))
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
    await userEvent.click(source(canvasElement, "Local components"))
    await userEvent.click(source(canvasElement, "UI kit"))
    await userEvent.click(source(canvasElement, "Pages"))
    await waitFor(() => expect(source(canvasElement, "Pages")).toHaveAttribute("aria-expanded", "true"))
  }
}

/** A library's components, with the sources above it closed. */
export const LibraryComponents: Story = {
  loaders: [openComponents],
  play: async ({ canvasElement }) => {
    await userEvent.click(source(canvasElement, "Local components"))
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
 * listed with the components, its card saying so.
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
    const card = await within(document.body).findByRole("dialog", undefined, { timeout: 3000 })
    await expect(card).toHaveTextContent("Listed by hand")
  }
}

/**
 * Right-clicking a component: View in Storybook and View code, here for Button, which has stories. Its menu on its own,
 * in each state, is in Component menu.
 */
export const ComponentMenu: Story = {
  loaders: [openComponents],
  play: async ({ canvasElement }) => {
    await userEvent.click(source(canvasElement, "Local components"))
    const kit = source(canvasElement, "UI kit").closest("section")

    if (!kit) {
      throw new Error("The UI kit isn't in a section")
    }

    const button = within(kit).getByRole("button", { name: "Button" })
    const box = button.getBoundingClientRect()
    // Where a pointer would be, so the menu opens beside the row.
    await fireEvent.contextMenu(button, { clientX: box.left + 48, clientY: box.top + box.height / 2 })
    await within(document.body).findByRole("menuitem", { name: /View code/ })
  }
}

/**
 * Components failing to draw on the canvas: a warning beside each, and its card says why, here a missing provider,
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
    await userEvent.click(source(canvasElement, "Local components"))
    const [card] = await within(canvasElement).findAllByLabelText("Fails to draw")
    await userEvent.hover(card!.closest("button")!)
    const about = await within(document.body).findByRole("dialog", undefined, { timeout: 3000 })
    await expect(about).toHaveTextContent("Needs a provider, which a decorator can add")
  }
}

/**
 * Clicking a component design with nothing selected: it lands on the canvas, so a new screen named Stat card holds an
 * instance of it, and is selected, here in Layers, where it's listed under Screens (PAR-546).
 */
export const AddingWithNothingSelected: Story = {
  loaders: [openComponents],
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Stat card" }))

    const made = await waitFor(async () => {
      const found = example().store.getEntry(example().selection.get().design ?? "")?.container
      await expect(found).toMatchObject({
        name: "Stat card",
        root: { children: [{ type: "instance", design: "stat-card" }] }
      })

      return found
    })

    await expect(made?.kind).toBeUndefined()
    setLayout({ leftTab: "layers" })
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
    await userEvent.click(source(canvasElement, "Local components"))
  }
}

/** Opening Button's stories, while Storybook starts: a toast says it can take a minute the first time. */
export const OpeningStorybook: Story = {
  loaders: [openComponents],
  beforeEach: keepingLinks,
  play: async ({ canvasElement }) => {
    await userEvent.click(source(canvasElement, "Local components"))
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
        if (library.kind !== "icons") {
          library.stylesImported = false
        }
      }
    }
  ],
  play: async ({ canvasElement }) => {
    await userEvent.click(source(canvasElement, "Local components"))
  }
}

/** A project with no `.par` file yet, so no component designs: only its own components and its libraries'. */
export const BlankProject: Story = {
  parameters: { blank: true },
  loaders: [
    async () => {
      await openProjects("empty")
      setLayout({ leftTab: "components" })
    }
  ]
}
