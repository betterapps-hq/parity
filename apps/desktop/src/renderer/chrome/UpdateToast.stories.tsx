import { Toaster } from "@buildkitgg/shadcn-baseui-kit"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { useEffect, useState } from "react"
import { fn } from "storybook/test"
import { notify } from "../toasts.tsx"
import { type UpdateNotice, updateToast } from "./UpdateToast.tsx"

/**
 * Update notifications in the app's toast host, at its place above the status bar. No updater runs, and the buttons
 * only record that they were pressed.
 */
function UpdateNotification({ notice, onAction }: { notice: UpdateNotice; onAction: () => void }) {
  useEffect(() => {
    const { kind, title, options } = updateToast(notice, onAction)
    notify.show(kind, title, { ...options, id: "storybook-update", timeout: 0 })
  }, [notice, onAction])
  useEffect(() => () => notify.close("storybook-update"), [])
  return (
    <div className="h-screen bg-background text-foreground">
      <Toaster />
    </div>
  )
}

const meta = {
  title: "Parity/Chrome/Updates",
  component: UpdateNotification,
  parameters: { layout: "fullscreen" },
  args: {
    notice: { kind: "downloading", version: "0.4.0", percent: 42, transferred: 54_200_000, total: 129_000_000 },
    onAction: fn()
  }
} satisfies Meta<typeof UpdateNotification>

export default meta
type Story = StoryObj<typeof meta>

/** Progress is shown only after an explicit Check for updates; automatic downloads stay silent. */
export const Downloading: Story = { name: "Manual check downloading" }

export const Checking: Story = { args: { notice: { kind: "checking", beta: false } } }
export const NoUpdate: Story = { args: { notice: { kind: "current", beta: false } } }
export const NoUpdateWithBeta: Story = { args: { notice: { kind: "current", beta: true } } }
export const CheckFailed: Story = { args: { notice: { kind: "error" } } }

/** The first notification from an automatic background download. */
export const ReadyToRestart: Story = { args: { notice: { kind: "ready", version: "0.4.0" } } }

export const MacDownload: Story = { args: { notice: { kind: "manual", version: "0.4.0" } } }

/** A download without a reported length remains indeterminate instead of claiming a percentage. */
export const UnknownSize: Story = {
  args: { notice: { kind: "downloading", version: "0.4.0", percent: 0, transferred: 0, total: 0 } }
}

/** One notification changing in place as the download goes on and finishes. These buttons are only in Storybook. */
function DownloadFlow() {
  const [notice, setNotice] = useState<UpdateNotice>({
    kind: "downloading",
    version: "0.4.0",
    percent: 42,
    transferred: 54_200_000,
    total: 129_000_000
  })
  const [onAction] = useState(() => () => notify.close("storybook-update"))
  return (
    <div className="relative">
      <div className="absolute top-8 left-8 z-10 flex gap-3 text-xs text-foreground">
        <button
          className="rounded-md border px-3 py-2"
          onClick={() =>
            setNotice({
              kind: "downloading",
              version: "0.4.0",
              percent: 42,
              transferred: 54_200_000,
              total: 129_000_000
            })
          }
        >
          Downloading
        </button>
        <button className="rounded-md border px-3 py-2" onClick={() => setNotice({ kind: "ready", version: "0.4.0" })}>
          Ready to restart
        </button>
        <button className="rounded-md border px-3 py-2" onClick={() => setNotice({ kind: "manual", version: "0.4.0" })}>
          Mac download
        </button>
      </div>
      <UpdateNotification notice={notice} onAction={onAction} />
    </div>
  )
}

export const InToastHost: Story = { render: () => <DownloadFlow /> }
