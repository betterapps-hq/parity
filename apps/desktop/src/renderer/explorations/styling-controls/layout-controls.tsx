import {
  Button,
  DropdownMenuCheckboxItem,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Toggle
} from "@buildkitgg/shadcn-baseui-kit"
import {
  ArrowDown,
  ArrowDownUp,
  ArrowRight,
  ArrowRightLeft,
  Columns3,
  CornerDownLeft,
  GripVertical,
  LayoutGrid,
  Plus,
  Rows3
} from "lucide-react"
import { type KeyboardEvent, type ReactNode, type RefObject, useLayoutEffect, useRef, useState } from "react"
import { kindColors } from "../../canvas/kinds.tsx"
import { PanelSelectContent } from "../../chrome/fields.tsx"
import { Hint } from "../../chrome/Hint.tsx"
import { PanelSection } from "../../chrome/PanelSection.tsx"
import { Num, type SectionProps } from "./controls.tsx"
import { clamp, formatNumber, remPx, sameValue, stepCount, tint } from "./css-values.ts"
import {
  type Columns,
  contentSizeWords,
  type Draft,
  type SelfAlign,
  type Span,
  type Track,
  typedContentSizes
} from "./data.ts"
import { arrowMoves, type Reading, useTokenSets, ValueField } from "./field-parts.tsx"
import { EachToggle, Field, IconSegments, nameMenuButton, TitleMenu } from "./field-row.tsx"
import { useHighlight } from "./highlight.tsx"
import { moved, RemoveButton, useOrderKeys } from "./list-parts.tsx"
import { type Side, sideNumber, sideRules } from "./sides-writes.ts"
import { SideField } from "./sides.tsx"
import { useSortable } from "./sortable.ts"
import type { LengthToken } from "./tokens.ts"

/*
 * Layout and grid tracks (PAR-186), redesigned after Figma's, Webflow's, Framer's and Penpot's panels. The alignment
 * box draws the children as they'll sit and takes the keyboard; gap sits beside it and spreads the children with Auto;
 * and a grid's tracks are a strip drawn to their sizes. A grid child's place, which shares the tracks and where the
 * children sit, is in grid-cell.tsx.
 */

/** Plans' width inside its padding, which the strip and the map size Fill tracks against. */
const contentWidth = 480

/** A Hug, Min or Max track's width, as the strip draws it; the content decides it on the canvas. */
const contentTrack = 80

const fr = (value: number): Track => ({ kind: "fr", value })

type Place = "start" | "center" | "end"

const places: Place[] = ["start", "center", "end"]

const isBaseline = (align: Draft["align"]) => align === "baseline" || align === "last baseline"

/* Layout */

/** The layout's type, as Type offers it: Figma's four, a wrapping row being one of them. */
type LayoutMode = "column" | "row" | "wrap" | "grid"

const layoutTypes = [
  { value: "column", label: "Vertical", detail: "Children stack top to bottom", icon: <ArrowDown /> },
  { value: "row", label: "Horizontal", detail: "Children sit side by side, left to right", icon: <ArrowRight /> },
  {
    value: "wrap",
    label: "Wrap",
    detail: "Children sit side by side, and run onto new lines when they run out of room",
    icon: <CornerDownLeft />
  },
  { value: "grid", label: "Grid", detail: "Children fill the cells of columns and rows", icon: <LayoutGrid /> }
] as const

/** A More menu item's name, with what it does under it. */
function MenuItemText({ name, detail }: { name: string; detail: string }) {
  return (
    <span className="flex flex-col">
      {name}
      <span className="text-2xs text-muted-foreground">{detail}</span>
    </span>
  )
}

/**
 * Layout: the alignment box, with what runs beside it: Type, as Figma's four (Vertical, Horizontal, Wrap and Grid),
 * with Reverse direction beside them; Gap; and once it wraps, the gap between the lines and where the lines sit. The
 * box is as tall as Type and Gap together, so it lines up with both. A grid swaps the box's meaning to where children
 * sit in their cells, and adds its columns and rows under them. More holds what's set rarely: wrapping a vertical
 * layout into columns, and lining up text on its baseline. Switching Type keeps the grid's tracks, so going back to
 * Grid finds them as they were.
 */
