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
import { drag, type Reading, readNumber, useLiveRow, ValueField } from "./field-parts.tsx"
import { Field } from "./field-row.tsx"

/*
 * What the list fields share (design-options-fields.md, Lists): the entry's row, in the spec's order (the drag handle
 * where there's another row to move past, the entry with its preview, name and summary, which opens its details, the
 * eye and −), the type menu its details start with, the centered slider of Adjustments and the offset pad. Fields,
 * chips, angles, positions and the nine spots are the core's (field-parts.tsx, angle.tsx, position-box.tsx).
 */

/** The box an entry's preview, name and summary share in its row, drawn as a field is. */
const entryBox =
  "flex h-7 min-w-0 flex-1 items-center gap-2 rounded-md bg-muted px-1.5 text-left text-xs dark:bg-input/40"

export interface ListRowProps {
  /** What the entry is, for its buttons' names: "Drop shadow 1". */
  name: string
  /** Rows are reordered only among rows of the same group (Inside or Outside shadows). */
  group: string
  index: number
  off?: boolean
  /**
   * Set where the row can move: its group has another row. Unset for a row alone in its group, or a list in a fixed
   * order, as the filter list is; then there's no handle.
   */
  onMove?: (from: number, to: number) => void
  /** Another group in the list has handles, so a row without one keeps their room and the entries line up. */
  gutter?: boolean
  onToggle: () => void
  onRemove: () => void
  /**
   * What the entry is, after its preview: its type ("Drop shadow", "Linear") or what it changes ("Colors"). It keeps
   * its room; the summary after it is cut first.
   */
  title?: ReactNode
  /**
   * The entry's summary, faint, after its name: its token, numbers or words (`md`, `180°`, `200ms, Ease out`). Without
   * a preview or title, the row's control of its own instead, as a solid fill's color field.
   */
  children: ReactNode
  /** The entry's preview (swatch, gradient strip, shadow card, filter glyph), first in the entry. */
  preview?: ReactNode
  /** The preview drawn for whether the row is live (hovered or focused), in place of `preview`, so it can play. */
  renderPreview?: (live: boolean) => ReactNode
  /**
   * The entry's details, in the popover the whole entry opens, as every list's entries have them. They start with the
   * entry's type menu where it has one (`EntryType`), so the row has only what it is.
   */
  details?: {
    content: ReactNode
    /** Open at first, for a story. */
    defaultOpen?: boolean
    /** Whether it's open, where what's in it closes it, as picking a blur's token does. */
    open?: boolean
    onOpenChange?: (open: boolean) => void
    className?: string
  }
  /**
   * What follows the entry before the eye, as a gradient's alpha does. It's placed in the row's second column
   * (`col-start-2 row-start-1`, as `PercentField`'s `rowClassName`), so what it says goes under the whole entry.
   */
  after?: ReactNode
}

/**
 * One entry's row, in the order design-options-fields.md's Lists sets: a drag handle where the row can move, always
 * shown, which also moves it with Up and Down and removes it with Delete; the entry, its preview, its name and a faint
 * summary, which opens its details; the eye, which turns it off without removing it (pressed while it's off); and −.
 * Rows are dragged within their group only.
 */
