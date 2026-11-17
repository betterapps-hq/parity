import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, userEvent, within } from "storybook/test"
import { AppWindow } from "../App.tsx"
import { clearNotifications, frameDesigns, holdToast, openProject, sessionAt } from "../stories/fixtures.tsx"
import { roots, service } from "../stories/host.ts"
import { workspace } from "../workspace.ts"
import { renameDesign, Window } from "./chrome-fixtures.tsx"
import { UnsavedPrompt } from "./UnsavedPrompt.tsx"

/**
 * The question before changes would be lost: closing the project, opening another in its place, or quitting, with
 * unsaved changes. Save is focused, so Enter saves; Escape or clicking away cancels.
 */
const meta = {
  title: "Parity/Chrome/Prompts/Unsaved changes",
  component: UnsavedPrompt,
  render: () => <AppWindow />,
  decorators: [Window],
  loaders: [clearNotifications]
} satisfies Meta<typeof UnsavedPrompt>

export default meta

type Story = StoryObj<typeof meta>

const body = () => within(document.body)

/** The example with a design renamed, unsaved. */
const exampleEdited = async () => {
  await openProject("example")
  renameDesign("Pricing", "Pricing (annual)")
}

/** Closes the example from its menu in the title bar, whose name shows a dot while it has unsaved changes. */
async function closeExample(): Promise<void> {
  await userEvent.click(await body().findByRole("button", { name: "shadcn-vite, unsaved changes" }))
  await userEvent.click(await body().findByRole("menuitem", { name: /Close project/ }))
  await body().findByRole("dialog")
}

/** Closing the project with unsaved changes. */
export const ClosingTheProject: Story = {
  loaders: [exampleEdited],
  play: async () => {
    await frameDesigns("Pricing (annual)", "Dashboard")
    await closeExample()
  }
}

/** Opening another project with unsaved changes: the question comes first, and the project stays if it's cancelled. */
export const OpeningAnotherProject: Story = {
  loaders: [exampleEdited],
  play: async () => {
    await frameDesigns("Pricing (annual)", "Dashboard")
    void workspace.open(roots.empty)
    await body().findByRole("dialog")
    await expect(sessionAt(roots.example).saver.hasUnsaved()).toBe(true)
  }
}

/** Quitting with the project's changes unsaved. */
export const Quitting: Story = {
  loaders: [exampleEdited],
  play: async () => {
    await frameDesigns("Pricing (annual)", "Dashboard")
    void workspace.confirmQuit()
    await body().findByRole("dialog")
  }
}

/**
 * Choosing Save while closing a project whose file can't be written: the question closes, the project stays open with
 * its changes, and a notification says why.
 */
export const SavingFails: Story = {
  loaders: [
    async () => {
      await exampleEdited()
      service.saveFails = true
    }
  ],
  play: async () => {
    await frameDesigns("Pricing (annual)", "Dashboard")
    await closeExample()
    await userEvent.click(body().getByRole("button", { name: "Save" }))
    await holdToast("Couldn't save the project")
    await expect(sessionAt(roots.example).saver.hasUnsaved()).toBe(true)
  }
}