export function LayoutSection({ draft, set }: SectionProps) {
  const spacing = useTokenSets().spacing
  const grid = draft.columns !== undefined
  const direction = draft.direction ?? "column"
  const row = !grid && direction === "row"
  const wraps = !grid && (draft.wrap ?? false)
  const baseline = isBaseline(draft.align)
  let mode: LayoutMode = grid ? "grid" : direction

  if (row && wraps) {
    mode = "wrap"
  }

  // The grid's tracks while the layout is a flex box, so switching back to Grid doesn't lose them.
  const [kept, setKept] = useState<{ columns: Columns; rows: Track[] }>()
  // The gap before it went Auto, which turning Auto off brings back.
  const [gapBeforeAuto, setGapBeforeAuto] = useState<Side>()
  const fixedGap = undefinedIfAuto(draft.gap)
  const gapNumber = sideNumber(fixedGap, spacing)
  // A negative gap is a margin on each child, which wrapped lines would break, so wrapping takes it to 0.
  const wrappedGap = gapNumber !== undefined && gapNumber < 0 ? { number: 0 } : draft.gap

  const setGap = (gap: Side, distribute?: Draft["distribute"]) => {
    if (gap === "auto" && fixedGap !== undefined) {
      setGapBeforeAuto(fixedGap)
    }

    set({ gap, distribute })
  }

  const spread = (on: boolean, also: Partial<Draft> = {}) => {
    if (!on) {
      set({ ...also, gap: gapBeforeAuto, distribute: undefined })

      return
    }

    if (fixedGap !== undefined) {
      setGapBeforeAuto(fixedGap)
    }

    set({ ...also, gap: "auto" })
  }

  const beside = useRef<HTMLDivElement>(null)
  const typeRow = useRef<HTMLDivElement>(null)
  const gapRows = useRef<HTMLDivElement>(null)
  const boxSize = useSpan(beside, typeRow, gapRows)

  const toMode = (next: LayoutMode) => {
    if (next === "grid") {
      set({ columns: kept?.columns ?? [fr(1), fr(1), fr(1)], rows: kept?.rows ?? [], gap: fixedGap })

      return
    }

    if (grid) {
      setKept({ columns: draft.columns!, rows: draft.rows ?? [] })
    }

    const wrap = next === "wrap"

    set({
      direction: next === "column" ? "column" : "row",
      wrap: wrap || undefined,
      gap: wrap ? wrappedGap : draft.gap,
      columns: undefined,
      rows: undefined
    })
  }

  const more = grid ? (
    <DropdownMenuCheckboxItem
      checked={draft.dense ?? false}
      onCheckedChange={(dense) => set({ dense: dense || undefined })}
    >
      <MenuItemText
        name="Fill gaps"
        detail="Later children fill earlier empty cells, so the order seen can differ from the reading order"
      />
    </DropdownMenuCheckboxItem>
  ) : (
    <>
      {direction === "column" && (
        <DropdownMenuCheckboxItem
          checked={wraps}
          onCheckedChange={(wrap) => set({ wrap: wrap || undefined, gap: wrap ? wrappedGap : draft.gap })}
        >
          <MenuItemText name="Wrap into columns" detail="Children run into a new column when they run out of room" />
        </DropdownMenuCheckboxItem>
      )}
      {/* Baseline lines up text across a row, so a vertical layout offers it only to turn it off. */}
      {(row || baseline) && (
        <>
          <DropdownMenuCheckboxItem
            checked={baseline}
            onCheckedChange={(on) => set({ align: on ? "baseline" : undefined })}
          >
            <MenuItemText
              name="Line up text baselines"
              detail={
                row
                  ? "Lines up the text in each child, whatever its size"
                  : "Does nothing in a vertical layout, where the children don't share a line"
              }
            />
          </DropdownMenuCheckboxItem>
          {baseline && row && (
            <DropdownMenuCheckboxItem
              checked={draft.align === "last baseline"}
              onCheckedChange={(last) => set({ align: last ? "last baseline" : "baseline" })}
            >
              <MenuItemText name="By the last line" detail="Lines up each child's last line of text, not its first" />
            </DropdownMenuCheckboxItem>
          )}
        </>
      )}
    </>
  )

  return (
    <PanelSection title="Layout" action={<TitleMenu label="More layout options">{more}</TitleMenu>}>
      <div className="flex flex-col gap-2.5">
        <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3">
          <Field half label={grid ? "In cells" : "Alignment"}>
            <LayoutBox draft={draft} set={set} onSpread={spread} size={boxSize} />
          </Field>
          {/* Beside where the children sit: how they run, what spaces them, and once they wrap, where the lines go. */}
          <div ref={beside} className="flex min-w-0 flex-col gap-2.5">
            <Field half label="Type">
              <div ref={typeRow} className="flex items-center gap-1.5">
                <IconSegments label="Type" value={mode} options={layoutTypes} onChange={toMode} />
                {/* A grid places its children by cell, so it has no direction to reverse. */}
                {!grid && (
                  <Hint
                    label="Reverse direction"
                    detail="Lays the children out last to first, so the reading order no longer matches what's seen"
                  >
                    <Toggle
                      variant="outline"
                      size="sm"
                      className="h-7 px-2"
                      aria-label="Reverse direction"
                      pressed={draft.reverse ?? false}
                      onPressedChange={(reverse) => set({ reverse: reverse || undefined })}
                    >
                      {row ? <ArrowRightLeft /> : <ArrowDownUp />}
                    </Toggle>
                  </Hint>
                )}
              </div>
            </Field>
            <Field half label="Gap">
              <GapHighlight rows={gapRows}>
                <GapField
                  label={gapName(grid, row, wraps)}
                  across={grid || row}
                  value={draft.gap}
                  // Auto spreads a flex layout's children; a grid's tracks share the room themselves.
                  takesAuto={!grid}
                  // A negative gap is a margin on each child, which wrapped lines would break.
                  takesNegative={!grid && !wraps}
                  distribute={draft.distribute}
                  onChange={setGap}
                  onFixed={() => spread(false)}
                />
                {(grid || wraps) && (
                  <GapField
                    label={grid || row ? "Gap between rows" : "Gap between columns"}
                    across={!(grid || row)}
                    value={draft.rowGap}
                    placeholder={formatNumber(Math.max(0, gapNumber ?? 0))}
                    onChange={(rowGap) => set({ rowGap: undefinedIfAuto(rowGap) })}
                  />
                )}
              </GapHighlight>
            </Field>
            {wraps && (
              <Field half label="Lines" hint="Where the wrapped lines sit when there's room left over">
                <Select
                  items={lineItems}
                  value={draft.lines ?? "start"}
                  onValueChange={(next) => {
                    const chosen = lineItems.find((item) => item.value === next)?.value

                    if (chosen) {
                      set({ lines: chosen === "start" ? undefined : chosen })
                    }
                  }}
                >
                  <SelectTrigger size="sm" aria-label="Lines" className="h-7 w-full text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <PanelSelectContent>
                    {lineItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </PanelSelectContent>
                </Select>
              </Field>
            )}
          </div>
        </div>
        {/* The tracks are the grid's own, so a little more room sets them apart from where children sit. */}
        {grid && (
          <div className="mt-2 flex flex-col gap-2.5">
            <TracksField one="column" draft={draft} set={set} />
            <TracksField one="row" draft={draft} set={set} />
          </div>
        )}
      </div>
    </PanelSection>
  )
}

/** Where wrapped lines sit, as Lines offers it, in `align-content`'s order. */
const lineItems = [
  { value: "start", label: "Start" },
  { value: "center", label: "Center" },
  { value: "end", label: "End" },
  { value: "between", label: "Space between" },
  { value: "stretch", label: "Stretch" }
] as const

/** The first gap's name: just Gap, until there's a second, between rows or columns. */
function gapName(grid: boolean, row: boolean, wraps: boolean) {
  if (!grid && !wraps) {
    return "Gap"
  }

  return grid || row ? "Gap between columns" : "Gap between rows"
}

/** Gap's fields, which highlight the gaps on the canvas while they're hovered or focused, as Penpot's do. */
function GapHighlight({ rows, children }: { rows?: RefObject<HTMLDivElement | null>; children: ReactNode }) {
  const { setHighlight } = useHighlight()

  return (
    // The fields inside take the focus; this only listens, so the gaps stay lit while either is in use.
    <div
      ref={rows}
      className="flex flex-col gap-1"
      onPointerEnter={() => setHighlight({ kind: "gap" })}
      onPointerLeave={() => setHighlight(undefined)}
      onFocus={() => setHighlight({ kind: "gap" })}
      onBlur={() => setHighlight(undefined)}
    >
      {children}
    </div>
  )
}

const undefinedIfAuto = (gap: Side) => (gap === "auto" ? undefined : gap)

/**
 * How far it is from the top of one row to the bottom of the first field in another, kept as the column they're in
 * resizes: the alignment box's size, so it runs from Type's top to Gap's bottom, square.
 */
function useSpan(
  column: RefObject<HTMLElement | null>,
  top: RefObject<HTMLElement | null>,
  bottom: RefObject<HTMLElement | null>
) {
  const [span, setSpan] = useState<number>()

  useLayoutEffect(() => {
    const within = column.current

    if (!within) {
      return
    }

    const measure = () => {
      const from = top.current?.getBoundingClientRect().top
      const to = bottom.current?.firstElementChild?.getBoundingClientRect().bottom

      setSpan(from === undefined || to === undefined ? undefined : Math.round(to - from))
    }

    const observer = new ResizeObserver(measure)
    observer.observe(within)
    measure()

    return () => observer.disconnect()
  }, [column, top, bottom])

  return span
}

/* The alignment box */

/** A spot in the box, by its place across (x) and down (y). */
interface BoxSpot {
  x: Place
  y: Place
}

/**
 * Where the box's children sit, physically: a place across and down, or `spread` along the main axis (an Auto gap)
 * and `fill` across it (stretched, or on the baseline).
 */
interface Arrangement {
  x: Place | "spread" | "fill"
  y: Place | "spread" | "fill"
}

/** What a flex layout's or a grid's alignment comes to in the box, physically. */
function arrangementOf(draft: Draft): Arrangement {
  if (draft.columns !== undefined) {
    const axis = (value: SelfAlign | undefined) => (value === undefined || value === "stretch" ? "fill" : value)

    return { x: axis(draft.itemsX), y: axis(draft.itemsY) }
  }

  const column = (draft.direction ?? "column") === "column"
  const main: Arrangement["x"] = draft.gap === "auto" ? "spread" : (draft.justify ?? "start")
  const align = draft.align ?? "stretch"
  const cross: Arrangement["x"] = align === "stretch" || isBaseline(align) ? "fill" : align

  return column ? { x: cross, y: main } : { x: main, y: cross }
}

/** Whether a spot shows the children: on their place, or anywhere along an axis they fill or spread across. */
const covers = (arrangement: Arrangement, spot: BoxSpot) =>
  (arrangement.x === spot.x || arrangement.x === "fill" || arrangement.x === "spread") &&
  (arrangement.y === spot.y || arrangement.y === "fill" || arrangement.y === "spread")

/** The spot the keyboard starts from: the children's own, or the middle of an axis they fill or spread across. */
const anchorOf = (arrangement: Arrangement): BoxSpot => ({
  x: arrangement.x === "fill" || arrangement.x === "spread" ? "center" : arrangement.x,
  y: arrangement.y === "fill" || arrangement.y === "spread" ? "center" : arrangement.y
})

const spotWords = {
  x: { start: "left", center: "center", end: "right" },
  y: { start: "top", center: "middle", end: "bottom" }
}

const spotName = (spot: BoxSpot) => {
  if (spot.x === "center" && spot.y === "center") {
    return "Center"
  }

  const name = `${spotWords.y[spot.y]} ${spotWords.x[spot.x]}`.replace("middle ", "").replace(" center", "")

  return name[0]!.toUpperCase() + name.slice(1)
}

/**
 * The alignment box: three spots across and three down, with the children drawn where they'll sit, as bars that run
 * the way the layout does, in the layer's color. Hovering a spot shows them there, faintly, before it's chosen.
 * Stretched children fill the box across; an Auto gap spreads them along it. Clicking the children cycles how they
 * fill it: stretched across, then spread out along it, then packed again at the spot clicked; hovering them shows the
 * next, faintly. On the baseline, it cycles spread out and packed. In a grid it's where each child sits in its cell,
 * drawn in four cells, and clicking the chosen spot again stretches them.
 *
 * It's one stop for Tab, as Figma's is: arrow keys move the children, X spreads them out (an Auto gap), S stretches
 * them, and B lines up their text in a row.
 */
export function LayoutBox({
  draft,
  set,
  onSpread,
  size
}: Pick<SectionProps, "draft" | "set"> & {
  /** Spreads the children out with an Auto gap, or puts the gap back, with what else changes with it. */
  onSpread: (on: boolean, also?: Partial<Draft>) => void
  /** Its width and height, to line up with the rows beside it; 80px until they're measured. */
  size?: number
}) {
  const grid = draft.columns !== undefined
  const column = !grid && (draft.direction ?? "column") === "column"
  const arrangement = arrangementOf(draft)
  const anchor = anchorOf(arrangement)
  const [hovered, setHovered] = useState<BoxSpot>()
  const box = useRef<HTMLFieldSetElement>(null)

  const choose = (spot: BoxSpot, again: boolean) => {
    if (grid) {
      // Again on the chosen spot stretches them both ways, as unset does.
      set(again ? { itemsX: undefined, itemsY: undefined } : { itemsX: spot.x, itemsY: spot.y })

      return
    }

    const main = column ? spot.y : spot.x
    const cross = column ? spot.x : spot.y

    if (isBaseline(draft.align)) {
      set({ justify: main })

      return
    }

    set({ justify: main, align: again ? undefined : cross })
  }

  // What clicking the children at a spot does next: stretched, then spread out, then packed at that spot.
  const nextFill = (spot: BoxSpot): NextFill => {
    const main = column ? spot.y : spot.x
    const cross = column ? spot.x : spot.y
    const spreadOut = draft.gap === "auto"

    if (isBaseline(draft.align)) {
      return spreadOut ? { spread: false, change: { justify: main } } : { spread: true, change: {} }
    }

    if (spreadOut) {
      return { spread: false, change: { justify: main, align: cross } }
    }

    if (draft.align === undefined || draft.align === "stretch") {
      return { spread: true, change: { align: cross } }
    }

    return { change: { align: undefined } }
  }

  const fill = (spot: BoxSpot) => {
    const { spread, change } = nextFill(spot)

    if (spread === undefined) {
      set(change)
    } else {
      onSpread(spread, change)
    }
  }

  // The children as the next click on them leaves them, for the hover preview.
  const filledNext = (spot: BoxSpot) => {
    const { spread, change } = nextFill(spot)
    let gap = draft.gap

    if (spread !== undefined) {
      gap = spread ? "auto" : undefined
    }

    return arrangementOf({ ...draft, ...change, gap })
  }

  const focusSpot = (spot: BoxSpot) =>
    box.current?.querySelector<HTMLButtonElement>(`[data-spot="${spot.x}-${spot.y}"]`)?.focus()

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const move = arrowMoves.get(event.key)

    if (move) {
      event.preventDefault()

      const next = {
        x: places[clamp(places.indexOf(anchor.x) + move[0], 0, 2)]!,
        y: places[clamp(places.indexOf(anchor.y) + move[1], 0, 2)]!
      }

      choose(next, false)
      focusSpot(next)

      return
    }

    const key = event.key.toLowerCase()

    if (key === "s") {
      event.preventDefault()
      set(grid ? { itemsX: undefined, itemsY: undefined } : { align: undefined })
    } else if (key === "x" && !grid) {
      event.preventDefault()
      onSpread(draft.gap !== "auto")
    } else if (key === "b" && !grid && !column) {
      event.preventDefault()
      set({ align: isBaseline(draft.align) ? undefined : "baseline" })
    }
  }

  const baseline = !grid && !column && isBaseline(draft.align)
  let keys = "Arrow keys move them. S stretches them."
  let clicks = "Click the chosen spot again to stretch them."

  if (!grid) {
    keys += column ? " X spreads them out." : " X spreads them out. B lines up their text."
    clicks = baseline
      ? "Clicking the children spreads them out, then packs them again."
      : "Clicking the children stretches them, then spreads them out, then packs them again."
  }

  let ghost: Arrangement | undefined

  if (hovered && !covers(arrangement, hovered)) {
    ghost = previewOf(arrangement, hovered, grid, column)
  } else if (hovered && !grid) {
    ghost = filledNext(hovered)
  }

  return (
    <Hint
      label={grid ? "Where each child sits in its cell" : "Where the children sit"}
      detail={`${baseline ? "Their text is lined up on its baseline, set in More.\n" : ""}${keys}\n${clicks}`}
      wait
    >
      <fieldset
        ref={box}
        aria-label={grid ? "Where each child sits in its cell" : "Alignment"}
        onPointerLeave={() => setHovered(undefined)}
        style={size === undefined ? undefined : { width: size, height: size }}
        className="group/box relative grid size-20 shrink-0 grid-cols-3 grid-rows-3 rounded-md border bg-muted/40 p-0.5"
      >
        <svg aria-hidden viewBox="0 0 60 60" className="pointer-events-none absolute inset-0 size-full">
          {grid && <GridCells />}
          {ghost && (
            <Children
              grid={grid}
              column={column}
              baseline={baseline}
              arrangement={ghost}
              spread={draft.distribute}
              ghost
            />
          )}
          <Children
            grid={grid}
            column={column}
            baseline={baseline}
            arrangement={arrangement}
            spread={draft.distribute}
          />
        </svg>
        {places.flatMap((y) =>
          places.map((x) => {
            const spot = { x, y }
            const on = covers(arrangement, spot)
            const isAnchor = anchor.x === x && anchor.y === y

            return (
              <button
                key={`${x}-${y}`}
                type="button"
                data-spot={`${x}-${y}`}
                tabIndex={isAnchor ? 0 : -1}
                aria-label={spotName(spot)}
                aria-pressed={on}
                onKeyDown={onKeyDown}
                onPointerEnter={() => setHovered(spot)}
                onClick={() => {
                  if (on && !grid) {
                    fill(spot)
                  } else {
                    choose(spot, isAnchor && on && arrangement.x !== "fill" && arrangement.y !== "fill")
                  }
                }}
                className="group/spot relative z-10 grid place-items-center rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {!on && (
                  <span
                    className={`block size-1 rounded-full bg-muted-foreground/50 group-hover/spot:opacity-0 ${grid ? "opacity-0 group-hover/box:opacity-100" : ""}`}
                  />
                )}
              </button>
            )
          })
        )}
      </fieldset>
    </Hint>
  )
}

