import type { Meta, StoryObj } from "@storybook/react-vite"
import { CanvasBoard, DashboardDesign, scrolls, Themes } from "../stories/canvas-kit.tsx"
import { FaceStack } from "./FaceStack.tsx"
import { PresentingBar } from "./PresentingBar.tsx"
import { PresentInvite } from "./PresentInvite.tsx"
import { RemotePointer } from "./RemotePointer.tsx"
import { members, presences } from "./story-kit.tsx"

/**
 * Presenting: someone asks everyone to follow them for a walkthrough. Everyone else gets an invitation where the follow
 * banner would be; following it is following them, framed and bannered as usual. The presenter gets a banner of their
 * own, in their color, with who's following and the way to stop.
 */
const meta = {
  title: "Parity/Multiplayer/Presenting",
  parameters: { layout: "fullscreen" },
  decorators: [scrolls]
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

const { mia, jonas, priya, sam } = presences

/** The invitation, as Jonas sees it when Mia starts presenting the Dashboard. */
export const AskedToFollow: Story = {
  render: () => (
    <Themes width={560} height={340}>
      {() => (
        <>
          <CanvasBoard name="Dashboard" x={48} y={64}>
            <DashboardDesign />
          </CanvasBoard>
          <RemotePointer member={members.mia} at={{ x: 236, y: 170 }} />
          <PresentInvite presenter={members.mia} board="Dashboard" />
          <div className="absolute top-3 right-3 @max-[460px]:top-12">
            <FaceStack here={[mia, priya, sam]} size={24} />
          </div>
        </>
      )}
    </Themes>
  )
}

/** Mia's side, with three people following. */
export const YourSide: Story = {
  render: () => (
    <Themes width={560} height={340}>
      {() => (
        <>
          <CanvasBoard name="Dashboard" x={48} y={64}>
            <DashboardDesign />
          </CanvasBoard>
          <PresentingBar presenter={members.mia} followers={[members.jonas, members.priya, members.sam]} />
          <div className="absolute top-3 right-3 @max-[460px]:top-12">
            <FaceStack here={[jonas, priya, sam]} size={24} />
          </div>
        </>
      )}
    </Themes>
  )
}
