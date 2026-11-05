/* oxlint-disable jsx-a11y/prefer-tag-over-role, jsx-a11y/no-noninteractive-element-interactions -- designs and notes stand in for the canvas's shapes, which take the pointer; the keyboard reaches them through Layers and the canvas's keys, as in the app */
import { TabsContent } from "@buildkitgg/shadcn-baseui-kit"
import type { DesignNode } from "@parity-app/core"
import { companionScale } from "@parity-app/core"
import { Layers, Minus, Plus, StickyNote as NoteIcon } from "lucide-react"
import {
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState
} from "react"
import { toast } from "sonner"
import { useProject } from "../../canvas/context.ts"
import { ParamsSection } from "../../chrome/ComponentsSection.tsx"
import { IconButton } from "../../chrome/IconButton.tsx"
import { SidePanel } from "../../chrome/SidePanel.tsx"
import { StatesSection } from "../../chrome/StatesSection.tsx"
import { useContainerEntries } from "../../design-store.ts"
import { StickyNote } from "../collaboration/notes.tsx"
import { me } from "../explore-data.ts"
import {
  Board,
  CanvasFrame,
  type DesignActions,
  DraggedFrame,
  Guide,
  type Kind,
  KindIcon,
  kindColor,
  type Preview
} from "./canvas.tsx"
import { isDark, mode, primaryMode } from "./data.ts"
import { designSurface, PlanCard, PricingPage, TextLayer, WelcomeSketch } from "./designs.tsx"
import {
  BackToAFrameDialog,
  dropLines,
  FrameInspector,
  type FrameDrops,
  frameDrops,
  InspectorPanel,
  KindHeader,
  NoteSelected,
  NothingSelected
} from "./inspector.tsx"
import { type ExploreTool, FramesToolbar, toolForKey } from "./toolbar.tsx"

/*
 * The frames explorations as one canvas you can use: Layers at the left, the canvas, and the inspector at the right,
 * with what's on the canvas and what's selected kept here. Every story is a starting state of it. Click a design or
 * its row in Layers to select it; F and a drag draws a frame, T and a click makes text in a frame, S and a click
 * places a note; the frame tool's menu and every Convert to act on what's selected.
 */

/** What a design draws: one of the example's, a sketch, an empty frame, or text. */
export type Content = "pricing" | "plan-card" | "welcome" | "blank" | "text"

/** A design on the canvas, at a point in canvas pixels. */
export interface Design {
  id: string
  kind: Kind
  name: string
  x: number
  y: number
  /** A frame's width, or a board's main preview's. */
  width: number
  /** A frame's height; a text frame hugs its text, so has none. */
  height?: number
  content: Content
  /** A text frame's text. */
  text?: string
  /** A text frame named after its text keeps following it until it's renamed. */
  named?: boolean
  /** The modes a board shows, its main one first. */
  modes: string[]
  /** The example project's design this stands in for, whose states, params and instances the inspector shows. */
  example?: string
}

export interface Note {
  id: string
  x: number
  y: number
  text: string
}

interface Doc {
  designs: Design[]
  notes: Note[]
}

/** Where a story starts: what's on the canvas, what's selected, and anything open. */
export interface Start {
  designs: Design[]
  notes?: Note[]
  selected?: string
  tool?: ExploreTool
  zoom?: number
  /** Where the canvas's origin is on the screen. */
  pan?: { x: number; y: number }
  /** The text frame or note being typed in. */
  editing?: string
  /** The frame tool's menu is open. */
  menuOpen?: boolean
  /** A tool whose tooltip shows, as when pointing at it, until the canvas is used. */
  tooltip?: ExploreTool
  /** The design whose Convert to frame dialog is open. */
  confirm?: string
  /** A frame being dragged out, in canvas pixels, until the canvas is used. */
  drawing?: { from: Point; to: Point }
  /** Undo's history, oldest first, as when a story starts just after a change. */
  past?: Doc[]
  /** A toast showing at the start, with Undo, as after the last change. */
  toast?: { title: string; description: string }
  /** Notes for the reviewer, over the canvas at screen size. */
  overlay?: ReactNode
}

interface Point {
  x: number
  y: number
}

