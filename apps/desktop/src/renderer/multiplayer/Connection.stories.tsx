import type { Meta, StoryObj } from "@storybook/react-vite"
import { CanvasBoard, DashboardDesign, scrolls, Themes } from "../stories/canvas-kit.tsx"
import { ConnectionNote } from "./ConnectionNote.tsx"
import { FaceStack } from "./FaceStack.tsx"
import { members, presences } from "./story-kit.tsx"

/**
 * When the connection to the room drops. Work carries on: changes are kept on this computer and sync when it's back.
 * Everyone else's pointers and selections are hidden meanwhile, since they'd be stale, and the stack fades. While it
 * reconnects, the note says whose changes it's catching up on.
 */
const meta = {
  title: "Parity/Multiplayer/Connection",
  parameters: { layout: "fullscreen" },
  decorators: [scrolls]
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

const { mia, jonas, claude } = presences

/** Offline: no one else's pointers or selections, the stack faded. */
export const Offline: Story = {
  render: () => (
    <Themes width={560} height={300}>
      {() => (
        <>
          <CanvasBoard name="Dashboard" x={48} y={64}>
            <DashboardDesign />
          </CanvasBoard>
          <ConnectionNote state="offline" />
          <div className="absolute top-3 right-3 opacity-50 grayscale-[0.5] @max-[460px]:top-12">
            <FaceStack here={[mia, jonas, claude]} size={24} />
          </div>
        </>
      )}
    </Themes>
  )
}

/** Reconnecting, catching up on changes from Mia and Claude Code, whose faces end the note. */
export const Reconnecting: Story = {
  render: () => (
    <Themes width={560} height={300}>
      {() => (
        <>
          <CanvasBoard name="Dashboard" x={48} y={64}>
            <DashboardDesign />
          </CanvasBoard>
          <ConnectionNote state="reconnecting" catchingUp={[members.mia, members.claude]} changes={4} />
          <div className="absolute top-3 right-3 opacity-50 grayscale-[0.5] @max-[460px]:top-12">
            <FaceStack here={[mia, jonas, claude]} size={24} />
          </div>
        </>
      )}
    </Themes>
  )
}
