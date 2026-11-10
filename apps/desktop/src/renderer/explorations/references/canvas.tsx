/* oxlint-disable jsx-a11y/prefer-tag-over-role, jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex -- the design and the references stand in for the canvas's items, which take the pointer; the keyboard reaches them through the canvas's keys, as in the app */
import { Button } from "@buildkitgg/shadcn-baseui-kit"
import { Layers, Maximize, Minus, Plus, Telescope } from "lucide-react"
import {
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState
} from "react"
import { useProject } from "../../canvas/context.ts"
import { DesignIcon, kindColors } from "../../canvas/kinds.tsx"
import { Tools } from "../../chrome/FloatingToolbar/Tools.tsx"
import { IconButton } from "../../chrome/IconButton.tsx"
import { keymap } from "../../chrome/keymap.ts"
import { BarDivider, floatingBar } from "../../chrome/toolbar-parts.tsx"
import { useTool } from "../../selection.ts"
import type { Look } from "../start/data.ts"
import { desktop, phone } from "../start/render-kit.tsx"
import { DesignRender } from "../start/renders.tsx"
import { type Sample, sampleOf } from "./data.ts"
import { ScreenPicture, sizeOf } from "./screens.tsx"

/*
 * A sketch of the canvas, standing in for the board: the Pricing design with its desktop and phone previews, and the
 * references placed beside it. It pans with the wheel, the hand tool, Space or the middle button, and zooms with Ctrl
 * and the wheel, a pinch, or the Zoom controls, as the app's canvas does.
 */

/** A reference on the canvas, at a point in canvas pixels, at its screen's own size. */
export interface Placed {
  key: string
  /** The screen's id on Mobbin. */
  id: string
  x: number
  y: number
  /** The description that found it. */
  query: string
  /** Why it's here, in a person's or an agent's words. */
  note?: string
  /** The agent that placed it, when one did. */
  by?: string
}

/** Where the canvas is looking: its zoom, and where the canvas's origin sits in the view. */
export interface View {
  zoom: number
  x: number
  y: number
}

interface Box {
  x: number
  y: number
  width: number
  height: number
}

/** Space between the design's previews, in canvas pixels. */
const between = 64

/** The design's previews: desktop at the origin, and phone beside it. */
const previews = {
  desktop: { x: 0, y: 0, ...desktop },
  phone: { x: desktop.width + between, y: 0, ...phone }
}

/** The box the design takes on the canvas. */
export const designBox: Box = { x: 0, y: 0, width: previews.phone.x + phone.width, height: phone.height }

/** The design's own look, as the person's project draws it. */
const ownLook: Look = { hue: 250, brand: "Acme", icon: Layers }

export function boxOf(placed: Placed): Box | undefined {
  const sample = sampleOf(placed.id)

  return sample && { x: placed.x, y: placed.y, ...sizeOf(sample) }
}

const zoomLimits = { least: 0.05, most: 2 }

function clampZoom(zoom: number): number {
  return Math.min(zoomLimits.most, Math.max(zoomLimits.least, zoom))
}

interface CanvasProps {
  designName: string
  designColor: string
  designSelected: boolean
  placed: Placed[]
  /** The selected reference's key. */
  selected?: string
  /** Where to look at first; the canvas fits everything when it's left out. */
  view?: View
  /** Changes when the canvas should fit everything again, as after references are placed. */
  fitKey: number
  onSelectDesign: () => void
  onSelect: (key: string | undefined) => void
  onMove: (key: string, x: number, y: number) => void
  onDelete: (key: string) => void
  onOpen: (sample: Sample) => void
  onFind: () => void
  /** A note for the reviewer, over the canvas at screen size. */
  children?: ReactNode
}