interface Box {
  x: number
  y: number
  w: number
  h: number
}

/** About how tall the example's designs draw, for snapping to their edges. */
const contentHeights: Record<Content, (width: number) => number> = {
  pricing: (width) => (width < 600 ? 1290 : 740),
  "plan-card": () => 300,
  welcome: () => 440,
  blank: () => 400,
  text: () => 52
}

/** A design's own box on the canvas, without its title: a frame's size, or a board's previews and gutter. */
function boxOf(design: Design): Box {
  if (design.kind === "frame") {
    const w = design.content === "text" ? (design.text?.length ?? 0) * 18 + 16 : design.width
    return { x: design.x, y: design.y, w, h: design.height ?? contentHeights[design.content](design.width) }
  }
  const widths = design.modes.map((id, index) => {
    const width = index === 0 ? design.width : previewWidth(design, id)
    return width * (index ? companionScale(width) : 1)
  })
  const heights = design.modes.map((id, index) =>
    index === 0
      ? (design.height ?? contentHeights[design.content](design.width))
      : contentHeights[design.content](previewWidth(design, id))
  )
  return {
    x: design.x,
    y: design.y,
    w: widths.reduce((sum, width) => sum + width, 0) + 60 * design.modes.length,
    h: Math.max(...heights) + 90
  }
}

/** A board's companion preview is as wide as its mode; a component's draws at its own width in every mode. */
function previewWidth(design: Design, id: string): number {
  if (design.content === "plan-card") return 320
  if (design.content === "pricing") return mode(id).width
  return mode(id).width
}

/** What a design draws in a mode, at a width. */
function drawContent(design: Design, modeId: string, width: number): ReactNode {
  const theme = isDark(mode(modeId)) ? "dark" : "light"
  if (design.content === "pricing") return <PricingPage width={width} theme={theme} />
  if (design.content === "plan-card") return <PlanCard theme={theme} />
  if (design.content === "welcome") return <WelcomeSketch width={width} height={design.height ?? 440} />
  return <div style={{ width, height: design.height ?? 400, ...designSurface(theme) }} />
}

/** The next "Frame 1", "Frame 2" and so on, after the highest already on the canvas. */
function nextName(designs: Design[], base: string): string {
  const pattern = new RegExp(`^${base} (\\d+)$`)
  const highest = Math.max(0, ...designs.map((each) => Number(pattern.exec(each.name)?.[1] ?? 0)))
  return `${base} ${highest + 1}`
}

let counter = 0
function newId(prefix: string): string {
  counter += 1
  return `${prefix}-${Date.now().toString(36)}-${counter}`
}

const toasts: Record<Kind, string> = {
  component: "Place it in screens from Components.",
  screen: "Show it in more modes from its board's menu.",
  frame: "Undo brings back everything it dropped."
}

/** Keeps a drag's pointer events coming to the canvas, even off it. A pointer that isn't down, as a test's, is skipped. */
function capture(element: HTMLElement, pointerId: number) {
  try {
    element.setPointerCapture(pointerId)
  } catch {
    // Not a pointer that's down.
  }
}

/** Whether a key press is typing into something rather than a shortcut for the canvas. */
function typing(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  )
}

