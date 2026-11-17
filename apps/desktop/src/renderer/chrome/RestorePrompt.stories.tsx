import type { RecoveryCopy } from "@parity-app/editor"
import { restoreCopy } from "@parity-app/multiplayer"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, userEvent, within } from "storybook/test"
import { AppWindow } from "../App.tsx"
import { undo } from "../project-doc.ts"
import { clearNotifications, example, frameDesigns, openProject } from "../stories/fixtures.tsx"
import { renameDesign, Window } from "./chrome-fixtures.tsx"
import { askToRestore } from "./restore.ts"
import { RestorePrompt } from "./RestorePrompt.tsx"

/**
 * The offer as a project opens, when Parity closed before its changes were saved (PAR-905): a crash, a forced quit, or
 * an agent stopping it. Restore is focused, so Enter restores; the changes come back unsaved, as one step Undo
 * takes back. Discard drops the copy. Escape and clicking away do nothing.
 */
const meta = {
  title: "Parity/Chrome/Prompts/Restore",
  component: RestorePrompt,
  render: () => (
    <>
      <AppWindow />
      <RestorePrompt />
    </>
  ),
  decorators: [Window],
  loaders: [clearNotifications]
} satisfies Meta<typeof RestorePrompt>

export default meta

type Story = StoryObj<typeof meta>

const body = () => within(document.body)

/** Twelve minutes ago, when the last change was kept. */
const keptAt = () => new Date(Date.now() - 12 * 60_000).toISOString()

/**
 * Opens the example as it would open after the crash: its files as saved, with a copy of a rename that never reached
 * them.
 */
async function openWithCopy(): Promise<RecoveryCopy> {
  await openProject("example")
  const session = example()
  renameDesign("Pricing", "Pricing (annual)")
  const copy = session.saver.recoveryCopy()!
  undo(session)

  return copy
}

/** Asks as the app does, and restores or drops the copy by the answer. */
async function offer(copy: RecoveryCopy): Promise<void> {
  const choice = await askToRestore({ keptAt: keptAt() })

  if (choice === "restore") {
    restoreCopy(example().doc, copy)
  }
}

/** The offer over the project it's about, with the canvas as the files left it. */
export const Offered: Story = {
  play: async () => {
    const copy = await openWithCopy()
    await frameDesigns("Pricing", "Dashboard")
    void offer(copy)
    await body().findByRole("alertdialog")
  }
}

/** Choosing Restore: the rename is back, unsaved, so the tab shows its dot and Save writes it. */
export const Restored: Story = {
  play: async () => {
    const copy = await openWithCopy()
    await frameDesigns("Pricing", "Dashboard")
    const answered = offer(copy)
    await userEvent.click(await body().findByRole("button", { name: "Restore" }))
    await answered
    await body().findByRole("button", { name: /which has unsaved changes/ })
    await expect(example().doc.history().undo[0]).toBe("Restore unsaved changes")
  }
}

/** Choosing Discard: the project stays as its files have it. */
export const Discarded: Story = {
  play: async () => {
    const copy = await openWithCopy()
    await frameDesigns("Pricing", "Dashboard")
    const answered = offer(copy)
    await userEvent.click(await body().findByRole("button", { name: "Discard" }))
    await answered
    await expect(example().saver.hasUnsaved()).toBe(false)
  }
}
