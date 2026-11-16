import type { Meta, StoryObj } from "@storybook/react-vite"
import { type ReactNode, useState } from "react"
import {
  CanvasBoard,
  CanvasPane,
  DashboardDesign,
  type Marker,
  Playback,
  PricingDesign,
  scrolls,
  type Stat,
  StatCard,
  stickerHome,
  Themes,
  useClock
} from "../stories/canvas-kit.tsx"
import type { DragPhase } from "./drag-motion.ts"
import { DragLift } from "./DragLift.tsx"
import { DragPicture } from "./DragPicture.tsx"
import { LandingSpot } from "./LandingSpot.tsx"

/**
 * Picking things up, carrying them and putting them down on the canvas, one way for everything and everyone: what's
 * picked up lifts onto a shadow, follows the pointer, and settles when it's dropped. From a layout, a picture of the
 * layer is carried while a faded copy shows where it would land and the layout makes room; dropped, the picture flies
 * into place; cancelled with Esc, it flies back. Someone else's drag, in Multiplayer's drag previews, moves the same
 * way with their outline and name added. The canvas's own drags move this way too, with the same parts and the timings in
 * `drag-motion.ts` (PAR-1199).
 */
const meta = {
  title: "Parity/Canvas/Dragging",
  parameters: { layout: "fullscreen" },
  decorators: [scrolls]
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

/** Your own pointer: an ordinary arrow, its tip at the point. */
function YourPointer({ at }: { at: { x: number; y: number } }) {
  return (
    <svg
      width="16"
      height="22"
      viewBox="0 0 16 22"
      aria-hidden
      className="pointer-events-none absolute top-0 left-0 drop-shadow-[0_1px_1px_rgb(0_0_0/0.3)]"
      style={{ transform: `translate(${at.x - 1}px, ${at.y - 1}px)` }}
    >
      <path d="M1 1L1 17L5.2 13.2L8 19.5L10.6 18.3L7.9 12.2L13.6 12Z" fill="black" stroke="white" strokeWidth="1.4" />
    </svg>
  )
}

/** A drag's moments, in milliseconds of a loop: picked up, then carried until it's dropped or cancelled. */
const pickUpAt = 600
const letGoAt = 2800
const loopMs = 5000

const ease = (progress: number) => (progress < 0.5 ? 2 * progress ** 2 : 1 - (-2 * progress + 2) ** 2 / 2)
const between = (from: number, to: number, progress: number) => from + (to - from) * progress

/** How far through the carry a moment is, eased, from 0 when it's picked up to 1 when it's let go. */
function carried(time: number): number {
  return ease(Math.min(Math.max((time - pickUpAt) / (letGoAt - pickUpAt), 0), 1))
}

/** A moving story's frame: play and pause, then the two themes. */
function Moving({ children }: { children: (time: number) => ReactNode }) {
  const [running, setRunning] = useState(true)
  const [time, setTime] = useClock(running, 40, 1500)

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="px-6 pt-6">
        <Playback running={running} onRunning={setRunning} time={time} loopMs={loopMs} onTime={setTime} />
      </div>
      {children(time % loopMs)}
    </div>
  )
}

/** Where each stat card sits in the dashboard, by slot, from the design's top-left, and how big a card is. */
const slots = [12, 107, 201]
const cardTop = 42
const card = { w: 87, h: 51 }
const stats: Stat[] = ["revenue", "users", "churn"]

/** Where Churn's card is grabbed, from its top-left. */
const grab = { x: 50, y: 26 }

/** Where a drag is at a moment of the loop, or nothing before it's picked up. */
function phaseAt(time: number, cancel?: boolean): DragPhase | undefined {
  if (time < pickUpAt) {
    return undefined
  }

  if (time < letGoAt) {
    return "carrying"
  }

  return cancel ? "cancelling" : "dropping"
}

/** Churn's card where it would land: faded and dashed while carried, unseen while its picture flies back. */
function ChurnWhileCarried({ phase, children }: { phase: DragPhase; children: ReactNode }) {
  if (phase === "cancelling") {
    return <div className="h-full opacity-0">{children}</div>
  }

  return <LandingSpot>{children}</LandingSpot>
}

/** Marks Churn's card while it's carried; otherwise the design draws as it is. */
function churnMark(carrying: DragPhase | undefined): Marker {
  return (id, element) =>
    id === "stat-churn" && carrying ? <ChurnWhileCarried phase={carrying}>{element}</ChurnWhileCarried> : element
}

/**
 * The dashboard with Churn carried along its row to the front, at a moment of the loop: where the picture and pointer
 * are, which slot it would land in, and the row as it shows then. `cancel` sends it back instead of dropping it.
 */