export function FramesWorkspace({ start }: { start: Start }) {
  const { store } = useProject()
  const entries = useContainerEntries(store)
  const [doc, setDoc] = useState<Doc>({ designs: start.designs, notes: start.notes ?? [] })
  const [, setPast] = useState<Doc[]>(start.past ?? [])
  const [selected, setSelected] = useState(start.selected)
  const [tool, setTool] = useState<ExploreTool>(start.tool ?? "select")
  const [editing, setEditing] = useState(start.editing)
  const [renaming, setRenaming] = useState<string>()
  const [menuOpen, setMenuOpen] = useState(start.menuOpen ?? false)
  const [tooltip, setTooltip] = useState(start.tooltip)
  const [confirm, setConfirm] = useState(start.confirm)
  const [view, setView] = useState({ zoom: start.zoom ?? 0.4, ...(start.pan ?? { x: 64, y: 96 }) })
  const [drawing, setDrawing] = useState(start.drawing)
  const [guides, setGuides] = useState<{ x?: number; y?: number }>({})
  const stage = useRef<HTMLDivElement>(null)
  const gesture = useRef<
    | { type: "draw"; from: Point; at: Point }
    | { type: "move"; id: string; from: Point; origin: Point; moved: boolean }
    | { type: "pan"; from: Point; origin: Point }
    | undefined
  >(undefined)

  // What any change saves first, for Undo.
  const change = useCallback(
    (next: (current: Doc) => Doc) => {
      setPast((history) => [...history, doc])
      setDoc(next)
    },
    [doc]
  )
  const undo = useCallback(() => {
    setPast((history) => {
      const last = history.at(-1)
      if (last) setDoc(last)
      return history.slice(0, -1)
    })
  }, [])

  const design = doc.designs.find((each) => each.id === selected)
  const update = (id: string, patch: Partial<Design>) =>
    setDoc((current) => ({
      ...current,
      designs: current.designs.map((each) => (each.id === id ? { ...each, ...patch } : each))
    }))

  // The canvas point under a point on the screen.
  const toCanvas = (clientX: number, clientY: number): Point => {
    const box = stage.current?.getBoundingClientRect()
    return { x: (clientX - (box?.left ?? 0) - view.x) / view.zoom, y: (clientY - (box?.top ?? 0) - view.y) / view.zoom }
  }
  const middle = (): Point => {
    const box = stage.current?.getBoundingClientRect()
    return toCanvas((box?.left ?? 0) + (box?.width ?? 0) / 2, (box?.top ?? 0) + (box?.height ?? 0) / 2)
  }

  // Snaps a point to the edges of the designs around it, within 6 pixels on the screen, and says where.
  const snap = (point: Point): { point: Point; guides: { x?: number; y?: number } } => {
    const reach = 6 / view.zoom
    let x: number | undefined
    let y: number | undefined
    for (const box of doc.designs.map(boxOf)) {
      for (const edge of [box.x, box.x + box.w]) if (Math.abs(point.x - edge) < reach) x = edge
      for (const edge of [box.y, box.y + box.h]) if (Math.abs(point.y - edge) < reach) y = edge
    }
    return { point: { x: x ?? point.x, y: y ?? point.y }, guides: { x, y } }
  }

  // Converting: heavier happens at once with Undo in a toast; lighter asks first when it drops anything.
  const dropsOf = (of: Design): FrameDrops => {
    // The previews are the ones on this canvas; states, params and instances are the example design's, if it has one.
    const previews = of.modes.slice(1).map((id) => mode(id).name)
    const entry = entries.find((each) => each.container.name === of.example)
    if (entry) return { ...frameDrops(entry.container, entries), previews }
    return { kept: "Default", states: [], previews, params: [], instances: [] }
  }
  const convertNow = (of: Design, kind: Kind) => {
    const before = doc
    change((current) => ({
      ...current,
      designs: current.designs.map((each) => {
        if (each.id !== of.id) return each
        if (kind === "frame") return { ...each, kind, modes: [], height: boxOf(each).h - 90 }
        return { ...each, kind, modes: each.kind === "frame" ? [primaryMode.id] : each.modes }
      })
    }))
    setSelected(of.id)
    toast.success(`${of.name} is a ${kind}`, {
      description: toasts[kind],
      action: { label: "Undo", onClick: () => setDoc(before) }
    })
  }
  const convert = (of: Design, kind: Kind) => {
    if (kind === of.kind) return
    if (kind === "frame" && dropLines(dropsOf(of)).length > 0) setConfirm(of.id)
    else convertNow(of, kind)
  }

  const remove = (id: string) => {
    change((current) => ({
      designs: current.designs.filter((each) => each.id !== id),
      notes: current.notes.filter((each) => each.id !== id)
    }))
    if (selected === id) setSelected(undefined)
  }
  const duplicate = (of: Design) => {
    const copy = { ...of, id: newId(of.kind), name: `${of.name} copy`, x: of.x + 40, y: of.y + 40 }
    change((current) => ({ ...current, designs: [...current.designs, copy] }))
    setSelected(copy.id)
  }
  const add = (made: Design) => {
    change((current) => ({ ...current, designs: [...current.designs, made] }))
    setSelected(made.id)
    setTool("select")
  }
  const addAtMiddle = (kind: Kind, name: string, width: number, height: number) => {
    const at = middle()
    add({
      id: newId(kind),
      kind,
      name,
      x: Math.round(at.x - width / 2),
      y: Math.round(at.y - height / 2),
      width,
      height,
      content: "blank",
      modes: kind === "frame" ? [] : [primaryMode.id]
    })
  }

  const actionsFor = (of: Design): DesignActions => ({
    onRename: () => setRenaming(of.id),
    onDuplicate: () => duplicate(of),
    onConvert: (kind) => convert(of, kind),
    onDelete: () => remove(of.id)
  })

  // Keys for the canvas, wherever focus is, as long as nothing is being typed in.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (typing(event.target) || event.altKey) return
      const mod = event.ctrlKey || event.metaKey
      if (mod && event.key.toLowerCase() === "z") undo()
      else if (mod && event.key.toLowerCase() === "d" && design) duplicate(design)
      else if (mod) return
      else if (event.key === "Escape") {
        if (tool !== "select") setTool("select")
        else setSelected(undefined)
      } else if ((event.key === "Delete" || event.key === "Backspace") && selected) remove(selected)
      else if (event.key === "Enter" && design?.content === "text") setEditing(design.id)
      else {
        const picked = toolForKey(event.key)
        if (!picked) return
        setTool(picked)
      }
      setTooltip(undefined)
      event.preventDefault()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  // Ctrl or ⌘ with the wheel, or a pinch, zooms around the pointer; the wheel alone pans.
  useEffect(() => {
    const element = stage.current
    if (!element) return undefined
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      if (event.ctrlKey || event.metaKey) {
        const box = element.getBoundingClientRect()
        const px = event.clientX - box.left
        const py = event.clientY - box.top
        setView((now) => {
          const zoom = Math.min(4, Math.max(0.05, now.zoom * Math.exp(-event.deltaY * 0.01)))
          const ratio = zoom / now.zoom
          return { zoom, x: px - (px - now.x) * ratio, y: py - (py - now.y) * ratio }
        })
      } else setView((now) => ({ ...now, x: now.x - event.deltaX, y: now.y - event.deltaY }))
    }
    element.addEventListener("wheel", onWheel, { passive: false })
    return () => element.removeEventListener("wheel", onWheel)
  }, [])

  // A toast the story starts with, as just after a change, whose Undo goes back a step.
  useEffect(() => {
    if (!start.toast) return undefined
    const id = toast.success(start.toast.title, {
      description: start.toast.description,
      duration: Infinity,
      action: { label: "Undo", onClick: () => undo() }
    })
    return () => void toast.dismiss(id)
  }, [start.toast, undo])

  const stepZoom = (direction: 1 | -1) => {
    const levels = [0.1, 0.25, 0.5, 1, 2, 4]
    const next =
      direction > 0
        ? (levels.find((level) => level > view.zoom + 0.001) ?? 4)
        : (levels.findLast((level) => level < view.zoom - 0.001) ?? 0.1)
    zoomTo(next)
  }
  const zoomTo = (zoom: number) => {
    const box = stage.current?.getBoundingClientRect()
    const px = (box?.width ?? 0) / 2
    const py = (box?.height ?? 0) / 2
    setView((now) => ({ zoom, x: px - (px - now.x) * (zoom / now.zoom), y: py - (py - now.y) * (zoom / now.zoom) }))
  }

  // A press on the canvas itself, not on a design: what it does depends on the tool.
  const onStageDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    setTooltip(undefined)
    setDrawing(undefined)
    setRenaming(undefined)
    const at = toCanvas(event.clientX, event.clientY)
    capture(event.currentTarget, event.pointerId)
    if (tool === "hand") {
      gesture.current = { type: "pan", from: { x: event.clientX, y: event.clientY }, origin: { x: view.x, y: view.y } }
    } else if (tool === "frame") {
      const from = snap(at)
      gesture.current = { type: "draw", from: from.point, at: from.point }
      setGuides(from.guides)
    } else if (tool === "text") {
      const id = newId("text")
      add({
        id,
        kind: "frame",
        name: "Text",
        x: Math.round(at.x),
        y: Math.round(at.y - 26),
        width: 0,
        content: "text",
        text: "",
        named: true,
        modes: []
      })
      setEditing(id)
    } else if (tool === "note") {
      const id = newId("note")
      change((current) => ({ ...current, notes: [...current.notes, { id, x: at.x, y: at.y, text: "" }] }))
      setSelected(id)
      setEditing(id)
      setTool("select")
    } else if (tool === "select") setSelected(undefined)
  }

  // A press on a design or note: selects it, and with the move tool starts moving it. With the frame or hand tool the
  // press goes on to the canvas, so a frame can be drawn over a design and the hand pans from anywhere.
  const onItemDown = (id: string, origin: Point) => (event: ReactPointerEvent) => {
    if (event.button !== 0 || (tool !== "select" && tool !== "interact" && tool !== "text")) return
    event.stopPropagation()
    setTooltip(undefined)
    setSelected(id)
    if (editing && editing !== id) setEditing(undefined)
    if (tool !== "select") return
    if (stage.current) capture(stage.current, event.pointerId)
    gesture.current = { type: "move", id, from: { x: event.clientX, y: event.clientY }, origin, moved: false }
  }

  const onStageMove = (event: ReactPointerEvent) => {
    const now = gesture.current
    if (!now) return
    if (now.type === "pan") {
      setView((current) => ({
        ...current,
        x: now.origin.x + event.clientX - now.from.x,
        y: now.origin.y + event.clientY - now.from.y
      }))
    } else if (now.type === "draw") {
      const to = snap(toCanvas(event.clientX, event.clientY))
      now.at = to.point
      setDrawing({ from: now.from, to: to.point })
      setGuides(to.guides)
    } else {
      const dx = (event.clientX - now.from.x) / view.zoom
      const dy = (event.clientY - now.from.y) / view.zoom
      if (!now.moved && Math.hypot(dx, dy) * view.zoom < 3) return
      if (!now.moved) setPast((history) => [...history, doc])
      now.moved = true
      const x = Math.round(now.origin.x + dx)
      const y = Math.round(now.origin.y + dy)
      setDoc((current) => ({
        designs: current.designs.map((each) => (each.id === now.id ? { ...each, x, y } : each)),
        notes: current.notes.map((each) => (each.id === now.id ? { ...each, x, y } : each))
      }))
    }
  }

  const onStageUp = () => {
    const now = gesture.current
    gesture.current = undefined
    setGuides({})
    if (now?.type !== "draw") return
    setDrawing(undefined)
    const width = Math.round(Math.abs(now.at.x - now.from.x))
    const height = Math.round(Math.abs(now.at.y - now.from.y))
    // A click without a drag makes a 100 × 100 frame, as Figma does.
    const tiny = width * view.zoom < 3 && height * view.zoom < 3
    add({
      id: newId("frame"),
      kind: "frame",
      name: nextName(doc.designs, "Frame"),
      x: Math.round(Math.min(now.from.x, now.at.x)),
      y: Math.round(Math.min(now.from.y, now.at.y)),
      width: tiny ? 100 : width,
      height: tiny ? 100 : height,
      content: "blank",
      modes: []
    })
  }

  const confirming = doc.designs.find((each) => each.id === confirm)
  const cursor = {
    frame: "crosshair",
    note: "crosshair",
    text: "text",
    hand: "grab",
    select: "default",
    interact: "default"
  }[tool]
  const place = (point: Point) => ({ left: view.x + point.x * view.zoom, top: view.y + point.y * view.zoom })

  return (
    <div className="flex h-screen min-w-0 flex-1 bg-background text-foreground">
      <SidePanel
        side="left"
        label="Layers"
        defaultTab="layers"
        tabs={[{ value: "layers", label: "Layers", icon: Layers }]}
      >
        <TabsContent value="layers" className="min-h-0 overflow-y-auto">
          <LayersList doc={doc} selected={selected} onSelect={(id) => setSelected(id)} />
        </TabsContent>
      </SidePanel>

      <div
        ref={stage}
        role="application"
        aria-roledescription="canvas"
        aria-label="Canvas"
        className="relative min-w-0 flex-1 touch-none overflow-hidden bg-[#f9fafb] font-sans select-none dark:bg-[#101011]"
        style={{ cursor }}
        onPointerDown={onStageDown}
        onPointerMove={onStageMove}
        onPointerUp={onStageUp}
      >
        {doc.designs.map((each) => {
          const title = {
            selected: selected === each.id,
            renaming: renaming === each.id,
            actions: actionsFor(each),
            onPointerDown: onItemDown(each.id, each),
            onRenamed: (name: string | undefined) => {
              setRenaming(undefined)
              if (name && name !== each.name)
                change((current) => ({
                  ...current,
                  designs: current.designs.map((d) => (d.id === each.id ? { ...d, name, named: false } : d))
                }))
            }
          }
          return (
            <div key={each.id} className="absolute" style={place(each)}>
              {each.kind === "frame" ? (
                <CanvasFrame
                  name={each.name}
                  zoom={view.zoom}
                  size={each.content === "text" ? "Hug × Hug" : `${each.width} × ${each.height ?? "Hug"}`}
                  {...title}
                >
                  {each.content === "text" ? (
                    <TextFrameContent
                      text={each.text ?? ""}
                      editing={editing === each.id}
                      onText={(text) => update(each.id, each.named ? { text, name: text || "Text" } : { text })}
                      onDone={() => {
                        setEditing(undefined)
                        if (!each.text?.trim()) remove(each.id)
                      }}
                    />
                  ) : (
                    drawContent(each, primaryMode.id, each.width)
                  )}
                </CanvasFrame>
              ) : (
                <Board
                  kind={each.kind}
                  name={each.name}
                  zoom={view.zoom}
                  previews={each.modes.map((id, index): Preview => {
                    const width = index === 0 ? each.width : previewWidth(each, id)
                    return { mode: mode(id), width, content: drawContent(each, id, width) }
                  })}
                  states={each.example === "Pricing" ? ["Monthly", "Yearly"] : ["Default"]}
                  onModes={(main, shown) =>
                    change((current) => ({
                      ...current,
                      designs: current.designs.map((d) =>
                        d.id === each.id ? { ...d, modes: [main, ...shown.filter((id) => id !== main)] } : d
                      )
                    }))
                  }
                  {...title}
                />
              )}
            </div>
          )
        })}

        {doc.notes.map((note) => (
          <div
            key={note.id}
            className="absolute rounded-[3px]"
            style={{
              ...place(note),
              outline: selected === note.id ? `2px solid ${kindColor("frame")}` : undefined,
              outlineOffset: 3
            }}
            role="group"
            aria-label="Note"
            onPointerDown={onItemDown(note.id, note)}
            onDoubleClick={() => setEditing(note.id)}
          >
            <StickyNote author={me} size={190}>
              <Editable
                text={note.text}
                editing={editing === note.id}
                placeholder="Write a note"
                onText={(text) =>
                  setDoc((current) => ({
                    ...current,
                    notes: current.notes.map((each) => (each.id === note.id ? { ...each, text } : each))
                  }))
                }
                onDone={() => {
                  setEditing(undefined)
                  if (!note.text.trim()) remove(note.id)
                }}
              />
            </StickyNote>
          </div>
        ))}

        {drawing && (
          <div
            className="absolute"
            style={place({ x: Math.min(drawing.from.x, drawing.to.x), y: Math.min(drawing.from.y, drawing.to.y) })}
          >
            <DraggedFrame
              width={Math.abs(drawing.to.x - drawing.from.x) * view.zoom}
              height={Math.abs(drawing.to.y - drawing.from.y) * view.zoom}
              size={`${Math.round(Math.abs(drawing.to.x - drawing.from.x))} × ${Math.round(Math.abs(drawing.to.y - drawing.from.y))}`}
            />
          </div>
        )}
        {guides.x !== undefined && <Guide x={place({ x: guides.x, y: 0 }).left} y={0} length={4000} vertical />}
        {guides.y !== undefined && <Guide x={0} y={place({ x: 0, y: guides.y }).top} length={4000} />}

        {start.overlay && <div className="pointer-events-none absolute top-4 left-4">{start.overlay}</div>}

        <div className="absolute top-3 right-3 z-[400] flex items-center gap-0.5 rounded-xl border bg-background/95 p-1 shadow-lg backdrop-blur">
          <IconButton label="Zoom out" onClick={() => stepZoom(-1)}>
            <Minus />
          </IconButton>
          <button
            type="button"
            className="h-7 min-w-14 rounded-md px-2 text-sm tabular-nums hover:bg-accent"
            aria-label={`Zoom ${Math.round(view.zoom * 100)}%, zoom to 100%`}
            onClick={() => zoomTo(1)}
          >
            {Math.round(view.zoom * 100)}%
          </button>
          <IconButton label="Zoom in" onClick={() => stepZoom(1)}>
            <Plus />
          </IconButton>
        </div>

        <FramesToolbar
          tool={tool}
          onTool={(next) => {
            setTool(next)
            setTooltip(undefined)
          }}
          tooltip={tooltip}
          menuOpen={menuOpen}
          onMenuOpen={setMenuOpen}
          frameSelected={design?.kind === "frame" && design.content !== "text"}
          menu={{
            onPreset: (preset) => {
              if (design?.kind === "frame" && design.content !== "text") {
                change((current) => ({
                  ...current,
                  designs: current.designs.map((each) =>
                    each.id === design.id ? { ...each, width: preset.width, height: preset.height } : each
                  )
                }))
              } else addAtMiddle("frame", nextName(doc.designs, "Frame"), preset.width, preset.height)
            },
            onNewScreen: () => addAtMiddle("screen", nextName(doc.designs, "Untitled screen"), 1280, 800),
            onNewComponent: () => addAtMiddle("component", nextName(doc.designs, "Untitled component"), 320, 200)
          }}
        />
      </div>

      <InspectorPanel>
        {design && (
          <DesignInspector
            key={design.id}
            design={design}
            onKind={(kind) => convert(design, kind)}
            onRename={(name) =>
              change((current) => ({
                ...current,
                designs: current.designs.map((each) => (each.id === design.id ? { ...each, name, named: false } : each))
              }))
            }
            onSize={(width, height) =>
              update(design.id, { ...(width ? { width } : {}), ...(height ? { height } : {}) })
            }
          />
        )}
        {!design && selected && <NoteSelected />}
        {!selected && <NothingSelected />}
      </InspectorPanel>

      {confirming && confirming.kind !== "frame" && (
        <BackToAFrameDialog
          kind={confirming.kind}
          name={confirming.name}
          drops={dropsOf(confirming)}
          open
          onOpenChange={(open) => !open && setConfirm(undefined)}
          onConfirm={() => convertNow(confirming, "frame")}
        />
      )}
    </div>
  )
}

