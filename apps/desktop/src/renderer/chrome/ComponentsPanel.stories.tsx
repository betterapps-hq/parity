import type { DetectionCorrections, ProjectRoute } from "@parity-app/core"
import { applyDocuments } from "@parity-app/multiplayer"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, fireEvent, userEvent, waitFor, within } from "storybook/test"
import {
  example,
  failingToDraw,
  findTooltip,
  holdToast,
  keepingLinks,
  makingPreviews,
  never,
  openProject,
  ProjectStage,
  tooltip
} from "../stories/fixtures.tsx"
import { answering, answerNext, askWindow, service } from "../stories/host.ts"
import { storyCatalog } from "../stories/libraries.ts"
import { answerPreviews } from "../stories/previews.ts"
import { ComponentsPanel } from "./AssetsPanel.tsx"
import { slowly } from "./inspector-stories.tsx"
import { setLayout } from "./layout.ts"
import { LeftPanel } from "./LeftPanel.tsx"
import { getPreferences } from "./preferences.ts"

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
  await openProject("example")
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
 * Every source, as the tab first opens: the component designs open, each library closed, and the rest of
 * the app's components closed too, since there are three sources or more.
 */
export const AllSources: Story = {
  loaders: [openComponents],
  play: async ({ canvasElement }) => {
    await expect(source(canvasElement, "Shadcn Nova")).toHaveAttribute("aria-expanded", "false")
    await expect(source(canvasElement, "Local components")).toHaveAttribute("aria-expanded", "true")
  }
}

/**
 * Only the rows in view are drawn, ten either side besides, however many components the sources hold (PAR-1202).
 * Scrolling to the end draws the last rows, and the first are gone.
 */
export const OnlyRowsInView: Story = {
  loaders: [openComponents],
  play: async ({ canvasElement }) => {
    await userEvent.click(source(canvasElement, "Shadcn Nova"))
    const headings = within(canvasElement).getAllByRole("button", { name: /\d+$/, expanded: true })
    const listed = headings.reduce((total, heading) => total + Number(/(\d+)$/.exec(heading.textContent ?? "")![1]), 0)
    const rows = () => canvasElement.querySelectorAll("[data-line^='items:']")

    await waitFor(() => expect(rows().length).toBeGreaterThan(0))
    await expect(rows().length).toBeLessThan(listed)

    const first = rows()[0]!.getAttribute("data-line")
    const list = rows()[0]!.closest<HTMLElement>(".overflow-y-auto")!
    list.scrollTop = list.scrollHeight
    await waitFor(() => expect(canvasElement.querySelector(`[data-line="${first}"]`)).toBeNull())
    await expect(rows().length).toBeLessThan(listed)
  }
}

/** Opens the example on the Components tab with its previews, the UI kit's open and the other sources closed. */
async function openWithPreviews(): Promise<void> {
  answerPreviews()
  await openComponents()
  makingPreviews()
}

/**
 * Scrolls the open sources down until `find` finds what it's after, then centers it, since the list draws only the rows
 * in view (PAR-1202). From the bottom it starts again at the top, in case it wasn't there yet.
 */
async function scrollUntil(canvasElement: HTMLElement, find: () => HTMLElement | undefined): Promise<HTMLElement> {
  const list = canvasElement.querySelector("[data-line]")!.closest<HTMLElement>(".overflow-y-auto")!

  for (let step = 0; step < 200; step++) {
    const found = find()

    if (found) {
      found.scrollIntoView({ block: "center" })

      return found
    }

    const before = list.scrollTop
    list.scrollTop += 300

    if (list.scrollTop === before) {
      list.scrollTop = 0
    }

    await new Promise((resolve) => requestAnimationFrame(resolve))
  }

  throw new Error("The Components panel never drew what the story looks for")
}

/** A row by its name, the first of that name, scrolled to. */
function scrollToRow(canvasElement: HTMLElement, name: string): Promise<HTMLElement> {
  return scrollUntil(canvasElement, () => within(canvasElement).queryAllByRole("button", { name })[0])
}

/** The UI kit's Button row, scrolled to. */
function kitButton(canvasElement: HTMLElement): Promise<HTMLElement> {
  return scrollToRow(canvasElement, "Button")
}

