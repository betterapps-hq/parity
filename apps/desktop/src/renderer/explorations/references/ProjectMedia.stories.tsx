import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, userEvent, waitFor, within } from "storybook/test"
import { typeInto } from "../../stories/fixtures.tsx"
import { opening, workspace } from "./story-kit.tsx"
import { usedEverywhere } from "./workspace.tsx"

/**
 * The Media tab (docs/proposals/references.md): everything the project has to show or play. It's the Images tab
 * renamed, since Pixabay brings illustrations, vectors and videos as well as photos, and redrawn as a wall of the
 * pictures themselves, two across, each in its own proportions.
 *
 * Every story is the same window, on the Media tab, and all of it works. Point at one to see its name, and rest on it,
 * or press the right arrow, for its card: the picture larger, a video in its player, where it's from, where it's used
 * and what to do with it. Press one to place it in the design, or drag it onto the canvas. Add, beside the search,
 * opens the browser on Pixabay or picks files. Drag image files from Explorer or Finder onto the tab or the canvas
 * (PAR-835). Right-click one, use its card, or focus it and press Delete to remove it (PAR-836).
 *
 * The project starts with eleven, one of each case: photos, illustrations, a vector and videos from Pixabay, some
 * that Pricing uses and some nothing does; a pasted screenshot; a dropped photo the project's code names; a photo
 * Pricing links to at Unsplash rather than keeping; and a path Pricing names with no file there.
 */
const meta = {
  title: "Parity/Explorations/References/Project media",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

/** The whole page, since dialogs, menus and toasts open over the window rather than inside the story's element. */
const body = () => within(document.body)

/** A small picture file, as a person's own screenshot or photo would be, in one color. */
async function pictureFile(name: string, hue: number, width = 640, height = 420): Promise<File> {
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext("2d")

  if (context) {
    const gradient = context.createLinearGradient(0, 0, width, height)
    gradient.addColorStop(0, `hsl(${hue} 70% 62%)`)
    gradient.addColorStop(1, `hsl(${hue + 40} 70% 38%)`)
    context.fillStyle = gradient
    context.fillRect(0, 0, width, height)
  }

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"))

  return new File([blob ?? new Blob()], name, { type: "image/png" })
}

/** Files carried by a drag, as Explorer or Finder hands them to the window. */
function carrying(files: File[]): DataTransfer {
  const transfer = new DataTransfer()

  for (const file of files) {
    transfer.items.add(file)
  }

  return transfer
}

/** Drags files onto an element, at a point in the window or its middle, and drops them there unless `hold`. */
async function dragFiles(
  target: Element,
  files: File[],
  { at, hold = false }: { at?: { x: number; y: number }; hold?: boolean } = {}
) {
  const box = target.getBoundingClientRect()
  const point = at ?? { x: box.left + box.width / 2, y: box.top + box.height / 2 }
  const dataTransfer = carrying(files)

  const fire = (type: string) =>
    target.dispatchEvent(
      new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer, clientX: point.x, clientY: point.y })
    )

  fire("dragenter")
  fire("dragover")

  if (!hold) {
    await new Promise((resolve) => setTimeout(resolve, 50))
    fire("drop")
  }
}

const mediaTab = async () => body().findByRole("list", { name: "Media in this project" })

const tile = async (name: string | RegExp) => within(await mediaTab()).findByRole("button", { name })

const canvas = async () => body().findByRole("application", { name: "Canvas" })

/** A point on the empty canvas, below and to the right of everything on it. */
async function emptyCanvasPoint() {
  const box = (await canvas()).getBoundingClientRect()

  return { x: box.right - 120, y: box.bottom - 160 }
}

/** A point over Pricing's desktop preview. */
async function designPoint() {
  const box = (await body().findByRole("group", { name: "Pricing" })).getBoundingClientRect()

  return { x: box.left + box.width * 0.25, y: box.top + box.height * 0.4 }
}

/** Opens one's card with the keyboard, as the right arrow does from its tile. */
async function openCard(name: string | RegExp) {
  const from = await tile(name)
  from.focus()
  await userEvent.keyboard("{ArrowRight}")
}

/**
 * Opens one's card and presses a button on it, with the keyboard as a person might: a pointer click while the card is
 * still opening can land before it listens.
 */
