import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Toggle,
  ToggleGroup,
  ToggleGroupItem
} from "@buildkitgg/shadcn-baseui-kit"
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignStartVertical,
  ArrowDown,
  ArrowLeft,
  ArrowDownUp,
  ArrowRight,
  ArrowRightLeft,
  ArrowUp,
  Copy,
  CornerDownLeft,
  Ellipsis,
  LayoutGrid,
  Plus,
  Repeat,
  StretchHorizontal,
  StretchVertical,
  X
} from "lucide-react"
import {
  Fragment,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
  useLayoutEffect,
  useRef,
  useState
} from "react"
import { kindColors } from "../../canvas/kinds.tsx"
import { PanelSelectContent } from "../../chrome/fields.tsx"
import { Hint } from "../../chrome/Hint.tsx"
import { PanelSection } from "../../chrome/PanelSection.tsx"
import { withVariables } from "../parts.tsx"
import { Num, type SectionProps, SizeField, useMeasured } from "./controls.tsx"
import { clamp, formatNumber, remPx } from "./css-values.ts"
import { type Columns, type Draft, type SelfAlign, type Span, type Track, trackLabel } from "./data.ts"
import { drag, type Reading, useTokenSets, ValueField } from "./field-parts.tsx"
import { Field } from "./field-row.tsx"
import { useHighlight } from "./highlight.tsx"
import { type Side, sideNumber, sideRules } from "./sides-writes.ts"
import { SideField } from "./sides.tsx"
import type { LengthToken } from "./tokens.ts"

/*
 * Layout, grid tracks and a grid child's place (PAR-186), redesigned after Figma's, Webflow's, Framer's and Penpot's
 * panels. The alignment box draws the children as they'll sit and takes the keyboard; gap sits beside it and spreads
 * the children with Auto; a grid's tracks are a strip drawn to their sizes; and a grid child's cells are a small map of
 * the grid, dragged across to place it.
 */

/** Plans' width inside its padding, which the strip and the map size Fill tracks against. */
const contentWidth = 480

/** A Hug, Min or Max track's width, as the strip draws it; the content decides it on the canvas. */
const contentTrack = 80

const fr = (value: number): Track => ({ kind: "fr", value })

type Place = "start" | "center" | "end"

const places: Place[] = ["start", "center", "end"]

const isBaseline = (align: Draft["align"]) => align === "baseline" || align === "last baseline"

