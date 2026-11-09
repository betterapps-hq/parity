/* oxlint-disable jsx-a11y/prefer-tag-over-role -- the offset pad is a slider on two axes, which no input element is */
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@buildkitgg/shadcn-baseui-kit"
import { ChevronDown, Eye, EyeOff, GripVertical, Minus } from "lucide-react"
import {
  type CSSProperties,
  type DragEvent,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  useState
} from "react"
import { Hint } from "../../chrome/Hint.tsx"
import { clamp, formatNumber } from "./css-values.ts"
import { drag, type Reading, readNumber, ValueField } from "./field-parts.tsx"

/*
 * What the list fields share (design-options-fields.md, Lists): the entry's row, in the spec's order (the drag handle,
 * the preview that opens the entry's details, its type, its summary, the eye and −), the type menu, the centered slider
 * of Adjustments and the offset pad. Fields, chips, angles, positions and the nine spots are the core's
 * (field-parts.tsx, angle.tsx, position-box.tsx).
 */

/** The box an entry's preview, type and summary share in its row. */
const entryBox =
  "flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-md border bg-transparent pr-1.5 pl-1 text-xs dark:bg-input/30"

export interface ListRowProps {
  /** What the entry is, for its buttons' names: "Drop shadow 1". */
  name: string
  /** Rows are reordered only among rows of the same group (Inside or Outside shadows). */
  group: string
  index: number
  off?: boolean
  /** Unset for a list in a fixed order, as the filter list is: then there's no handle. */
  onMove?: (from: number, to: number) => void
  onToggle: () => void
  onRemove: () => void
  /** The entry's summary, after its preview and type: its value, token chip or words. */
  children: ReactNode
  /**
   * The entry's preview (swatch, gradient strip, shadow card, filter glyph), first after the handle, in a box with the
   * type and summary. With `details`, it opens them.
   */
  preview?: ReactNode
  /** The entry's details, in the popover its preview opens, as every list's entries have them. */
  details?: {
    content: ReactNode
    /** Open at first, for a story. */
    defaultOpen?: boolean
    className?: string
  }
  /** The entry's type, or its type menu (`TypeMenu`), after the preview. */
  type?: ReactNode
  /**
   * What follows the summary before the eye, as a gradient's alpha does. It's placed in the row's second column
   * (`col-start-2 row-start-1`, as `PercentField`'s `rowClassName`), so what it says goes under the whole entry.
   */
  after?: ReactNode
}

/**
 * One entry's row, in the order design-options-fields.md's Lists sets: a drag handle on hover, which also moves it with
 * Up and Down and removes it with Delete; the entry's preview, which opens its details; its type; its summary; the eye,
 * which turns it off without removing it (pressed while it's off); and −. Rows are dragged within their group only.
 */
export function ListRow({
  name,
  group,
  index,
  off = false,
  onMove,
  onToggle,
  onRemove,
  children,
  preview,
  details,
  type,
  after
}: ListRowProps) {
  const [draggable, setDraggable] = useState(false)
  const [over, setOver] = useState(false)
  const dataType = `application/x-parity-${group}`
  const entry =
    preview === undefined ? (
      <>
        {type}
        {children}
      </>
    ) : (
      <div className={entryBox}>
        <EntryPreview name={name} details={details}>
          {preview}
        </EntryPreview>
        {type}
        {children}
      </div>
    )
  const content = (
    <div
      className={`grid min-w-0 flex-1 items-center gap-x-1 ${after === undefined ? "" : "grid-cols-[minmax(0,1fr)_auto]"} ${off ? "opacity-50" : ""}`}
    >
      <div className="col-start-1 row-start-1 flex min-w-0 items-center gap-1">{entry}</div>
      {after}
    </div>
  )
  if (onMove === undefined) {
    return (
      <div className="group/row flex min-h-8 items-start pt-0.5 gap-1 rounded-md">
        <span aria-hidden className="w-3 shrink-0" />
        {content}
        <RowButtons name={name} off={off} onToggle={onToggle} onRemove={onRemove} />
      </div>
    )
  }
  return (
    <div
      draggable={draggable}
      onDragStart={(event: DragEvent) => {
        event.dataTransfer.setData(dataType, String(index))
        event.dataTransfer.effectAllowed = "move"
      }}
      onDragEnd={() => setDraggable(false)}
      onDragOver={(event: DragEvent) => {
        if (!event.dataTransfer.types.includes(dataType)) return
        event.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event: DragEvent) => {
        setOver(false)
        const from = Number(event.dataTransfer.getData(dataType))
        if (Number.isFinite(from) && from !== index) onMove(from, index)
      }}
      className={`group/row flex min-h-8 items-start pt-0.5 gap-1 rounded-md ${over ? "ring-2 ring-ring" : ""}`}
    >
      <Hint label="Drag to reorder" detail="Up and Down move it; Delete removes it">
        <button
          type="button"
          aria-label={`Move ${name}`}
          onPointerDown={() => setDraggable(true)}
          onPointerUp={() => setDraggable(false)}
          onKeyDown={(event: KeyboardEvent) => {
            if (event.key === "ArrowUp" || event.key === "ArrowDown") {
              event.preventDefault()
              onMove(index, index + (event.key === "ArrowUp" ? -1 : 1))
            }
            if (event.key === "Delete" || event.key === "Backspace") {
              event.preventDefault()
              onRemove()
            }
          }}
          className="grid h-7 w-3 shrink-0 cursor-grab place-items-center rounded-sm text-muted-foreground opacity-0 outline-none group-hover/row:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <GripVertical className="size-3" />
        </button>
      </Hint>
      {content}
      <RowButtons name={name} off={off} onToggle={onToggle} onRemove={onRemove} />
    </div>
  )
}

