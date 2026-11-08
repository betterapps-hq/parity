/* oxlint-disable jsx-a11y/prefer-tag-over-role -- the offset pad is a slider on two axes, which no input element is */
import { Button, Popover, PopoverContent, PopoverTrigger } from "@buildkitgg/shadcn-baseui-kit"
import { CircleAlert, Eye, EyeOff, GripVertical, Minus } from "lucide-react"
import {
  type CSSProperties,
  type DragEvent,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  useState
} from "react"
import { Hint } from "../../chrome/Hint.tsx"

/*
 * What the list fields share (design-options-fields.md, Lists): the entry's row with its drag handle, eye and −; the
 * centered slider of Adjustments; the offset pad; the angle field with its dial; and the nine-spot box.
 */

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/**
 * One entry's row: a drag handle on hover, which also moves it with Up and Down and removes it with Delete; the entry's
 * own controls; the eye, which turns it off without removing it; and −. Rows are dragged within their group only.
 */
export function ListRow({
  name,
  group,
  index,
  off = false,
  onMove,
  onToggle,
  onRemove,
  children
}: {
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
  children: ReactNode
}) {
  const [draggable, setDraggable] = useState(false)
  const [over, setOver] = useState(false)
  const type = `application/x-parity-${group}`
  if (onMove === undefined) {
    return (
      <div className="group/row flex min-h-8 items-center gap-1 rounded-md">
        <span aria-hidden className="w-3 shrink-0" />
        <div className={`flex min-w-0 flex-1 items-center gap-1 ${off ? "opacity-50" : ""}`}>{children}</div>
        <RowButtons name={name} off={off} onToggle={onToggle} onRemove={onRemove} />
      </div>
    )
  }
  return (
    <div
      draggable={draggable}
      onDragStart={(event: DragEvent) => {
        event.dataTransfer.setData(type, String(index))
        event.dataTransfer.effectAllowed = "move"
      }}
      onDragEnd={() => setDraggable(false)}
      onDragOver={(event: DragEvent) => {
        if (!event.dataTransfer.types.includes(type)) return
        event.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event: DragEvent) => {
        setOver(false)
        const from = Number(event.dataTransfer.getData(type))
        if (Number.isFinite(from) && from !== index) onMove(from, index)
      }}
      className={`group/row flex min-h-8 items-center gap-1 rounded-md ${over ? "ring-2 ring-ring" : ""}`}
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
      <div className={`flex min-w-0 flex-1 items-center gap-1 ${off ? "opacity-50" : ""}`}>{children}</div>
      <RowButtons name={name} off={off} onToggle={onToggle} onRemove={onRemove} />
    </div>
  )
}

/** The eye, which turns an entry off without removing it, and −. */
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
          aria-label={off ? `Show ${name}` : `Hide ${name}`}
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

/** Moves one item of a list from one place to another. */
export function moved<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item!)
  return next
}

/** A message under a row: an error, or a note about what was put back or what's written. */
export function RowMessage({ tone, children }: { tone: "error" | "note"; children: ReactNode }) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={`col-span-full text-[11px] leading-snug ${tone === "error" ? "text-destructive" : "text-muted-foreground"}`}
    >
      {children}
    </p>
  )
}

