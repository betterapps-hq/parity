import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, userEvent, waitFor, within } from "storybook/test"
import { opening, workspace } from "./story-kit.tsx"

/**
 * A project's own images (PAR-835, PAR-836): adding image files by dragging them onto the Images tab or the canvas, and
 * removing an image. Every story is the same window as the Unsplash stories, on the Images tab, and all of it works: drag
 * image files from Explorer or Finder onto the tab or the canvas, right-click an image or use its More button, or focus
 * one and press Delete.
 *
 * The project starts with five images, one of each case: a photo from Unsplash that Pricing shows, a pasted image
 * nothing uses, a dropped one the project's code names, a photo Pricing links to at Unsplash, and a path Pricing names
 * with no file there.
 */
const meta = {
  title: "Parity/Explorations/References/Project images",
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

const imagesTab = async () => body().findByRole("list", { name: "Images in this project" })

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

/** Opens an image's menu from its More button and chooses what it says, with the keyboard as a person might. */
async function fromMenu(image: string, item: string) {
  const more = await body().findByRole("button", { name: `More for ${image}` })
  more.focus()
  // A pointer click while the tab is still settling can land before the menu listens, and a click on an item while the
  // menu is opening is taken as the one that opened it, so both steps use the keyboard.
  await userEvent.keyboard("{ArrowDown}")
  const choice = await body().findByRole("menuitem", { name: item })
  choice.focus()
  await userEvent.keyboard("{Enter}")
}

// Adding

/**
 * Image files held over the Images tab: its edge turns the selection's color, dashed, and it says what a drop adds,
 * counting only the files that may be images.
 */
export const DragOntoTheImagesTab: Story = {
  loaders: [opening(false, "images")],
  render: workspace(),
  play: async () => {
    const files = [await pictureFile("hero.png", 210), await pictureFile("avatar.png", 330)]
    await dragFiles(await imagesTab(), files, { hold: true })
    await expect(await body().findByText("Add 2 images to the project")).toBeInTheDocument()
  }
}

/** Two dropped on the tab: they arrive first in the list, growing in and marked for a moment, and nothing else changes. */
export const DropOntoTheImagesTab: Story = {
  loaders: [opening(false, "images")],
  render: workspace(),
  play: async () => {
    const files = [await pictureFile("Hero shot.png", 210), await pictureFile("avatar.png", 330, 420, 420)]
    await dragFiles(await imagesTab(), files)
    await waitFor(async () => expect((await imagesTab()).firstElementChild?.textContent).toMatch(/^hero-shot-/))
  }
}

/** A text file dropped with a picture: the picture's added, and the text file's named with why it wasn't. */
export const DropAFileItWontTake: Story = {
  loaders: [opening(false, "images")],
  render: workspace(),
  play: async () => {
    const notes = new File(["notes"], "notes.txt", { type: "text/plain" })
    await dragFiles(await imagesTab(), [await pictureFile("hero.png", 210), notes])
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
 * the selection's color until something else is selected. They're in the Images tab too, used by Pricing.
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

/** An image nothing uses goes at once, since Undo brings it back. */
export const RemoveAnUnusedImage: Story = {
  loaders: [opening(false, "images")],
  render: workspace(),
  play: async () => {
    await fromMenu("old-dashboard.png", "Remove from project")
    await expect(await body().findByText("Removed old-dashboard.png")).toBeInTheDocument()
    await expect(body().queryByRole("group", { name: "old-dashboard.png" })).toBeNull()
  }
}

/** Undo in the toast puts it back where it was. */
export const UndoARemoval: Story = {
  loaders: [opening(false, "images")],
  render: workspace(),
  play: async () => {
    await fromMenu("old-dashboard.png", "Remove from project")
    await userEvent.click(await body().findByRole("button", { name: "Undo" }))
    await expect(await body().findByRole("group", { name: "old-dashboard.png" })).toBeInTheDocument()
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
    await fromMenu("lake-at-sunrise.jpg", "Remove from project")
    await expect(await body().findByRole("button", { name: "Remove image and 1 layer" })).toBeInTheDocument()
  }
}

/** An image the project's code names can't be removed from here: the dialog says where, and to change the code first. */
export const RemoveAnImageTheCodeUses: Story = {
  loaders: [opening(false, "images")],
  render: workspace(),
  play: async () => {
    await fromMenu("team-portrait.jpg", "Remove from project")
    await expect(await body().findByText("src/pages/About.tsx, line 14")).toBeInTheDocument()
    await expect(body().queryByRole("button", { name: /^Remove/ })).toBeNull()
  }
}

/** A photo linked at Unsplash has no file: removing it means removing the layers that show it. */
export const RemoveALinkedPhoto: Story = {
  loaders: [opening(false, "images")],
  render: workspace(),
  play: async () => {
    const tile = (await imagesTab()).querySelectorAll("li")[3]
    const name = tile?.querySelector("[role=group]")?.getAttribute("aria-label") ?? ""
    await fromMenu(name, "Remove from designs")
    await expect(await body().findByRole("button", { name: "Remove 2 layers" })).toBeInTheDocument()
  }
}

/** Delete on a focused image does what its menu's Remove does. Show, in the dialog, selects the design on the canvas. */
export const DeleteKeyAndShow: Story = {
  loaders: [opening(false, "images")],
  render: workspace(),
  play: async () => {
    const tile = await body().findByRole("group", { name: "lake-at-sunrise.jpg" })
    tile.focus()
    await userEvent.keyboard("{Delete}")
    await userEvent.click(await body().findByRole("button", { name: "Show" }))
    await expect(body().queryByRole("dialog")).toBeNull()
  }
}
