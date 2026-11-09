import type { Meta, StoryObj } from "@storybook/react-vite"
import { useEffect } from "react"
import { toast } from "sonner"
import { expect, userEvent, waitFor, within } from "storybook/test"
import { AppWindow, WindowBoundary } from "../App.tsx"
import { openProjects } from "../stories/fixtures.tsx"
import { closeDialog, openDialog } from "./app-dialogs.ts"
import { setBoundaryReporter, tripBoundary } from "./ErrorBoundary.tsx"
import { setLayout } from "./layout.ts"

/** The parts of the window a story can break, by boundary name. */
const parts = [
  "inspector.design",
  "inspector.code",
  "left.layers",
  "left.tokens",
  "canvas",
  "console",
  "status-bar",
  "tab-bar",
  "settings",
  "about",
  "project",
  "window"
] as const

interface Args {
  /** Which part fails. */
  part: (typeof parts)[number]
  /** How many draws in a row fail: 1 recovers on Try again; 2 fails again, and offers the next step. */
  failures: 1 | 2
  /** Whether Report a problem is there to open (PAR-635). */
  reportable: boolean
}

/** The real window with the example open and one part broken, as a bug would break it. */
function Broken({ part }: Args) {
  useEffect(() => {
    if (part === "settings" || part === "about") {
      openDialog(part)
    }

    return () => {
      setBoundaryReporter(undefined)
      closeDialog()
    }
  }, [part])

  return (
    <div className="h-screen">
      <WindowBoundary>
        <AppWindow />
      </WindowBoundary>
    </div>
  )
}

/**
 * When part of the window fails (PAR-667), it says so in its own place while the rest keeps working. A region, such as
 * the canvas or a panel's tab, shows what failed with its own icon, says the changes are kept, and offers to try again;
 * if that fails too, it offers to reopen the project, which saves first. Bars say so in a line, dialogs in a dialog of
 * their own, and what's drawn over the canvas fails without a word. The error is folded away under Details.
 */
const meta = {
  title: "Parity/Chrome/Error boundary",
  component: Broken,
  parameters: { layout: "fullscreen" },
  args: { part: "inspector.design", failures: 1, reportable: true },
  argTypes: {
    part: { control: "select", options: parts },
    failures: { control: "inline-radio", options: [1, 2] }
  },
  loaders: [
    async ({ args }) => {
      await openProjects("example")
      setLayout({
        console: args.part === "console",
        leftTab: args.part === "left.tokens" ? "tokens" : undefined,
        rightTab: args.part === "inspector.code" ? "code" : undefined
      })
      // Set before the window draws, since the part fails on its first draw.
      setBoundaryReporter(
        args.reportable ? (_error, { name }) => toast(`Report a problem would open, for ${name}`) : undefined
      )
      tripBoundary(args.part, args.failures)
    }
  ]
} satisfies Meta<typeof Broken>

export default meta

type Story = StoryObj<typeof meta>

/** The Design tab failed: the Inspector's other tabs, the canvas and the Layers panel carry on. */
export const PanelTab: Story = {}

/** The canvas failed; the panels around it carry on. */
export const Canvas: Story = { args: { part: "canvas" } }

/** Trying again failed too, so the canvas offers to reopen the project. */
export const FailedAgain: Story = {
  args: { part: "canvas", failures: 2 },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement)
    await userEvent.click(await page.findByRole("button", { name: "Try again" }))
    await expect(await page.findByText("Canvas stopped working again")).toBeVisible()
    await expect(page.getByRole("button", { name: "Reopen project" })).toBeVisible()
  }
}

/** The console failed, in its place under the canvas. */
export const Console: Story = { args: { part: "console" } }

/** The status bar failed: it says so in a line. */
export const StatusBar: Story = { args: { part: "status-bar" } }

/** The tab bar failed: it says so in a line, and the window can still be dragged by it. */
export const TabBar: Story = { args: { part: "tab-bar" } }

/** Settings failed: it says so in a dialog of its own, which can try again or close it. */
export const Dialog: Story = { args: { part: "settings" } }

/** Something none of the closer boundaries caught, around the whole project. */
export const Project: Story = { args: { part: "project" } }

/** The last resort, around the whole window. Trying again redraws it; after that, it reloads the window. */
export const Window: Story = { args: { part: "window" } }

/** Before Report a problem is there to open (PAR-635), the fallback leaves it out. */
export const WithoutReport: Story = { args: { reportable: false } }

/** Trying again draws the tab afresh, and it works. */
export const TryAgain: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement)
    await expect(await page.findByRole("alert")).toHaveTextContent("Design stopped working")
    await userEvent.click(page.getByRole("button", { name: "Try again" }))
    await expect(page.queryByText("Design stopped working")).toBeNull()
  }
}

/**
 * A test more than a picture: Settings fails, its corner button closes it, and opening Settings again draws it
 * afresh, so it ends on the real Settings dialog. Watch it run in the Interactions panel.
 */
export const CloseAndReopenDialog: Story = {
  args: { part: "settings" },
  play: async () => {
    const page = within(document.body)
    const dialog = await page.findByRole("alertdialog")
    await expect(dialog).toHaveTextContent("Settings stopped working")
    await userEvent.click(within(dialog).getByRole("button", { name: "Close" }))
    await expect(page.queryByRole("alertdialog")).toBeNull()
    openDialog("settings")
    // It fades in, so it's visible a moment after it opens.
    const description = await page.findByText("For every project, and remembered between runs.")
    await waitFor(() => expect(description).toBeVisible())
  }
}