async function fromCard(name: string | RegExp, action: string) {
  await openCard(name)
  const button = await body().findByRole("button", { name: action })
  button.focus()
  await userEvent.keyboard("{Enter}")
}

/** Drags one of the project's media from the tab to a point on the canvas and drops it there. */
async function dragFromTab(name: string, at: { x: number; y: number }) {
  const from = await tile(name)
  const dataTransfer = new DataTransfer()
  from.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer }))
  const target = await canvas()

  const fire = (type: string) =>
    target.dispatchEvent(
      new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer, clientX: at.x, clientY: at.y })
    )

  fire("dragenter")
  fire("dragover")
  // The canvas learns where the pointer is from the drag, a moment before the drop.
  await new Promise((resolve) => setTimeout(resolve, 50))
  fire("drop")
}

// The tab

/**
 * The wall: photos, illustrations, a vector, videos and a screenshot, each in its own proportions, in whichever
 * column is shorter. A video says how long it runs. A picture linked rather than kept is marked, and a path with no
 * file is dashed, with its file's name. The types above narrow it, and show only when the project has more than one.
 */
export const MediaTab: Story = {
  loaders: [opening(false, "images")],
  render: workspace()
}

/** Narrowed to videos. They play, without sound, while pointed at. */
export const OnlyVideos: Story = {
  loaders: [opening(false, "images")],
  render: workspace(),
  play: async () => {
    await userEvent.click(await body().findByRole("button", { name: "Videos" }))
    await waitFor(async () => expect((await mediaTab()).children).toHaveLength(2))
  }
}

/**
 * A photo's card, opened by resting on it or with the right arrow: the photo larger, its file, its size, who took it
 * and the library it's from under that library's own mark, the layer that uses it with Show, and Insert, Open in
 * Pixabay and Remove.
 */
export const PhotoCard: Story = {
  loaders: [opening(false, "images")],
  render: workspace(),
  play: async () => {
    await openCard("lake-at-sunrise.jpg")
    await expect(await body().findByRole("button", { name: "Open in Pixabay" })).toBeInTheDocument()
  }
}

/** A video's card plays it, with the player the browser's larger view has, and says how long it runs. */
export const VideoCard: Story = {
  loaders: [opening(false, "images")],
  render: workspace(),
  play: async () => {
    await openCard("waves-at-dusk.mp4")
    await expect(await body().findByRole("button", { name: "Pause" })).toBeInTheDocument()
  }
}

/** A photo a layer links to at its library, rather than a file in the project: its card says so. */
export const LinkedPhotoCard: Story = {
  loaders: [opening(false, "images")],
  render: workspace(),
  play: async () => {
    await openCard(/^Photo by/)
    await expect(await body().findByText("Linked from Unsplash, not saved in the project")).toBeInTheDocument()
  }
}

/** A path a layer names with no file there: its card has the whole path, and the layer to fix. */
export const NoFileCard: Story = {
  loaders: [opening(false, "images")],
  render: workspace(),
  play: async () => {
    await openCard("/images/old-logo.svg")
    await expect(await body().findByText("No file at this path")).toBeInTheDocument()
  }
}

/**
 * One used all over, as a logo is: 104 layers in eleven designs, and three files of code. Its card says how many
 * times, and lists the designs rather than the layers, the one with the most first, each with how many of its layers
 * use it. Three show, and Show 11 more opens the rest in place, in a list that scrolls.
 */
export const UsedEverywhere: Story = {
  loaders: [opening(false, "images")],
  render: workspace({ media: usedEverywhere() }),
  play: async () => {
    await openCard("rocket.svg")
    await expect(await body().findByText("Used 107 times")).toBeInTheDocument()
    const more = await body().findByRole("button", { name: "Show 11 more" })
    more.focus()
    await userEvent.keyboard("{Enter}")
    await expect(await body().findByRole("button", { name: "Show in Changelog" })).toBeInTheDocument()
  }
}

/** Removing one used all over asks first, with the same designs in a list that scrolls. */
export const RemoveOneUsedEverywhere: Story = {
  loaders: [opening(false, "images")],
  render: workspace({ media: usedEverywhere() }),
  play: async () => {
    await fromCard("rocket.svg", "Remove from project")
    const dialog = within(await body().findByRole("dialog"))
    await expect(await dialog.findByRole("button", { name: "Show in Pricing" })).toBeInTheDocument()
  }
}