/**
 * Closes the component designs, which have no pictures yet, and opens the UI kit, the example's Shadcn Nova, so its
 * previews come first.
 */
async function showKit(canvasElement: HTMLElement): Promise<void> {
  await userEvent.click(source(canvasElement, "Local components"))
  await waitFor(() => expect(source(canvasElement, "Local components")).toHaveAttribute("aria-expanded", "false"))
  await userEvent.click(source(canvasElement, "Shadcn Nova"))
  await waitFor(() => expect(source(canvasElement, "Shadcn Nova")).toHaveAttribute("aria-expanded", "true"))
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
    await expect(await scrollToRow(canvasElement, "AvatarFallback Needs a provider")).toBeVisible()
    await expect(within(canvasElement).getByRole("button", { name: "AvatarBadge Draws nothing" })).toBeVisible()
    await expect(await scrollToRow(canvasElement, "CardAction Fails to draw")).toBeVisible()
  }
}

/** The Grid view: larger pictures two to a row, the words under each name as in the list. Parity remembers the view. */
export const GridView: Story = {
  loaders: [openWithPreviews],
  play: async ({ canvasElement }) => {
    await showKit(canvasElement)
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Grid" }))
    await expect(within(canvasElement).getByRole("button", { name: "Grid" })).toHaveAttribute("aria-pressed", "true")
    await expect(getPreferences().componentsView).toBe("grid")
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
    await userEvent.hover(await kitButton(canvasElement))
    const card = await within(document.body).findByRole("dialog")
    await expect(within(card).getByText("@buildkitgg/shadcn-baseui-nova")).toBeInTheDocument()

    for (const name of ["Insert", "Open file", "variant outline"]) {
      await expect(within(card).getByRole("button", { name })).toBeInTheDocument()
    }

    await userEvent.hover(within(card).getByRole("button", { name: "variant destructive" }))
  }
}

/**
 * From the keyboard: the right arrow on a row opens its card and moves focus into it, to the first variant, whose name
 * shows in a tooltip. Tab goes through its variants and buttons. Escape closes the tooltip, then the card, giving focus
 * back to the row.
 */
