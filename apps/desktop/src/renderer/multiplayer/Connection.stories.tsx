import type { Meta, StoryObj } from "@storybook/react-vite"
import { scrolls } from "../stories/canvas-kit.tsx"
import { CanvasBoard } from "../stories/CanvasBoard.tsx"
import { DashboardDesign } from "../stories/DashboardDesign.tsx"
import { Themes } from "../stories/Themes.tsx"
import { ConnectionNote } from "./ConnectionNote.tsx"
import { FaceStack } from "./FaceStack.tsx"
import { members, presences } from "./story-kit.tsx"

/**
 * When the connection to the room drops, on the canvas's banner. Work carries on: changes are kept on this computer and
 * sync when it's back. Everyone else's pointers and selections are hidden meanwhile, since they'd be stale, and their
 * faces in the stack fade, though yours doesn't. While it reconnects, the banner says how many changes it's catching up
 * on, and whose.
 */
const meta = {
  title: "Parity/Multiplayer/Connection",
  parameters: { layout: "fullscreen" },
  decorators: [scrolls]
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

const { mia, jonas, claude } = presences

/** Offline: no one else's pointers or selections, their faces faded, and Try now. */
export const Offline: Story = {
  render: () => (
    <Themes width={760} height={300}>
      {() => (
        <>
          <CanvasBoard name="Dashboard" x={48} y={64}>
            <DashboardDesign />
          </CanvasBoard>
          <ConnectionNote state="offline" />
          <div className="absolute top-3 right-3 @max-[700px]:top-15">
            <FaceStack here={[mia, jonas, claude]} you={members.you} stale />
          </div>
        </>
      )}
    </Themes>
  )
}

/** Reconnecting, catching up on changes from Mia and Claude Code, whose faces end the note. */
export const Reconnecting: Story = {
  render: () => (
    <Themes width={760} height={300}>
      {() => (
        <>
          <CanvasBoard name="Dashboard" x={48} y={64}>
            <DashboardDesign />
          </CanvasBoard>
          <ConnectionNote state="reconnecting" catchingUp={[members.mia, members.claude]} changes={4} />
          <div className="absolute top-3 right-3 @max-[700px]:top-15">
            <FaceStack here={[mia, jonas, claude]} you={members.you} stale />
          </div>
        </>
      )}
    </Themes>
  )
}
