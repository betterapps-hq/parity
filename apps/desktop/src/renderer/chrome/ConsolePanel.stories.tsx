import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, userEvent, within } from "storybook/test"
import type { LoggedEntry } from "../../shared/protocol.ts"
import { AppWindow } from "../App.tsx"
import { consoleLog } from "../console-store.ts"
import { design, example, onCanvas } from "../stories/fixtures.tsx"
import { showConsole } from "./ConsolePanel.tsx"
import { setLayout } from "./layout.ts"

/**
 * The console (PAR-147): what the project's designs write to the console, from the same log `parity console` gives
 * agents. The status bar counts the errors and warnings and opens it; it docks under the canvas, grouped by design,
 * worst first within each; and a design with errors or warnings says so beside its name on the canvas.
 */
const meta = {
  title: "Parity/Chrome/Console",
  component: AppWindow,
  decorators: [
    (Story) => (
      <div className="h-screen">
        <Story />
      </div>
    )
  ]
} satisfies Meta<typeof AppWindow>

export default meta
type Story = StoryObj<typeof meta>

const page = () => within(document.body)
const minutes = (count: number) => Date.now() - count * 60_000

/**
 * What the example's designs might have written, as the main process keeps it: a thrown error with its stack, React's
 * key warning from three frames, an input's warning, a library's log line, and a module that failed to load, which no
 * design wrote.
 */
function entries(guestUrl: string): LoggedEntry[] {
  const guest = new URL(guestUrl).origin
  const pricing = design("Pricing")
  const dashboard = design("Dashboard")
  const react = `${guest}/node_modules/.vite/deps/react-dom_client.js?v=4f2a`
  const keyWarning = (id: number, mode: string, first: number) =>
    ({
      id,
      level: "error",
      where: "canvas",
      design: pricing,
      state: "default",
      mode,
      text:
        'Each child in a list should have a unique "key" prop.\n\nCheck the render method of `PlanList`. See https://react.dev/link/warning-keys for more information.\n    at PlanList (' +
        `${guest}/src/components/ui/card.tsx?t=1730:10:5)`,
      source: react,
      line: 2120,
      count: 1,
      first: minutes(first),
      last: minutes(first > 1 ? first - 1 : 1)
    }) satisfies LoggedEntry
  return [
    {
      id: 1,
      level: "error",
      where: "canvas",
      design: pricing,
      state: "yearly",
      mode: "desktop-light",
      text: [
        "TypeError: Cannot read properties of undefined (reading 'price')",
        `    at PlanPrice (${guest}/src/components/ui/card.tsx?t=1730:88:23)`,
        `    at CardContent (${guest}/src/components/ui/card.tsx?t=1730:73:5)`,
        `    at Card (${guest}/src/components/ui/card.tsx?t=1730:10:5)`,
        `    at renderWithHooks (${react}:15486:18)`
      ].join("\n"),
      source: `${guest}/src/components/ui/card.tsx?t=1730`,
      line: 88,
      count: 1,
      first: minutes(2),
      last: minutes(2)
    },
    keyWarning(2, "desktop-light", 6),
    keyWarning(3, "desktop-dark", 5),
    keyWarning(4, "mobile-light", 4),
    {
      id: 5,
      level: "warning",
      where: "canvas",
      design: dashboard,
      state: "loading",
      mode: "desktop-light",
      text: "Received NaN for the `value` attribute. If this is expected, cast the value to a string.",
      source: `${guest}/src/components/ui/input.tsx`,
      line: 6,
      count: 12,
      first: minutes(9),
      last: minutes(3)
    },
    {
      id: 6,
      level: "info",
      where: "offscreen",
      design: dashboard,
      state: "default",
      mode: "desktop-light",
      text: "[chart] drew 12 points in 4.2ms",
      source: `${guest}/node_modules/.vite/deps/recharts.js?v=4f2a`,
      line: 311,
      count: 2,
      first: minutes(9),
      last: minutes(9)
    },
    {
      id: 7,
      level: "error",
      where: "offscreen",
      text: `Failed to fetch dynamically imported module: ${guest}/src/components/ui/chart.tsx`,
      source: `${guest}/@vite/client`,
      line: 1,
      count: 1,
      first: minutes(12),
      last: minutes(12)
    }
  ]
}

/** The example on the canvas, Pricing and Dashboard framed, with the designs' messages logged, the console open or not. */
const logged = (open: boolean, then?: () => Promise<void>) =>
  onCanvas(
    ["Pricing", "Dashboard"],
    () => {
      setLayout({ console: open, consoleHeight: 300 })
      showConsole(undefined)
      setLayout({ console: open })
      const { id, info } = example()
      const log = consoleLog(id)
      log.clear()
      log.update(entries(info.guestUrl), info.guestUrl)
    },
    then
  )

/**
 * Errors and warnings logged, the console closed: the status bar counts them, and Pricing and Dashboard each say how
 * many of their own beside their names on the canvas.
 */
export const Counted: Story = logged(false, async () => {
  await page().findByRole("button", { name: "3 errors and 1 warning" })
  await page().findByRole("button", { name: "2 errors from Pricing in the console" })
})

/**
 * The console open under the canvas: each design's messages under its name, with how often each came, the frames it
 * came from, the file and line it was written at, and when; then what the project wrote outside any design.
 */
export const Open: Story = logged(true, async () => {
  const panel = within(await page().findByRole("region", { name: "Console" }))
  await panel.findByText(/Cannot read properties of undefined/)
  await expect(panel.getByRole("region", { name: "Project" })).toBeVisible()
})

/** An error opened to its stack: each call, the project's own with their files and lines. */
export const ErrorStack: Story = logged(true, async () => {
  const panel = within(await page().findByRole("region", { name: "Console" }))
  const row = within((await panel.findByText(/Cannot read properties/)).closest("li")!)
  await userEvent.click(row.getByRole("button", { name: "Show the stack" }))
  await row.findByText("at PlanPrice (src/components/ui/card.tsx:88:23)")
  await row.findByText("at renderWithHooks (react-dom_client.js:15486:18)")
})

/** Pricing's badge on the canvas, clicked: the console opens on Pricing's messages alone. */
export const OneDesign: Story = logged(false, async () => {
  await userEvent.click(await page().findByRole("button", { name: "2 errors from Pricing in the console" }))
  const panel = within(await page().findByRole("region", { name: "Console" }))
  await expect(panel.queryByRole("region", { name: "Dashboard" })).toBeNull()
  await panel.findByRole("region", { name: "Pricing" })
})

/** Warnings only, by the level filter. */
export const WarningsOnly: Story = logged(true, async () => {
  const panel = within(await page().findByRole("region", { name: "Console" }))
  await userEvent.click(await panel.findByRole("button", { name: "Warnings, 1" }))
  await panel.findByText(/Received NaN/)
  await expect(panel.queryByText(/Cannot read properties/)).toBeNull()
})

/** Nothing logged: the console says what it shows, and that agents read the same log. */
export const NothingLogged: Story = onCanvas(["Pricing"], () => {
  setLayout({ console: true, consoleHeight: 240 })
  consoleLog(example().id).clear()
})
