import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Toggle,
  ToggleGroup,
  ToggleGroupItem,
  TooltipProvider
} from "@buildkitgg/shadcn-baseui-kit"
import {
  ArrowDown,
  ArrowDownUp,
  ArrowRight,
  Baseline,
  ChevronDown,
  CircleAlert,
  Ellipsis,
  Grid3x3,
  Lock,
  LockOpen,
  Minus,
  PanelBottom,
  PanelLeft,
  PanelRight,
  PanelTop,
  Plus,
  Repeat,
  SlidersHorizontal,
  Square,
  SquareDashed,
  SquareRoundCorner,
  WrapText,
  X
} from "lucide-react"
import { type CSSProperties, type ReactNode, useEffect, useState } from "react"
import { ChoiceInput, Field } from "../../chrome/fields.tsx"
import { Hint } from "../../chrome/Hint.tsx"
import { PanelSection } from "../../chrome/PanelSection.tsx"
import { ColorInput } from "./color-picker.tsx"
import {
  blurPx,
  blurTokens,
  type Columns,
  type Draft,
  hexOf,
  radiusPx,
  radiusTokens,
  type SelfAlign,
  type Size,
  sizeCss,
  type Track,
  trackCss,
  placementCss,
  type Span,
  trackLabel,
  usedColors
} from "./data.ts"

/** What the exploration starts on: the layer, which child is selected, and any picker open. */
export interface Start {
  draft: Draft
  /** The panel shows a grid child's placement, with that child selected on the canvas. */
  child?: boolean
  /** Opens the fill picker on a tab. */
  fillPicker?: "tokens" | "custom"
  /** The design's frame row instead of a layer. */
  frame?: boolean
  /** The project's Tokens only setting, which refuses plain colors. */
  tokensOnly?: boolean
}

/** The canvas's stand-in for a layer and the inspector beside it, both on one draft style. */
export function StylingPrototype({ start }: { start: Start }) {
  const [draft, setDraft] = useState(start.draft)
  const [child, setChild] = useState(start.child ?? false)
  const [frame, setFrame] = useState({ width: 1280, height: undefined as number | undefined })
  const set = (change: Partial<Draft>) => setDraft((current) => ({ ...current, ...change }))
  let selected = "Plans"
  let panel = (
    <>
      <LayoutSection draft={draft} set={set} />
      <SizeSection draft={draft} set={set} />
      <AppearanceSection draft={draft} set={set} tokensOnly={start.tokensOnly} fillPicker={start.fillPicker} />
      <StrokeSection draft={draft} set={set} tokensOnly={start.tokensOnly} />
      <TextSection draft={draft} set={set} />
    </>
  )
  if (start.frame) {
    selected = "Pricing"
    panel = <FrameSection frame={frame} onChange={setFrame} />
  } else if (child) {
    selected = "Pro plan"
    panel = <ChildSizeSection draft={draft} set={set} />
  }
  return (
    <TooltipProvider>
      <div className="flex h-screen bg-background text-foreground">
        <main className="flex min-w-0 flex-1 items-center justify-center overflow-auto bg-muted/40 p-8">
          {start.frame ? (
            <FramePreview width={frame.width} height={frame.height} />
          ) : (
            <LayerPreview draft={draft} childSelected={child} onSelectChild={setChild} />
          )}
        </main>
        <aside aria-label="Inspector" className="flex w-80 shrink-0 flex-col overflow-y-auto border-l bg-background">
          <p className="border-b px-4 py-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            Prototype · {selected}
            {start.tokensOnly && " · Tokens only"}
          </p>
          {panel}
        </aside>
      </div>
    </TooltipProvider>
  )
}

interface SectionProps {
  draft: Draft
  set: (change: Partial<Draft>) => void
  tokensOnly?: boolean
}

/**
 * Layout, as PAR-652's panel lays it out: Type with Wrap beside it, and Reverse once it's set from More; the nine-spot
 * box, which stays physical when reversed, with Baseline under it in a row; and a grid's columns as a count until its
 * tracks are edited.
 */
function LayoutSection({ draft, set }: SectionProps) {
  const grid = draft.columns !== undefined
  const mode = grid ? "grid" : (draft.direction ?? "column")
  const baseline = isBaseline(draft.align)
  return (
    <PanelSection
      title="Layout"
      action={
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="More layout options"
            className="grid size-6 place-items-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-popup-open:bg-accent"
          >
            <Ellipsis className="size-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuCheckboxItem
              checked={draft.reverse ?? false}
              disabled={grid}
              onCheckedChange={(reverse) => set({ reverse: reverse || undefined })}
            >
              Reverse direction
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>
      }
    >
      <div className="flex flex-col gap-1">
        <Field label="Type">
          <div className="flex items-center gap-1.5">
            <ToggleGroup
              variant="outline"
              size="sm"
              spacing={0}
              value={[mode]}
              onValueChange={([value]) => {
                if (value === "grid") set({ columns: draft.columns ?? [fr(1), fr(1), fr(1)], rows: draft.rows ?? [] })
                else if (value) set({ direction: value as "row" | "column", columns: undefined, rows: undefined })
              }}
            >
              <Hint label="Vertical auto layout">
                <ToggleGroupItem value="column" aria-label="Vertical" className="h-7 px-2">
                  <ArrowDown />
                </ToggleGroupItem>
              </Hint>
              <Hint label="Horizontal auto layout">
                <ToggleGroupItem value="row" aria-label="Horizontal" className="h-7 px-2">
                  <ArrowRight />
                </ToggleGroupItem>
              </Hint>
              <Hint label="Grid">
                <ToggleGroupItem value="grid" aria-label="Grid" className="h-7 px-2">
                  <Grid3x3 />
                </ToggleGroupItem>
              </Hint>
            </ToggleGroup>
            {!grid && (
              <Hint label="Wrap onto new lines">
                <Toggle
                  variant="outline"
                  size="sm"
                  className="h-7 px-2"
                  aria-label="Wrap"
                  pressed={draft.wrap ?? false}
                  onPressedChange={(wrap) => set({ wrap: wrap || undefined })}
                >
                  <WrapText />
                </Toggle>
              </Hint>
            )}
            {!grid && draft.reverse && (
              <Hint
                label="Reverse direction"
                detail="Lays the children out last to first. The reading order no longer matches what's seen."
              >
                <Toggle
                  variant="outline"
                  size="sm"
                  className="h-7 px-2"
                  aria-label="Reverse direction"
                  pressed
                  onPressedChange={(reverse) => set({ reverse: reverse || undefined })}
                >
                  <ArrowDownUp />
                </Toggle>
              </Hint>
            )}
          </div>
        </Field>
        {grid ? (
          <>
            <ColumnsField columns={draft.columns} onChange={(columns) => set({ columns })} />
            <TracksField label="Rows" tracks={draft.rows ?? []} onChange={(rows) => set({ rows })} />
          </>
        ) : (
          <Field label="Alignment">
            <div className="flex flex-col items-start gap-1.5">
              <AlignmentBox draft={draft} set={set} />
              {(mode === "row" || baseline) && (
                // Set in a vertical layout, Baseline does nothing, so it stays, dimmed, saying why.
                <div className={`flex items-center gap-1 ${mode === "row" ? "" : "opacity-50"}`}>
                  <Hint
                    label="Align text on its baseline"
                    detail={
                      mode === "row"
                        ? "Lines up the text in each child, on its first line or its last"
                        : "Does nothing in a vertical layout. Baseline lines up text across a row."
                    }
                  >
                    <Toggle
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1 px-2 text-xs"
                      aria-label="Align text on its baseline"
                      pressed={baseline}
                      onPressedChange={(on) => set({ align: on ? "baseline" : undefined })}
                    >
                      <Baseline /> Baseline
                    </Toggle>
                  </Hint>
                  {baseline && (
                    <ToggleGroup
                      variant="outline"
                      size="sm"
                      spacing={0}
                      aria-label="Which baseline"
                      value={[draft.align!]}
                      onValueChange={([line]) => line && set({ align: line as "baseline" | "last baseline" })}
                    >
                      <ToggleGroupItem value="baseline" aria-label="First line" className="h-7 px-2 text-xs">
                        First
                      </ToggleGroupItem>
                      <ToggleGroupItem value="last baseline" aria-label="Last line" className="h-7 px-2 text-xs">
                        Last
                      </ToggleGroupItem>
                    </ToggleGroup>
                  )}
                </div>
              )}
            </div>
          </Field>
        )}
      </div>
    </PanelSection>
  )
}

