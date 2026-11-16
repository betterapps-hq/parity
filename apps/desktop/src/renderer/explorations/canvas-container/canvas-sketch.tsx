import { Button, Popover, PopoverContent, PopoverTrigger } from "@buildkitgg/shadcn-baseui-kit"
import type { ResolvedMode } from "@parity-app/core"
import { labelLook, titleReach } from "@parity-app/editor"
import {
  Bookmark,
  ChevronDown,
  CornerDownRight,
  LayoutTemplate,
  type LucideIcon,
  Minus,
  MonitorSmartphone,
  Plus,
  RotateCcw,
  Route,
  SlidersHorizontal,
  SquareStack,
  TriangleAlert
} from "lucide-react"
import {
  type CSSProperties,
  Fragment,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useCallback,
  useLayoutEffect,
  useRef,
  useState
} from "react"
import { kindColors } from "../../canvas/kinds.tsx"
import { Hint } from "../../chrome/Hint.tsx"
import { Name } from "../../chrome/Name.tsx"
import { PanelSectionTitle } from "../../chrome/PanelSection.tsx"
import { ModeViewportIcon } from "../../chrome/viewports.tsx"
import { ChangeMark } from "../../inspector/controls/field-parts.tsx"
import { useResolvedTheme } from "../../theme.ts"
import {
  type BoardData,
  baseWidth,
  breakpointAt,
  breakpoints,
  drawsDark,
  ownKeys,
  picture,
  previewKey,
  previewSize,
  previewValues,
  type PreviewValues,
  settingsGroup,
  snapToBreakpoint,
  type StateItem,
  stateNouns,
  unsavedKeys
} from "./model.ts"
import { PreviewSettings, ZoomField } from "./preview-settings.tsx"
import { type BoardView, orderedModes, orderedStates, shownModes, shownStates, useSketch } from "./sketch-state.tsx"
import { EditModesButton, ModesList, StatesList } from "./view-lists.tsx"

/*
 * The canvas: each design under a one-line title, its previews under a header each. The title names the design and
 * says what its adapter knows; hovered or selected, it also opens the design's stories and modes, reading how many of
 * each show, and runs the adapter's action. A design's previews are in rows: a row for each state shown, under the
 * story's name for a Storybook file, with its preview in each mode shown side by side at its own width, so a wide story
 * doesn't spread out the rest. A row wraps onto new lines rather than run on, however many modes show. A preview's header names its mode
 * and only what the preview sets differently. Clicking a preview or its header selects it, Shift+click adds it to the
 * previews selected, and clicking a story's name selects its row. Dragging a header moves its mode's column among the
 * others, dragging a story's name moves its row, and dragging the handle in the gutter beside a preview resizes it.
 * Nothing is drawn over a preview.
 */

/** A gap on the canvas: its screen size up close, shrinking with the canvas past 40%, as a board's gutter does. */
function gap(zoom: number, screen: number): number {
  return screen / Math.max(zoom, 0.4)
}

/** How far apart a row's previews are up close, on screen: the gutter their resize handles sit in. */
const columnSpace = 40

/** How tall a preview's header is on screen, with the space under it: room for the inspector's fields. */
const headerHeight = 32

/** How much of the canvas a preview's header takes above it at a zoom. */
function headerBand(zoom: number): number {
  return (headerHeight * labelLook("detail", zoom).scale) / zoom
}

/** How tall a story's name is on screen above its previews, with the space under it. */
const nameHeight = 28

/** How much of the canvas a story's name takes above its previews at a zoom. */
function nameBand(zoom: number): number {
  return (nameHeight * labelLook("name", zoom).scale) / zoom
}

/** How tall a design's title is on screen, with the space under it. */
const titleHeight = 32

const zoomSteps = [0.05, 0.1, 0.2, 0.25, 0.35, 0.5, 0.75, 1, 1.5, 2]

/** The screen pixels around the canvas's designs. */
const margin = 240

const modeColor = kindColors.mode

/** A design's selection color: a screen's, which a story's is too, as the app draws one. */
const designColor = kindColors.screen

/** A story's icon color, Storybook's teal, as the app draws a story's bookmark. */
const storyColor = "var(--canvas-story)"

/** Keeps a label at its screen size on the canvas, as `labelLook` scales a name or a detail for the zoom. */
function labelStyle(kind: "name" | "detail", zoom: number, room?: number): CSSProperties {
  const { scale, opacity } = labelLook(kind, zoom, room === undefined ? {} : { width: room })

  return {
    transform: `scale(${scale / zoom})`,
    opacity,
    visibility: opacity > 0 ? undefined : "hidden"
  }
}

/** Where something sits on the canvas, its top left, in page pixels. */
interface Place {
  x: number
  y: number
}

/** A line of a row: its columns, by index, and how far down it starts and ends. */
interface FlowLine {
  items: number[]
  top: number
  bottom: number
}

/** One preview as the board lays it out: its key, state, mode, values and size, and where it sits. */
interface Laid {
  key: string
  state: StateItem
  mode: ResolvedMode
  values: PreviewValues
  size: { width: number; height: number }
  drawn: { width: number; height: number }
  /** Its top left on the board, with its header's band above it. */
  x: number
  y: number
  /** How far its header may run: over the gutter to the next column, or into the room after the last on its line. */
  reach: number
  /** Its line has a second header line, for a header whose extras go under its name: every header sits on the first. */
  tall: boolean
}

/** A state's previews as the board lays them out: a row, under the story's name for a Storybook file. */
interface Row {
  state: StateItem
  y: number
  height: number
  /** Its previews, a column each, in the modes' order. */
  previews: Laid[]
  /** Its lines of columns, on the board, which say where a preview moved among them would land. */
  lines: FlowLine[]
  /** How far its name may run. */
  reach: number
}

/**
 * Lays a design out as rows: a row for each state shown, in order, with its preview in each mode shown side by side in
 * the modes' order, each as wide as it's drawn, so a wide story doesn't spread out the narrow ones. A row wraps onto a
 * new line before a preview would run past two and a half of the widest preview, or 1600 pixels where that's more. Whether a column fits is
 * judged by its gap up close, so zooming never moves one onto another line; the gaps grow as the canvas zooms out.
 */
