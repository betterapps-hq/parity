import { Toaster } from "@buildkitgg/shadcn"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { useEffect } from "react"
import { fn } from "storybook/test"
import { slowToast } from "./extension-time.ts"
import { notify } from "./toasts.tsx"

/**
 * The warning a window module past its main-thread budget shows in development (PAR-1283), in the app's toast host.
 * Turn off only records that it was pressed.
 */
function SlowExtension({ name, onTurnOff }: { name: string; onTurnOff: () => void }) {
  useEffect(() => {
    const { kind, title, options } = slowToast(name, onTurnOff)
    notify.show(kind, title, { ...options, id: "storybook-slow-extension", timeout: 0 })
  }, [name, onTurnOff])

  useEffect(() => () => notify.close("storybook-slow-extension"), [])

  return (
    <div className="h-screen bg-background text-foreground">
      <Toaster />
    </div>
  )
}

const meta = {
  title: "Parity/Chrome/Notices/Slow extension",
  component: SlowExtension,
  parameters: { layout: "fullscreen" },
  args: { name: "Multiplayer", onTurnOff: fn() }
} satisfies Meta<typeof SlowExtension>

export default meta

type Story = StoryObj<typeof meta>

export const Multiplayer: Story = {}

export const AgentPresence: Story = { args: { name: "Agent presence" } }