/** What clicking the children does next: what changes, and whether the gap goes Auto or back, where it does. */
interface NextFill {
  spread?: boolean
  change: Partial<Draft>
}

/** The children as they'd sit with a spot chosen, for the hover preview. */
function previewOf(current: Arrangement, spot: BoxSpot, grid: boolean, column: boolean): Arrangement {
  if (grid) {
    return { x: spot.x, y: spot.y }
  }

  // Spread or filled axes stay as they are; a spot only moves the children along the rest.
  const keep = (axis: "x" | "y") =>
    current[axis] === "spread" || (current[axis] === "fill" && axis === (column ? "x" : "y"))

  return { x: keep("x") ? current.x : spot.x, y: keep("y") ? current.y : spot.y }
}

/** A grid's four cells, faint, behind the children in the box. */
function GridCells() {
  return (
    <g fill="none" stroke="currentColor" strokeOpacity="0.18" strokeDasharray="2 2" className="text-muted-foreground">
      {[4, 31].flatMap((x) => [4, 31].map((y) => <rect key={`${x}-${y}`} x={x} y={y} width="25" height="25" rx="2" />))}
    </g>
  )
}

/** The bars' lengths across the layout, so they read as different children. */
const barLengths = [9, 14, 11]
const bar = 3.5
const barGap = 2

