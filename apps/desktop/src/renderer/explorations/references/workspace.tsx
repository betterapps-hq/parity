/* oxlint-disable jsx-a11y/prefer-tag-over-role, jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex --references stand in for the canvas's items, which take the pointer; the keyboard reaches them through the canvas's keys, as in the app */
import { TabsContent } from "@buildkitgg/shadcn-baseui-kit"
import { Component, ImageIcon, Layers, Palette, Smile, Telescope } from "lucide-react"
import {
  type DragEvent,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState
} from "react"
import { toast } from "sonner"
import { ComponentsPanel, IconsPanel, ImagesPanel } from "../../chrome/AssetsPanel.tsx"
import { LayerTree } from "../../chrome/LayerTree.tsx"
import { SidePanel } from "../../chrome/SidePanel.tsx"
import { TokensPanel } from "../../chrome/TokensPanel.tsx"
import { ProjectStage } from "../../stories/fixtures.tsx"
import { MiniScreen } from "../parts.tsx"
import { naturalSize, references } from "./data.ts"
import { type Placing, referenceMime, ReferencesPanel, type ReferencesState } from "./panel.tsx"
import { ShotDrawing } from "./shots.tsx"

/*
 * The References exploration as one window you can use: the left panel with the References tab beside the shipped
 * tabs, and a sketch of the canvas with a Pricing screen drawn in blocks. Results drag onto the canvas, or a click places
 * them; references on the canvas move by dragging, Delete removes the selected one, and a double-click opens it in
 * Mobbin.
 */

/** A reference on the canvas, at a point in canvas pixels, at its own width. */
export interface Placed {
  key: string
  id: string
  step?: number
  x: number
  y: number
  width: number
}

/** Where a story starts. */
export interface Start {
  state?: Partial<ReferencesState>
  placed?: Placed[]
  /** The selected reference's key, or "pricing" for the screen. */
  selected?: string
  zoom?: number
  pan?: { x: number; y: number }
  /** Explanations for the reviewer, over the canvas at screen size. */
  overlay?: ReactNode
}

/** A Pricing screen, as a board on the canvas: at the origin, a desktop preview about this tall. */
const pricing = { x: 0, y: 0, width: 1280, height: 740 }

/** Space between what's on the canvas, in canvas pixels. */
const gap = 120

let counter = 0

function newKey(): string {
  counter += 1

  return `placed-${counter}`
}

function heightOf(placed: Placed): number {
  const reference = references.find((each) => each.id === placed.id)

  if (!reference) {
    return 0
  }

  const size = naturalSize(reference.platform, reference.kind)

  return (placed.width / size.width) * size.height
}