const spots = ["start", "center", "end"] as const

/**
 * The nine-spot box, physical: the top-left spot is the top left whichever way the layout runs. A reversed layout
 * keeps it so, and what's written flips (flex-end for the top of a reversed column), as Webflow's box does.
 */
function AlignmentBox({ draft, set }: Pick<SectionProps, "draft" | "set">) {
  const column = (draft.direction ?? "column") === "column"
  const justify = draft.justify ?? "start"
  // Unset is stretch, which no spot shows, as in the app's box.
  const align = draft.align ?? "stretch"
  return (
    <div className="grid size-[60px] shrink-0 grid-cols-3 grid-rows-3 rounded-md border bg-muted/40 p-0.5">
      {spots.flatMap((row) =>
        spots.map((across) => {
          // A column runs down, so rows are its main axis; a row runs across, so columns are.
          const main = column ? row : across
          const cross = column ? across : row
          // Stretched or on the baseline, children fill the cross axis, so the whole line at their end is lit.
          const fillsAcross = align === "stretch" || isBaseline(align)
          const active = justify === main && (fillsAcross || align === cross)
          return (
            <button
              key={`${row}-${across}`}
              type="button"
              aria-label={`Align ${verticalNames[row]} ${horizontalNames[across]}`}
              aria-pressed={active}
              onClick={() => set({ justify: main, align: isBaseline(draft.align) ? draft.align : cross })}
              className="group grid place-items-center rounded-sm hover:bg-accent"
            >
              <span
                className={`block rounded-full ${active ? "size-2 bg-[#0d99ff]" : "size-1 bg-muted-foreground/50 group-hover:bg-muted-foreground"}`}
              />
            </button>
          )
        })
      )}
    </div>
  )
}

const isBaseline = (align: Draft["align"]) => align === "baseline" || align === "last baseline"

const verticalNames = { start: "top", center: "middle", end: "bottom" } as const
const horizontalNames = { start: "left", center: "center", end: "right" } as const

const fr = (value: number): Track => ({ kind: "fr", value })

/**
 * A grid's columns: a list of tracks, or with Repeat to fit, as many as fit the width, each at least the width given,
 * the responsive grid Webflow calls auto-fit.
 */
function ColumnsField({ columns, onChange }: { columns: Columns | undefined; onChange: (columns: Columns) => void }) {
  const fit = columns !== undefined && !Array.isArray(columns)
  const [editing, setEditing] = useState(false)
  const toggle = (
    <Hint
      label="Repeat to fit"
      detail="As many columns as fit the width, each at least a minimum, so the grid reflows on smaller screens"
    >
      <Toggle
        size="sm"
        className="size-7 min-w-7 shrink-0 p-0"
        aria-label="Repeat to fit"
        pressed={fit}
        onPressedChange={(on) => onChange(on ? { fit: 160 } : [fr(1), fr(1), fr(1)])}
      >
        <Repeat />
      </Toggle>
    </Hint>
  )
  const tracks = Array.isArray(columns) ? columns : []
  // Equal Fill tracks are a count, as grid-cols-3 writes them, until Edit tracks opens the list.
  const equal = tracks.length > 0 && tracks.every((track) => track.kind === "fr" && track.value === 1)
  if (!fit && equal && !editing) {
    return (
      <Field label="Columns" hint="Equal columns. Edit tracks to size each one.">
        <div className="flex items-center gap-1">
          <div className="min-w-0 flex-1">
            <Num
              label="Columns"
              value={tracks.length}
              min={1}
              onChange={(count) => onChange(Array.from({ length: count ?? 1 }, () => fr(1)))}
            />
          </div>
          <Hint label="Edit tracks" detail="Size each column on its own: Fill, Fixed, Hug, Min, Max or a Range">
            <Button
              variant="ghost"
              size="icon-sm"
              className="size-7"
              aria-label="Edit tracks"
              onClick={() => setEditing(true)}
            >
              <SlidersHorizontal />
            </Button>
          </Hint>
          {toggle}
        </div>
      </Field>
    )
  }
  if (!fit) return <TracksField label="Columns" tracks={tracks} onChange={onChange} after={toggle} />
  return (
    <Field label="Columns" hint="As many as fit, each at least this wide">
      <div className="flex items-center gap-1">
        <div className="min-w-0 flex-1">
          <Num
            label="Least column width"
            inner="Min"
            pixels
            value={columns.fit}
            min={1}
            onChange={(least) => onChange({ fit: least ?? 160 })}
          />
        </div>
        {toggle}
      </div>
    </Field>
  )
}

/** A grid's tracks as chips: each opens to its size, and the last button adds one. */
function TracksField({
  label,
  tracks,
  after,
  onChange
}: {
  label: string
  tracks: Track[]
  /** A control at the row's end, such as Repeat to fit. */
  after?: ReactNode
  onChange: (tracks: Track[]) => void
}) {
  const one = label === "Columns" ? "column" : "row"
  return (
    <Field label={label} hint={tracks.length === 0 ? "Rows are added as children need them" : undefined}>
      <div className="flex items-start gap-1">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
          {tracks.length === 0 && <span className="px-1 text-xs text-muted-foreground">Auto</span>}
          {tracks.map((track, index) => (
            <TrackChip
              key={index}
              name={`${one} ${index + 1}`}
              track={track}
              onChange={(next) => onChange(tracks.map((other, at) => (at === index ? next : other)))}
              onRemove={() => onChange(tracks.filter((_, at) => at !== index))}
            />
          ))}
          <Hint label={`Add a ${one}`}>
            <Button
              variant="ghost"
              size="icon-sm"
              className="size-7"
              aria-label={`Add a ${one}`}
              onClick={() => onChange([...tracks, fr(1)])}
            >
              <Plus />
            </Button>
          </Hint>
        </div>
        {after}
      </div>
    </Field>
  )
}

function TrackChip({
  name,
  track,
  onChange,
  onRemove
}: {
  name: string
  track: Track
  onChange: (track: Track) => void
  onRemove: () => void
}) {
  const [open, setOpen] = useState(false)
  const kinds = [
    { value: "fr", label: "Fill", detail: "A share of the space left" },
    { value: "px", label: "Fixed", detail: "A fixed length, typed in px or rem" },
    { value: "auto", label: "Hug", detail: "As big as its content, sharing any space left" },
    { value: "min", label: "Min", detail: "As narrow as its content goes, min-content" },
    { value: "max", label: "Max", detail: "As wide as its content without wrapping, max-content" },
    { value: "range", label: "Range", detail: "At least a length, then a share of the space left, minmax()" }
  ] as const
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            aria-label={`${name[0]!.toUpperCase()}${name.slice(1)}, ${trackLabel(track)}`}
            className="h-7 min-w-11 px-2 font-mono text-xs font-normal tabular-nums"
          >
            {trackLabel(track)}
          </Button>
        }
      />
      <PopoverContent className="w-64 gap-2 p-2" align="start">
        <p className="text-xs font-medium capitalize">{name}</p>
        <ToggleGroup
          variant="outline"
          size="sm"
          spacing={0}
          className="w-full"
          value={[track.kind]}
          onValueChange={([kind]) => {
            if (kind === "fr") onChange(fr(1))
            else if (kind === "px") onChange({ kind: "px", value: 200 })
            else if (kind === "range") onChange({ kind: "range", min: 192, max: 1 })
            else if (kind === "auto" || kind === "min" || kind === "max") onChange({ kind })
          }}
        >
          {kinds.map((kind) => (
            <Hint key={kind.value} label={kind.detail}>
              <ToggleGroupItem value={kind.value} className="h-7 flex-1 text-xs">
                {kind.label}
              </ToggleGroupItem>
            </Hint>
          ))}
        </ToggleGroup>
        {(track.kind === "fr" || track.kind === "px") && (
          <Num
            label={track.kind === "fr" ? "Share" : "Width"}
            suffix={track.kind === "fr" ? "fr" : undefined}
            pixels={track.kind === "px"}
            value={track.value}
            min={track.kind === "fr" ? 1 : 0}
            onChange={(value) => onChange({ kind: track.kind, value: value ?? 1 })}
          />
        )}
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
        <Button
          variant="ghost"
          size="sm"
          className="h-7 justify-start text-xs text-muted-foreground"
          onClick={onRemove}
        >
          <X /> Remove {name}
        </Button>
      </PopoverContent>
    </Popover>
  )
}

