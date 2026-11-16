import { Button, Slider } from "@buildkitgg/shadcn-baseui-kit"
import { agentPalette, palette } from "@parity-app/presence-colors"
import type { Decorator } from "@storybook/react-vite"
import { Pause, Play } from "lucide-react"
import { Fragment, type ReactElement, type ReactNode, useEffect, useId, useState } from "react"
import type { Member, Presence } from "./member.ts"

/*
 * What the multiplayer stories share: the canvas in light and dark side by side, a couple of small designs to put on
 * it, and the people and agents in the room.
 */

export type Theme = "light" | "dark"

/**
 * Gives a story its own scrolling, since the app's page never scrolls (see `#root` in styles.css) and a story taller
 * than the window would otherwise be cut off at its bottom.
 */
export const scrolls: Decorator = (Story) => <div className="h-screen overflow-y-auto bg-background">{Story()}</div>

/** The canvas's own background in each theme, as tldraw draws it. */
export const canvasBackground: Record<Theme, string> = { light: "#f8fafb", dark: "#101012" }

/**
 * The same piece of canvas in the light theme and the dark, side by side, wrapping onto two rows when there isn't room.
 * Each is its own theme, whatever the toolbar says; menus and popovers opened from it follow the toolbar. Each pane is
 * `width` wide at most and narrows with the window, so the toolbar's viewport menu shows the canvas narrow.
 */
export function Themes({
  width = 560,
  height = 360,
  children
}: {
  width?: number
  height?: number
  children: (theme: Theme) => ReactNode
}) {
  return (
    <div className="flex min-h-screen flex-wrap content-start gap-6 bg-background p-6 text-foreground">
      {(["light", "dark"] as const).map((theme) => (
        <section key={theme} className="flex flex-col gap-2" style={{ width, maxWidth: "100%" }}>
          <h2 className="text-xs font-medium text-muted-foreground">{theme === "light" ? "Light" : "Dark"}</h2>
          <CanvasPane theme={theme} width={width} height={height}>
            {children(theme)}
          </CanvasPane>
        </section>
      ))}
    </div>
  )
}

/**
 * A piece of the canvas in one theme, `width` wide at most and `height` tall at least. What's inside is placed
 * absolutely, in pixels from its top-left, or flows and grows it. It's a container, so what's inside can respond to how
 * wide the canvas is.
 */
export function CanvasPane({
  theme,
  width,
  height,
  children
}: {
  theme: Theme
  width: number
  height: number
  children: ReactNode
}) {
  return (
    <div
      className={`${theme} @container relative overflow-hidden rounded-xl border text-foreground`}
      style={{ width, maxWidth: "100%", minHeight: height, background: canvasBackground[theme] }}
    >
      {children}
    </div>
  )
}

/** A board on the canvas: its name above it, then its design. Lifted while someone moves it. */
export function CanvasBoard({
  name,
  x,
  y,
  lifted,
  children
}: {
  name: string
  x: number
  y: number
  lifted?: boolean
  children: ReactNode
}) {
  return (
    <div className="absolute flex flex-col gap-1.5" style={{ left: x, top: y }}>
      <span className="text-[11px] font-medium text-muted-foreground">{name}</span>
      <div
        className={`rounded-sm transition-shadow ${lifted ? "shadow-[0_18px_40px_rgb(0_0_0/0.28)]" : "shadow-[0_4px_16px_rgb(0_0_0/0.12)]"}`}
      >
        {children}
      </div>
    </div>
  )
}

/**
 * Wraps one of a design's elements, by its id, so a story can mark it: outline it, hide it, put a copy in its place.
 * Without one, the design draws as it is.
 */
export type Marker = (id: string, element: ReactElement) => ReactNode

const plain: Marker = (_, element) => element

const stats = {
  revenue: { label: "Revenue", value: "$48.2k" },
  users: { label: "Active users", value: "2,310" },
  churn: { label: "Churn", value: "1.2%" }
}

export type Stat = keyof typeof stats

/** One of the dashboard's stat cards, alone, for a drag's picture of it. */
export function StatCard({ id }: { id: Stat }) {
  return (
    <div className="flex h-full flex-col gap-0.5 rounded-lg border border-neutral-200 bg-white p-2">
      <span className="text-[9px] text-neutral-500">{stats[id].label}</span>
      <span className="text-sm font-semibold tracking-tight">{stats[id].value}</span>
    </div>
  )
}