/** The place an axis's children sit at, or undefined where they fill or spread across it. */
const placeOf = (axis: Arrangement["x"]) => places.find((place) => place === axis)

/** Where a run of `length` sits on an axis of the box (6 to 54), at a place. */
function along(place: Place, length: number, from = 6, to = 54) {
  if (place === "start") {
    return from
  }

  if (place === "center") {
    return (from + to - length) / 2
  }

  return to - length
}

/** Where a row's children's text lines up when they're on the baseline, down the box. */
const baselineAt = 38

/**
 * The children, drawn in the box: three bars across a row's main axis (or down a column's), or in a grid, a child in
 * each of four cells. On the baseline, a row's bars are their own heights, standing on one dashed line, as text of
 * different sizes does. `ghost` draws them faintly, for hovering.
 */
function Children({
  grid,
  column,
  arrangement,
  spread,
  baseline = false,
  ghost = false
}: {
  grid: boolean
  column: boolean
  arrangement: Arrangement
  /** How an Auto gap spreads them, besides Space between: with some of the room at the edges too. */
  spread?: Draft["distribute"]
  baseline?: boolean
  ghost?: boolean
}) {
  const color = ghost ? "currentColor" : kindColors.layer
  const opacity = ghost ? 0.45 : 1
  // Where the children sit at a place on an axis; an axis they fill or spread across has none.
  const placeX = placeOf(arrangement.x)
  const placeY = placeOf(arrangement.y)

  if (grid) {
    return (
      <g fill={color} opacity={opacity} className="text-muted-foreground">
        {[4, 31].flatMap((cellX) =>
          [4, 31].map((cellY) => {
            const width = arrangement.x === "fill" ? 21 : 10
            const height = arrangement.y === "fill" ? 21 : 10
            const x = placeX === undefined ? cellX + 2 : along(placeX, width, cellX + 2, cellX + 23)
            const y = placeY === undefined ? cellY + 2 : along(placeY, height, cellY + 2, cellY + 23)

            return <rect key={`${cellX}-${cellY}`} x={x} y={y} width={width} height={height} rx="1.5" />
          })
        )}
      </g>
    )
  }

  // Drawn as a row, then turned for a column: main runs across, cross down.
  const main = column ? placeY : placeX
  const cross = column ? placeX : placeY
  const run = barLengths.length * bar + (barLengths.length - 1) * barGap

  // Spread out, the room left over goes between them, or a share of it at the edges: half a gap around, a whole evenly.
  const room = 48 - barLengths.length * bar
  const edgeShares = spread === undefined ? 0 : { around: 0.5, evenly: 1 }[spread]
  const spreadGap = room / (barLengths.length - 1 + 2 * edgeShares)

  const starts = barLengths.map((_, index) =>
    main === undefined
      ? 6 + edgeShares * spreadGap + index * (bar + spreadGap)
      : along(main, run) + index * (bar + barGap)
  )

  const bars = barLengths.map((length, index) => {
    if (baseline) {
      return { x: starts[index]!, y: baselineAt - length, size: length }
    }

    const size = cross === undefined ? 48 : length
    const y = cross === undefined ? 6 : along(cross, length)

    return { x: starts[index]!, y, size }
  })

  return (
    <g
      fill={color}
      opacity={opacity}
      className="text-muted-foreground"
      transform={column ? "matrix(0 1 1 0 0 0)" : undefined}
    >
      {baseline && !ghost && (
        <line
          x1="4"
          y1={baselineAt}
          x2="56"
          y2={baselineAt}
          stroke="currentColor"
          strokeOpacity="0.6"
          strokeDasharray="2 2"
        />
      )}
      {bars.map((each, index) => (
        <rect key={index} x={each.x} y={each.y} width={bar} height={each.size} rx="1" />
      ))}
    </g>
  )
}

/* Gap */

/** Two bars with the space between them marked, across or down, as the gap field's glyph. */
function GapGlyph({ across }: { across: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 14 14"
      className="size-3.5"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      style={across ? undefined : { transform: "rotate(90deg)" }}
    >
      <path d="M2.5 2.5 V11.5 M11.5 2.5 V11.5" strokeWidth="1.6" />
      <path d="M5.5 7 H8.5" strokeWidth="1.2" opacity="0.7" />
    </svg>
  )
}

const spreads = [
  { value: "between", label: "Space between", detail: "The first and last at the edges" },
  { value: "around", label: "Space around", detail: "Half as much at the edges" },
  { value: "evenly", label: "Space evenly", detail: "The same at the edges as between" }
] as const

/**
 * A gap, on the field padding uses (SideField): a length a spacing step at a time, or one of the spacing tokens, as a
 * chip, with the nearest token offered for a length of its own. Where it's taken, Auto spreads the children out to
 * fill the room, as Figma's Auto does: it's first in the field's menu, one row for each way it spreads in CSS's words
 * (Space between, around or evenly), and set, it's a chip that says how. Backspace takes it off, back to the gap it had
 * before, and typing a length replaces it. A negative gap overlaps the children, where it's taken.
 */
