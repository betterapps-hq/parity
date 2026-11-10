import { DropdownMenuCheckboxItem, DropdownMenuItem } from "@buildkitgg/shadcn-baseui-kit"
import { Columns3, Rows3 } from "lucide-react"
import { type KeyboardEvent, type PointerEvent, type ReactNode, useRef, useState } from "react"
import { kindColors } from "../../canvas/kinds.tsx"
import { Hint } from "../../chrome/Hint.tsx"
import { PanelSection } from "../../chrome/PanelSection.tsx"
import { type SectionProps, SizeField, useMeasured } from "./controls.tsx"
import { clamp, tint } from "./css-values.ts"
import type { Draft, SelfAlign, Size, Span } from "./data.ts"
import {
  arrowMoves,
  drag,
  type Message,
  MessageLine,
  type Reading,
  type SharedLine,
  useTokenSets,
  ValueField
} from "./field-parts.tsx"
import { Field, Segments, TitleMenu } from "./field-row.tsx"
import { type Area, columnTracks, placeChildren, rowCount, trackOf, trackWeights } from "./layout-controls.tsx"
import { along, type Place, placeName, type PlaceSpot, SpotBox } from "./position-box.tsx"

/*
 * Grid placement (PAR-186): Size for a child of a grid, sharing the tracks and where the children sit with Layout
 * (layout-controls.tsx). The map is where it's placed: its lines numbered along its edges, the child moved by dragging
 * it, sized by dragging its edges, and drawn by dragging across cells. Auto and Manual say whether the grid places it
 * or the cells chosen do. W and H show Fill and Hug as chips, with Sizing always at their end. Under it, where it sits
 * in its cell is a box of spots, as Layout's is, beside Start and Span for each axis, lined up as a table; a field
 * hovered or focused lights up its line or tracks in the map. Fill and the spots agree, as they do in CSS: a grid child
 * that fills its cell is one that stretches.
 */

/** The layer's color, which the canvas draws the selected layer and its measurements in. */
const layerColor = kindColors.layer

/** A line or tracks a field points at, which the map lights up while it's hovered or focused. */
interface Pointing {
  axis: "col" | "row"
  part: "start" | "span" | "end"
}

/** A cell, by its column and row from 0. */
interface Cell {
  col: number
  row: number
}

const inArea = (area: Area, cell: Cell) =>
  cell.col >= area.col && cell.col < area.col + area.cols && cell.row >= area.row && cell.row < area.row + area.rows

/** A line as the map draws it, from 1: a negative one counts back from after the last track, `count + 1`. */
const lineAt = (line: number, count: number) => trackOf(line, count) + 1

/** A span as the draft keeps it: one, the default, unset. */
const spanOf = (count: number) => (count === 1 ? undefined : count)

/** Where it sits on an axis of its cell: at a place, or across the whole of it. */
type Sits = Place | "fill"

/** A grid child stretches unless it, or the grid, says otherwise, and only fills its cell where its size lets it. */
function sitsIn(draft: Draft, axis: "x" | "y"): Sits {
  const own = axis === "x" ? draft.justifySelf : draft.alignSelf
  const grid = axis === "x" ? draft.itemsX : draft.itemsY
  const size = axis === "x" ? draft.childWidth : draft.childHeight
  const value: SelfAlign = own ?? grid ?? "stretch"

  if (value === "stretch") {
    return (size ?? "fill") === "fill" ? "fill" : "start"
  }

  return value
}

/** Where flex puts a box at a place, or stretched across a fill. */
const flexPlace = { start: "flex-start", center: "center", end: "flex-end", fill: "stretch" } as const

/** Auto leaves it to the grid; Manual places it at the cells chosen, pinned where it is to start with. */
const placings = [
  { value: "auto", label: "Auto", detail: "In the grid's next free cell" },
  { value: "manual", label: "Manual", detail: "In the cells you choose" }
] as const

/** Every line unset, so the grid places it. */
const unsetPlace = { colStart: undefined, rowStart: undefined, colEnd: undefined, rowEnd: undefined }

/**
 * Size for a child of a grid, another take: W and H; its cells, as a map of the grid with its lines numbered, to drag
 * across, drag, or drag by an edge; then where it sits in its cell, as a box of spots, beside Start and Span for each
 * axis. Auto, in the map's header, leaves it to the grid's next free cell, and pressed again pins it where it is.
 */
