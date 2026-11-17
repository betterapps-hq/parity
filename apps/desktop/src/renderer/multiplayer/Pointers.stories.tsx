import { PersonPointer, RemotePointer } from "@parity-app/presence-ui"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { useEffect, useRef, useState } from "react"
import { scrolls } from "../stories/canvas-kit.tsx"
import { CanvasBoard } from "../stories/CanvasBoard.tsx"
import { CanvasPane } from "../stories/CanvasPane.tsx"
import { DashboardDesign } from "../stories/DashboardDesign.tsx"
import { Playback } from "../stories/Playback.tsx"
import { Themes } from "../stories/Themes.tsx"
import { useClock } from "../stories/useClock.ts"
import { useResolvedTheme } from "../theme.ts"
import { members } from "./story-kit.tsx"

/**
 * Other people's pointers: one arrow for everyone, on their gradient, with a badge under it. A person's badge is their
 * first name, with a short note only when the room knows it for certain, such as that they're typing; what they're
 * doing is never guessed at. An agent's arrow glows, and its badge leads
 * with the icon for its step and says what it's doing, in its own words. When someone leaves the canvas, their pointer
 * stays where they left it, faded; when they come back, it glides from there.
 */
const meta = {
  title: "Parity/Multiplayer/Pointers",
  parameters: { layout: "fullscreen" },
  decorators: [scrolls]
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

/**
 * People and agents together: people by name, one of them typing, agents at work saying what they're doing, and one
 * person off the canvas.
 */
export const Badges: Story = {
  render: () => (
    <Themes width={560} height={340}>
      {() => (
        <>
          <CanvasBoard name="Dashboard" x={40} y={40}>
            <DashboardDesign />
          </CanvasBoard>
          <RemotePointer member={members.mia} at={{ x: 120, y: 96 }} />
          <RemotePointer member={members.jonas} at={{ x: 250, y: 190 }} detail="Typing…" />
          <RemotePointer member={members.priya} at={{ x: 380, y: 60 }} offCanvas />
          <RemotePointer member={members.claude} at={{ x: 150, y: 250 }} kind="write" detail="Tighten spacing" />
          <RemotePointer member={members.codex} at={{ x: 370, y: 150 }} kind="read" detail="Check the chart" />
        </>
      )}
    </Themes>
  )
}

/** One person's pointer at each point along the way, left to right. */
const states = [
  { label: "Moving", props: {} },
  { label: "Typing", props: { detail: "Typing…" } },
  { label: "Dragging", props: { pressed: true, badge: false } },
  { label: "Off the canvas", props: { away: true, detail: "Typing…" } }
] as const

/**
 * A person's pointer on its own, as the multiplayer extension draws it (`PersonPointer`): moving, typing, dragging, when
 * what they carry has their name instead, and left behind off the canvas, faded and with only their name.
 */
export const PersonStates: Story = {
  render: () => (
    <Themes width={560} height={150}>
      {() => (
        <div className="absolute inset-0 grid grid-cols-4 px-6 pt-5">
          {states.map(({ label, props }) => (
            <div key={label} className="flex flex-col gap-3">
              <span className="text-2xs text-muted-foreground">{label}</span>
              <div className="relative ml-4">
                <PersonPointer palette={members.jonas.palette} name={members.jonas.name} {...props} />
              </div>
            </div>
          ))}
        </div>
      )}
    </Themes>
  )
}

/** Where a pointer is, and whether its person is on the canvas, as the room sends it. */
interface PointerState {
  at: { x: number; y: number }
  offCanvas: boolean
}

const loopMs = 7000
const leavesAt = 2500
const returnsAt = 4300

/**
 * Where Mia's pointer is at a moment of the loop, and whether Mia is on the canvas: the pointer moves right, leaves the
 * canvas, comes back further down and moves back to where it started.
 */
function miaAt(time: number): PointerState {
  const t = time % loopMs

  if (t < leavesAt) {
    return { at: { x: 80 + (t / leavesAt) * 200, y: 90 + Math.sin(t / 400) * 25 }, offCanvas: false }
  }

  if (t < returnsAt) {
    return { ...miaAt(leavesAt - 1), offCanvas: true }
  }

  const back = (t - returnsAt) / (loopMs - returnsAt)

  return {
    at: { x: 440 - back * 360, y: 250 - back * 160 + Math.sin((t - returnsAt) / 300) * 12 },
    offCanvas: false
  }
}

function phaseOf(time: number): string {
  const t = time % loopMs

  if (t < leavesAt) {
    return "Mia is moving on the canvas."
  }

  if (t < returnsAt) {
    return "Mia left the canvas. The pointer stays where it was, faded."
  }

  return t < returnsAt + 700 ? "Mia is back. The pointer glides from there to the new spot." : "Mia is moving again."
}

function LeavingAndComingBackStory() {
  const [running, setRunning] = useState(true)
  const [time, setTime] = useClock(running, 80, 3200)
  const { at, offCanvas } = miaAt(time)

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="flex items-center gap-3 px-6 pt-6">
        <Playback running={running} onRunning={setRunning} time={time} loopMs={loopMs} onTime={setTime} />
        <span className="text-sm text-muted-foreground">{phaseOf(time)}</span>
      </div>
      <Themes width={540} height={330}>
        {() => (
          <>
            <CanvasBoard name="Dashboard" x={40} y={40}>
              <DashboardDesign />
            </CanvasBoard>
            <RemotePointer member={members.mia} at={at} offCanvas={offCanvas} />
          </>
        )}
      </Themes>
    </div>
  )
}

/** The glide, on a loop: Mia moves, leaves the canvas, and comes back somewhere else. */
export const LeavingAndComingBack: Story = { render: () => <LeavingAndComingBackStory /> }

const start: PointerState = { at: { x: 200, y: 160 }, offCanvas: true }

/** Mia's pointer copies yours, offset a little, at the pace a room sends positions. */
function FollowYourMouseStory() {
  const theme = useResolvedTheme()
  const latest = useRef<PointerState>(start)
  const [sent, setSent] = useState(start)

  useEffect(() => {
    const timer = setInterval(() => setSent(latest.current), 60)

    return () => clearInterval(timer)
  }, [])

  return (
    <div className="flex min-h-screen flex-col items-start gap-3 bg-background p-6 text-foreground">
      <p className="text-sm text-muted-foreground">
        Move your pointer over the canvas and Mia&apos;s copies it. Move off the canvas, then back in somewhere else.
      </p>
      <div
        onPointerMove={(event) => {
          const box = event.currentTarget.getBoundingClientRect()
          latest.current = {
            at: { x: event.clientX - box.left + 48, y: event.clientY - box.top + 32 },
            offCanvas: false
          }
        }}
        onPointerLeave={() => {
          latest.current = { ...latest.current, offCanvas: true }
        }}
      >
        <CanvasPane theme={theme} width={620} height={380}>
          <CanvasBoard name="Dashboard" x={40} y={40}>
            <DashboardDesign />
          </CanvasBoard>
          <RemotePointer member={members.mia} at={sent.at} offCanvas={sent.offCanvas} stepMs={60} />
        </CanvasPane>
      </div>
    </div>
  )
}

/** Drive Mia's pointer with your own, to feel the step and the glide. Follows the toolbar's theme. */
export const FollowYourMouse: Story = { render: () => <FollowYourMouseStory /> }