/** An entry's preview: with details, the button that opens them in the entry's popover. */
function EntryPreview({
  name,
  details,
  children
}: {
  name: string
  details: ListRowProps["details"]
  children: ReactNode
}) {
  if (details === undefined) return <span className="grid shrink-0 place-items-center">{children}</span>
  return (
    <Popover defaultOpen={details.defaultOpen}>
      <Hint label={`Edit ${name.toLowerCase()}`}>
        <PopoverTrigger
          aria-label={`Edit ${name}`}
          className="grid shrink-0 place-items-center rounded-sm outline-none hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring"
        >
          {children}
        </PopoverTrigger>
      </Hint>
      <PopoverContent className={details.className ?? "w-72 p-2"} align="start">
        {details.content}
      </PopoverContent>
    </Popover>
  )
}

/** The eye, which turns an entry off without removing it, pressed while it's off, and −. */
function RowButtons({
  name,
  off,
  onToggle,
  onRemove
}: {
  name: string
  off: boolean
  onToggle: () => void
  onRemove: () => void
}) {
  return (
    <>
      <Hint
        label={off ? `Show ${name.toLowerCase()}` : `Hide ${name.toLowerCase()}`}
        detail="Kept in the file either way"
      >
        <Button
          variant="ghost"
          size="icon-sm"
          className="size-7"
          // A toggle keeps one name; pressed says it's hidden.
          aria-label={`Hide ${name}`}
          aria-pressed={off}
          onClick={onToggle}
        >
          {off ? <EyeOff /> : <Eye />}
        </Button>
      </Hint>
      <Hint label={`Remove ${name.toLowerCase()}`}>
        <Button variant="ghost" size="icon-sm" className="size-7" aria-label={`Remove ${name}`} onClick={onRemove}>
          <Minus />
        </Button>
      </Hint>
    </>
  )
}

/**
 * Moves one item of a list from one place to another. A place past either end leaves the list as it is, so Up on the
 * first entry and Down on the last do nothing.
 */
export function moved<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list]
  const within = (at: number) => Number.isInteger(at) && at >= 0 && at < list.length
  if (!within(from) || !within(to)) return next
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item!)
  return next
}

/** One of the types an entry can be, with a glyph for a compact menu. */
export interface TypeOption<K extends string> {
  value: K
  label: string
  glyph?: ReactNode
}

export interface TypeMenuProps<K extends string> {
  /** The entry's name, for the menu's accessible name: "Fill 1". */
  label: string
  value: K
  options: readonly TypeOption<K>[]
  /** The type's glyph alone, where the entry's value takes the room its name would, as a solid fill's does. */
  compact?: boolean
  onChange: (value: K) => void
}