export function CanvasSketch({
  designName,
  designColor,
  designSelected,
  placed,
  selected,
  view: firstView,
  fitKey,
  onSelectDesign,
  onSelect,
  onMove,
  onDelete,
  onOpen,
  onFind,
  children
}: CanvasProps) {
  const session = useProject()
  const tool = useTool(session.selection)
  const ref = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<View>(firstView ?? { zoom: 0.3, x: 64, y: 120 })
  const [gliding, setGliding] = useState(false)
  const [spaceHeld, setSpaceHeld] = useState(false)
  const pan = useRef<{ from: { x: number; y: number }; start: View }>(undefined)
  const drag = useRef<{ key: string; from: { x: number; y: number }; start: { x: number; y: number } }>(undefined)
  const fitted = useRef(firstView ? fitKey : undefined)

  const fit = () => {
    const element = ref.current

    if (!element) {
      return
    }

    const boxes = [designBox, ...placed.flatMap((each) => boxOf(each) ?? [])]
    const left = Math.min(...boxes.map((box) => box.x))
    const top = Math.min(...boxes.map((box) => box.y))
    const right = Math.max(...boxes.map((box) => box.x + box.width))
    const bottom = Math.max(...boxes.map((box) => box.y + box.height))
    // Room for the names above, the captions below, and the toolbar.
    const room = { side: 56, top: 72, bottom: 112 }

    const zoom = clampZoom(
      Math.min(
        (element.clientWidth - room.side * 2) / (right - left),
        (element.clientHeight - room.top - room.bottom) / (bottom - top),
        1
      )
    )

    setView({
      zoom,
      x: (element.clientWidth - (right - left) * zoom) / 2 - left * zoom,
      y: room.top + (element.clientHeight - room.top - room.bottom - (bottom - top) * zoom) / 2 - top * zoom
    })
  }

  // Fits everything when it opens without a view, and again each time it's asked to.
  useLayoutEffect(() => {
    if (fitted.current === fitKey) {
      return undefined
    }

    const glide = fitted.current !== undefined
    fitted.current = fitKey
    setGliding(glide)
    fit()
    const done = setTimeout(() => setGliding(false), 320)

    return () => clearTimeout(done)
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- fits what's there when asked, not whenever it changes
  }, [fitKey])

  const zoomAt = (factor: number, at?: { x: number; y: number }) =>
    setView((current) => {
      const element = ref.current
      const point = at ?? { x: (element?.clientWidth ?? 0) / 2, y: (element?.clientHeight ?? 0) / 2 }
      const zoom = clampZoom(current.zoom * factor)
      const by = zoom / current.zoom

      return { zoom, x: point.x - (point.x - current.x) * by, y: point.y - (point.y - current.y) * by }
    })

  // The wheel pans, and zooms with Ctrl or a pinch. React's own wheel listener can't stop the page zooming.
  useEffect(() => {
    const element = ref.current

    if (!element) {
      return undefined
    }

    const onWheel = (event: WheelEvent) => {
      event.preventDefault()

      if (event.ctrlKey || event.metaKey) {
        const box = element.getBoundingClientRect()
        zoomAt(Math.exp(-event.deltaY * 0.01), { x: event.clientX - box.left, y: event.clientY - box.top })
      } else {
        setView((current) => ({ ...current, x: current.x - event.deltaX, y: current.y - event.deltaY }))
      }
    }

    element.addEventListener("wheel", onWheel, { passive: false })

    return () => element.removeEventListener("wheel", onWheel)
  }, [])

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.target !== event.currentTarget) {
      return
    }

    if ((event.key === "Delete" || event.key === "Backspace") && selected) {
      onDelete(selected)
    } else if (event.key === "Escape") {
      onSelect(undefined)
    } else if (event.key === "r" || event.key === "R") {
      onFind()
    } else if (event.key === " ") {
      setSpaceHeld(true)
    } else if (event.key === "+" || event.key === "=") {
      zoomAt(1.25)
    } else if (event.key === "-") {
      zoomAt(0.8)
    } else if (event.key === "!") {
      setGliding(true)
      fit()
      setTimeout(() => setGliding(false), 320)
    } else {
      return
    }

    event.preventDefault()
  }

  const panning = tool === "hand" || spaceHeld

  const startPan = (event: ReactPointerEvent) => {
    pan.current = { from: { x: event.clientX, y: event.clientY }, start: view }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onPointerDown = (event: ReactPointerEvent) => {
    ref.current?.focus()

    if (panning || event.button === 1) {
      startPan(event)
    } else {
      onSelect(undefined)
    }
  }

  const onPointerMove = (event: ReactPointerEvent) => {
    const current = pan.current

    if (current) {
      setView({
        ...current.start,
        x: current.start.x + event.clientX - current.from.x,
        y: current.start.y + event.clientY - current.from.y
      })
    }
  }

  const startMove = (event: ReactPointerEvent, item: Placed) => {
    if (panning || event.button === 1) {
      return
    }

    event.stopPropagation()
    onSelect(item.key)
    ref.current?.focus()
    drag.current = { key: item.key, from: { x: event.clientX, y: event.clientY }, start: { x: item.x, y: item.y } }

    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Not a pointer that's down.
    }
  }

  const moving = (event: ReactPointerEvent) => {
    const current = drag.current

    if (current) {
      onMove(
        current.key,
        current.start.x + (event.clientX - current.from.x) / view.zoom,
        current.start.y + (event.clientY - current.from.y) / view.zoom
      )
    }
  }

  const fitNow = () => {
    setGliding(true)
    fit()
    setTimeout(() => setGliding(false), 320)
  }

  return (
    <div
      ref={ref}
      role="application"
      aria-roledescription="canvas"
      aria-label="Canvas"
      tabIndex={0}
      onKeyDown={onKeyDown}
      onKeyUp={(event) => {
        if (event.key === " ") {
          setSpaceHeld(false)
        }
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={() => {
        pan.current = undefined
      }}
      className={`relative min-w-0 flex-1 touch-none overflow-hidden bg-muted/40 outline-none dark:bg-muted/20 ${
        panning ? "cursor-grab active:cursor-grabbing" : ""
      }`}
    >
      <div
        className={`absolute top-0 left-0 origin-top-left ${gliding ? "transition-transform duration-300 ease-out" : ""}`}
        style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}
      >
        <DesignBoard
          name={designName}
          color={designColor}
          zoom={view.zoom}
          selected={designSelected}
          onPointerDown={(event) => {
            if (!panning && event.button !== 1) {
              event.stopPropagation()
              ref.current?.focus()
              onSelectDesign()
            }
          }}
        />
        {placed.map((item) => (
          <PlacedReference
            key={item.key}
            item={item}
            zoom={view.zoom}
            selected={selected === item.key}
            onPointerDown={(event) => startMove(event, item)}
            onPointerMove={moving}
            onPointerUp={() => {
              drag.current = undefined
            }}
            onOpen={onOpen}
          />
        ))}
      </div>
      <div
        className={`absolute top-3 right-3 flex items-center gap-0.5 ${floatingBar}`}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <IconButton label={keymap.zoomOut.label} shortcut={keymap.zoomOut.keys[0]} onClick={() => zoomAt(0.8)}>
          <Minus />
        </IconButton>
        <Button
          variant="ghost"
          size="sm"
          aria-label={`${keymap.zoomTo100.label}, now ${Math.round(view.zoom * 100)}%`}
          className="min-w-14 tabular-nums"
          onClick={() => zoomAt(1 / view.zoom)}
        >
          {Math.round(view.zoom * 100)}%
        </Button>
        <IconButton label={keymap.zoomIn.label} shortcut={keymap.zoomIn.keys[0]} onClick={() => zoomAt(1.25)}>
          <Plus />
        </IconButton>
        <IconButton label={keymap.zoomToFit.label} shortcut={keymap.zoomToFit.keys[0]} onClick={fitNow}>
          <Maximize />
        </IconButton>
      </div>
      <div
        role="toolbar"
        aria-label="Toolbar"
        className={`absolute bottom-4 left-1/2 flex -translate-x-1/2 items-stretch ${floatingBar}`}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <Tools />
        <BarDivider />
        <IconButton label="Find references" shortcut="R" size="icon" onClick={onFind}>
          <Telescope />
        </IconButton>
      </div>
      {children && (
        <div className="pointer-events-none absolute top-3 left-3 max-w-xs rounded-lg border bg-background/95 p-3 shadow-lg">
          {children}
        </div>
      )}
    </div>
  )
}