/** The "New" sticker placed absolutely on the dashboard's chart. */
export function Sticker() {
  return <span className="block rounded-full bg-violet-600 px-1.5 py-0.5 text-[9px] font-semibold text-white">New</span>
}

/** Where the sticker sits on the chart, from the chart's top-left. */
export const stickerHome = { x: 232, y: 8 }

/**
 * A small dashboard, in the design's own light theme: a heading, three stat cards in a row (a layout), and a chart
 * with a sticker placed absolutely on it. It's 300 pixels wide.
 */
export function DashboardDesign({
  mark = plain,
  order = ["revenue", "users", "churn"],
  sticker = stickerHome,
  overlay
}: {
  mark?: Marker
  /** The stat cards, in the order the row shows them. */
  order?: Stat[]
  /** Where the sticker is, from the chart's top-left; none hides it. */
  sticker?: { x: number; y: number } | null
  /** Drawn over the design, placed from its top-left: a drag's picture and pointer. */
  overlay?: ReactNode
}) {
  return (
    <div className="relative flex w-[300px] flex-col gap-2.5 bg-white p-3 font-sans text-neutral-900">
      <div className="flex items-center justify-between">
        {mark("heading", <span className="block text-[13px] font-semibold">Dashboard</span>)}
        <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[9px] text-neutral-500">This week</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {order.map((id) => (
          <Fragment key={id}>{mark(`stat-${id}`, <StatCard id={id} />)}</Fragment>
        ))}
      </div>
      {mark(
        "chart",
        <div className="relative flex h-24 items-end gap-1.5 rounded-lg border border-neutral-200 p-2">
          {[38, 52, 44, 66, 58, 74, 62, 81, 70, 88].map((height, index) => (
            <span
              key={index}
              className="flex-1 rounded-t-[3px] bg-neutral-800"
              style={{ height: `${height}%`, opacity: 0.35 + index * 0.065 }}
            />
          ))}
          {sticker && (
            <span className="absolute" style={{ left: sticker.x, top: sticker.y }}>
              {mark("sticker", <Sticker />)}
            </span>
          )}
        </div>
      )}
      {mark(
        "table",
        <div className="flex flex-col divide-y divide-neutral-100 text-[10px]">
          {[
            ["Acme", "$12.4k"],
            ["Globex", "$9.1k"],
            ["Initech", "$6.8k"]
          ].map(([name, amount]) => (
            <span key={name} className="flex justify-between py-1">
              <span>{name}</span>
              <span className="text-neutral-500 tabular-nums">{amount}</span>
            </span>
          ))}
        </div>
      )}
      {overlay}
    </div>
  )
}