export function ReferencesWorkspace({ start = {} }: { start?: Start }) {
  const [state, setState] = useState<ReferencesState>({
    account: "connected",
    query: "pricing",
    kind: "screens",
    platform: "web",
    status: "ready",
    ...start.state
  })

  const [placed, setPlaced] = useState<Placed[]>(start.placed ?? [])
  const [selected, setSelected] = useState(start.selected)
  const firstQuery = useRef(state.query)

  // A changed search waits on Mobbin a moment, as a deep search does.
  useEffect(() => {
    if (state.query === firstQuery.current) {
      return undefined
    }

    setState((current) => ({ ...current, status: "searching" }))
    const timer = setTimeout(() => setState((current) => ({ ...current, status: "ready" })), 450)

    return () => clearTimeout(timer)
  }, [state.query])

  const place = (what: Placing | Placing[], at?: { x: number; y: number }) => {
    const list = Array.isArray(what) ? what : [what]
    const rightmost = Math.max(pricing.x + pricing.width, ...placed.map((each) => each.x + each.width))
    let x = at?.x ?? rightmost + gap
    const y = at?.y ?? 0

    const added = list.map(({ reference, step }) => {
      const size = naturalSize(reference.platform, reference.kind)
      const each: Placed = { key: newKey(), id: reference.id, step, x, y, width: size.width }
      x += size.width + gap / 2

      return each
    })

    setPlaced((current) => [...current, ...added])
    setSelected(added.at(-1)?.key)
    const first = list[0]!.reference
    toast(list.length > 1 ? `Placed ${list.length} steps from ${first.app}` : `Placed ${first.app} on the canvas`, {
      description: "It's for reference, so it stays out of your designs and code."
    })
  }

  const open = (reference: { app: string }) => toast(`Opening ${reference.app} on Mobbin in your browser`)

  return (
    <ProjectStage className="flex h-screen bg-background text-foreground">
      <SidePanel
        side="left"
        label="Layers, assets and tokens"
        defaultTab="layers"
        tabs={[
          { value: "layers", label: "Layers", icon: Layers },
          { value: "components", label: "Components", icon: Component },
          { value: "icons", label: "Icons", icon: Smile },
          { value: "images", label: "Images", icon: ImageIcon },
          { value: "references", label: "References", icon: Telescope },
          { value: "tokens", label: "Tokens", icon: Palette }
        ]}
      >
        <TabsContent value="layers" className="flex min-h-0 flex-col">
          <LayerTree />
        </TabsContent>
        <TabsContent value="components" className="flex min-h-0 flex-col">
          <ComponentsPanel />
        </TabsContent>
        <TabsContent value="icons" className="flex min-h-0 flex-col">
          <IconsPanel />
        </TabsContent>
        <TabsContent value="images" className="flex min-h-0 flex-col">
          <ImagesPanel />
        </TabsContent>
        <TabsContent value="references" className="flex min-h-0 flex-col">
          <ReferencesPanel
            state={state}
            actions={{
              connect: () => {
                setState((current) => ({ ...current, account: "connecting" }))
                setTimeout(() => setState((current) => ({ ...current, account: "connected" })), 1500)
              },
              cancel: () => setState((current) => ({ ...current, account: "disconnected" })),
              disconnect: () => setState((current) => ({ ...current, account: "disconnected" })),
              change: (changes) => setState((current) => ({ ...current, ...changes })),
              place: (what) => place(what),
              open
            }}
          />
        </TabsContent>
        <TabsContent value="tokens" className="flex min-h-0 flex-col">
          <TokensPanel />
        </TabsContent>
      </SidePanel>
      <CanvasSketch
        placed={placed}
        selected={selected}
        zoom={start.zoom ?? 0.3}
        initialPan={start.pan ?? { x: 64, y: 120 }}
        overlay={start.overlay}
        onSelect={setSelected}
        onMove={(key, x, y) =>
          setPlaced((current) => current.map((each) => (each.key === key ? { ...each, x, y } : each)))
        }
        onDelete={(key) => {
          setPlaced((current) => current.filter((each) => each.key !== key))
          setSelected(undefined)
        }}
        onDrop={(what, at) => place(what, at)}
        onOpen={open}
      />
    </ProjectStage>
  )
}

interface CanvasProps {
  placed: Placed[]
  selected?: string
  zoom: number
  initialPan: { x: number; y: number }
  overlay?: ReactNode
  onSelect: (key: string | undefined) => void
  onMove: (key: string, x: number, y: number) => void
  onDelete: (key: string) => void
  onDrop: (placing: Placing, at: { x: number; y: number }) => void
  onOpen: (reference: { app: string }) => void
}