function boardLayout(
  board: BoardData,
  view: BoardView,
  modes: ResolvedMode[],
  zoom: number,
  /** The previews whose headers don't fit beside their names, so their lines take a second header line. */
  tall: readonly string[] = []
) {
  const band = headerBand(zoom)
  const name = board.kind === "story" ? nameBand(zoom) : 0
  const states = shownStates(board, view)
  const shown = shownModes(view, modes)
  const columnGap = gap(zoom, columnSpace)
  const lineGap = gap(zoom, 40)
  const rowGap = gap(zoom, 48)

  const sized = states.map((state) =>
    shown.map((mode, index) => {
      const key = previewKey(state.id, mode.id)
      const values = previewValues(state, mode, view.own[key], index === 0, view.holding?.[key])
      const size = previewSize(state, values)

      return {
        key,
        state,
        mode,
        values,
        size,
        drawn: { width: size.width * values.scale, height: size.height * values.scale }
      }
    })
  )

  const most = Math.max(1600, 2.5 * Math.max(...sized.flat().map((each) => each.drawn.width)))

  // Each row's previews, side by side at their own widths, wrapped onto lines; each one's left on its line.
  const flows = sized.map((row) => {
    const wrapped: number[][] = []
    const left: number[] = []
    let used = 0

    row.forEach((each, index) => {
      const line = wrapped.at(-1)

      if (line && used + columnSpace + each.drawn.width <= most) {
        line.push(index)
        used += columnSpace + each.drawn.width
      } else {
        wrapped.push([index])
        used = each.drawn.width
      }
    })

    for (const line of wrapped) {
      let x = 0

      for (const index of line) {
        left[index] = x
        x += row[index]!.drawn.width + columnGap
      }
    }

    return { wrapped, left }
  })

  const width = Math.max(
    ...flows.flatMap(({ wrapped, left }, index) =>
      wrapped.map((line) => left[line.at(-1)!]! + sized[index]![line.at(-1)!]!.drawn.width)
    )
  )

  // Past the last preview on a line, a header or a story's name runs out over the canvas.
  const end = width + 200 / zoom
  let y = 0

  const rows: Row[] = states.map((state, index) => {
    const top = y
    let lineTop = top + name
    const previews: Laid[] = []
    const { wrapped, left } = flows[index]!

    const lines = wrapped.map((line) => {
      const extra = line.some((column) => tall.includes(sized[index]![column]!.key)) ? band : 0

      for (const [at, column] of line.entries()) {
        const next = line[at + 1]

        previews[column] = {
          ...sized[index]![column]!,
          x: left[column]!,
          y: lineTop + extra,
          tall: extra > 0,
          reach: (next === undefined ? end : left[next]!) - 8 / zoom - left[column]!
        }
      }

      const bottom = lineTop + extra + Math.max(...line.map((column) => band + sized[index]![column]!.drawn.height))
      const placed = { items: line, top: lineTop, bottom }
      lineTop = bottom + lineGap

      return placed
    })

    const bottom = lines.at(-1)!.bottom
    y = bottom + rowGap

    return { state, y: top, height: bottom - top, previews, lines, reach: end - 8 / zoom }
  })

  return { rows, width, height: y - rowGap, band, columnGap, rowGap }
}

type Layout = ReturnType<typeof boardLayout>

/**
 * Where a column carried over a row would land: before the first on the line under the pointer whose middle is past
 * it, or after that line's last.
 */
function slotAt(lines: FlowLine[], items: { x: number; width: number }[], x: number, y: number) {
  const found = lines.findIndex((line) => y < line.bottom)
  const line = found === -1 ? lines.length - 1 : found
  const row = lines[line]!.items
  const before = row.find((index) => x < items[index]!.x + items[index]!.width / 2)

  return { to: before ?? row.at(-1)! + 1, line }
}

/** Where a slot's marker stands: halfway across the gap before what it's before, or after its line's last. */
function slotX(
  lines: FlowLine[],
  items: { x: number; width: number }[],
  slot: { to: number; line: number },
  gap: number
) {
  const row = lines[slot.line]!.items

  if (row.includes(slot.to)) {
    return items[slot.to]!.x - gap / 2
  }

  const last = items[row.at(-1)!]!

  return last.x + last.width + gap / 2
}

/** Where a story carried over the rows would land: before the first whose middle is below the pointer, or last. */
function rowSlot(rows: Row[], y: number): number {
  const before = rows.findIndex((row) => y < row.y + row.height / 2)

  return before === -1 ? rows.length : before
}

/** Where a row slot's marker stands: halfway down the gap before the row it's before, or after the last. */
function rowSlotY(rows: Row[], to: number, gap: number): number {
  const before = rows[to]

  return before ? before.y - gap / 2 : rows.at(-1)!.y + rows.at(-1)!.height + gap / 2
}

/** The order with `id` moved to place `to` among those shown, as a carried column or story lands. */
function landed(shown: string[], order: string[], id: string, to: number): string[] {
  const from = shown.indexOf(id)
  const rest = shown.filter((each) => each !== id)
  const before = rest[Math.max(0, Math.min(rest.length, to > from ? to - 1 : to))]
  const next = order.filter((each) => each !== id)
  next.splice(before === undefined ? next.length : next.indexOf(before), 0, id)

  return next
}

/** A dashed line from a page down to one under it, or to a group, which it meets at the top. */
interface Line {
  to: string
  x1: number
  y1: number
  x2: number
  /** Where it turns down, above the title of what it leads to. */
  turn: number
  y2: number
}

interface Placement {
  at: Record<string, Place>
  /** How far each design's title may run, to the next design level with it, or `undefined` with none (`titleReach`). */
  reach: Record<string, number | undefined>
  group: { x: number; y: number; w: number; h: number } | undefined
  lines: Line[]
  width: number
  height: number
}

/** The pages under App, side by side, and the gap between them and between levels. */
const pageGap = 160
const levelGap = 640

/** How far a group's outline is from its pages, and how far apart the story boards are. */
const groupPad = 80
const storyGap = 360

/**
 * Lays the designs out from how large each is drawn now, so a design that shows more previews, or wider ones, makes
 * room rather than running into the next: App above the pages it holds, centered over them, Settings' group round
 * Billing and Profile, and the stories in a row below.
 */
function placeBoards(boards: BoardData[], layouts: Layout[], zoom: number): Placement {
  const at: Record<string, Place> = {}
  const size = (id: string) => layouts[boards.findIndex((board) => board.id === id)]!
  const tall = (id: string) => size(id).height
  const first = (id: string) => size(id).rows[0]!.previews[0]!
  // The lines from App meet a page at its top, over the middle of its first preview.
  const centre = (id: string) => at[id]!.x + first(id).x + first(id).drawn.width / 2
  const titleBand = (titleHeight * labelLook("name", zoom).scale) / zoom
  let group: Placement["group"]
  const lines: Line[] = []
  let bottom = 0

  if (boards.some((board) => board.id === "app")) {
    const top = tall("app") + levelGap
    let x = 0

    for (const id of ["dashboard", "detail"]) {
      at[id] = { x, y: top }
      x += size(id).width + pageGap
    }

    const groupX = x
    x += groupPad

    for (const id of settingsGroup.members) {
      at[id] = { x, y: top }
      x += size(id).width + pageGap
    }

    const groupTop = top - titleBand - gap(zoom, 24)
    const members = Math.max(...settingsGroup.members.map(tall))
    group = { x: groupX, y: groupTop, w: x - pageGap + groupPad - groupX, h: top + members + gap(zoom, 24) - groupTop }
    at.app = { x: (group.x + group.w) / 2 - size("app").width / 2, y: 0 }

    const from = { x: centre("app"), y: tall("app") }

    for (const id of ["dashboard", "detail"]) {
      lines.push({
        to: id,
        x1: from.x,
        y1: from.y,
        x2: centre(id),
        turn: top - titleBand - gap(zoom, 16),
        y2: top
      })
    }

    lines.push({
      to: "settings",
      x1: from.x,
      y1: from.y,
      x2: group.x + group.w / 2,
      turn: group.y - gap(zoom, 40),
      y2: group.y
    })
    bottom = group.y + group.h
  }

  let x = 0
  const storiesTop = bottom === 0 ? 0 : bottom + levelGap * 1.5

  for (const board of boards.filter((each) => each.kind === "story")) {
    at[board.id] = { x, y: storiesTop }
    x += size(board.id).width + storyGap
  }

  const extents = boards.map((board) => ({
    right: at[board.id]!.x + size(board.id).width,
    bottom: at[board.id]!.y + tall(board.id)
  }))

  const boxes = boards.map((board) => ({ ...at[board.id]!, w: size(board.id).width, h: tall(board.id) }))
  const nameScale = labelLook("name", zoom).scale

  const reach = Object.fromEntries(
    boards.map((board, index) => [
      board.id,
      titleReach(
        boxes[index]!,
        boxes.filter((_, other) => other !== index),
        zoom,
        nameScale
      )
    ])
  )

  return {
    at,
    reach,
    group,
    lines,
    width: Math.max(...extents.map((each) => each.right), group ? group.x + group.w : 0),
    height: Math.max(...extents.map((each) => each.bottom), bottom)
  }
}

