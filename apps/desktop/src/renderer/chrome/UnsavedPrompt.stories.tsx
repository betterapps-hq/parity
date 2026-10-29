import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, userEvent, within } from "storybook/test"
import { AppWindow } from "../App.tsx"
import {
  blankProjectAt,
  clearNotifications,
  frameDesigns,
  holdToast,
  openAlso,
  openProjects,
  sessionAt
} from "../stories/fixtures.tsx"
import { roots, service } from "../stories/host.ts"
import { workspace } from "../workspace.ts"
import { addNote, renameDesign, Window } from "./chrome-fixtures.tsx"
import { UnsavedPrompt } from "./UnsavedPrompt.tsx"

/**
 * The question before changes would be lost: closing a tab, or quitting, with unsaved changes. Save is focused, so
 * Enter saves; Escape or clicking away cancels.
 */
const meta = {
  title: "Parity/Chrome/Unsaved prompt",
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
  await openProjects("example")
  renameDesign("Pricing", "Pricing (annual)")
}

/** Closes the example's tab with its close button, which shows a dot while it has unsaved changes. */
async function closeExampleTab(): Promise<void> {
  await userEvent.click(await body().findByRole("button", { name: /^Close shadcn-vite, which has unsaved changes/ }))
  await body().findByRole("dialog")
}

/** Made-up projects, with no designs, for quitting with several unsaved. */
const others = ["marketing-site", "admin-console", "design-system", "customer-onboarding-and-billing-portal"].map(
  (name) => `D:/projects/${name}`
)

/** Closing a tab with unsaved changes. */
export const ClosingATab: Story = {
  loaders: [exampleEdited],
  play: async () => {
    await frameDesigns("Pricing (annual)", "Dashboard")
    await closeExampleTab()
  }
}

/** Quitting with one project's changes unsaved, while another project is open with none. */
export const QuittingWithOneUnsaved: Story = {
  loaders: [
    async () => {
      await exampleEdited()
      await openAlso(blankProjectAt(others[0]!))
    }
  ],
  play: async () => {
    await frameDesigns("Pricing (annual)", "Dashboard")
    void workspace.confirmQuit()
    await body().findByRole("dialog")
  }
}

/** Quitting with three projects' changes unsaved: one question for all of them, and Save all. */
export const QuittingWithSeveralUnsaved: Story = {
  loaders: [
    async () => {
      await exampleEdited()
      await openAlso(...others.slice(0, 2).map(blankProjectAt))
      for (const root of others.slice(0, 2)) addNote(sessionAt(root), "Check the spacing on mobile")
    }
  ],
  play: async () => {
    await frameDesigns("Pricing (annual)", "Dashboard")
    void workspace.confirmQuit()
    await body().findByRole("dialog")
  }
}

/** Quitting with two projects' changes unsaved, one of them with a long name. */
export const QuittingWithTwoUnsaved: Story = {
  loaders: [
    async () => {
      await exampleEdited()
      await openAlso(blankProjectAt(others[3]!))
      addNote(sessionAt(others[3]!), "Check the spacing on mobile")
    }
  ],
  play: async () => {
    await frameDesigns("Pricing (annual)", "Dashboard")
    void workspace.confirmQuit()
    await body().findByRole("dialog")
  }
}

/**
 * Choosing Save while closing a tab whose file can't be written: the question closes, the tab stays open with its
 * changes, and a notification says why.
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
    await closeExampleTab()
    await userEvent.click(body().getByRole("button", { name: "Save" }))
    await holdToast("Couldn't save shadcn-vite")
    await expect(workspace.getTab(roots.example)?.session?.store.hasUnsaved()).toBe(true)
  }
}