/**
 * A slider centered on no change, as Figma's and every photo editor's adjustments are, with its number beside it. Up
 * and Down step 1, Shift 10; double-clicking the slider puts it back to no change.
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
  const [typed, setTyped] = useState<string>()
  const [message, setMessage] = useState<string>()
  const commit = () => {
    if (typed === undefined) return true
    const number = Number(typed.replace("°", "").replace("−", "-").trim())
    if (typed.trim() === "" || !Number.isFinite(number)) {
      setMessage(`${label} takes a number from ${min} to ${max}`)
      return false
    }
    onChange(clamp(Math.round(number), min, max))
    setTyped(undefined)
    setMessage(undefined)
    return true
  }
  return (
    <div className="grid grid-cols-[72px_1fr_44px] items-center gap-2">
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
      <input
        aria-label={`${label} value`}
        aria-invalid={message ? true : undefined}
        inputMode="numeric"
        value={typed ?? `${value}${unit}`}
        onChange={(event) => setTyped(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && commit()) event.currentTarget.blur()
          if (event.key === "Escape") {
            setTyped(undefined)
            setMessage(undefined)
          }
          if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            event.preventDefault()
            setTyped(undefined)
            onChange(clamp(value + (event.key === "ArrowUp" ? 1 : -1) * (event.shiftKey ? 10 : 1), min, max))
          }
        }}
        onBlur={() => {
          if (!commit()) {
            setTyped(undefined)
            setMessage(undefined)
          }
        }}
        className={`h-7 w-full min-w-0 rounded-md border bg-transparent px-1.5 text-right text-xs tabular-nums outline-none focus-visible:ring-2 dark:bg-input/30 ${message ? "border-destructive focus-visible:ring-destructive/40" : "focus-visible:ring-ring"}`}
      />
      {message && <RowMessage tone="error">{message}</RowMessage>}
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
  const drag = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    const move = (clientX: number, clientY: number) =>
      onChange(
        Math.round(clamp(((clientX - box.left) / box.width) * 2 - 1, -1, 1) * reach),
        Math.round(clamp(((clientY - box.top) / box.height) * 2 - 1, -1, 1) * reach)
      )
    move(event.clientX, event.clientY)
    const target = event.currentTarget
    target.setPointerCapture(event.pointerId)
    const onMove = (next: globalThis.PointerEvent) => move(next.clientX, next.clientY)
    const onUp = () => {
      target.removeEventListener("pointermove", onMove)
      target.removeEventListener("pointerup", onUp)
    }
    target.addEventListener("pointermove", onMove)
    target.addEventListener("pointerup", onUp)
  }
  return (
    <div
      role="slider"
      aria-label="Offset"
      aria-valuetext={`X ${x}, Y ${y}`}
      aria-valuenow={x}
      tabIndex={0}
      onPointerDown={drag}
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

/**
 * A percentage: typed with or without its %, Up and Down 1%, Shift 10%, kept between its ends. What it can't read stays,
 * outlined, with the reason under it; Escape or leaving puts the value back and says so.
 */
export function PercentField({
  label,
  inner,
  value,
  min = 0,
  max = 100,
  onChange
}: {
  label: string
  /** A short label inside the field, as X and Y are. */
  inner?: string
  value: number
  min?: number
  max?: number
  onChange: (value: number) => void
}) {
  const [typed, setTyped] = useState<string>()
  const [message, setMessage] = useState<{ tone: "error" | "note"; text: string }>()
  const error = message?.tone === "error"
  const commit = (leaving: boolean) => {
    if (typed === undefined) return true
    const number = Number(typed.replace("%", "").replace("−", "-").trim())
    if (typed.trim() !== "" && Number.isFinite(number)) {
      onChange(clamp(Math.round(number * 100) / 100, min, max))
      setMessage(undefined)
    } else if (!leaving) {
      setMessage({ tone: "error", text: `${label} takes a percentage, such as 40%` })
      return false
    } else {
      setMessage({ tone: "note", text: `${label} is back to ${value}%.` })
    }
    setTyped(undefined)
    return true
  }
  return (
    <>
      <label
        className={`flex h-7 min-w-0 items-center gap-1 rounded-md border bg-transparent px-1.5 text-xs focus-within:ring-2 dark:bg-input/30 ${error ? "border-destructive focus-within:ring-destructive/40" : "focus-within:ring-ring"}`}
      >
        {inner && <span className="shrink-0 text-muted-foreground">{inner}</span>}
        <input
          aria-label={label}
          aria-invalid={error || undefined}
          inputMode="decimal"
          value={typed ?? String(value)}
          onChange={(event) => setTyped(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && commit(false)) event.currentTarget.blur()
            if (event.key === "Escape" && typed !== undefined) {
              setTyped(undefined)
              setMessage(error ? { tone: "note", text: `${label} is back to ${value}%.` } : undefined)
            }
            if (event.key === "ArrowUp" || event.key === "ArrowDown") {
              event.preventDefault()
              setTyped(undefined)
              setMessage(undefined)
              onChange(clamp(value + (event.key === "ArrowUp" ? 1 : -1) * (event.shiftKey ? 10 : 1), min, max))
            }
          }}
          onBlur={() => commit(true)}
          className="w-full min-w-0 bg-transparent tabular-nums outline-none"
        />
        {error ? (
          <CircleAlert aria-hidden className="size-3.5 shrink-0 text-destructive" />
        ) : (
          <span className="shrink-0 text-muted-foreground">%</span>
        )}
      </label>
      {message && <RowMessage tone={message.tone}>{message.text}</RowMessage>}
    </>
  )
}

