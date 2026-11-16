/* oxlint-disable jsx-a11y/no-noninteractive-tabindex, jsx-a11y/no-noninteractive-element-interactions -- the canvas takes keys and what it draws stands in for the canvas's shapes, which take the pointer; the keyboard reaches them through the left panel and the canvas's keys, as in the app */
import { Button, Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@buildkitgg/shadcn"
import { labelLook } from "@parity-app/editor"
import { KeyRound, Link2, Maximize, Minus, Plus } from "lucide-react"
import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react"
import { FloatingToolbar } from "../../chrome/FloatingToolbar/FloatingToolbar.tsx"
import { IconButton } from "../../chrome/IconButton.tsx"
import { keymap } from "../../chrome/keymap.ts"
import { CommandTip, floatingBar, pressableWide, pressMotion } from "../../chrome/toolbar-parts.tsx"
import {
  type Box,
  bounds,
  boxesIn,
  kindLooks,
  type LensInfo,
  lenses,
  membersIn,
  pageLinks,
  type Thing,
  tableHeader,
  tableRow,
  things
} from "./data.ts"
import type { LensId } from "./model.ts"

/** Where a canvas looks: a point on screen is `world * z + (x, y)`. */
export interface Camera {
  x: number
  y: number
  z: number
}

const zoomSteps = [0.02, 0.05, 0.1, 0.15, 0.25, 0.33, 0.5, 0.75, 1, 1.5, 2, 4]
const minZoom = 0.02
const maxZoom = 4

const clamp = (z: number) => Math.min(maxZoom, Math.max(minZoom, z))

/** The zoom a lens first opens at, at most: designs at a size that reads, a board or a table up close. */
const firstZoom: Record<LensId, number> = { pages: 0.5, screens: 0.5, components: 1, stories: 1, data: 1, api: 1 }

/** How far the next zoom step is, in or out. */
function step(z: number, by: 1 | -1): number {
  if (by > 0) {
    return zoomSteps.find((each) => each > z + 0.001) ?? maxZoom
  }

  return zoomSteps.findLast((each) => each < z - 0.001) ?? minZoom
}

/** A group's room round its members, at a zoom: its sides, and its top, which holds its header and its members' titles. */
function groupRoom(z: number) {
  const { scale } = labelLook("name", z)
  const side = 48 + 12 / z

  return { side, top: side + (80 * scale) / z }
}

/** The room a thing's title takes above it, at a zoom, as the app's title bars do: a board's taller than a frame's. */
function titleRoom(item: Thing, z: number): number {
  const { scale } = labelLook("name", z)
  const captions = item.kind === "screen" || item.kind === "component" ? 26 / z : 0
  const board = item.kind === "component" ? 32 : 0

  return ((item.kind === "component" ? 42 : 28) * scale) / z + captions + board
}

/**
 * The lens's things placed for a zoom, as the app places boards: each row keeps its order, and moves down so its titles
 * never run into the row above, however far out the canvas is zoomed. The rows are the things' rows in the data.
 */
function arrange(lens: LensId, z: number): Thing[] {
  const list = things[lens]

  if (lens === "data") {
    return list
  }

  const top = list.filter((each) => !each.parent)

  const extent = (item: Thing) => {
    const box = bounds(boxesIn(list, item))

    if (item.kind === "layout" || item.kind === "story-file") {
      const room = groupRoom(z)

      return { top: box.y - room.top, bottom: box.y + box.h + room.side }
    }

    return { top: box.y - titleRoom(item, z), bottom: box.y + box.h + (item.kind === "component" ? 32 : 0) }
  }

  const rows = Map.groupBy(top, (item) => Math.round(bounds(boxesIn(list, item)).y / 200))
  const shifts = new Map<string, number>()
  let floor: number | undefined

  for (const key of [...rows.keys()].toSorted((a, b) => a - b)) {
    const row = rows.get(key)!
    const tops = Math.min(...row.map((item) => extent(item).top))
    const shift = floor === undefined ? 0 : Math.max(0, floor + 40 / z - tops)

    for (const item of row) {
      shifts.set(item.id, shift)
    }

    floor = Math.max(...row.map((item) => extent(item).bottom)) + shift
  }

  return list.map((item) => {
    const shift = shifts.get(item.parent ?? item.id) ?? 0

    return shift === 0 || !item.frames
      ? item
      : { ...item, frames: item.frames.map((frame) => ({ ...frame, box: { ...frame.box, y: frame.box.y + shift } })) }
  })
}

/** Everything a lens draws at a zoom, for zooming to fit. */
function contentBox(list: readonly Thing[]): Box | undefined {
  const boxes = list.filter((each) => !each.parent).flatMap((each) => boxesIn(list, each))

  return boxes.length > 0 ? bounds(boxes) : undefined
}

/** The camera that shows a box in a view, with room round it for titles and the floating bars. */
function fit(box: Box, width: number, height: number, cap = 1): Camera {
  const room = { top: 96, side: 72, bottom: 112 }
  const z = clamp(Math.min((width - room.side * 2) / box.w, (height - room.top - room.bottom) / box.h, cap))

  return {
    z,
    x: (width - box.w * z) / 2 - box.x * z,
    y: room.top + (height - room.top - room.bottom - box.h * z) / 2 - box.y * z
  }
}

/** Fits a lens, placing it at the zoom it'll fit at, so its titles have room. */
function fitLens(lens: LensId, width: number, height: number, cap: number, box?: (list: Thing[]) => Box | undefined) {
  const measure = box ?? contentBox
  const first = measure(arrange(lens, 1))

  if (!first) {
    return undefined
  }

  const rough = fit(first, width, height, cap)
  const placed = measure(arrange(lens, rough.z))

  return placed ? fit(placed, width, height, cap) : rough
}

/** Zooms about a point on screen, keeping what's under it still. */
function zoomAbout(camera: Camera, z: number, at: { x: number; y: number }): Camera {
  const next = clamp(z)

  return { z: next, x: at.x - ((at.x - camera.x) * next) / camera.z, y: at.y - ((at.y - camera.y) * next) / camera.z }
}

interface LensCanvasProps {
  lens: LensId
  selected: string | undefined
  /** What a link elsewhere points at while it's hovered, outlined as if hovered here. */
  peek?: string | undefined
  onSelect: (id: string | undefined) => void
  camera: Camera | undefined
  onCamera: (camera: Camera) => void
}

/**
 * A lens's canvas: what it draws, at its own camera, which stays when the lens moves to another canvas or window. The
 * wheel pans and Ctrl with the wheel zooms, as the app's canvas does; the middle button or Space drags it; and the
 * app's zoom keys work while it has focus.
 */
export function LensCanvas({ lens, selected, peek, onSelect, camera, onCamera }: LensCanvasProps) {
  const view = useRef<HTMLDivElement>(null)
  const latest = useRef({ camera, onCamera })
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [pointed, setHovered] = useState<string>()
  const hovered = pointed ?? peek
  const [space, setSpace] = useState(false)
  const info = lenses[lens]
  const zoom = camera?.z ?? 1
  const list = useMemo(() => arrange(lens, zoom), [lens, zoom])

  useEffect(() => {
    latest.current = { camera, onCamera }
  })

  useLayoutEffect(() => {
    const element = view.current

    if (!element) {
      return
    }

    const observer = new ResizeObserver(() => setSize({ width: element.clientWidth, height: element.clientHeight }))
    observer.observe(element)

    return () => observer.disconnect()
  }, [])

  // The first time a lens is shown, it's zoomed to fit what it draws.
  useLayoutEffect(() => {
    if (!camera && size.width > 0) {
      const first = fitLens(lens, size.width, size.height, firstZoom[lens])

      if (first) {
        onCamera(first)
      }
    }
  }, [camera, lens, size.width, size.height, onCamera])

  // The wheel pans and Ctrl with it zooms, which needs a listener that can stop the page scrolling.
  useEffect(() => {
    const element = view.current

    if (!element) {
      return
    }

    const wheel = (event: WheelEvent) => {
      const { camera: now, onCamera: set } = latest.current

      if (!now) {
        return
      }

      event.preventDefault()

      if (event.ctrlKey || event.metaKey) {
        const box = element.getBoundingClientRect()
        const at = { x: event.clientX - box.left, y: event.clientY - box.top }
        set(zoomAbout(now, now.z * Math.exp(-event.deltaY * 0.01), at))

        return
      }

      const sideways = event.shiftKey && event.deltaX === 0
      set({ ...now, x: now.x - (sideways ? event.deltaY : event.deltaX), y: now.y - (sideways ? 0 : event.deltaY) })
    }

    element.addEventListener("wheel", wheel, { passive: false })

    return () => element.removeEventListener("wheel", wheel)
  }, [])

  const centre = { x: size.width / 2, y: size.height / 2 }

  const zoomTo = (z: number) => camera && onCamera(zoomAbout(camera, z, centre))

  const zoomToFit = () => {
    const next = fitLens(lens, size.width, size.height, 1)

    if (next) {
      onCamera(next)
    }
  }

  const zoomToSelection = () => {
    const item = list.find((each) => each.id === selected)

    if (item) {
      const next = fitLens(lens, size.width, size.height, 1, (placed) => {
        const at = placed.find((each) => each.id === item.id)

        return at && bounds(boxesIn(placed, at))
      })

      if (next) {
        onCamera(next)
      }
    }
  }

  const drag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!camera || !(event.button === 1 || (event.button === 0 && space))) {
      return
    }

    event.preventDefault()
    const target = event.currentTarget
    target.setPointerCapture(event.pointerId)
    const start = { x: event.clientX - camera.x, y: event.clientY - camera.y }

    const move = (moved: PointerEvent) =>
      latest.current.onCamera({ ...latest.current.camera!, x: moved.clientX - start.x, y: moved.clientY - start.y })

    const end = () => {
      target.removeEventListener("pointermove", move)
      target.removeEventListener("pointerup", end)
    }

    target.addEventListener("pointermove", move)
    target.addEventListener("pointerup", end)
  }

  if (info.missing) {
    return <MissingLens info={info} />
  }

  const keys = new Map<string, () => void>([
    ["+", () => zoomTo(step(zoom, 1))],
    ["=", () => zoomTo(step(zoom, 1))],
    ["-", () => zoomTo(step(zoom, -1))],
    [")", () => zoomTo(1)],
    ["!", zoomToFit],
    ["@", zoomToSelection],
    ["Escape", () => onSelect(undefined)]
  ])

  return (
    <div
      ref={view}
      role="application"
      aria-label={`${info.label} canvas`}
      aria-roledescription="canvas"
      tabIndex={0}
      className={`relative isolate min-h-0 flex-1 overflow-hidden bg-[rgb(249,250,251)] outline-none dark:bg-[rgb(16,16,17)] ${
        space ? "cursor-grab active:cursor-grabbing" : ""
      }`}
      onPointerDown={(event) => {
        drag(event)

        if (event.button === 0 && !space && event.target === event.currentTarget) {
          onSelect(undefined)
        }
      }}
      onKeyDown={(event) => {
        if (event.key === " " && !event.repeat) {
          setSpace(true)
          event.preventDefault()

          return
        }

        const ctrl = event.ctrlKey || event.metaKey
        // Shift with a number reads as its symbol; Ctrl 0 goes to 100% too.
        const key = ctrl && event.key === "0" ? ")" : event.key
        const run = keys.get(key)

        if (run) {
          run()
          event.preventDefault()
        }
      }}
      onKeyUp={(event) => event.key === " " && setSpace(false)}
      onBlur={() => setSpace(false)}
    >
      {camera && (
        <div
          className="pointer-events-none absolute top-0 left-0 origin-top-left"
          style={{ transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.z})` }}
        >
          {lens === "pages" && <PageLines list={list} zoom={camera.z} selected={selected} hovered={hovered} />}
          {lens === "data" && <Relations zoom={camera.z} selected={selected} hovered={hovered} />}
          {list
            .filter((each) => !each.parent)
            .map((each) => (
              <ThingView
                key={each.id}
                list={list}
                item={each}
                zoom={camera.z}
                selected={selected}
                hovered={hovered}
                onSelect={onSelect}
                onHover={setHovered}
              />
            ))}
        </div>
      )}
      {camera && (
        <ZoomBar
          zoom={camera.z}
          onZoomIn={() => zoomTo(step(camera.z, 1))}
          onZoomOut={() => zoomTo(step(camera.z, -1))}
          on100={() => zoomTo(1)}
          onFit={zoomToFit}
        />
      )}
      {info.tools && <FloatingToolbar />}
    </div>
  )
}

interface ThingViewProps {
  list: readonly Thing[]
  item: Thing
  zoom: number
  selected: string | undefined
  hovered: string | undefined
  onSelect: (id: string) => void
  onHover: (id: string | undefined) => void
}

/** A thing on the canvas, by its kind: a group round its members, a table, or its frames under its title. */
function ThingView(props: ThingViewProps) {
  const { item } = props

  if (item.kind === "layout" || item.kind === "story-file") {
    return <Group {...props} />
  }

  if (item.kind === "table") {
    return <TableCard {...props} />
  }

  return <Frames {...props} />
}

/**
 * A label kept at its screen size as the canvas zooms, then shrinking and fading as `labelLook` says, as every label on
 * the app's canvas does. It sits above its box, as wide on screen as the box, so a long one truncates.
 */
function Label({
  zoom,
  width,
  kind = "name",
  className = "",
  children
}: {
  zoom: number
  width: number
  kind?: "name" | "detail"
  className?: string
  children: ReactNode
}) {
  const { scale, opacity } = labelLook(kind, zoom, { width })

  return (
    <div
      className={`absolute bottom-full left-0 origin-bottom-left ${className}`}
      style={{
        transform: `scale(${scale / zoom})`,
        width: `${(100 * zoom) / scale}%`,
        opacity,
        visibility: opacity > 0 ? undefined : "hidden"
      }}
    >
      {children}
    </div>
  )
}

const handleCorners = ["top-left", "top-right", "bottom-left", "bottom-right"] as const

/** A selected or hovered thing's outline, a pixel and a half on screen, with handles at the corners while selected. */
function Outline({
  zoom,
  color,
  selected,
  radius = 0
}: {
  zoom: number
  color: string
  selected: boolean
  radius?: number
}) {
  const handle = 8 / zoom

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{
        outline: `${(selected ? 1.5 : 1) / zoom}px solid ${selected ? color : `color-mix(in oklch, ${color} 70%, transparent)`}`,
        borderRadius: radius
      }}
    >
      {selected &&
        handleCorners.map((corner) => (
          <span
            key={corner}
            className="absolute bg-white"
            style={{
              width: handle,
              height: handle,
              border: `${1 / zoom}px solid ${color}`,
              borderRadius: 2 / zoom,
              ...corners(corner, handle)
            }}
          />
        ))}
    </div>
  )
}

function corners(corner: (typeof handleCorners)[number], size: number): CSSProperties {
  const half = -size / 2

  return {
    top: corner.startsWith("top") ? half : undefined,
    bottom: corner.startsWith("bottom") ? half : undefined,
    left: corner.endsWith("left") ? half : undefined,
    right: corner.endsWith("right") ? half : undefined
  }
}

/**
 * A page, screen, component or story: its title above, its icon in its kind's color, then its frames. A screen's
 * modes and a component's states each have a caption, and a component's states sit on its board, as the app draws them.
 */
function Frames({ item, zoom, selected, hovered, onSelect, onHover }: ThingViewProps) {
  const look = kindLooks[item.kind]
  const Icon = look.icon
  const box = bounds(item.frames!.map((frame) => frame.box))
  const isSelected = selected === item.id
  const isHovered = hovered === item.id && !isSelected
  const board = item.kind === "component"
  const captions = item.kind === "screen" || board
  const pad = board ? 32 : 0
  // Room above the frames for their captions, at their size on screen.
  const band = captions ? 26 / zoom : 0
  const radius = board ? 16 / Math.max(zoom, 0.4) : 0

  return (
    <div
      className="pointer-events-auto absolute"
      style={{ left: box.x - pad, top: box.y - pad - band, width: box.w + pad * 2, height: box.h + pad * 2 + band }}
      onPointerDown={(event) => {
        if (event.button === 0) {
          event.stopPropagation()
          onSelect(item.id)
        }
      }}
      onPointerEnter={() => onHover(item.id)}
      onPointerLeave={() => onHover(undefined)}
    >
      <Label zoom={zoom} width={box.w + pad * 2} className={board ? "pb-2.5" : "pb-1"}>
        <div className={`flex min-w-0 items-center gap-1.5 px-1 text-sm ${board ? "h-8" : "h-6"}`}>
          <Icon className="size-4 shrink-0" style={{ color: look.color }} />
          <span
            className={`truncate ${isSelected ? "font-medium" : "text-muted-foreground"}`}
            style={isSelected ? { color: look.color } : undefined}
          >
            {item.name}
          </span>
          {item.kind === "page" && <span className="truncate text-xs text-muted-foreground">{item.detail}</span>}
        </div>
      </Label>
      {board && (
        <div
          className="absolute inset-0 border bg-background/70 dark:bg-white/[0.03]"
          style={{ borderRadius: radius, borderWidth: 1 / zoom }}
        />
      )}
      {item.frames!.map((frame) => (
        <div
          key={frame.name}
          className="absolute bg-white shadow-[0_1px_3px_rgb(0_0_0/0.08)]"
          style={{
            left: frame.box.x - box.x + pad,
            top: frame.box.y - box.y + pad + band,
            width: frame.box.w,
            height: frame.box.h
          }}
        >
          {captions && (
            <Label zoom={zoom} width={frame.box.w + 40} kind="detail" className="pb-1">
              <span className="block truncate px-1 text-xs text-muted-foreground">{frame.name}</span>
            </Label>
          )}
          <img src={frame.src} alt="" draggable={false} className="size-full object-cover object-top select-none" />
        </div>
      ))}
      {(isSelected || isHovered) && <Outline zoom={zoom} color={look.color} selected={isSelected} radius={radius} />}
    </div>
  )
}

/**
 * A group with no frame of its own: a route's layout round its pages, or a story file round its stories. A rounded
 * outline, dashed until it's selected or hovered, with its name and path in its header, as the app draws a layout.
 */
function Group(props: ThingViewProps) {
  const { list, item, zoom, selected, hovered, onSelect, onHover } = props
  const look = kindLooks[item.kind]
  const Icon = look.icon
  const inner = bounds(boxesIn(list, item))
  const { scale, opacity } = labelLook("name", zoom, { width: inner.w })
  const size = scale / zoom
  const room = groupRoom(zoom)

  const box = {
    x: inner.x - room.side,
    y: inner.y - room.top,
    w: inner.w + room.side * 2,
    h: inner.h + room.top + room.side
  }

  const forward = selected === item.id || hovered === item.id
  const color = look.color
  const line = forward ? color : `color-mix(in oklch, ${color} 45%, transparent)`

  return (
    <>
      <div
        className="absolute"
        style={{
          left: box.x,
          top: box.y,
          width: box.w,
          height: box.h,
          border: `${(selected === item.id ? 1.5 : 1) / zoom}px ${forward ? "solid" : "dashed"} ${line}`,
          borderRadius: 12 / zoom
        }}
      >
        <div
          className="pointer-events-auto absolute top-0 left-0 flex origin-top-left items-center gap-2 px-3 pt-2.5"
          style={{
            transform: `scale(${size})`,
            width: box.w / size,
            opacity,
            visibility: opacity > 0 ? undefined : "hidden"
          }}
        >
          <button
            type="button"
            tabIndex={-1}
            className="flex min-w-0 cursor-default items-center gap-1.5 rounded-md px-1 py-0.5 text-left text-sm"
            onPointerDown={(event) => {
              event.stopPropagation()
              onSelect(item.id)
            }}
            onPointerEnter={() => onHover(item.id)}
            onPointerLeave={() => onHover(undefined)}
          >
            <Icon className="size-4 shrink-0" style={{ color }} />
            <span className="flex min-w-0 flex-col items-start leading-tight">
              <span
                className="truncate font-medium text-foreground/90"
                style={selected === item.id ? { color } : undefined}
              >
                {item.name}
              </span>
              <span className="truncate text-xs text-muted-foreground">{item.detail}</span>
            </span>
          </button>
        </div>
      </div>
      {membersIn(list, item.id).map((member) => (
        <ThingView key={member.id} {...props} item={member} />
      ))}
    </>
  )
}

/** A table in the ERD: its name, then its columns, a key marked with its icon and a foreign key with a link. */
function TableCard({ list, item, zoom, selected, hovered, onSelect, onHover }: ThingViewProps) {
  const look = kindLooks.table
  const Icon = look.icon
  const box = boxesIn(list, item)[0]!
  const isSelected = selected === item.id
  const lit = isSelected || hovered === item.id || relatedTo(selected ?? hovered).has(item.id)
  let border: string | undefined

  if (isSelected) {
    border = look.color
  } else if (lit) {
    border = `color-mix(in oklch, ${look.color} 50%, var(--border))`
  }

  return (
    <div
      className="pointer-events-auto absolute overflow-hidden rounded-lg border bg-background text-sm shadow-[0_1px_3px_rgb(0_0_0/0.08)]"
      style={{
        left: box.x,
        top: box.y,
        width: box.w,
        height: box.h,
        borderColor: border,
        boxShadow: isSelected ? `0 0 0 ${0.5 / zoom}px ${look.color}` : undefined
      }}
      onPointerDown={(event) => {
        if (event.button === 0) {
          event.stopPropagation()
          onSelect(item.id)
        }
      }}
      onPointerEnter={() => onHover(item.id)}
      onPointerLeave={() => onHover(undefined)}
    >
      <div className="flex items-center gap-2 border-b bg-muted/50 px-3 font-medium" style={{ height: tableHeader }}>
        <Icon className="size-4 shrink-0" style={{ color: look.color }} />
        <span className="truncate">{item.name}</span>
      </div>
      {item.columns!.map((column) => (
        <div key={column.name} className="flex items-center gap-2 px-3" style={{ height: tableRow }}>
          <span className="grid size-3.5 shrink-0 place-items-center text-muted-foreground">
            {column.key === "primary" && <KeyRound className="size-3.5 text-amber-500" />}
            {column.key === "foreign" && <Link2 className="size-3.5" style={{ color: look.color }} />}
          </span>
          <span className="truncate font-mono text-[13px]">{column.name}</span>
          <span className="ml-auto truncate font-mono text-xs text-muted-foreground">{column.type}</span>
        </div>
      ))}
    </div>
  )
}

/** The tables a table refers to or is referred to by. */
function relatedTo(id: string | undefined): Set<string> {
  const related = new Set<string>()

  for (const table of things.data) {
    for (const column of table.columns ?? []) {
      if (column.refers && (table.id === id || column.refers === id)) {
        related.add(table.id)
        related.add(column.refers)
      }
    }
  }

  return related
}

/** The ERD's relations, from each foreign key to the key it refers to, lit while either table is selected or hovered. */
function Relations({
  zoom,
  selected,
  hovered
}: {
  zoom: number
  selected: string | undefined
  hovered: string | undefined
}) {
  const lines = things.data.flatMap((table) =>
    (table.columns ?? []).flatMap((column, row) => {
      const target = things.data.find((each) => each.id === column.refers)

      if (!target) {
        return []
      }

      const from = boxesIn(things.data, table)[0]!
      const to = boxesIn(things.data, target)[0]!
      const toRow = target.columns!.findIndex((each) => each.key === "primary")
      const y1 = from.y + tableHeader + tableRow * (row + 0.5)
      const y2 = to.y + tableHeader + tableRow * (toRow + 0.5)
      const rightward = to.x > from.x + from.w / 2
      const x1 = rightward ? from.x + from.w : from.x
      const x2 = rightward ? to.x : to.x + to.w
      const bend = Math.max(40, Math.abs(x2 - x1) / 2) * (rightward ? 1 : -1)
      const lit = [table.id, target.id].some((id) => id === selected || id === hovered)

      return [
        {
          key: `${table.id}.${column.name}`,
          d: `M ${x1} ${y1} C ${x1 + bend} ${y1} ${x2 - bend} ${y2} ${x2} ${y2}`,
          lit,
          x2,
          y2
        }
      ]
    })
  )

  return (
    <svg className="absolute top-0 left-0 overflow-visible" width={1} height={1} aria-hidden>
      {lines.map((line) => (
        <g key={line.key} style={{ color: line.lit ? kindLooks.table.color : "var(--muted-foreground)" }}>
          <path
            d={line.d}
            fill="none"
            stroke="currentColor"
            strokeOpacity={line.lit ? 1 : 0.45}
            strokeWidth={1.5 / zoom}
          />
          <circle cx={line.x2} cy={line.y2} r={3 / zoom} fill="currentColor" fillOpacity={line.lit ? 1 : 0.6} />
        </g>
      ))}
    </svg>
  )
}

/**
 * Where each page links to, as the app's canvas draws it: a dashed line from the page to the one it goes to, brought
 * forward, moving, while either is selected or hovered.
 */
function PageLines({
  list,
  zoom,
  selected,
  hovered
}: {
  list: readonly Thing[]
  zoom: number
  selected: string | undefined
  hovered: string | undefined
}) {
  const color = kindLooks.page.color
  const faint = `color-mix(in oklch, ${color} 45%, transparent)`

  return (
    <svg className="absolute top-0 left-0 overflow-visible" width={1} height={1} aria-hidden>
      {pageLinks.map(([fromId, toId]) => {
        const fromPage = list.find((each) => each.id === fromId)!
        const toPage = list.find((each) => each.id === toId)!
        const from = fromPage.frames![0]!.box
        const to = toPage.frames![0]!.box
        const across = Math.abs(to.y - from.y) < from.h / 2
        const forward = [fromId, toId].some((id) => id === selected || id === hovered)

        // A line coming down meets the page's title, not its frame, so it doesn't run through the title.
        const start = across
          ? { x: to.x > from.x ? from.x + from.w : from.x, y: from.y + from.h / 2 }
          : { x: from.x + from.w / 2, y: to.y > from.y ? from.y + from.h : from.y - titleRoom(fromPage, zoom) }

        const end = across
          ? { x: to.x > from.x ? to.x : to.x + to.w, y: to.y + to.h / 2 }
          : { x: to.x + to.w / 2, y: to.y > from.y ? to.y - titleRoom(toPage, zoom) : to.y + to.h }

        const bend = across ? { x: (end.x - start.x) / 2, y: 0 } : { x: 0, y: (end.y - start.y) / 2 }
        const d = `M ${start.x} ${start.y} C ${start.x + bend.x} ${start.y + bend.y} ${end.x - bend.x} ${end.y - bend.y} ${end.x} ${end.y}`

        return (
          <g key={`${fromId}-${toId}`}>
            <path
              d={d}
              fill="none"
              stroke={forward ? color : faint}
              strokeWidth={1.5 / zoom}
              strokeDasharray={`${6 / zoom} ${6 / zoom}`}
              strokeLinecap="round"
            >
              {forward && (
                <animate
                  attributeName="stroke-dashoffset"
                  from={0}
                  to={-12 / zoom}
                  dur="1.5s"
                  repeatCount="indefinite"
                />
              )}
            </path>
            <circle cx={end.x} cy={end.y} r={3.5 / zoom} fill={forward ? color : faint} />
          </g>
        )
      })}
    </svg>
  )
}

/** The canvas's zoom, floating at its top right, as the app's is: out, the level, which goes to 100%, in, and fit. */
function ZoomBar({
  zoom,
  onZoomIn,
  onZoomOut,
  on100,
  onFit
}: {
  zoom: number
  onZoomIn: () => void
  onZoomOut: () => void
  on100: () => void
  onFit: () => void
}) {
  const percent = Math.round(zoom * 100)

  return (
    <div className={`absolute top-3 right-3 z-[400] flex items-center gap-0.5 ${floatingBar}`}>
      <IconButton
        label={keymap.zoomOut.label}
        shortcut="zoomOut"
        pressable
        disabled={zoom <= minZoom}
        onClick={onZoomOut}
      >
        <Minus />
      </IconButton>
      <CommandTip command="zoomTo100">
        <Button
          variant="ghost"
          size="sm"
          aria-label={`${keymap.zoomTo100.label}, now ${percent}%`}
          className={`min-w-14 tabular-nums ${pressableWide}`}
          style={pressMotion}
          onClick={on100}
        >
          {percent}%
        </Button>
      </CommandTip>
      <IconButton label={keymap.zoomIn.label} shortcut="zoomIn" pressable disabled={zoom >= maxZoom} onClick={onZoomIn}>
        <Plus />
      </IconButton>
      <IconButton label={keymap.zoomToFit.label} shortcut="zoomToFit" pressable onClick={onFit}>
        <Maximize />
      </IconButton>
    </div>
  )
}

/** A lens the project has nothing for yet: what's missing, and the way to add it. */
function MissingLens({ info }: { info: LensInfo }) {
  const Icon = info.icon

  return (
    <div className="grid min-h-0 flex-1 place-items-center bg-[rgb(249,250,251)] dark:bg-[rgb(16,16,17)]">
      <Empty className="max-w-sm">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Icon />
          </EmptyMedia>
          <EmptyTitle>{info.missing!.title}</EmptyTitle>
          <EmptyDescription>{info.missing!.description}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button variant="outline">{info.missing!.action}</Button>
        </EmptyContent>
      </Empty>
    </div>
  )
}
