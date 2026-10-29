import { useEffect, useRef, useState } from "react"
import { findFrames } from "../frame.ts"
import { useSelection } from "../selection.ts"
import { useProject } from "./context.ts"
import { tabOrder, useTabOrderShown } from "./tab-order.ts"

interface Stop {
  x: number
  y: number
  width: number
  height: number
}

/** Each frame's tab stops, in the canvas area's coordinates. */
type Trails = { key: string; stops: Stop[] }[]

/** At most this many stops are drawn per frame; a frame with more is still numbered up to here. */
const maxStops = 200
const color = "#f97316"

/**
 * Numbers the selected design's tab stops in every frame it's drawn in, joined in the order Tab visits them, so a
 * focus order that jumps around is easy to see.
 */
export function TabOrderOverlay() {
  const shown = useTabOrderShown()
  const { selection } = useProject()
  const design = useSelection(selection).design
  const rootRef = useRef<HTMLDivElement>(null)
  const [measured, setMeasured] = useState<Trails>([])
  const trails = shown && design ? measured : []

  // Stops follow the camera, layout changes and animations, so they're measured every frame.
  useEffect(() => {
    if (!shown || !design) return undefined
    let frame = 0
    let last = ""
    const tick = () => {
      frame = requestAnimationFrame(tick)
      const area = rootRef.current?.parentElement
      if (!area || area.closest("[hidden]")) return
      const origin = area.getBoundingClientRect()
      const next = findFrames(area, design).map((host) => ({
        key: `${host.dataset.mode}:${host.dataset.state}`,
        stops: tabOrder(host)
          .slice(0, maxStops)
          .map((element) => {
            const rect = element.getBoundingClientRect()
            return { x: rect.left - origin.left, y: rect.top - origin.top, width: rect.width, height: rect.height }
          })
      }))
      const serialized = JSON.stringify(next)
      if (serialized !== last) {
        last = serialized
        setMeasured(next)
      }
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [design, shown])

  return (
    <div ref={rootRef} className="pointer-events-none absolute inset-0 z-[305] overflow-hidden" aria-hidden>
      {trails.length > 0 && (
        <svg className="absolute inset-0 size-full overflow-visible">
          {trails.map(({ key, stops }) => (
            <g key={key}>
              <polyline
                points={stops.map((stop) => `${stop.x + stop.width / 2},${stop.y + stop.height / 2}`).join(" ")}
                fill="none"
                stroke={color}
                strokeWidth={1.5}
                strokeDasharray="4 3"
                strokeLinejoin="round"
              />
              {stops.map((stop, index) => (
                <rect
                  key={index}
                  x={stop.x}
                  y={stop.y}
                  width={stop.width}
                  height={stop.height}
                  rx={3}
                  fill="none"
                  stroke={color}
                  strokeWidth={1}
                />
              ))}
            </g>
          ))}
        </svg>
      )}
      {trails.flatMap(({ key, stops }) =>
        stops.map((stop, index) => (
          <span
            key={`${key}:${index}`}
            className="absolute grid h-[18px] min-w-[18px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full px-1 text-[10px] leading-none font-semibold text-white tabular-nums shadow-sm"
            style={{ left: stop.x, top: stop.y, background: color }}
          >
            {index + 1}
          </span>
        ))
      )}
    </div>
  )
}