/** The canvas, sketched: Pricing's board and the references beside it, at one zoom, panned by scrolling. */
function CanvasSketch({
  placed,
  selected,
  zoom,
  initialPan,
  overlay,
  onSelect,
  onMove,
  onDelete,
  onDrop,
  onOpen
}: CanvasProps) {
  const [pan, setPan] = useState(initialPan)
  const [dropping, setDropping] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const drag = useRef<{ key: string; from: { x: number; y: number }; start: { x: number; y: number } }>(undefined)

  const toCanvas = (clientX: number, clientY: number) => {
    const box = ref.current!.getBoundingClientRect()

    return { x: (clientX - box.left - pan.x) / zoom, y: (clientY - box.top - pan.y) / zoom }
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if ((event.key === "Delete" || event.key === "Backspace") && selected && selected !== "pricing") {
      onDelete(selected)
      event.preventDefault()
    } else if (event.key === "Escape") {
      onSelect(undefined)
    }
  }

  const onDragOver = (event: DragEvent) => {
    if (!event.dataTransfer.types.includes(referenceMime)) {
      return
    }

    event.preventDefault()
    event.dataTransfer.dropEffect = "copy"
    setDropping(true)
  }

  const onDropHere = (event: DragEvent) => {
    setDropping(false)
    const data = event.dataTransfer.getData(referenceMime)

    if (!data) {
      return
    }

    event.preventDefault()
    // SAFETY: the panel writes this type, with a reference's id and an optional step.
    const { id, step } = JSON.parse(data) as { id: string; step?: number }
    const reference = references.find((each) => each.id === id)

    if (reference) {
      onDrop({ reference, step }, toCanvas(event.clientX, event.clientY))
    }
  }

  const startMove = (event: ReactPointerEvent, item: Placed) => {
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

    if (!current) {
      return
    }

    onMove(
      current.key,
      current.start.x + (event.clientX - current.from.x) / zoom,
      current.start.y + (event.clientY - current.from.y) / zoom
    )
  }

  return (
    <div
      ref={ref}
      role="application"
      aria-roledescription="canvas"
      aria-label="Canvas"
      tabIndex={0}
      onKeyDown={onKeyDown}
      onPointerDown={() => onSelect(undefined)}
      onWheel={(event) => setPan((current) => ({ x: current.x - event.deltaX, y: current.y - event.deltaY }))}
      onDragOver={onDragOver}
      onDragLeave={() => setDropping(false)}
      onDrop={onDropHere}
      className={`relative min-w-0 flex-1 overflow-hidden bg-muted/40 outline-none dark:bg-muted/20 ${dropping ? "ring-2 ring-primary/50 ring-inset" : ""}`}
    >
      <div className="absolute top-0 left-0" style={{ transform: `translate(${pan.x}px, ${pan.y}px)` }}>
        <PricingBoard
          zoom={zoom}
          selected={selected === "pricing"}
          onSelect={() => {
            onSelect("pricing")
            ref.current?.focus()
          }}
        />
        {placed.map((item) => (
          <PlacedReference
            key={item.key}
            item={item}
            zoom={zoom}
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
      {overlay && <div className="pointer-events-none absolute right-4 bottom-4">{overlay}</div>}
    </div>
  )
}

function PricingBoard({ zoom, selected, onSelect }: { zoom: number; selected: boolean; onSelect: () => void }) {
  return (
    <div
      className="absolute"
      style={{ left: pricing.x * zoom, top: pricing.y * zoom }}
      onPointerDown={(event) => {
        event.stopPropagation()
        onSelect()
      }}
    >
      <div className="absolute -top-6 left-0 text-xs font-medium text-muted-foreground">Pricing</div>
      <div
        className={`overflow-hidden rounded-sm bg-background shadow-sm ${selected ? "ring-2 ring-primary" : ""}`}
        style={{ width: pricing.width * zoom, height: pricing.height * zoom }}
      >
        <div className="relative size-full">
          <MiniScreen kind="marketing" hue={250} />
        </div>
      </div>
    </div>
  )
}

/**
 * A reference on the canvas: its picture at its own size, with its app and source under it in the canvas's quiet
 * caption. No board, states or modes: it's there to look at.
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
  onOpen: (reference: { app: string }) => void
}) {
  const reference = references.find((each) => each.id === item.id)

  if (!reference) {
    return null
  }

  const step = item.step === undefined ? undefined : reference.steps?.[item.step]
  const shot = step?.shot ?? reference.shot
  const width = item.width * zoom
  const height = heightOf(item) * zoom
  const name = step ? `${reference.app}, ${step.caption}` : reference.app

  return (
    <div
      role="img"
      aria-label={`Reference: ${name}, from Mobbin`}
      className="absolute cursor-default touch-none select-none"
      style={{ left: item.x * zoom, top: item.y * zoom, width }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDoubleClick={() => onOpen(reference)}
    >
      <div
        className={`relative overflow-hidden rounded-sm shadow-sm ${selected ? "ring-2 ring-primary" : "ring-1 ring-border"}`}
        style={{ height }}
      >
        <ShotDrawing shot={shot} hue={reference.hue} dark={reference.dark} />
      </div>
      <div className="mt-1.5 flex items-baseline justify-between gap-2 text-[11px] text-muted-foreground">
        <span className="truncate">{name}</span>
        <span className="shrink-0 opacity-70">Mobbin</span>
      </div>
    </div>
  )
}

/** A short line of explanation pinned over the canvas, in the explorations' dimmed type, for a reviewer. */
export function Explainer({ title, width = 320, children }: { title: string; width?: number; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1" style={{ width }}>
      <span className="text-sm font-medium text-foreground">{title}</span>
      <span className="text-[13px] leading-snug text-muted-foreground">{children}</span>
    </div>
  )
}