export function GridCellSection({ draft, set }: SectionProps) {
  const spacing = useTokenSets().spacing
  const measured = useMeasured("[data-layer='Pro plan']")
  const columns = columnTracks(draft, spacing).length
  const children = placeChildren(draft, columns)
  const area = children.find((child) => child.name === "Pro plan")!.area
  const rows = Math.max(draft.rows?.length ?? 0, ...children.map((child) => child.area.row + child.area.rows)) + 1
  const endLines = draft.endLines ?? false
  const auto = draft.colStart === undefined && draft.rowStart === undefined && draft.colSpan !== "all"
  // What the table's fields say goes under the whole table, where it has room: each field's, by its label.
  const [messages, setMessages] = useState<Record<string, Message | undefined>>({})

  const lineFor = (label: string) => ({
    message: messages[label],
    onMessage: (message: Message | undefined) => setMessages((current) => ({ ...current, [label]: message }))
  })

  const [hoverPointing, setHoverPointing] = useState<Pointing>()
  const [focusPointing, setFocusPointing] = useState<Pointing>()
  const pointing = hoverPointing ?? focusPointing

  // Placed at an area: by its lines, or by its start and span, where All stays All while it still covers every column.
  const place = (to: Area) => {
    if (endLines) {
      set({ colStart: to.col + 1, colEnd: to.col + to.cols + 1, rowStart: to.row + 1, rowEnd: to.row + to.rows + 1 })

      return
    }

    const all = draft.colSpan === "all" && to.col === 0 && to.cols === columns

    set({
      colStart: all ? undefined : to.col + 1,
      colSpan: all ? "all" : spanOf(to.cols),
      rowStart: to.row + 1,
      rowSpan: spanOf(to.rows)
    })
  }

  // Automatic again: the grid's next free cell, keeping its span, All's as a count; End lines give way to a span.
  const toAuto = () =>
    set({
      ...unsetPlace,
      endLines: undefined,
      colSpan: spanOf(area.cols),
      rowSpan: spanOf(area.rows)
    })

  /*
   * Filling its cell is stretching, in a grid, so Fill is unset, as a grid child fills its cell unless told otherwise,
   * and takes back its stretch where the grid's children don't stretch.
   */
  const setSize = (axis: "x" | "y", size: Size) => {
    const grid = axis === "x" ? draft.itemsX : draft.itemsY
    const stretch = grid === undefined || grid === "stretch" ? undefined : ("stretch" as const)

    if (axis === "x") {
      set(size === "fill" ? { childWidth: undefined, justifySelf: stretch } : { childWidth: size })
    } else {
      set(size === "fill" ? { childHeight: undefined, alignSelf: stretch } : { childHeight: size })
    }
  }

  const point = (to: Pointing) => ({
    onPointerEnter: () => setHoverPointing(to),
    onPointerLeave: () => setHoverPointing(undefined),
    onFocus: () => setFocusPointing(to),
    onBlur: () => setFocusPointing(undefined)
  })

  const axisRow = (axis: "col" | "row") => {
    const across = axis === "col"
    const count = across ? columns : rowCount(draft)
    const start = across ? draft.colStart : draft.rowStart
    const span = across ? draft.colSpan : draft.rowSpan
    const end = across ? draft.colEnd : draft.rowEnd
    const at = across ? area.col : area.row
    const spanned = across ? area.cols : area.rows
    const all = span === "all"
    const name = across ? "Column" : "Row"
    const startKey = across ? "colStart" : "rowStart"
    const spanKey = across ? "colSpan" : "rowSpan"
    const endKey = across ? "colEnd" : "rowEnd"

    // A start typed while it spans All keeps it running to the last line.
    const setStart = (line: number | undefined) =>
      set(
        all && line !== undefined
          ? { [startKey]: line, [spanKey]: Math.max(1, count + 1 - lineAt(line, count)) }
          : { [startKey]: line }
      )

    return (
      <>
        <Hint label={across ? "Columns" : "Rows"}>
          <span className="grid size-5 place-items-center text-muted-foreground">
            {across ? <Columns3 className="size-3.5" /> : <Rows3 className="size-3.5" />}
          </span>
        </Hint>
        <div className="min-w-0" {...point({ axis, part: "start" })}>
          <LineField
            label={`${name} start line`}
            line={lineFor(`${name} start line`)}
            tracks={across ? "columns" : "rows"}
            value={all ? undefined : start}
            placeholder={all ? "1" : "Auto"}
            landsAt={at + 1}
            count={count}
            keyword={{ name: "Auto", detail: "The next free cell", value: undefined }}
            onChange={setStart}
          />
        </div>
        <div className="min-w-0" {...point({ axis, part: endLines ? "end" : "span" })}>
          {endLines ? (
            <LineField
              label={`${name} end line`}
              line={lineFor(`${name} end line`)}
              tracks={across ? "columns" : "rows"}
              value={end}
              placeholder="Auto"
              landsAt={at + spanned + 1}
              count={count}
              keyword={{ name: "Last line", detail: `-1, after the last ${name.toLowerCase()}`, value: -1 }}
              onChange={(line) => set({ [endKey]: line })}
            />
          ) : (
            <SpanField
              tracks={across ? "columns" : "rows"}
              line={lineFor(`${across ? "Columns" : "Rows"} spanned`)}
              value={span}
              count={count}
              onChange={(next) =>
                set(next === "all" ? { [spanKey]: next, [startKey]: undefined } : { [spanKey]: next })
              }
            />
          )}
        </div>
      </>
    )
  }

  return (
    <PanelSection
      title="Size"
      action={
        <TitleMenu label="More size options" menuClassName="w-52">
          <DropdownMenuCheckboxItem
            className="text-xs"
            checked={endLines}
            onCheckedChange={(on) =>
              set(
                on
                  ? {
                      endLines: true,
                      colStart: area.col + 1,
                      colEnd: area.col + area.cols + 1,
                      rowStart: area.row + 1,
                      rowEnd: area.row + area.rows + 1
                    }
                  : {
                      endLines: undefined,
                      colEnd: undefined,
                      rowEnd: undefined,
                      colSpan: spanOf(area.cols),
                      rowSpan: spanOf(area.rows)
                    }
              )
            }
          >
            End lines
          </DropdownMenuCheckboxItem>
          <DropdownMenuItem disabled className="justify-between text-xs">
            Area <span className="text-muted-foreground">None in this grid</span>
          </DropdownMenuItem>
        </TitleMenu>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 items-start gap-1 pr-1">
          <SizeField
            axis="Width"
            within="cell"
            value={draft.childWidth ?? (sitsIn(draft, "x") === "fill" ? "fill" : "hug")}
            measured={measured?.width}
            parent={measured?.parent}
            onChange={(size) => setSize("x", size)}
          />
          <SizeField
            axis="Height"
            within="cell"
            value={draft.childHeight ?? (sitsIn(draft, "y") === "fill" ? "fill" : "hug")}
            measured={measured?.height}
            parent={undefined}
            onChange={(size) => setSize("y", size)}
          />
        </div>
        <div className="flex flex-col gap-1">
          {/* How it's placed, as Penpot's Auto and Manual: Manual pins it where it is, which the map then moves. */}
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">Cells</span>
            <Segments
              label="How it's placed"
              fit
              value={auto ? "auto" : "manual"}
              options={placings}
              onChange={(next) => {
                if (next === "auto" && !auto) {
                  toAuto()
                } else if (next === "manual" && auto) {
                  place(area)
                }
              }}
            />
          </div>
          <CellMap
            draft={draft}
            columns={columns}
            rows={rows}
            area={area}
            auto={auto}
            pointing={pointing}
            onPlace={place}
            onAuto={toAuto}
          />
        </div>
        {/* Where it sits in its cell, beside where its cell is: the box lines up with the two rows of fields. */}
        <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3">
          <Field half label="In its cell">
            <CellBox draft={draft} set={set} />
          </Field>
          <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)] items-center gap-x-1 gap-y-1">
            <span />
            <span className="h-5 text-xs leading-5 text-muted-foreground">Start</span>
            <span className="h-5 text-xs leading-5 text-muted-foreground">{endLines ? "End" : "Span"}</span>
            {axisRow("col")}
            {axisRow("row")}
          </div>
        </div>
        {Object.entries(messages).map(([label, message]) => message && <MessageLine key={label} message={message} />)}
      </div>
    </PanelSection>
  )
}

