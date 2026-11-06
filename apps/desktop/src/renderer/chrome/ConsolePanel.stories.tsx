import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, userEvent, within } from "storybook/test"
import { AppWindow } from "../App.tsx"
import { type ConsoleMessage, consoleLog } from "../console-store.ts"
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
const guest = "http://localhost:5173"

/** What the example's designs might have written: React's warnings, a thrown error, a library's warning, a log line. */
function messages(): ConsoleMessage[] {
  const pricing = design("Pricing")
  const dashboard = design("Dashboard")
  const at = (path: string, line: number, column = 5) => ({ path, line, column })
  const base = { where: "canvas" as const, source: `${guest}/src/App.tsx`, line: 1 }
  return [
    {
      ...base,
      id: "1",
      level: "error",
      design: pricing,
      text: "TypeError: Cannot read properties of undefined (reading 'price')",
      frames: [{ state: "yearly", mode: "desktop-light" }],
      at: at("src/components/ui/card.tsx", 88, 23),
      stack: [
        "at PlanPrice (src/components/ui/card.tsx:88:23)",
        "at CardContent (src/components/ui/card.tsx:73:5)",
        "at Card (src/components/ui/card.tsx:10:5)",
        "at renderWithHooks (react-dom.development.js:15486:18)"
      ],
      count: 1,
      first: minutes(2),
      last: minutes(2)
    },
    {
      ...base,
      id: "2",
      level: "error",
      design: pricing,
      text: 'Each child in a list should have a unique "key" prop.\n\nCheck the render method of `PlanList`. See https://react.dev/link/warning-keys for more information.',
      frames: [
        { state: "default", mode: "desktop-light" },
        { state: "default", mode: "desktop-dark" },
        { state: "default", mode: "mobile-light" }
      ],
      at: at("src/components/ui/card.tsx", 10),
      count: 3,
      first: minutes(6),
      last: minutes(1)
    },
    {
      ...base,
      id: "3",
      level: "warning",
      design: dashboard,
      text: "Received NaN for the `value` attribute. If this is expected, cast the value to a string.",
      frames: [{ state: "loading", mode: "desktop-light" }],
      at: at("src/components/ui/input.tsx", 6),
      count: 12,
      first: minutes(9),
      last: minutes(3)
    },
    {
      ...base,
      id: "4",
      level: "info",
      design: dashboard,
      text: "[chart] drew 12 points in 4.2ms",
      frames: [{ state: "default", mode: "desktop-light" }],
      count: 2,
      first: minutes(9),
      last: minutes(9)
    },
    {
      ...base,
      id: "5",
      level: "error",
      where: "offscreen",
      text: "Failed to fetch dynamically imported module: http://localhost:5173/src/components/ui/chart.tsx",
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
      const log = consoleLog(example().id)
      log.clear()
      log.add(messages())
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
  await userEvent.click(await panel.findByRole("button", { name: "Show the stack" }))
  await panel.findByText("at PlanPrice (src/components/ui/card.tsx:88:23)")
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
