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
  ToggleGroupItem
} from "@buildkitgg/shadcn-baseui-kit"
import {
  ArrowDown,
  ArrowDownUp,
  ArrowRight,
  Baseline,
  ChevronDown,
  Ellipsis,
  Grid3x3,
  LayoutTemplate,
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
  Squircle,
  WrapText,
  X
} from "lucide-react"
import { type CSSProperties, type ReactNode, useEffect, useState } from "react"
import { kindColors } from "../../canvas/kinds.tsx"
import { ChoiceInput, Field } from "../../chrome/fields.tsx"
import { Hint } from "../../chrome/Hint.tsx"
import { PanelSection } from "../../chrome/PanelSection.tsx"
import { ColorInput } from "./color-picker.tsx"
import { formatNumber, remPx, type SpotValue, spotKeywords, stepSpacing } from "./css-values.ts"
import {
  type Columns,
  type Draft,
  type Length,
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
import {
  MissingMark,
  nearestToken,
  notAToken,
  OffSystemMark,
  type Reading,
  type ScrubKeys,
  TokenMark,
  unitButtonClass,
  useTokens,
  useTokenSets,
  ValueField
} from "./field-parts.tsx"
import { drawnStyle, PreviewStage } from "./playground.tsx"
import { NineSpots } from "./position-box.tsx"
import { lengthToken } from "./tokens.ts"
import { readLength } from "./typing.ts"
import type { StrokePosition } from "./writes.ts"

/*
 * The styling controls for PAR-186, each tried on its own in its story (Parity/Explorations/Design panel controls),
 * as PAR-652's design options pages specify them. A section here is one control with its rows; LayerPreview is the
 * canvas's stand-in, which measures what Hug and Fill come to.
 */

/** What a section's controls change: one style, and the project's Tokens only setting. */
export interface SectionProps {
  draft: Draft
  set: (change: Partial<Draft>) => void
  tokensOnly?: boolean
  /** The selected layers differ here, so an unset field shows Mixed. */
  mixed?: boolean
  /** Set in the state shown (Hover, say), with the way back to the first state's value. */
  changed?: { onReset: () => void }
}

/**
 * Layout, as PAR-652's panel lays it out: Type with Wrap beside it, and Reverse once it's set from More; the nine-spot
 * box, which stays physical when reversed, with Baseline under it in a row; and a grid's columns as a count until its
 * tracks are edited.
 */
export function LayoutSection({ draft, set }: SectionProps) {
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

/** Where a spot of the box sits along an axis of the layout: its start, its center or its end. */
const flexPlace: Record<SpotValue, "start" | "center" | "end"> = { 0: "start", 50: "center", 100: "end" }

/**
 * The nine-spot box, physical: the top-left spot is the top left whichever way the layout runs. A reversed layout
 * keeps it so, and what's written flips (flex-end for the top of a reversed column), as Webflow's box does.
 */
function AlignmentBox({ draft, set }: Pick<SectionProps, "draft" | "set">) {
  const column = (draft.direction ?? "column") === "column"
  const justify = draft.justify ?? "start"
  // Unset is stretch, which no spot shows, as in the app's box.
  const align = draft.align ?? "stretch"
  // Stretched or on the baseline, children fill the cross axis, so the whole line at their end is lit.
  const fillsAcross = align === "stretch" || isBaseline(align)
  // A column runs down, so rows are its main axis; a row runs across, so columns are.
  const placeOf = (spot: { x: SpotValue; y: SpotValue }) => ({
    main: column ? flexPlace[spot.y] : flexPlace[spot.x],
    cross: column ? flexPlace[spot.x] : flexPlace[spot.y]
  })
  return (
    <NineSpots
      label="Alignment"
      lit={(spot) => {
        const { main, cross } = placeOf(spot)
        return justify === main && (fillsAcross || align === cross)
      }}
      spotName={(spot) => `Align ${spotKeywords(spot)}`}
      onSpot={(spot) => {
        const { main, cross } = placeOf(spot)
        set({ justify: main, align: isBaseline(draft.align) ? draft.align : cross })
      }}
    />
  )
}

const isBaseline = (align: Draft["align"]) => align === "baseline" || align === "last baseline"

const fr = (value: number): Track => ({ kind: "fr", value })

/**
 * A grid's columns: a list of tracks, or with Repeat to fit, as many as fit the width, each at least the width given,
 * the responsive grid Webflow calls auto-fit.
 */
export function ColumnsField({
  columns,
  onChange
}: {
  columns: Columns | undefined
  onChange: (columns: Columns) => void
}) {
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
export function TracksField({
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
export function ChildSizeSection({ draft, set }: SectionProps) {
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
        {/* Unset shows what it comes to, muted: the grid stretches Pro plan, or starts it once it has a size that way. */}
        <Field label="Align self" hint="Where Pro plan sits in its cell, top to bottom. Unset follows Plans' grid.">
          <ChoiceInput
            value={draft.alignSelf}
            options={[...selfOptions.align]}
            placeholder={(draft.childHeight ?? "fill") === "fill" ? "Stretch" : "Top"}
            onChange={(alignSelf) => set({ alignSelf: alignSelf as SelfAlign | undefined })}
          />
        </Field>
        <Field label="Justify self" hint="Where Pro plan sits in its cell, left to right. Unset follows Plans' grid.">
          <ChoiceInput
            value={draft.justifySelf}
            options={[...selfOptions.justify]}
            placeholder={(draft.childWidth ?? "fill") === "fill" ? "Stretch" : "Left"}
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
export function SizeSection({ draft, set }: SectionProps) {
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

/** Up and Down's count of steps: one, or ten with Shift. */
const stepCount = (up: boolean, { shift }: ScrubKeys) => (up ? 1 : -1) * (shift ? 10 : 1)

/**
 * A width or height with its mode, as PAR-652's Size type has it. A length shows its number and unit; a mode shows in
 * words, with what it comes to after it, faintly (Hug 248). The unit is a button that opens the field's menu. Typing a
 * length makes it Fixed, as in Figma, and Up or Down on a mode makes it Fixed at its measured size and steps from there,
 * a whole spacing step (4px) at a time.
 */
export function SizeField({
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
  const [unit, setUnit] = useState<"px" | "rem">("px")
  const fixed = typeof value === "number"
  const percent = typeof value === "object"
  let shown = ""
  if (setBy) shown = "Auto"
  else if (fixed) shown = unit === "rem" ? formatNumber(value / remPx) : String(value)
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
  /**
   * What's typed: Hug or Fill by name; a length with the app's maths and units (`+8`, `*2`, `1.5rem`, `spacing-4`),
   * where a bare number is in the unit shown; or a percentage, CSS's (call 10). Nothing typed keeps the size.
   */
  const read = (text: string): Reading<Size | undefined> => {
    const word = text.trim().toLowerCase()
    if (word === "") return { value: undefined }
    if (word === "hug" || word === "fit") return { value: "hug" }
    if (word === "fill") return { value: "fill" }
    const bare = /^-?(\d*\.?\d+)$/.test(word)
    let input = word
    if (bare && percent) input = `${word}%`
    else if (bare && unit === "rem") input = `${word}rem`
    const reading = readLength(input, { label: axis, current: fixed && !setBy ? value : measured, takesPercent: true })
    if ("reason" in reading) return { reason: reading.reason.startsWith("Can't read") ? reason : reading.reason }
    if ("clear" in reading) return { reason }
    if ("percent" in reading) return { value: { percent: Math.max(0, Math.round(reading.percent * 10) / 10) } }
    if (/rem\s*$/.test(word)) setUnit("rem")
    else if (/px\s*$/.test(word)) setUnit("px")
    return { value: Math.max(1, reading.px) }
  }
  const step = (up: boolean, keys: ScrubKeys) => {
    if (percent) {
      onChange({ percent: Math.max(0, value.percent + stepCount(up, keys)) })
      return
    }
    // A mode, or Auto, becomes Fixed at its measured size and steps from there.
    const from = fixed && !setBy ? value : (measured ?? 0)
    onChange(Math.max(4, stepSpacing(from, stepCount(up, keys))))
  }
  const atMeasured = measured ?? (fixed ? value : 100)
  const menu = (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`${axis} unit and mode${unitLabel ? `: ${unitLabel}` : ""}`}
        className={unitButtonClass}
      >
        {unitLabel ?? <ChevronDown className="size-3.5" />}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuRadioGroup
          value={mode}
          onValueChange={(next) => {
            if (next === "fixed") onChange(atMeasured)
            else if (next === "hug" || next === "fill") onChange(next)
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
              onChange({ percent: parent ? Math.round((atMeasured / parent) * 1000) / 10 : 100 })
              return
            }
            setUnit(next as "px" | "rem")
            if (!fixed || setBy) onChange(atMeasured)
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
              <DropdownMenuRadioItem value="min" className="text-xs" onClick={() => onChange("min")}>
                Min content
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="max" className="text-xs" onClick={() => onChange("max")}>
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
    <div className="flex min-w-0 flex-col">
      <ValueField
        label={axis}
        inner={axis[0]}
        // Dragging W or H scrubs the size a spacing step per 2 screen pixels, making a mode Fixed first.
        scrub={{
          from: () => (fixed && !setBy ? value : (measured ?? 0)),
          apply: (px) => onChange(px),
          by: { spacing: true, min: 1 }
        }}
        shown={shown}
        muted={setBy !== undefined}
        unit={menu}
        comesTo={comesTo}
        hint={setBy ? { label: `${axis} is set by ${setBy}`, detail: `${measured}px at this ratio` } : undefined}
        selectOnFocus
        read={read}
        onCommit={(next) => {
          if (next !== undefined) onChange(next)
        }}
        onStep={step}
      />
    </div>
  )
}

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
 * The ratio, typed, with its name after it (Video) and the named ratios in its unit's menu. A ratio it can't read
 * stays, with the reason under it; Enter keeps it, and Escape or leaving puts the ratio back and says so.
 */
export function RatioField({ aspect, onChange }: { aspect: string; onChange: (aspect: string) => void }) {
  const name = namedRatios.find((option) => option.value === aspect)?.name
  return (
    <ValueField
      label="Aspect ratio"
      shown={ratioText(aspect)}
      comesTo={name}
      inputMode="text"
      unit={
        <DropdownMenu>
          <DropdownMenuTrigger aria-label="Named ratios" className={unitButtonClass}>
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
      }
      read={(text): Reading<string> => {
        const ratio = readRatio(text)
        return ratio ? { value: ratio } : { reason: "Type a ratio, such as 16:9, 16/9 or 1.78" }
      }}
      onCommit={onChange}
    />
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

export function AppearanceSection({ draft, set, tokensOnly, mixed, changed }: SectionProps) {
  const perCorner = Array.isArray(draft.radius)
  const radii = Array.isArray(draft.radius) ? draft.radius : [draft.radius, draft.radius, draft.radius, draft.radius]
  return (
    <PanelSection title="Appearance">
      <div className="flex flex-col gap-1">
        <Field label="Radius" changed={changed !== undefined} onReset={changed?.onReset}>
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
                    tokensOnly={tokensOnly}
                    mixed={mixed}
                    onChange={(value) => {
                      const next = [...radii] as [Length?, Length?, Length?, Length?]
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
                  value={Array.isArray(draft.radius) ? undefined : draft.radius}
                  tokensOnly={tokensOnly}
                  mixed={mixed}
                  onChange={(radius) => set({ radius })}
                />
              </div>
            )}
            <div className="flex shrink-0 flex-col gap-1">
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
              <CornerShape value={draft.cornerShape} onChange={(cornerShape) => set({ cornerShape })} />
            </div>
          </div>
        </Field>
      </div>
    </PanelSection>
  )
}

const cornerShapes = [
  { value: "round", label: "Round" },
  { value: "squircle", label: "Squircle" },
  { value: "bevel", label: "Bevel" },
  { value: "scoop", label: "Scoop" },
  { value: "notch", label: "Notch" },
  { value: "square", label: "Square" }
] as const

/**
 * Corner shape, in the corners' popover (PAR-652's Appearance): Round, as every browser draws, or Squircle, Bevel,
 * Scoop, Notch or Square, which only Chromium draws (`corner-shape`), so it's marked †; elsewhere the radius still
 * holds, drawn round.
 */
function CornerShape({
  value,
  onChange
}: {
  value: string | undefined
  onChange: (value: string | undefined) => void
}) {
  const shape = value ?? "round"
  return (
    <Popover>
      <Hint
        label="Corner shape †"
        detail="Chromium only. Other browsers draw round corners, so the radius still holds."
      >
        <PopoverTrigger
          aria-label={`Corner shape: ${cornerShapes.find((option) => option.value === shape)?.label}`}
          className={`grid size-7 place-items-center rounded-md text-xs outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring data-popup-open:bg-accent ${value && value !== "round" ? "bg-accent text-foreground" : "text-muted-foreground"}`}
        >
          <Squircle className="size-3.5" />
        </PopoverTrigger>
      </Hint>
      <PopoverContent className="w-52 gap-2 p-2" align="end">
        <p className="flex items-center gap-1 text-xs font-medium">
          Corner shape
          <Hint label="Not in every browser" detail="Chromium only. Other browsers draw round corners.">
            <span className="text-muted-foreground">†</span>
          </Hint>
        </p>
        <div className="grid grid-cols-3 gap-1">
          {cornerShapes.map((option) => (
            <Button
              key={option.value}
              variant={shape === option.value ? "secondary" : "ghost"}
              size="sm"
              aria-pressed={shape === option.value}
              className="h-7 px-1 text-xs"
              onClick={() => onChange(option.value === "round" ? undefined : option.value)}
            >
              {option.label}
            </Button>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">Other browsers draw round corners, at the same radius.</p>
      </PopoverContent>
    </Popover>
  )
}

/** A section title's + or −, for a section that starts empty: Fill, Stroke, Effects. */
function SectionButton({ adds, what, onClick }: { adds: boolean; what: string; onClick: () => void }) {
  const label = adds ? `Add ${what}` : `Remove ${what}`
  return (
    <Hint label={label}>
      <Button variant="ghost" size="icon-sm" className="size-6" aria-label={label} onClick={onClick}>
        {adds ? <Plus /> : <Minus />}
      </Button>
    </Hint>
  )
}

/**
 * Fill, a section of its own in call 5's order: the layer's fill, or a title with + until it has one, which adds
 * `bg-background`, the project's usual fill. The row stays while its token is taken off to type another.
 */
export function FillSection({
  draft,
  set,
  tokensOnly,
  fillPicker
}: SectionProps & { fillPicker?: "tokens" | "custom" }) {
  const [shown, setShown] = useState(draft.background !== undefined)
  const filled = shown || draft.background !== undefined
  return (
    <PanelSection
      title="Fill"
      action={
        <SectionButton
          adds={!filled}
          what="fill"
          onClick={() => {
            setShown(!filled)
            set(
              filled
                ? { background: undefined, backgroundAlpha: undefined, backgroundAllowed: undefined }
                : { background: "background" }
            )
          }}
        />
      }
    >
      {filled && (
        <div className="pr-1">
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
        </div>
      )}
    </PanelSection>
  )
}

const effects = [
  { key: "blur", label: "Layer blur", hint: "Blurs the layer itself", added: "blur-sm" },
  {
    key: "backdropBlur",
    label: "Background blur",
    hint: "Blurs what shows through the layer, for frosted glass",
    added: "blur-md"
  }
] as const

/**
 * Effects, a section of its own in call 5's order, with Layer blur and Background blur as PAR-652's panel names them.
 * It's a title with + until an effect is added; + offers each effect, and each row's − takes it off.
 */
export function EffectsSection({ draft, set, tokensOnly, mixed }: SectionProps) {
  // Layers whose background blurs differ show its row, Mixed.
  const [added, setAdded] = useState(() => ({
    blur: draft.blur !== undefined,
    backdropBlur: draft.backdropBlur !== undefined || (mixed ?? false)
  }))
  const shown = effects.filter((effect) => added[effect.key] || draft[effect.key] !== undefined)
  return (
    <PanelSection
      title="Effects"
      action={
        <DropdownMenu>
          <Hint label="Add an effect">
            <DropdownMenuTrigger
              aria-label="Add an effect"
              className="grid size-6 place-items-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-popup-open:bg-accent"
            >
              <Plus className="size-4" />
            </DropdownMenuTrigger>
          </Hint>
          <DropdownMenuContent align="end" className="w-44">
            {effects.map((effect) => (
              <DropdownMenuItem
                key={effect.key}
                className="text-xs"
                disabled={shown.includes(effect)}
                onClick={() => {
                  setAdded((current) => ({ ...current, [effect.key]: true }))
                  set({ [effect.key]: effect.added })
                }}
              >
                {effect.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      }
    >
      {shown.length > 0 && (
        <div className="flex flex-col gap-1">
          {shown.map((effect) => (
            <Field key={effect.key} label={effect.label} hint={effect.hint}>
              <div className="flex items-start gap-1">
                <div className="min-w-0 flex-1">
                  <BlurChoice
                    label={effect.label}
                    value={draft[effect.key]}
                    tokensOnly={tokensOnly}
                    mixed={mixed}
                    onChange={(value) => set({ [effect.key]: value })}
                  />
                </div>
                <Hint label={`Remove ${effect.label.toLowerCase()}`}>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="size-7"
                    aria-label={`Remove ${effect.label.toLowerCase()}`}
                    onClick={() => {
                      setAdded((current) => ({ ...current, [effect.key]: false }))
                      set({ [effect.key]: undefined })
                    }}
                  >
                    <Minus />
                  </Button>
                </Hint>
              </div>
            </Field>
          ))}
        </div>
      )}
    </PanelSection>
  )
}

/** A radius, a token or a value of its own, with a corner mark inside when it's one corner's. */
export function RadiusChoice({
  label,
  corner,
  value,
  tokensOnly,
  mixed,
  onChange
}: {
  mixed?: boolean
  label: string
  corner?: number
  value: Length | undefined
  tokensOnly?: boolean
  onChange: (value: Length | undefined) => void
}) {
  const shape = (
    <span
      aria-hidden
      // A block, so it keeps its size outside the chip too, where an inline span would draw only its border's edge.
      className="block size-3 shrink-0 border-muted-foreground"
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
    <LengthField
      label={label}
      kind="radius"
      icon={shape}
      // A corner's field is narrow, so what its value comes to and its status show in its hint.
      narrow={corner !== undefined}
      value={value}
      tokensOnly={tokensOnly}
      mixed={mixed}
      cssTakes={(length) => CSS.supports("border-radius", length)}
      onChange={onChange}
    />
  )
}

export function BlurChoice({
  label,
  value,
  tokensOnly,
  mixed,
  onChange
}: {
  mixed?: boolean
  label: string
  value: Length | undefined
  tokensOnly?: boolean
  onChange: (value: Length | undefined) => void
}) {
  return (
    <LengthField
      label={label}
      kind="blur"
      value={value}
      tokensOnly={tokensOnly}
      mixed={mixed}
      placeholder="None"
      cssTakes={(length) => CSS.supports("filter", `blur(${length})`)}
      onChange={onChange}
    />
  )
}

/**
 * A length field that takes a token or a value of its own, as every field does (call 1), on the shared field. A token
 * shows as a chip, then what it comes to, faintly (`lg 10px`); clicking the chip opens the kind's tokens, as the token
 * button after a value does on hover or focus. Typing beside the chip, or on it, replaces it, and Backspace or the
 * chip's × removes it. A value shows as typed, with its unit and a hollow mark whose menu has the nearest token, Create
 * token and Allow here; Tokens only refuses it. Typing a token's name (`lg`, `radius-lg`) takes the token. What's typed
 * is checked as CSS checks the property (`CSS.supports`) before it's stored. Up and Down step a token through the scale
 * and a value by a pixel. In a narrow field (`narrow`, under about 96px), the unit shows on hover, and what the value
 * comes to and its status are in its hint.
 */
function LengthField({
  label,
  kind,
  icon,
  narrow = false,
  value,
  tokensOnly = false,
  placeholder = "0",
  mixed = false,
  cssTakes,
  onChange
}: {
  label: string
  /** The token kind and set, which is also the namespace the field leaves off a token's name (`lg` for `radius-lg`). */
  kind: "radius" | "blur"
  /** Slot 1's icon, which scrubs the value. */
  icon?: ReactNode
  narrow?: boolean
  value: Length | undefined
  tokensOnly?: boolean
  placeholder?: string
  /** The selected layers differ here: it shows Mixed, and typing replaces every one. */
  mixed?: boolean
  /** Whether CSS takes a length here, as `CSS.supports` says for the property. */
  cssTakes: (length: string) => boolean
  onChange: (value: Length | undefined) => void
}) {
  const { tokens, create } = useTokens(kind)
  const namespace = `${kind}-`
  const name = typeof value === "string" ? value : undefined
  const token = name === undefined ? undefined : tokens.find((other) => other.name === name)
  const own = typeof value === "object" ? value : undefined
  // Deprecated tokens are neither offered as the nearest nor stepped onto: they're on their way out.
  const scale = tokens.filter((other) => other.deprecated === undefined)
  const nearestTo = (px: number) => nearestToken(tokens, (other) => other.px, px)
  const nearest = own ? nearestTo(own.px) : undefined
  const refused = own !== undefined && tokensOnly && own.allow === undefined
  const read = (text: string): Reading<Length | undefined> => {
    const trimmed = text.trim()
    if (trimmed === "") return { value: undefined }
    const named = tokens.find((other) => other.name === trimmed || other.name === namespace + trimmed)
    if (named) return { value: named.name }
    // The app's maths and units: `6`, `6px`, `0.5rem`, `+2`, `*2`.
    const reading = readLength(trimmed, { label, current: own?.px ?? token?.px })
    if ("reason" in reading && reading.reason.startsWith("Can't read")) {
      return { reason: `${label} takes a length, such as 6px, or a ${kind} token` }
    }
    if ("reason" in reading) return reading
    if (!("px" in reading)) return { value: undefined }
    if (!cssTakes(`${reading.px}px`)) return { reason: `${label} can't be ${trimmed}` }
    const near = nearestTo(reading.px)
    if (tokensOnly && near) return notAToken(near, () => onChange(near.name))
    return { value: { px: Math.round(reading.px * 100) / 100 } }
  }
  const step = (up: boolean, { shift }: ScrubKeys) => {
    if (token && scale.includes(token)) {
      // A token steps to the next of its kind in scale order; Shift goes to the first or last.
      const last = scale.length - 1
      let next = Math.min(last, Math.max(0, scale.indexOf(token) + (up ? 1 : -1)))
      if (shift) next = up ? last : 0
      onChange(scale[next]!.name)
      return
    }
    const from = own?.px ?? token?.px ?? 0
    onChange({ px: Math.max(0, from + (up ? 1 : -1) * (shift ? 10 : 1)) })
  }
  // A narrow field's hint carries the value's status, which has no room in the field.
  let status: string | undefined
  if (token?.deprecated) status = `Deprecated: use ${token.deprecated} instead`
  else if (name !== undefined && !token) status = "Missing: the project has no token by this name now"
  else if (own?.allow !== undefined) status = `Allowed here: ${own.allow}`
  else if (own && nearest) status = `Not a token. Nearest: ${nearest.name} (${nearest.detail})`
  else if (mixed && value === undefined) status = "Mixed: the selected layers differ"
  else if (value === undefined) status = "Unset"
  return (
    <ValueField
      label={label}
      inner={icon}
      // Dragging the icon scrubs a value of its own a pixel per screen pixel, and a token through the scale.
      scrub={
        icon === undefined
          ? undefined
          : {
              from: () => own?.px ?? token?.px ?? 0,
              apply: (px) => onChange({ px }),
              by: { step: 1, shiftStep: 10, altStep: 0.1, min: 0 }
            }
      }
      shown={own ? formatNumber(own.px) : undefined}
      placeholder={placeholder}
      mixed={mixed}
      chip={
        name === undefined
          ? undefined
          : {
              name,
              token,
              namespace,
              onRemove: () => onChange(undefined),
              onReplace: (replacement) => onChange(replacement)
            }
      }
      unit={own ? "px" : undefined}
      comesTo={token?.detail}
      status={{
        missing: name !== undefined && !token ? <MissingMark name={name} /> : undefined,
        offSystem:
          own && nearest ? (
            <OffSystemMark
              label={label}
              compact
              description={`${own.px}px isn't one of the project's ${kind} tokens.`}
              nearest={{
                name: `${nearest.name}, ${nearest.detail}`,
                preview: <TokenMark kind={nearest.kind} value={nearest.value} />
              }}
              allowed={own.allow}
              isTaken={(taken) => tokens.some((other) => other.name === namespace + taken)}
              namePlaceholder={kind === "radius" ? "card" : "glass"}
              onUse={() => onChange(nearest.name)}
              onCreate={
                create &&
                ((made) => {
                  create(lengthToken(kind, namespace + made, own.px))
                  onChange(namespace + made)
                })
              }
              onAllow={(reason) => onChange(reason === undefined ? { px: own.px } : { ...own, allow: reason })}
            />
          ) : undefined
      }}
      tokens={{ list: tokens, current: name, none: "None", onPick: onChange }}
      refused={refused && nearest ? { nearest, onUse: () => onChange(nearest.name) } : undefined}
      narrow={narrow}
      hint={{ detail: status }}
      read={read}
      onCommit={onChange}
      onStep={step}
    />
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
export function StrokeSection({ draft, set, tokensOnly }: SectionProps) {
  // Custom stays chosen while one side is stroked, which the widths alone would read as that side.
  const [custom, setCustom] = useState(false)
  const sideMode = custom ? "custom" : sideModeOf(draft.borderWidth)
  // A new stroke is in layout (call 2): a border. Out of layout, it's an outline at its position.
  const inLayout = draft.strokeInLayout ?? true
  const position: StrokePosition = inLayout ? "inside" : (draft.strokePosition ?? "inside")
  const widths = Array.isArray(draft.borderWidth)
    ? draft.borderWidth
    : ([0, 0, 0, 0].map(() => (draft.borderWidth as number | undefined) ?? 1) as [number, number, number, number])
  const stroked = draft.border !== undefined || draft.borderWidth !== undefined
  const action = (
    <SectionButton
      adds={!stroked}
      what="stroke"
      onClick={() => {
        setCustom(false)
        set(
          stroked
            ? {
                border: undefined,
                borderAlpha: undefined,
                borderAllowed: undefined,
                borderWidth: undefined,
                strokeInLayout: undefined,
                strokePosition: undefined
              }
            : { border: "border", borderWidth: 1 }
        )
      }}
    />
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
                // Only a border strokes some sides and not others, so choosing sides puts the stroke in layout.
                set({
                  borderWidth: widthsFor(mode, Math.max(...widths) || 1, widths),
                  ...(mode === "all" ? {} : { strokeInLayout: undefined, strokePosition: undefined })
                })
              }}
            />
          </div>
        </Field>
        <Field
          label="Position"
          hint="In layout, the stroke is a border, which takes up room. Out of it, it's an outline, drawn inside, centered on or outside the edge, and takes none."
        >
          <div className="flex items-center gap-1">
            <div className="min-w-0 flex-1">
              <ChoiceInput
                value={position}
                options={strokePositions}
                onChange={(next) => {
                  if (!next || next === position) return
                  // Center and Outside are outlines, which stroke every side at one width.
                  if (next !== "inside") {
                    setCustom(false)
                    set({ strokeInLayout: false, strokePosition: next, borderWidth: Math.max(...widths) || 1 })
                  } else set({ strokePosition: inLayout ? undefined : "inside" })
                }}
              />
            </div>
            <Hint
              label="Include in layout"
              detail={
                inLayout
                  ? "On: a border, which takes up room in the layout"
                  : "Off: an outline, which takes no room in the layout"
              }
            >
              <Toggle
                size="sm"
                className="size-7 min-w-7 shrink-0 p-0"
                aria-label="Include in layout"
                pressed={inLayout}
                onPressedChange={(on) => {
                  setCustom(false)
                  set(
                    on
                      ? { strokeInLayout: undefined, strokePosition: undefined }
                      : { strokeInLayout: false, strokePosition: "inside", borderWidth: Math.max(...widths) || 1 }
                  )
                }}
              >
                <LayoutTemplate />
              </Toggle>
            </Hint>
          </div>
        </Field>
      </div>
    </PanelSection>
  )
}

const strokePositions = [
  { value: "inside", label: "Inside" },
  { value: "center", label: "Center" },
  { value: "outside", label: "Outside" }
] satisfies { value: StrokePosition; label: string }[]

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

export function TextSection({ draft, set }: SectionProps) {
  return (
    <PanelSection title="Text" description="The headline inside Plans.">
      <Field label="Tag" hint="The element the text is: what screen readers and search engines read it as">
        <ChoiceInput value={draft.tag} options={tagOptions} placeholder="Paragraph" onChange={(tag) => set({ tag })} />
      </Field>
    </PanelSection>
  )
}

/** The design's frame, typed: its width and height in this viewport. */
export function FrameSection({
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
 * A number typed, committed on Enter or blur, with a short label inside and a unit after, hidden while focused: a
 * ValueField. A length in pixels (`pixels`) is shown in px or rem, switched by the unit after it as the canvas's type
 * box switches, and takes either typed (`1rem`, `16px`); it's kept in pixels whichever is shown, so 16px becomes 1rem.
 * A spacing length (`spacing`) steps to the next whole spacing step (4px) on Up and Down and scrubs a step per 2 screen
 * pixels; others step by 1, or 10 with Shift, and scrub a step per screen pixel.
 *
 * In a narrow field (`narrow`, under about 96px, as sides are), the unit shows only on hover. Input it can't read
 * stays, outlined in the error color with a mark in the status slot and the reason under the row; Enter keeps it, and
 * Escape or leaving puts the value back and says so.
 */
export function Num({
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
  const [unit, setUnit] = useState<"px" | "rem">("px")
  const inRem = pixels && unit === "rem"
  let shown = value === undefined ? undefined : formatNumber(value)
  if (inRem && value !== undefined) shown = formatNumber(value / remPx)
  const other = unit === "px" ? "rem" : "px"
  /**
   * What's typed: a length with the app's maths and units (`+8`, `*2`, `1.5rem`, `spacing-4`), a bare number in the
   * unit shown; or, for a count, a whole number.
   */
  const read = (text: string): Reading<number | undefined> => {
    if (pixels) {
      const bare = /^\s*-?(\d*\.?\d+)\s*$/.test(text)
      const reading = readLength(inRem && bare ? `${text}rem` : text, { label, current: value })
      if ("clear" in reading) return { value: undefined }
      if ("px" in reading) return { value: Math.max(min, reading.px) }
      return { reason: "reason" in reading ? reading.reason : `${label} takes a length` }
    }
    if (text.trim() === "") return { value: undefined }
    const number = Number(text)
    return Number.isFinite(number)
      ? { value: Math.max(min, Math.round(number)) }
      : { reason: `${label} takes a whole number` }
  }
  const from = () => value ?? Math.max(min, 0)
  let unitPart: ReactNode = suffix
  if (pixels && value !== undefined) {
    unitPart = (
      <Hint label={`Show in ${other}`}>
        <button
          type="button"
          aria-label={`${unit}, switch to ${other}`}
          onClick={(event) => {
            event.preventDefault()
            setUnit(other)
          }}
          className={unitButtonClass}
        >
          {unit}
        </button>
      </Hint>
    )
  }
  return (
    <ValueField
      label={label}
      inner={inner}
      // Dragging the letter inside the field scrubs it, as Figma's labels do.
      scrub={{
        from,
        apply: (next) => onChange(next),
        by: spacing ? { spacing: true, min } : { step: 1, shiftStep: 10, min }
      }}
      shown={shown}
      placeholder={placeholder}
      unit={unitPart}
      narrow={narrow}
      read={read}
      onCommit={onChange}
      onStep={(up, keys) => {
        const count = stepCount(up, keys)
        onChange(Math.max(min, spacing ? stepSpacing(from(), count) : from() + count))
      }}
    />
  )
}

/* The canvas's stand-ins. */

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

export function LayerPreview({
  draft,
  childSelected = false,
  onSelectChild
}: {
  draft: Draft
  /** Whether Pro plan is selected, as a grid child; clicking it selects it where `onSelectChild` is given. */
  childSelected?: boolean
  onSelectChild?: (selected: boolean) => void
}) {
  const sets = useTokenSets()
  const grid = draft.columns !== undefined
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
    ...drawnStyle(draft, sets),
    // The selection's outline, in the layer's color, as the canvas draws it.
    outlineColor: kindColors.layer,
    color: "#0a0a0a"
  }
  return (
    // Plans' parent, wider than Plans, so Fill and a percentage show; it hugs Plans' height.
    <PreviewStage around>
      <section aria-label="Plans" className="relative outline outline-offset-0" style={style}>
        <Tag className="m-0 text-base font-semibold" style={grid ? { gridColumn: "1 / -1" } : undefined}>
          Simple pricing for every team
        </Tag>
        {["Hobby", "Pro plan", "Team"].map((name) => {
          const pro = name === "Pro plan"
          const selected = pro && childSelected
          return (
            <button
              key={name}
              type="button"
              data-layer={name}
              aria-pressed={selected}
              onClick={() => onSelectChild?.(pro ? !childSelected : false)}
              className={`rounded-lg border border-black/10 bg-white/80 p-3 text-left text-sm ${selected ? "outline-2" : ""}`}
              style={{
                ...(selected ? { outlineColor: kindColors.layer } : {}),
                ...(grid && pro
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
                  : { fontSize: pro ? 20 : 14 })
              }}
            >
              {name}
            </button>
          )
        })}
      </section>
    </PreviewStage>
  )
}

export function FramePreview({ width, height }: { width: number; height: number | undefined }) {
  const scale = 0.4
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">
        Pricing in Desktop, {width} × {height ?? "Hug"}
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