export function CanvasSketch({ zoom: firstZoom }: { zoom: number }) {
  const sketch = useSketch()
  const { boards, views, modes, selection, select, dirty, save } = sketch
  const [zoom, setZoom] = useState(firstZoom)
  const [hovered, setHovered] = useState<string>()
  const theme = useResolvedTheme()
  const scroller = useRef<HTMLDivElement>(null)
  // The previews, by design, whose headers don't fit beside their names, so what they set goes under them.
  const [tall, setTall] = useState<Record<string, readonly string[]>>({})

  const layouts = boards.map((board) => boardLayout(board, views[board.id]!, modes, zoom, tall[board.id]))
  const placement = placeBoards(boards, layouts, zoom)
  const { width, height } = placement

  // Opens on the selected design, or the first, in the middle of the view.
  useLayoutEffect(() => {
    const view = scroller.current

    const index = Math.max(
      0,
      boards.findIndex((board) => board.id === selection.board)
    )

    const board = boards[index]

    if (!view || !board) {
      return
    }

    const box = layouts[index]!
    const place = placement.at[board.id]!
    view.scrollLeft = margin + (place.x + box.width / 2) * zoom - view.clientWidth / 2
    view.scrollTop = margin + (place.y + box.height / 2) * zoom - view.clientHeight / 2
    // Only when it opens: after that, where the view is is the person's to choose.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const step = (by: number) => {
    const at = zoomSteps.findIndex((each) => each >= zoom - 0.001)
    setZoom(zoomSteps[Math.min(zoomSteps.length - 1, Math.max(0, (at === -1 ? zoomSteps.length : at) + by))]!)
  }

  return (
    // oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- Escape from anywhere in the canvas, handled once for it all
    <div
      className={`tl-theme__${theme} relative min-w-0 flex-1 overflow-hidden bg-(--tl-color-background)`}
      onKeyDown={(event) => {
        const target = event.target

        // A menu or popover opened from the canvas draws elsewhere on the page, and its keys are its own, as a field's
        // are while it's typed in.
        if (!(target instanceof Element) || !event.currentTarget.contains(target) || target.closest("input")) {
          return
        }

        if (event.key === "Escape" && !event.defaultPrevented) {
          select(selection.previews?.length ? { board: selection.board } : {})
        }
      }}
    >
      <div
        ref={scroller}
        role="application"
        aria-label="Canvas"
        className="absolute inset-0 overflow-auto"
        onPointerDown={() => select({})}
      >
        <div className="relative" style={{ width: width * zoom + margin * 2, height: height * zoom + margin * 2 }}>
          <div
            className="absolute origin-top-left"
            style={{ left: margin, top: margin, width, height, transform: `scale(${zoom})` }}
          >
            {placement.group && (
              <>
                <Lines lines={placement.lines} zoom={zoom} selected={selection.board} hovered={hovered} />
                <PageGroup
                  box={placement.group}
                  zoom={zoom}
                  selected={selection.board === "settings"}
                  onSelect={() => select({ board: "settings" })}
                  onRedirect={() => select({ board: "profile" })}
                />
              </>
            )}
            {boards.map((board, index) => (
              <Board
                key={board.id}
                board={board}
                place={placement.at[board.id]!}
                reach={placement.reach[board.id]}
                layout={layouts[index]!}
                zoom={zoom}
                hovered={hovered === board.id}
                onHover={(on) => setHovered((now) => toggled(now, board.id, on))}
                onTall={(keys) =>
                  setTall((now) => ((now[board.id] ?? []).join() === keys.join() ? now : { ...now, [board.id]: keys }))
                }
              />
            ))}
          </div>
        </div>
      </div>
      <div className="absolute top-3 right-3 flex items-center gap-1 rounded-lg border bg-popover p-1 text-sm shadow-md">
        <Hint label="Save" detail="Ctrl+S">
          <Button size="sm" variant={dirty ? "default" : "ghost"} disabled={!dirty} onClick={save} className="h-7">
            Save
          </Button>
        </Hint>
        <span className="mx-0.5 h-5 w-px bg-border" aria-hidden />
        <button type="button" aria-label="Zoom out" className={iconButton} onClick={() => step(-1)}>
          <Minus className="size-4" />
        </button>
        <span className="w-11 text-center text-xs tabular-nums">{Math.round(zoom * 100)}%</span>
        <button type="button" aria-label="Zoom in" className={iconButton} onClick={() => step(1)}>
          <Plus className="size-4" />
        </button>
      </div>
    </div>
  )
}

/** What's on now, after `which` turns on, or off where it's the one on. */
function toggled<T>(now: T | undefined, which: T, on: boolean): T | undefined {
  if (on) {
    return which
  }

  return now === which ? undefined : now
}

const iconButton =
  "flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 aria-expanded:bg-accent aria-expanded:text-foreground"

/** Which of a design's lists is open from its title. */
type Menu = "states" | "modes"

/**
 * A design on the canvas: its title above, then a row for each state it shows, under the story's name for a Storybook
 * file, a preview for each mode under a header each, the columns wrapping onto new lines.
 */
function Board({
  board,
  place,
  reach,
  layout,
  zoom,
  hovered,
  onHover,
  onTall
}: {
  board: BoardData
  place: Place
  /** How far its title may run past it into the free canvas. */
  reach: number | undefined
  layout: Layout
  zoom: number
  hovered: boolean
  onHover: (on: boolean) => void
  /** Which of its previews' headers don't fit beside their names, by key. */
  onTall: (keys: readonly string[]) => void
}) {
  const { views, modes, selection, select, setView, setValue, reset } = useSketch()
  const view = views[board.id]!
  const selected = selection.board === board.id
  const { rows, width, height, band, columnGap, rowGap } = layout
  const laid = rows.flatMap((row) => row.previews)
  // The selected previews it shows, in the order picked: the last holds the settings of them all.
  const picked = selected ? (selection.previews ?? []).filter((key) => laid.some((each) => each.key === key)) : []
  // With any of its previews selected, they have the ring and the design no outline of its own, as a frame has none
  // while a layer inside it is selected.
  const boardSelected = selected && picked.length === 0
  const [menu, setMenu] = useState<Menu>()
  const active = hovered || selected || menu !== undefined
  const element = useRef<HTMLDivElement>(null)
  const named = board.kind === "story"
  // Where a column being moved would land among the others, while a header in a row is dragged.
  const [moving, setMoving] = useState<{ mode: string; row: number; to: number; line: number }>()
  // Where a story being moved would land among the rows, while its name is dragged.
  const [carrying, setCarrying] = useState<{ state: string; to: number }>()
  // The preview being resized, which keeps its handle and shows the breakpoints while it is.
  const [resizing, setResizing] = useState<string>()
  // The preview whose header the pointer's over, which is outlined faintly.
  const [pointed, setPointed] = useState<string>()
  // How far each preview's header would reach on the board with what it sets beside its name. Past its room, what it
  // sets goes on a line under its name, and its line of the design makes room for it.
  const [reaches, setReaches] = useState<Record<string, number>>({})
  const stacks = (each: Laid) => (reaches[each.key] ?? 0) > each.x + each.reach + 0.5
  const tallKeys = laid.filter(stacks).map((each) => each.key)
  const tallList = tallKeys.join()

  // oxlint-disable-next-line react-hooks/exhaustive-deps -- the list by what it holds, not which array holds it
  useLayoutEffect(() => onTall(tallKeys), [tallList, onTall])

  const onReach = useCallback(
    (key: string, right: number) =>
      setReaches((now) => (Math.abs((now[key] ?? -1) - right) < 0.5 ? now : { ...now, [key]: right })),
    []
  )

  // Selects `keys`, or with Shift adds them to the previews selected, or takes them away where they all are.
  const pick = (keys: string[], add: boolean) => {
    if (!add) {
      select({ board: board.id, previews: keys })

      return
    }

    const rest = picked.filter((key) => !keys.includes(key))
    const next = keys.every((key) => picked.includes(key)) ? rest : [...rest, ...keys]
    select(next.length > 0 ? { board: board.id, previews: next } : { board: board.id })
  }

  // What resizing a preview changes: every preview selected, where it's one of them, or it alone.
  const changing = (key: string) => laid.filter((each) => (picked.includes(key) ? picked : [key]).includes(each.key))

  const moveMode = (mode: string, to: number) =>
    setView(board.id, (current) => ({
      order: landed(
        shownModes(current, modes).map((each) => each.id),
        orderedModes(current, modes).map((each) => each.id),
        mode,
        to
      )
    }))

  const moveState = (state: string, to: number) =>
    setView(board.id, (current) => ({
      stateOrder: landed(
        shownStates(board, current).map((each) => each.id),
        orderedStates(board, current).map((each) => each.id),
        state,
        to
      )
    }))

  // Where the pointer is on the board, in its own pixels.
  const pointAt = (clientX: number, clientY: number) => {
    const box = element.current?.getBoundingClientRect()

    return { x: (clientX - (box?.left ?? 0)) / zoom, y: (clientY - (box?.top ?? 0)) / zoom }
  }

  const columnSlot = (row: Row, clientX: number, clientY: number) => {
    const { x, y } = pointAt(clientX, clientY)

    return slotAt(
      row.lines,
      row.previews.map((each) => ({ x: each.x, width: each.drawn.width })),
      x,
      y
    )
  }

  const movingRow = moving && rows[moving.row]
  const movingLine = moving && movingRow?.lines[moving.line]

  return (
    <div
      ref={element}
      className="absolute"
      style={{ left: place.x, top: place.y, width, height }}
      onPointerEnter={() => onHover(true)}
      onPointerLeave={() => onHover(false)}
      onPointerDown={(event) => {
        event.stopPropagation()
        select({ board: board.id })
      }}
    >
      <div
        className="absolute bottom-full left-0 origin-bottom-left"
        style={{ ...labelStyle("name", zoom, reach), paddingBottom: 4 }}
      >
        <Title
          board={board}
          view={view}
          minWidth={(width * zoom) / labelLook("name", zoom).scale}
          maxWidth={reach === undefined ? undefined : (reach * zoom) / labelLook("name", zoom).scale}
          selected={selected}
          active={active}
          menu={menu}
          onMenu={(which, open) => setMenu((now) => toggled(now, which, open))}
        />
      </div>
      {rows.map((row, index) => {
        const keys = row.previews.map((each) => each.key)

        return (
          <Fragment key={row.state.id}>
            {named && (
              <StateName
                row={row}
                zoom={zoom}
                tabbable={active}
                selected={keys.every((key) => picked.includes(key))}
                dragging={carrying?.state === row.state.id}
                onSelect={(add) => pick(keys, add)}
                onMoveStart={() => {
                  setCarrying({ state: row.state.id, to: index })

                  if (!selected) {
                    select({ board: board.id })
                  }
                }}
                onMove={(clientX, clientY) =>
                  setCarrying({ state: row.state.id, to: rowSlot(rows, pointAt(clientX, clientY).y) })
                }
                onMoveEnd={(drop) => {
                  if (drop && carrying) {
                    moveState(row.state.id, carrying.to)
                  }

                  setCarrying(undefined)
                }}
                onNudge={(by) => {
                  const to = index + by

                  if (to >= 0 && to < rows.length) {
                    moveState(row.state.id, by > 0 ? to + 1 : to)
                  }
                }}
              />
            )}
            {row.previews.map((each, at) => (
              <Preview
                key={each.key}
                laid={each}
                band={band}
                zoom={zoom}
                selected={picked.includes(each.key)}
                raised={picked.at(-1) === each.key}
                header={
                  <PreviewHeader
                    board={board}
                    laid={each}
                    view={view}
                    zoom={zoom}
                    named={named}
                    boardActive={active}
                    selected={picked.includes(each.key)}
                    // The last preview picked holds the settings of every one selected.
                    settings={picked.at(-1) === each.key ? picked : undefined}
                    stacked={stacks(each)}
                    onReach={onReach}
                    dragging={moving?.mode === each.mode.id && moving.row === index}
                    onSelect={(add) => pick([each.key], add)}
                    onMoveStart={() => {
                      setMoving({ mode: each.mode.id, row: index, to: at, line: 0 })

                      if (!picked.includes(each.key)) {
                        select({ board: board.id, previews: [each.key] })
                      }
                    }}
                    onMove={(clientX, clientY) =>
                      setMoving({ mode: each.mode.id, row: index, ...columnSlot(row, clientX, clientY) })
                    }
                    onMoveEnd={(drop) => {
                      if (drop && moving) {
                        moveMode(each.mode.id, moving.to)
                      }

                      setMoving(undefined)
                    }}
                    onPoint={(on) => setPointed(on ? each.key : undefined)}
                    onNudge={(by) => {
                      const to = at + by

                      if (to >= 0 && to < row.previews.length) {
                        moveMode(each.mode.id, by > 0 ? to + 1 : to)
                      }
                    }}
                  />
                }
                handle={active || resizing === each.key}
                pointed={pointed === each.key}
                resizing={resizing === each.key}
                moving={moving?.mode === each.mode.id || carrying?.state === row.state.id}
                tabbable={selected}
                onSelect={(add) => pick([each.key], add)}
                onResizeStart={() => {
                  setResizing(each.key)

                  if (!picked.includes(each.key)) {
                    select({ board: board.id, previews: [each.key] })
                  }

                  setView(board.id, () => ({
                    holding: Object.fromEntries(changing(each.key).map((one) => [one.key, one.values.scale]))
                  }))
                }}
                onResize={(nextWidth) => {
                  for (const one of changing(each.key)) {
                    setValue(
                      board.id,
                      one.key,
                      "width",
                      nextWidth === baseWidth(one.state, one.mode) ? undefined : nextWidth
                    )
                  }
                }}
                onResizeEnd={() => {
                  setResizing(undefined)
                  setView(board.id, () => ({ holding: undefined }))
                }}
                onResetWidth={() => {
                  for (const one of changing(each.key)) {
                    reset(board.id, one.key, ["width"])
                  }
                }}
              />
            ))}
          </Fragment>
        )
      })}
      {moving && movingRow && movingLine && (
        <Marker
          x={slotX(
            movingRow.lines,
            movingRow.previews.map((each) => ({ x: each.x, width: each.drawn.width })),
            moving,
            columnGap
          )}
          y={movingLine.top + band}
          length={movingLine.bottom - movingLine.top - band}
          zoom={zoom}
          color={modeColor}
        />
      )}
      {carrying && (
        <Marker x={0} y={rowSlotY(rows, carrying.to, rowGap)} length={width} across zoom={zoom} color={designColor} />
      )}
      {(boardSelected || hovered || menu !== undefined) && (
        <div
          aria-hidden
          className="pointer-events-none absolute"
          style={{
            left: -5 / zoom,
            right: -5 / zoom,
            top: -5 / zoom,
            bottom: -5 / zoom,
            border: `${(boardSelected ? 2 : 1) / zoom}px solid ${boardSelected ? designColor : "color-mix(in oklab, currentColor 22%, transparent)"}`
          }}
        />
      )}
      {board.lands && (
        // Under the design, lined up with its left edge, as the app shows where a page lands.
        <div
          className="pointer-events-none absolute top-full left-0 origin-top-left pt-3"
          style={labelStyle("detail", zoom, width)}
        >
          <div className="flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-sm whitespace-nowrap text-amber-700 dark:text-amber-400">
            <TriangleAlert aria-hidden className="size-3.5 shrink-0" />
            Lands on {board.lands}
          </div>
        </div>
      )}
    </div>
  )
}

/** Where something carried will land: a line in the gap there, down beside a column, or `across` between rows. */
function Marker({
  x,
  y,
  length,
  across = false,
  zoom,
  color
}: {
  x: number
  y: number
  length: number
  across?: boolean
  zoom: number
  color: string
}) {
  const thick = 2 / zoom

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute rounded-full"
      style={
        across
          ? { left: x, top: y - thick / 2, width: length, height: thick, background: color }
          : { left: x - thick / 2, top: y, width: thick, height: length, background: color }
      }
    />
  )
}