/**
 * The grid as a map, its columns drawn to their sizes and its lines numbered along the top and down the side, the
 * child's own lines in the layer's color. The other children are faint where the browser puts them; the child is in
 * the layer's color, dashed while it's placed automatically. Dragging across cells places it there, spanning them;
 * dragging it moves it, and dragging an edge moves that line. A click on a cell moves it there, keeping its span, as
 * the faint outline under the pointer shows first. Arrow keys move it a cell; with Shift, they move its far edge.
 * Delete places it automatically again. A row under the last lets it go below. A field hovered or focused lights up
 * its line, or the tracks it spans.
 */
function CellMap({
  draft,
  columns,
  rows,
  area,
  auto,
  pointing,
  onPlace,
  onAuto
}: {
  draft: Draft
  columns: number
  rows: number
  area: Area
  auto: boolean
  pointing?: Pointing
  onPlace: (area: Area) => void
  onAuto: () => void
}) {
  const spacing = useTokenSets().spacing
  const weights = trackWeights(columnTracks(draft, spacing))
  const children = placeChildren(draft, columns)
  const cells = useRef<HTMLSpanElement>(null)
  const [dragged, setDragged] = useState<Area>()
  const [hovered, setHovered] = useState<Area>()
  const shown = dragged ?? area
  const sits = { x: sitsIn(draft, "x"), y: sitsIn(draft, "y") }

  // The cell under a point in the map, as fractions of it across and down: by the columns' widths, and equal rows.
  const cellAt = (x: number, y: number): Cell => {
    const total = weights.reduce((sum, weight) => sum + weight, 0)
    let edge = 0
    let col = columns - 1

    for (let index = 0; index < columns; index++) {
      edge += weights[index]! / total

      if (x < edge) {
        col = index
        break
      }
    }

    return { col, row: clamp(Math.floor(y * rows), 0, rows - 1) }
  }

  const cellOf = (event: PointerEvent<HTMLElement>): Cell => {
    const box = cells.current!.getBoundingClientRect()

    return cellAt(
      clamp((event.clientX - box.left) / box.width, 0, 0.999),
      clamp((event.clientY - box.top) / box.height, 0, 0.999)
    )
  }

  // Moved so its first cell is this one, keeping its span, as far as the columns go.
  const movedTo = (cell: Cell): Area => ({
    ...area,
    col: clamp(cell.col, 0, columns - area.cols),
    row: cell.row
  })

  // One edge moved to a cell, the other staying put.
  const resized = (edge: string, cell: Cell): Area => {
    const right = area.col + area.cols
    const bottom = area.row + area.rows

    if (edge === "right") {
      return { ...area, cols: clamp(cell.col - area.col + 1, 1, columns - area.col) }
    }

    if (edge === "left") {
      const col = Math.min(cell.col, right - 1)

      return { ...area, col, cols: right - col }
    }

    if (edge === "bottom") {
      return { ...area, rows: Math.max(1, cell.row - area.row + 1) }
    }

    const row = Math.min(cell.row, bottom - 1)

    return { ...area, row, rows: bottom - row }
  }

  const press = (event: PointerEvent<HTMLButtonElement>) => {
    const edge =
      event.target instanceof Element
        ? (event.target.closest("[data-edge]")?.getAttribute("data-edge") ?? undefined)
        : undefined

    const start = cellOf(event)
    const onIt = inArea(area, start)
    let away = false

    const areaTo = (cell: Cell): Area => {
      if (edge) {
        return resized(edge, cell)
      }

      // Dragged from the child, it moves; from anywhere else, it spans from there to here, or a click moves it there.
      if (onIt) {
        return {
          ...area,
          col: clamp(area.col + cell.col - start.col, 0, columns - area.cols),
          row: Math.max(0, area.row + cell.row - start.row)
        }
      }

      away ||= cell.col !== start.col || cell.row !== start.row

      if (!away) {
        return movedTo(start)
      }

      return {
        col: Math.min(start.col, cell.col),
        row: Math.min(start.row, cell.row),
        cols: Math.abs(cell.col - start.col) + 1,
        rows: Math.abs(cell.row - start.row) + 1
      }
    }

    setHovered(undefined)
    setDragged(areaTo(start))
    drag(event, {
      within: cells.current,
      move: (moved) => setDragged(areaTo(cellAt(Math.min(moved.x, 0.999), Math.min(moved.y, 0.999)))),
      end: (ended, cancelled) => {
        setDragged(undefined)

        if (!cancelled) {
          onPlace(areaTo(cellAt(Math.min(ended.x, 0.999), Math.min(ended.y, 0.999))))
        }
      }
    })
  }

  const hover = (event: PointerEvent<HTMLButtonElement>) => {
    if (dragged) {
      return
    }

    const cell = cellOf(event)
    setHovered(inArea(area, cell) ? undefined : movedTo(cell))
  }

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const move = arrowMoves.get(event.key)

    if (move) {
      event.preventDefault()

      if (event.shiftKey) {
        onPlace({
          ...area,
          cols: clamp(area.cols + move[0], 1, columns - area.col),
          rows: Math.max(1, area.rows + move[1])
        })
      } else {
        onPlace({
          ...area,
          col: clamp(area.col + move[0], 0, columns - area.cols),
          row: Math.max(0, area.row + move[1])
        })
      }
    } else if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault()
      onAuto()
    }
  }

  const describe = (of: Area) => {
    const range = (from: number, count: number, word: string) =>
      count === 1 ? `${word} ${from + 1}` : `${word}s ${from + 1} to ${from + count}`

    return `${range(of.col, of.cols, "column")}, ${range(of.row, of.rows, "row")}`
  }

  const template = {
    columns: weights.map((weight) => `${weight}fr`).join(" "),
    rows: `repeat(${rows}, 1.125rem)`
  }

  // The child's own lines, and the line a field points at, which its number shows in the layer's color.
  const ownLines = {
    col: [shown.col + 1, shown.col + shown.cols + 1],
    row: [shown.row + 1, shown.row + shown.rows + 1]
  }

  const number = (axis: "col" | "row", line: number, last: boolean) => {
    const own = ownLines[axis].includes(line)

    return (
      <span
        key={`${line}-${last ? "end" : "start"}`}
        className={`absolute text-[9px] leading-none tabular-nums ${own ? "font-semibold" : "text-muted-foreground/70"} ${
          axis === "col"
            ? `top-0 ${last ? "right-0 translate-x-1/2" : "left-0 -translate-x-1/2"}`
            : `right-1 ${last ? "bottom-0 translate-y-1/2" : "top-0 -translate-y-1/2"}`
        }`}
        style={own ? { color: layerColor } : undefined}
      >
        {line}
      </span>
    )
  }

  return (
    <Hint
      label="Its cells"
      detail={
        "Drag across cells to place it, or drag it or its edges. Click a cell to move it there.\nArrow keys move it; with Shift, they move its far edge. Delete places it automatically."
      }
      wait
    >
      <button
        type="button"
        aria-label={`Cells: ${describe(area)}${auto ? ", placed automatically" : ""}`}
        aria-roledescription="grid map"
        onPointerDown={press}
        onPointerMove={hover}
        onPointerLeave={() => setHovered(undefined)}
        onKeyDown={onKeyDown}
        className="group/map grid w-full touch-none grid-cols-[0.875rem_minmax(0,1fr)] grid-rows-[0.75rem_auto] rounded-md text-left outline-none select-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span aria-hidden />
        {/* The column lines, numbered where they fall, over the map's border and padding. */}
        <span
          aria-hidden
          className="grid gap-0.5 px-[3px]"
          style={{ gridTemplateColumns: template.columns, gridTemplateRows: "0.75rem" }}
        >
          {weights.map((_, col) => (
            <span key={col} className="relative">
              {number("col", col + 1, false)}
              {col === columns - 1 && number("col", columns + 1, true)}
            </span>
          ))}
        </span>
        <span aria-hidden className="grid gap-0.5 py-[3px]" style={{ gridTemplateRows: template.rows }}>
          {Array.from({ length: rows }, (_, row) => (
            <span key={row} className="relative">
              {number("row", row + 1, false)}
              {row === rows - 1 && number("row", rows + 1, true)}
            </span>
          ))}
        </span>
        <span
          ref={cells}
          className="grid cursor-crosshair gap-0.5 rounded-md border bg-muted/40 p-0.5"
          style={{ gridTemplateColumns: template.columns, gridTemplateRows: template.rows }}
        >
          {Array.from({ length: rows }, (_, row) =>
            weights.map((_, col) => (
              <span
                key={`${col}-${row}`}
                aria-hidden
                className={`rounded-sm ${row === rows - 1 ? "border border-dashed border-border" : "bg-background/60"}`}
                style={{ gridColumn: col + 1, gridRow: row + 1 }}
              />
            ))
          )}
          {children
            .filter((child) => child.name !== "Pro plan")
            .map((child) => (
              <span
                key={child.name}
                aria-hidden
                className="flex min-w-0 items-center rounded-sm bg-muted-foreground/25 px-1 text-2xs text-muted-foreground"
                style={{
                  gridColumn: `${child.area.col + 1} / span ${child.area.cols}`,
                  gridRow: `${child.area.row + 1} / span ${child.area.rows}`
                }}
              >
                <span className="truncate">{child.name}</span>
              </span>
            ))}
          {pointing && <Pointed pointing={pointing} area={area} columns={columns} rows={rows} draft={draft} />}
          {hovered && (
            <span
              aria-hidden
              className="pointer-events-none rounded-sm border border-dashed"
              style={{
                gridColumn: `${hovered.col + 1} / span ${hovered.cols}`,
                gridRow: `${hovered.row + 1} / span ${hovered.rows}`,
                borderColor: tint(layerColor, 70)
              }}
            />
          )}
          {/* Its cells, with it drawn where it sits in them: filling them, or hugging a place, its cells outlined. */}
          <span
            aria-hidden
            className="relative flex min-w-0 cursor-grab rounded-sm"
            style={{
              gridColumn: `${shown.col + 1} / span ${shown.cols}`,
              gridRow: `${shown.row + 1} / span ${shown.rows}`,
              justifyContent: flexPlace[sits.x],
              alignItems: flexPlace[sits.y],
              outline: sits.x === "fill" && sits.y === "fill" ? undefined : `1px solid ${tint(layerColor, 45)}`
            }}
          >
            <span
              className={`flex min-w-0 items-center rounded-sm border px-1 text-2xs leading-none font-medium text-foreground ${auto && !dragged ? "border-dashed" : ""} ${sits.x === "fill" ? "flex-1" : ""} ${sits.y === "fill" ? "" : "h-3.5"}`}
              style={{ borderColor: layerColor, background: tint(layerColor, dragged ? 45 : 30) }}
            >
              <span className="truncate">Pro plan</span>
            </span>
            {(["left", "right", "top", "bottom"] as const).map((edge) => (
              <Edge key={edge} edge={edge} />
            ))}
          </span>
        </span>
      </button>
    </Hint>
  )
}

