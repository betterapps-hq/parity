import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
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
  Ellipsis,
  Grid3x3,
  Lock,
  LockOpen,
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
import { type CSSProperties, type ReactNode, useState } from "react"
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
    panel = <PlacementSection draft={draft} set={set} />
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
              {mode === "row" && (
                <Hint label="Align text on its baseline" detail="Lines up the first line of text in each child">
                  <Toggle
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 px-2 text-xs"
                    aria-label="Align text on its baseline"
                    pressed={draft.align === "baseline"}
                    onPressedChange={(on) => set({ align: on ? "baseline" : undefined })}
                  >
                    <Baseline /> Baseline
                  </Toggle>
                </Hint>
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
          const fillsAcross = align === "stretch" || align === "baseline"
          const active = justify === main && (fillsAcross || align === cross)
          return (
            <button
              key={`${row}-${across}`}
              type="button"
              aria-label={`Align ${verticalNames[row]} ${horizontalNames[across]}`}
              aria-pressed={active}
              onClick={() => set({ justify: main, align: draft.align === "baseline" ? "baseline" : cross })}
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

/** A grid child's place: the line it starts at and how many tracks it spans, each way. */
function PlacementSection({ draft, set }: SectionProps) {
  return (
    <PanelSection title="Grid placement" description="Where Pro plan sits in Plans' grid. Auto follows the order.">
      <div className="flex flex-col gap-1">
        <AxisPlacement
          axis="Column"
          start={draft.colStart}
          span={draft.colSpan}
          onChange={(colStart, colSpan) => set({ colStart, colSpan })}
        />
        <AxisPlacement
          axis="Row"
          start={draft.rowStart}
          span={draft.rowSpan}
          onChange={(rowStart, rowSpan) => set({ rowStart, rowSpan })}
        />
      </div>
    </PanelSection>
  )
}

/**
 * One axis of a grid child's place: Start (a line from 1, or from the end when negative, -1 being the last) and Span,
 * or All for every track, as a header across the whole grid wants.
 */
function AxisPlacement({
  axis,
  start,
  span,
  onChange
}: {
  axis: "Column" | "Row"
  start: number | undefined
  span: Span | undefined
  onChange: (start: number | undefined, span: Span | undefined) => void
}) {
  const all = span === "all"
  const tracks = axis === "Column" ? "columns" : "rows"
  return (
    <Field label={axis} hint={`A negative start counts from the end: -1 is after the last of the ${tracks}`}>
      <div className="flex items-center gap-1">
        <div className="grid min-w-0 flex-1 grid-cols-2 gap-1">
          {all ? (
            <span className="col-span-2 flex h-7 items-center px-1.5 text-xs text-muted-foreground">
              Across all {tracks}
            </span>
          ) : (
            <>
              <Num
                label={`${axis} start`}
                inner="Start"
                value={start}
                placeholder="Auto"
                min={-99}
                // Line 0 doesn't exist; it counts as unset.
                onChange={(next) => onChange(next === 0 ? undefined : next, span)}
              />
              <Num
                label={`${axis} span`}
                inner="Span"
                value={span as number | undefined}
                placeholder="1"
                min={1}
                onChange={(next) => onChange(start, next)}
              />
            </>
          )}
        </div>
        <Hint label={`Span all ${tracks}`}>
          <Toggle
            size="sm"
            className="h-7 shrink-0 px-2 text-xs"
            aria-label={`Span all ${tracks}`}
            pressed={all}
            onPressedChange={(on) => onChange(on ? undefined : start, on ? "all" : undefined)}
          >
            All
          </Toggle>
        </Hint>
      </div>
    </Field>
  )
}

/**
 * W and H on one line with the aspect lock between them, as Figma UI3 has it. Locking keeps the ratio the layer has
 * now and leaves the height to it (Auto), since a ratio is ignored when both sizes are set; the ratio then shows as its
 * own row, with named ratios. Typing H while locked changes W to keep the ratio.
 */
function SizeSection({ draft, set }: SectionProps) {
  const width = draft.width ?? 520
  const ratio = draft.aspect === undefined ? undefined : ratioOf(draft.aspect)
  const lock = (on: boolean) => {
    if (!on) {
      // Unlocking keeps the height the ratio gave, so nothing moves.
      set({ aspect: undefined, height: ratio ? Math.round(width / ratio) : draft.height })
      return
    }
    const drawn = document.querySelector<HTMLElement>("section[aria-label='Plans']")?.getBoundingClientRect()
    const height = draft.height ?? Math.round(drawn?.height ?? width)
    const shown = Math.round(drawn?.width ?? width)
    // Within a percent of a named ratio is that ratio: whole pixels can't make 16:9 exactly.
    const near = namedRatios.find((option) => Math.abs(ratioOf(option.value)! / (shown / height) - 1) < 0.01)
    set({ aspect: near?.value ?? reducedRatio(shown, height), height: undefined })
  }
  return (
    <PanelSection title="Size">
      <div className="flex flex-col gap-1">
        <Field label="Size">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1">
            <Num
              label="Width"
              inner="W"
              pixels
              value={width}
              min={1}
              onChange={(next) => set({ width: next ?? 520 })}
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
            <Num
              label="Height"
              inner="H"
              pixels
              value={ratio ? undefined : draft.height}
              placeholder={ratio ? "Auto" : "Hug"}
              min={1}
              onChange={(next) => {
                if (ratio && next !== undefined) set({ width: Math.round(next * ratio) })
                else set({ height: next })
              }}
            />
          </div>
        </Field>
        {draft.aspect !== undefined && (
          <Field label="Ratio" hint="Height follows the width at this ratio. Type 16:9, 16/9, 16x9 or 1.78">
            <RatioField aspect={draft.aspect} onChange={(aspect) => set({ aspect })} />
          </Field>
        )}
      </div>
    </PanelSection>
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

/** The ratio, typed, with its name after it (Video) and the named ratios in its menu. */
function RatioField({ aspect, onChange }: { aspect: string; onChange: (aspect: string) => void }) {
  const [typed, setTyped] = useState<string>()
  const name = namedRatios.find((option) => option.value === aspect)?.name
  return (
    <div className="flex items-center gap-1">
      <label className="flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-md border bg-transparent px-1.5 text-xs focus-within:ring-2 focus-within:ring-ring dark:bg-input/30">
        <input
          aria-label="Aspect ratio"
          value={typed ?? ratioText(aspect)}
          onChange={(event) => setTyped(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
          onBlur={() => {
            const read = typed === undefined ? undefined : readRatio(typed)
            if (read) onChange(read)
            setTyped(undefined)
          }}
          className="w-16 min-w-0 bg-transparent tabular-nums outline-none"
        />
        {name && typed === undefined && <span className="truncate text-muted-foreground">{name}</span>}
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
      onChange={onChange}
    />
  )
}

/** A short list of tokens of one kind, with None. */
function TokenChoice({
  label,
  icon,
  value,
  tokens,
  short = (name) => name,
  onChange
}: {
  label: string
  icon?: ReactNode
  value: string | undefined
  tokens: { name: string; detail: string }[]
  short?: (name: string) => string
  onChange: (value: string | undefined) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
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
          </Button>
        }
      />
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

function StrokeSection({ draft, set, tokensOnly }: SectionProps) {
  const sideMode = sideModeOf(draft.borderWidth)
  const widths = Array.isArray(draft.borderWidth)
    ? draft.borderWidth
    : ([0, 0, 0, 0].map(() => (draft.borderWidth as number | undefined) ?? 1) as [number, number, number, number])
  return (
    <PanelSection title="Stroke">
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
              onChange={(mode) => set({ borderWidth: widthsFor(mode, Math.max(...widths) || 1, widths) })}
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
 * A number typed, committed on Enter or blur, with a short label inside and a unit after. A length in pixels
 * (`pixels`) is shown in px or rem, switched by the unit after it as the canvas's type box switches, and takes either
 * typed (`1rem`, `16px`); it's kept in pixels whichever is shown, so 16px becomes 1rem.
 */
function Num({
  label,
  inner,
  suffix,
  pixels = false,
  value,
  placeholder = "0",
  min = 0,
  onChange
}: {
  label: string
  inner?: string
  suffix?: string
  pixels?: boolean
  value: number | undefined
  placeholder?: string
  min?: number
  onChange: (value: number | undefined) => void
}) {
  const [typed, setTyped] = useState<string>()
  const [unit, setUnit] = useState<"px" | "rem">("px")
  const inRem = pixels && unit === "rem"
  let shown = value === undefined ? "" : String(value)
  if (inRem && value !== undefined) shown = String(Number((value / remPixels).toFixed(3)))
  const other = unit === "px" ? "rem" : "px"
  const switchable = pixels && value !== undefined
  return (
    <label
      className={`flex h-7 min-w-0 items-center gap-1 rounded-md border bg-transparent pl-1.5 text-xs focus-within:ring-2 focus-within:ring-ring dark:bg-input/30 ${switchable ? "" : "pr-1.5"}`}
    >
      {inner && <span className="shrink-0 text-muted-foreground">{inner}</span>}
      <input
        aria-label={label}
        inputMode="decimal"
        placeholder={placeholder}
        value={typed ?? shown}
        onChange={(event) => setTyped(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur()
          if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            event.preventDefault()
            const step = (event.key === "ArrowUp" ? 1 : -1) * (event.shiftKey ? 10 : 1)
            onChange(Math.max(min, (value ?? min) + step))
          }
        }}
        onBlur={() => {
          if (typed === undefined) return
          const match = /^\s*(-?\d*\.?\d+)\s*(px|rem)?\s*$/i.exec(typed)
          const number = match
            ? Number(match[1]) * ((match[2]?.toLowerCase() ?? unit) === "rem" && pixels ? remPixels : 1)
            : NaN
          onChange(typed.trim() === "" || !Number.isFinite(number) ? undefined : Math.max(min, Math.round(number)))
          setTyped(undefined)
        }}
        className="w-full min-w-0 bg-transparent tabular-nums outline-none placeholder:text-muted-foreground"
      />
      {switchable ? (
        <Hint label={`Show in ${other}`}>
          <button
            type="button"
            aria-label={`${unit}, switch to ${other}`}
            onClick={(event) => {
              event.preventDefault()
              setUnit(other)
            }}
            className="h-full shrink-0 rounded-r-md px-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            {unit}
          </button>
        </Hint>
      ) : (
        suffix && <span className="shrink-0 text-muted-foreground">{suffix}</span>
      )}
    </label>
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
  baseline: "baseline"
} as const

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
    width: draft.width ?? 520,
    maxWidth: "100%",
    // A ratio only takes hold when one axis is left to it.
    height: draft.aspect ? undefined : draft.height,
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
    <div className="relative w-full max-w-[520px]">
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
              aria-pressed={pro && childSelected}
              onClick={() => onSelectChild(pro ? !childSelected : false)}
              className={`rounded-lg border border-black/10 bg-white/80 p-3 text-left text-sm ${pro && childSelected ? "outline-2 outline-[#0d99ff]" : ""}`}
              style={
                grid && pro
                  ? {
                      gridColumn: placementCss(draft.colStart, draft.colSpan),
                      gridRow: placementCss(draft.rowStart, draft.rowSpan)
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
