/* oxlint-disable jsx-a11y/prefer-tag-over-role, jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex -- the design and the references stand in for the canvas's items, which take the pointer; the keyboard reaches them through the canvas's keys, as in the app */
import { Button } from "@buildkitgg/shadcn-baseui-kit"
import type { Found } from "@parity-app/connectors"
import { dropHint } from "@parity-app/editor"
import { Layers, Maximize, Minus, Plus, Telescope } from "lucide-react"
import {
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState
} from "react"
import { useProject } from "../../canvas/context.ts"
import { chipColors, DesignIcon, kindColors } from "../../canvas/kinds.tsx"
import { Tools } from "../../chrome/FloatingToolbar/Tools.tsx"
import { IconButton } from "../../chrome/IconButton.tsx"
import { keymap } from "../../chrome/keymap.ts"
import { BarDivider, floatingBar } from "../../chrome/toolbar-parts.tsx"
import { useTool } from "../../selection.ts"
import type { Look } from "../start/data.ts"
import { desktop, phone } from "../start/render-kit.tsx"
import { DesignRender } from "../start/renders.tsx"
import { useFileDrag } from "./images-panel.tsx"
import { creditOf, Picture, sizeOf } from "./library.tsx"

/*
 * A sketch of the canvas, standing in for the board: the Pricing design with its desktop and phone previews, the
 * references placed beside it, and a screen holding the photos added to the project. It pans with the wheel, the hand tool, Space or the middle button, and zooms with Ctrl
 * and the wheel, a pinch, or the Zoom controls, as the app's canvas does.
 */

/** A reference on the canvas, at a point in canvas pixels, at its screen's own size. */
export interface Placed {
  key: string
  /** The screen, as the search returned it. */
  found: Found
  x: number
  y: number
  /** The description that found it. */
  query: string
  /** Why it's here, in a person's or an agent's words. */
  note?: string
  /** The agent that placed it, when one did. */
  by?: string
}

/** An image file dropped on the canvas, at 80 steps (320px) wide and as tall as its proportions make it. */
export interface DroppedImage {
  key: string
  picture: Found
  name: string
  width: number
  height: number
}

/**
 * Image files dropped together (PAR-835): onto the design, where they land at the drop point, on top, as in a layout
 * that's absolutely placed; or onto the empty canvas, where they make a new frame there, named after the file or Images.
 */
export interface Dropped {
  key: string
  /** Where the drop was, in canvas pixels: the top left of the images or of their frame. */
  x: number
  y: number
  frame?: string
  images: DroppedImage[]
}

/** How images dropped together lie: side by side, this far apart, inside a new frame's padding. */
const dropLayout = { gap: 16, padding: 32 }