const selfOptions = {
  align: [
    { value: "start", label: "Top" },
    { value: "center", label: "Middle" },
    { value: "end", label: "Bottom" },
    { value: "stretch", label: "Stretch" }
  ],
  justify: [
    { value: "start", label: "Left" },
    { value: "center", label: "Center" },
    { value: "end", label: "Right" },
    { value: "stretch", label: "Stretch" }
  ]
} as const

/**
 * Size for a child of a grid, as PAR-652's panel adds its rows: W and H, Align self and Justify self, then Span with the
 * start lines beside it. End lines and an area are under More.
 */
function ChildSizeSection({ draft, set }: SectionProps) {
  const measured = useMeasured("[data-layer='Pro plan']")
  const endLines = draft.endLines ?? false
  return (
    <PanelSection
      title="Size"
      action={
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="More size options"
            className="grid size-6 place-items-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-popup-open:bg-accent"
          >
            <Ellipsis className="size-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuCheckboxItem
              checked={endLines}
              onCheckedChange={(on) =>
                set(
                  on
                    ? {
                        endLines: true,
                        colEnd: endOf(draft.colStart, draft.colSpan),
                        rowEnd: endOf(draft.rowStart, draft.rowSpan)
                      }
                    : { endLines: undefined, colEnd: undefined, rowEnd: undefined }
                )
              }
            >
              End lines
            </DropdownMenuCheckboxItem>
            <DropdownMenuItem disabled className="justify-between">
              Area <span className="text-xs text-muted-foreground">None in Plans</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      }
    >
      <div className="flex flex-col gap-1">
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
        <Field label="Align self" hint="Where Pro plan sits in its cell, top to bottom">
          <ChoiceInput
            value={draft.alignSelf}
            options={[...selfOptions.align]}
            placeholder="Auto"
            onChange={(alignSelf) => set({ alignSelf: alignSelf as SelfAlign | undefined })}
          />
        </Field>
        <Field label="Justify self" hint="Where Pro plan sits in its cell, left to right">
          <ChoiceInput
            value={draft.justifySelf}
            options={[...selfOptions.justify]}
            placeholder="Auto"
            onChange={(justifySelf) => set({ justifySelf: justifySelf as SelfAlign | undefined })}
          />
        </Field>
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
    </PanelSection>
  )
}

/** The line a span ends at, for switching to end lines without moving the child: start 2, span 2 ends at 4. */
function endOf(start: number | undefined, span: Span | undefined): number | undefined {
  if (start === undefined || start < 0 || span === "all") return undefined
  return start + (span ?? 1)
}

/**
 * One axis of a grid child's place: Span, with the line it starts at beside it (from 1, or from the end when negative,
 * -1 being after the last), or All for every track, as a header across the whole grid wants. With End lines from More,
 * Start and End take Span's place.
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
  const startField = (
    <Num
      label={`${one} start line`}
      inner="Start"
      value={start}
      placeholder="Auto"
      min={-99}
      onChange={(next) => onChange(line(next), span, end)}
    />
  )
  return (
    <Field label={axis} hint={`A negative line counts from the end: -1 is after the last of the ${tracks}`}>
      <div className="flex items-center gap-1">
        <div className="grid min-w-0 flex-1 grid-cols-2 gap-1">
          {all && (
            <span className="col-span-2 flex h-7 items-center px-1.5 text-xs text-muted-foreground">
              Across all {tracks}
            </span>
          )}
          {!all && endLines && (
            <>
              {startField}
              <Num
                label={`${one} end line`}
                inner="End"
                value={end}
                placeholder="Auto"
                min={-99}
                onChange={(next) => onChange(start, span, line(next))}
              />
            </>
          )}
          {!all && !endLines && (
            <>
              <Num
                label={`${tracks[0]!.toUpperCase()}${tracks.slice(1)} spanned`}
                inner="Span"
                value={span as number | undefined}
                placeholder="1"
                min={1}
                onChange={(next) => onChange(start, next, end)}
              />
              {startField}
            </>
          )}
        </div>
        <Hint label={`Span all ${tracks}`}>
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
    </Field>
  )
}

/**
 * W and H on one line with the aspect lock between them, as Figma UI3 has it, each a size field whose unit opens its
 * menu: Fixed, Hug or Fill, then px, % or rem, Min and Max content under More units, and Add min or Add max, which each
 * add a row under the size. Locking keeps the ratio the layer has now and frees the height (Auto, set by Aspect ratio),
 * since a ratio is ignored when both sizes are set; the ratio then shows as its own row, with named ratios. Typing H
 * while locked changes W to keep the ratio.
 */
function SizeSection({ draft, set }: SectionProps) {
  const measured = useMeasured("section[aria-label='Plans']")
  const width = draft.width ?? 520
  const height = draft.height ?? "hug"
  const ratio = draft.aspect === undefined ? undefined : ratioOf(draft.aspect)
  const lock = (on: boolean) => {
    if (!on) {
      // Unlocking fixes the height where the ratio left it, so nothing moves.
      set({ aspect: undefined, height: measured?.height })
      return
    }
    const shown = measured?.width ?? 520
    const tall = measured?.height ?? shown
    // Within a percent of a named ratio is that ratio: whole pixels can't make 16:9 exactly.
    const near = namedRatios.find((option) => Math.abs(ratioOf(option.value)! / (shown / tall) - 1) < 0.01)
    set({ aspect: near?.value ?? reducedRatio(shown, tall), height: undefined })
  }
  const limits = [
    { key: "minWidth", label: "Min width" },
    { key: "maxWidth", label: "Max width" },
    { key: "minHeight", label: "Min height" },
    { key: "maxHeight", label: "Max height" }
  ] as const
  const addLimit = (axis: "Width" | "Height", which: "min" | "max") => {
    const size = axis === "Width" ? measured?.width : measured?.height
    set({ [`${which}${axis}`]: size ?? 100 })
  }
  return (
    <PanelSection title="Size">
      <div className="flex flex-col gap-1">
        <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-1 pr-1">
          <SizeField
            axis="Width"
            value={width}
            measured={measured?.width}
            parent={measured?.parent}
            limits={{ min: draft.minWidth !== undefined, max: draft.maxWidth !== undefined }}
            onAddLimit={(which) => addLimit("Width", which)}
            onChange={(next) => set({ width: next })}
          />
          <Hint label={ratio ? "Unlock aspect ratio" : "Lock aspect ratio"}>
            <Toggle
              size="sm"
              className="size-7 min-w-7 p-0"
              aria-label="Lock aspect ratio"
              pressed={ratio !== undefined}
              onPressedChange={lock}
            >
              {ratio ? <Lock /> : <LockOpen />}
            </Toggle>
          </Hint>
          <SizeField
            axis="Height"
            value={height}
            measured={measured?.height}
            parent={undefined}
            setBy={ratio ? "Aspect ratio" : undefined}
            limits={{ min: draft.minHeight !== undefined, max: draft.maxHeight !== undefined }}
            onAddLimit={(which) => addLimit("Height", which)}
            onChange={(next) => {
              // A length typed while locked keeps the ratio by changing the width; a mode chosen unlocks it.
              if (ratio && typeof next === "number") set({ width: Math.round(next * ratio) })
              else set({ height: next, aspect: undefined })
            }}
          />
        </div>
        {limits.map(
          ({ key, label }) =>
            draft[key] !== undefined && (
              <Field key={key} label={label}>
                <div className="flex items-center gap-1">
                  <div className="min-w-0 flex-1">
                    <Num
                      label={label}
                      pixels
                      spacing
                      value={draft[key]}
                      min={0}
                      onChange={(next) => set({ [key]: next ?? 0 })}
                    />
                  </div>
                  <Hint label={`Remove ${label.toLowerCase()}`}>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="size-7"
                      aria-label={`Remove ${label.toLowerCase()}`}
                      onClick={() => set({ [key]: undefined })}
                    >
                      <Minus />
                    </Button>
                  </Hint>
                </div>
              </Field>
            )
        )}
        {draft.aspect !== undefined && (
          <Field label="Ratio" hint="Height follows the width at this ratio. Type 16:9, 16/9, 16x9 or 1.78">
            <RatioField aspect={draft.aspect} onChange={(aspect) => set({ aspect })} />
          </Field>
        )}
      </div>
    </PanelSection>
  )
}

