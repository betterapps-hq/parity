import { Fragment, type ReactNode } from "react"
import { type Marker, type Stat, stickerHome } from "./canvas-kit.tsx"
import { StatCard } from "./StatCard.tsx"
import { Sticker } from "./Sticker.tsx"

interface DashboardDesignProps {
  mark?: Marker
  /** The stat cards, in the order the row shows them. */
  order?: Stat[]
  /** Where the sticker is, from the chart's top-left; none hides it. */
  sticker?: { x: number; y: number } | null
  /** Drawn over the design, placed from its top-left: a drag's picture and pointer. */
  overlay?: ReactNode
}

/** Draws each element as it is, for a design no story marks. */
const plain: Marker = (_, element) => element

/**
 * A small dashboard, in the design's own light theme: a heading, three stat cards in a row (a layout), and a chart
 * with a sticker placed absolutely on it. It's 300 pixels wide.
 */
export function DashboardDesign({
  mark = plain,
  order = ["revenue", "users", "churn"],
  sticker = stickerHome,
  overlay
}: DashboardDesignProps) {
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