function GapField({
  label,
  across,
  value,
  placeholder = "0",
  takesAuto = false,
  takesNegative = false,
  distribute,
  onChange,
  onFixed
}: {
  label: string
  across: boolean
  value: Side
  placeholder?: string
  takesAuto?: boolean
  takesNegative?: boolean
  distribute?: Draft["distribute"]
  onChange: (gap: Side, distribute?: Draft["distribute"]) => void
  /** Leaves Auto for the gap it had before. */
  onFixed?: () => void
}) {
  const rules = { ...sideRules.gap, auto: takesAuto, negatives: takesNegative }
  const spread = spreads.find((each) => each.value === (distribute ?? "between"))!

  const auto = takesAuto
    ? {
        keywords: {
          heading: "Auto",
          rows: spreads.map((each) => ({
            key: each.value,
            name: each.label,
            detail: each.detail,
            current: value === "auto" && each.value === spread.value,
            onPick: () => onChange("auto", each.value === "between" ? undefined : each.value)
          }))
        },
        detail: spread.value,
        about: `${spread.label}: ${spread.detail.toLowerCase()}`,
        onRemove: () => (onFixed ? onFixed() : onChange(undefined))
      }
    : undefined

  return (
    <SideField
      label={label}
      inner={<GapGlyph across={across} />}
      rules={rules}
      value={value}
      placeholder={placeholder}
      note={takesNegative ? "Negative overlaps the children" : undefined}
      auto={auto}
      onChange={(next) => onChange(next, next === "auto" ? distribute : undefined)}
    />
  )
}

/* Grid tracks */

/** How many columns Repeat to fit makes at Plans' width, each at least `least` pixels wide. */
export function fitCount(least: number, gap: number) {
  return Math.max(1, Math.floor((contentWidth + gap) / (least + gap)))
}

/** The tracks a grid's columns come to: its own, or as many Fill tracks as fit. */
export function columnTracks(draft: Draft, spacing: readonly LengthToken[]): Track[] {
  const columns = draft.columns

  if (columns === undefined) {
    return []
  }

  if (Array.isArray(columns)) {
    return columns
  }

  return Array.from({ length: fitCount(columns.fit, gapPx(draft.gap, spacing)) }, () => fr(1))
}

const gapPx = (gap: Side, spacing: readonly LengthToken[]) =>
  Math.max(0, sideNumber(undefinedIfAuto(gap), spacing) ?? 0)

/**
 * Each track's share of the strip, as the canvas would size it at Plans' width: fixed tracks their pixels, content
 * tracks a stand-in width, and Fill tracks a share of what's left. Fill never drops below a sliver, so it can be seen.
 */
export function trackWeights(tracks: Track[], room = contentWidth): number[] {
  const fixed = tracks.reduce((sum, track) => {
    if (track.kind === "px") {
      return sum + track.value
    }

    if (track.kind === "percent") {
      return sum + (track.value / 100) * room
    }

    if (track.kind === "range") {
      return sum + track.min
    }

    if (track.kind === "fr") {
      return sum
    }

    return sum + contentTrack
  }, 0)

  const shares = tracks.reduce((sum, track) => {
    if (track.kind === "fr") {
      return sum + track.value
    }

    return track.kind === "range" ? sum + track.max : sum
  }, 0)

  const left = Math.max(0, room - fixed)
  const perShare = shares === 0 ? 0 : left / shares

  return tracks.map((track) => {
    if (track.kind === "px") {
      return track.value
    }

    if (track.kind === "percent") {
      return (track.value / 100) * room
    }

    if (track.kind === "fr") {
      return Math.max(24, track.value * perShare)
    }

    if (track.kind === "range") {
      return track.min + track.max * perShare
    }

    return contentTrack
  })
}

const hug: Track = { kind: "auto" }

/** Whether every track is the same size, so they're one count and one size: `grid-cols-3`. */
const sameTracks = (tracks: readonly Track[]) => tracks.every((track) => sameValue(track, tracks[0]))

/** How many rows Plans' children fill, as the browser adds them while Rows is Auto. */
function childRows(draft: Draft, spacing: readonly LengthToken[]) {
  const children = placeChildren(draft, Math.max(1, columnTracks(draft, spacing).length))

  return Math.max(1, ...children.map((child) => child.area.row + child.area.rows))
}

/** The most tracks a count takes, past which a grid is better built another way. */
const mostTracks = 24

/**
 * A grid's columns or rows. While every track is the same size, they're a count and a size side by side, as
 * `grid-cols-3` writes them: the count takes Fit for columns (as many as fit, each at least a width, CSS's auto-fit)
 * and Auto for rows (as many as children need), each a chip. Each column (or Each row), the toggle at the name's end,
 * as padding's Each side is, lists the tracks, one row each: a grip to reorder it, its number and its size, and − to
 * remove it, with Add at the name's end. Hovering or focusing a track's row highlights it on the canvas. The grid
 * picker at the end of Columns sets both counts at once, as Figma's does.
 */
