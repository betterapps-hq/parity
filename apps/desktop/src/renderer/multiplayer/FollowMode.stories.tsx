import { Button } from "@buildkitgg/shadcn"
import { FaceStack, FollowLayer, type FollowState, RemotePointer } from "@parity-app/presence-ui"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { type Theme, scrolls } from "../stories/canvas-kit.tsx"
import { CanvasBoard } from "../stories/CanvasBoard.tsx"
import { CanvasPane } from "../stories/CanvasPane.tsx"
import { DashboardDesign } from "../stories/DashboardDesign.tsx"
import { Themes } from "../stories/Themes.tsx"
import { useClock } from "../stories/useClock.ts"
import { useResolvedTheme } from "../theme.ts"
import { members, presences, TopRight } from "./story-kit.tsx"
import { useFollow } from "./useFollow.ts"

/**
 * Following someone: your canvas goes where theirs goes. It's framed in their color with a banner along the top saying
 * whose view it is and how to stop. It ends when you press Esc, click Stop, or move the canvas
 * yourself, and when they leave. Each ending says so briefly where the banner was, then goes. On a narrow canvas the
 * stack moves down out of the banner's way; try the toolbar's viewport menu.
 */
const meta = {
  title: "Parity/Multiplayer/Follow mode",
  parameters: { layout: "fullscreen" },
  decorators: [scrolls]
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

const { mia, jonas, priya } = presences

/** What the canvas shows while following Mia: Mia's board and pointer, and everyone in the stack. */
function FollowedCanvas({ pointer = { x: 236, y: 150 } }: { pointer?: { x: number; y: number } }) {
  return (
    <>
      <CanvasBoard name="Dashboard" x={48} y={52}>
        <DashboardDesign />
      </CanvasBoard>
      <RemotePointer member={members.mia} at={pointer} />
      <TopRight>
        <FaceStack here={[jonas, mia, priya]} following={members.mia} you={members.you} />
      </TopRight>
    </>
  )
}

/** Following Mia: the frame in Mia's color, the banner, and Mia's face just after yours, ringed. */
export const Following: Story = {
  render: () => (
    <Themes width={760} height={340}>
      {() => (
        <>
          <FollowedCanvas />
          <FollowLayer leader={members.mia} state="following" />
        </>
      )}
    </Themes>
  )
}

const endings = [
  { label: "You pressed Esc, clicked Stop, or moved the canvas", state: "stopped" },
  { label: "Mia left the project", state: "left" }
] as const

/** A small canvas just after following ended, the frame gone and a note where the banner was. */
function Ended({ theme, label, state }: { theme: Theme; label: string; state: FollowState }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-2xs text-muted-foreground">{label}</span>
      <CanvasPane theme={theme} width={340} height={170}>
        <CanvasBoard name="Dashboard" x={24} y={52}>
          <DashboardDesign />
        </CanvasBoard>
        <FollowLayer leader={members.mia} state={state} />
      </CanvasPane>
    </div>
  )
}

/**
 * How it ends. When you end it, the frame fades and "Stopped following Mia" shows for two seconds. When Mia leaves,
 * the note says so and stays four seconds, since you didn't do it.
 */
export const HowItEnds: Story = {
  render: () => (
    <div className="flex min-h-screen flex-wrap content-start gap-8 bg-background p-6 text-foreground">
      {(["light", "dark"] as const).map((theme) => (
        <section key={theme} className={`${theme} flex flex-col gap-3 rounded-xl bg-background p-3`}>
          <h2 className="text-xs font-medium text-muted-foreground">{theme === "light" ? "Light" : "Dark"}</h2>
          {endings.map((ending) => (
            <Ended key={ending.state} theme={theme} label={ending.label} state={ending.state} />
          ))}
        </section>
      ))}
    </div>
  )
}

/**
 * Following Mia for real, through `useFollow`: press Esc, click Stop, or scroll the canvas to stop. The moving
 * pointer and the button that makes Mia leave stand in for the room. Follows the toolbar's theme.
 */
function TryItStory() {
  const theme = useResolvedTheme()
  const follow = useFollow()
  const [time] = useClock(follow.state === "following", 80)
  const pointer = { x: 210 + Math.cos(time / 900) * 70, y: 160 + Math.sin(time / 650) * 40 }

  return (
    <div className="flex min-h-screen flex-col items-start gap-4 bg-background p-6 text-foreground">
      <div className="w-full max-w-[760px]" onWheel={follow.stop}>
        <CanvasPane theme={theme} width={760} height={340}>
          <FollowedCanvas pointer={pointer} />
          <FollowLayer leader={members.mia} state={follow.state} onStop={follow.stop} />
        </CanvasPane>
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" disabled={follow.state === "following"} onClick={follow.follow}>
          Follow Mia again
        </Button>
        <Button size="sm" variant="outline" disabled={follow.state !== "following"} onClick={follow.leaderLeft}>
          Make Mia leave
        </Button>
      </div>
    </div>
  )
}

export const TryIt: Story = { render: () => <TryItStory /> }