/** Searching the project's media for something it doesn't have offers to look for it on Pixabay. */
export const NotInTheProject: Story = {
  loaders: [opening(false, "images")],
  render: workspace(),
  play: async ({ canvasElement }) => {
    const field = await within(canvasElement).findByRole("textbox", { name: "Search media" })

    if (!(field instanceof HTMLInputElement)) {
      throw new Error("The Media tab's search isn't a text field")
    }

    await typeInto(field, "castle")
    await expect(await body().findByRole("button", { name: "Find it on Pixabay" })).toBeInTheDocument()
  }
}

/** Add, beside the search: find on Pixabay, under its own mark, or choose files from the computer. */
export const AddMedia: Story = {
  loaders: [opening(false, "images")],
  render: workspace(),
  play: async () => {
    const add = await body().findByRole("button", { name: "Add media" })
    add.focus()
    await userEvent.keyboard("{ArrowDown}")
    await expect(await body().findByRole("menuitem", { name: "Find on Pixabay" })).toBeInTheDocument()
  }
}

/** A project with none yet. */
export const NoMediaYet: Story = {
  loaders: [opening(false, "images")],
  render: workspace({ media: { media: [], pictures: {} } })
}

// Using

/** Pressing one places it in the design, selected, as pressing a component does. Its card then lists the new layer. */
export const PlaceInTheDesign: Story = {
  loaders: [opening(false, "images")],
  render: workspace(),
  play: async () => {
    const rocket = await tile("rocket.svg")
    rocket.focus()
    await userEvent.keyboard("{Enter}")
    await expect(await body().findByRole("img", { name: "rocket.svg" })).toBeInTheDocument()
  }
}

/** Dragged from the tab onto the empty canvas, it lands in a new frame named after it, as a dropped file does. */
export const DragOntoTheCanvas: Story = {
  loaders: [opening(false, "images")],
  render: workspace(),
  play: async () => {
    await dragFromTab("shapes-warm.png", await emptyCanvasPoint())
    await expect(await body().findByRole("group", { name: "shapes-warm" })).toBeInTheDocument()
  }
}

// Adding

/**
 * Image files held over the Media tab: its edge turns the selection's color, dashed, and it says what a drop adds,
 * counting only the files that may be images.
 */
export const DragOntoTheMediaTab: Story = {
  loaders: [opening(false, "images")],
  render: workspace(),
  play: async () => {
    const files = [await pictureFile("hero.png", 210), await pictureFile("avatar.png", 330)]
    await dragFiles(await mediaTab(), files, { hold: true })
    await expect(await body().findByText("Add 2 images to the project")).toBeInTheDocument()
  }
}

/** Two dropped on the tab: they arrive first on the wall, growing in and marked for a moment. */
export const DropOntoTheMediaTab: Story = {
  loaders: [opening(false, "images")],
  render: workspace(),
  play: async () => {
    const files = [await pictureFile("Hero shot.png", 210), await pictureFile("avatar.png", 330, 420, 420)]
    await dragFiles(await mediaTab(), files)
    await expect(await tile(/^hero-shot-/)).toBeInTheDocument()
  }
}

/** A text file dropped with a picture: the picture's added, and the text file's named with why it wasn't. */
export const DropAFileItWontTake: Story = {
  loaders: [opening(false, "images")],
  render: workspace(),
  play: async () => {
    const notes = new File(["notes"], "notes.txt", { type: "text/plain" })
    await dragFiles(await mediaTab(), [await pictureFile("hero.png", 210), notes])
    await expect(await body().findByText("Skipped notes.txt")).toBeInTheDocument()
  }
}

/**
 * Image files held over Pricing: its layout is outlined, a corner marks where they'll land, and the label beside the
 * pointer says what a drop does, as the app's drop does today.
 */
export const DragOverTheDesign: Story = {
  loaders: [opening(false, "images")],
  render: workspace(),
  play: async () => {
    const files = [await pictureFile("hero.png", 210), await pictureFile("avatar.png", 330)]
    await dragFiles(await canvas(), files, { at: await designPoint(), hold: true })
    await expect(await body().findByText("Add 2 images here")).toBeInTheDocument()
  }
}