/** An angle typed in degrees, turns or radians, as degrees; a named direction (`to right`) as its angle. */
export function readAngle(text: string): { degrees: number } | { reason: string } {
  const trimmed = text.trim().toLowerCase().replace("−", "-")
  const named: Record<string, number> = {
    "to top": 0,
    "to top right": 45,
    "to right": 90,
    "to bottom right": 135,
    "to bottom": 180,
    "to bottom left": 225,
    "to left": 270,
    "to top left": 315
  }
  if (trimmed in named) return { degrees: named[trimmed]! }
  const match = /^(-?\d*\.?\d+)\s*(deg|°|turn|rad|grad)?$/.exec(trimmed)
  if (!match) return { reason: `Type an angle, such as 45, 0.25turn or 1rad` }
  const number = Number(match[1])
  const perUnit: Record<string, number> = { deg: 1, "°": 1, turn: 360, rad: 180 / Math.PI, grad: 0.9 }
  return { degrees: Math.round(number * (perUnit[match[2] ?? "deg"] ?? 1) * 100) / 100 }
}

/**
 * An angle field: degrees with a ° after them, typed in any angle unit, Up and Down 1°, Shift 15°. Its dial, from the
 * button inside it, is dragged as DevTools' angle clock is, snapping to 15° with Shift. Angles are kept as typed,
 * never brought back between −180 and 180.
 */
export function AngleField({
  label,
  value,
  onChange
}: {
  label: string
  value: number
  onChange: (degrees: number) => void
}) {
  const [typed, setTyped] = useState<string>()
  const [message, setMessage] = useState<{ tone: "error" | "note"; text: string }>()
  const error = message?.tone === "error"
  const commit = (leaving: boolean) => {
    if (typed === undefined) return true
    const reading = readAngle(typed)
    if ("degrees" in reading) {
      onChange(reading.degrees)
      setMessage(undefined)
    } else if (!leaving) {
      setMessage({ tone: "error", text: reading.reason })
      return false
    } else {
      setMessage({ tone: "note", text: `${label} is back to ${value}°. ${reading.reason}.` })
    }
    setTyped(undefined)
    return true
  }
  const dial = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    const move = (clientX: number, clientY: number, snap: boolean) => {
      const radians = Math.atan2(clientX - (box.left + box.width / 2), -(clientY - (box.top + box.height / 2)))
      const degrees = (Math.round((radians * 180) / Math.PI) + 360) % 360
      onChange(snap ? Math.round(degrees / 15) * 15 : degrees)
    }
    move(event.clientX, event.clientY, event.shiftKey)
    const target = event.currentTarget
    target.setPointerCapture(event.pointerId)
    const onMove = (next: globalThis.PointerEvent) => move(next.clientX, next.clientY, next.shiftKey)
    const onUp = () => {
      target.removeEventListener("pointermove", onMove)
      target.removeEventListener("pointerup", onUp)
    }
    target.addEventListener("pointermove", onMove)
    target.addEventListener("pointerup", onUp)
  }
  return (
    <>
      <div
        className={`flex h-7 min-w-0 flex-1 items-center gap-1 rounded-md border bg-transparent pl-1 text-xs focus-within:ring-2 dark:bg-input/30 ${error ? "border-destructive focus-within:ring-destructive/40" : "focus-within:ring-ring"}`}
      >
        <Popover>
          <Hint label="Dial" detail="Drag around it; Shift snaps to 15°">
            <PopoverTrigger
              aria-label={`${label} dial`}
              className="grid size-5 shrink-0 place-items-center rounded-sm outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span
                aria-hidden
                className="relative block size-3.5 rounded-full border border-muted-foreground"
                style={{ transform: `rotate(${value}deg)` }}
              >
                <span className="absolute top-0 left-1/2 h-1/2 w-px -translate-x-1/2 bg-foreground" />
              </span>
            </PopoverTrigger>
          </Hint>
          <PopoverContent className="w-auto p-3" align="start">
            <div
              aria-hidden
              onPointerDown={dial}
              className="relative size-24 cursor-pointer touch-none rounded-full border bg-muted/40"
            >
              <span
                className="absolute top-1/2 left-1/2 h-1/2 w-0.5 origin-top -translate-x-1/2 rounded-full bg-primary"
                style={{ transform: `rotate(${value + 180}deg)` }}
              />
              <span className="absolute top-1/2 left-1/2 size-2 -translate-1/2 rounded-full bg-primary" />
            </div>
          </PopoverContent>
        </Popover>
        <input
          aria-label={label}
          aria-invalid={error || undefined}
          value={typed ?? String(value)}
          onChange={(event) => setTyped(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && commit(false)) event.currentTarget.blur()
            if (event.key === "Escape" && typed !== undefined) {
              setTyped(undefined)
              setMessage(error ? { tone: "note", text: `${label} is back to ${value}°.` } : undefined)
            }
            if (event.key === "ArrowUp" || event.key === "ArrowDown") {
              event.preventDefault()
              setTyped(undefined)
              setMessage(undefined)
              onChange(value + (event.key === "ArrowUp" ? 1 : -1) * (event.shiftKey ? 15 : 1))
            }
          }}
          onBlur={() => commit(true)}
          className="w-0 min-w-6 flex-1 bg-transparent tabular-nums outline-none"
        />
        {error ? (
          <CircleAlert aria-hidden className="mr-1 size-3.5 shrink-0 text-destructive" />
        ) : (
          <span className="pr-1.5 text-muted-foreground">°</span>
        )}
      </div>
      {message && <RowMessage tone={message.tone}>{message.text}</RowMessage>}
    </>
  )
}