/** Where each image in a drop sits, from the drop's top left, and the box they take with the frame's padding. */
function dropBoxes(drop: Dropped) {
  const inset = drop.frame ? dropLayout.padding : 0
  let x = inset

  const images = drop.images.map((image) => {
    const box = { image, x, y: inset }
    x += image.width + dropLayout.gap

    return box
  })

  const width = x - dropLayout.gap + inset
  const height = Math.max(...drop.images.map((image) => image.height)) + inset * 2

  return { images, box: { x: drop.x, y: drop.y, width, height } }
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

/** A reference's size on the canvas: a laptop's width for the web or a phone's, as tall as its picture makes it. */
function referenceSize(found: Found) {
  const picture = sizeOf(found)
  const width = found.platform === "ios" ? phone.width : desktop.width

  return { width, height: (width / picture.width) * picture.height }
}

export function boxOf(placed: Placed): Box {
  return { x: placed.x, y: placed.y, ...referenceSize(placed.found) }
}

/** How the screen of added photos is laid out: each this tall, in rows that wrap, inside the screen's padding. */
const photoScreen = { x: 0, y: phone.height + 260, width: desktop.width, padding: 64, gap: 24, row: 300 }

/** The box the screen of added photos takes, with nothing when there are none. */
export function photosBox(photos: readonly Found[]): Box | undefined {
  if (photos.length === 0) {
    return undefined
  }

  const inside = photoScreen.width - photoScreen.padding * 2
  let rows = 1
  let along = 0

  for (const photo of photos) {
    const { width, height } = sizeOf(photo)
    const wide = (photoScreen.row / height) * width

    if (along > 0 && along + wide > inside) {
      rows += 1
      along = 0
    }

    along += wide + photoScreen.gap
  }

  return {
    x: photoScreen.x,
    y: photoScreen.y,
    width: photoScreen.width,
    height: photoScreen.padding * 2 + rows * photoScreen.row + (rows - 1) * photoScreen.gap
  }
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
  /** The photos added to the project, on a screen of their own. */
  photos: readonly Found[]
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
  onOpen: (found: Found) => void
  onFind: () => void
  /** Image files dropped on the canvas so far. */
  dropped?: readonly Dropped[]
  /** The drops just made, by key, which stay marked in the selection's color until something else is selected. */
  landed?: readonly string[]
  /** Files dropped at a point in canvas pixels, onto the design or onto the empty canvas. */
  onDropFiles?: (files: File[], at: { x: number; y: number }, onto: "design" | "canvas") => void
}

export function CanvasSketch({
  designName,
  designColor,
  designSelected,
  placed,
  photos,
  selected,
  view: firstView,
  fitKey,
  onSelectDesign,
  onSelect,
  onMove,
  onDelete,
  onOpen,
  onFind,
  dropped = [],
  landed = [],
  onDropFiles
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
  const [pointer, setPointer] = useState<{ x: number; y: number }>()

  /** A point in the view, in canvas pixels. */
  const toCanvas = (point: { x: number; y: number }) => ({
    x: (point.x - view.x) / view.zoom,
    y: (point.y - view.y) / view.zoom
  })

  const overDesign = (point: { x: number; y: number }) => {
    const at = toCanvas(point)

    return (
      at.x >= designBox.x &&
      at.x <= designBox.x + designBox.width &&
      at.y >= designBox.y &&
      at.y <= designBox.y + designBox.height
    )
  }

  const fileDrag = useFileDrag((files) => {
    if (pointer && onDropFiles) {
      onDropFiles(files, toCanvas(pointer), overDesign(pointer) ? "design" : "canvas")
    }

    setPointer(undefined)
  })

  const fit = () => {
    const element = ref.current

    if (!element) {
      return
    }

    const added = photosBox(photos)

    const boxes = [
      designBox,
      ...placed.map(boxOf),
      ...(added ? [added] : []),
      ...dropped.map((drop) => dropBoxes(drop).box)
    ]

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
      {...fileDrag.handlers}
      onDragOver={(event) => {
        fileDrag.handlers.onDragOver(event)
        const box = event.currentTarget.getBoundingClientRect()
        setPointer({ x: event.clientX - box.left, y: event.clientY - box.top })
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
        <PhotoScreen photos={photos} zoom={view.zoom} />
        {dropped.map((drop) => (
          <DroppedImages key={drop.key} drop={drop} zoom={view.zoom} marked={landed.includes(drop.key)} />
        ))}
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
      {fileDrag.over && pointer && (
        <DropCue
          count={fileDrag.count}
          pointer={pointer}
          width={ref.current?.clientWidth ?? 0}
          design={
            overDesign(pointer)
              ? {
                  x: view.x + previews.desktop.x * view.zoom,
                  y: view.y + previews.desktop.y * view.zoom,
                  width: desktop.width * view.zoom,
                  height: designBox.height * view.zoom
                }
              : undefined
          }
        />
      )}
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
    </div>
  )
}

/**
 * What the canvas shows while files are dragged over it, as the app's drop does (PAR-24): over the design, its layout
 * outlined; a corner where the images' top left will land; and beside the pointer, what a drop there does.
 */
function DropCue({
  count,
  pointer,
  width,
  design
}: {
  count: number
  pointer: { x: number; y: number }
  /** The canvas's width, so the label turns to the pointer's left near the right edge. */
  width: number
  design: Box | undefined
}) {
  const flipped = pointer.x > width - 240

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {design && (
        <div
          className="absolute rounded-sm border-2 border-dashed border-(--canvas-layer) bg-(--canvas-layer)/5"
          style={{ left: design.x, top: design.y, width: design.width, height: design.height }}
        />
      )}
      {count > 0 && (
        <div
          className="absolute size-3 border-t-2 border-l-2 border-(--canvas-layer)"
          style={{ left: pointer.x, top: pointer.y }}
        />
      )}
      <span
        className="absolute rounded-md px-2 py-1 text-xs font-medium whitespace-nowrap shadow-sm"
        style={{
          ...chipColors.layer,
          left: flipped ? undefined : pointer.x + 16,
          right: flipped ? width - pointer.x + 16 : undefined,
          top: pointer.y + 16
        }}
      >
        {dropHint(count, design ? "layout" : "canvas")}
      </span>
    </div>
  )
}

/**
 * Images just dropped, landing: each grows from the drop point into its place, one after another, then stays outlined
 * in the selection's color, as the app selects what a drop adds. Reduced motion skips the landing.
 */
function DroppedImages({ drop, zoom, marked }: { drop: Dropped; zoom: number; marked: boolean }) {
  const { images, box } = dropBoxes(drop)
  const outline = marked ? `${onScreen(2, zoom)}px solid var(--canvas-layer)` : undefined

  return (
    <div
      role="group"
      aria-label={drop.frame ?? "Dropped images"}
      className="absolute"
      style={{ left: box.x, top: box.y, width: box.width, height: box.height }}
    >
      <style>{`@keyframes parity-image-landing { from { opacity: 0; transform: translate(var(--from-x), var(--from-y)) scale(0.4) } to { opacity: 1; transform: none } }
@media (prefers-reduced-motion: reduce) { [data-landing] { animation: none !important } }`}</style>
      {drop.frame && (
        <>
          <div
            className="absolute left-0 flex items-center font-medium whitespace-nowrap text-muted-foreground"
            style={{
              bottom: box.height + onScreen(8, zoom),
              gap: onScreen(6, zoom),
              fontSize: onScreen(12, zoom),
              color: marked ? "var(--canvas-layer)" : undefined
            }}
          >
            <DesignIcon kind="frame" style={{ width: onScreen(14, zoom), height: onScreen(14, zoom) }} />
            {drop.frame}
          </div>
          <div
            className="absolute inset-0 bg-background"
            style={{ outline: `${onScreen(1, zoom)}px solid var(--border)` }}
          />
        </>
      )}
      {images.map(({ image, x, y }, index) => (
        <div
          key={image.key}
          role="img"
          aria-label={image.name}
          data-landing
          className="absolute"
          // SAFETY: the two custom properties are strings, which CSS takes; React's type only lists standard ones.
          style={
            {
              left: x,
              top: y,
              width: image.width,
              height: image.height,
              outline,
              "--from-x": `${-x}px`,
              "--from-y": `${-y}px`,
              animation: `parity-image-landing 420ms cubic-bezier(0.2, 0.8, 0.2, 1) ${index * 70}ms both`
            } as CSSProperties
          }
        >
          <Picture found={image.picture} style={{ width: image.width, height: image.height }} />
        </div>
      ))}
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

/** The screen the photos added to the project land on, as dropped image files make one: a padded row that wraps. */
function PhotoScreen({ photos, zoom }: { photos: readonly Found[]; zoom: number }) {
  const box = photosBox(photos)

  if (!box) {
    return null
  }

  return (
    <div role="group" aria-label="Photos" className="absolute" style={{ left: box.x, top: box.y, width: box.width }}>
      <div
        className="absolute left-0 flex items-center font-medium whitespace-nowrap text-muted-foreground"
        style={{ bottom: box.height + onScreen(8, zoom), gap: onScreen(6, zoom), fontSize: onScreen(12, zoom) }}
      >
        <DesignIcon
          kind="screen"
          style={{ color: kindColors.screen, width: onScreen(14, zoom), height: onScreen(14, zoom) }}
        />
        Photos
      </div>
      <div
        className="flex flex-wrap content-start bg-background"
        style={{
          height: box.height,
          padding: photoScreen.padding,
          gap: photoScreen.gap,
          outline: `${onScreen(1, zoom)}px solid var(--border)`
        }}
      >
        {photos.map((photo) => (
          <div key={photo.id} role="img" aria-label={`Photo by ${creditOf(photo)}`}>
            <Picture found={photo} style={{ height: photoScreen.row }} />
          </div>
        ))}
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
  onOpen: (found: Found) => void
}) {
  const { found } = item
  const name = creditOf(found)
  const source = found.credit.at(-1)?.name ?? found.connector

  const outline = selected
    ? `${onScreen(2, zoom)}px solid ${kindColors.layer}`
    : `${onScreen(1, zoom)}px solid var(--border)`

  return (
    <div
      role="img"
      aria-label={`Reference: ${name}, from ${source}`}
      className="absolute cursor-default touch-none select-none"
      style={{ left: item.x, top: item.y, width: referenceSize(found).width }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDoubleClick={() => onOpen(found)}
    >
      <Picture found={found} style={{ outline }} />
      <div
        className="flex flex-col text-muted-foreground"
        style={{ marginTop: onScreen(6, zoom), gap: onScreen(2, zoom), fontSize: onScreen(11, zoom), lineHeight: 1.35 }}
      >
        <div className="flex items-baseline justify-between" style={{ gap: onScreen(8, zoom) }}>
          <span className="truncate font-medium text-foreground">{name}</span>
          <span className="shrink-0">{source}</span>
        </div>
        {item.note && <span className="line-clamp-2">{item.note}</span>}
      </div>
    </div>
  )
}
