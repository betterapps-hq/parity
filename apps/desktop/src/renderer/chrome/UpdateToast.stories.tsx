import type { Meta, StoryObj } from "@storybook/react-vite"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { fn } from "storybook/test"
import { Toaster } from "@/components/ui/sonner"
import { type UpdateNotice, UpdateToast } from "./UpdateToast.tsx"

/** Update notifications at their real size, with the same Sonner host and placement as the app. No updater runs. */
const meta = {
  title: "Parity/Chrome/Updates",
  component: UpdateToast,
  parameters: { layout: "centered" },
  args: {
    notice: { kind: "downloading", version: "0.4.0", percent: 42, transferred: 54_200_000, total: 129_000_000 },
    onDismiss: fn(),
    onAction: fn()
  }
} satisfies Meta<typeof UpdateToast>

export default meta
type Story = StoryObj<typeof meta>

export const Downloading: Story = {}

export const Checking: Story = { args: { notice: { kind: "checking", beta: false } } }
export const NoUpdate: Story = { args: { notice: { kind: "current", beta: false } } }
export const CheckFailed: Story = { args: { notice: { kind: "error" } } }

/** New check states shown together at their actual sizes for owner approval. */
export const CheckFeedbackReview: Story = {
  render: (args) => (
    <div className="grid gap-8 p-8 text-foreground sm:grid-cols-2">
      <div>
        <h2 className="mb-3 text-xs text-muted-foreground">Checking</h2>
        <UpdateToast {...args} notice={{ kind: "checking", beta: false }} />
      </div>
      <div>
        <h2 className="mb-3 text-xs text-muted-foreground">No update available</h2>
        <UpdateToast {...args} notice={{ kind: "current", beta: false }} />
      </div>
      <div>
        <h2 className="mb-3 text-xs text-muted-foreground">Check failed</h2>
        <UpdateToast {...args} notice={{ kind: "error" }} />
      </div>
      <div>
        <h2 className="mb-3 text-xs text-muted-foreground">Beta updates enabled</h2>
        <UpdateToast {...args} notice={{ kind: "current", beta: true }} />
      </div>
    </div>
  )
}

export const ReadyToRestart: Story = {
  args: { notice: { kind: "ready", version: "0.4.0" } }
}

export const MacDownload: Story = {
  args: { notice: { kind: "manual", version: "0.4.0" } }
}

/** A download without a reported length remains indeterminate instead of claiming a percentage. */
export const UnknownSize: Story = {
  args: { notice: { kind: "downloading", version: "0.4.0", percent: 0, transferred: 0, total: 0 } }
}

/** The three proposed designs together, using the real component and the app's theme tokens. */
export const DesignReview: Story = {
  render: (args) => (
    <div className="grid gap-8 p-8 text-foreground sm:grid-cols-2">
      <div>
        <h2 className="mb-3 text-xs text-muted-foreground">Downloading</h2>
        <UpdateToast {...args} />
      </div>
      <div>
        <h2 className="mb-3 text-xs text-muted-foreground">Ready to restart</h2>
        <UpdateToast {...args} notice={{ kind: "ready", version: "0.4.0" }} />
      </div>
      <div>
        <h2 className="mb-3 text-xs text-muted-foreground">Mac manual download</h2>
        <UpdateToast {...args} notice={{ kind: "manual", version: "0.4.0" }} />
      </div>
    </div>
  )
}

/** Controls let the reviewer watch the same toast change and dismiss it; these controls are only in Storybook. */
function DownloadFlow() {
  const [notice, setNotice] = useState<UpdateNotice>({
    kind: "downloading",
    version: "0.4.0",
    percent: 42,
    transferred: 54_200_000,
    total: 129_000_000
  })
  useEffect(() => {
    toast.custom(
      (id) => <UpdateToast notice={notice} onDismiss={() => toast.dismiss(id)} onAction={() => toast.dismiss(id)} />,
      { id: "storybook-update", duration: Infinity }
    )
    return () => {
      toast.dismiss("storybook-update")
    }
  }, [notice])
  return (
    <div className="min-h-screen bg-background p-8 text-foreground">
      <h1 className="text-sm font-medium">Update notification preview</h1>
      <p className="mt-2 text-xs text-muted-foreground">
        Use these story controls to change the notification. No files download and Parity does not restart.
      </p>
      <div className="mt-4 flex gap-3 text-xs">
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
      <Toaster position="bottom-right" offset={{ bottom: 40, right: 16 }} />
    </div>
  )
}

export const InToastHost: Story = {
  parameters: { layout: "fullscreen" },
  render: () => <DownloadFlow />
}