/** An edge of the child in the map, to drag: a grip on it in the layer's color, shown while the map's hovered. */
function Edge({ edge }: { edge: "left" | "right" | "top" | "bottom" }) {
  const across = edge === "left" || edge === "right"

  const place = {
    left: "inset-y-0 -left-1 w-2 cursor-ew-resize",
    right: "inset-y-0 -right-1 w-2 cursor-ew-resize",
    top: "inset-x-0 -top-1 h-2 cursor-ns-resize",
    bottom: "inset-x-0 -bottom-1 h-2 cursor-ns-resize"
  }[edge]

  return (
    <span data-edge={edge} className={`absolute z-10 grid place-items-center ${place}`}>
      <span
        className={`rounded-full opacity-0 transition-opacity group-hover/map:opacity-100 ${across ? "h-2.5 w-1" : "h-1 w-3"}`}
        style={{ background: layerColor }}
      />
    </span>
  )
}

/**
 * What a hovered or focused field points at, in the map: Start's line or End's, as a line in the layer's color, or
 * the tracks Span covers, tinted.
 */
function Pointed({
  pointing,
  area,
  columns,
  rows,
  draft
}: {
  pointing: Pointing
  area: Area
  columns: number
  rows: number
  draft: Draft
}) {
  const across = pointing.axis === "col"
  // Rows have no count until they're set, so a negative row line counts from the rows there are, or one.
  const count = across ? columns : rowCount(draft)

  if (pointing.part === "span") {
    const from = across ? area.col : area.row
    const spanned = across ? area.cols : area.rows

    return (
      <span
        aria-hidden
        className="pointer-events-none rounded-sm"
        style={{
          gridColumn: across ? `${from + 1} / span ${spanned}` : "1 / -1",
          gridRow: across ? "1 / -1" : `${from + 1} / span ${spanned}`,
          background: tint(layerColor, 14)
        }}
      />
    )
  }

  const starts = pointing.part === "start"
  const lines = across ? { start: draft.colStart, end: draft.colEnd } : { start: draft.rowStart, end: draft.rowEnd }
  const set = starts ? lines.start : lines.end
  const from = across ? area.col : area.row
  const spanned = across ? area.cols : area.rows
  // Unset, it's the line it's on now.
  const line = set === undefined ? from + (starts ? 0 : spanned) + 1 : lineAt(set, count)
  // The last line is the far edge of the last track; any other is the near edge of the track it starts.
  const tracks = across ? columns : rows
  const last = line > tracks
  const track = clamp(last ? line - 1 : line, 1, tracks)
  // Drawn on the track's near edge, or the last track's far one, over the gap.
  const side = { col: last ? "Right" : "Left", row: last ? "Bottom" : "Top" }[pointing.axis]

  return (
    <span
      aria-hidden
      className="pointer-events-none"
      style={{
        gridColumn: across ? `${track} / span 1` : "1 / -1",
        gridRow: across ? "1 / -1" : `${track} / span 1`,
        [`margin${side}`]: "-2px",
        [`border${side}`]: `2px solid ${layerColor}`
      }}
    />
  )
}