/**
 * The design's one-line title: its icon and name, then what its adapter knows, such as a page's path, its params as
 * fields and where it lands. Hovered or selected, its stories and modes menus and the adapter's action follow, at the
 * board's right edge or, past a narrow board, after the name: an icon each, so the title stays short however many
 * stories and modes the design has.
 */
function Title({
  board,
  view,
  minWidth,
  maxWidth,
  selected,
  active,
  menu,
  onMenu
}: {
  board: BoardData
  view: BoardView
  minWidth: number
  /** Out to the next design level with it, so a narrow design's name runs into the canvas beside it. */
  maxWidth: number | undefined
  selected: boolean
  active: boolean
  menu: Menu | undefined
  onMenu: (menu: Menu, open: boolean) => void
}) {
  const { modes, select, param, setParam } = useSketch()
  const Icon = board.kind === "page" ? Route : Bookmark
  const Action = board.action.icon
  const color = selected ? designColor : undefined
  const nouns = stateNouns(board.kind)

  return (
    <div className="flex h-7 items-center gap-3 overflow-hidden whitespace-nowrap" style={{ minWidth, maxWidth }}>
      <div
        className="flex min-w-0 items-center gap-1.5 rounded-md bg-(--tl-color-background) pr-1 text-sm"
        style={color ? { color } : undefined}
      >
        <button
          type="button"
          aria-pressed={selected}
          onClick={() => select({ board: board.id })}
          className="flex min-w-0 items-center gap-1.5 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <Icon
            className="size-3.5 shrink-0"
            style={{ color: board.kind === "story" ? storyColor : designColor }}
            aria-hidden
          />
          <span className="truncate font-medium">{board.name}</span>
        </button>
        {board.path && <PagePath parts={board.path} value={param} onValue={setParam} />}
      </div>
      <div
        className={`ml-auto items-center gap-1 ${active ? "flex" : "hidden"}`}
        data-canvas-control
        onPointerDown={(event) => event.stopPropagation()}
      >
        {board.states.length > 1 && (
          <ListMenu
            label={nouns.many}
            icon={SquareStack}
            count={board.states.length}
            shown={shownStates(board, view).length}
            open={menu === "states"}
            onOpenChange={(open) => onMenu("states", open)}
          >
            <StatesList board={board} view={view} group="canvas-states" />
          </ListMenu>
        )}
        <ListMenu
          label="Modes"
          icon={MonitorSmartphone}
          count={modes.length}
          shown={shownModes(view, modes).length}
          action={<EditModesButton onOpen={() => onMenu("modes", false)} />}
          open={menu === "modes"}
          onOpenChange={(open) => onMenu("modes", open)}
        >
          <ModesList board={board} view={view} group="canvas-modes" />
        </ListMenu>
        <Hint label={board.action.label}>
          <button type="button" aria-label={board.action.label} className={`${iconButton} size-6`}>
            <Action className="size-3.5" />
          </button>
        </Hint>
      </div>
    </div>
  )
}