/** A layer's drawn size and its parent's width, kept up to date as it changes. */
function useMeasured(selector: string): { width: number; height: number; parent: number } | undefined {
  const [size, setSize] = useState<{ width: number; height: number; parent: number }>()
  useEffect(() => {
    const element = document.querySelector<HTMLElement>(selector)
    if (!element) return
    const measure = () => {
      const box = element.getBoundingClientRect()
      const parent = element.parentElement?.getBoundingClientRect().width ?? box.width
      setSize({ width: Math.round(box.width), height: Math.round(box.height), parent: Math.round(parent) })
    }
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    if (element.parentElement) observer.observe(element.parentElement)
    return () => observer.disconnect()
  }, [selector])
  return size
}

const sizeModeNames = { hug: "Hug", fill: "Fill", min: "Min content", max: "Max content" } as const

/**
 * A width or height with its mode, as PAR-652's Size type has it. A length shows its number and unit; a mode shows in
 * words, with what it comes to after it, faintly (Hug 248). The unit is a button that opens the field's menu. Typing a
 * length makes it Fixed, as in Figma, and Up or Down on a mode makes it Fixed at its measured size and steps from there,
 * a whole spacing step (4px) at a time.
 */
function SizeField({
  axis,
  value,
  measured,
  parent,
  setBy,
  limits,
  onAddLimit,
  onChange
}: {
  axis: "Width" | "Height"
  value: Size
  measured: number | undefined
  /** The parent's size on this axis, for a percentage; unset where it hugs, so a percentage means nothing. */
  parent: number | undefined
  /** Another control that sets this axis, as the aspect lock sets the height: it shows as Auto, set by it. */
  setBy?: string
  limits?: { min: boolean; max: boolean }
  onAddLimit?: (which: "min" | "max") => void
  onChange: (size: Size) => void
}) {
  const [typed, setTyped] = useState<string>()
  const [focused, setFocused] = useState(false)
  const [unit, setUnit] = useState<"px" | "rem">("px")
  const [message, setMessage] = useState<{ tone: "error" | "note"; text: string }>()
  const fixed = typeof value === "number"
  const percent = typeof value === "object"
  let shown = ""
  if (setBy) shown = "Auto"
  else if (fixed) shown = unit === "rem" ? String(Number((value / remPixels).toFixed(3))) : String(value)
  else if (percent) shown = String(value.percent)
  else shown = sizeModeNames[value]
  let mode: string = value as string
  if (setBy) mode = "auto"
  else if (fixed || percent) mode = "fixed"
  let unitLabel: string | undefined
  if (!setBy && fixed) unitLabel = unit
  else if (!setBy && percent) unitLabel = "%"
  // What it comes to, faintly after the value: set by another control, or measured for a mode or a percentage.
  let comesTo: string | undefined
  if (setBy) comesTo = `set by ${setBy}`
  else if (!fixed && measured !== undefined) comesTo = String(measured)
  const reason = `${axis} takes a length, Hug or Fill`
  const read = (text: string): Size | "unreadable" => {
    const word = text.trim().toLowerCase()
    if (word === "hug" || word === "fit") return "hug"
    if (word === "fill") return "fill"
    const match = /^(-?\d*\.?\d+)\s*(px|rem|%)?$/i.exec(word)
    if (!match) return "unreadable"
    const number = Number(match[1])
    const typedUnit = match[2] ?? (percent ? "%" : unit)
    if (typedUnit === "%") return { percent: Math.max(0, Math.round(number * 10) / 10) }
    if (typedUnit === "rem") setUnit("rem")
    else if (match[2]) setUnit("px")
    return Math.max(1, Math.round(number * (typedUnit === "rem" ? remPixels : 1)))
  }
  const commit = (leaving: boolean): boolean => {
    if (typed === undefined) return true
    const next = typed.trim() === "" ? undefined : read(typed)
    if (next === "unreadable") {
      if (leaving) {
        setMessage({ tone: "note", text: `${axis} is back to ${shown}. It takes a length, Hug or Fill.` })
        setTyped(undefined)
      } else setMessage({ tone: "error", text: reason })
      return false
    }
    if (next !== undefined) onChange(next)
    setTyped(undefined)
    setMessage(undefined)
    return true
  }
  const step = (up: boolean, shift: boolean) => {
    if (percent) {
      onChange({ percent: Math.max(0, value.percent + (up ? 1 : -1) * (shift ? 10 : 1)) })
      return
    }
    // A mode, or Auto, becomes Fixed at its measured size and steps from there.
    const from = fixed && !setBy ? value : (measured ?? 0)
    onChange(Math.max(4, nextSpacingStep(from, up, shift)))
  }
  const error = message?.tone === "error"
  const choose = (next: Size) => {
    setMessage(undefined)
    onChange(next)
  }
  const atMeasured = measured ?? (fixed ? value : 100)
  const menu = (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`${axis} unit and mode${unitLabel ? `: ${unitLabel}` : ""}`}
        className="grid h-full shrink-0 place-items-center rounded-r-md px-1.5 text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-popup-open:bg-accent"
      >
        {unitLabel ?? <ChevronDown className="size-3.5" />}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuRadioGroup
          value={mode}
          onValueChange={(mode) => {
            if (mode === "fixed") choose(atMeasured)
            else if (mode === "hug" || mode === "fill") choose(mode)
          }}
        >
          <DropdownMenuRadioItem value="fixed" className="text-xs">
            Fixed
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="hug" className="text-xs">
            Hug
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="fill" className="text-xs">
            Fill
          </DropdownMenuRadioItem>
          {setBy && (
            <DropdownMenuRadioItem value="auto" className="text-xs">
              Auto <span className="text-muted-foreground">set by {setBy}</span>
            </DropdownMenuRadioItem>
          )}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          value={(fixed && !setBy && unit) || (percent && "%") || ""}
          onValueChange={(next) => {
            if (next === "%") {
              choose({ percent: parent ? Math.round((atMeasured / parent) * 1000) / 10 : 100 })
              return
            }
            setUnit(next as "px" | "rem")
            if (!fixed || setBy) choose(atMeasured)
          }}
        >
          <DropdownMenuRadioItem value="px" className="text-xs">
            px
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="%" className="text-xs">
            %
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="rem" className="text-xs">
            rem
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="text-xs">More units</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-36">
            <DropdownMenuRadioGroup value={value === "min" || value === "max" ? value : ""}>
              <DropdownMenuRadioItem value="min" className="text-xs" onClick={() => choose("min")}>
                Min content
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="max" className="text-xs" onClick={() => choose("max")}>
                Max content
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        {onAddLimit && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-xs" disabled={limits?.min} onClick={() => onAddLimit("min")}>
              Add min
            </DropdownMenuItem>
            <DropdownMenuItem className="text-xs" disabled={limits?.max} onClick={() => onAddLimit("max")}>
              Add max
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <Hint
        label={setBy ? `${axis} is set by ${setBy}` : undefined}
        detail={setBy ? `${measured}px at this ratio` : undefined}
      >
        <div
          className={`flex h-7 min-w-0 items-center gap-1 rounded-md border bg-transparent pl-1.5 text-xs focus-within:ring-2 dark:bg-input/30 ${error ? "border-destructive focus-within:ring-destructive/40" : "focus-within:ring-ring"}`}
        >
          <span className="shrink-0 text-muted-foreground">{axis[0]}</span>
          <input
            aria-label={axis}
            aria-invalid={error || undefined}
            value={typed ?? shown}
            onFocus={(event) => {
              setFocused(true)
              if (message?.tone === "note") setMessage(undefined)
              event.currentTarget.select()
            }}
            onChange={(event) => setTyped(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && commit(false)) event.currentTarget.blur()
              if (event.key === "Escape" && typed !== undefined) {
                setTyped(undefined)
                setMessage(error ? { tone: "note", text: `${axis} is back to ${shown}.` } : undefined)
              }
              if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                event.preventDefault()
                setTyped(undefined)
                setMessage(undefined)
                step(event.key === "ArrowUp", event.shiftKey)
              }
            }}
            onBlur={() => {
              setFocused(false)
              commit(true)
            }}
            // It takes what's left after what the value comes to, so that shows, cut short when it's long.
            className={`w-0 min-w-8 flex-1 bg-transparent tabular-nums outline-none ${setBy && typed === undefined ? "text-muted-foreground" : ""}`}
          />
          {!focused && comesTo && (
            <span className="min-w-0 shrink truncate text-muted-foreground/70 tabular-nums">{comesTo}</span>
          )}
          {error && <CircleAlert aria-hidden className="size-3.5 shrink-0 text-destructive" />}
          {!focused && menu}
        </div>
      </Hint>
      {message && (
        <p
          role={error ? "alert" : "status"}
          className={`text-[11px] leading-snug ${error ? "text-destructive" : "text-muted-foreground"}`}
        >
          {message.text}
        </p>
      )}
    </div>
  )
}