/** The size something drawn at screen size takes inside the scaled canvas, so it stays that size at any zoom. */
function onScreen(pixels: number, zoom: number): number {
  return pixels / zoom
}

function DesignBoard({
  name,
  color,
  zoom,
  selected,
  onPointerDown
}: {
  name: string
  color: string
  zoom: number
  selected: boolean
  onPointerDown: (event: ReactPointerEvent) => void
}) {
  const outline = selected ? `${onScreen(2, zoom)}px solid ${color}` : `${onScreen(1, zoom)}px solid var(--border)`

  return (
    <div
      role="group"
      aria-label={name}
      className="absolute top-0 left-0"
      style={{ width: designBox.width, height: designBox.height }}
      onPointerDown={onPointerDown}
    >
      <div
        className="absolute left-0 flex items-center font-medium whitespace-nowrap text-muted-foreground"
        style={{
          bottom: designBox.height + onScreen(8, zoom),
          gap: onScreen(6, zoom),
          fontSize: onScreen(12, zoom),
          color: selected ? color : undefined
        }}
      >
        <DesignIcon kind="screen" style={{ color, width: onScreen(14, zoom), height: onScreen(14, zoom) }} />
        {name}
      </div>
      <div className="absolute top-0" style={{ left: previews.desktop.x, width: desktop.width, outline }}>
        <DesignRender kind="pricing" look={ownLook} />
      </div>
      <div className="absolute top-0" style={{ left: previews.phone.x, width: phone.width, outline }}>
        <DesignRender kind="pricing" look={ownLook} mobile />
      </div>
    </div>
  )
}