function TracksField({ one, draft, set }: { one: "column" | "row" } & Pick<SectionProps, "draft" | "set">) {
  const spacing = useTokenSets().spacing
  const columns = one === "column"
  const fit = columns && draft.columns !== undefined && !Array.isArray(draft.columns)
  let tracks: Track[] = draft.rows ?? []

  if (columns) {
    tracks = Array.isArray(draft.columns) ? draft.columns : []
  }

  // Rows unset are Auto: the browser adds them as children need them.
  const auto = !columns && tracks.length === 0
  const uniform = sameTracks(tracks)
  const [each, setEach] = useState(!uniform)
  const listed = each && !fit && !auto
  const title = columns ? "Column" : "Row"
  const setTracks = (next: Track[]) => set(columns ? { columns: next } : { rows: next, autoRows: undefined })
  const fitLeast = fit && !Array.isArray(draft.columns) ? draft.columns!.fit : 160
  const made = columns ? fitCount(fitLeast, gapPx(draft.gap, spacing)) : childRows(draft, spacing)
  const widths = trackWeights(tracks, columns ? contentWidth : 240)
  const order = useOrderKeys(tracks.length)

  // Leaves Fit or Auto for the count it makes, as tracks of their own.
  const toCount = (count: number) => {
    if (fit) {
      set({ columns: Array.from({ length: count }, () => fr(1)) })
    } else if (auto) {
      set({ rows: Array.from({ length: count }, () => draft.autoRows ?? hug), autoRows: undefined })
    } else {
      setTracks(resize(tracks, count))
    }
  }

  // Fit keeps a fixed width as its least; Auto keeps the rows' size for the rows it makes.
  const toWord = () => {
    if (columns) {
      const least = uniform && tracks[0]?.kind === "px" ? tracks[0].value : 160
      set({ columns: { fit: least } })
    } else {
      set({ rows: [], autoRows: uniform && tracks[0] && tracks[0].kind !== "auto" ? tracks[0] : undefined })
    }
  }

  const toggleEach = () => {
    if (!listed && (fit || auto)) {
      toCount(made)
    }

    setEach(!listed)
  }

  const action = (
    <>
      {columns && !fit && (
        <GridPicker
          columns={tracks.length}
          rows={draft.rows?.length ?? 0}
          onPick={(across, down) => set({ columns: resize(tracks, across), rows: resize(draft.rows ?? [], down) })}
        />
      )}
      <EachToggle label={`Each ${one}`} parts={columns ? "columns" : "rows"} pressed={listed} onClick={toggleEach} />
      {listed && (
        <Hint label={`Add a ${one}`}>
          <button
            type="button"
            aria-label={`Add a ${one}`}
            onClick={() => setTracks(resize(tracks, tracks.length + 1))}
            className={nameMenuButton}
          >
            <Plus className="size-3" />
          </button>
        </Hint>
      )}
    </>
  )

  if (listed) {
    return (
      <Field label={columns ? "Columns" : "Rows"} action={action}>
        <div className="flex flex-col gap-1">
          {tracks.map((track, index) => (
            <TrackRow
              // A track has no identity but its place, which its row names; its key moves with it.
              key={order.keys[index]}
              one={one}
              index={index}
              track={track}
              width={widths[index]!}
              movable={tracks.length > 1}
              // A grid keeps one column, at least; the last row gone leaves them Auto.
              removable={!columns || tracks.length > 1}
              onChange={(next) => setTracks(tracks.map((other, at) => (at === index ? next : other)))}
              onMove={(from, to) => {
                order.move(from, to)
                setTracks(moved(tracks, from, to))
              }}
              onRemove={() => {
                order.remove(index)
                setTracks(tracks.filter((_, at) => at !== index))
              }}
            />
          ))}
        </div>
      </Field>
    )
  }

  let size: ReactNode

  if (fit) {
    size = (
      <Num
        label="Least column width"
        inner="≥"
        pixels
        value={fitLeast}
        min={1}
        onChange={(least) => set({ columns: { fit: least ?? 160 } })}
      />
    )
  } else if (auto) {
    size = (
      <TrackSizeField
        label="Row size"
        inner={<Rows3 className="size-3" />}
        track={draft.autoRows ?? hug}
        width={contentTrack}
        onChange={(next) => set({ autoRows: next.kind === "auto" ? undefined : next })}
      />
    )
  } else {
    size = (
      <TrackSizeField
        label={`${title} size`}
        inner={columns ? <Columns3 className="size-3" /> : <Rows3 className="size-3" />}
        track={uniform ? tracks[0] : undefined}
        width={widths[0] ?? contentTrack}
        onChange={(next) => setTracks(tracks.map(() => next))}
      />
    )
  }

  return (
    <Field label={columns ? "Columns" : "Rows"} action={action}>
      {/* Each field in its own cell, so what one says goes under it, not into the other's place. */}
      <div className="grid grid-cols-2 items-start gap-1.5">
        <div className="min-w-0">
          <TrackCount
            one={one}
            count={fit || auto ? made : tracks.length}
            word={fit || auto}
            onCount={toCount}
            onWord={toWord}
          />
        </div>
        <div className="min-w-0">{size}</div>
      </div>
    </Field>
  )
}

/** A small button at the end of a field's name row, as the grid picker and Each are. */
/**
 * How many columns or rows: a whole number, a step at a time, or Fit for columns and Auto for rows, each a chip that
 * says how many it makes now. Its menu offers the word; Backspace on the chip takes it off, for the count it made.
 */
function TrackCount({
  one,
  count,
  word,
  onCount,
  onWord
}: {
  one: "column" | "row"
  /** The tracks there are, or that Fit or Auto makes now. */
  count: number
  /** It's Fit, or Auto. */
  word: boolean
  onCount: (count: number) => void
  onWord: () => void
}) {
  const columns = one === "column"
  const name = columns ? "Fit" : "Auto"

  const words = columns
    ? { typed: ["fit", "auto-fit"], detail: "As many as fit, so the grid reflows on smaller screens" }
    : { typed: ["auto"], detail: "As many as children need" }

  const read = (text: string): Reading<number | "word"> => {
    const typed = text.trim().toLowerCase()

    // Left empty, as Backspace on the chip leaves it, it keeps the count it has.
    if (typed === "") {
      return { value: count }
    }

    if (words.typed.includes(typed)) {
      return { value: "word" }
    }

    const number = Number(typed)

    if (Number.isInteger(number) && number >= 1 && number <= mostTracks) {
      return { value: number }
    }

    return { reason: `Enter a whole number from 1 to ${mostTracks}, or ${name}` }
  }

  return (
    <ValueField
      label={`${columns ? "Column" : "Row"} count`}
      inner={columns ? <Columns3 className="size-3" /> : <Rows3 className="size-3" />}
      scrub={{
        from: () => count,
        apply: (next) => onCount(next),
        by: { move: (start, dx) => clamp(start + Math.trunc(dx / 8), 1, mostTracks) }
      }}
      shown={word ? name : String(count)}
      chip={
        word
          ? {
              name,
              keyword: { detail: String(count), about: words.detail },
              onRemove: () => onCount(count)
            }
          : undefined
      }
      tokens={{
        list: [],
        keywords: {
          heading: columns ? "Columns" : "Rows",
          rows: [{ key: "word", name, detail: words.detail, current: word, onPick: onWord }]
        },
        onPick: () => undefined
      }}
      read={read}
      onCommit={(next) => (next === "word" ? onWord() : onCount(next))}
      onStep={(up) => onCount(clamp(count + (up ? 1 : -1), 1, mostTracks))}
    />
  )
}

/** A track's size in words, where it has them: Fill, its share and least width faintly after, Hug, or content's. */
function trackWords(track: Track): { name: string; detail?: string; about: string } | undefined {
  if (track.kind === "fr") {
    return {
      name: "Fill",
      detail: track.value === 1 ? undefined : `×${formatNumber(track.value)}`,
      about: "A share of the space left"
    }
  }

  if (track.kind === "range") {
    const share = track.max === 1 ? "" : `×${formatNumber(track.max)} `

    return {
      name: "Fill",
      detail: `${share}min ${formatNumber(track.min)}`,
      about: `At least ${formatNumber(track.min)}px, then a share of the space left`
    }
  }

  if (track.kind === "auto") {
    return { name: "Hug", about: "As big as its content" }
  }

  if (track.kind === "min" || track.kind === "max") {
    return { name: contentSizeWords[track.kind].name, about: contentSizeWords[track.kind].detail }
  }

  return undefined
}

/** The ways a track can be sized, as its size's menu lists them, each made from the track it has and its width now. */
const trackSizes = [
  {
    key: "fr",
    name: "Fill",
    detail: "A share of the space left",
    make: (track: Track): Track => fr(track.kind === "range" ? track.max : 1)
  },
  { key: "auto", name: "Hug", detail: "As big as its content", make: (): Track => hug },
  { key: "px", name: "Fixed", detail: "A length that stays", make: (_: Track, width: number): Track => px(width) },
  {
    key: "range",
    name: "Fill, with a minimum",
    detail: "Never smaller than a length",
    make: (track: Track, width: number): Track => ({
      kind: "range",
      min: Math.round(width),
      max: track.kind === "fr" ? track.value : 1
    })
  },
  { key: "min", ...contentSizeWords.min, make: (): Track => ({ kind: "min" }) },
  { key: "max", ...contentSizeWords.max, make: (): Track => ({ kind: "max" }) }
] as const

const px = (value: number): Track => ({ kind: "px", value: Math.round(value) })

/**
 * A track's size, on the shared ValueField: a length in px or %, or a word as a chip (Fill, Hug, Min or Max content),
 * Fill with its share (×2) and least width faintly after it. Its menu lists the ways to size it; typing takes CSS or
 * the panel's words (`200`, `50%`, `2fr`, `Fill ×2`, `Hug`, `120-Fill`); arrow keys and dragging the label change the
 * number, the share, or a range's least width. Unset, it says Mixed, and what's set goes to every track.
 */