const spots = [0, 50, 100] as const
const spotWords = { 0: ["top", "left"], 50: ["middle", "center"], 100: ["bottom", "right"] } as const

/**
 * A position in a box: the nine spots, and a dot where a value off them sits, with its X and Y. Dragging inside sets
 * any position; Shift snaps to the spots.
 */
export function NineSpot({
  label,
  value,
  onChange
}: {
  label: string
  value: [number, number]
  onChange: (value: [number, number]) => void
}) {
  const [x, y] = value
  const onSpot = spots.includes(x as 0) && spots.includes(y as 0)
  const drag = (event: PointerEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return
    const box = event.currentTarget.getBoundingClientRect()
    const move = (clientX: number, clientY: number, snap: boolean) => {
      const at = (offset: number, size: number) => clamp(Math.round((offset / size) * 100), 0, 100)
      let next: [number, number] = [at(clientX - box.left, box.width), at(clientY - box.top, box.height)]
      if (snap) next = next.map((part) => Math.round(part / 50) * 50) as [number, number]
      onChange(next)
    }
    move(event.clientX, event.clientY, event.shiftKey)
    const target = event.currentTarget
    target.setPointerCapture(event.pointerId)
    const onMove = (next: globalThis.PointerEvent) => move(next.clientX, next.clientY, next.shiftKey)
    const onUp = () => {
      target.removeEventListener("pointermove", onMove)
      target.removeEventListener("pointerup", onUp)
    }
    target.addEventListener("pointermove", onMove)
    target.addEventListener("pointerup", onUp)
  }
  return (
    <div className="flex items-center gap-2">
      <div
        aria-label={label}
        role="group"
        onPointerDown={drag}
        className="relative grid size-[60px] shrink-0 touch-none grid-cols-3 grid-rows-3 rounded-md border bg-muted/40 p-0.5"
      >
        {spots.flatMap((top) =>
          spots.map((left) => {
            const active = x === left && y === top
            return (
              <button
                key={`${top}-${left}`}
                type="button"
                aria-label={`${label}: ${top === 50 && left === 50 ? "center" : `${spotWords[top][0]} ${spotWords[left][1]}`}`}
                aria-pressed={active}
                onClick={() => onChange([left, top])}
                className="group grid place-items-center rounded-sm hover:bg-accent"
              >
                <span
                  className={`block rounded-full ${active ? "size-2 bg-[#0d99ff]" : "size-1 bg-muted-foreground/50 group-hover:bg-muted-foreground"}`}
                />
              </button>
            )
          })
        )}
        {!onSpot && (
          <span
            aria-hidden
            className="pointer-events-none absolute size-2 -translate-1/2 rounded-full bg-[#0d99ff] ring-2 ring-background"
            style={{ left: `${x}%`, top: `${y}%` }}
          />
        )}
      </div>
      <span className="text-xs text-muted-foreground tabular-nums">
        {x}% {y}%
      </span>
    </div>
  )
}

/** Shapes behind a preview, so translucent paints, shadows and blurs show. */
export function PreviewStage({ children }: { children: ReactNode }) {
  return (
    <div className="relative grid size-64 place-items-center">
      <div aria-hidden className="absolute inset-4 overflow-hidden rounded-2xl">
        <div className="absolute top-3 left-4 size-24 rounded-full bg-[#f54900]" />
        <div className="absolute right-4 bottom-3 size-28 rounded-full bg-[#009689]" />
        <div className="absolute top-1/3 left-1/2 size-16 rotate-12 bg-[#ffb900]" />
      </div>
      {children}
    </div>
  )
}