export function ListRow({
  name,
  group,
  index,
  off = false,
  onMove,
  gutter = false,
  onToggle,
  onRemove,
  title,
  children,
  preview,
  renderPreview,
  details,
  after
}: ListRowProps) {
  const [draggable, setDraggable] = useState(false)
  const [over, setOver] = useState(false)
  const { live, rowProps } = useLiveRow()
  const drawn = renderPreview ? renderPreview(live(name)) : preview
  const dataType = `application/x-parity-${group}`

  const parts = (
    <>
      {/* One width for every preview, so the names after them line up down the list. */}
      {drawn !== undefined && <span className="grid w-6 shrink-0 place-items-center">{drawn}</span>}
      {title !== undefined && <span className="max-w-3/5 shrink-0 truncate">{title}</span>}
      <span className="ml-auto flex min-w-0 shrink items-center justify-end gap-1 truncate text-muted-foreground tabular-nums">
        {children}
      </span>
    </>
  )

  let entry: ReactNode = children

  if (details) {
    entry = (
      <Popover defaultOpen={details.defaultOpen} open={details.open} onOpenChange={details.onOpenChange}>
        <Hint label={`Edit ${name.toLowerCase()}`} wait>
          <PopoverTrigger
            aria-label={`Edit ${name}`}
            className={`${entryBox} outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring data-popup-open:bg-accent`}
            {...rowProps(name)}
          >
            {parts}
          </PopoverTrigger>
        </Hint>
        <PopoverContent className={details.className ?? "w-72 p-2"} align="start">
          {details.content}
        </PopoverContent>
      </Popover>
    )
  } else if (drawn !== undefined || title !== undefined) {
    entry = (
      <div className={entryBox} {...rowProps(name)}>
        {parts}
      </div>
    )
  }

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
      <div className="group/row flex min-h-7 items-start gap-1 rounded-md">
        {gutter && <span aria-hidden className="w-3 shrink-0" />}
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
        if (!event.dataTransfer.types.includes(dataType)) {
          return
        }

        event.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event: DragEvent) => {
        setOver(false)
        const from = Number(event.dataTransfer.getData(dataType))

        if (Number.isFinite(from) && from !== index) {
          onMove(from, index)
        }
      }}
      className={`group/row flex min-h-7 items-start gap-1 rounded-md ${over ? "ring-2 ring-ring" : ""}`}
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
          className="grid h-7 w-3 shrink-0 cursor-grab place-items-center rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <GripVertical className="size-3" />
        </button>
      </Hint>
      {content}
      <RowButtons name={name} off={off} onToggle={onToggle} onRemove={onRemove} />
    </div>
  )
}

/**
 * The type menu an entry's details start with, which changes it to another type (Drop shadow to Ring, Solid to
 * Linear), as Figma's effect settings start with theirs.
 */
export function EntryType({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`flex h-7 items-center text-xs font-medium ${className}`}>{children}</div>
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

  if (!within(from) || !within(to)) {
    return next
  }

  const [item] = next.splice(from, 1)
  next.splice(to, 0, item!)

  return next
}

/** One of the types an entry can be, with a glyph for where types are picked by it, as a fill's are. */
export interface TypeOption<K extends string> {
  value: K
  label: string
  glyph?: ReactNode
}

export interface TypeMenuProps<K extends string> {
  /** The entry's name, for the menu's accessible name: "Drop shadow 1". */
  label: string
  value: K
  options: readonly TypeOption<K>[]
  onChange: (value: K) => void
}

/** An entry's type menu, at the top of its details, which changes it to another type: Drop shadow to Ring. */
export function TypeMenu<K extends string>({ label, value, options, onChange }: TypeMenuProps<K>) {
  const current = options.find((option) => option.value === value)
  const named = `${label} type: ${current?.label ?? value}`

  const trigger = (
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

            if (picked) {
              onChange(picked.value)
            }
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
 * A slider centered on no change, as Figma's and every photo editor's adjustments are: its name above, as every row's
 * is, then the slider across the row with its number at the end on the shared field, typed with the app's maths, held
 * to the slider's ends, Up and Down 1, Shift 10. Double-clicking the slider puts it back to no change.
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

    if ("clear" in reading) {
      return { reason: takes }
    }

    if ("reason" in reading) {
      return { reason: reading.reason.startsWith("Can't read") ? takes : reading.reason }
    }

    const number = Math.round(reading.value)

    // Past either end, it stops there: the field shows it, so it says nothing.
    return { value: Math.min(max, Math.max(min, number)) }
  }

  return (
    <Field label={label} hint={value === zero ? "No change, which writes nothing" : `Writes ${hint}`}>
      <div className="grid grid-cols-[1fr_3.25rem] items-center gap-x-2">
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
            if (!event.shiftKey || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
              return
            }

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
    </Field>
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
        const moves = new Map([
          ["ArrowLeft", [-1, 0]],
          ["ArrowRight", [1, 0]],
          ["ArrowUp", [0, -1]],
          ["ArrowDown", [0, 1]]
        ])

        const move = moves.get(event.key)

        if (!move) {
          return
        }

        event.preventDefault()
        const step = event.shiftKey ? 10 : 1
        onChange(x + move[0] * step, y + move[1] * step)
      }}
      // As tall as the X and Y fields it sits beside, two h-7 fields and their gap-1, so its edges line up with theirs.
      className="relative size-15 shrink-0 cursor-crosshair touch-none rounded-md border bg-muted/40 outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