/** The next whole spacing step up or down from a length (4px with Tailwind's default `--spacing`); ten with Shift. */
function nextSpacingStep(pixels: number, up: boolean, shift: boolean): number {
  const steps = (shift ? 10 : 1) * spacingPixels
  return up
    ? Math.floor(pixels / spacingPixels) * spacingPixels + steps
    : Math.ceil(pixels / spacingPixels) * spacingPixels - steps
}

/** Pixels in a whole spacing step, at Tailwind's default `--spacing` of 0.25rem. */
const spacingPixels = 4

/** Named ratios, as Tailwind names two of them (`aspect-square`, `aspect-video`). */
const namedRatios = [
  { value: "1 / 1", name: "Square" },
  { value: "4 / 3", name: undefined },
  { value: "16 / 9", name: "Video" },
  { value: "21 / 9", name: undefined }
]

/** `16 / 9` as the field shows it, `16:9`; a ratio typed as one number stays one. */
const ratioText = (aspect: string) => aspect.replace(/\s*\/\s*/, ":")

/** Reads `16:9`, `16/9`, `16x9` or `1.78` as CSS writes a ratio (`16 / 9`, `1.78`). */
function readRatio(text: string): string | undefined {
  const pair = /^\s*(\d+(?:\.\d+)?)\s*[:/x×]\s*(\d+(?:\.\d+)?)\s*$/i.exec(text)
  if (pair) return Number(pair[1]) > 0 && Number(pair[2]) > 0 ? `${Number(pair[1])} / ${Number(pair[2])}` : undefined
  const single = Number(text)
  return text.trim() !== "" && single > 0 ? String(single) : undefined
}

/**
 * The ratio, typed, with its name after it (Video) and the named ratios in its menu. A ratio it can't read stays, with
 * the reason under it; Enter keeps it, and Escape or leaving puts the ratio back and says so.
 */