/**
 * A line field, Start or End: a line number from 1, or from the end when negative, -1 being after the last track.
 * Unset, it says Auto, with the line it lands on now faintly after; a negative line shows the line it comes to. Its
 * menu has one word: Auto for Start, Last line (-1) for End.
 */
function LineField({
  label,
  line,
  tracks,
  value,
  placeholder,
  landsAt,
  count,
  keyword,
  onChange
}: {
  label: string
  /** The line its messages go to, under the table. */
  line: SharedLine
  tracks: "columns" | "rows"
  value: number | undefined
  placeholder: string
  /** The line it's on now, which unset shows faintly. */
  landsAt: number
  /** The tracks there are, which a negative line counts back from. */
  count: number
  keyword: { name: string; detail: string; value: number | undefined }
  onChange: (line: number | undefined) => void
}) {
  const read = (text: string): Reading<number | undefined> => {
    const typed = text.trim().toLowerCase()

    if (typed === "" || typed === "auto") {
      return { value: undefined }
    }

    const number = Number(typed)

    if (Number.isInteger(number) && number !== 0 && Math.abs(number) <= 99) {
      return { value: number }
    }

    return { reason: "Enter a line number, such as 2, or -1 for after the last" }
  }

  // Line 0 doesn't exist, so stepping goes from 1 straight to -1.
  const step = (up: boolean) => {
    const by = up ? 1 : -1
    const next = (value ?? landsAt) + by

    onChange(next === 0 ? by : next)
  }

  let comesTo: string | undefined

  if (value === undefined && placeholder === "Auto") {
    comesTo = String(landsAt)
  } else if (value !== undefined && value < 0) {
    comesTo = String(lineAt(value, count))
  }

  return (
    <ValueField
      label={label}
      shown={value === undefined ? undefined : String(value)}
      placeholder={placeholder}
      comesTo={comesTo}
      tokens={{
        list: [],
        keywords: {
          heading: "Line",
          rows: [
            {
              key: keyword.name,
              name: keyword.name,
              detail: keyword.detail,
              current: value === keyword.value,
              onPick: () => onChange(keyword.value)
            }
          ]
        },
        onPick: () => undefined
      }}
      hint={{ detail: `A negative line counts back from the end: -1 is after the last of the ${tracks}` }}
      line={line}
      read={read}
      onCommit={onChange}
      onStep={step}
    />
  )
}

