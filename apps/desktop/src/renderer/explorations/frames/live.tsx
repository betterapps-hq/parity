import { Minus, Plus } from "lucide-react"
import { type ReactNode, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { IconButton } from "../../chrome/IconButton.tsx"

/** The zooms the + and − buttons step through, as tldraw's do. */
const steps = [0.1, 0.25, 0.5, 1, 2, 4]
const smallest = steps[0]!
const largest = steps.at(-1)!

/** Something placed on the live canvas at a point in canvas units, so it moves as the canvas zooms and pans. */
export interface Placed {
  key: string
  x: number
  y: number
  /** What's drawn there at a zoom. */
  draw: (zoom: number) => ReactNode
}

function clamp(zoom: number) {
  return Math.min(largest, Math.max(smallest, zoom))
}

/**
 * A canvas you can zoom and pan, for checking how something draws at every zoom instead of one. Ctrl or ⌘ with the
 * wheel, or a pinch, zooms around the pointer; the wheel alone pans. The buttons at the bottom step the zoom as the
 * app's do, around the middle of the canvas.
 */
export function LiveCanvas({
  initialZoom,
  placed,
  children
}: {
  initialZoom: number
  placed: Placed[]
  /** Drawn over the canvas at screen size, such as a note for the reviewer. */
  children?: ReactNode
}) {
  const stage = useRef<HTMLDivElement>(null)
  const [view, setView] = useState({ zoom: initialZoom, x: 48, y: 96 })

  // Zooms to a zoom, keeping the canvas point under (px, py) on the screen where it is.
  const zoomAround = (next: number, px: number, py: number) =>
    setView((now) => {
      const zoom = clamp(next)
      const ratio = zoom / now.zoom
      return { zoom, x: px - (px - now.x) * ratio, y: py - (py - now.y) * ratio }
    })

  useEffect(() => {
    const element = stage.current
    if (!element) return
    // Not passive, so a pinch zooms the canvas instead of the page.
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      if (event.ctrlKey || event.metaKey) {
        const box = element.getBoundingClientRect()
        const px = event.clientX - box.left
        const py = event.clientY - box.top
        setView((now) => {
          const zoom = clamp(now.zoom * Math.exp(-event.deltaY * 0.01))
          const ratio = zoom / now.zoom
          return { zoom, x: px - (px - now.x) * ratio, y: py - (py - now.y) * ratio }
        })
      } else setView((now) => ({ ...now, x: now.x - event.deltaX, y: now.y - event.deltaY }))
    }
    element.addEventListener("wheel", onWheel, { passive: false })
    return () => element.removeEventListener("wheel", onWheel)
  }, [])

  const step = (direction: 1 | -1) => {
    const box = stage.current?.getBoundingClientRect()
    const next =
      direction > 0
        ? (steps.find((zoom) => zoom > view.zoom + 0.001) ?? largest)
        : (steps.findLast((zoom) => zoom < view.zoom - 0.001) ?? smallest)
    zoomAround(next, (box?.width ?? 0) / 2, (box?.height ?? 0) / 2)
  }

  return (
    <div
      ref={stage}
      className="relative h-screen min-h-[680px] overflow-hidden bg-[#f9fafb] font-sans text-foreground dark:bg-[#101011]"
    >
      {placed.map(({ key, x, y, draw }) => (
        <div key={key} className="absolute" style={{ left: view.x + x * view.zoom, top: view.y + y * view.zoom }}>
          {draw(view.zoom)}
        </div>
      ))}
      {children}
      <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-0.5 rounded-xl border bg-background/95 p-1 shadow-lg backdrop-blur">
        <IconButton label="Zoom out" disabled={view.zoom <= smallest} onClick={() => step(-1)}>
          <Minus />
        </IconButton>
        <Button
          variant="ghost"
          size="sm"
          className="min-w-14 tabular-nums"
          aria-label={`Zoom ${Math.round(view.zoom * 100)}%, zoom to 100%`}
          onClick={() => {
            const box = stage.current?.getBoundingClientRect()
            zoomAround(1, (box?.width ?? 0) / 2, (box?.height ?? 0) / 2)
          }}
        >
          {Math.round(view.zoom * 100)}%
        </Button>
        <IconButton label="Zoom in" disabled={view.zoom >= largest} onClick={() => step(1)}>
          <Plus />
        </IconButton>
      </div>
    </div>
  )
}