function LayoutDrag({ time, cancel }: { time: number; cancel?: boolean }) {
  const progress = carried(time)

  const pointer = {
    x: between(slots[2]! + grab.x, slots[0]! + grab.x, progress),
    y: cardTop + grab.y + Math.sin(progress * Math.PI) * 16
  }

  const picture = { x: pointer.x - grab.x, y: pointer.y - grab.y }

  const slot = slots
    .map((left, index) => ({ index, distance: Math.abs(left - picture.x) }))
    .toSorted((a, b) => a.distance - b.distance)[0]!.index

  const phase = phaseAt(time, cancel)
  const settled = time >= letGoAt + 400
  const carriedTo = cancel ? 2 : slot
  const order: Stat[] = stats.filter((id) => id !== "churn")
  order.splice(phase === undefined ? 2 : carriedTo, 0, "churn")

  const at = phase === "carrying" ? picture : { x: slots[carriedTo]!, y: cardTop }
  const carrying = phase !== undefined && !settled ? phase : undefined

  return (
    <DashboardDesign
      order={order}
      mark={churnMark(carrying)}
      overlay={
        <>
          {carrying && (
            <DragPicture at={at} phase={carrying}>
              <div style={{ width: card.w, height: card.h }}>
                <StatCard id="churn" />
              </div>
            </DragPicture>
          )}
          <YourPointer at={pointer} />
        </>
      }
    />
  )
}

/**
 * Dragging the Churn card to the front of its row. Picked up, it lifts; a picture of it follows the pointer while a
 * faded copy shows where it would land, and the row makes room as it moves. Let go, the picture flies into the copy's
 * place and settles.
 */
export const LayerInALayout: Story = {
  render: () => (
    <Moving>
      {(time) => (
        <Themes width={420} height={340}>
          {() => (
            <CanvasBoard name="Dashboard" x={48} y={44}>
              <LayoutDrag time={time} />
            </CanvasBoard>
          )}
        </Themes>
      )}
    </Moving>
  )
}

/** The same drag cancelled with Esc: the picture flies back to where the card was, a little slower, and the row closes. */
export const Cancelled: Story = {
  render: () => (
    <Moving>
      {(time) => (
        <Themes width={420} height={340}>
          {() => (
            <CanvasBoard name="Dashboard" x={48} y={44}>
              <LayoutDrag time={time} cancel />
            </CanvasBoard>
          )}
        </Themes>
      )}
    </Moving>
  )
}

/** Where the chart, which the sticker is placed in, starts in the dashboard. */
const chartOrigin = { x: 13, y: 104 }

/**
 * The "New" sticker, placed absolutely on the chart, dragged to the chart's other corner. It moves itself rather than a
 * picture of it, so nothing marks where it was: it lifts where it is, follows the pointer, and settles where it's let go.
 */
export const AbsoluteLayer: Story = {
  render: () => (
    <Moving>
      {(time) => {
        const progress = carried(time)
        const up = time >= pickUpAt && time < letGoAt
        const sticker = { x: between(stickerHome.x, 10, progress), y: between(stickerHome.y, 52, progress) }

        return (
          <Themes width={420} height={340}>
            {() => (
              <CanvasBoard name="Dashboard" x={48} y={44}>
                <DashboardDesign
                  sticker={sticker}
                  mark={(id, element) => (id === "sticker" ? <DragLift up={up}>{element}</DragLift> : element)}
                  overlay={<YourPointer at={{ x: sticker.x + chartOrigin.x + 16, y: sticker.y + chartOrigin.y + 9 }} />}
                />
              </CanvasBoard>
            )}
          </Themes>
        )
      }}
    </Moving>
  )
}

/** The Pricing board dragged by its name: the board itself lifts, follows, and settles where it's let go. */
export const Board: Story = {
  render: () => (
    <Moving>
      {(time) => {
        const progress = carried(time)
        const up = time >= pickUpAt && time < letGoAt
        const board = { x: between(330, 300, progress), y: between(40, 150, progress) }

        return (
          <Themes width={600} height={360}>
            {() => (
              <>
                <CanvasBoard name="Dashboard" x={24} y={40}>
                  <DashboardDesign />
                </CanvasBoard>
                <CanvasBoard name="Pricing" x={board.x} y={board.y} lifted={up}>
                  <PricingDesign />
                </CanvasBoard>
                <YourPointer at={{ x: board.x + 20, y: board.y + 7 }} />
              </>
            )}
          </Themes>
        )
      }}
    </Moving>
  )
}

/** Moments from the layout drag, still, in each theme: just picked up, carried over the middle, and dropped. */
export const Moments: Story = {
  render: () => (
    <div className="flex min-h-screen flex-col gap-6 bg-background p-6 text-foreground">
      {(["light", "dark"] as const).map((theme) => (
        <section key={theme} className="flex flex-wrap gap-4">
          {[
            { label: "Picked up", time: pickUpAt + 200 },
            { label: "Carried over the middle", time: 1700 },
            { label: "Dropped", time: letGoAt + 600 }
          ].map((moment) => (
            <figure key={moment.label} className="flex flex-col gap-1.5">
              <figcaption className="text-xs text-muted-foreground">
                {moment.label}, {theme}
              </figcaption>
              <CanvasPane theme={theme} width={380} height={330}>
                <CanvasBoard name="Dashboard" x={40} y={40}>
                  <LayoutDrag time={moment.time} />
                </CanvasBoard>
              </CanvasPane>
            </figure>
          ))}
        </section>
      ))}
    </div>
  )
}
