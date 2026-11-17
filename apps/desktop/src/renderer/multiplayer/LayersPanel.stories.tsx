import { LayersPanelRow, type Member } from "@parity-app/presence-ui"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { ChartColumn, Frame, type LucideIcon, Square, Table, Type } from "lucide-react"
import { scrolls } from "../stories/canvas-kit.tsx"
import { members } from "./story-kit.tsx"

/**
 * Who has what selected, in the Layers panel: each row someone else has selected ends with their faces, as small as the
 * row allows, so you can find what they're on without looking for their outline on the canvas.
 */
const meta = {
  title: "Parity/Multiplayer/Layers panel",
  parameters: { layout: "fullscreen" },
  decorators: [scrolls]
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

const { mia, jonas, priya, claude, codex, sam } = members

const rows: { name: string; icon: LucideIcon; depth: number; selectedBy?: Member[]; selected?: boolean }[] = [
  { name: "Dashboard", icon: Frame, depth: 0 },
  { name: "Header", icon: Frame, depth: 1 },
  { name: "Heading", icon: Type, depth: 2, selectedBy: [claude] },
  { name: "Stats", icon: Frame, depth: 1 },
  { name: "Revenue", icon: Square, depth: 2, selectedBy: [mia], selected: true },
  { name: "Active users", icon: Square, depth: 2 },
  { name: "Churn", icon: Square, depth: 2, selectedBy: [jonas, priya] },
  { name: "Chart", icon: ChartColumn, depth: 1, selectedBy: [jonas, priya, codex, sam] },
  { name: "Table", icon: Table, depth: 1 }
]

/**
 * A design's layers with Claude Code on the heading, you and Mia on Revenue, Jonas and Priya on Churn, and four on the
 * chart, the fourth counted.
 */
export const WhoHasWhat: Story = {
  render: () => (
    <div className="flex min-h-screen flex-wrap content-start gap-6 bg-background p-6 text-foreground">
      {(["light", "dark"] as const).map((theme) => (
        <section key={theme} className={`${theme} flex flex-col gap-2 rounded-xl bg-background p-3 text-foreground`}>
          <h2 className="text-xs font-medium text-muted-foreground">{theme === "light" ? "Light" : "Dark"}</h2>
          <ul aria-label="Layers" className="w-64 rounded-lg border bg-background p-1.5">
            {rows.map((row) => (
              <LayersPanelRow key={row.name} {...row} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
