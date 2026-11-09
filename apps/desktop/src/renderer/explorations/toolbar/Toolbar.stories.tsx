import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@buildkitgg/shadcn-baseui-kit"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { Window } from "../../chrome/chrome-fixtures.tsx"
import { clearNotifications, frameDesigns, openProjects } from "../../stories/fixtures.tsx"
import { ToolbarStage } from "./stage.tsx"

/**
 * A refresh of the floating toolbar (PAR-780). Each story is the whole app on the example, with one option in place of
 * today's toolbar, and all of it works: pick a tool, open the frame menu, press Insert, undo, zoom. Compare them with
 * Today.
 *
 * Every option fixes what's broken today: the separators run the bar's full height, the picked tool keeps its rounded
 * corners, and the picked tool is shown with the kit's own pressed look rather than a solid white block. Every option
 * also adds Insert, the picker that places a component, icon or image, which today only / and the menus reach.
 */
const meta = {
  title: "Parity/Explorations/Toolbar",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

/** The whole window on the example, with Pricing and Dashboard framed. */
const onCanvas = {
  decorators: [Window],
  loaders: [clearNotifications, () => openProjects("example")],
  play: () => frameDesigns("Pricing", "Dashboard")
} satisfies Story

/** The toolbar as the app has it, for comparison. */
export const Today: Story = {
  ...onCanvas,
  render: () => <ToolbarStage />
}

/** A: today's toolbar fixed, with Insert after Text. History and zoom stay at the top right. */
export const Tidied: Story = {
  ...onCanvas,
  render: () => <ToolbarStage option="tidied" />
}

/**
 * B: one bar for everything on the canvas. Undo, Redo and the zoom level join the tools; the zoom level opens every
 * way to zoom, including Zoom to selection, which today only Shift+2 and the View menu reach. The top right of the
 * canvas is left clear.
 */
export const OneBar: Story = {
  ...onCanvas,
  render: () => <ToolbarStage option="one-bar" />
}

/**
 * C: A, with what engineers reach for at the end: a switch for the inspector's Code tab, and Search actions, the way to
 * every command the bar leaves out.
 */
export const WithCode: Story = {
  name: "With code",
  ...onCanvas,
  render: () => <ToolbarStage option="code" />
}

const audit: { control: string; today: string; proposed: string }[] = [
  { control: "Move and select (V), Hand (H)", today: "On the bar", proposed: "Keep" },
  { control: "Frame (F) and its sizes, New screen, New component", today: "On the bar", proposed: "Keep" },
  { control: "Text (T)", today: "On the bar", proposed: "Keep" },
  {
    control: "Insert (/)",
    today: "Keys and menus only",
    proposed: "Add after Text in every option: it's how components get onto a design"
  },
  { control: "Interact (I)", today: "On the bar", proposed: "Keep, set apart from the tools that make things" },
  { control: "Undo, Redo", today: "Top right", proposed: "Top right, or on the bar in B" },
  {
    control: "Zoom out, zoom level, zoom in, zoom to fit",
    today: "Top right, four buttons",
    proposed: "Top right, or one zoom menu on the bar in B that adds Zoom to selection"
  },
  { control: "Code tab", today: "Inspector tab", proposed: "Also a switch on the bar in C" },
  { control: "Search actions (Ctrl+K)", today: "Help menu and keys", proposed: "On the bar in C" },
  { control: "Console", today: "Status bar, with error counts", proposed: "Leave in the status bar" },
  {
    control: "Layers, Components, panels, layout grid",
    today: "View menu and keys",
    proposed: "Leave off: they change the window, not the canvas"
  },
  {
    control: "Align, arrange, export, copy as PNG",
    today: "Inspector, right-click menu, keys",
    proposed: "Leave off: they act on the selection, so they belong beside it"
  }
]

/** What's on the toolbar today, and what each option keeps, adds and leaves off. */
export const Audit: Story = {
  render: () => (
    <div className="min-h-screen bg-background p-8 text-foreground">
      <h1 className="mb-4 text-lg font-semibold">What belongs on the toolbar</h1>
      <Table className="max-w-4xl">
        <TableHeader>
          <TableRow>
            <TableHead>Control</TableHead>
            <TableHead>Today</TableHead>
            <TableHead>Proposed</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {audit.map((row) => (
            <TableRow key={row.control}>
              <TableCell className="font-medium whitespace-normal">{row.control}</TableCell>
              <TableCell className="whitespace-normal text-muted-foreground">{row.today}</TableCell>
              <TableCell className="whitespace-normal">{row.proposed}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
