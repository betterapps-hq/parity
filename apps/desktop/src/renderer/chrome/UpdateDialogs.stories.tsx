import type { UpdateState } from "@parity-app/core"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { useEffect } from "react"
import { AboutDialog } from "./AboutDialog.tsx"
import { closeDialog, openDialog } from "./app-dialogs.ts"
import { AppMenu } from "./AppMenu.tsx"
import { SettingsDialog } from "./SettingsDialog.tsx"
import { receiveUpdate } from "./updates.tsx"

/** Real update controls with a stand-in host: these stories cannot download or install anything. */
function Preview({ state, dialog }: { state: UpdateState; dialog: "about" | "settings" }) {
  useEffect(() => {
    const previous = window.canvasHost.updates
    window.canvasHost.updates = {
      ...previous,
      check: async () => receiveUpdate({ phase: "current", beta: state.beta }),
      setBeta: async (beta) => receiveUpdate({ phase: "idle", beta })
    }
    receiveUpdate(state)
    openDialog(dialog)
    return () => {
      window.canvasHost.updates = previous
      closeDialog()
      receiveUpdate({ phase: "disabled", beta: false })
    }
  }, [state, dialog])
  return (
    <>
      <AboutDialog />
      <SettingsDialog />
    </>
  )
}

const meta = {
  title: "Parity/Chrome/Update controls",
  component: Preview,
  args: { state: { phase: "current", beta: false }, dialog: "about" }
} satisfies Meta<typeof Preview>
export default meta
type Story = StoryObj<typeof meta>

export const UpToDate: Story = {}
export const ReadyToRestart: Story = { args: { state: { phase: "ready", beta: false, version: "0.4.0" } } }
export const MacDownload: Story = { args: { state: { phase: "manual", beta: false, version: "0.4.0" } } }
export const CheckFailed: Story = {
  args: { state: { phase: "error", beta: false, message: "The connection is offline." } }
}
export const BetaSetting: Story = { args: { dialog: "settings", state: { phase: "idle", beta: false } } }
export const BetaEnabled: Story = { args: { dialog: "settings", state: { phase: "idle", beta: true } } }
export const DevelopmentBuild: Story = { args: { state: { phase: "disabled", beta: false } } }

export const HelpEntry: Story = {
  parameters: { layout: "fullscreen" },
  render: () => (
    <div className="min-h-screen bg-background p-4 text-foreground">
      <AppMenu />
    </div>
  )
}
