import { type ImageCredit, walkNodes } from "@parity-app/core"
import { type ImageFile, type InsertItem, insertIntoDesign, whereToInsert } from "@parity-app/editor"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, fireEvent, userEvent, waitFor, within } from "storybook/test"
import { insertContext } from "../canvas/insert.ts"
import { panelLimits, setLayout } from "../chrome/layout.ts"
import { LeftPanel } from "../chrome/LeftPanel.tsx"
import { design, example, never, openProjects, ProjectStage } from "../stories/fixtures.tsx"
import { answering, media, requests } from "../stories/host.ts"
import { MediaPanel } from "./MediaPanel.tsx"

/**
 * The Media tab: the project's pictures as a wall, each with a card, to insert, drag onto the canvas, or remove. Shown
 * in the left panel, as the app shows it. The pictures are drawn for these stories and served at `/images/`, as the
 * project's builder serves `public/images/`.
 */
const meta = {
  title: "Parity/Left panel/Media",
  component: MediaPanel,
  render: () => <LeftPanel />,
  decorators: [
    (Story) => (
      <ProjectStage>
        <Story />
      </ProjectStage>
    )
  ]
} satisfies Meta<typeof MediaPanel>

export default meta

type Story = StoryObj<typeof meta>

/** The example's image files, as `images.scan` lists them. */
const pictures: ImageFile[] = [
  { path: "public/images/dusk-hills.jpg", bytes: 182_400 },
  { path: "public/images/desk-from-above.jpg", bytes: 412_000 },
  { path: "public/images/plant.jpg", bytes: 268_000 },
  { path: "public/images/coast.jpg", bytes: 1_240_000 },
  { path: "public/images/team.jpg", bytes: 96_000 },
  { path: "public/images/pattern.png", bytes: 6400 },
  { path: "public/images/logo.svg", bytes: 177 },
  { path: "public/images/wave.svg", bytes: 308 }
]

const credit: ImageCredit = { name: "Ana Lee", url: "https://pixabay.com", source: "Pixabay" }

/** Puts an image in a design, as many times as asked, at the end of its root layout, in one step. */
function showIn(designName: string, image: { src: string; alt?: string; credit?: ImageCredit }, copies = 1): void {
  const session = example()
  const item: InsertItem = { kind: "image", width: 320, height: 200, ...image }

  session.store.updateContainer(design(designName), "Add images", (container) => {
    let next = container

    for (let copy = 0; copy < copies; copy++) {
      const at = whereToInsert(next.root, undefined, session.store.getComponentLibrary())
      next = at ? insertIntoDesign(next, at, item, insertContext(session, item)).container : next
    }

    return next
  })

  session.selection.set({})
}

/** Opens the example on the Media tab with the files given. */
async function openMedia(files: ImageFile[] = pictures): Promise<void> {
  media.files = [...files]
  await openProjects("example")
  setLayout({ leftTab: "media" })
}

/**
 * Opens the example on the Media tab, its designs using some of its pictures: one linked at a library's address, and
 * a path with no file.
 */
async function openUsedMedia(): Promise<void> {
  await openMedia()
  showIn("Pricing", { src: "/images/dusk-hills.jpg", alt: "Hills at dusk" }, 2)
  showIn("Dashboard", { src: "/images/dusk-hills.jpg" })
  showIn("Projects", { src: "/images/desk-from-above.jpg" })
  showIn("Dashboard", { src: new URL("/images/coast.jpg", location.href).href, alt: "Coast at noon", credit })
  showIn("Settings", { src: "/images/old-hero.png" })
}

/** The wall, once every picture on it has loaded. */
async function wall(canvasElement: HTMLElement): Promise<HTMLElement> {
  const list = await within(canvasElement).findByRole("list", { name: "Media in this project" })

  await waitFor(() => {
    const images = [...list.querySelectorAll("img")]

    if (images.length === 0 || !images.every((image) => image.complete)) {
      throw new Error("The pictures are still loading")
    }
  })

  return list
}

/** A tile on the wall, by its name. */
async function tile(canvasElement: HTMLElement, name: string): Promise<HTMLElement> {
  return within(await wall(canvasElement)).getByRole("button", { name })
}

/** Opens a tile's card with the keyboard, as resting on it would, and returns the card. */
async function openCard(canvasElement: HTMLElement, name: string): Promise<HTMLElement> {
  ;(await tile(canvasElement, name)).focus()
  await userEvent.keyboard("{ArrowRight}")

  return within(document.body).findByRole("dialog")
}

/**
 * Searches, as typing would. `userEvent.type` changes the field without React's change handler seeing it, so the value
 * is set the way React reads it.
 */