/** The same files over the empty canvas: no outline, and the label says they'll make a new frame. */
export const DragOverTheEmptyCanvas: Story = {
  loaders: [opening(false, "images")],
  render: workspace(),
  play: async () => {
    const files = [await pictureFile("hero.png", 210), await pictureFile("avatar.png", 330)]
    await dragFiles(await canvas(), files, { at: await emptyCanvasPoint(), hold: true })
    await expect(await body().findByText("New frame with 2 images")).toBeInTheDocument()
  }
}

/**
 * Dropped on Pricing: each image grows out of the drop point into its place, one after another, and stays outlined in
 * the selection's color until something else is selected. They're in the Media tab too, used by Pricing.
 */
export const DropOnTheDesign: Story = {
  loaders: [opening(false, "images")],
  render: workspace(),
  play: async () => {
    const files = [await pictureFile("hero.png", 210), await pictureFile("avatar.png", 330, 420, 420)]
    await dragFiles(await canvas(), files, { at: await designPoint() })
    await expect(await body().findByRole("img", { name: "hero.png" })).toBeInTheDocument()
  }
}

/** Dropped on the empty canvas: a new frame at the drop point, named Images since there are two, holding them in a row. */
export const DropOnTheEmptyCanvas: Story = {
  loaders: [opening(false, "images")],
  render: workspace(),
  play: async () => {
    const files = [await pictureFile("hero.png", 210), await pictureFile("avatar.png", 330, 420, 420)]
    await dragFiles(await canvas(), files, { at: await emptyCanvasPoint() })
    await expect(await body().findByRole("group", { name: "Images" })).toBeInTheDocument()
  }
}

// Removing

/** One nothing uses goes at once, since Undo brings it back. */
export const RemoveAnUnusedImage: Story = {
  loaders: [opening(false, "images")],
  render: workspace(),
  play: async () => {
    await fromCard("old-dashboard.png", "Remove from project")
    await expect(await body().findByText("Removed old-dashboard.png")).toBeInTheDocument()
    await expect(within(await mediaTab()).queryByRole("button", { name: "old-dashboard.png" })).toBeNull()
  }
}

/** Undo in the toast puts it back where it was. */
export const UndoARemoval: Story = {
  loaders: [opening(false, "images")],
  render: workspace(),
  play: async () => {
    await fromCard("old-dashboard.png", "Remove from project")
    await userEvent.click(await body().findByRole("button", { name: "Undo" }))
    await expect(await tile("old-dashboard.png")).toBeInTheDocument()
  }
}

/**
 * An image Pricing shows: removing it asks first, listing each layer with Show, and offers to remove the layers with
 * it, in one step Undo takes back.
 */
export const RemoveAnImageInUse: Story = {
  loaders: [opening(false, "images")],
  render: workspace(),
  play: async () => {
    await fromCard("lake-at-sunrise.jpg", "Remove from project")
    await expect(await body().findByRole("button", { name: "Remove file and 1 layer" })).toBeInTheDocument()
  }
}

/** An image the project's code names can't be removed from here: the dialog says where, and to change the code first. */
export const RemoveAnImageTheCodeUses: Story = {
  loaders: [opening(false, "images")],
  render: workspace(),
  play: async () => {
    await fromCard("team-portrait.jpg", "Remove from project")
    const dialog = within(await body().findByRole("dialog"))
    await expect(await dialog.findByText("src/pages/About.tsx, line 14")).toBeInTheDocument()
    await expect(dialog.queryByRole("button", { name: /^Remove/ })).toBeNull()
  }
}

/** A photo linked at Unsplash has no file: removing it means removing the layers that show it. */
export const RemoveALinkedPhoto: Story = {
  loaders: [opening(false, "images")],
  render: workspace(),
  play: async () => {
    await fromCard(/^Photo by/, "Remove from designs")
    await expect(await body().findByRole("button", { name: "Remove 2 layers" })).toBeInTheDocument()
  }
}

/** Delete on a focused one does what its card's Remove does. Show, in the dialog, selects the design on the canvas. */
export const DeleteKeyAndShow: Story = {
  loaders: [opening(false, "images")],
  render: workspace(),
  play: async () => {
    const lake = await tile("lake-at-sunrise.jpg")
    lake.focus()
    await userEvent.keyboard("{Delete}")
    await userEvent.click(
      await within(await body().findByRole("dialog")).findByRole("button", { name: "Show in Pricing" })
    )
    await expect(body().queryByRole("dialog")).toBeNull()
  }
}
