import { Button } from "@buildkitgg/shadcn-baseui-kit"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { Eye, LogOut } from "lucide-react"
import { useEffect, useState } from "react"
import { useResolvedTheme } from "../theme.ts"
import { FaceStack, FollowEnded, FollowFrame, RemotePointer } from "./presence-parts.tsx"
import {
  CanvasBoard,
  CanvasPane,
  DashboardDesign,
  type Theme,
  Themes,
  members,
  presences,
  useClock
} from "./story-kit.tsx"

/**
 * Following someone: your canvas goes where theirs goes. It's framed in their color with a banner along the top saying
 * whose view it is and how to stop. It ends when you press Esc, click the banner's way out, or move the canvas
 * yourself, and when they leave. Each ending says so briefly where the banner was, then goes.
 */
const meta = {
  title: "Parity/Multiplayer/Follow mode",
  parameters: { layout: "fullscreen" }
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
      <div className="absolute top-3 right-3">
        <FaceStack here={[jonas, mia, priya]} following={members.mia} size={24} />
      </div>
    </>
  )
}

/** Following Mia: the frame in Mia's color, the banner, and Mia's face first in the stack, ringed. */
export const Following: Story = {
  render: () => (
    <Themes width={560} height={340}>
      {() => (
        <>
          <FollowedCanvas />
          <FollowFrame leader={members.mia} />
        </>
      )}
    </Themes>
  )
}

/** On a narrow window the banner stays one line, and the stack moves down out of its way. */
export const Narrow: Story = {
  render: () => (
    <Themes width={340} height={320}>
      {() => (
        <>
          <CanvasBoard name="Dashboard" x={20} y={56}>
            <DashboardDesign />
          </CanvasBoard>
          <RemotePointer member={members.mia} at={{ x: 200, y: 170 }} />
          <div className="absolute top-12 right-2">
            <FaceStack here={[jonas, mia, priya]} following={members.mia} size={22} />
          </div>
          <FollowFrame leader={members.mia} />
        </>
      )}
    </Themes>
  )
}

const endings = [
  { label: "You pressed Esc, clicked the banner, or moved the canvas", text: "Stopped following Mia" },
  { label: "Mia left the project", text: "Mia left, so following stopped." }
] as const

/** A small canvas just after following ended, the frame gone and a note where the banner was. */
function Ended({ theme, label, text, icon }: { theme: Theme; label: string; text: string; icon: "stop" | "left" }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <CanvasPane theme={theme} width={340} height={170}>
        <CanvasBoard name="Dashboard" x={24} y={52}>
          <DashboardDesign />
        </CanvasBoard>
        <FollowEnded>
          {icon === "stop" ? (
            <Eye className="size-3.5 text-muted-foreground" />
          ) : (
            <LogOut className="size-3.5 text-muted-foreground" />
          )}
          {text}
        </FollowEnded>
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
          <Ended theme={theme} label={endings[0].label} text={endings[0].text} icon="stop" />
          <Ended theme={theme} label={endings[1].label} text={endings[1].text} icon="left" />
        </section>
      ))}
    </div>
  )
}

type FollowState = "following" | "stopped" | "left" | "done"

/** Following Mia for real: press Esc, click the banner, or scroll the canvas to stop. Follows the toolbar's theme. */
function TryItStory() {
  const theme = useResolvedTheme()
  const [state, setState] = useState<FollowState>("following")
  const [time] = useClock(state === "following", 80)
  const pointer = { x: 210 + Math.cos(time / 900) * 70, y: 160 + Math.sin(time / 650) * 40 }

  useEffect(() => {
    if (state !== "following") {
      return undefined
    }

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setState("stopped")
      }
    }

    window.addEventListener("keydown", onKey)

    return () => window.removeEventListener("keydown", onKey)
  }, [state])

  useEffect(() => {
    if (state !== "stopped" && state !== "left") {
      return undefined
    }

    const timer = setTimeout(() => setState("done"), state === "stopped" ? 2000 : 4000)

    return () => clearTimeout(timer)
  }, [state])

  return (
    <div className="flex min-h-screen flex-col items-start gap-4 bg-background p-6 text-foreground">
      <div
        onWheel={() => {
          if (state === "following") {
            setState("stopped")
          }
        }}
      >
        <CanvasPane theme={theme} width={560} height={340}>
          <FollowedCanvas pointer={pointer} />
          <div
            className={`pointer-events-none absolute inset-0 rounded-[inherit] transition-opacity duration-300 ${state === "following" ? "opacity-100" : "opacity-0"}`}
          >
            {state !== "done" && <FollowFrame leader={members.mia} onStop={() => setState("stopped")} />}
          </div>
          {state === "stopped" && (
            <FollowEnded>
              <Eye className="size-3.5 text-muted-foreground" />
              {endings[0].text}
            </FollowEnded>
          )}
          {state === "left" && (
            <FollowEnded>
              <LogOut className="size-3.5 text-muted-foreground" />
              {endings[1].text}
            </FollowEnded>
          )}
        </CanvasPane>
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" disabled={state === "following"} onClick={() => setState("following")}>
          Follow Mia again
        </Button>
        <Button size="sm" variant="outline" disabled={state !== "following"} onClick={() => setState("left")}>
          Make Mia leave
        </Button>
      </div>
    </div>
  )
}

export const TryIt: Story = { render: () => <TryItStory /> }