/**
 * One of the design's lists in a popover from its title: its trigger is an icon and how many of the list show, named by
 * its hint, and the list scrolls.
 */
function ListMenu({
  label,
  icon: Icon,
  count,
  shown,
  action,
  open,
  onOpenChange,
  children
}: {
  label: string
  icon: LucideIcon
  count: number
  /** How many of them show. */
  shown: number
  action?: ReactNode
  open: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger
        render={
          <Hint label={label} hidden={open}>
            <button
              type="button"
              aria-label={`${label}, ${shown} shown`}
              className="flex h-6 items-center gap-1 rounded-md bg-muted/50 px-1.5 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 aria-expanded:bg-accent aria-expanded:text-foreground dark:bg-input/40"
            >
              <Icon className="size-3.5" aria-hidden />
              <span className="text-xs tabular-nums">{shown}</span>
              <ChevronDown className="-ml-0.5 size-3 opacity-60" aria-hidden />
            </button>
          </Hint>
        }
      />
      <PopoverContent align="end" className="w-64 gap-0 py-3 pr-1 pl-3">
        <PanelSectionTitle title={label} count={count} action={action} spacing="mb-2 pr-2" />
        <div className="max-h-96 overflow-y-auto">{children}</div>
      </PopoverContent>
    </Popover>
  )
}

/** A route's path, its params as fields that set the value the page is drawn with. */
function PagePath({
  parts,
  value,
  onValue
}: {
  parts: BoardData["path"] & {}
  value: string
  onValue: (value: string) => void
}) {
  return (
    <span className="flex items-center text-xs text-muted-foreground">
      {parts.map((part, index) =>
        "text" in part ? (
          <span key={index}>{part.text}</span>
        ) : (
          <Hint key={index} label={`$${part.param}`} wait>
            <input
              aria-label={part.param}
              value={value}
              placeholder={part.param}
              onPointerDown={(event) => event.stopPropagation()}
              onChange={(event) => onValue(event.currentTarget.value)}
              className="field-sizing-content min-w-6 rounded-sm bg-muted/60 px-1 text-xs text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
            />
          </Hint>
        )
      )}
    </span>
  )
}