function TrackSizeField({
  label,
  inner,
  track,
  width,
  onChange
}: {
  label: string
  inner: ReactNode
  /** The track's size, or nothing where the tracks it covers differ. */
  track: Track | undefined
  /** Its width now, in pixels, which Fixed and a minimum start from. */
  width: number
  onChange: (track: Track) => void
}) {
  const words = track && trackWords(track)
  let number: number | undefined
  let unit: string | undefined

  if (track?.kind === "px" || track?.kind === "percent") {
    number = track.value
    unit = track.kind === "px" ? "px" : "%"
  }

  const from = () => {
    if (!track) {
      return 0
    }

    if (track.kind === "fr") {
      return track.value
    }

    if (track.kind === "range") {
      return track.min
    }

    return number ?? Math.round(width)
  }

  const scrubbed = (value: number) => {
    if (track?.kind === "fr") {
      onChange(fr(Math.max(1, value)))
    } else if (track?.kind === "range") {
      onChange({ ...track, min: Math.max(0, value) })
    } else if (track?.kind === "percent") {
      onChange({ kind: "percent", value: clamp(value, 0, 100) })
    } else {
      onChange(px(Math.max(0, value)))
    }
  }

  return (
    <ValueField
      label={label}
      inner={inner}
      scrub={{
        from,
        apply: scrubbed,
        // A share steps by one every 16 pixels; a length by a pixel each.
        by: track?.kind === "fr" ? { move: (start, dx) => start + Math.trunc(dx / 16) } : { step: 1, shiftStep: 10 }
      }}
      shown={number === undefined ? words?.name : formatNumber(number)}
      mixed={track === undefined}
      chip={
        words && {
          name: words.name,
          keyword: { detail: words.detail, about: words.about },
          // Backspace clears it for typing another size; leaving it empty puts it back, as a track always has one.
          onRemove: () => undefined
        }
      }
      unit={unit}
      tokens={{
        list: [],
        keywords: {
          heading: "Size",
          rows: trackSizes.map((each) => ({
            key: each.key,
            name: each.name,
            detail: each.detail,
            current: track !== undefined && (track.kind === "percent" ? "px" : track.kind) === each.key,
            onPick: () => onChange(each.make(track ?? fr(1), width))
          }))
        },
        onPick: () => undefined
      }}
      // Left empty, as Backspace on the chip leaves it, it keeps the size it has.
      read={(text) => (text.trim() === "" && track ? { value: track } : readTrack(text))}
      onCommit={onChange}
      onStep={(up, keys) => onChange(stepTrack(track ?? fr(1), up, keys.shift))}
    />
  )
}

/**
 * One track in Each column's list: a grip that reorders it (dragged, or Up and Down; Delete removes it), its size with
 * its number as the label, and −. Hovering or focusing the row highlights its track on the canvas.
 */
function TrackRow({
  one,
  index,
  track,
  width,
  movable,
  removable,
  onChange,
  onMove,
  onRemove
}: {
  one: "column" | "row"
  index: number
  track: Track
  width: number
  movable: boolean
  removable: boolean
  onChange: (track: Track) => void
  onMove: (from: number, to: number) => void
  onRemove: () => void
}) {
  const name = `${one === "column" ? "Column" : "Row"} ${index + 1}`
  const sort = useSortable({ group: `${one}s`, label: name, onMove: movable ? onMove : undefined })
  const { setHighlight } = useHighlight()
  const light = (on: boolean) => setHighlight(on ? { kind: one, index } : undefined)

  return (
    <div
      {...sort.item}
      className="group/row flex items-center gap-1"
      onPointerEnter={() => light(true)}
      onPointerLeave={() => light(false)}
      onFocus={() => light(true)}
      onBlur={() => light(false)}
    >
      {movable ? (
        <button
          type="button"
          aria-label={`Move ${name}`}
          aria-keyshortcuts="ArrowUp ArrowDown Delete"
          onPointerDown={sort.handle.onPointerDown}
          onKeyDown={(event) => {
            sort.handle.onKeyDown(event)

            if (removable && (event.key === "Delete" || event.key === "Backspace")) {
              event.preventDefault()
              onRemove()
            }
          }}
          className="grid h-7 w-3 shrink-0 cursor-grab touch-none place-items-center rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <GripVertical className="size-3" />
        </button>
      ) : (
        <span aria-hidden className="w-3 shrink-0" />
      )}
      <div className="min-w-0 flex-1">
        <TrackSizeField
          label={`${name} size`}
          inner={<span className="w-3 text-center tabular-nums">{index + 1}</span>}
          track={track}
          width={width}
          onChange={onChange}
        />
      </div>
      <RemoveButton
        label={`Remove ${name}`}
        hint={`Remove ${name.toLowerCase()}`}
        disabled={!removable}
        onClick={onRemove}
      />
    </div>
  )
}

/** A list of `count` tracks: the ones there are, with copies of the last added (or Fill), or the last taken off. */
function resize(tracks: Track[], count: number): Track[] {
  if (count <= tracks.length) {
    return tracks.slice(0, count)
  }

  const last = tracks.at(-1) ?? fr(1)

  return [...tracks, ...Array.from({ length: count - tracks.length }, () => last)]
}

/**
 * The grid picker, as Figma's: a small grid to point across, which shows the columns and rows it'd make, and a click
 * sets them as equal tracks. Rows at zero leave them Auto.
 */
