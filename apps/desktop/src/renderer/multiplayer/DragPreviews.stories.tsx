import type { Meta, StoryObj } from "@storybook/react-vite"
import { type ReactNode, useState } from "react"
import { LandingSpot } from "../canvas/LandingSpot.tsx"
import {
  CanvasBoard,
  DashboardDesign,
  Playback,
  PricingDesign,
  type Stat,
  StatCard,
  stickerHome,
  Themes,
  useClock,
  scrolls
} from "../stories/canvas-kit.tsx"
import { DragGhost } from "./DragGhost.tsx"
import { Outlined } from "./Outlined.tsx"
import { RemotePointer } from "./RemotePointer.tsx"
import { members } from "./story-kit.tsx"

/**
 * What everyone else sees while someone drags. Dragged things move for them too, not just an outline, and the same
 * way they move for the dragger (see Canvas, Dragging): lifted, a picture carried out of a layout with a landing spot
 * where it would go. Each also carries the dragger's outline and name, in their color, with their pointer pressed.
 * Nothing here writes: a preview moves what's drawn until the dragger's drop arrives through the document.
 */
const meta = {
  title: "Parity/Multiplayer/Drag previews",
  parameters: { layout: "fullscreen" },
  decorators: [scrolls]
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

const { mia, jonas, priya } = members

/** How far through a drag a moment of the loop is: out over `moveMs`, a pause, back, and a pause, eased. */
function swing(time: number): number {
  const t = time % loopMs
  let progress = 1

  if (t < moveMs) {
    progress = t / moveMs
  } else if (t < moveMs + holdMs) {
    progress = 1
  } else if (t < moveMs * 2 + holdMs) {
    progress = 1 - (t - moveMs - holdMs) / moveMs
  } else {
    progress = 0
  }

  return progress < 0.5 ? 2 * progress * progress : 1 - (-2 * progress + 2) ** 2 / 2
}

const moveMs = 2200
const holdMs = 700
const loopMs = (moveMs + holdMs) * 2

/** Where the loop starts: partway through the drag, so a still of the story shows something moving. */
const startMs = 1400

const between = (from: number, to: number, progress: number) => from + (to - from) * progress

/** A moving story's frame: play and pause, then the two themes. */
function Moving({ children }: { children: (time: number) => ReactNode }) {
  const [running, setRunning] = useState(true)
  const [time, setTime] = useClock(running, 50, startMs)

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="px-6 pt-6">
        <Playback running={running} onRunning={setRunning} time={time} loopMs={loopMs} onTime={setTime} />
      </div>
      {children(time)}
    </div>
  )
}

/**
 * Jonas drags the Pricing board by its title. It moves for everyone, lifted, with Jonas's outline and name tag on the
 * corner away from the board's own name.
 */
export const Board: Story = {
  render: () => (
    <Moving>
      {(time) => {
        const progress = swing(time)
        const board = { x: between(350, 330, progress), y: between(36, 150, progress) }

        return (
          <Themes width={600} height={340}>
            {() => (
              <>
                <CanvasBoard name="Dashboard" x={24} y={36}>
                  <DashboardDesign />
                </CanvasBoard>
                <CanvasBoard name="Pricing" x={board.x} y={board.y} lifted>
                  <Outlined by={[jonas]} radius={3} tagAt="end">
                    <PricingDesign />
                  </Outlined>
                </CanvasBoard>
                <RemotePointer member={jonas} at={{ x: board.x + 46, y: board.y + 5 }} pressed badge={false} />
              </>
            )}
          </Themes>
        )
      }}
    </Moving>
  )
}

/** Where each stat card's middle is across the design, from its left edge, in the order the row shows them. */
const slotCenters = [56, 150, 244]
const stats: Stat[] = ["revenue", "users", "churn"]

/**
 * Priya drags the Churn card along the row of stat cards. A picture of it follows Priya's pointer, lifted and outlined
 * in Priya's color; the original is hidden, and a dimmed copy shows where it would land, moving as the slot changes.
 */
export const LayerInALayout: Story = {
  render: () => (
    <Moving>
      {(time) => {
        const progress = swing(time)
        const ghost = { x: between(202, 14, progress), y: between(62, 78, progress) }

        const slot = slotCenters
          .map((center, index) => ({ index, distance: Math.abs(center - (ghost.x + 43)) }))
          .toSorted((a, b) => a.distance - b.distance)[0]!.index

        const order: Stat[] = stats.filter((id) => id !== "churn")
        order.splice(slot, 0, "churn")

        return (
          <Themes width={420} height={330}>
            {() => (
              <CanvasBoard name="Dashboard" x={48} y={44}>
                <DashboardDesign
                  order={order}
                  mark={(id, element) =>
                    id === "stat-churn" ? <LandingSpot color={priya.palette.color}>{element}</LandingSpot> : element
                  }
                  overlay={
                    <div className="absolute" style={{ left: ghost.x, top: ghost.y }}>
                      <div className="h-[51px] w-[87px]">
                        <DragGhost member={priya}>
                          <div className="h-[51px] w-[87px]">
                            <StatCard id="churn" />
                          </div>
                        </DragGhost>
                      </div>
                      <RemotePointer member={priya} at={{ x: 52, y: 22 }} pressed badge={false} />
                    </div>
                  }
                />
              </CanvasBoard>
            )}
          </Themes>
        )
      }}
    </Moving>
  )
}

/**
 * Mia drags the "New" sticker, which is placed absolutely on the chart. It moves itself, as it does for Mia: no copy
 * and no ghost, just the sticker with Mia's outline and name, following Mia's pointer.
 */
export const AbsoluteLayer: Story = {
  render: () => (
    <Moving>
      {(time) => {
        const progress = swing(time)
        const sticker = { x: between(stickerHome.x, 24, progress), y: between(stickerHome.y, 46, progress) }

        return (
          <Themes width={420} height={330}>
            {() => (
              <CanvasBoard name="Dashboard" x={48} y={44}>
                <DashboardDesign
                  sticker={sticker}
                  mark={(id, element) =>
                    id === "sticker" ? (
                      <span className="relative block">
                        <DragGhost member={mia} radius={10}>
                          {element}
                        </DragGhost>
                        <RemotePointer member={mia} at={{ x: 30, y: 12 }} pressed badge={false} />
                      </span>
                    ) : (
                      element
                    )
                  }
                />
              </CanvasBoard>
            )}
          </Themes>
        )
      }}
    </Moving>
  )
}