/**
 * A press that carries what it's on once it moves 4 pixels, and is a click if it never does, which says whether Shift
 * was down. It keeps the pointer while it's down, so a carry goes on past the element.
 */
function useCarry({
  onClick,
  onStart,
  onMove,
  onEnd
}: {
  onClick: (shift: boolean) => void
  onStart: () => void
  onMove: (clientX: number, clientY: number) => void
  onEnd: (drop: boolean) => void
}) {
  const press = useRef<{ x: number; y: number; moved: boolean }>(undefined)

  return {
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
      event.stopPropagation()

      if (event.button !== 0) {
        return
      }

      event.currentTarget.setPointerCapture(event.pointerId)
      press.current = { x: event.clientX, y: event.clientY, moved: false }
    },
    onPointerMove: (event: ReactPointerEvent<HTMLElement>) => {
      const pressed = press.current

      if (!pressed) {
        return
      }

      if (!pressed.moved && Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) > 4) {
        pressed.moved = true
        onStart()
      }

      if (pressed.moved) {
        onMove(event.clientX, event.clientY)
      }
    },
    onPointerUp: (event: ReactPointerEvent<HTMLElement>) => {
      const pressed = press.current
      press.current = undefined

      if (pressed?.moved) {
        onEnd(true)
      } else if (pressed) {
        onClick(event.shiftKey)
      }
    },
    onPointerCancel: () => {
      press.current = undefined
      onEnd(false)
    }
  }
}

/** Left and Right move what has focus a place, or Up and Down for a row, as they do a row's handle in a list. */
function nudgeKeys(onNudge: (by: number) => void, row = false) {
  const [back, on] = row ? ["ArrowUp", "ArrowDown"] : ["ArrowLeft", "ArrowRight"]

  return (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === back || event.key === on) {
      event.preventDefault()
      onNudge(event.key === back ? -1 : 1)
    }
  }
}

/**
 * A story's name above its row, as wide on screen as the board and the room after it. Clicking it selects the row's
 * previews, and Shift+click adds them; dragging it moves the story among the others, as Up and Down on it do.
 */
function StateName({
  row,
  zoom,
  tabbable,
  selected,
  dragging,
  onSelect,
  onMoveStart,
  onMove,
  onMoveEnd,
  onNudge
}: {
  row: Row
  zoom: number
  tabbable: boolean
  /** Every preview in its row is selected. */
  selected: boolean
  dragging: boolean
  onSelect: (add: boolean) => void
  onMoveStart: () => void
  onMove: (clientX: number, clientY: number) => void
  onMoveEnd: (drop: boolean) => void
  onNudge: (by: number) => void
}) {
  const { scale } = labelLook("name", zoom)
  const carry = useCarry({ onClick: onSelect, onStart: onMoveStart, onMove, onEnd: onMoveEnd })

  return (
    <div
      className="absolute origin-top-left"
      style={{
        left: 0,
        top: row.y,
        // It stays while it has the room it runs into, as a design's title does.
        ...labelStyle("name", zoom, row.reach),
        width: (row.reach * zoom) / scale
      }}
    >
      <Hint label={`Select ${row.state.name}`} detail="Drag to reorder" wait>
        <button
          type="button"
          tabIndex={tabbable ? 0 : -1}
          aria-pressed={selected}
          aria-keyshortcuts="ArrowUp ArrowDown"
          data-canvas-control
          {...carry}
          onKeyDown={nudgeKeys(onNudge, true)}
          onClick={(event) => {
            // A press that never moved selects on its way up; Enter and Space come here alone.
            if (event.detail === 0) {
              onSelect(event.shiftKey)
            }
          }}
          className={`flex h-6 max-w-full min-w-0 items-center rounded px-0.5 text-sm font-medium outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 ${dragging ? "cursor-grabbing" : "cursor-default"} ${selected ? "" : "text-foreground/90"}`}
          style={selected ? { color: modeColor } : undefined}
        >
          <Name className="min-w-0">{row.state.name}</Name>
        </button>
      </Hint>
    </div>
  )
}

/**
 * A preview's header, above it in a band of its own: its mode, then only what the preview sets differently from its
 * mode, each changed since the last save with the change mark, and a reset while any is. It runs over the gutter to the
 * next column, or into the room after the last on a line, so headers never meet. Clicking it
 * selects the preview, and Shift+click adds it to the previews selected; dragging it moves its mode's column among the
 * others, as Left and Right do.
 *
 * The header of the last preview picked holds the settings of every one selected, so they're set on the canvas, above
 * what they change: their zoom as a field, and a button, marked while any of the rest has changed, that opens their
 * width and variables. Whatever a header holds after its name goes beside it where it fits in the header's room, and
 * otherwise on a line under its name, its line of the design making room, so none of it is cut off or covers another.
 */
