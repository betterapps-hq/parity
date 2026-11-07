import type { Meta, StoryObj } from "@storybook/react-vite"
import { useState } from "react"
import screenshotUrl from "../stories/bitmaps/sign-in-desktop-light.png?url"
import { type LastCrash, type ReportPhase, ReportProblemView } from "./ReportProblemDialog.tsx"

/** The dialog with its own text and checkbox state; Send moves to `next` after a moment. */
function Preview({
  state,
  crash,
  next,
  text
}: {
  state: ReportPhase
  crash?: LastCrash
  next?: ReportPhase
  text?: string
}) {
  const [phase, setPhase] = useState(state)
  const [description, setDescription] = useState(text ?? "")
  const [screenshot, setScreenshot] = useState(true)
  return (
    <ReportProblemView
      open
      onOpenChange={() => setPhase({ phase: "editing" })}
      state={phase}
      description={description}
      onDescriptionChange={setDescription}
      screenshot={screenshot}
      onScreenshotChange={setScreenshot}
      screenshotUrl={screenshotUrl}
      projects={["marketing-site", "design-system"]}
      crash={crash}
      onSend={() => {
        setPhase({ phase: "sending" })
        setTimeout(() => setPhase(next ?? { phase: "sent" }), 1200)
      }}
    />
  )
}

const meta = {
  title: "Parity/Chrome/Report a problem",
  component: Preview,
  args: { state: { phase: "editing" } }
} satisfies Meta<typeof Preview>
export default meta
type Story = StoryObj<typeof meta>

export const Empty: Story = {}
export const Written: Story = {
  args: { text: "Dragging a frame onto another board left a copy behind on the first one." }
}
export const AfterACrash: Story = {
  args: { crash: { when: "Today at 14:02" } }
}
export const Sending: Story = { args: { state: { phase: "sending" }, text: "The layers panel stopped updating." } }
export const Sent: Story = {
  args: { state: { phase: "sent" } }
}
export const Failed: Story = {
  args: { state: { phase: "failed" }, text: "The layers panel stopped updating." }
}
