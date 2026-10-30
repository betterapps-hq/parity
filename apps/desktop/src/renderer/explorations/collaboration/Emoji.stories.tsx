import type { Meta, StoryObj } from "@storybook/react-vite"
import { useState } from "react"
import { expect, screen, userEvent, waitFor, within } from "storybook/test"
import { thread } from "./collab-data.ts"
import { Composer, Thread } from "./comments.tsx"
import { EmojiPicker } from "./emoji.tsx"
import { Stage } from "./stage.tsx"

/**
 * Emoji, for reacting to comments and writing them: the picker, shortcodes in the composer, and reactions in a thread.
 * Frequently used learns from what you pick, and your skin tone carries to every picker.
 */
const meta = {
  title: "Parity/Explorations/Collaboration/Emoji",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

/** The picker on its own, with what was picked last beside it. */
function PickerWithResult({ initialQuery }: { initialQuery?: string }) {
  const [picked, setPicked] = useState<string[]>([])
  return (
    <Stage className="flex items-start gap-8">
      <div className="rounded-xl border bg-popover shadow-2xl">
        <EmojiPicker initialQuery={initialQuery} onPick={(emoji) => setPicked([...picked, emoji])} />
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-xs text-white/45">Picked</span>
        <output aria-label="Picked" className="min-h-8 text-2xl">
          {picked.join(" ")}
        </output>
      </div>
    </Stage>
  )
}

/**
 * The picker: search, Frequently used, then each category with tabs to jump between them. Arrow keys move through the
 * grid as you type, Enter picks, and the footer names the emoji with its shortcode.
 */
export const Picker: Story = {
  render: () => <PickerWithResult />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() => expect(canvas.getByRole("textbox", { name: "Search emoji" })).toHaveFocus())
    await userEvent.keyboard("rocket")
    await userEvent.keyboard("{Enter}")
    await expect(canvas.getByRole("status", { name: "Picked" })).toHaveTextContent("🚀")
  }
}

/** Searching matches names and keywords, so "ship" finds the rocket and "a11y" the wheelchair symbol. */
export const Search: Story = { render: () => <PickerWithResult initialQuery="heart" /> }

/** Nothing found. */
export const NoResults: Story = { render: () => <PickerWithResult initialQuery="zzz" /> }

/** Picking a skin tone changes every hand and person in the picker, and in the quick reactions. */
export const SkinTones: Story = {
  render: () => <PickerWithResult />,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Skin tone" }))
  }
}

/** In the composer, a colon and two letters suggest emoji; Enter or Tab picks one. The smiley opens the picker. */
export const Shortcodes: Story = {
  render: () => (
    <Stage>
      <div className="w-[22rem] pt-56">
        <Composer initial="Ship it :rock" />
      </div>
    </Stage>
  ),
  play: async ({ canvasElement }) => {
    const field = within(canvasElement).getByRole("textbox", { name: "Comment" })
    await userEvent.click(field)
    await userEvent.keyboard("{End}{Enter}")
    await expect(field).toHaveValue("Ship it 🚀")
  }
}

/**
 * Reacting in a thread: the smiley beside a comment's reactions opens the picker, and hovering it slides out the five
 * you use most. This one picks 🎉 by searching for it.
 */
export const ReactingInAThread: Story = {
  render: () => (
    <Stage>
      <Thread thread={thread("toggle")} onClose={() => undefined} />
    </Stage>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getAllByRole("button", { name: "Add a reaction" })[0]!)
    // The picker focuses its search as it opens, so typing goes there.
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Search emoji" })).toHaveFocus())
    await userEvent.keyboard("tada")
    await userEvent.keyboard("{Enter}")
    await waitFor(() => expect(canvas.getAllByRole("button", { name: /🎉/ }).length).toBeGreaterThan(0))
  }
}