async function search(canvasElement: HTMLElement, text: string): Promise<void> {
  const field = within(canvasElement).getByRole("textbox", { name: "Search media" })
  field.focus()
  await fireEvent.input(field, { target: { value: text } })
}

/** The `src` of every image layer in a design. */
function imagesIn(designName: string): string[] {
  const entry = example().store.getEntry(design(designName))
  const srcs: string[] = []

  if (entry) {
    walkNodes(entry.container.root, (node) => {
      if (node.type === "image") {
        srcs.push(node.src)
      }
    })
  }

  return srcs
}

/** A project with no media yet: drop images here or on the canvas, or choose files. */
export const NoMediaYet: Story = { loaders: [() => openMedia([])] }

/** Before the project's files are listed. */
export const Loading: Story = {
  loaders: [
    async () => {
      await openMedia()
      answering({ "images.scan": () => never() })
    }
  ]
}

/** The project's pictures, each as tall as its proportions make it, photos and vectors together. */
export const Wall: Story = {
  loaders: [() => openMedia()],
  play: async ({ canvasElement }) => {
    const list = await wall(canvasElement)
    await expect(within(list).getAllByRole("button")).toHaveLength(pictures.length)
  }
}

/**
 * Pictures the designs use, one linked at its library's address, marked with a link, and a path with no file, dashed,
 * with its file's name.
 */
export const LinkedAndMissing: Story = {
  loaders: [openUsedMedia],
  play: async ({ canvasElement }) => {
    const list = await wall(canvasElement)
    await expect(within(list).getByRole("button", { name: "Coast at noon" })).toBeVisible()
    await expect(within(list).getByRole("button", { name: "/images/old-hero.png" })).toHaveTextContent("old-hero.png")
  }
}

/** A search: only the pictures whose name, path, alt text or credit match. */
export const Searching: Story = {
  loaders: [() => openMedia()],
  play: async ({ canvasElement }) => {
    await search(canvasElement, "plant")
    const list = await wall(canvasElement)
    await expect(
      within(list)
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label"))
    ).toEqual(["plant.jpg"])
  }
}

/** A search that matches nothing. */
export const NothingMatches: Story = {
  loaders: [() => openMedia()],
  play: async ({ canvasElement }) => {
    await search(canvasElement, "qwerty")
    await within(canvasElement).findByText("Nothing matches “qwerty”")
  }
}

/** Narrowed to vectors, with the photos and the vectors told apart by file type. */
export const VectorsOnly: Story = {
  loaders: [() => openMedia()],
  play: async ({ canvasElement }) => {
    // The types to narrow to show once the project's files are listed.
    await userEvent.click(await within(canvasElement).findByRole("button", { name: "Vectors" }))
    const list = await wall(canvasElement)
    await expect(
      within(list)
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label"))
    ).toEqual(["logo.svg", "wave.svg"])
  }
}

/** A picture's card: larger, with its path, size and the designs that use it. */
export const Card: Story = {
  loaders: [openUsedMedia],
  play: async ({ canvasElement }) => {
    const card = await openCard(canvasElement, "dusk-hills.jpg")
    await within(card).findByText("public/images/dusk-hills.jpg")
    await within(card).findByText("900 × 600")
    const uses = within(card).getByRole("list", { name: "Where it's used" })
    await expect(within(uses).getAllByRole("listitem")).toHaveLength(2)
    await expect(within(uses).getAllByRole("listitem")[0]).toHaveTextContent("Pricing 2 layers")
  }
}

/** A linked photo's card, with who took it and where it's from. */
export const LinkedCard: Story = {
  loaders: [openUsedMedia],
  play: async ({ canvasElement }) => {
    const card = await openCard(canvasElement, "Coast at noon")
    await within(card).findByText("Linked, not saved in the project")
    await expect(within(card).getByRole("link", { name: "Ana Lee" })).toHaveAttribute("href", "https://pixabay.com")
  }
}

/**
 * A logo in a hundred layers across five designs: its card lists the designs, the one with the most layers first, and
 * the rest wait behind a button.
 */
export const UsedEverywhere: Story = {
  loaders: [
    async () => {
      await openMedia()
      showIn("Dashboard", { src: "/images/logo.svg" }, 40)
      showIn("Pricing", { src: "/images/logo.svg" }, 30)
      showIn("Projects", { src: "/images/logo.svg" }, 20)
      showIn("Settings", { src: "/images/logo.svg" }, 6)
      showIn("Sign in", { src: "/images/logo.svg" }, 4)
    }
  ],
  play: async ({ canvasElement }) => {
    const card = await openCard(canvasElement, "logo.svg")
    const uses = within(card).getByRole("list", { name: "Where it's used" })
    await expect(within(uses).getAllByRole("listitem")).toHaveLength(3)
    await expect(within(uses).getAllByRole("listitem")[0]).toHaveTextContent("Dashboard 40 layers")
    await userEvent.click(within(card).getByRole("button", { name: "Show 2 more" }))
    await expect(within(uses).getAllByRole("listitem")).toHaveLength(5)
  }
}