function RatioField({ aspect, onChange }: { aspect: string; onChange: (aspect: string) => void }) {
  const [typed, setTyped] = useState<string>()
  const [message, setMessage] = useState<{ tone: "error" | "note"; text: string }>()
  const name = namedRatios.find((option) => option.value === aspect)?.name
  const error = message?.tone === "error"
  const commit = (leaving: boolean): boolean => {
    if (typed === undefined) return true
    const read = readRatio(typed)
    if (read) {
      onChange(read)
      setMessage(undefined)
    } else if (!leaving) {
      setMessage({ tone: "error", text: "Type a ratio, such as 16:9, 16/9 or 1.78" })
      return false
    } else {
      setMessage({ tone: "note", text: `The ratio is back to ${ratioText(aspect)}. Type one as 16:9, 16/9 or 1.78.` })
    }
    setTyped(undefined)
    return true
  }
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1">
        <label
          className={`flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-md border bg-transparent px-1.5 text-xs focus-within:ring-2 dark:bg-input/30 ${error ? "border-destructive focus-within:ring-destructive/40" : "focus-within:ring-ring"}`}
        >
          <input
            aria-label="Aspect ratio"
            aria-invalid={error || undefined}
            value={typed ?? ratioText(aspect)}
            onFocus={() => message?.tone === "note" && setMessage(undefined)}
            onChange={(event) => setTyped(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && commit(false)) event.currentTarget.blur()
              if (event.key === "Escape" && typed !== undefined) {
                setTyped(undefined)
                setMessage(error ? { tone: "note", text: `The ratio is back to ${ratioText(aspect)}.` } : undefined)
              }
            }}
            onBlur={() => commit(true)}
            className="w-16 min-w-0 flex-1 bg-transparent tabular-nums outline-none"
          />
          {name && typed === undefined && <span className="truncate text-muted-foreground">{name}</span>}
          {error && <CircleAlert aria-hidden className="size-3.5 shrink-0 text-destructive" />}
        </label>
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="Named ratios"
            className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-popup-open:bg-accent"
          >
            <ChevronDown className="size-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            <DropdownMenuRadioGroup value={aspect} onValueChange={(next) => onChange(next as string)}>
              {namedRatios.map((option) => (
                <DropdownMenuRadioItem key={option.value} value={option.value} className="text-xs">
                  {ratioText(option.value)}
                  {option.name && <span className="text-muted-foreground">{option.name}</span>}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {message && (
        <p
          role={error ? "alert" : "status"}
          className={`text-[11px] leading-snug ${error ? "text-destructive" : "text-muted-foreground"}`}
        >
          {message.text}
        </p>
      )}
    </div>
  )
}

/** A ratio as CSS writes it, `16 / 9`, in its lowest terms. */
function reducedRatio(width: number, height: number): string {
  const divisor = (a: number, b: number): number => (b === 0 ? a : divisor(b, a % b))
  const common = divisor(width, height) || 1
  return `${width / common} / ${height / common}`
}

/** Width over height, from `16 / 9`. */
function ratioOf(aspect: string): number | undefined {
  const [width, height = 1] = aspect.split("/").map((part) => Number(part.trim()))
  return width && height ? width / height : undefined
}

/** Corners in CSS's order, clockwise from the top left, as the file keeps them. */
const corners = ["Top left", "Top right", "Bottom right", "Bottom left"] as const
/** The corners' indices in reading order across the two-by-two grid of fields. */
const cornersAsLaidOut = [0, 1, 3, 2] as const

function AppearanceSection({
  draft,
  set,
  tokensOnly,
  fillPicker
}: SectionProps & { fillPicker?: "tokens" | "custom" }) {
  const perCorner = Array.isArray(draft.radius)
  const radii = Array.isArray(draft.radius) ? draft.radius : [draft.radius, draft.radius, draft.radius, draft.radius]
  return (
    <PanelSection title="Appearance">
      <div className="flex flex-col gap-1">
        <Field label="Fill">
          <ColorInput
            label="Fill"
            tokensOnly={tokensOnly}
            used={usedColors}
            value={draft.background}
            alpha={draft.backgroundAlpha}
            open={fillPicker !== undefined}
            tab={fillPicker}
            allowed={draft.backgroundAllowed}
            onAllow={(backgroundAllowed) => set({ backgroundAllowed })}
            onChange={(background, backgroundAlpha) =>
              set({ background, backgroundAlpha, backgroundAllowed: undefined })
            }
          />
        </Field>
        <Field label="Radius">
          <div className="flex items-start gap-1">
            {perCorner ? (
              <div className="grid min-w-0 flex-1 grid-cols-2 gap-1">
                {/* Laid out where each corner is: the top two, then bottom left and bottom right. */}
                {cornersAsLaidOut.map((index) => (
                  <RadiusChoice
                    key={index}
                    label={`${corners[index]} radius`}
                    corner={index}
                    value={radii[index]}
                    onChange={(value) => {
                      const next = [...radii] as [string?, string?, string?, string?]
                      next[index] = value
                      set({ radius: next })
                    }}
                  />
                ))}
              </div>
            ) : (
              <div className="min-w-0 flex-1">
                <RadiusChoice
                  label="Radius"
                  value={draft.radius as string | undefined}
                  onChange={(radius) => set({ radius })}
                />
              </div>
            )}
            <Hint label="Radius per corner">
              <Toggle
                size="sm"
                className="size-7 min-w-7 shrink-0 p-0"
                aria-label="Radius per corner"
                pressed={perCorner}
                onPressedChange={(on) => set({ radius: on ? ([...radii] as Draft["radius"]) : radii[0] })}
              >
                <SquareRoundCorner />
              </Toggle>
            </Hint>
          </div>
        </Field>
        <Field label="Blur" hint="Blurs the layer itself">
          <BlurChoice label="Blur" value={draft.blur} onChange={(blur) => set({ blur })} />
        </Field>
        <Field label="Backdrop blur" hint="Blurs what shows through the layer, for frosted glass">
          <BlurChoice
            label="Backdrop blur"
            value={draft.backdropBlur}
            onChange={(backdropBlur) => set({ backdropBlur })}
          />
        </Field>
      </div>
    </PanelSection>
  )
}

/** A radius token, with a corner mark inside when it's one corner's. */
function RadiusChoice({
  label,
  corner,
  value,
  onChange
}: {
  label: string
  corner?: number
  value: string | undefined
  onChange: (value: string | undefined) => void
}) {
  const shape = (
    <span
      aria-hidden
      className="size-3 shrink-0 border-muted-foreground"
      style={
        corner === undefined
          ? { borderWidth: 1.5, borderRadius: 3 }
          : {
              [["borderTop", "borderTop", "borderBottom", "borderBottom"][corner]!]: "1.5px solid",
              [["borderLeft", "borderRight", "borderRight", "borderLeft"][corner]!]: "1.5px solid",
              [["borderTopLeftRadius", "borderTopRightRadius", "borderBottomRightRadius", "borderBottomLeftRadius"][
                corner
              ]!]: 5
            }
      }
    />
  )
  return (
    <TokenChoice
      label={label}
      icon={shape}
      // A corner's field is narrow, so what its token comes to shows in the hover rather than after it.
      narrow={corner !== undefined}
      value={value}
      tokens={radiusTokens.map((token) => ({ name: token.name, detail: token.px === 9999 ? "Full" : `${token.px}px` }))}
      short={(name) => name.replace("radius-", "")}
      onChange={onChange}
    />
  )
}

function BlurChoice({
  label,
  value,
  onChange
}: {
  label: string
  value: string | undefined
  onChange: (value: string | undefined) => void
}) {
  return (
    <TokenChoice
      label={label}
      value={value}
      tokens={blurTokens.map((token) => ({ name: token.name, detail: `${token.px}px` }))}
      short={(name) => name.replace("blur-", "")}
      onChange={onChange}
    />
  )
}

/**
 * A short list of tokens of one kind, with None. The token shows as a chip, then what it comes to, faintly (`lg 10px`);
 * in a narrow field (`narrow`, under about 96px), what it comes to is in the hover instead.
 */
function TokenChoice({
  label,
  icon,
  narrow = false,
  value,
  tokens,
  short = (name) => name,
  onChange
}: {
  label: string
  icon?: ReactNode
  narrow?: boolean
  value: string | undefined
  tokens: { name: string; detail: string }[]
  short?: (name: string) => string
  onChange: (value: string | undefined) => void
}) {
  const [open, setOpen] = useState(false)
  const comesTo = tokens.find((token) => token.name === value)?.detail
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Hint label={value ? `${label}: ${value}` : undefined} detail={narrow ? comesTo : undefined} hidden={open} wait>
        <PopoverTrigger
          render={
            <Button
              variant="outline"
              size="sm"
              aria-label={`${label}: ${value ?? "none"}`}
              className="h-7 w-full min-w-0 justify-start gap-1.5 px-1 text-xs font-normal"
            >
              {value ? (
                // A token is a chip on a tinted background, named without the namespace the field implies (lg in Radius).
                <span className="flex min-w-0 items-center gap-1.5 rounded-sm bg-accent px-1 py-0.5">
                  {icon}
                  <span className="truncate font-mono">{short(value)}</span>
                </span>
              ) : (
                <span className="flex min-w-0 items-center gap-1.5 px-1 text-muted-foreground">
                  {icon}
                  None
                </span>
              )}
              {value && !narrow && comesTo && (
                <span className="truncate text-muted-foreground/70 tabular-nums">{comesTo}</span>
              )}
            </Button>
          }
        />
      </Hint>
      <PopoverContent className="w-52 gap-0 p-1" align="start">
        {[{ name: undefined, detail: "" }, ...tokens].map((token) => (
          <button
            key={token.name ?? "none"}
            type="button"
            onClick={() => {
              onChange(token.name)
              setOpen(false)
            }}
            className={`flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-accent ${token.name === value ? "bg-accent" : ""}`}
          >
            <span className={`min-w-0 flex-1 truncate font-mono ${token.name ? "" : "text-muted-foreground"}`}>
              {token.name ?? "None"}
            </span>
            <span className="text-muted-foreground tabular-nums">{token.detail}</span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  )
}

const sides = ["Top", "Right", "Bottom", "Left"] as const

/** Figma's stroke sides: every side, one side alone, or each side its own (Custom). */
type SideMode = "all" | "top" | "right" | "bottom" | "left" | "custom"

const sideNames = { top: "Top", right: "Right", bottom: "Bottom", left: "Left" } as const

const sideOptions = [
  { value: "all", label: "All", Icon: Square },
  { value: "top", label: "Top", Icon: PanelTop },
  { value: "bottom", label: "Bottom", Icon: PanelBottom },
  { value: "left", label: "Left", Icon: PanelLeft },
  { value: "right", label: "Right", Icon: PanelRight },
  { value: "custom", label: "Custom", Icon: SquareDashed }
] as const satisfies readonly { value: SideMode; label: string; Icon: unknown }[]

/** Which of the menu's choices a stroke width is: one width, one side alone, or anything else. */
function sideModeOf(width: Draft["borderWidth"]): SideMode {
  if (!Array.isArray(width)) return "all"
  const stroked = width.flatMap((side, index) => (side > 0 ? [index] : []))
  if (stroked.length === 1) return (["top", "right", "bottom", "left"] as const)[stroked[0]!]!
  return "custom"
}

/** The widths for a choice: one width for All, one side's width alone, or the four as they are for Custom. */
function widthsFor(mode: SideMode, width: number, current?: readonly number[]): Draft["borderWidth"] {
  if (mode === "all") return width
  if (mode === "custom") return (current ? [...current] : [width, width, width, width]) as Draft["borderWidth"]
  return sides.map((side) => (side === sideNames[mode] ? width : 0)) as Draft["borderWidth"]
}

/** The button after Width that picks which sides are stroked, as Figma's stroke sides menu does. */
function SidesMenu({ mode, onChange }: { mode: SideMode; onChange: (mode: SideMode) => void }) {
  const Icon = sideOptions.find((option) => option.value === mode)!.Icon
  return (
    <DropdownMenu>
      <Hint label="Stroke sides">
        <DropdownMenuTrigger
          aria-label={`Stroke sides: ${sideOptions.find((option) => option.value === mode)!.label}`}
          className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-popup-open:bg-accent"
        >
          <Icon className="size-4" />
        </DropdownMenuTrigger>
      </Hint>
      <DropdownMenuContent align="end" className="w-36">
        <DropdownMenuRadioGroup value={mode} onValueChange={(next) => onChange(next as SideMode)}>
          {sideOptions.map(({ value, label, Icon: OptionIcon }) => (
            <DropdownMenuRadioItem key={value} value={value} className="gap-2 text-xs">
              <OptionIcon className="size-3.5" />
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * Stroke, a title with + until it's set, as PAR-652's panel starts Fill, Stroke and Effects. + adds the project's usual
 * stroke, `border-border` at 1px, and − takes it off.
 */
function StrokeSection({ draft, set, tokensOnly }: SectionProps) {
  // Custom stays chosen while one side is stroked, which the widths alone would read as that side.
  const [custom, setCustom] = useState(false)
  const sideMode = custom ? "custom" : sideModeOf(draft.borderWidth)
  const widths = Array.isArray(draft.borderWidth)
    ? draft.borderWidth
    : ([0, 0, 0, 0].map(() => (draft.borderWidth as number | undefined) ?? 1) as [number, number, number, number])
  const stroked = draft.border !== undefined || draft.borderWidth !== undefined
  const action = (
    <Hint label={stroked ? "Remove stroke" : "Add stroke"}>
      <Button
        variant="ghost"
        size="icon-sm"
        className="size-6"
        aria-label={stroked ? "Remove stroke" : "Add stroke"}
        onClick={() => {
          setCustom(false)
          set(
            stroked
              ? { border: undefined, borderAlpha: undefined, borderAllowed: undefined, borderWidth: undefined }
              : { border: "border", borderWidth: 1 }
          )
        }}
      >
        {stroked ? <Minus /> : <Plus />}
      </Button>
    </Hint>
  )
  if (!stroked) {
    return (
      <PanelSection title="Stroke" action={action}>
        {null}
      </PanelSection>
    )
  }
  return (
    <PanelSection title="Stroke" action={action}>
      <div className="flex flex-col gap-1">
        <Field label="Color">
          <ColorInput
            label="Stroke"
            tokensOnly={tokensOnly}
            used={usedColors}
            value={draft.border}
            alpha={draft.borderAlpha}
            allowed={draft.borderAllowed}
            onAllow={(borderAllowed) => set({ borderAllowed })}
            onChange={(border, borderAlpha) => set({ border, borderAlpha, borderAllowed: undefined })}
          />
        </Field>
        <Field label="Width">
          <div className="flex items-start gap-1">
            {sideMode === "custom" && (
              <div className="grid min-w-0 flex-1 grid-cols-2 gap-1">
                {sides.map((side, index) => (
                  <Num
                    key={side}
                    label={`${side} stroke width`}
                    inner={side[0]}
                    pixels
                    narrow
                    value={widths[index]}
                    min={0}
                    onChange={(value) => {
                      const next = [...widths] as [number, number, number, number]
                      next[index] = value ?? 0
                      set({ borderWidth: next })
                    }}
                  />
                ))}
              </div>
            )}
            {sideMode !== "custom" && (
              <div className="min-w-0 flex-1">
                <Num
                  label={sideMode === "all" ? "Stroke width" : `${sideNames[sideMode]} stroke width`}
                  inner={sideMode === "all" ? undefined : sideNames[sideMode][0]}
                  pixels
                  value={sideMode === "all" ? widths[0] : widths[sides.indexOf(sideNames[sideMode])]}
                  min={0}
                  onChange={(value) => set({ borderWidth: widthsFor(sideMode, value ?? 1) })}
                />
              </div>
            )}
            <SidesMenu
              mode={sideMode}
              onChange={(mode) => {
                setCustom(mode === "custom")
                set({ borderWidth: widthsFor(mode, Math.max(...widths) || 1, widths) })
              }}
            />
          </div>
        </Field>
      </div>
    </PanelSection>
  )
}

const tagOptions = [
  { value: "h1", label: "Heading 1" },
  { value: "h2", label: "Heading 2" },
  { value: "h3", label: "Heading 3" },
  { value: "h4", label: "Heading 4" },
  { value: "h5", label: "Heading 5" },
  { value: "h6", label: "Heading 6" },
  { value: "label", label: "Label" },
  { value: "span", label: "Inline text" },
  { value: "strong", label: "Strong" }
]

function TextSection({ draft, set }: SectionProps) {
  return (
    <PanelSection title="Text" description="The headline inside Plans.">
      <Field label="Tag" hint="The element the text is: what screen readers and search engines read it as">
        <ChoiceInput value={draft.tag} options={tagOptions} placeholder="Paragraph" onChange={(tag) => set({ tag })} />
      </Field>
    </PanelSection>
  )
}

/** The design's frame, typed: its width and height in this viewport. */
function FrameSection({
  frame,
  onChange
}: {
  frame: { width: number; height: number | undefined }
  onChange: (frame: { width: number; height: number | undefined }) => void
}) {
  return (
    <PanelSection title="Frame" description="Pricing's size in Desktop. Dragging the frame's edges sets it too.">
      <div className="flex flex-col gap-1">
        <Field label="Size">
          <div className="grid grid-cols-2 gap-1">
            <Num
              label="Frame width"
              inner="W"
              pixels
              value={frame.width}
              min={1}
              onChange={(width) => onChange({ ...frame, width: width ?? 1280 })}
            />
            <Num
              label="Frame height"
              inner="H"
              pixels
              value={frame.height}
              placeholder="Hug"
              min={1}
              onChange={(height) => onChange({ ...frame, height })}
            />
          </div>
        </Field>
        <Field label="Preset">
          <ChoiceInput
            value={presets.find((preset) => preset.width === frame.width)?.label}
            options={presets.map((preset) => ({ value: preset.label, label: `${preset.label}, ${preset.width}` }))}
            placeholder="Custom"
            onChange={(label) => {
              const preset = presets.find((other) => other.label === label)
              if (preset) onChange({ ...frame, width: preset.width })
            }}
          />
        </Field>
      </div>
    </PanelSection>
  )
}

const presets = [
  { label: "Desktop", width: 1280 },
  { label: "Laptop", width: 1024 },
  { label: "Tablet", width: 768 },
  { label: "Phone", width: 390 }
]

/**
 * A number typed, committed on Enter or blur, with a short label inside and a unit after, hidden while focused. A
 * length in pixels (`pixels`) is shown in px or rem, switched by the unit after it as the canvas's type box switches,
 * and takes either typed (`1rem`, `16px`); it's kept in pixels whichever is shown, so 16px becomes 1rem. A spacing
 * length (`spacing`) steps to the next whole spacing step (4px) on Up and Down; others step by 1, or 10 with Shift.
 *
 * In a narrow field (`narrow`, under about 96px, as sides are), the unit shows only on hover. Input it can't read
 * stays, outlined in the error color with a mark in the status slot and the reason under it; Enter keeps it, and
 * Escape or leaving puts the value back and says so.
 */
function Num({
  label,
  inner,
  suffix,
  pixels = false,
  spacing = false,
  narrow = false,
  value,
  placeholder = "0",
  min = 0,
  onChange
}: {
  label: string
  inner?: string
  suffix?: string
  pixels?: boolean
  spacing?: boolean
  narrow?: boolean
  value: number | undefined
  placeholder?: string
  min?: number
  onChange: (value: number | undefined) => void
}) {
  const [typed, setTyped] = useState<string>()
  const [focused, setFocused] = useState(false)
  const [unit, setUnit] = useState<"px" | "rem">("px")
  const [message, setMessage] = useState<{ tone: "error" | "note"; text: string }>()
  const inRem = pixels && unit === "rem"
  let shown = value === undefined ? "" : String(value)
  if (inRem && value !== undefined) shown = String(Number((value / remPixels).toFixed(3)))
  const other = unit === "px" ? "rem" : "px"
  const switchable = pixels && value !== undefined
  const error = message?.tone === "error"
  const takes = pixels ? "a length in px or rem" : "a number"
  const read = (text: string): number | undefined | "unreadable" => {
    if (text.trim() === "") return undefined
    const match = /^\s*(-?\d*\.?\d+)\s*(px|rem)?\s*$/i.exec(text)
    if (!match || (match[2] && !pixels)) return "unreadable"
    const inRems = (match[2]?.toLowerCase() ?? unit) === "rem" && pixels
    return Math.max(min, Math.round(Number(match[1]) * (inRems ? remPixels : 1)))
  }
  const commit = (leaving: boolean): boolean => {
    if (typed === undefined) return true
    const next = read(typed)
    if (next === "unreadable") {
      if (!leaving) {
        setMessage({ tone: "error", text: `${label} takes ${takes}` })
        return false
      }
      setMessage({ tone: "note", text: `${label} is back to ${shown || placeholder}. It takes ${takes}.` })
    } else {
      onChange(next)
      setMessage(undefined)
    }
    setTyped(undefined)
    return true
  }
  let after: ReactNode
  if (error) after = <CircleAlert aria-hidden className="mr-1.5 size-3.5 shrink-0 text-destructive" />
  else if (focused) after = undefined
  else if (switchable)
    after = (
      <Hint label={`Show in ${other}`}>
        <button
          type="button"
          aria-label={`${unit}, switch to ${other}`}
          onClick={(event) => {
            event.preventDefault()
            setUnit(other)
          }}
          className={`h-full shrink-0 rounded-r-md px-1.5 text-muted-foreground hover:bg-accent hover:text-foreground ${narrow ? "hidden group-hover/num:block" : ""}`}
        >
          {unit}
        </button>
      </Hint>
    )
  else if (suffix) after = <span className="shrink-0 pr-1.5 text-muted-foreground">{suffix}</span>
  return (
    <>
      <label
        className={`group/num flex h-7 min-w-0 items-center gap-1 rounded-md border bg-transparent pl-1.5 text-xs focus-within:ring-2 dark:bg-input/30 ${error ? "border-destructive focus-within:ring-destructive/40" : "focus-within:ring-ring"} ${switchable || error ? "" : "pr-1.5"}`}
      >
        {inner && <span className="shrink-0 text-muted-foreground">{inner}</span>}
        <input
          aria-label={label}
          aria-invalid={error || undefined}
          inputMode="decimal"
          placeholder={placeholder}
          value={typed ?? shown}
          onFocus={() => {
            setFocused(true)
            if (message?.tone === "note") setMessage(undefined)
          }}
          onChange={(event) => setTyped(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && commit(false)) event.currentTarget.blur()
            if (event.key === "Escape" && typed !== undefined) {
              setTyped(undefined)
              setMessage(error ? { tone: "note", text: `${label} is back to ${shown || placeholder}.` } : undefined)
            }
            if (event.key === "ArrowUp" || event.key === "ArrowDown") {
              event.preventDefault()
              setTyped(undefined)
              setMessage(undefined)
              const up = event.key === "ArrowUp"
              const from = value ?? Math.max(min, 0)
              const next = spacing
                ? nextSpacingStep(from, up, event.shiftKey)
                : from + (up ? 1 : -1) * (event.shiftKey ? 10 : 1)
              onChange(Math.max(min, next))
            }
          }}
          onBlur={() => {
            setFocused(false)
            commit(true)
          }}
          className="w-full min-w-0 bg-transparent tabular-nums outline-none placeholder:text-muted-foreground"
        />
        {after}
      </label>
      {message && (
        // A row of fields lays this out under the whole row, as the app's fields say things under the row.
        <p
          role={error ? "alert" : "status"}
          className={`col-span-full text-[11px] leading-snug ${error ? "text-destructive" : "text-muted-foreground"}`}
        >
          {message.text}
        </p>
      )}
    </>
  )
}

/** Pixels in a rem, as the inspector's fields count them. */
const remPixels = 16

/* The canvas's stand-ins. */

const rgba = (hex: string | undefined, alpha: number | undefined): string | undefined => {
  if (!hex) return undefined
  if (alpha === undefined) return hex
  return `color-mix(in srgb, ${hex} ${alpha}%, transparent)`
}

const flipped = { start: "end", center: "center", end: "start" } as const
const flexValues = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  stretch: "stretch",
  baseline: "baseline",
  "last baseline": "last baseline"
} as const

/** A grid child's own size: unset or Fill stretches it across its cell, which writes nothing. */
const cellSize = (size: Size | undefined) => (size === undefined || size === "fill" ? undefined : sizeCss(size))

const px = (pixels: number | undefined) => (pixels === undefined ? undefined : `${pixels}px`)

/** CSS's grid-template-columns for the columns: the tracks, or as many as fit, each at least the width given. */
function columnsCss(columns: Columns | undefined): string | undefined {
  if (columns === undefined) return undefined
  if (Array.isArray(columns)) return columns.map(trackCss).join(" ")
  return `repeat(auto-fit, minmax(${columns.fit}px, 1fr))`
}

function LayerPreview({
  draft,
  childSelected,
  onSelectChild
}: {
  draft: Draft
  childSelected: boolean
  onSelectChild: (selected: boolean) => void
}) {
  const grid = draft.columns !== undefined
  const radii = Array.isArray(draft.radius) ? draft.radius : [draft.radius, draft.radius, draft.radius, draft.radius]
  const widths = Array.isArray(draft.borderWidth) ? draft.borderWidth : [0, 0, 0, 0].map(() => draft.borderWidth ?? 0)
  const Tag = (draft.tag ?? "p") as "p"
  const direction = `${draft.direction ?? "column"}${draft.reverse ? "-reverse" : ""}` as const
  // The box is physical, so a reversed layout writes the other end: its top is flex-end.
  const justify = draft.reverse ? flipped[draft.justify ?? "start"] : (draft.justify ?? "start")
  const style: CSSProperties = {
    display: grid ? "grid" : "flex",
    flexDirection: grid ? undefined : direction,
    flexWrap: draft.wrap ? "wrap" : undefined,
    justifyContent: grid ? undefined : flexValues[justify],
    alignItems: grid ? undefined : flexValues[draft.align ?? "stretch"],
    gridTemplateColumns: columnsCss(draft.columns),
    gridTemplateRows: draft.rows?.length ? draft.rows.map(trackCss).join(" ") : undefined,
    gap: 12,
    padding: 20,
    width: sizeCss(draft.width ?? 520),
    // A ratio only takes hold when one axis is left to it.
    height: draft.aspect ? undefined : sizeCss(draft.height),
    minWidth: px(draft.minWidth),
    maxWidth: px(draft.maxWidth) ?? "100%",
    minHeight: px(draft.minHeight),
    maxHeight: px(draft.maxHeight),
    aspectRatio: draft.aspect,
    background: rgba(hexOf(draft.background), draft.backgroundAlpha),
    borderColor: rgba(hexOf(draft.border), draft.borderAlpha) ?? "transparent",
    borderStyle: "solid",
    borderWidth: widths.map((width) => `${width}px`).join(" "),
    borderRadius: radii.map((radius) => `${Math.min(radiusPx(radius), 200)}px`).join(" "),
    filter: draft.blur ? `blur(${blurPx(draft.blur)}px)` : undefined,
    backdropFilter: draft.backdropBlur ? `blur(${blurPx(draft.backdropBlur)}px)` : undefined,
    color: "#0a0a0a"
  }
  return (
    // Plans' parent, wider than Plans, so Fill and a percentage show; it hugs Plans' height.
    <div className="relative flex w-full max-w-[680px] justify-center">
      {/* Shapes behind the layer, so a backdrop blur and a translucent fill show. */}
      <div aria-hidden className="absolute -inset-10 overflow-hidden rounded-3xl">
        <div className="absolute top-4 left-6 size-40 rounded-full bg-[#f54900]" />
        <div className="absolute right-10 bottom-2 size-48 rounded-full bg-[#009689]" />
        <div className="absolute top-1/3 left-1/2 size-28 rotate-12 bg-[#ffb900]" />
      </div>
      <section
        aria-label="Plans"
        className="relative outline outline-1 outline-offset-0 outline-[#0d99ff]"
        style={style}
      >
        <Tag className="m-0 text-base font-semibold" style={grid ? { gridColumn: "1 / -1" } : undefined}>
          Simple pricing for every team
        </Tag>
        {["Hobby", "Pro plan", "Team"].map((name) => {
          const pro = name === "Pro plan"
          return (
            <button
              key={name}
              type="button"
              data-layer={name}
              aria-pressed={pro && childSelected}
              onClick={() => onSelectChild(pro ? !childSelected : false)}
              className={`rounded-lg border border-black/10 bg-white/80 p-3 text-left text-sm ${pro && childSelected ? "outline-2 outline-[#0d99ff]" : ""}`}
              style={
                grid && pro
                  ? {
                      gridColumn: placementCss(
                        draft.colStart,
                        draft.colSpan,
                        draft.endLines ? draft.colEnd : undefined
                      ),
                      gridRow: placementCss(draft.rowStart, draft.rowSpan, draft.endLines ? draft.rowEnd : undefined),
                      alignSelf: draft.alignSelf,
                      justifySelf: draft.justifySelf,
                      width: cellSize(draft.childWidth),
                      height: cellSize(draft.childHeight)
                    }
                  : { fontSize: pro ? 20 : 14 }
              }
            >
              {name}
            </button>
          )
        })}
      </section>
    </div>
  )
}

function FramePreview({ width, height }: { width: number; height: number | undefined }) {
  const scale = 0.4
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">
        Pricing · Desktop · {width} × {height ?? "hug"}
      </span>
      <div
        className="flex flex-col gap-3 overflow-hidden border bg-white p-6 shadow-sm"
        style={{ width: width * scale, height: height === undefined ? undefined : height * scale }}
      >
        <div className="h-3 w-24 rounded bg-neutral-800" />
        <div className="h-2 w-40 rounded bg-neutral-300" />
        <div className="grid grid-cols-3 gap-2">
          {[0, 1, 2].map((index) => (
            <div key={index} className="h-20 rounded border bg-neutral-50" />
          ))}
        </div>
      </div>
    </div>
  )
}