/** The menu button at a section's title, as every section's More is drawn. */
function MoreMenu({ label, children }: { label: string; children: ReactNode }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={label}
        className="grid size-6 place-items-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-popup-open:bg-accent"
      >
        <Ellipsis className="size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

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
    <PanelSection title="Layout" action={<MoreMenu label="More layout options">{more}</MoreMenu>}>
      <div className="flex flex-col gap-2.5">
        <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3">
          <Field half label={grid ? "In cells" : "Alignment"}>
            <LayoutBox draft={draft} set={set} onSpread={spread} size={boxSize} />
          </Field>
          {/* Beside where the children sit: how they run, what spaces them, and once they wrap, where the lines go. */}
          <div ref={beside} className="flex min-w-0 flex-col gap-2.5">
            <Field half label="Type">
              <div ref={typeRow} className="flex items-center gap-1.5">
                <ToggleGroup
                  variant="outline"
                  size="sm"
                  spacing={0}
                  aria-label="Type"
                  value={[mode]}
                  onValueChange={([value]) => {
                    const next = layoutTypes.find((type) => type.value === value)?.value

                    if (next) {
                      toMode(next)
                    }
                  }}
                >
                  {layoutTypes.map((type) => (
                    <Hint key={type.value} label={type.label} detail={type.detail}>
                      <ToggleGroupItem value={type.value} aria-label={type.label} className="h-7 px-2">
                        {type.icon}
                      </ToggleGroupItem>
                    </Hint>
                  ))}
                </ToggleGroup>
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
        {grid && (
          <>
            <ColumnsField draft={draft} set={set} />
            <RowsField draft={draft} set={set} />
          </>
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

/** The way each arrow key moves across and down. */
const arrowMoves = new Map<string, [number, number]>([
  ["ArrowLeft", [-1, 0]],
  ["ArrowRight", [1, 0]],
  ["ArrowUp", [0, -1]],
  ["ArrowDown", [0, 1]]
])

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

/**
 * Columns: a strip drawn to the tracks' sizes, each a button that opens its size, with Add a column after it; the
 * grid picker and Repeat to fit at the name's end. Repeat to fit makes as many columns as fit, each at least a width.
 */
function ColumnsField({ draft, set }: Pick<SectionProps, "draft" | "set">) {
  const spacing = useTokenSets().spacing
  const columns = draft.columns!
  const fit = !Array.isArray(columns)
  const tracks = Array.isArray(columns) ? columns : []
  const rows = draft.rows ?? []

  const fitToggle = (
    <Hint
      label="Repeat to fit"
      detail="As many columns as fit the width, each at least a minimum, so the grid reflows on smaller screens"
    >
      <Toggle
        size="sm"
        className="size-5 min-w-5 shrink-0 p-0 text-muted-foreground"
        aria-label="Repeat to fit"
        pressed={fit}
        onPressedChange={(on) => set({ columns: on ? { fit: 160 } : [fr(1), fr(1), fr(1)] })}
      >
        <Repeat className="size-3" />
      </Toggle>
    </Hint>
  )

  const count = fit ? `${fitCount(columns.fit, gapPx(draft.gap, spacing))} fit` : String(tracks.length)

  return (
    <Field
      label={`Columns ${count}`}
      hint={fit ? "As many as fit, each at least this wide" : "Click a column to size it"}
      action={
        <>
          {!fit && (
            <GridPicker
              columns={tracks.length}
              rows={rows.length}
              onPick={(across, down) =>
                set({
                  columns: resize(tracks, across),
                  rows: down === 0 ? [] : resize(rows, down)
                })
              }
            />
          )}
          {fitToggle}
        </>
      }
    >
      {fit ? (
        <div className="flex flex-col gap-1">
          <TrackStrip one="column" tracks={columnTracks(draft, spacing)} fitted />
          <Num
            label="Least column width"
            inner="Min"
            pixels
            value={columns.fit}
            min={1}
            onChange={(least) => set({ columns: { fit: least ?? 160 } })}
          />
        </div>
      ) : (
        <TrackStrip
          one="column"
          tracks={tracks}
          onChange={(next) => set({ columns: next.length === 0 ? [fr(1)] : next })}
        />
      )}
    </Field>
  )
}

/** Rows: unset, they're added as children need them (Auto); once one's set, a strip as Columns has. */
function RowsField({ draft, set }: Pick<SectionProps, "draft" | "set">) {
  const rows = draft.rows ?? []

  return (
    <Field
      label={rows.length === 0 ? "Rows Auto" : `Rows ${rows.length}`}
      hint={
        rows.length === 0
          ? "Rows are added as children need them, each as tall as its content"
          : "Click a row to size it"
      }
    >
      {rows.length === 0 ? (
        <div className="flex items-center gap-1">
          <span className="flex h-7 min-w-0 flex-1 items-center rounded-md border border-dashed px-2 text-xs text-muted-foreground">
            As many as children need
          </span>
          <AddTrack one="row" onAdd={() => set({ rows: [{ kind: "auto" }] })} />
        </div>
      ) : (
        <TrackStrip one="row" tracks={rows} onChange={(next) => set({ rows: next })} />
      )}
    </Field>
  )
}

/** A list of `count` tracks: the ones there are, with Fill tracks added or the last ones taken off. */
function resize(tracks: Track[], count: number): Track[] {
  if (count <= tracks.length) {
    return tracks.slice(0, count)
  }

  return [...tracks, ...Array.from({ length: count - tracks.length }, () => fr(1))]
}

function AddTrack({ one, onAdd }: { one: "column" | "row"; onAdd: () => void }) {
  return (
    <Hint label={`Add a ${one}`}>
      <Button variant="ghost" size="icon-sm" className="size-7 shrink-0" aria-label={`Add a ${one}`} onClick={onAdd}>
        <Plus />
      </Button>
    </Hint>
  )
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
          className="grid size-5 shrink-0 place-items-center rounded text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-popup-open:bg-muted data-popup-open:text-foreground"
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
                          background: `color-mix(in oklab, ${kindColors.layer} 35%, transparent)`,
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

/** A track as CSS-like text, as its size field shows it to edit: `1fr`, `200px`, `50%`, `auto`, `minmax(120px, 1fr)`. */
function trackText(track: Track): string {
  if (track.kind === "fr") {
    return `${formatNumber(track.value)}fr`
  }

  if (track.kind === "px") {
    return `${formatNumber(track.value)}px`
  }

  if (track.kind === "percent") {
    return `${formatNumber(track.value)}%`
  }

  if (track.kind === "range") {
    return `minmax(${track.min}px, ${formatNumber(track.max)}fr)`
  }

  return { auto: "auto", min: "min-content", max: "max-content" }[track.kind]
}

const number = String.raw`(\d*\.?\d+)`

/**
 * A track typed as CSS writes it, or in the panel's words: `2fr` or Fill, `200`, `200px` or `12.5rem`, `50%`, `auto`
 * or Hug, `min-content` or Min, `max-content` or Max, and a range as `minmax(120px, 1fr)` or `120-1fr`.
 */
function readTrack(text: string): Reading<Track> {
  const typed = text.trim().toLowerCase()

  const words = new Map<string, Track>([
    ["fill", fr(1)],
    ["auto", { kind: "auto" }],
    ["hug", { kind: "auto" }],
    ["min", { kind: "min" }],
    ["min-content", { kind: "min" }],
    ["max", { kind: "max" }],
    ["max-content", { kind: "max" }]
  ])

  const word = words.get(typed)

  if (word) {
    return { value: word }
  }

  const match = (pattern: string) => new RegExp(`^${pattern}$`).exec(typed)
  const share = match(`${number}\\s*fr`)

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
  const by = (up ? 1 : -1) * (shift ? 10 : 1)

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

/** A track at a new width in the strip, keeping its kind: pixels, a percentage, or a range's least width. */
function sized(track: Track, from: number, to: number): Track {
  if (track.kind === "px") {
    return { kind: "px", value: Math.round(to) }
  }

  if (track.kind === "percent") {
    return { kind: "percent", value: Math.round((to / contentWidth) * 1000) / 10 }
  }

  if (track.kind === "range") {
    return { ...track, min: Math.max(0, Math.round(track.min + to - from)) }
  }

  if (track.kind === "fr") {
    return track
  }

  // A track sized by its content has no width to change, so dragging it gives it one, as Fixed.
  return { kind: "px", value: Math.round(to) }
}

/**
 * The tracks after the line between `index` and the next is dragged by `by` pixels at Plans' width. Two Fill tracks
 * trade their shares, in quarters, so they stay Fill; a Fill track beside a sized one stays as it is and takes up the
 * difference; sized tracks keep their kinds at their new widths.
 */
function resized(tracks: Track[], weights: number[], index: number, by: number): Track[] {
  const [one, next] = [tracks[index]!, tracks[index + 1]!]
  const [oneWidth, nextWidth] = [weights[index]!, weights[index + 1]!]
  const both = oneWidth + nextWidth
  const oneTo = clamp(oneWidth + by, 24, both - 24)
  const copy = [...tracks]

  if (one.kind === "fr" && next.kind === "fr") {
    const shares = one.value + next.value
    const oneShare = clamp(Math.round(((shares * oneTo) / both) * 4) / 4, 0.25, shares - 0.25)
    copy[index] = fr(oneShare)
    copy[index + 1] = fr(Math.round((shares - oneShare) * 4) / 4)

    return copy
  }

  copy[index] = sized(one, oneWidth, oneTo)
  copy[index + 1] = sized(next, nextWidth, both - oneTo)

  return copy
}

/**
 * How far a press of an arrow key on the line between two tracks moves it, at Plans' width: a quarter share between
 * two Fill tracks, so each press changes them, or 8 pixels (40 with Shift) beside a sized one.
 */
function lineStep(tracks: Track[], weights: number[], index: number, shift: boolean) {
  const [one, next] = [tracks[index]!, tracks[index + 1]!]

  if (one.kind === "fr" && next.kind === "fr") {
    const perShare = (weights[index]! + weights[index + 1]!) / (one.value + next.value)

    return perShare * (shift ? 1 : 0.25)
  }

  return shift ? 40 : 8
}

/**
 * The tracks as a strip, each as wide as it'd be at Plans' width, so a 200-pixel column and Fill ×2 look it. Each is
 * a button that opens its size, typed as CSS writes it or picked by kind, with adding, duplicating, moving and removing
 * tracks beside it; hovering or focusing one highlights it on the canvas. Dragging the line between two tracks resizes
 * them, keeping their kinds, so two Fill tracks trade shares rather than turning into pixels; arrow keys on the line do
 * it a step at a time. Alt with an arrow moves the focused track. Add a column is after the strip. Fitted, it only
 * shows the columns Repeat to fit makes.
 */
function TrackStrip({
  one,
  tracks,
  fitted = false,
  onChange
}: {
  one: "column" | "row"
  tracks: Track[]
  fitted?: boolean
  onChange?: (tracks: Track[]) => void
}) {
  const weights = trackWeights(tracks)
  const strip = useRef<HTMLDivElement>(null)
  const { setHighlight } = useHighlight()

  const focusTrack = (index: number) =>
    requestAnimationFrame(() => strip.current?.querySelectorAll<HTMLElement>("[data-track]")[index]?.focus())

  const names = one === "column" ? { earlier: "left", later: "right" } : { earlier: "up", later: "down" }

  if (fitted || !onChange) {
    return (
      <div className="flex h-7 min-w-0 overflow-hidden rounded-md border bg-muted/40" aria-hidden>
        {tracks.map((_, index) => (
          <span
            key={index}
            className="grid min-w-0 place-items-center border-l px-1 font-mono text-2xs text-muted-foreground first:border-l-0"
            style={{ flex: `${weights[index]} 1 0` }}
          >
            <span className="truncate">Fill</span>
          </span>
        ))}
      </div>
    )
  }

  const move = (index: number, by: number) => {
    const to = index + by

    if (to < 0 || to >= tracks.length) {
      return
    }

    const copy = [...tracks]

    ;[copy[index], copy[to]] = [copy[to]!, copy[index]!]
    onChange(copy)
    focusTrack(to)
  }

  const pressLine = (index: number) => (event: PointerEvent<HTMLInputElement>) => {
    const width = strip.current?.getBoundingClientRect().width ?? contentWidth
    const scale = weights.reduce((sum, weight) => sum + weight, 0) / width
    const [startTracks, startWeights] = [tracks, weights]
    event.preventDefault()
    drag(event, { move: (point) => onChange(resized(startTracks, startWeights, index, point.dx * scale)) })
  }

  return (
    <div className="flex items-center gap-1">
      <div ref={strip} className="flex h-7 min-w-0 flex-1 rounded-md border bg-muted/40">
        {tracks.map((track, index) => (
          <Fragment key={index}>
            <TrackSegment
              name={`${one} ${index + 1}`}
              track={track}
              weight={weights[index]!}
              moveNames={names}
              canMove={{ earlier: index > 0, later: index < tracks.length - 1 }}
              onHighlight={(on) => setHighlight(on ? { kind: one, index } : undefined)}
              onChange={(next) => onChange(tracks.map((other, at) => (at === index ? next : other)))}
              onAdd={(after) => {
                const copy = [...tracks]
                copy.splice(after ? index + 1 : index, 0, fr(1))
                onChange(copy)
              }}
              onDuplicate={() => {
                const copy = [...tracks]
                copy.splice(index + 1, 0, track)
                onChange(copy)
                focusTrack(index + 1)
              }}
              onMove={(by) => move(index, by)}
              onRemove={() => onChange(tracks.filter((_, at) => at !== index))}
            />
            {index < tracks.length - 1 && (
              // The line between two tracks, a range input as the canvas's spacing handles are: its keys and the
              // pointer are its own, so it never moves by itself.
              <span className="group/line relative z-10 -mx-1 w-2 shrink-0">
                <span
                  aria-hidden
                  className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 rounded-full bg-border group-hover/line:inset-y-0.5 group-hover/line:w-0.5 group-hover/line:bg-(--line) group-has-focus-visible/line:w-0.5 group-has-focus-visible/line:bg-(--line)"
                  style={withVariables({ "--line": kindColors.layer })}
                />
                <Hint
                  label={`Drag to resize ${one}s ${index + 1} and ${index + 2}`}
                  detail="Fill tracks trade shares and stay Fill"
                  wait
                >
                  <input
                    type="range"
                    min={24}
                    max={Math.round(weights[index]! + weights[index + 1]! - 24)}
                    value={Math.round(weights[index]!)}
                    onChange={() => undefined}
                    aria-label={`Resize ${one}s ${index + 1} and ${index + 2}`}
                    aria-valuetext={`${trackLabel(tracks[index]!)} and ${trackLabel(tracks[index + 1]!)}`}
                    onPointerDown={pressLine(index)}
                    onKeyDown={(event) => {
                      const by = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -1, ArrowDown: 1 }[event.key]

                      if (by === undefined) {
                        return
                      }

                      event.preventDefault()
                      onChange(resized(tracks, weights, index, by * lineStep(tracks, weights, index, event.shiftKey)))
                    }}
                    className="absolute inset-0 m-0 size-full cursor-col-resize touch-none appearance-none rounded-sm bg-transparent outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-slider-runnable-track]:appearance-none [&::-webkit-slider-thumb]:size-0 [&::-webkit-slider-thumb]:appearance-none"
                  />
                </Hint>
              </span>
            )}
          </Fragment>
        ))}
      </div>
      <AddTrack one={one} onAdd={() => onChange([...tracks, fr(1)])} />
    </div>
  )
}

const trackKinds = [
  { value: "fr", label: "Fill", detail: "A share of the space left" },
  { value: "px", label: "Fixed", detail: "A fixed length, typed in px, rem or %" },
  { value: "auto", label: "Hug", detail: "As big as its content, sharing any space left" },
  { value: "min", label: "Min", detail: "As narrow as its content goes, min-content" },
  { value: "max", label: "Max", detail: "As wide as its content without wrapping, max-content" },
  { value: "range", label: "Range", detail: "At least a length, then a share of the space left, minmax()" }
] as const

/**
 * One track in the strip: its size in words, opening to its size typed as CSS writes it (focused, so typing `2fr` and
 * Enter is done), its kind, and adding, duplicating, moving and removing tracks by it. It highlights its track on the
 * canvas while it's hovered, focused or open.
 */
function TrackSegment({
  name,
  track,
  weight,
  moveNames,
  canMove,
  onHighlight,
  onChange,
  onAdd,
  onDuplicate,
  onMove,
  onRemove
}: {
  name: string
  track: Track
  weight: number
  moveNames: { earlier: string; later: string }
  canMove: { earlier: boolean; later: boolean }
  onHighlight: (on: boolean) => void
  onChange: (track: Track) => void
  onAdd: (after: boolean) => void
  onDuplicate: () => void
  onMove: (by: number) => void
  onRemove: () => void
}) {
  const [open, setOpen] = useState(false)
  const title = `${name[0]!.toUpperCase()}${name.slice(1)}`
  const kind = name.split(" ")[0]!

  const close = (run: () => void) => () => {
    run()
    setOpen(false)
  }

  const actions = [
    { label: `Add a ${kind} before`, Icon: Plus, run: () => onAdd(false), enabled: true },
    { label: `Add a ${kind} after`, Icon: Plus, run: () => onAdd(true), enabled: true },
    {
      label: `Move ${moveNames.earlier}`,
      Icon: moveNames.earlier === "left" ? ArrowLeft : ArrowUp,
      run: () => onMove(-1),
      enabled: canMove.earlier
    },
    {
      label: `Move ${moveNames.later}`,
      Icon: moveNames.later === "right" ? ArrowRight : ArrowDown,
      run: () => onMove(1),
      enabled: canMove.later
    },
    { label: "Duplicate", Icon: Copy, run: onDuplicate, enabled: true },
    { label: `Remove ${name}`, Icon: X, run: onRemove, enabled: true }
  ]

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        onHighlight(next)
      }}
    >
      <PopoverTrigger
        data-track
        aria-label={`${title}, ${trackLabel(track)}`}
        onPointerEnter={() => onHighlight(true)}
        onPointerLeave={() => !open && onHighlight(false)}
        onFocus={() => onHighlight(true)}
        onBlur={() => !open && onHighlight(false)}
        onKeyDown={(event) => {
          if (!event.altKey) {
            return
          }

          const by = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[event.key]

          if (by === undefined) {
            return
          }

          event.preventDefault()
          onMove(by)
        }}
        className="grid min-w-0 place-items-center px-1 font-mono text-2xs tabular-nums outline-none first:rounded-l-md last:rounded-r-md hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset data-popup-open:bg-accent"
        style={{ flex: `${weight} 1 0` }}
      >
        <span className="truncate">{trackLabel(track)}</span>
      </PopoverTrigger>
      <PopoverContent className="w-64 gap-2 p-2" align="start">
        <p className="text-sm font-medium">{title}</p>
        <ValueField
          label={`${title} size`}
          shown={trackText(track)}
          selectOnFocus
          hint={{ detail: "Type it as CSS writes it: 1fr, 200px, 50%, auto, min-content or minmax(120px, 1fr)" }}
          read={readTrack}
          onCommit={onChange}
          onStep={(up, keys) => onChange(stepTrack(track, up, keys.shift))}
        />
        <ToggleGroup
          variant="outline"
          size="sm"
          spacing={0}
          className="w-full"
          aria-label={`${title} kind`}
          value={[track.kind === "percent" ? "px" : track.kind]}
          onValueChange={([next]) => {
            if (next === "fr") {
              onChange(fr(1))
            } else if (next === "px") {
              onChange({ kind: "px", value: Math.round(weight) })
            } else if (next === "range") {
              onChange({ kind: "range", min: 192, max: 1 })
            } else if (next === "auto" || next === "min" || next === "max") {
              onChange({ kind: next })
            }
          }}
        >
          {trackKinds.map((each) => (
            <Hint key={each.value} label={each.detail}>
              <ToggleGroupItem value={each.value} className="h-7 flex-1 px-1 text-xs">
                {each.label}
              </ToggleGroupItem>
            </Hint>
          ))}
        </ToggleGroup>
        {track.kind === "range" && (
          <div className="grid grid-cols-2 gap-1">
            <Num
              label="At least"
              inner="Min"
              pixels
              value={track.min}
              onChange={(min) => onChange({ ...track, min: min ?? 0 })}
            />
            <Num
              label="Share of the space left"
              inner="Max"
              suffix="fr"
              value={track.max}
              min={1}
              onChange={(max) => onChange({ ...track, max: max ?? 1 })}
            />
          </div>
        )}
        <div className="grid grid-cols-2 gap-x-1 border-t pt-1">
          {actions.map(({ label, Icon, run, enabled }) => (
            <Button
              key={label}
              variant="ghost"
              size="sm"
              disabled={!enabled}
              className="h-7 justify-start px-1.5 text-xs"
              onClick={close(run)}
            >
              <Icon /> {label.startsWith("Remove") ? "Remove" : label.replace(` a ${kind}`, "")}
            </Button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
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
const trackOf = (line: number, count: number) => (line > 0 ? line - 1 : count + 1 + line)

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
  const row = axis(
    draft.rowStart,
    draft.rowSpan,
    draft.endLines ? draft.rowEnd : undefined,
    Math.max(1, draft.rows?.length ?? 0)
  )

  return { col: col.at, cols: Math.min(col.span, columns), row: row.at, rows: row.span }
}

/**
 * Size for a child of a grid, as Pro plan, a child of Plans' grid: W and H; its cells, as a map of the grid to drag
 * across, with Start and Span under it for each axis; and where it sits in its cell, across and down. End lines and an
 * area are under More.
 */
export function ChildSizeSection({ draft, set }: SectionProps) {
  const spacing = useTokenSets().spacing
  const measured = useMeasured("[data-layer='Pro plan']")
  const endLines = draft.endLines ?? false

  const placed =
    draft.colStart !== undefined ||
    draft.colSpan !== undefined ||
    draft.rowStart !== undefined ||
    draft.rowSpan !== undefined

  return (
    <PanelSection
      title="Size"
      action={
        <MoreMenu label="More size options">
          <DropdownMenuCheckboxItem
            checked={endLines}
            onCheckedChange={(on) => {
              const columns = columnTracks(draft, spacing).length
              const area = placeChildren(draft, columns).find((child) => child.name === "Pro plan")!.area
              set(
                on
                  ? {
                      endLines: true,
                      colStart: area.col + 1,
                      colEnd: area.col + area.cols + 1,
                      rowStart: area.row + 1,
                      rowEnd: area.row + area.rows + 1
                    }
                  : { endLines: undefined, colEnd: undefined, rowEnd: undefined }
              )
            }}
          >
            End lines
          </DropdownMenuCheckboxItem>
          <DropdownMenuItem disabled className="justify-between">
            Area <span className="text-xs text-muted-foreground">None in Plans</span>
          </DropdownMenuItem>
        </MoreMenu>
      }
    >
      <div className="flex flex-col gap-2.5">
        <div className="grid grid-cols-2 items-start gap-1 pr-1">
          <SizeField
            axis="Width"
            value={draft.childWidth ?? "fill"}
            measured={measured?.width}
            parent={measured?.parent}
            onChange={(childWidth) => set({ childWidth })}
          />
          <SizeField
            axis="Height"
            value={draft.childHeight ?? "fill"}
            measured={measured?.height}
            parent={undefined}
            onChange={(childHeight) => set({ childHeight })}
          />
        </div>
        <Field
          label={placed ? "Cells" : "Cells Auto"}
          hint="Drag across the grid to place Pro plan. Unset, it takes the next free cell."
          action={
            placed ? (
              <Hint label="Place it automatically" detail="It takes the next free cell, one column and one row">
                <button
                  type="button"
                  onClick={() =>
                    set({
                      colStart: undefined,
                      colSpan: undefined,
                      colEnd: undefined,
                      rowStart: undefined,
                      rowSpan: undefined,
                      rowEnd: undefined
                    })
                  }
                  className="h-5 rounded px-1 text-xs text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Auto
                </button>
              </Hint>
            ) : undefined
          }
        >
          <div className="flex flex-col gap-1">
            <CellMap draft={draft} set={set} />
            <AxisPlacement
              axis="Columns"
              start={draft.colStart}
              span={draft.colSpan}
              end={endLines ? draft.colEnd : undefined}
              endLines={endLines}
              onChange={(colStart, colSpan, colEnd) => set({ colStart, colSpan, colEnd })}
            />
            <AxisPlacement
              axis="Rows"
              start={draft.rowStart}
              span={draft.rowSpan}
              end={endLines ? draft.rowEnd : undefined}
              endLines={endLines}
              onChange={(rowStart, rowSpan, rowEnd) => set({ rowStart, rowSpan, rowEnd })}
            />
          </div>
        </Field>
        <SelfAlignment draft={draft} set={set} />
      </div>
    </PanelSection>
  )
}

/**
 * The grid as a small map, its columns drawn to their sizes: the other children faint where the browser puts them,
 * and Pro plan in the layer's color, dashed while it's placed automatically. Dragging across cells places it there,
 * spanning them; a click moves it, keeping its span. Arrow keys move it a cell; with Shift, they change its span.
 * Delete places it automatically again. A row under the last lets it go below.
 */
function CellMap({ draft, set }: Pick<SectionProps, "draft" | "set">) {
  const spacing = useTokenSets().spacing
  const tracks = columnTracks(draft, spacing)
  const columns = tracks.length
  const children = placeChildren(draft, columns)
  const pro = children.find((child) => child.name === "Pro plan")!
  const rows = Math.max(draft.rows?.length ?? 0, ...children.map((child) => child.area.row + child.area.rows)) + 1
  const weights = trackWeights(tracks)
  const map = useRef<HTMLButtonElement>(null)
  const [dragged, setDragged] = useState<Area>()

  const place = (area: Area) => {
    const span = (count: number) => (count === 1 ? undefined : count)

    if (draft.endLines) {
      set({
        colStart: area.col + 1,
        colEnd: area.col + area.cols + 1,
        rowStart: area.row + 1,
        rowEnd: area.row + area.rows + 1
      })

      return
    }

    set({
      colStart: area.col + 1,
      colSpan: draft.colSpan === "all" && area.cols === columns ? "all" : span(area.cols),
      rowStart: area.row + 1,
      rowSpan: span(area.rows)
    })
  }

  // The cell under a point in the map, by the columns' widths and the rows' equal heights.
  const cellAt = (x: number, y: number) => {
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

  const press = (event: PointerEvent<HTMLButtonElement>) => {
    const start = cellAt(...pointIn(event))
    const startedOnPro = within(pro.area, start)

    const areaTo = (cell: { col: number; row: number }): Area => {
      // A drag that starts on Pro plan moves it; anywhere else, it spans from there to here.
      if (startedOnPro) {
        return {
          col: clamp(pro.area.col + cell.col - start.col, 0, columns - pro.area.cols),
          row: Math.max(0, pro.area.row + cell.row - start.row),
          cols: pro.area.cols,
          rows: pro.area.rows
        }
      }

      return {
        col: Math.min(start.col, cell.col),
        row: Math.min(start.row, cell.row),
        cols: Math.abs(cell.col - start.col) + 1,
        rows: Math.abs(cell.row - start.row) + 1
      }
    }

    setDragged(areaTo(start))
    drag(event, {
      within: map.current,
      move: (point) => setDragged(areaTo(cellAt(point.x, point.y))),
      end: (point, cancelled) => {
        setDragged(undefined)

        if (!cancelled) {
          place(areaTo(cellAt(point.x, point.y)))
        }
      }
    })
  }

  const pointIn = (event: PointerEvent<HTMLButtonElement>): [number, number] => {
    const box = event.currentTarget.getBoundingClientRect()

    return [(event.clientX - box.left) / box.width, (event.clientY - box.top) / box.height]
  }

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const move = arrowMoves.get(event.key)
    const area = pro.area

    if (move) {
      event.preventDefault()

      if (event.shiftKey) {
        const cols = clamp(area.cols + move[0], 1, columns - area.col)
        const rowsSpanned = Math.max(1, area.rows + move[1])
        place({ ...area, cols, rows: rowsSpanned })
      } else {
        place({ ...area, col: clamp(area.col + move[0], 0, columns - area.cols), row: Math.max(0, area.row + move[1]) })
      }
    } else if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault()
      set({
        colStart: undefined,
        colSpan: undefined,
        colEnd: undefined,
        rowStart: undefined,
        rowSpan: undefined,
        rowEnd: undefined
      })
    }
  }

  const shown = dragged ?? pro.area

  const describe = (area: Area) => {
    const range = (from: number, count: number, word: string) =>
      count === 1 ? `${word} ${from + 1}` : `${word}s ${from + 1} to ${from + count}`

    return `${range(area.col, area.cols, "column")}, ${range(area.row, area.rows, "row")}`
  }

  return (
    <Hint
      label="Pro plan's cells"
      detail={
        "Drag across cells to place it there. Drag it to move it.\nArrow keys move it; with Shift, they change its span. Delete places it automatically."
      }
      wait
    >
      <button
        ref={map}
        type="button"
        aria-label={`Pro plan's cells: ${describe(pro.area)}${pro.auto ? ", placed automatically" : ""}`}
        aria-roledescription="grid map"
        onPointerDown={press}
        onKeyDown={onKeyDown}
        className="grid cursor-crosshair touch-none gap-0.5 rounded-md border bg-muted/40 p-0.5 outline-none select-none focus-visible:ring-2 focus-visible:ring-ring"
        style={{
          gridTemplateColumns: weights.map((weight) => `${weight}fr`).join(" "),
          gridTemplateRows: `repeat(${rows}, 1.125rem)`
        }}
      >
        {Array.from({ length: rows }, (_, row) =>
          Array.from({ length: columns }, (_, col) => (
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
        <span
          aria-hidden
          className={`flex min-w-0 items-center rounded-sm border px-1 text-2xs font-medium text-foreground ${pro.auto && !dragged ? "border-dashed" : ""}`}
          style={{
            gridColumn: `${shown.col + 1} / span ${shown.cols}`,
            gridRow: `${shown.row + 1} / span ${shown.rows}`,
            borderColor: kindColors.layer,
            background: `color-mix(in oklab, ${kindColors.layer} ${dragged ? 45 : 30}%, transparent)`
          }}
        >
          <span className="truncate">Pro plan</span>
        </span>
      </button>
    </Hint>
  )
}

const within = (area: Area, cell: { col: number; row: number }) =>
  cell.col >= area.col && cell.col < area.col + area.cols && cell.row >= area.row && cell.row < area.row + area.rows

/**
 * One axis of a grid child's place: Start (the line it starts at, from 1, or from the end when negative, -1 being after
 * the last) and Span, or All for every track. With End lines from More, Start and End take their place.
 */
function AxisPlacement({
  axis,
  start,
  span,
  end,
  endLines,
  onChange
}: {
  axis: "Columns" | "Rows"
  start: number | undefined
  span: Span | undefined
  end: number | undefined
  endLines: boolean
  onChange: (start: number | undefined, span: Span | undefined, end: number | undefined) => void
}) {
  const all = span === "all"
  const tracks = axis.toLowerCase()
  const one = axis === "Columns" ? "Column" : "Row"
  // Line 0 doesn't exist; it counts as unset.
  const line = (next: number | undefined) => (next === 0 ? undefined : next)

  return (
    <div className="grid grid-cols-[3.25rem_minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-1">
      <span className="text-xs text-muted-foreground">{one}</span>
      {all ? (
        <span className="col-span-2 flex h-7 items-center px-1.5 text-xs text-muted-foreground">
          Across all {tracks}
        </span>
      ) : (
        <>
          <Num
            label={`${one} start line`}
            inner="Start"
            value={start}
            placeholder="Auto"
            min={-99}
            onChange={(next) => onChange(line(next), span, end)}
          />
          {endLines ? (
            <Num
              label={`${one} end line`}
              inner="End"
              value={end}
              placeholder="Auto"
              min={-99}
              onChange={(next) => onChange(start, span, line(next))}
            />
          ) : (
            <Num
              label={`${tracks[0]!.toUpperCase()}${tracks.slice(1)} spanned`}
              inner="Span"
              value={span}
              placeholder="1"
              min={1}
              onChange={(next) => onChange(start, next, end)}
            />
          )}
        </>
      )}
      <Hint
        label={`Span all ${tracks}`}
        detail={`A negative line counts from the end: -1 is after the last of the ${tracks}`}
      >
        <Toggle
          size="sm"
          className="h-7 shrink-0 px-2 text-xs"
          aria-label={`Span all ${tracks}`}
          pressed={all}
          onPressedChange={(on) => onChange(on ? undefined : start, on ? "all" : undefined, undefined)}
        >
          All
        </Toggle>
      </Hint>
    </div>
  )
}

const selfIcons = {
  x: [
    { value: "start", label: "Left", Icon: AlignStartVertical },
    { value: "center", label: "Center", Icon: AlignCenterVertical },
    { value: "end", label: "Right", Icon: AlignEndVertical },
    { value: "stretch", label: "Stretch across", Icon: StretchHorizontal }
  ],
  y: [
    { value: "start", label: "Top", Icon: AlignStartHorizontal },
    { value: "center", label: "Middle", Icon: AlignCenterHorizontal },
    { value: "end", label: "Bottom", Icon: AlignEndHorizontal },
    { value: "stretch", label: "Stretch down", Icon: StretchVertical }
  ]
} as const

/**
 * Where Pro plan sits in its cell, across and down, as icon toggles: unset follows the grid's In cells, which shows
 * faintly pressed. Pressing the chosen one again goes back to following the grid.
 */
function SelfAlignment({ draft, set }: Pick<SectionProps, "draft" | "set">) {
  const follows = (axis: "x" | "y") => {
    const fromGrid = axis === "x" ? draft.itemsX : draft.itemsY
    const size = axis === "x" ? draft.childWidth : draft.childHeight

    // A size of its own can't stretch, so the grid's stretch puts it at the start.
    if ((fromGrid ?? "stretch") === "stretch") {
      return (size ?? "fill") === "fill" ? "stretch" : "start"
    }

    return fromGrid!
  }

  const group = (axis: "x" | "y") => {
    const value = axis === "x" ? draft.justifySelf : draft.alignSelf
    const key = axis === "x" ? "justifySelf" : "alignSelf"
    const unset = follows(axis)

    return (
      <ToggleGroup
        variant="outline"
        size="sm"
        spacing={0}
        aria-label={axis === "x" ? "Across its cell" : "Down its cell"}
        value={value === undefined ? [] : [value]}
        onValueChange={([next]) => set({ [key]: selfIcons[axis].find((each) => each.value === next)?.value })}
      >
        {selfIcons[axis].map(({ value: option, label, Icon }) => (
          <Hint key={option} label={value === undefined && option === unset ? `${label}, from Plans' grid` : label}>
            <ToggleGroupItem
              value={option}
              aria-label={label}
              className={`h-7 px-1.5 ${value === undefined && option === unset ? "bg-muted/60 text-muted-foreground" : ""}`}
            >
              <Icon />
            </ToggleGroupItem>
          </Hint>
        ))}
      </ToggleGroup>
    )
  }

  return (
    <Field label="In its cell" hint="Where Pro plan sits in its cells. Unset follows Plans' grid, shown faintly.">
      <div className="flex flex-wrap items-center gap-1.5">
        {group("x")}
        {group("y")}
      </div>
    </Field>
  )
}