export const ComponentCardFromKeyboard: Story = {
  loaders: [openWithPreviews],
  play: async ({ canvasElement }) => {
    await showKit(canvasElement)
    const row = await kitButton(canvasElement)
    row.focus()
    await userEvent.keyboard("{ArrowRight}")
    const card = await within(document.body).findByRole("dialog")
    await waitFor(() => expect(card.contains(document.activeElement)).toBe(true))
    await findTooltip()
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(tooltip()).toBeNull())
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

/** A page of a Next.js app, at its URL, with the files its router draws in its place, as its router extension gives it. */
function nextPage(path: string, file: string, stateFiles?: ProjectRoute["stateFiles"]): ProjectRoute {
  const segments = path
    .split("/")
    .filter((part) => part !== "")
    .map((part): ProjectRoute["segments"][number] =>
      part.startsWith("[") ? { type: "param", name: part.slice(1, -1) } : { type: "static", value: part }
    )

  const page: ProjectRoute = { id: path, kind: "page", segments, path, file, index: false, loads: false, guards: false }

  return stateFiles ? { ...page, stateFiles } : page
}

/**
 * A Next.js app's pages, under their routes and apart from its other components: a component is a page when its
 * router's routes name its file (PAR-1163). The example has none, so this story gives it four, and their routes.
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
      info.routes = [
        nextPage("/", "src/app/page.tsx"),
        nextPage("/orders", "src/app/(shop)/orders/page.tsx", { error: "src/app/(shop)/error.tsx" }),
        nextPage("/orders/[id]", "src/app/(shop)/orders/[id]/page.tsx")
      ]
    }
  ],
  play: async ({ canvasElement }) => {
    await userEvent.click(source(canvasElement, "Local components"))
    await userEvent.click(source(canvasElement, "Pages"))
    await waitFor(() => expect(source(canvasElement, "Pages")).toHaveAttribute("aria-expanded", "true"))
  }
}

/** A library's components, opened, with the sources above it closed. */
export const LibraryComponents: Story = {
  loaders: [openComponents],
  play: async ({ canvasElement }) => {
    await userEvent.click(source(canvasElement, "Local components"))
    await userEvent.click(source(canvasElement, "Shadcn Nova"))
    await waitFor(() => expect(source(canvasElement, "Shadcn Nova")).toHaveAttribute("aria-expanded", "true"))
  }
}

/** A search: every source opens to what matches, by component name or by the file that defines it. */
export const Searching: Story = {
  loaders: [openComponents],
  play: async ({ canvasElement }) => {
    await enter(within(canvasElement).getByRole("textbox", { name: "Search components" }), "card")
  }
}

/**
 * A source closed during one search is open again in the next: clearing a search forgets what was opened or closed
 * while it showed, as starting one does.
 */
export const SearchingAgain: Story = {
  loaders: [openComponents],
  play: async ({ canvasElement }) => {
    const field = within(canvasElement).getByRole("textbox", { name: "Search components" })
    await enter(field, "card")
    await userEvent.click(source(canvasElement, "Shadcn Nova"))
    await waitFor(() => expect(source(canvasElement, "Shadcn Nova")).toHaveAttribute("aria-expanded", "false"))
    await enter(field, "")
    await enter(field, "card")
    await waitFor(() => expect(source(canvasElement, "Shadcn Nova")).toHaveAttribute("aria-expanded", "true"))
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
  const { doc } = example()
  const main = doc.file(doc.main)!
  applyDocuments(doc, "Correct the component list", [{ path: doc.main, document: { ...main, detection } }], {
    origin: "edit"
  })
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
 * Right-clicking a component: Open in Storybook and View code, here for Button, which has stories. Its menu on its own,
 * in each state, is in Component menu.
 */
export const ComponentMenu: Story = {
  loaders: [openComponents],
  play: async ({ canvasElement }) => {
    await showKit(canvasElement)
    const button = await kitButton(canvasElement)
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
        "nova/Card": "useSidebar must be used within a SidebarProvider.",
        "nova/Table": "Cannot read properties of undefined (reading 'map')"
      })
    }
  ],
  play: async ({ canvasElement }) => {
    await showKit(canvasElement)
    const card = await scrollUntil(canvasElement, () => within(canvasElement).queryAllByLabelText("Fails to draw")[0])
    await userEvent.hover(card.closest("button")!)
    const about = await within(document.body).findByRole("dialog", undefined, { timeout: 3000 })
    await expect(about).toHaveTextContent("Needs a provider, which a decorator can add")
  }
}

/**
 * Clicking a component design with nothing selected: it lands on the canvas, so a new frame named Stat card holds an
 * instance of it, and is selected, here in Layers, where it's listed under Frames (PAR-546).
 */
export const AddingWithNothingSelected: Story = {
  loaders: [openComponents],
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Stat card" }))

    const made = await waitFor(async () => {
      const found = example().doc.design(example().selection.get().design ?? "")
      await expect(found).toMatchObject({
        name: "Stat card",
        root: { children: [{ type: "instance", design: "stat-card" }] }
      })

      return found
    })

    await expect(made?.kind).toBe("frame")
    setLayout({ leftTab: "layers" })
  }
}

/**
 * A component with stories in the project's Storybook, Button: a book button beside it opens them. It's there only while
 * the row is pointed at or has focus, and shows on hover, which a story can't do, so it is shown here as if it were.
 */
export const StorybookLink: Story = {
  loaders: [openComponents],
  decorators: [
    (Story) => (
      <>
        <style>{'[aria-label="Open in Storybook: Button"] { opacity: 1 }'}</style>
        <Story />
      </>
    )
  ],
  play: async ({ canvasElement }) => {
    await showKit(canvasElement)
    await userEvent.hover(await kitButton(canvasElement))
    await within(canvasElement).findByRole("button", { name: "Open in Storybook: Button" })
  }
}

