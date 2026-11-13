import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, within } from "storybook/test"
import { dialogStories, enter, exampleOpen, openOverExample } from "./chrome-fixtures.tsx"
import { ShortcutsDialog } from "./ShortcutsDialog.tsx"

/** Keyboard shortcuts, from Help > Keyboard shortcuts or Ctrl+Shift+?, over the window. */
const meta = {
  title: "Parity/Chrome/Keyboard shortcuts",
  component: ShortcutsDialog,
  ...dialogStories
} satisfies Meta<typeof ShortcutsDialog>

export default meta

type Story = StoryObj<typeof meta>

/** Every shortcut by group, with the keys held while dragging or clicking. */
export const Every: Story = {
  loaders: [exampleOpen],
  play: async () => {
    await openOverExample("shortcuts", "Keyboard shortcuts")
  }
}

/** Searched for "layer": the selection keys and the ones that act on a layer. */
export const Searched: Story = {
  loaders: [exampleOpen],
  play: async () => {
    const dialog = within(await openOverExample("shortcuts", "Keyboard shortcuts"))
    await enter(dialog.getByRole("textbox", { name: "Search shortcuts" }), "layer")
    await expect(dialog.getByText("Select the next layer")).toBeInTheDocument()
    await expect(dialog.queryByText("Zoom in")).not.toBeInTheDocument()
  }
}