/** An entry's type menu, which changes it to another type: Drop shadow to Ring, Solid to Linear. */
export function TypeMenu<K extends string>({ label, value, options, compact = false, onChange }: TypeMenuProps<K>) {
  const current = options.find((option) => option.value === value)
  const named = `${label} type: ${current?.label ?? value}`
  const trigger = compact ? (
    <Hint label={`${current?.label ?? value}: change type`}>
      <DropdownMenuTrigger
        aria-label={named}
        className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-popup-open:bg-accent"
      >
        {current?.glyph}
      </DropdownMenuTrigger>
    </Hint>
  ) : (
    <DropdownMenuTrigger
      aria-label={named}
      className="flex shrink-0 items-center gap-0.5 rounded-sm px-0.5 outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring data-popup-open:bg-accent"
    >
      {current?.label ?? value}
      <ChevronDown className="size-3 text-muted-foreground" />
    </DropdownMenuTrigger>
  )
  return (
    <DropdownMenu>
      {trigger}
      <DropdownMenuContent align="start" className="w-40">
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(next) => {
            const picked = options.find((option) => option.value === next)
            if (picked) onChange(picked.value)
          }}
        >
          {options.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value} className="gap-2 text-xs">
              {option.glyph}
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * A slider centered on no change, as Figma's and every photo editor's adjustments are, with its number beside it on
 * the shared field: typed with the app's maths, held to the slider's ends, Up and Down 1, Shift 10.
 * Double-clicking the slider puts it back to no change.
 */
export function CenteredSlider({
  label,
  value,
  min,
  max,
  unit = "",
  hint,
  onChange
}: {
  label: string
  value: number
  min: number
  max: number
  unit?: string
  /** The class it writes, shown in the hint. */
  hint: string
  onChange: (value: number) => void
}) {
  const zero = min < 0 ? 0 : min
  // The track past the value, visible on a dark popover too.
  const rest = "color-mix(in oklab, var(--muted-foreground) 35%, transparent)"
  const at = (number: number) => ((number - min) / (max - min)) * 100
  const from = Math.min(at(zero), at(value))
  const to = Math.max(at(zero), at(value))
  const track: CSSProperties = {
    background: `linear-gradient(to right, ${rest} ${from}%, var(--primary) ${from}%, var(--primary) ${to}%, ${rest} ${to}%)`
  }
  const takes = `${label} takes a number from ${min} to ${max}`
  const read = (text: string): Reading<number> => {
    const reading = readNumber(text.replace(unit, "").replace("−", "-"), value, label)
    if ("clear" in reading) return { reason: takes }
    if ("reason" in reading) return { reason: reading.reason.startsWith("Can't read") ? takes : reading.reason }
    const number = Math.round(reading.value)
    // Past either end, it stops there: the field shows it, so it says nothing.
    return { value: Math.min(max, Math.max(min, number)) }
  }
  return (
    <div className="grid grid-cols-[72px_1fr_3.25rem] items-center gap-x-2">
      <Hint label={label} detail={value === zero ? "No change, which writes nothing" : `Writes ${hint}`} wait>
        <span className="truncate text-xs text-muted-foreground">{label}</span>
      </Hint>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        onDoubleClick={() => onChange(zero)}
        onKeyDown={(event) => {
          if (!event.shiftKey || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return
          event.preventDefault()
          const up = event.key === "ArrowRight" || event.key === "ArrowUp"
          onChange(clamp(value + (up ? 10 : -10), min, max))
        }}
        style={track}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-slider-thumb]:size-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-primary [&::-webkit-slider-thumb]:bg-background"
      />
      <ValueField
        label={`${label} value`}
        shown={formatNumber(value)}
        unit={unit || undefined}
        read={read}
        onCommit={onChange}
        onStep={(up, { shift }) => onChange(clamp(value + (up ? 1 : -1) * (shift ? 10 : 1), min, max))}
      />
    </div>
  )
}

/**
 * The offset pad, as DevTools' shadow editor has it: a square whose center is no offset, dragged to set X and Y at
 * once, or moved with the arrow keys, 1px a step and 10px with Shift.
 */
export function OffsetPad({ x, y, onChange }: { x: number; y: number; onChange: (x: number, y: number) => void }) {
  // The pad reaches a little past the offset, so a large one stays on it.
  const reach = Math.max(24, Math.abs(x), Math.abs(y)) * 1.25
  // The reach stays as it was at the press while the pad's dragged.
  const press = (event: PointerEvent<HTMLDivElement>) =>
    drag(event, {
      press: true,
      move: (point) => onChange(Math.round((point.x * 2 - 1) * reach), Math.round((point.y * 2 - 1) * reach))
    })
  return (
    <div
      role="slider"
      aria-label="Offset"
      aria-valuetext={`X ${x}, Y ${y}`}
      aria-valuenow={x}
      tabIndex={0}
      onPointerDown={press}
      onKeyDown={(event) => {
        const moves: Record<string, [number, number]> = {
          ArrowLeft: [-1, 0],
          ArrowRight: [1, 0],
          ArrowUp: [0, -1],
          ArrowDown: [0, 1]
        }
        const move = moves[event.key]
        if (!move) return
        event.preventDefault()
        const step = event.shiftKey ? 10 : 1
        onChange(x + move[0] * step, y + move[1] * step)
      }}
      className="relative size-20 shrink-0 cursor-crosshair touch-none rounded-md border bg-muted/40 outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span aria-hidden className="absolute inset-x-0 top-1/2 h-px bg-border" />
      <span aria-hidden className="absolute inset-y-0 left-1/2 w-px bg-border" />
      <span
        aria-hidden
        className="absolute size-2.5 -translate-1/2 rounded-full border-2 border-background bg-primary shadow"
        style={{ left: `${50 + (x / reach) * 50}%`, top: `${50 + (y / reach) * 50}%` }}
      />
    </div>
  )
}