/**
 * A reference on the canvas: its picture at its own size, with its app and where it's from under it in the canvas's
 * quiet caption, then its note. No board, states or modes: it's there to look at.
 */
function PlacedReference({
  item,
  zoom,
  selected,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onOpen
}: {
  item: Placed
  zoom: number
  selected: boolean
  onPointerDown: (event: ReactPointerEvent) => void
  onPointerMove: (event: ReactPointerEvent) => void
  onPointerUp: () => void
  onOpen: (sample: Sample) => void
}) {
  const sample = sampleOf(item.id)

  if (!sample) {
    return null
  }

  const size = sizeOf(sample)

  const outline = selected
    ? `${onScreen(2, zoom)}px solid ${kindColors.layer}`
    : `${onScreen(1, zoom)}px solid var(--border)`

  return (
    <div
      role="img"
      aria-label={`Reference: ${sample.app}, from Mobbin`}
      className="absolute cursor-default touch-none select-none"
      style={{ left: item.x, top: item.y, width: size.width }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDoubleClick={() => onOpen(sample)}
    >
      <ScreenPicture screen={sample} style={{ outline }} />
      <div
        className="flex flex-col text-muted-foreground"
        style={{ marginTop: onScreen(6, zoom), gap: onScreen(2, zoom), fontSize: onScreen(11, zoom), lineHeight: 1.35 }}
      >
        <div className="flex items-baseline justify-between" style={{ gap: onScreen(8, zoom) }}>
          <span className="truncate font-medium text-foreground">{sample.app}</span>
          <span className="shrink-0">Mobbin</span>
        </div>
        {item.note && <span className="line-clamp-2">{item.note}</span>}
      </div>
    </div>
  )
}