/** Show on a card selects the design's layer that uses the picture. */
export const ShowALayer: Story = {
  loaders: [openUsedMedia],
  play: async ({ canvasElement }) => {
    const card = await openCard(canvasElement, "desk-from-above.jpg")
    await userEvent.click(within(card).getByRole("button", { name: "Show in Projects" }))
    await waitFor(() => expect(example().selection.get().design).toBe(design("Projects")))
    await expect(example().selection.get().node).toBeDefined()
  }
}

/** Pressing a picture inserts it at the selection, at its own proportions. */
export const InsertAtSelection: Story = {
  loaders: [() => openMedia()],
  play: async ({ canvasElement }) => {
    example().selection.set({ design: design("Pricing") })
    await userEvent.click(await tile(canvasElement, "plant.jpg"))
    await waitFor(() => expect(imagesIn("Pricing")).toContain("/images/plant.jpg"))
  }
}

/** Removing a picture nothing uses removes its file at once, with Undo in the notification. */
export const RemoveUnused: Story = {
  loaders: [() => openMedia()],
  play: async ({ canvasElement }) => {
    ;(await tile(canvasElement, "team.jpg")).focus()
    await userEvent.keyboard("{Delete}")
    await within(document.body).findByText("Changed public/images/team.jpg")
    await waitFor(() => expect(within(canvasElement).queryByRole("button", { name: "team.jpg" })).toBeNull())
    await expect(requests.some((request) => request.method === "images.remove")).toBe(true)
  }
}

/** Removing a picture designs use asks first, saying where, and removes the file and its layers together. */
export const RemoveInUse: Story = {
  loaders: [openUsedMedia],
  play: async ({ canvasElement }) => {
    ;(await tile(canvasElement, "dusk-hills.jpg")).focus()
    await userEvent.keyboard("{Delete}")
    const dialog = await within(document.body).findByRole("dialog", { name: "dusk-hills.jpg is still in use" })
    await userEvent.click(within(dialog).getByRole("button", { name: "Remove file and 3 layers" }))
    await waitFor(() => expect(imagesIn("Pricing")).not.toContain("/images/dusk-hills.jpg"))
    await expect(imagesIn("Dashboard")).not.toContain("/images/dusk-hills.jpg")
    await waitFor(() => expect(within(canvasElement).queryByRole("button", { name: "dusk-hills.jpg" })).toBeNull())
  }
}

/** A picture the project's code names stays: the dialog says where, to change the code first. */
export const NamedInCode: Story = {
  loaders: [
    async () => {
      await openMedia()
      media.references = [{ image: "public/images/logo.svg", path: "src/components/app-sidebar.tsx", line: 12 }]
    }
  ],
  play: async ({ canvasElement }) => {
    ;(await tile(canvasElement, "logo.svg")).focus()
    await userEvent.keyboard("{Delete}")
    const dialog = await within(document.body).findByRole("dialog", { name: "logo.svg is still in use" })
    await within(dialog).findByText("src/components/app-sidebar.tsx, line 12")
    await within(dialog).findByText("Remove or replace it in the code first.")
  }
}

/** Image files dropped on the tab are added to the project, marked for a moment as they arrive. */
export const DropFiles: Story = {
  loaders: [() => openMedia(pictures.filter((file) => file.path !== "public/images/coast.jpg"))],
  play: async ({ canvasElement }) => {
    const picture = await fetch("/images/coast.jpg").then((response) => response.blob())
    const transfer = new DataTransfer()
    transfer.items.add(new File([picture], "coast.jpg", { type: "image/jpeg" }))
    const list = await wall(canvasElement)
    // A drag event of the browser's own, since only one carries its files to the handler.
    list.dispatchEvent(new DragEvent("dragenter", { dataTransfer: transfer, bubbles: true, cancelable: true }))
    list.dispatchEvent(new DragEvent("drop", { dataTransfer: transfer, bubbles: true, cancelable: true }))
    await within(list).findByRole("button", { name: "coast.jpg" })
  }
}

/** The wall in the panel at its narrowest. */
export const NarrowPanel: Story = {
  loaders: [
    async () => {
      await openMedia()
      setLayout({ leftWidth: panelLimits.left[0] })
    }
  ]
}