function GridPicker({
  columns,
  rows,
  onPick
}: {
  columns: number
  rows: number
  onPick: (columns: number, rows: number) => void
}) {
  const [open, setOpen] = useState(false)
  const [at, setAt] = useState<{ x: number; y: number }>()
  const most = { x: 8, y: 6 }
  const shown = at ?? { x: columns, y: rows }

  return (
    <Popover open={open} onOpenChange={(next) => (setOpen(next), setAt(undefined))}>
      <Hint label="Pick columns and rows">
        <PopoverTrigger
          aria-label={`Pick columns and rows: ${columns} by ${rows === 0 ? "Auto" : rows}`}
          className={nameMenuButton}
        >
          <LayoutGrid className="size-3" />
        </PopoverTrigger>
      </Hint>
      <PopoverContent className="w-auto gap-2 p-2" align="end">
        <p className="text-sm font-medium">
          {shown.x} × {shown.y === 0 ? "Auto" : shown.y}
        </p>
        <div
          role="grid"
          aria-label="Columns and rows"
          className="grid gap-0.5"
          style={{ gridTemplateColumns: `repeat(${most.x}, 1rem)` }}
          onPointerLeave={() => setAt(undefined)}
        >
          {Array.from({ length: most.y }, (_, y) =>
            Array.from({ length: most.x }, (_, x) => {
              const lit = x < shown.x && y < shown.y

              return (
                <button
                  key={`${x}-${y}`}
                  type="button"
                  aria-label={`${x + 1} columns, ${y + 1} rows`}
                  onPointerEnter={() => setAt({ x: x + 1, y: y + 1 })}
                  onFocus={() => setAt({ x: x + 1, y: y + 1 })}
                  onClick={() => {
                    onPick(x + 1, y + 1)
                    setOpen(false)
                  }}
                  className={`size-4 rounded-sm border outline-none focus-visible:ring-2 focus-visible:ring-ring ${lit ? "" : "bg-muted/40"}`}
                  style={
                    lit
                      ? {
                          background: tint(kindColors.layer, 35),
                          borderColor: kindColors.layer
                        }
                      : undefined
                  }
                />
              )
            })
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 justify-start text-xs text-muted-foreground"
          onClick={() => {
            onPick(shown.x || columns, 0)
            setOpen(false)
          }}
        >
          Rows as children need them
        </Button>
      </PopoverContent>
    </Popover>
  )
}

const number = String.raw`(\d*\.?\d+)`

/**
 * A track typed as CSS writes it, or in the panel's words: `2fr`, Fill or `Fill ×2`, `200`, `200px` or `12.5rem`,
 * `50%`, `auto` or Hug, `min-content` or Min, `max-content` or Max, and a range as `minmax(120px, 1fr)` or `120-1fr`.
 */
function readTrack(text: string): Reading<Track> {
  const typed = text.trim().toLowerCase()

  const words = new Map<string, Track>([
    ["fill", fr(1)],
    ["auto", { kind: "auto" }],
    ["hug", { kind: "auto" }],
    ...[...typedContentSizes].map(([word, kind]): [string, Track] => [word, { kind }])
  ])

  const word = words.get(typed)

  if (word) {
    return { value: word }
  }

  const match = (pattern: string) => new RegExp(`^${pattern}$`).exec(typed)
  const share = match(`${number}\\s*fr`) ?? match(`fill\\s*[x×]?\\s*${number}`)

  if (share) {
    return { value: fr(Math.max(0.25, Number(share[1]))) }
  }

  const percent = match(`${number}\\s*%`)

  if (percent) {
    return { value: { kind: "percent", value: Number(percent[1]) } }
  }

  const rem = match(`${number}\\s*rem`)

  if (rem) {
    return { value: { kind: "px", value: Number(rem[1]) * remPx } }
  }

  const pixels = match(`${number}\\s*(?:px)?`)

  if (pixels) {
    return { value: { kind: "px", value: Number(pixels[1]) } }
  }

  const range =
    match(`minmax\\(\\s*${number}\\s*(?:px)?\\s*,\\s*${number}\\s*fr\\s*\\)`) ??
    match(`${number}\\s*[-–]\\s*${number}?\\s*(?:fr|fill)`)

  if (range) {
    return { value: { kind: "range", min: Number(range[1]), max: Number(range[2] ?? 1) } }
  }

  return { reason: "Enter 1fr, 200px, auto or minmax(120px, 1fr)" }
}

/** Steps a track's size by its own unit: a share by one, pixels by one or ten, a percentage by one. */
function stepTrack(track: Track, up: boolean, shift: boolean): Track {
  const by = stepCount(up, shift)

  if (track.kind === "fr") {
    return fr(Math.max(1, track.value + (up ? 1 : -1)))
  }

  if (track.kind === "px") {
    return { kind: "px", value: Math.max(0, track.value + by) }
  }

  if (track.kind === "percent") {
    return { kind: "percent", value: clamp(track.value + by, 0, 100) }
  }

  if (track.kind === "range") {
    return { ...track, min: Math.max(0, track.min + by) }
  }

  return track
}

/* A grid child's place */

/** A child's cells: its first column and row from 0, and how many it spans each way. */
export interface Area {
  col: number
  row: number
  cols: number
  rows: number
}

/** A line number as a track from 0: line 2 is the second track, and -1, after the last, ends the grid. */
export const trackOf = (line: number, count: number) => (line > 0 ? line - 1 : count + 1 + line)

/**
 * Where Plans' children sit in its grid, as the browser's auto-placement puts them (sparse, row by row): the heading
 * across every column, then Hobby, Pro plan as it's placed, and Team. Pro plan is placed first when both its lines are
 * set, as the browser does.
 */
export function placeChildren(draft: Draft, columns: number): { name: string; area: Area; auto: boolean }[] {
  const taken = new Set<string>()

  const free = (area: Area) => {
    for (let row = area.row; row < area.row + area.rows; row++) {
      for (let col = area.col; col < area.col + area.cols; col++) {
        if (taken.has(`${col}-${row}`) || col >= columns) {
          return false
        }
      }
    }

    return true
  }

  const take = (area: Area) => {
    for (let row = area.row; row < area.row + area.rows; row++) {
      for (let col = area.col; col < area.col + area.cols; col++) {
        taken.add(`${col}-${row}`)
      }
    }
  }

  const pro = proAxes(draft, columns)
  const placed: { name: string; area: Area; auto: boolean }[] = []

  if (pro.col !== undefined && pro.row !== undefined) {
    const area = { col: pro.col, row: pro.row, cols: pro.cols, rows: pro.rows }
    take(area)
    placed.push({ name: "Pro plan", area, auto: false })
  }

  let cursor = { col: 0, row: 0 }

  const flow = (cols: number, rows: number, fixedCol?: number) => {
    const span = Math.min(cols, columns)

    // Dense packing looks from the first cell each time, so a later child can fill an earlier gap.
    if (draft.dense) {
      cursor = { col: 0, row: 0 }
    }

    for (let row = cursor.row; row < 200; row++) {
      for (let col = row === cursor.row ? cursor.col : 0; col + span <= columns; col++) {
        if (fixedCol !== undefined && col !== fixedCol) {
          continue
        }

        const area = { col, row, cols: span, rows }

        if (!free(area)) {
          continue
        }

        take(area)
        cursor = { col: col + span, row }

        return area
      }
    }

    return { col: 0, row: 0, cols: span, rows }
  }

  const heading = flow(columns, 1)
  const result = [{ name: "Heading", area: heading, auto: true }]

  for (const name of ["Hobby", "Pro plan", "Team"]) {
    if (name === "Pro plan") {
      if (placed.length > 0) {
        continue
      }

      result.push({ name, area: flow(pro.cols, pro.rows, pro.col), auto: pro.col === undefined })
      continue
    }

    result.push({ name, area: flow(1, 1), auto: true })
  }

  return [...result, ...placed]
}

/** The rows a grid has to count a line from: those set, or one, as rows unset are added as children need them. */
export const rowCount = (draft: Draft) => Math.max(1, draft.rows?.length ?? 0)

/** Pro plan's start track and span on each axis, from its lines, its span, or All. */
function proAxes(draft: Draft, columns: number) {
  const axis = (start: number | undefined, span: Span | undefined, end: number | undefined, count: number) => {
    if (span === "all") {
      return { at: 0, span: count }
    }

    // A positive line past the last track makes more (rows are added as needed); a negative one counts back.
    let at: number | undefined

    if (start !== undefined) {
      at = start > 0 ? start - 1 : clamp(trackOf(start, count), 0, count - 1)
    }

    if (end !== undefined && at !== undefined) {
      return { at, span: Math.max(1, trackOf(end, count) - at) }
    }

    return { at, span: Math.max(1, span ?? 1) }
  }

  const col = axis(draft.colStart, draft.colSpan, draft.endLines ? draft.colEnd : undefined, columns)

  // Rows have no count until they're set, so a row's negative line counts from the rows there are, or one.
  const row = axis(draft.rowStart, draft.rowSpan, draft.endLines ? draft.rowEnd : undefined, rowCount(draft))

  return { col: col.at, cols: Math.min(col.span, columns), row: row.at, rows: row.span }
}