function PreviewHeader({
  board,
  laid,
  view,
  zoom,
  named,
  boardActive,
  selected,
  settings,
  stacked,
  onReach,
  dragging,
  onSelect,
  onMoveStart,
  onMove,
  onMoveEnd,
  onPoint,
  onNudge
}: {
  board: BoardData
  laid: Laid
  view: BoardView
  zoom: number
  /** Its design names its rows, so it names its story too, for a screen reader. */
  named: boolean
  boardActive: boolean
  selected: boolean
  /** The previews whose settings it holds, as the last of them picked. */
  settings: string[] | undefined
  /** What it sets doesn't fit beside its name, so it goes under it, in a band its line makes room for. */
  stacked: boolean
  /** It says how far it would reach on the board with what it sets beside its name, by its preview's key. */
  onReach: (key: string, right: number) => void
  dragging: boolean
  onSelect: (add: boolean) => void
  onMoveStart: () => void
  onMove: (clientX: number, clientY: number) => void
  onMoveEnd: (drop: boolean) => void
  onPoint: (on: boolean) => void
  onNudge: (by: number) => void
}) {
  const { reset } = useSketch()
  const { key, state, mode } = laid
  const own = view.own[key]
  const saved = view.saved[key]
  const unsaved = unsavedKeys(own, saved)
  const { scale } = labelLook("detail", zoom)
  const room = (laid.reach * zoom) / scale
  const carry = useCarry({ onClick: onSelect, onStart: onMoveStart, onMove, onEnd: onMoveEnd })
  const name = named ? `${state.name} in ${mode.name}` : mode.name
  const nameButton = useRef<HTMLButtonElement>(null)
  const group = useRef<HTMLDivElement>(null)
  const holdsSettings = settings !== undefined
  const ownCount = ownKeys(own).length

  // It says how far it would reach with what it sets beside its name, however that's laid out now: past its room, it
  // goes under its name.
  useLayoutEffect(() => {
    const name = nameButton.current
    const rest = group.current

    if (!name) {
      return
    }

    const report = () =>
      onReach(
        key,
        laid.x +
          (name.getBoundingClientRect().width + (rest ? rest.getBoundingClientRect().width + 6 * scale : 0)) / zoom
      )

    report()
    const observer = new ResizeObserver(report)
    observer.observe(name)

    if (rest) {
      observer.observe(rest)
    }

    return () => observer.disconnect()
    // Again when what follows its name changes: the settings, the tags, or the reset.
  }, [key, laid.x, zoom, scale, onReach, holdsSettings, ownCount, unsaved.length])

  const resetButton = unsaved.length > 0 && (
    <Hint label={saved && ownKeys(saved).length > 0 ? "Reset to saved values" : `Reset to ${mode.name}`}>
      <button
        type="button"
        aria-label={`Reset ${name}`}
        onClick={() => reset(board.id, key)}
        className="grid size-5 shrink-0 place-items-center rounded text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <RotateCcw className="size-3" />
      </button>
    </Hint>
  )

  return (
    <div
      className="absolute bottom-full left-0 origin-bottom-left"
      style={{
        ...labelStyle("detail", zoom, laid.drawn.width),
        width: room,
        height: laid.tall ? headerHeight * 2 : headerHeight
      }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div
        className={`flex gap-1.5 text-xs whitespace-nowrap ${stacked ? "flex-col items-start gap-y-1" : "h-7 items-center"}`}
        onPointerEnter={() => onPoint(true)}
        onPointerLeave={() => onPoint(false)}
      >
        <Hint label={`Select ${mode.name}`} detail="Drag to reorder" wait>
          <button
            ref={nameButton}
            type="button"
            tabIndex={boardActive || selected ? 0 : -1}
            aria-label={named ? name : undefined}
            aria-pressed={selected}
            aria-keyshortcuts="ArrowLeft ArrowRight"
            data-canvas-control
            {...carry}
            onKeyDown={nudgeKeys(onNudge)}
            onClick={(event) => {
              // A press that never moved selects on its way up; Enter and Space come here alone.
              if (event.detail === 0) {
                onSelect(event.shiftKey)
              }
            }}
            // As wide as it reads, so what it sets goes under it rather than cut it off.
            className={`flex h-7 w-max shrink-0 items-center gap-1.5 rounded px-0.5 font-medium outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 ${dragging ? "cursor-grabbing" : "cursor-default"} ${selected ? "" : "text-foreground/80"}`}
            style={selected ? { color: modeColor } : undefined}
          >
            <ModeViewportIcon of={mode} className="size-3.5 shrink-0 opacity-80" aria-hidden />
            <Name className="min-w-0">{mode.name}</Name>
          </button>
        </Hint>
        {settings ? (
          <div
            ref={group}
            // Under its name, it can run past its column, over the room under the next header's name.
            className="relative z-10 flex h-7 w-max shrink-0 items-center gap-1.5 rounded-md bg-(--tl-color-background) pr-1"
          >
            <ZoomField board={board} previews={settings} />
            <SettingsMenu board={board} previews={settings} changed={unsaved.some((each) => each !== "scale")} />
            {resetButton}
          </div>
        ) : (
          ownCount > 0 && (
            // Set differently from its mode: the settings button, marked while unsaved, which opens its own settings.
            <div ref={group} className="flex h-7 w-max shrink-0 items-center gap-1.5 pr-1">
              <SettingsMenu board={board} previews={[key]} changed={unsaved.length > 0} />
              {resetButton}
            </div>
          )
        )}
      </div>
    </div>
  )
}

/**
 * The button in a preview's header that opens its settings: of every one selected, in the header of the last picked,
 * or of its own where it sets anything differently from its mode. It has the change mark while any of them other than
 * a zoom its header has a field for has changed since the last save. The settings
 * open above it, clear of what they change.
 */
function SettingsMenu({ board, previews, changed }: { board: BoardData; previews: string[]; changed: boolean }) {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Hint label="Preview settings" hidden={open}>
            <button
              type="button"
              aria-label="Preview settings"
              data-canvas-control
              className="relative flex size-7 shrink-0 items-center justify-center rounded-md bg-muted/50 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 aria-expanded:bg-accent aria-expanded:text-foreground dark:bg-input/40"
            >
              <SlidersHorizontal className="size-3.5 shrink-0" aria-hidden />
              {changed && <ChangeMark />}
            </button>
          </Hint>
        }
      />
      <PopoverContent side="top" align="start" className="w-56 gap-0 p-3">
        <PreviewSettings board={board} previews={previews} />
      </PopoverContent>
    </Popover>
  )
}

/**
 * A preview straight on the canvas, its header above it and, while the design's hovered or selected, its handle in the
 * gutter after it, which resizes it, with every other preview selected where it's one of them: a page snaps to the
 * app's breakpoints, double-clicking puts its width back as saved, and Left and Right nudge it, by 10 with Shift.
 * Clicking it selects it, and Shift+click adds it to the previews selected, which have a ring in the mode color.
 */
function Preview({
  laid,
  band,
  zoom,
  header,
  selected,
  raised,
  handle,
  pointed,
  resizing,
  moving,
  tabbable,
  onSelect,
  onResizeStart,
  onResize,
  onResizeEnd,
  onResetWidth
}: {
  laid: Laid
  /** The header's band above it. */
  band: number
  zoom: number
  header: ReactNode
  selected: boolean
  /** Its header holds the settings, so it draws over the headers beside it. */
  raised: boolean
  handle: boolean
  /** Its header is pointed at. */
  pointed: boolean
  /** It's being resized, so a page shows the app's breakpoints under it. */
  resizing: boolean
  /** Its header is being dragged to move it. */
  moving: boolean
  tabbable: boolean
  onSelect: (add: boolean) => void
  /** A resize holds the scale each preview it changes is drawn at until it ends, so the edge follows the pointer. */
  onResizeStart: () => void
  onResize: (width: number) => void
  onResizeEnd: () => void
  onResetWidth: () => void
}) {
  const { state, mode, values, size, drawn } = laid
  const page = state.size === undefined
  const [least, most] = page ? [320, 1920] : [80, 1200]

  const resizeTo = (width: number, snap: boolean) => {
    const clamped = Math.round(Math.min(most, Math.max(least, width)))
    // Within 6 screen pixels of a breakpoint, a page lands on it.
    const landedAt = page && snap ? snapToBreakpoint(clamped, 6 / (zoom * values.scale)) : clamped
    onResize(landedAt)
  }

  const drag = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.stopPropagation()

    if (event.button !== 0) {
      return
    }

    const target = event.currentTarget
    target.setPointerCapture(event.pointerId)
    onResizeStart()
    const startX = event.clientX
    const startWidth = values.width

    const moved = (move: PointerEvent) =>
      resizeTo(startWidth + (move.clientX - startX) / (zoom * values.scale), !move.altKey)

    const up = () => {
      target.removeEventListener("pointermove", moved)
      target.removeEventListener("pointerup", up)
      onResizeEnd()
    }

    target.addEventListener("pointermove", moved)
    target.addEventListener("pointerup", up)
  }

  const keyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault()
      const by = (event.shiftKey ? 10 : 1) * (event.key === "ArrowLeft" ? -1 : 1)
      onResizeStart()
      resizeTo(values.width + by, false)
    }
  }

  return (
    <div
      className="absolute transition-opacity"
      style={{
        left: laid.x,
        top: laid.y + band,
        width: drawn.width,
        height: drawn.height,
        opacity: moving ? 0.5 : undefined,
        zIndex: raised ? 1 : undefined
      }}
      onPointerDown={(event) => {
        event.stopPropagation()

        if (event.button === 0) {
          onSelect(event.shiftKey)
        }
      }}
    >
      {header}
      <div
        className="origin-top-left overflow-hidden"
        style={{
          width: size.width,
          height: size.height,
          transform: `scale(${values.scale})`,
          background: drawsDark(values) ? "#0a0a0a" : "white"
        }}
      >
        {/*
          A page fills its preview's width, drawn as its breakpoints draw it. A story keeps its own size: its width is a
          size to try, so more room shows the canvas behind it and less cuts it off, as its bounds would.
        */}
        <img
          src={picture(state, values)}
          alt=""
          draggable={false}
          className={`block select-none ${page ? "w-full" : "max-w-none"}`}
          style={page ? undefined : { width: state.size!.width }}
        />
      </div>
      {(selected || pointed) && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            boxShadow: `0 0 0 ${(selected ? 2 : 1) / zoom}px ${selected ? modeColor : `color-mix(in oklab, ${modeColor} 60%, transparent)`}`
          }}
        />
      )}
      {handle && (
        <Hint label="Drag to resize this preview" detail="Double-click to reset" wait>
          <div
            // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a resize handle is a focusable separator with a value, which an hr can't be
            role="separator"
            aria-orientation="vertical"
            aria-label={`Resize ${mode.name}`}
            aria-valuenow={values.width}
            aria-valuemin={least}
            aria-valuemax={most}
            tabIndex={tabbable ? 0 : -1}
            data-canvas-control
            onPointerDown={drag}
            onDoubleClick={(event) => {
              event.stopPropagation()
              onResetWidth()
            }}
            onKeyDown={keyDown}
            onBlur={onResizeEnd}
            className="group/edge absolute top-0 left-full h-full cursor-ew-resize outline-none"
            style={{ width: gap(zoom, columnSpace) }}
          >
            <span
              className="absolute top-1/2 left-1/2 -translate-1/2 rounded-full bg-muted-foreground/40 transition-colors group-hover/edge:bg-(--canvas-mode) group-focus-visible/edge:bg-(--canvas-mode) group-active/edge:bg-(--canvas-mode)"
              style={{ width: 4 / zoom, height: Math.min(40 / zoom, drawn.height / 2) }}
            />
          </div>
        </Hint>
      )}
      {resizing && page && <BreakpointRuler width={values.width} scale={values.scale} zoom={zoom} most={most} />}
    </div>
  )
}