/** A small pricing page, in the design's own light theme. It's 220 pixels wide. */
export function PricingDesign() {
  return (
    <div className="flex w-[220px] flex-col gap-2 bg-white p-3 font-sans text-neutral-900">
      <span className="text-[13px] font-semibold">Pricing</span>
      <div className="grid grid-cols-2 gap-2">
        {[
          ["Starter", "$0"],
          ["Team", "$12"]
        ].map(([name, price], index) => (
          <div
            key={name}
            className={`flex flex-col gap-1 rounded-lg border p-2 ${index === 1 ? "border-neutral-900" : "border-neutral-200"}`}
          >
            <span className="text-[10px] text-neutral-500">{name}</span>
            <span className="text-base font-semibold">{price}</span>
            <span
              className={`mt-1 rounded-md py-1 text-center text-[9px] font-medium ${index === 1 ? "bg-neutral-900 text-white" : "border border-neutral-200"}`}
            >
              {index === 1 ? "Start a trial" : "Start free"}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** A made-up picture of someone, head and shoulders, for a face that has one. */
function portrait({
  background,
  skin,
  hair,
  shirt,
  long
}: {
  background: string
  skin: string
  hair: string
  shirt: string
  long?: boolean
}): string {
  const hairPath = long
    ? "M19 29c-1-11 5-18 13-18s14 7 13 18c0 6-1 11-3 15l-2-14c-3-3-6-6-8-10-3 5-8 8-12 10l-1 14c-2-4-2-9 0-15z"
    : "M20 25c0-8 5-14 12-14s12 6 12 14c-3-4-7-6-12-6s-9 2-12 6z"

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">`,
    `<rect width="64" height="64" fill="${background}"/>`,
    `<path d="M8 64c2-13 12-20 24-20s22 7 24 20z" fill="${shirt}"/>`,
    `<rect x="27" y="34" width="10" height="11" rx="4" fill="${skin}"/>`,
    `<circle cx="32" cy="26" r="12" fill="${skin}"/>`,
    `<path d="${hairPath}" fill="${hair}"/>`,
    `</svg>`
  ].join("")

  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

/** The room: people and agents, each with the palette the room handed them, in the order they joined. */
export const members = {
  mia: {
    name: "Mia Rossi",
    palette: palette(0),
    photo: portrait({ background: "#e9d8c8", skin: "#e2b08e", hair: "#3b2418", shirt: "#2f4858", long: true })
  },
  jonas: { name: "Jonas Weber", palette: palette(1) },
  priya: {
    name: "Priya Raman",
    palette: palette(2),
    photo: portrait({ background: "#cfd8e3", skin: "#a8714f", hair: "#1c1210", shirt: "#b8475a", long: true })
  },
  claude: { name: "Claude Code", palette: agentPalette(3), agent: true },
  codex: { name: "Codex", palette: agentPalette(4), agent: true },
  sam: {
    name: "Sam Okafor",
    palette: palette(3),
    photo: portrait({ background: "#d9e4d0", skin: "#6e4632", hair: "#16110f", shirt: "#e0a43c" })
  },
  lena: { name: "Lena Fischer", palette: palette(4) },
  theo: { name: "Theo Martin", palette: palette(5) }
} satisfies Record<string, Member>

/** What everyone in the room is doing. */
export const presences = {
  mia: { member: members.mia, activity: "Viewing Dashboard in dark mode" },
  jonas: { member: members.jonas, activity: "Editing Pricing on mobile" },
  priya: { member: members.priya, activity: "Viewing Dashboard in light mode" },
  claude: { member: members.claude, activity: "Tightening the dashboard's spacing" },
  codex: { member: members.codex, activity: "Checking Pricing" },
  sam: { member: members.sam, activity: "Viewing Settings" },
  lena: { member: members.lena, activity: "Viewing Sign in", away: "12 min" },
  theo: { member: members.theo, activity: "Viewing Dashboard on mobile" }
} satisfies Record<string, Presence>

/**
 * Milliseconds of play, a frame at a time, for the stories that move, starting at `start`. Paused, it holds where it
 * was. It only counts whole steps of `stepMs`, so what moves arrives in steps, as positions from a room do. It also
 * gives a way to set the time, for scrubbing.
 */
export function useClock(running: boolean, stepMs = 16, start = 0) {
  const [time, setTime] = useState(start)

  useEffect(() => {
    if (!running) {
      return undefined
    }

    let frame = 0
    let last = performance.now()
    let carried = 0

    const tick = (now: number) => {
      carried += now - last
      last = now

      if (carried >= stepMs) {
        const steps = Math.floor(carried / stepMs)

        carried -= steps * stepMs
        setTime((before) => before + steps * stepMs)
      }

      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)

    return () => cancelAnimationFrame(frame)
  }, [running, stepMs])

  return [time, setTime] as const
}

/**
 * Play, pause and a scrubber for a story that moves, outside the design. Scrubbing pauses, so a moment can be held and
 * looked at.
 */
export function Playback({
  running,
  onRunning,
  time,
  loopMs,
  onTime
}: {
  running: boolean
  onRunning: (running: boolean) => void
  time: number
  loopMs: number
  onTime: (time: number) => void
}) {
  const label = useId()

  return (
    <div className="flex items-center gap-3">
      <Button size="sm" variant="outline" onClick={() => onRunning(!running)}>
        {running ? <Pause /> : <Play />}
        {running ? "Pause" : "Play"}
      </Button>
      <span id={label} className="text-xs text-muted-foreground">
        Moment
      </span>
      <div className="w-56">
        <Slider
          aria-labelledby={label}
          min={0}
          max={loopMs}
          step={10}
          value={time % loopMs}
          onValueChange={(value) => {
            onRunning(false)
            onTime(Array.isArray(value) ? (value[0] ?? 0) : value)
          }}
        />
      </div>
    </div>
  )
}