/** Opening Button's stories, while Storybook starts: a toast says it can take a minute the first time. */
export const OpeningStorybook: Story = {
  loaders: [openComponents],
  beforeEach: keepingLinks,
  play: async ({ canvasElement }) => {
    await showKit(canvasElement)
    // Its extension shows progress, and the command doesn't finish while Storybook starts.
    answering({
      "extensions.run": async ({ projectId }) => {
        await askWindow({
          projectId,
          extension: "@parity-app/extension-storybook",
          method: "ui.progress",
          params: {
            id: 1,
            title: "Opening Storybook…",
            detail: "If it isn't running yet, it starts first, which can take a minute."
          }
        })

        return never()
      }
    })
    // Its row has focus, which brings its buttons, as pointing at it does.
    const row = await kitButton(canvasElement)
    row.focus()
    await userEvent.click(await within(canvasElement).findByRole("button", { name: "Open in Storybook: Button" }))
    await holdToast("Opening Storybook…")
  }
}

/** The component libraries the project can add, from the plus beside the search, Shadcn first. */
export const AddingALibrary: Story = {
  loaders: [openComponents],
  play: async ({ canvasElement }) => {
    const dialog = await openLibraries(canvasElement)
    await within(dialog).findByRole("heading", { name: "Shadcn" }, slowly)
  }
}

/** The component libraries while the service lists them. */
export const CatalogLoading: Story = {
  loaders: [openComponents],
  beforeEach: keepingLinks,
  play: async ({ canvasElement }) => {
    service.latency = forever
    await openLibraries(canvasElement)
  }
}

/** Opens the component libraries from the Components panel. */
async function openLibraries(canvasElement: HTMLElement): Promise<HTMLElement> {
  await userEvent.click(within(canvasElement).getByRole("button", { name: "Component libraries" }))

  return within(document.body).findByRole("dialog")
}

/** A library installing with the project's package manager, after Add Mantine was clicked. */
export const InstallingALibrary: Story = {
  loaders: [openComponents],
  beforeEach: keepingLinks,
  play: async ({ canvasElement }) => {
    const dialog = await openLibraries(canvasElement)
    await userEvent.click(await within(dialog).findByRole("button", { name: "Mantine" }, slowly))
    service.latency = forever
    await userEvent.click(within(dialog).getByRole("button", { name: "Add Mantine" }))
    await waitFor(() => expect(within(document.body).getByText("Installing Mantine…")).toBeVisible())
  }
}

/** A project that has Shadcn: Change opens its settings as the project has them, and Apply waits for one to change. */
export const ChangingShadcn: Story = {
  loaders: [openComponents],
  beforeEach: () =>
    answerNext("library.catalog", () =>
      Promise.resolve(
        storyCatalog({ added: ["shadcn"], shadcn: { base: "base", style: "mira", theme: "stone", icons: "phosphor" } })
      )
    ),
  play: async ({ canvasElement }) => {
    const dialog = await openLibraries(canvasElement)
    await userEvent.click(await within(dialog).findByRole("button", { name: "Change" }, slowly))
    await expect(within(dialog).getByRole("button", { name: "Apply" })).toBeDisabled()
  }
}

/** Shadcn setting up through shadcn-sync, after Add Shadcn was clicked in its settings. */
export const AddingShadcnInstalling: Story = {
  loaders: [openComponents],
  beforeEach: keepingLinks,
  play: async ({ canvasElement }) => {
    const dialog = await openLibraries(canvasElement)
    await userEvent.click(await within(dialog).findByRole("button", { name: "Next" }, slowly))
    service.latency = forever
    await userEvent.click(within(dialog).getByRole("button", { name: "Add Shadcn" }))
    await waitFor(() => expect(within(document.body).getByText("Installing Shadcn…")).toBeVisible())
  }
}

/** A library the project has coming out, after Remove was confirmed. */
export const RemovingALibrary: Story = {
  loaders: [openComponents],
  beforeEach: () => {
    keepingLinks()
    answerNext("library.catalog", () => Promise.resolve(storyCatalog({ added: ["mantine"] })))
  },
  play: async ({ canvasElement }) => {
    const dialog = await openLibraries(canvasElement)
    await userEvent.click(await within(dialog).findByRole("button", { name: "Mantine" }, slowly))
    await userEvent.click(within(dialog).getByRole("button", { name: "Remove" }))
    service.latency = forever
    await userEvent.click(within(dialog).getByRole("button", { name: "Remove" }))
    await waitFor(() => expect(within(document.body).getByText("Removing Mantine…")).toBeVisible())
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
      await openProject("empty")
      setLayout({ leftTab: "components" })
    }
  ]
}