/** A frame's root, from its size, for the inspector's style sections: 4 pixels to a step, as the example's tokens. */
function frameRoot(design: Design): DesignNode {
  const text = design.content === "text"
  return {
    id: design.id,
    type: "layout",
    name: design.name,
    style: text
      ? { padding: 2, width: "hug", height: "hug", background: "background" }
      : { width: design.width / 4, height: (design.height ?? 400) / 4, background: "background" },
    children: []
  }
}

/** The Design tab for the selected design: a frame's own styles, or a screen's or component's states and params. */
function DesignInspector({
  design,
  onKind,
  onRename,
  onSize
}: {
  design: Design
  onKind: (kind: Kind) => void
  onRename: (name: string) => void
  onSize: (width?: number, height?: number) => void
}) {
  const { store } = useProject()
  const entries = useContainerEntries(store)
  if (design.kind === "frame") {
    return (
      <FrameInspector name={design.name} root={frameRoot(design)} onKind={onKind} onRename={onRename} onSize={onSize} />
    )
  }
  const entry = entries.find((each) => each.container.name === design.example)
  return (
    <>
      <KindHeader kind={design.kind} name={design.name} onKind={onKind} onRename={onRename} />
      {entry && (design.kind === "screen" ? <StatesSection entry={entry} /> : <ParamsSection entry={entry} />)}
    </>
  )
}

