import { FaceStack, PresentingBar, PresentInvite, RemotePointer } from "@parity-app/presence-ui"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { scrolls } from "../stories/canvas-kit.tsx"
import { CanvasBoard } from "../stories/CanvasBoard.tsx"
import { DashboardDesign } from "../stories/DashboardDesign.tsx"
import { Themes } from "../stories/Themes.tsx"
import { members, presences, TopRight } from "./story-kit.tsx"

/**
 * Presenting: someone asks everyone to follow them for a walkthrough, from their own card at the end of the stack.
 * Everyone else gets an invitation on the banner; following it is following them, framed and bannered as usual. The
 * presenter's canvas is framed in their color too, so they know they're live, with who's following and Stop.
 */
const meta = {
  title: "Parity/Multiplayer/Presenting",
  parameters: { layout: "fullscreen" },
  decorators: [scrolls]
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

const { mia, jonas, priya, sam } = presences

/** The invitation, as Jonas sees it when Mia starts presenting. */
export const AskedToFollow: Story = {
  render: () => (
    <Themes width={760} height={340}>
      {() => (
        <>
          <CanvasBoard name="Dashboard" x={48} y={64}>
            <DashboardDesign />
          </CanvasBoard>
          <RemotePointer member={members.mia} at={{ x: 236, y: 170 }} />
          <PresentInvite presenter={members.mia} />
          <TopRight>
            <FaceStack here={[mia, priya, sam]} you={members.you} />
          </TopRight>
        </>
      )}
    </Themes>
  )
}

/** Mia's side, with three people following. */
export const YourSide: Story = {
  render: () => (
    <Themes width={760} height={340}>
      {() => (
        <>
          <CanvasBoard name="Dashboard" x={48} y={64}>
            <DashboardDesign />
          </CanvasBoard>
          <PresentingBar presenter={members.mia} followers={[members.jonas, members.priya, members.sam]} />
          <TopRight>
            <FaceStack here={[jonas, priya, sam]} you={members.mia} />
          </TopRight>
        </>
      )}
    </Themes>
  )
}