/**
 * Span: how many tracks it covers, 1 unset, or All, a chip, for every one, from the first line to the last
 * (`col-span-full`). Backspace on All leaves the count it came to.
 */
function SpanField({
  tracks,
  line,
  value,
  count,
  onChange
}: {
  tracks: "columns" | "rows"
  /** The line its messages go to, under the table. */
  line: SharedLine
  value: Span | undefined
  count: number
  onChange: (span: Span | undefined) => void
}) {
  const all = value === "all"
  const one = tracks === "columns" ? "column" : "row"
  const spanned = all ? count : (value ?? 1)
  const toSpan = (number: number) => (number <= 1 ? undefined : number)
  let shown = value === undefined ? undefined : String(value)

  if (all) {
    shown = "All"
  }

  const read = (text: string): Reading<Span | undefined> => {
    const typed = text.trim().toLowerCase()

    // Left empty, as Backspace on the chip leaves it, it keeps what it spans.
    if (typed === "") {
      return { value: all ? count : value }
    }

    if (typed === "all" || typed === "full") {
      return { value: "all" }
    }

    const number = Number(typed)

    if (Number.isInteger(number) && number >= 1 && number <= 99) {
      return { value: toSpan(number) }
    }

    return { reason: `Enter a whole number of ${tracks}, or All` }
  }

  return (
    <ValueField
      label={`${tracks[0]!.toUpperCase()}${tracks.slice(1)} spanned`}
      shown={shown}
      placeholder="1"
      chip={
        all
          ? {
              name: "All",
              keyword: { detail: String(count), about: `Every ${one}, from the first line to the last` },
              onRemove: () => onChange(toSpan(count))
            }
          : undefined
      }
      tokens={{
        list: [],
        keywords: {
          heading: "Span",
          rows: [{ key: "all", name: "All", detail: `Every ${one}`, current: all, onPick: () => onChange("all") }]
        },
        onPick: () => undefined
      }}
      line={line}
      read={read}
      onCommit={onChange}
      onStep={(up) => onChange(toSpan(Math.max(1, spanned + (up ? 1 : -1))))}
    />
  )
}