/** Layers: what's on the canvas, by kind, each row selecting its design. */
function LayersList({ doc, selected, onSelect }: { doc: Doc; selected?: string; onSelect: (id: string) => void }) {
  const groups: { label: string; kind: Kind; items: Design[] }[] = [
    { label: "Screens", kind: "screen", items: doc.designs.filter((each) => each.kind === "screen") },
    { label: "Components", kind: "component", items: doc.designs.filter((each) => each.kind === "component") },
    { label: "Frames", kind: "frame", items: doc.designs.filter((each) => each.kind === "frame") }
  ]
  const row =
    "flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm outline-none hover:bg-accent/60 focus-visible:ring-[3px] focus-visible:ring-ring/50"
  return (
    <div className="flex flex-col gap-3 p-2">
      {groups.map(({ label, kind, items }) => (
        <section key={label} aria-label={label} className="flex flex-col">
          <h3 className="flex h-7 items-center justify-between px-2 text-xs text-muted-foreground">
            {label}
            <span className="tabular-nums">{items.length}</span>
          </h3>
          {items.map((each) => (
            <button
              key={each.id}
              type="button"
              aria-pressed={selected === each.id}
              className={`${row} ${selected === each.id ? "bg-accent" : ""}`}
              onClick={() => onSelect(each.id)}
            >
              <KindIcon kind={kind} className="size-4 shrink-0" style={{ color: kindColor(kind) }} />
              <span className="truncate">{each.name}</span>
            </button>
          ))}
        </section>
      ))}
      {doc.notes.length > 0 && (
        <section aria-label="Notes" className="flex flex-col">
          <h3 className="flex h-7 items-center justify-between px-2 text-xs text-muted-foreground">
            Notes
            <span className="tabular-nums">{doc.notes.length}</span>
          </h3>
          {doc.notes.map((note) => (
            <button
              key={note.id}
              type="button"
              aria-pressed={selected === note.id}
              className={`${row} ${selected === note.id ? "bg-accent" : ""}`}
              onClick={() => onSelect(note.id)}
            >
              <NoteIcon className="size-4 shrink-0 text-amber-500" />
              <span className="truncate">{note.text || "Empty note"}</span>
            </button>
          ))}
        </section>
      )}
    </div>
  )
}

