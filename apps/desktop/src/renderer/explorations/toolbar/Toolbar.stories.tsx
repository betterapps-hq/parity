import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@buildkitgg/shadcn-baseui-kit"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { Window } from "../../chrome/chrome-fixtures.tsx"
import { clearNotifications, frameDesigns, openProjects } from "../../stories/fixtures.tsx"
import { ToolbarComparison } from "./bars.tsx"
import { ToolbarStage } from "./stage.tsx"

/**
 * A refresh of the floating toolbar (PAR-780). Each story is the whole app on the example, with one option in place of
 * today's toolbar, and all of it works: pick a tool, open the frame menu, press Insert, undo, zoom. Compare them with
 * Today.
 *
 * Every option fixes what's broken today: the separators run the bar's full height, and the picked tool keeps its
 * rounded corners and is picked out in the canvas's selection blue rather than a solid white block. Every option also
 * puts Hand in a menu beside Move and select, as Figma does, and adds Insert, the picker that places a component, icon
 * or image, which today only / and the menus reach.
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

/** A: today's toolbar fixed, with Insert after Text. Zoom stays at the top right, without Undo and Redo. */
export const Tidied: Story = {
  ...onCanvas,
  render: () => <ToolbarStage option="tidied" />
}

/**
 * B: one bar for everything on the canvas. The zoom level joins the tools and opens every way to zoom, including Zoom
 * to selection, which today only Shift+2 and the View menu reach. The top right of the canvas is left clear.
 */
export const OneBar: Story = {
  ...onCanvas,
  render: () => <ToolbarStage option="one-bar" />
}

/**
 * C: A, with the review tools from PAR-184's annotations design at the end: Annotate (Shift+T), with Comment (C) in its
 * menu. Picking one shows what a click does above the bar, and Done or Esc puts it down. Placing annotations and
 * threads is in the Annotations exploration, so a click on the canvas does nothing here. Search actions follows, the
 * way to every command the bar leaves out.
 */
export const WithReview: Story = {
  name: "With review",
  ...onCanvas,
  render: () => <ToolbarStage option="review" />
}

const audit: { control: string; today: string; proposed: string }[] = [
  {
    control: "Move and select (V), Hand (H)",
    today: "Two buttons on the bar",
    proposed: "One button with a menu, showing the one picked last; Space still pans with any tool"
  },
  { control: "Frame (F) and its sizes, New screen, New component", today: "On the bar", proposed: "Keep" },
  { control: "Text (T)", today: "On the bar", proposed: "Keep" },
  {
    control: "Insert (/)",
    today: "Keys and menus only",
    proposed: "Add after Text in every option: it's how components get onto a design"
  },
  { control: "Interact (I)", today: "On the bar", proposed: "Keep, set apart from the tools that make things" },
  {
    control: "Undo, Redo",
    today: "Top right, Edit menu and keys",
    proposed: "Leave off the canvas: the Edit menu and Ctrl+Z cover them"
  },
  {
    control: "Zoom out, zoom level, zoom in, zoom to fit",
    today: "Top right, four buttons",
    proposed: "Top right, or one zoom menu on the bar in B that adds Zoom to selection"
  },
  {
    control: "Annotate (Shift+T), Comment (C)",
    today: "Not built yet (PAR-184, PAR-372)",
    proposed: "One button with a menu on the bar in C, Annotate first"
  },
  { control: "Code tab", today: "Inspector tab", proposed: "Leave in the inspector" },
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
    <div className="h-screen overflow-y-auto bg-background p-8 text-foreground">
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

/**
 * The bars on their own, beside Figma's, Penpot's, Framer's, tldraw's and Excalidraw's, with what the others have in
 * common.
 */
export const Bars: Story = {
  loaders: [() => openProjects("example")],
  render: () => <ToolbarComparison />
}
