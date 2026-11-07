import type { Meta, StoryObj } from "@storybook/react-vite"
import { useEffect } from "react"
import { expect, userEvent, within } from "storybook/test"
import type { TelemetryState } from "../../shared/protocol.ts"
import { defaultTelemetry, setStoryTelemetry } from "../stories/host.ts"
import { AboutDialog } from "./AboutDialog.tsx"
import { closeDialog, openDialog } from "./app-dialogs.ts"
import { SettingsDialog } from "./SettingsDialog.tsx"
import { receiveTelemetry } from "./telemetry-setting.ts"

/** The real Settings and About dialogs, with a stand-in for main's Telemetry setting (PAR-626). */
function Preview({ telemetry, dialog }: { telemetry: TelemetryState; dialog: "settings" | "about" }) {
  useEffect(() => {
    setStoryTelemetry(telemetry)
    openDialog(dialog)
    return () => {
      closeDialog()
      receiveTelemetry(undefined)
    }
  }, [telemetry, dialog])
  return (
    <>
      <SettingsDialog />
      <AboutDialog build={{ version: "0.19.0", channel: "beta" }} />
    </>
  )
}

const meta = {
  title: "Parity/Chrome/Telemetry setting",
  component: Preview,
  args: { telemetry: defaultTelemetry, dialog: "settings" }
} satisfies Meta<typeof Preview>
export default meta
type Story = StoryObj<typeof meta>

/** Everything is sent until someone turns it down. */
export const Default: Story = {}

/** `PARITY_TELEMETRY` decides this run, so the switch shows it and can't be changed. */
export const SetByVariable: Story = {
  args: { telemetry: { ...defaultTelemetry, level: "off", overriddenBy: "PARITY_TELEMETRY" } }
}

export const DoNotTrack: Story = {
  args: { telemetry: { ...defaultTelemetry, level: "off", overriddenBy: "DO_NOT_TRACK" } }
}

/** Turning it off saves that and says what it means. */
export const TurningOff: Story = {
  play: async () => {
    const dialog = within(document.body)
    const share = await dialog.findByRole("switch", { name: "Share diagnostics" })
    await userEvent.click(share)
    await expect(await dialog.findByText("Nothing leaves this computer.")).toBeVisible()
    await expect(share).not.toBeChecked()
  }
}

/** About lists the level and the install ID with the versions, and copies them with the rest. */
export const About: Story = { args: { dialog: "about" } }

export const AboutTurnedOffByVariable: Story = {
  args: { dialog: "about", telemetry: { ...defaultTelemetry, level: "off", overriddenBy: "DO_NOT_TRACK" } }
}
