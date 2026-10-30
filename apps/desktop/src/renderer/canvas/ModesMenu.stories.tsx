import { defaultModeSettings, type ResolvedMode, resolveModes } from "@parity-app/core"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { useState } from "react"
import { userEvent, within } from "storybook/test"
import { ModesMenu } from "./ModesMenu.tsx"

const modes = resolveModes(defaultModeSettings)

function dark(mode: ResolvedMode): boolean {
  return mode.options.some(({ variable, option }) => variable.kind === "theme" && /dark/i.test(option.id))
}

/**
 * The modes menu on a board's title bar, with a sketch of the board under it: the main frame large, the others beside
 * it, smaller, as the canvas draws them.
 */
function Board({ main: initialMain, shown: initialShown }: { main: string; shown: string[] }) {
  const [main, setMain] = useState(initialMain)
  const [shown, setShown] = useState(initialShown)
  const mainMode = modes.find((mode) => mode.id === main)!
  const beside = modes.filter((mode) => mode.id !== main && shown.includes(mode.id))
  return (
    <div className="flex min-h-[28rem] flex-col items-start gap-3 bg-[#0e0e10] p-12">
      <div className="flex h-8 w-[36rem] items-center gap-3">
        <span className="text-sm font-medium text-foreground/90">Dashboard</span>
        <div className="ml-auto">
          <ModesMenu
            modes={modes}
            main={mainMode}
            beside={beside}
            triggerClassName="flex h-8 items-center gap-1.5 rounded-md border bg-background/80 px-2.5 text-sm shadow-xs backdrop-blur hover:bg-accent data-[state=open]:bg-accent"
            onChange={(nextMain, nextShown) => {
              setMain(nextMain)
              setShown(nextShown)
            }}
          />
        </div>
      </div>
      <div className="flex w-[36rem] items-start gap-3 rounded-2xl border bg-card p-4">
        {[mainMode, ...beside].map((mode, index) => (
          <div key={mode.id} className="flex flex-col gap-1.5">
            <span className="text-[11px] text-muted-foreground">{mode.name}</span>
            <div
              className={`rounded-md border ${dark(mode) ? "bg-[#1c1c20]" : "bg-white"}`}
              style={{
                width: index === 0 ? (mode.width / 1280) * 240 : Math.max(36, (mode.width / 1280) * 120),
                height: index === 0 ? 160 : 100
              }}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

const meta = {
  title: "Parity/Canvas/Modes menu",
  component: Board,
  parameters: { layout: "fullscreen" },
  args: { main: "desktop-light", shown: ["desktop-light", "desktop-dark", "mobile-light"] }
} satisfies Meta<typeof Board>

export default meta
type Story = StoryObj<typeof meta>

const openMenu: Story["play"] = async ({ canvasElement }) => {
  await userEvent.click(within(canvasElement).getByRole("button", { name: /^Modes/ }))
}

/** A screen in light desktop, with dark desktop and light mobile beside it, as the example project's screens are. */
export const Default: Story = {}

/** The menu open: every mode once, checked while it's on the board, the main one marked. */
export const Open: Story = { play: openMenu }

/** Only the main frame. */
export const MainOnly: Story = { args: { shown: ["desktop-light"] }, play: openMenu }

/** Every mode, with mobile as the main frame. */
export const EveryMode: Story = {
  args: { main: "mobile-light", shown: modes.map((mode) => mode.id) },
  play: openMenu
}