/** A text frame's text, typed into where it is while being edited. */
function TextFrameContent({
  text,
  editing,
  onText,
  onDone
}: {
  text: string
  editing: boolean
  onText: (text: string) => void
  onDone: () => void
}) {
  return (
    <div className="bg-white p-2 text-neutral-900">
      {editing ? (
        <span className="inline-flex font-sans text-3xl font-semibold tracking-tight whitespace-nowrap">
          <Editable text={text} editing onText={onText} onDone={onDone} placeholder="Type something" />
        </span>
      ) : (
        <TextLayer>{text}</TextLayer>
      )}
    </div>
  )
}

/**
 * Text typed straight onto the canvas: focused with the cursor at its end while editing, done on Esc or a click away.
 * It holds its own text while typed in, so the cursor stays put.
 */
function Editable({
  text,
  editing,
  placeholder,
  onText,
  onDone
}: {
  text: string
  editing: boolean
  placeholder: string
  onText: (text: string) => void
  onDone: () => void
}) {
  const ref = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    const element = ref.current
    if (!element || !editing) return
    element.textContent = text
    element.focus()
    const range = document.createRange()
    range.selectNodeContents(element)
    range.collapse(false)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)
    // Only when editing starts: afterwards the text is what's typed.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [editing])
  if (!editing) return <>{text}</>
  return (
    <span
      ref={ref}
      role="textbox"
      tabIndex={0}
      aria-label={placeholder}
      contentEditable
      suppressContentEditableWarning
      data-placeholder={placeholder}
      className="min-w-[1ch] cursor-text outline-none empty:before:text-current/40 empty:before:content-[attr(data-placeholder)]"
      onPointerDown={(event) => event.stopPropagation()}
      onInput={(event) => onText(event.currentTarget.textContent ?? "")}
      onBlur={onDone}
      onKeyDown={(event) => {
        event.stopPropagation()
        if (event.key === "Escape") event.currentTarget.blur()
      }}
    />
  )
}
