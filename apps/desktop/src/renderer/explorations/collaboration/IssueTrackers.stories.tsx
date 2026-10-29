import type { Meta, StoryObj } from "@storybook/react-vite"
import { useState } from "react"
import { expect, screen, userEvent, within } from "storybook/test"
import { thread, type ThreadData } from "./collab-data.ts"
import { Thread } from "./comments.tsx"
import { IssueDialog, orgTrackers, OrgTrackers, trackers } from "./issues.tsx"
import { Stage } from "./stage.tsx"

/**
 * Turning a thread into an issue in GitHub, Linear or Azure DevOps, or linking it to one that exists. What's offered
 * depends on the trackers the org has added, in its settings in the portal. Once linked, the thread shows the issue and
 * its status, and offers to resolve when the issue's done.
 */
const meta = {
  title: "Parity/Explorations/Collaboration/Issue trackers",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function FromAThreadDemo() {
  const [added, setAdded] = useState(orgTrackers)
  return (
    <Stage className="flex items-start gap-10">
      <OrgTrackers added={added} onChange={setAdded} />
      <Thread thread={thread("toggle")} trackers={added} onClose={() => {}} />
    </Stage>
  )
}

/**
 * From a thread's menu, Create issue lists the trackers the org has added, then Link an existing issue and a way to add
 * a tracker. Kestrel has GitHub and Linear; add Azure DevOps, or remove one, and the thread's list follows.
 */
export const FromAThread: Story = {
  render: () => <FromAThreadDemo />,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getAllByRole("button", { name: "More" })[0]!)
    await userEvent.click(await screen.findByRole("menuitem", { name: "Create issue" }))
    await expect(await screen.findByRole("menuitem", { name: /In Linear/ })).toBeInTheDocument()
  }
}

function DialogDemo({ tracker, mode }: { tracker: "github" | "linear" | "azure"; mode: "create" | "link" }) {
  const [open, setOpen] = useState(true)
  return (
    <Stage>
      <button type="button" className="text-sm text-muted-foreground underline" onClick={() => setOpen(true)}>
        Open the dialog again
      </button>
      <IssueDialog
        open={open}
        onOpenChange={setOpen}
        thread={thread("toggle")}
        available={Object.values(trackers)}
        initial={{ tracker, mode }}
        onLink={() => {}}
      />
    </Stage>
  )
}

/**
 * Creating an issue: the tracker, where it goes (a repository, team or project), and a title from the first comment.
 * The thread goes with it, with a snapshot of the frame and a link back, unless you turn that off.
 */
export const CreatingAnIssue: Story = { render: () => <DialogDemo tracker="linear" mode="create" /> }

/** Linking to an issue that already exists, found by its key or title. */
export const LinkingAnIssue: Story = { render: () => <DialogDemo tracker="azure" mode="link" /> }

const linked: ThreadData = {
  ...thread("toggle"),
  unread: false,
  issue: {
    tracker: "linear",
    key: "WEB-142",
    title: "Move the billing toggle above the plan cards",
    place: "Website (WEB)",
    status: { label: "In Progress", active: true }
  }
}

const done: ThreadData = {
  ...thread("wrap"),
  working: undefined,
  issue: {
    tracker: "github",
    key: "#447",
    title: "Plan names wrap on small phones",
    place: "kestrel/website",
    status: { label: "Closed", done: true }
  }
}

const azure: ThreadData = {
  id: "azure",
  design: "Checkout",
  layer: "Coupon field",
  frame: "Desktop",
  issue: {
    tracker: "azure",
    key: "#1142",
    title: "Coupon field below the total",
    place: "Kestrel / Website",
    status: { label: "New" }
  },
  comments: thread("coupon").comments.slice(0, 1)
}

/**
 * A linked thread: the issue under the thread's header, with its status as the tracker words it. When the issue is
 * done, the thread asks whether to resolve too. Unlink is in the thread's menu.
 */
export const LinkedIssues: Story = {
  render: () => (
    <Stage className="flex flex-wrap items-start gap-8">
      <Thread thread={linked} onClose={() => {}} />
      <Thread thread={done} onClose={() => {}} />
      <Thread thread={azure} trackers={[trackers.azure]} onClose={() => {}} />
    </Stage>
  )
}

/** An org with no issue trackers: Create issue says so, and offers to add one. */
export const NoTrackersYet: Story = {
  render: () => (
    <Stage>
      <Thread thread={thread("toggle")} trackers={[]} onClose={() => {}} />
    </Stage>
  ),
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getAllByRole("button", { name: "More" })[0]!)
    await userEvent.click(await screen.findByRole("menuitem", { name: "Create issue" }))
    await expect(await screen.findByText(/hasn't added an issue tracker/)).toBeInTheDocument()
  }
}