/**
 * The app's breakpoints under a page's preview while it's resized, each where the preview's edge meets it, the one it's
 * at lit from there to the next, so it's plain where the page changes. It sits in the gap below, clear of the page.
 */
function BreakpointRuler({ width, scale, zoom, most }: { width: number; scale: number; zoom: number; most: number }) {
  const at = breakpointAt(width)
  const next = breakpoints.find((each) => each.width > width)
  const from = at?.width ?? 0
  const to = next?.width ?? Math.min(most, width + 160)
  const shown = breakpoints.filter((each) => each.width <= width || each === next)
  const { opacity } = labelLook("detail", zoom)
  const faint = "color-mix(in oklab, currentColor 30%, transparent)"

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute left-0"
      style={{ top: `calc(100% + ${10 / zoom}px)`, width: to * scale, height: 24 / zoom }}
    >
      <div className="absolute inset-x-0 top-0" style={{ height: 1 / zoom, background: faint }} />
      <div
        className="absolute top-0 rounded-full"
        style={{
          left: from * scale,
          width: (to - from) * scale,
          height: 3 / zoom,
          background: `color-mix(in oklab, ${modeColor} 55%, transparent)`
        }}
      />
      {shown.map((each) => {
        const lit = each.name === at?.name

        return (
          <div key={each.name} className="absolute top-0" style={{ left: each.width * scale }}>
            <div style={{ width: 1 / zoom, height: 7 / zoom, background: lit ? modeColor : faint }} />
            <div
              className={`absolute left-0 origin-top-left text-xs leading-none font-medium whitespace-nowrap ${lit ? "" : "text-muted-foreground"}`}
              style={{
                top: 10 / zoom,
                transform: `scale(${1 / zoom}) translateX(-50%)`,
                opacity,
                color: lit ? modeColor : undefined
              }}
            >
              {each.name}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** Settings, a layout whose index only redirects: a dashed outline round its pages, its header above it as a title. */
function PageGroup({
  box,
  zoom,
  selected,
  onSelect,
  onRedirect
}: {
  box: NonNullable<Placement["group"]>
  zoom: number
  selected: boolean
  onSelect: () => void
  onRedirect: () => void
}) {
  const color = kindColors.screen

  return (
    <div
      className="absolute"
      style={{
        left: box.x,
        top: box.y,
        width: box.w,
        height: box.h,
        border: `${(selected ? 2 : 1) / zoom}px ${selected ? "solid" : "dashed"} ${selected ? color : "color-mix(in oklab, currentColor 30%, transparent)"}`,
        borderRadius: 16 / Math.max(zoom, 0.4)
      }}
    >
      <div
        className="absolute bottom-full left-0 origin-bottom-left"
        style={{ ...labelStyle("name", zoom, box.w), paddingBottom: 6 }}
        onPointerDown={(event) => {
          event.stopPropagation()
          onSelect()
        }}
      >
        <div
          className="flex h-7 items-center gap-1.5 rounded-md bg-(--tl-color-background) pr-1 text-sm whitespace-nowrap"
          style={selected ? { color } : undefined}
        >
          <LayoutTemplate className="size-3.5" style={{ color }} aria-hidden />
          <span className="font-medium">Settings</span>
          <span className="text-xs text-muted-foreground">/settings</span>
          <Hint label="Redirects to Profile">
            <button
              type="button"
              onPointerDown={(event) => {
                event.stopPropagation()
                onRedirect()
              }}
              className="ml-1 flex items-center gap-1 rounded-md bg-muted/70 px-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <CornerDownRight className="size-3" aria-hidden />
              Profile
            </button>
          </Hint>
        </div>
      </div>
    </div>
  )
}

/** The dashed lines from App down to the pages under it, brought forward for the selected or hovered one. */
function Lines({
  lines,
  zoom,
  selected,
  hovered
}: {
  lines: Line[]
  zoom: number
  selected?: string | undefined
  hovered?: string | undefined
}) {
  const lit = (to: string) =>
    [selected, hovered].some(
      (id) => id === "app" || id === to || (to === "settings" && settingsGroup.members.includes(id ?? ""))
    )

  return (
    <svg className="pointer-events-none absolute top-0 left-0 overflow-visible" width={1} height={1} aria-hidden>
      {lines.map(({ to, x1, y1, x2, turn, y2 }) => {
        const bend = (turn - y1) / 2

        return (
          <path
            key={to}
            d={`M ${x1} ${y1} C ${x1} ${y1 + bend}, ${x2} ${turn - bend}, ${x2} ${turn} L ${x2} ${y2}`}
            fill="none"
            stroke={lit(to) ? kindColors.screen : "color-mix(in oklab, currentColor 25%, transparent)"}
            strokeWidth={1.5 / zoom}
            strokeDasharray={`${6 / zoom} ${6 / zoom}`}
          />
        )
      })}
    </svg>
  )
}