/**
 * In its cell: a box of three spots across and three down, with the child drawn where it sits in its cell, dashed while
 * it follows the grid. Clicking a spot puts it there, which on an axis it fills makes it hug, as CSS does; clicking
 * the chosen spot again stretches it, filling the cell. Hovering a spot shows it there faintly first. It's one stop for
 * Tab, as Layout's box is: arrow keys move it, and S stretches it.
 */
function CellBox({ draft, set }: Pick<SectionProps, "draft" | "set">) {
  const follows = draft.justifySelf === undefined && draft.alignSelf === undefined
  const now = { x: sitsIn(draft, "x"), y: sitsIn(draft, "y") }
  const anchor = { x: now.x === "fill" ? "center" : now.x, y: now.y === "fill" ? "center" : now.y } as const
  const covers = (spot: PlaceSpot) => (now.x === "fill" || now.x === spot.x) && (now.y === "fill" || now.y === spot.y)

  const stretch = () => {
    const back = (grid: SelfAlign | undefined) => (grid === undefined || grid === "stretch" ? undefined : "stretch")

    set({
      justifySelf: back(draft.itemsX),
      alignSelf: back(draft.itemsY),
      childWidth: draft.childWidth === "hug" ? undefined : draft.childWidth,
      childHeight: draft.childHeight === "hug" ? undefined : draft.childHeight
    })
  }

  // At a spot, it hugs on an axis it filled, since filling a cell is stretching across it.
  const choose = (spot: PlaceSpot) =>
    set({
      justifySelf: spot.x,
      alignSelf: spot.y,
      childWidth: (draft.childWidth ?? "fill") === "fill" ? "hug" : draft.childWidth,
      childHeight: (draft.childHeight ?? "fill") === "fill" ? "hug" : draft.childHeight
    })

  const drawn = (where: { x: Sits; y: Sits }, ghost: boolean): ReactNode => {
    const width = where.x === "fill" ? 44 : 20
    const height = where.y === "fill" ? 44 : 20
    const dashed = follows && !ghost

    return (
      <rect
        x={where.x === "fill" ? 8 : along(where.x, width, 8, 52)}
        y={where.y === "fill" ? 8 : along(where.y, height, 8, 52)}
        width={width}
        height={height}
        rx="2"
        fill={ghost ? "currentColor" : tint(layerColor, dashed ? 30 : 100)}
        fillOpacity={ghost ? 0.3 : 1}
        stroke={ghost ? "none" : layerColor}
        strokeDasharray={dashed ? "3 2" : undefined}
        className="text-muted-foreground"
      />
    )
  }

  // The cell's edge, faint, and the child in it, and faintly where the spot hovered would put it.
  const drawing = (hovered: PlaceSpot | undefined) => (
    <>
      <rect
        x="4"
        y="4"
        width="52"
        height="52"
        rx="3"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeDasharray="2 2"
        className="text-muted-foreground"
      />
      {hovered && !covers(hovered) && drawn(hovered, true)}
      {drawn(now, false)}
    </>
  )

  return (
    <SpotBox
      label="Where it sits in its cell"
      hint={{
        label: "Where it sits in its cell",
        detail: "Arrow keys move it. S stretches it.\nClick the chosen spot again to stretch it."
      }}
      anchor={anchor}
      covers={covers}
      spotLabel={(spot) => (follows ? `${placeName(spot)}, from the grid` : placeName(spot))}
      className="size-[60px]"
      drawing={drawing}
      keys={new Map([["s", stretch]])}
      onMove={choose}
      onSpot={(spot, { covered, anchor: isAnchor }) =>
        isAnchor && covered && now.x !== "fill" && now.y !== "fill" ? stretch() : choose(spot)
      }
    />
  )
}
