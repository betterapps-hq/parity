import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@buildkitgg/shadcn-baseui-kit"
import { applyFieldInput, readFieldInput, scrubSteps } from "@parity-app/core"
import type { PreviewKind } from "@parity-app/tokens"
import {
  Check,
  ChevronDown,
  Circle,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  Hexagon,
  Moon,
  TriangleAlert,
  Unlink,
  X
} from "lucide-react"
import {
  createContext,
  type CSSProperties,
  type HTMLAttributes,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useContext,
  useId,
  useRef,
  useState
} from "react"
import { kindColors } from "../../canvas/kinds.tsx"
import { Hint } from "../../chrome/Hint.tsx"
import { onPaper, paper, TokenArt } from "../../chrome/token-previews.tsx"
import { clamp, formatNumber, stepSpacing } from "./css-values.ts"
import { useRowScrub } from "./field-row.tsx"
import { type FieldToken, type OpacityToken, type TokenSetName, type TokenSets, tokenSets } from "./tokens.ts"

/*
 * The one field every styling control builds on, as PAR-652's design-options-fields.md sets its anatomy: an inner
 * label or icon that scrubs, the value or a token's chip, the unit, what it comes to faintly, one status slot, and the
 * token button, with the line under the row where it says things. Around it are the parts the field is made of, which
 * a control that isn't a plain field (a list entry, a menu, a box) uses on its own: typing that's checked before it's
 * stored, scrubbing and dragging, the chip, the token list, the status marks, and the project's tokens.
 */

/* Messages and typing */

/** A button after a message's text: the other reading ("Did you mean 24px?"), or the nearest token. */
export interface MessageAction {
  label: ReactNode
  run: () => void
}

/** What a field says under its row: why it can't read what's typed, what it did, or a question with an answer. */
export interface Message {
  tone: "error" | "note"
  text: string
  action?: MessageAction
}

/** What a field makes of what's typed: the value to store, with anything it says about it, or why it can't. */
export type Reading<T> = { value: T; message?: Message } | { reason: string; action?: MessageAction }

/** A number typed with the app's maths: `8`, `+2`, `*2`, `(24 - 4) / 2`, working from `current` when it starts with one. */
export function readNumber(
  text: string,
  current: number | undefined,
  label: string
): { value: number } | { clear: true } | { reason: string } {
  const rules = { kind: "number" as const, label }
  const outcome = applyFieldInput(readFieldInput(text, rules), current, rules)
  if (!outcome.ok) return { reason: outcome.reason }
  if (typeof outcome.value !== "number") return { clear: true }
  return { value: Math.round(outcome.value * 10_000) / 10_000 }
}

/**
 * A number typed in a field's own units, with the app's maths as `readNumber` reads it: `45`, `0.25turn`, `+15`, `*2`,
 * `(90 - 30) / 2`. A unit at the end converts from that unit, `units` giving what one of each comes to in the field's
 * own; a bare number is in the field's own unit, and a leading `-` is a negative number, not a step down. Text it
 * can't read gets `takes`, which says what the field takes.
 */
export function readUnitNumber(
  text: string,
  {
    units,
    current,
    label,
    takes
  }: { units: Readonly<Record<string, number>>; current: number; label: string; takes: string }
): { value: number } | { reason: string } {
  const trimmed = text.trim()
  const cannot = { reason: `Can't read "${trimmed}". ${takes}` }
  // A percentage is a share of a length, which a field in its own units doesn't take.
  if (trimmed.includes("%")) return cannot
  const withUnit = /^(.*[\d.)])\s*([a-z°]+)$/i.exec(trimmed)
  const unit = withUnit?.[2]?.toLowerCase().replace("°", "deg")
  const factor = unit === undefined ? 1 : units[unit]
  if (factor === undefined) return cannot
  const reading = readNumber(withUnit?.[1] ?? trimmed, current / factor, label)
  if ("clear" in reading) return cannot
  if ("reason" in reading) return reading.reason.startsWith("Can't read") ? cannot : reading
  return { value: Math.round(reading.value * factor * 10_000) / 10_000 }
}

/** A reason as a sentence of its own, ending in a full stop unless it ends in one already or leads into an answer. */
const sentence = (text: string) => (/[.:?!]$/.test(text) ? text : `${text}.`)

/**
 * Text typed into a field, checked before it's stored: `read` gives what to store, or the reason it can't. Text it
 * can't read stays, outlined, with the reason under the row; Enter keeps it, and Escape or leaving puts the value back
 * and says so. Up and Down step the value, ending any typing. Fields that say things on one line under their row
 * together, as a color's channels do, pass that line as `line`; each still outlines itself.
 */
export function useTyped<T>({
  label,
  shown,
  backTo,
  read,
  onCommit,
  onStep,
  line
}: {
  label: string
  /** The value as the field shows it at rest, which Escape puts back. */
  shown: string
  /** What the field says it's back to, where that isn't the text shown (a token's chip shows no text). */
  backTo?: string
  read: (text: string) => Reading<T>
  onCommit: (value: T) => void
  onStep?: (up: boolean, shift: boolean, alt: boolean) => void
  /** A line under the row that several fields share, in place of the field's own. */
  line?: { message: Message | undefined; onMessage: (message: Message | undefined) => void }
}) {
  const [typed, setTyped] = useState<string>()
  const [focused, setFocused] = useState(false)
  const [ownMessage, setOwnMessage] = useState<Message>()
  const [failed, setFailed] = useState(false)
  const message = line ? line.message : ownMessage
  const setMessage = (next: Message | undefined) => {
    setFailed(next?.tone === "error")
    // Once its answer is taken ("Use 24px", the nearest token), the message has been answered, so it goes.
    const action = next?.action
    const said = next && action ? { ...next, action: { ...action, run: () => answer(action) } } : next
    if (line) line.onMessage(said)
    else setOwnMessage(said)
  }
  const answer = (action: MessageAction) => {
    action.run()
    setTyped(undefined)
    setMessage(undefined)
  }
  const error = failed
  const named = backTo ?? (shown || "unset")
  const commit = (leaving: boolean): boolean => {
    if (typed === undefined) return true
    const outcome = read(typed)
    if ("value" in outcome) {
      onCommit(outcome.value)
      setMessage(outcome.message)
    } else if (leaving) {
      setMessage({
        tone: "note",
        text: `${label} is back to ${named}. ${sentence(outcome.reason)}`,
        action: outcome.action
      })
    } else {
      setMessage({ tone: "error", text: outcome.reason, action: outcome.action })
      return false
    }
    setTyped(undefined)
    return true
  }
  return {
    text: typed ?? shown,
    typed,
    focused,
    error,
    message,
    setMessage,
    setTyped,
    input: {
      value: typed ?? shown,
      "aria-invalid": error || undefined,
      onChange: (event: { target: { value: string } }) => setTyped(event.target.value),
      onFocus: () => {
        setFocused(true)
        if (message?.tone === "note" && message.action === undefined) setMessage(undefined)
      },
      onBlur: () => {
        setFocused(false)
        commit(true)
      },
      onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === "Enter" && commit(false)) event.currentTarget.blur()
        if (event.key === "Escape" && typed !== undefined) {
          event.stopPropagation()
          setTyped(undefined)
          setMessage(error ? { tone: "note", text: `${label} is back to ${named}.` } : undefined)
        }
        if (onStep && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
          event.preventDefault()
          setTyped(undefined)
          setMessage(undefined)
          onStep(event.key === "ArrowUp", event.shiftKey, event.altKey)
        }
      }
    }
  }
}

/**
 * Why a value is allowed here, typed as Allow here asks: a sentence, so it wraps and grows, with a handle to drag it
 * taller. Enter submits its form; Shift+Enter starts a line.
 */
function ReasonBox({ reason, onReason }: { reason: string; onReason: (reason: string) => void }) {
  return (
    <textarea
      ref={(node) => node?.focus()}
      aria-label="Why it's allowed here"
      placeholder="Photo backdrop"
      rows={1}
      value={reason}
      onChange={(event) => onReason(event.target.value)}
      onKeyDown={(event) => {
        if (event.key !== "Enter" || event.shiftKey) return
        event.preventDefault()
        event.currentTarget.form?.requestSubmit()
      }}
      className={`${wrappingText} min-h-7 resize-y rounded-md border border-input bg-transparent px-2 py-1 text-xs leading-snug outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30`}
    />
  )
}

/** What a field says under its row, with its answer button when it asks something. It spans a grid's row. */
export function MessageLine({ message }: { message: Message | undefined }) {
  if (!message) return null
  const error = message.tone === "error"
  return (
    <p
      role={error ? "alert" : "status"}
      className={`col-span-full mt-1 flex flex-wrap items-center gap-x-1.5 text-[11px] leading-snug ${error ? "text-destructive" : "text-muted-foreground"}`}
    >
      {message.text}
      {message.action && (
        <button
          type="button"
          // Pressing it leaves the typing where it is, so the field doesn't put its value back and move the answer away.
          onMouseDown={(event) => event.preventDefault()}
          onClick={message.action.run}
          className="inline-flex items-center gap-1 rounded px-1 font-medium text-foreground underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
        >
          {message.action.label}
        </button>
      )}
    </p>
  )
}

/**
 * What Tokens only says of a value of its own: "Not a token. Nearest:" and the nearest token as the answer, as a
 * reading's reason for what's typed, or a message for a value already there.
 */
export function notAToken(nearest: FieldToken, onUse: () => void): { reason: string; action: MessageAction } {
  return { reason: "Not a token. Nearest:", action: { label: `${nearest.name} (${nearest.detail})`, run: onUse } }
}

/**
 * What Tokens only says of a value off a field's steps, where the steps are on the system, as a side's whole pixels
 * are: "Not a step. Nearest:" and the nearest step (`14px`) as the answer. A field's `refusal` takes it.
 */
export function notAStep(nearest: string, onUse: () => void): { reason: string; action: MessageAction } {
  return { reason: "Not a step. Nearest:", action: { label: nearest, run: onUse } }
}

/* Scrubbing and dragging */

/** The keys held while a value is stepped or scrubbed: Shift for bigger steps, Alt for the opposite side or a fine step. */
export interface ScrubKeys {
  shift: boolean
  alt: boolean
}

/**
 * How a drag of a field's label changes its value: by `step` per screen pixel (`shiftStep` with Shift, `altStep` with
 * Alt), a whole spacing step per 2 screen pixels (`spacing`, with core's `scrubSteps`), or a step function of its own
 * (`move`), which tokens in scale order or an angle's units need.
 */
export type ScrubBy = (
  | { step: number; shiftStep: number; altStep?: number }
  | { spacing: true }
  | { move: (start: number, dx: number, keys: ScrubKeys) => number }
) & { min?: number; max?: number }

/** What a field's label scrubs: the value it starts from, and what to do with each value the drag comes to. */
export interface Scrub {
  from: () => number
  apply: (value: number, keys: ScrubKeys) => void
  by: ScrubBy
}

function scrubbed(start: number, dx: number, keys: ScrubKeys, by: ScrubBy): number {
  if ("move" in by) return by.move(start, dx, keys)
  if ("spacing" in by) return stepSpacing(start, scrubSteps(dx, keys.shift))
  let per = by.step
  if (keys.shift) per = by.shiftStep
  else if (keys.alt && by.altStep !== undefined) per = by.altStep
  return start + Math.trunc(dx) * per
}

/**
 * Dragging a label left or right to change a value, as design-options-fields.md's Keys and scrubbing sets: one step per
 * screen pixel, or a spacing step per two, ten with Shift. `apply` gets the keys held, so Four sides can change the
 * opposite side with Alt.
 */
export function scrub(
  from: () => number,
  apply: (value: number, keys: ScrubKeys) => void,
  by: ScrubBy
): (event: ReactPointerEvent<Element>) => void {
  return (event) => {
    if (event.button !== 0) return
    event.preventDefault()
    const start = from()
    drag(event, {
      move: ({ dx, shift, alt }) => {
        const keys = { shift, alt }
        const next = clamp(scrubbed(start, dx, keys, by), by.min ?? -Infinity, by.max ?? Infinity)
        apply(Math.round(next * 10_000) / 10_000, keys)
      }
    })
  }
}

/** Where a dragging pointer is. */
export interface DragPoint {
  clientX: number
  clientY: number
  /** How far it's moved since the press, in screen pixels. */
  dx: number
  dy: number
  /** Where it is across the box (`within`, or the element pressed), from 0 at its left or top to 1, held to the box. */
  x: number
  y: number
  shift: boolean
  alt: boolean
}

/**
 * Follows a pointer from a press on an element until it's let go or the browser cancels it, capturing it so the drag
 * keeps going outside the element. Every drag in the controls goes through this, so none is left listening after a
 * cancelled one. With `press`, the press itself counts as the first move, so a click sets a position.
 */
export function drag(
  event: ReactPointerEvent<Element>,
  {
    move,
    end,
    within,
    press = false
  }: {
    move: (point: DragPoint) => void
    end?: (point: DragPoint, cancelled: boolean) => void
    within?: Element | null
    press?: boolean
  }
): void {
  if (event.button !== 0) return
  const target = event.currentTarget
  const box = (within ?? target).getBoundingClientRect()
  const start = { x: event.clientX, y: event.clientY }
  const at = (pointer: { clientX: number; clientY: number; shiftKey: boolean; altKey: boolean }): DragPoint => ({
    clientX: pointer.clientX,
    clientY: pointer.clientY,
    dx: pointer.clientX - start.x,
    dy: pointer.clientY - start.y,
    x: clamp((pointer.clientX - box.left) / (box.width || 1), 0, 1),
    y: clamp((pointer.clientY - box.top) / (box.height || 1), 0, 1),
    shift: pointer.shiftKey,
    alt: pointer.altKey
  })
  let last = at(event)
  target.setPointerCapture(event.pointerId)
  if (press) move(last)
  const onMove = (moveEvent: Event) => {
    if (!(moveEvent instanceof MouseEvent)) return
    last = at(moveEvent)
    move(last)
  }
  const stop = (cancelled: boolean) => {
    target.removeEventListener("pointermove", onMove)
    target.removeEventListener("pointerup", onUp)
    target.removeEventListener("pointercancel", onCancel)
    end?.(last, cancelled)
  }
  const onUp = () => stop(false)
  const onCancel = () => stop(true)
  target.addEventListener("pointermove", onMove)
  target.addEventListener("pointerup", onUp)
  target.addEventListener("pointercancel", onCancel)
}

/**
 * The color of a value a layer sets over a token or preset it follows (design-options-fields.md's Overrides part of a
 * token): a typography preset's overridden row, a shadow token's color, and the dot on the token's pill. It's the
 * component color, as an instance's overrides are drawn, which PAR-707's typography presets settled on.
 */
export const overrideColor = kindColors.component

/* The field's box */

/**
 * The field's box, as the simpler fields draw it (PAR-186): filled, with no border; hovering outlines it faintly,
 * focus outlines it in the ring's color, and an error in red, which hovering leaves. Nothing in it moves on hover.
 */
export function fieldBox(error: boolean, extra = ""): string {
  const ring = error
    ? "ring-1 ring-destructive"
    : "hover:not-focus-within:ring-1 hover:not-focus-within:ring-border focus-within:ring-1 focus-within:ring-ring"
  return `group/field relative flex h-7 min-w-0 items-center gap-1.5 rounded-md bg-muted px-2 text-xs ring-inset dark:bg-input/40 ${ring} ${extra}`
}

/**
 * The one button over the end of a field (Tokens, or Detach on a token), faded in while the field's hovered or focused,
 * or its list is open, when the field makes room for it (`pr-7`) and a unit or mark at the end moves aside.
 */
export const fieldEndButton =
  "absolute top-1/2 right-1 grid size-5 -translate-y-1/2 place-items-center rounded text-muted-foreground opacity-0 outline-none group-focus-within/field:opacity-100 group-hover/field:opacity-100 hover:bg-background/70 hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring data-popup-open:opacity-100"

/**
 * Text longer than a field's line holds, as a CSS row's value or an expression: it wraps and grows with its text, a
 * line at a time, so none of it is cut off. A box for free text (Classes, a reason) adds `resize-y`, a handle to drag
 * it taller.
 */
export const wrappingText = "field-sizing-content resize-none [overflow-wrap:anywhere]"

/** A bare field's box (ValueField's `bare`): no border until hovered or focused, or while it's in error. */
function bareBox(error: boolean, extra: string): string {
  const edge = error
    ? "border-destructive focus-within:ring-destructive/40"
    : "border-transparent hover:border-input focus-within:border-input focus-within:ring-ring"
  return `group/field flex h-6 min-w-0 items-center justify-center gap-1 rounded-md border bg-transparent px-1 text-xs focus-within:ring-2 ${edge} ${extra}`
}

const inputBase = "w-0 flex-1 bg-transparent tabular-nums outline-none placeholder:text-muted-foreground"

/** The input inside a field's box. */
export const fieldInput = `${inputBase} min-w-0`

/**
 * A unit that opens the field's unit and mode menu (slot 3), as Webflow's unit does: at the box's end at rest, and
 * beside its end button while that shows, so it's drawn as the end button is rather than against the box's edge.
 */
export const unitButtonClass =
  "-mx-1 grid h-5 shrink-0 place-items-center rounded px-1 text-muted-foreground outline-none hover:bg-background/70 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-popup-open:bg-background/70 data-popup-open:text-foreground"

/**
 * A field's unit as a button that opens its unit menu (slot 3), for ValueField's `unit`: the units the field takes,
 * each with what it is, as Line height's ×, px and % are, then a keyword after them where the field takes one (Auto).
 * Choosing a unit shows the value in it.
 */
export function UnitMenu<U extends string>({
  label,
  unit,
  units,
  extra,
  onUnit
}: {
  /** The field's name, for the button's accessible name. */
  label: string
  unit: U
  units: readonly { unit: U; label: string }[]
  extra?: { label: string; run: () => void }
  onUnit: (unit: U) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label={`${label} unit: ${unit}`} className={unitButtonClass}>
        {unit}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuRadioGroup
          value={unit}
          onValueChange={(next) => {
            const chosen = units.find((each) => each.unit === next)
            if (chosen) onUnit(chosen.unit)
          }}
        >
          {units.map((each) => (
            // Choosing a unit is done, so the menu closes, as a menu item's does.
            <DropdownMenuRadioItem key={each.unit} value={each.unit} closeOnClick className="text-xs">
              <span className="w-5 font-mono">{each.unit}</span>
              {each.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        {extra && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-xs" onClick={extra.run}>
              {extra.label}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/* Status marks */

/** The status slot's mark for input the field can't read. */
export function InvalidMark() {
  return <CircleAlert aria-hidden className="size-3.5 shrink-0 text-destructive" />
}

/**
 * The status slot's mark for a token the project no longer has, which the chip strikes through, or for something else
 * it lacks, as a font the frame can't load, which `description` says. With `actions`, it opens a menu of them, as a
 * missing font's Replace and Add font.
 */
export function MissingMark({
  name,
  description = "The project has no token by this name now. Choose another.",
  actions
}: {
  name: string
  /** What's missing and what's drawn instead; a missing token's words unless said. */
  description?: string
  actions?: readonly { label: string; run: () => void }[]
}) {
  const [open, setOpen] = useState(false)
  if (!actions || actions.length === 0) {
    return (
      <Hint label={`${name} is missing`} detail={description}>
        <span className="grid size-5 shrink-0 place-items-center text-amber-600 dark:text-amber-400">
          <CircleDashed aria-label={`${name} is missing`} className="size-3.5" />
        </span>
      </Hint>
    )
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Hint label={`${name} is missing`} detail={description}>
        <PopoverTrigger
          aria-label={`${name} is missing`}
          className="grid size-5 shrink-0 place-items-center rounded-md text-amber-600 outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring data-popup-open:bg-accent dark:text-amber-400"
        >
          <CircleDashed className="size-3.5" />
        </PopoverTrigger>
      </Hint>
      <PopoverContent className="w-60 gap-1 p-1" align="end">
        <p className="px-2 pt-1 pb-1.5 text-[11px] text-muted-foreground">{description}</p>
        {actions.map((action) => (
          <MenuButton
            key={action.label}
            onClick={() => {
              action.run()
              setOpen(false)
            }}
          >
            {action.label}
          </MenuButton>
        ))}
      </PopoverContent>
    </Popover>
  )
}

/**
 * The warning on a deprecated token, with its replacement in the hint; with `onReplace`, it's a button that swaps the
 * replacement in, as the chip's is.
 */
export function DeprecatedMark({
  name,
  replacement,
  onReplace
}: {
  name: string
  replacement: string
  onReplace?: () => void
}) {
  const said = `${name} is deprecated. Use ${replacement} instead`
  return (
    <Hint label={`${name} is deprecated`} detail={`Use ${replacement} instead`}>
      {onReplace ? (
        <button
          type="button"
          aria-label={said}
          onClick={onReplace}
          className="grid size-4 shrink-0 place-items-center rounded-sm text-amber-500 outline-none hover:bg-background/60 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <TriangleAlert className="size-3" />
        </button>
      ) : (
        <span className="grid size-4 shrink-0 place-items-center text-amber-500">
          <TriangleAlert aria-label={said} className="size-3" />
        </span>
      )}
    </Hint>
  )
}

/** The status slot's mark for a value set for one theme, with the theme's value in its hint. */
export function ThemeMark({ label, theme }: { label: string; theme: { name: string; value: string } }) {
  return (
    <Hint label={`Set for ${theme.name}`} detail={`${theme.name}: ${theme.value}`}>
      <button
        type="button"
        aria-label={`${label} is set for ${theme.name}: ${theme.value}`}
        className="grid size-5 shrink-0 place-items-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Moon className="size-3.5" />
      </button>
    </Hint>
  )
}

/**
 * The status slot's mark for a value off the token system, or refused by Tokens only: hollow, or filled once it's
 * allowed here, with the reason in its hint. Its menu has the nearest token, Create token (named here, with this value)
 * where the field can make one, and Allow here, which asks why and keeps the reason with the value. Every field's value
 * of its own uses it.
 */
export function OffSystemMark({
  label,
  description,
  nearest,
  allowed,
  isTaken,
  namePlaceholder = "brand",
  compact = false,
  onUse,
  onCreate,
  onAllow
}: {
  label: string
  /** Says what the value is and that it isn't a token, at the top of the menu. */
  description: string
  nearest: { name: string; preview?: ReactNode }
  allowed: string | undefined
  /** Whether a token of this kind has the name already. */
  isTaken: (name: string) => boolean
  namePlaceholder?: string
  /** Smaller, for the status slot inside a field rather than beside it. */
  compact?: boolean
  onUse: () => void
  /** Makes a token of the value; without it, the menu has no Create token. */
  onCreate?: (name: string) => void
  onAllow: (reason: string | undefined) => void
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState<string>()
  const [reason, setReason] = useState<string>()
  const taken = name !== undefined && isTaken(name.trim())
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) {
          setName(undefined)
          setReason(undefined)
        }
      }}
    >
      <Hint
        label={allowed === undefined ? "Not a token" : `Allowed here: ${allowed}`}
        detail={`Nearest: ${nearest.name}`}
      >
        <PopoverTrigger
          aria-label={`${label} isn't a token${allowed === undefined ? "" : `, allowed here: ${allowed}`}`}
          className={`grid shrink-0 place-items-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-popup-open:bg-accent ${compact ? "size-5" : "size-7"}`}
        >
          {allowed === undefined ? (
            <Circle className="size-3.5" strokeDasharray="3 2" />
          ) : (
            <CircleCheck className="size-3.5" />
          )}
        </PopoverTrigger>
      </Hint>
      <PopoverContent className="w-60 gap-1 p-1" align="end">
        <p className="px-2 pt-1 pb-1.5 text-[11px] text-muted-foreground">{description}</p>
        <MenuButton
          onClick={() => {
            onUse()
            setOpen(false)
          }}
        >
          {nearest.preview}
          Use nearest, <span className="font-mono">{nearest.name}</span>
        </MenuButton>
        {onCreate && name === undefined && <MenuButton onClick={() => setName("")}>Create token…</MenuButton>}
        {onCreate && name !== undefined && (
          <form
            className="flex flex-col gap-1 px-1 py-1"
            onSubmit={(event) => {
              event.preventDefault()
              if (!name.trim() || taken) return
              onCreate(name.trim())
              setOpen(false)
            }}
          >
            <Input
              ref={(input) => input?.focus()}
              aria-label="New token's name"
              placeholder={namePlaceholder}
              value={name}
              onChange={(event) => setName(event.target.value.replace(/\s+/g, "-").toLowerCase())}
              aria-invalid={taken}
              className="h-7 font-mono text-xs"
            />
            {taken && <p className="text-[11px] text-destructive">{`There's a token called ${name} already.`}</p>}
            <Button type="submit" size="sm" className="h-7 text-xs" disabled={!name.trim() || taken}>
              Create {name.trim() || "token"}
            </Button>
          </form>
        )}
        {allowed !== undefined && (
          <MenuButton
            onClick={() => {
              onAllow(undefined)
              setOpen(false)
            }}
          >
            Don&apos;t allow here
          </MenuButton>
        )}
        {allowed === undefined && reason === undefined && (
          <MenuButton onClick={() => setReason("")}>Allow here…</MenuButton>
        )}
        {allowed === undefined && reason !== undefined && (
          // The reason is kept with the value, so it moves with the layer and shows in the mark's hover.
          <form
            className="flex flex-col gap-1 px-1 py-1"
            onSubmit={(event) => {
              event.preventDefault()
              if (!reason.trim()) return
              onAllow(reason.trim())
              setOpen(false)
            }}
          >
            <ReasonBox reason={reason} onReason={setReason} />
            <Button type="submit" size="sm" className="h-7 text-xs" disabled={!reason.trim()}>
              Allow here
            </Button>
          </form>
        )}
      </PopoverContent>
    </Popover>
  )
}

function MenuButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs outline-none hover:bg-accent focus-visible:bg-accent"
    >
      {children}
    </button>
  )
}

/** A row whose value does nothing here: dimmed whole, with why in its hint (principle 10). */
export function DoesNothing({ reason, children }: { reason: string; children: ReactNode }) {
  return (
    <Hint label="Does nothing here" detail={reason}>
      <div className="opacity-50">
        <span className="sr-only">Does nothing here. {reason}</span>
        {children}
      </div>
    </Hint>
  )
}

/** † after a property or value that isn't Baseline, with which browsers draw it in its hint (principle 7). */
export function NotBaseline({ what, browsers = "Chromium" }: { what: string; browsers?: string }) {
  return (
    <Hint label={`${what} isn't Baseline`} detail={`Only ${browsers} draws it; other browsers ignore it`}>
      <span aria-label={`${what} isn't Baseline`} className="cursor-default text-amber-600 dark:text-amber-400">
        †
      </span>
    </Hint>
  )
}

/* Tokens */

/**
 * A token's preview at chip size, drawn by the Tokens panel's own previews, so a font, a line height or a cursor looks
 * the same here as in the panel. Kinds drawn on the design's sheet get the sheet behind them.
 */
export function TokenMark({
  kind,
  value,
  name = "",
  width = 24,
  height = 16,
  playing = false
}: {
  kind: PreviewKind
  value: string
  name?: string
  width?: number
  height?: number
  playing?: boolean
}) {
  return (
    <span
      aria-hidden
      className="relative block shrink-0 overflow-hidden rounded-[3px]"
      style={{
        width,
        height,
        ...(onPaper.has(kind) ? { background: paper.sheet, boxShadow: `inset 0 0 0 1px ${paper.edge}` } : {})
      }}
    >
      <TokenArt token={{ name, kind, values: { default: value } }} width={width} height={height} playing={playing} />
    </span>
  )
}

/** A name without the namespace a field implies: `lg` for `radius-lg` in Radius. */
const withoutNamespace = (name: string, namespace: string | undefined) =>
  namespace && name.startsWith(namespace) ? name.slice(namespace.length) : name

export interface TokenChipProps {
  /** The token's whole name, or the name a missing token had. */
  name: string
  /** The token, which draws the preview and says whether it's deprecated. */
  token?: FieldToken
  /** The namespace the field implies, which the chip leaves off: `radius-lg` shows as `lg` in Radius. */
  namespace?: string
  /** A preview in place of the token's own, as a color's at its alpha. */
  preview?: ReactNode
  /** What it comes to, faintly in the chip, for a chip outside a field; a field shows it after the chip instead. */
  detail?: string
  /** A token the project no longer has: struck through in the warning color. */
  struck?: boolean
  /** A composite token with a part changed here: a dot on the chip in the override color. */
  overridden?: boolean
  /**
   * Shrinks to fit a field too narrow to leave room to type beside it, so the name has the room at rest. The × shows on
   * the field's or the chip's hover or focus either way.
   */
  fill?: boolean
  /** The field's name, for the chip's accessible names (`Radius: radius-lg`). */
  label?: string
  /** The chip opens its field's list: it's that popover's trigger, so it must be inside one. */
  trigger?: boolean
  /** Shows the token's whole name and what it comes to on hover; a narrow field's own hint says it instead. */
  hint?: boolean
  /** A key typed on the focused chip, which replaces the token with what's typed. */
  onType?: (key: string) => void
  onStep?: (up: boolean, keys: ScrubKeys) => void
  /** Takes the token off, or in a field detaches it: Backspace or Delete on the focused chip, or a list entry's ×. */
  onRemove?: () => void
}

/**
 * A token in a field or a list entry, as a pill, as the simpler fields draw it (PAR-186) after Figma UI3's variable pill:
 * the name without the field's namespace, with its whole name and what it comes to in its hint. In a field, the pill is
 * the name alone; outside one, a list entry's, it carries the kind's preview and a × that takes it off. A token the
 * project has replaced is amber, one it no longer has red, and a composite token with a part changed has a dot.
 * Focused, typing replaces it, and Backspace or Delete detaches it (`onRemove`), keeping what it came to where the field
 * can.
 */
export function TokenChip({
  name,
  token,
  namespace,
  preview,
  detail,
  struck = false,
  overridden = false,
  fill = false,
  label,
  trigger = false,
  hint = true,
  onType,
  onStep,
  onRemove
}: TokenChipProps) {
  const shownName = withoutNamespace(name, namespace)
  // In a field, the pill is the name alone, but for a preview the field passes (a color's swatch); outside a field, a
  // list entry's carries the kind's preview.
  let drawn = fill ? undefined : preview
  if (drawn === undefined && token && !fill && !trigger) {
    drawn = <TokenMark kind={token.kind} value={token.value} name={token.name} width={20} height={14} />
  }
  const replacement = token?.deprecated
  let tone = "bg-foreground/10 hover:bg-foreground/15"
  let hintLabel = name
  let hintDetail = token?.detail
  let named = `${label ? `${label}: ` : ""}${name}`
  if (struck) {
    tone = "bg-destructive/15 text-destructive hover:bg-destructive/25"
    hintLabel = `${name} is missing`
    hintDetail = "The project no longer has it. Pick another, or detach."
    named += ", missing"
  } else if (replacement) {
    tone = "bg-amber-500/15 text-amber-700 hover:bg-amber-500/25 dark:text-amber-300"
    hintLabel = `${name} is replaced by ${replacement}`
    named += `, replaced by ${replacement}`
  }
  const content = (
    <>
      {drawn}
      <span className="truncate">{shownName}</span>
      {detail && <span className="shrink-0 text-muted-foreground">{detail}</span>}
    </>
  )
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (onType && event.key.length === 1 && event.key !== " " && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault()
      onType(event.key)
    } else if (onRemove && (event.key === "Backspace" || event.key === "Delete")) {
      event.preventDefault()
      onRemove()
    } else if (onStep && (event.key === "ArrowUp" || event.key === "ArrowDown") && !event.altKey) {
      event.preventDefault()
      onStep(event.key === "ArrowUp", { shift: event.shiftKey, alt: false })
    }
  }
  const main = trigger ? (
    <PopoverTrigger
      aria-label={named}
      onKeyDown={onKeyDown}
      className="flex h-full min-w-0 items-center gap-1 rounded px-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {content}
    </PopoverTrigger>
  ) : (
    <span className="flex min-w-0 items-center gap-1 px-1.5">{content}</span>
  )
  return (
    <span
      className={`group/chip relative flex h-5 ${fill ? "min-w-0 shrink" : "max-w-full min-w-0 shrink"} items-center rounded text-xs ${tone}`}
    >
      {hint ? (
        <Hint label={hintLabel} detail={hintDetail} wait>
          {main}
        </Hint>
      ) : (
        main
      )}
      {onRemove && !trigger && (
        <button
          type="button"
          aria-label={`Remove ${name}${label ? ` from ${label}` : ""}`}
          onClick={onRemove}
          className="mr-0.5 hidden size-4 shrink-0 place-items-center rounded-sm text-muted-foreground outline-none group-hover/chip:grid hover:bg-background/60 hover:text-foreground focus-visible:grid focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-3" />
        </button>
      )}
      {overridden && (
        <span
          className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full ring-1 ring-background"
          style={{ background: overrideColor }}
        >
          <span className="sr-only">A part is changed here</span>
        </span>
      )}
    </span>
  )
}

/**
 * The token button (slot 6): it shows while the field is hovered or focused and holds no token, as Figma's variable
 * button does, and opens the field's token list, as Alt+Down does. It's that popover's trigger.
 */
export function TokenButton({
  label,
  focusOnly = false
}: {
  label: string
  /** Shows only while the field is focused, as in a narrow field, where hovering has no room for it beside the mark. */
  focusOnly?: boolean
}) {
  return (
    <Hint label={`Choose a token for ${label}`} detail="Alt+Down">
      <PopoverTrigger
        aria-label={`${label} tokens`}
        className={`-mr-1 hidden size-5 shrink-0 place-items-center rounded text-muted-foreground outline-none group-focus-within/field:grid ${focusOnly ? "" : "group-hover/field:grid"} hover:bg-accent hover:text-foreground focus-visible:grid focus-visible:ring-2 focus-visible:ring-ring data-popup-open:grid data-popup-open:bg-accent`}
      >
        <Hexagon className="size-3" />
      </PopoverTrigger>
    </Hint>
  )
}

export interface TokenListProps {
  /** The field's name, for the list's accessible name. */
  label: string
  tokens: readonly FieldToken[]
  /** The token the field holds, highlighted. */
  current?: string
  /** A first row that unsets the field, where it can be unset, with what unset is called (None, Auto). */
  none?: string
  /** The field holds a value of its own, so neither the first row nor any token is the one it holds. */
  own?: boolean
  onPick: (name: string | undefined) => void
}

/**
 * A field's tokens, for its popover: each drawn with its kind's preview as the Tokens panel draws it, with what it comes
 * to, a deprecated one marked, and the one the field holds highlighted. Up and Down move through it.
 */
export function TokenList({ label, tokens, current, none, own = false, onPick }: TokenListProps) {
  const rows: { name: string | undefined; token?: FieldToken }[] = [
    ...(none === undefined ? [] : [{ name: undefined }]),
    ...tokens.map((token) => ({ name: token.name, token }))
  ]
  const move = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return
    event.preventDefault()
    const buttons = [...(event.currentTarget.parentElement?.querySelectorAll("button") ?? [])]
    const at = buttons.indexOf(event.currentTarget)
    buttons[clamp(at + (event.key === "ArrowDown" ? 1 : -1), 0, buttons.length - 1)]?.focus()
  }
  return (
    <fieldset aria-label={`${label} tokens`} className="flex max-h-64 min-w-0 flex-col overflow-y-auto">
      {rows.map(({ name, token }) => {
        const selected = name === current && !(name === undefined && own)
        return (
          <button
            key={name ?? "none"}
            type="button"
            aria-current={selected || undefined}
            onClick={() => onPick(name)}
            onKeyDown={move}
            className={`flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs outline-none hover:bg-accent focus-visible:bg-accent ${selected ? "bg-accent" : ""}`}
          >
            {token ? (
              <TokenMark kind={token.kind} value={token.value} name={token.name} />
            ) : (
              <span aria-hidden className="block h-4 w-6 shrink-0" />
            )}
            <span className={`min-w-0 flex-1 truncate ${token ? "" : "text-muted-foreground"}`}>{name ?? none}</span>
            {token?.deprecated && <TriangleAlert aria-label="Deprecated" className="size-3 shrink-0 text-amber-500" />}
            {token && <span className="text-muted-foreground tabular-nums">{token.detail}</span>}
            {selected && <Check aria-hidden className="size-3.5 shrink-0" />}
          </button>
        )
      })}
    </fieldset>
  )
}

/** What a token comes to as a number, where its kind has one (a length, a duration, a percentage, a weight). */
function measureOf(token: FieldToken): number | undefined {
  const fields = token as unknown as Record<string, unknown>
  for (const key of ["px", "ms", "percent", "number", "em", "multiple"]) {
    const value = fields[key]
    if (typeof value === "number") return value
  }
  return undefined
}

/** Tokens that come to numbers, smallest first, as a scale reads; others, as colors, in the project's order. */
function inScaleOrder<T extends FieldToken>(tokens: readonly T[]): readonly T[] {
  if (!tokens.every((token) => measureOf(token) !== undefined)) return tokens
  return tokens.toSorted((a, b) => measureOf(a)! - measureOf(b)!)
}

/** A row of a token menu that isn't a token: Create token, Allow here. */
const menuRow =
  "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs outline-none hover:bg-accent focus-visible:bg-accent"

export interface TokenMenuProps<T extends FieldToken> {
  label: string
  tokens: readonly T[]
  /** The token the field holds. */
  current?: string
  none?: string
  /** The value of its own the field holds, in words (`12px`, `#2563EB`), which the nearest token and Create token are for. */
  own?: string
  nearest?: T
  /** The nearest token comes to the same value as the field's own, so it's offered as the same, not the nearest. */
  same?: boolean
  /** The field holds a value of its own though `own` doesn't say it, so None isn't the one it holds. */
  holdsOwn?: boolean
  /** The order the tokens are listed in, where it isn't the project's: a scale's, smallest first. */
  order?: (a: T, b: T) => number
  /** The token the field holds, replaced, and what replaced it. */
  replaced?: { name: string; by: T }
  namespace?: string
  tokensOnly?: boolean
  /** Why the value of its own is allowed here, in a project set to Tokens only. */
  allowed?: string
  onAllow?: (reason: string | undefined) => void
  /** Makes a token of the value of its own, by the whole name given; without it, the menu has no Create token. */
  onCreate?: (name: string) => void
  onPick: (name: string | undefined) => void
}

/**
 * A field's token menu: the swap for a replaced token; for a value of its own, the nearest token, first, under what it's
 * nearest to (or the same as); the tokens, in `order`, without the ones the project has replaced, which aren't for
 * picking; then Create token, and, in a project set to Tokens only, Allow here, which asks why.
 */
export function TokenMenu<T extends FieldToken>({
  label,
  tokens,
  current,
  none,
  own,
  nearest,
  same = false,
  holdsOwn = false,
  order,
  replaced,
  namespace = "",
  tokensOnly = false,
  allowed,
  onAllow,
  onCreate,
  onPick
}: TokenMenuProps<T>) {
  const [naming, setNaming] = useState<string>()
  const [reason, setReason] = useState<string>()
  const name = (naming ?? "").trim()
  const full = `${namespace}${name}`
  const taken = name !== "" && tokens.some((each) => each.name === full)
  const allowing = tokensOnly && onAllow !== undefined
  const pickable = tokens.filter((each) => each.deprecated === undefined)
  const listed = order ? pickable.toSorted(order) : inScaleOrder(pickable)
  return (
    <div className="flex min-w-0 flex-col">
      {replaced && (
        <button
          type="button"
          onClick={() => onPick(replaced.by.name)}
          className="mb-1 rounded-sm bg-amber-500/10 px-2 py-1.5 text-left text-xs outline-none hover:bg-amber-500/20 focus-visible:ring-2 focus-visible:ring-ring"
        >
          {replaced.name} is replaced. Use {replaced.by.name}
        </button>
      )}
      {own !== undefined && nearest && (
        <div className="mb-1 flex flex-col border-b pb-1">
          <p className="px-2 pt-1 pb-0.5 text-[11px] text-muted-foreground">
            {same ? "Same as" : "Nearest to"} {own}
          </p>
          <button type="button" className={menuRow} onClick={() => onPick(nearest.name)}>
            <TokenMark kind={nearest.kind} value={nearest.value} name={nearest.name} />
            <span className="min-w-0 flex-1 truncate">{nearest.name}</span>
            <span className="text-muted-foreground tabular-nums">{nearest.detail}</span>
          </button>
        </div>
      )}
      {listed.length === 0 && <p className="px-2 py-1.5 text-xs text-muted-foreground">No tokens for {label} yet</p>}
      {(listed.length > 0 || none !== undefined) && (
        <TokenList
          label={label}
          tokens={listed}
          current={current}
          none={none}
          own={own !== undefined || holdsOwn}
          onPick={onPick}
        />
      )}
      {own !== undefined && (onCreate !== undefined || allowing) && (
        <div className="mt-1 flex flex-col border-t pt-1">
          {onCreate && naming === undefined && (
            <button type="button" className={menuRow} onClick={() => setNaming("")}>
              Create token from {own}…
            </button>
          )}
          {onCreate && naming !== undefined && (
            <form
              className="flex flex-col gap-1 p-1"
              onSubmit={(event) => {
                event.preventDefault()
                if (name !== "" && !taken) onCreate(full)
              }}
            >
              <div className="flex items-center gap-1">
                {namespace !== "" && <span className="text-xs text-muted-foreground">{namespace}</span>}
                <Input
                  ref={(node) => node?.focus()}
                  aria-label="New token's name"
                  placeholder={namespace === "" ? "brand" : "card"}
                  value={naming}
                  onChange={(event) => setNaming(event.target.value.replace(/\s+/g, "-").toLowerCase())}
                  aria-invalid={taken || undefined}
                  className="h-7 text-xs"
                />
              </div>
              {taken && <p className="text-[11px] text-destructive">{`There's a token called ${full} already.`}</p>}
              <Button type="submit" size="sm" className="h-7 text-xs" disabled={name === "" || taken}>
                Create {name === "" ? "token" : full}
              </Button>
            </form>
          )}
          {/* A reason kept with the value shows wherever it is, so it isn't lost on a project that's not Tokens only. */}
          {onAllow !== undefined && allowed !== undefined && (
            <>
              <p className="px-2 pt-1 pb-0.5 text-[11px] text-muted-foreground">Allowed here: {allowed}</p>
              <button type="button" className={menuRow} onClick={() => onAllow(undefined)}>
                Don&apos;t allow here
              </button>
            </>
          )}
          {allowing && allowed === undefined && reason === undefined && (
            <button type="button" className={menuRow} onClick={() => setReason("")}>
              Allow {own} here…
            </button>
          )}
          {allowing && allowed === undefined && reason !== undefined && (
            // The reason is kept with the value, so it moves with the layer.
            <form
              className="flex flex-col gap-1 p-1"
              onSubmit={(event) => {
                event.preventDefault()
                if (reason.trim() !== "") onAllow(reason.trim())
              }}
            >
              <ReasonBox reason={reason} onReason={setReason} />
              <Button type="submit" size="sm" className="h-7 text-xs" disabled={reason.trim() === ""}>
                Allow here
              </Button>
            </form>
          )}
        </div>
      )}
    </div>
  )
}
/** One of a search list's options: how it's drawn, and the heading of the group it starts, where it starts one. */
export interface SearchOption {
  /** Unique among the options. */
  key: string
  content: ReactNode
  /** The group it's in, whose name heads it where it starts. */
  group?: string
}

/**
 * The list under a combobox that what's typed searches, as Font's list, an expression's completions and a CSS row's
 * are: each option on a line, headed by its group where one starts, the highlighted one lit. The input keeps focus and
 * moves the highlight with Up and Down (it names the list with `aria-controls` and the option with
 * `aria-activedescendant`, `${id}-${index}`); the pointer highlights on hover and picks on press.
 */
export function SearchList({
  id,
  label,
  options,
  highlight,
  empty,
  className = "",
  onHighlight,
  onPick
}: {
  id: string
  label: string
  options: readonly SearchOption[]
  highlight: number
  /** What it says when nothing's found; without it, an empty list isn't drawn. */
  empty?: string
  /** Where it sits: absolute under its field, or in the flow of a popover. */
  className?: string
  onHighlight: (index: number) => void
  onPick: (index: number) => void
}) {
  if (options.length === 0 && empty === undefined) return null
  return (
    <div
      id={id}
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a combobox's listbox, its options drawn as each needs, which a select or datalist can't draw
      role="listbox"
      aria-label={label}
      className={`flex max-h-64 flex-col overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md ${className}`}
    >
      {options.length === 0 && <p className="px-2 py-1.5 text-xs text-muted-foreground">{empty}</p>}
      {options.map((option, index) => (
        <div key={option.key} className="contents">
          {option.group !== undefined && option.group !== options[index - 1]?.group && (
            <p className="px-2 pt-1.5 pb-1 text-[11px] font-medium text-muted-foreground">{option.group}</p>
          )}
          <div
            id={`${id}-${index}`}
            // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- an option of the listbox above
            role="option"
            tabIndex={-1}
            aria-selected={index === highlight}
            onPointerEnter={() => onHighlight(index)}
            onPointerDown={(event) => {
              // The input keeps focus, so the pick is read as a choice, not as leaving the field.
              event.preventDefault()
              onPick(index)
            }}
            className={`flex cursor-default items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-xs ${index === highlight ? "bg-accent" : ""}`}
          >
            {option.content}
          </div>
        </div>
      ))}
    </div>
  )
}

/** The nearest of a field's tokens to a number, leaving out deprecated ones, which are on their way out. */
export function nearestToken<T extends FieldToken>(tokens: readonly T[], measure: (token: T) => number, to: number) {
  const current = tokens.filter((token) => token.deprecated === undefined)
  if (current.length === 0) return undefined
  return current.reduce((best, token) => (Math.abs(measure(token) - to) < Math.abs(measure(best) - to) ? token : best))
}

interface ProjectTokensValue {
  sets: TokenSets
  create: <K extends TokenSetName>(set: K, token: TokenSets[K][number]) => void
}

const TokensContext = createContext<ProjectTokensValue | undefined>(undefined)

/**
 * The project's tokens for what's inside: tokens.ts's stand-ins, and those made with Create token, held in state so
 * every field and preview inside sees a new one, and nothing outside does. Playground holds one for each story.
 */
export function ProjectTokens({
  tokens,
  children
}: {
  /** Sets the project starts with in place of the stand-ins, as `{ duration: [] }` for a project with no durations. */
  tokens?: Partial<TokenSets>
  children: ReactNode
}) {
  const [sets, setSets] = useState<TokenSets>(() => ({ ...tokenSets, ...tokens }))
  const create = <K extends TokenSetName>(set: K, token: TokenSets[K][number]) =>
    setSets((current) => ({ ...current, [set]: [...current[set], token] }))
  return <TokensContext value={{ sets, create }}>{children}</TokensContext>
}

/**
 * One set of the project's tokens, and how to add to it (Create token). Outside `ProjectTokens` it's the stand-ins, and
 * nothing can be added.
 */
export function useTokens<K extends TokenSetName>(
  set: K
): { tokens: TokenSets[K]; create?: (token: TokenSets[K][number]) => void } {
  const context = useContext(TokensContext)
  if (!context) return { tokens: tokenSets[set] }
  return { tokens: context.sets[set], create: (token) => context.create(set, token) }
}

/** Every set of the project's tokens, for a preview that draws what the fields hold. */
export function useTokenSets(): TokenSets {
  return useContext(TokensContext)?.sets ?? tokenSets
}

/* The field */

/**
 * The status slot's marks (slot 5), of which the field shows the first that applies. Since the simpler fields
 * (PAR-186), a token's problems show on its pill (red for missing, amber for replaced) and a value of its own has no
 * mark, its nearest token and Create token being in its list (`own`), so a field shows only `missing` for something
 * that isn't a token (a font the frame can't load) and `theme`. `offSystem` and `deprecated` are no longer drawn.
 */
export interface StatusMarks {
  missing?: ReactNode
  offSystem?: ReactNode
  theme?: ReactNode
  deprecated?: ReactNode
}

/** The token a field holds, drawn as its pill in the value's place. */
export interface FieldChip {
  name: string
  /** The token, or nothing for one the project no longer has, which shows in red. */
  token?: FieldToken
  namespace?: string
  /** A preview in place of the token's own, as a color's at its alpha. */
  preview?: ReactNode
  overridden?: boolean
  /** Takes the token off, leaving the field unset, where it has nothing to keep (`onDetach`). */
  onRemove: () => void
  /**
   * Detaches the token, keeping what it came to as the field's own value, as Figma's Detach does: the end button, and
   * Backspace or Delete on the pill. Without it, they take the token off (`onRemove`).
   */
  onDetach?: () => void
  /** Swaps a replaced token's replacement in, from the top of the token list. */
  onReplace?: (replacement: string) => void
}

/**
 * A value of the field's own, which its token list is for: the nearest token, first, then Create token, and, in a
 * project set to Tokens only, Allow here, which asks why.
 */
export interface OwnValue {
  /** The value in words, as the list says it: `12px`, `#2563EB`. */
  text: string
  nearest?: FieldToken
  /** The nearest token comes to the same value, so the list offers it as the same, not the nearest. */
  same?: boolean
  /** What the field's tokens' names start with, which Create token puts before the name typed. */
  namespace?: string
  /** Makes a token of the value by the whole name given, and sets the field to it. */
  onCreate?: (name: string) => void
  tokensOnly?: boolean
  /** Why it's allowed here, in a project set to Tokens only. */
  allowed?: string
  onAllow?: (reason: string | undefined) => void
}

export interface ValueFieldProps<T> {
  /** The field's accessible name, and what its messages call it. */
  label: string
  /** Slot 1: a short label (`X`, `W`, `Min`) or an icon inside the field, which scrubs where `scrub` is given. */
  inner?: ReactNode
  scrub?: Scrub
  /** Slot 2: the value as text at rest; unset shows the placeholder faintly. */
  shown: string | undefined
  /** What unset comes to, shown faintly: `0`, `None`, `Hug`, `Auto`. */
  placeholder?: string
  /** The selected layers differ here: unset shows Mixed, and typing replaces every one. */
  mixed?: boolean
  /** The value shows faintly, as one set by another control does. */
  muted?: boolean
  /** Slot 2: the token the field holds, as a chip in the value's place. */
  chip?: FieldChip
  /** Slot 3: the unit, as text, or a button that opens the field's unit and mode menu (`unitButtonClass`). */
  unit?: ReactNode
  /** The unit as text where `unit` is a menu, for a narrow field's hint to name the value whole: `25%`. */
  unitName?: string
  /**
   * Slot 4: what it comes to, or "set by …", faint after the value; in a narrow field, or after a token's pill, in the
   * hint.
   */
  comesTo?: string
  /** Slot 5: the marks that apply to the value; the field shows one. */
  status?: StatusMarks
  /** A value of the field's own, which its token list offers the nearest token and Create token for. */
  own?: OwnValue
  /** Slot 6: the tokens the field offers, drawn as its TokenList, which the token button, the chip and Alt+Down open. */
  tokens?: {
    list: readonly FieldToken[]
    /** The token the field holds, highlighted. */
    current?: string
    /** A first row that unsets the field, with what unset is called (None, Auto). */
    none?: string
    onPick: (name: string | undefined) => void
  }
  /**
   * A picker of the field's own in place of the token list, as Color's Tokens and Custom tabs are. Its `swatch` opens
   * it from the start of the field wherever no chip shows, including while a chip's name is typed over.
   */
  picker?: {
    content: ReactNode
    open: boolean
    onOpenChange: (open: boolean) => void
    className?: string
    swatch?: ReactNode
  }
  read: (text: string) => Reading<T>
  onCommit: (value: T) => void
  onStep?: (up: boolean, keys: ScrubKeys) => void
  /**
   * A value already there that Tokens only refuses: outlined in the error color, with "Not a token. Nearest:" and the
   * nearest token under the row, until it's allowed here.
   */
  refused?: { nearest: FieldToken; onUse: () => void }
  /** A button after the field, as Angle's dial is. */
  trailing?: ReactNode
  /**
   * Under about 96px, as sides and corners are: the unit shows on hover, and what the value comes to is in the hint
   * and under the row while focused.
   */
  narrow?: boolean
  /** The field's hint: what it says, and more on the lines below. A narrow field's names its value. */
  hint?: { label?: string; detail?: string }
  disabled?: boolean
  inputMode?: HTMLAttributes<HTMLInputElement>["inputMode"]
  /** Classes for the input, as a color's monospaced hex. */
  inputClassName?: string
  /** The whole text to edit once focused, where the value shows short at rest (an OKLCH color). */
  editText?: string
  /** The whole value for screen readers, where the field shows it short at rest (an expression's `calc`). */
  description?: string
  /** Selects the value on focus, so typing replaces it. */
  selectOnFocus?: boolean
  /** Classes for the row, as a grid places it beside another field whose messages share the line under both. */
  rowClassName?: string
  /**
   * What Tokens only says of a value already there in words of the field's own, where `refused`'s "Not a token" doesn't
   * fit, as a side's `notAStep`: outlined in the error color, with it under the row, until it's allowed here.
   */
  refusal?: { reason: string; action?: MessageAction }
  /**
   * Alt+Up and Alt+Down step the value with Alt held, as a side's reach the opposite side too (`onStep`'s `alt`),
   * rather than Alt+Down opening the tokens, which the token button and the chip still open.
   */
  altSteps?: boolean
  /**
   * A line its messages go to instead of its own under the row, as the box-model widget's sides say things under the
   * widget: `useTyped`'s `line`. The field then shows nothing under its row; what it comes to is in its hint.
   */
  line?: { message: Message | undefined; onMessage: (message: Message | undefined) => void }
  /**
   * Borderless until hovered or focused, the value centered and no token button, as the box-model widget's sides sit
   * in its rings; typing a token's name, the chip and Alt+Down still reach the tokens.
   */
  bare?: boolean
  /** Styles for the input, as Font draws a family's name in its own face. */
  inputStyle?: CSSProperties
  /**
   * A list under the field that what's typed searches, as Font's list of fonts: focused, it lists everything; typing
   * narrows it; Up and Down move through it, previewing each, and Enter or a click takes the highlighted one. Where
   * nothing's found, Enter reads what's typed as `read` does, so Font keeps a typed stack.
   */
  search?: FieldSearch<T>
  /**
   * `=` opens an expression, as design-options-values.md's Expression has it in any field: typing `=` hands what's
   * typed after it to `onEquals`, which opens the expression's editor. Where the field holds one, `onOpen` opens it as
   * the field's focused, as clicking `calc 648` does.
   */
  expression?: { onEquals: (text: string) => void; onOpen?: () => void }
}

/** What a field's search list offers: each option's drawing and what it stores, and where it's previewed. */
export interface FieldSearch<T> {
  /** The list's accessible name. */
  label: string
  /** The options for what's typed so far, in order; everything when nothing's typed. */
  options: (text: string) => readonly (SearchOption & { value: T })[]
  /**
   * What the list says when nothing's found for what's typed (No fonts match); nothing closes it, as for a typed stack.
   * Either way, Enter reads what's typed as `read` does.
   */
  empty?: (text: string) => string | undefined
  /** The option highlighted with Up and Down or the pointer, to preview it; nothing once the list closes. */
  onHighlight?: (value: T | undefined) => void
}

/**
 * The field every styling control builds on, drawn as the simpler fields are (PAR-186): a filled box with the inner
 * label or icon, which scrubs; the value, or a token's pill, named alone, with what it comes to in its hint; the unit;
 * and one button over the box's end, in room it keeps, faded in on hover or focus: Tokens, or Detach on a token. A
 * value of its own has no mark: its token list offers the nearest token first, then Create token (`own`). What's typed
 * is read when Enter is pressed or the field is left: text it can't read stays, outlined, with the reason under the
 * row, and Escape or leaving puts the value back and says so. Up and Down step it. Typing on a focused pill replaces
 * the token; Backspace in the empty field, or on the pill, detaches it; Alt+Down opens the tokens. Messages span a
 * grid's row, so a row of fields says things under the whole row.
 */
export function ValueField<T>({
  label,
  inner,
  scrub: scrubbing,
  shown,
  placeholder = "",
  mixed = false,
  muted = false,
  chip,
  unit,
  unitName,
  comesTo,
  status,
  own,
  tokens,
  picker,
  read,
  onCommit,
  onStep,
  refused,
  trailing,
  narrow = false,
  hint,
  disabled = false,
  inputMode = "decimal",
  inputClassName = "",
  editText,
  description,
  selectOnFocus = false,
  rowClassName = "",
  refusal,
  altSteps = false,
  line,
  bare = false,
  inputStyle,
  search,
  expression
}: ValueFieldProps<T>) {
  const [listOpen, setListOpen] = useState(false)
  const [searching, setSearching] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const searchId = useId()
  const input = useRef<HTMLInputElement>(null)
  // Set when a pick closes the list, so the focus goes to the value's text rather than a pill that may have gone.
  const picked = useRef(false)
  const unitText = unitName ?? (typeof unit === "string" ? unit : "")
  let backTo = shown === undefined ? placeholder || "unset" : `${shown}${unitText}`
  if (chip) backTo = chip.name
  const typed = useTyped({
    label,
    shown: shown ?? "",
    backTo,
    read,
    onCommit,
    onStep: onStep && ((up, shift, alt) => onStep(up, { shift, alt })),
    line
  })
  const typing = typed.typed !== undefined
  const showChip = chip !== undefined && !typing
  const offers = tokens !== undefined || picker !== undefined
  const open = picker ? picker.open : listOpen
  const setOpen = picker ? picker.onOpenChange : setListOpen
  const said = refused ? notAToken(refused.nearest, refused.onUse) : refusal
  const error = typed.error || said !== undefined
  const clearTyping = () => {
    typed.setTyped(undefined)
    typed.setMessage(undefined)
  }

  // The search list, while the field's focused: what's typed finds, the highlighted one previewed.
  const found = search && searching && typed.focused ? search.options(typed.typed ?? "") : []
  const nothingFound = found.length === 0 ? search?.empty?.(typed.typed ?? "") : undefined
  const showList =
    search !== undefined && searching && typed.focused && (found.length > 0 || nothingFound !== undefined)
  const lit = Math.min(highlight, found.length - 1)
  const closeSearch = () => {
    setSearching(false)
    search?.onHighlight?.(undefined)
  }
  const highlightAt = (index: number) => {
    setHighlight(index)
    search?.onHighlight?.(found[index]?.value)
  }
  const take = (value: T) => {
    onCommit(value)
    clearTyping()
    closeSearch()
    // Left once the typing's cleared, so leaving doesn't read what was typed to search.
    requestAnimationFrame(() => input.current?.blur())
  }

  // The row's name drags the value too, as Figma's labels do, where the field drags at all.
  useRowScrub(
    scrubbing && !disabled
      ? (event) => {
          clearTyping()
          scrub(scrubbing.from, scrubbing.apply, scrubbing.by)(event)
        }
      : undefined
  )

  let labelSlot: ReactNode
  if (inner !== undefined && scrubbing) {
    const handler = scrub(scrubbing.from, scrubbing.apply, scrubbing.by)
    labelSlot = (
      <span
        onPointerDown={(event) => {
          if (event.button !== 0 || disabled) return
          clearTyping()
          handler(event)
        }}
        className="flex shrink-0 cursor-ew-resize touch-none items-center text-muted-foreground select-none"
      >
        {inner}
      </span>
    )
  } else if (typeof inner === "string") {
    labelSlot = <span className="shrink-0 text-muted-foreground select-none">{inner}</span>
  } else labelSlot = inner

  let fieldPlaceholder = mixed && shown === undefined ? "Mixed" : placeholder
  if (showChip) fieldPlaceholder = ""

  // A token's problems show on its pill, and a value of its own has no mark; what's left is something missing that
  // isn't a token (a font), and a value set for a theme.
  let mark: ReactNode
  if (!typing) mark = showChip ? status?.theme : (status?.missing ?? status?.theme)

  // A narrow field has room for one thing after the value: its status mark takes the unit's place, which its hint names.
  const showUnit =
    unit !== undefined && !typed.focused && !showChip && (shown !== undefined || !mixed) && !(narrow && mark)
  let unitPart: ReactNode
  if (showUnit && typeof unit === "string") {
    unitPart = (
      <span className={`shrink-0 text-muted-foreground ${narrow ? "hidden group-hover/field:inline" : ""}`}>
        {unit}
      </span>
    )
  } else if (showUnit) {
    unitPart = <span className={narrow ? "hidden group-hover/field:contents" : "contents"}>{unit}</span>
  }

  const hintLabel = hint?.label ?? (narrow ? `${label}: ${backTo}` : undefined)
  // What a token comes to is in its pill's hint, and a narrow field's in the field's.
  const hintDetail = narrow ? [comesTo, hint?.detail].filter(Boolean).join(". ") || undefined : hint?.detail
  const detach = () => {
    if (!chip) return
    const detaching = chip.onDetach ?? chip.onRemove
    detaching()
    // The pill and Detach go, so the value's text takes the focus.
    input.current?.focus()
  }
  // Room at the box's end for its one button, only while it shows: on hover or focus, and while Tokens has its list
  // open (Detach shows only on hover or focus). At rest, a unit or mark sits at the end, and moves aside for it.
  const endRoom = !bare && (offers || chip !== undefined)
  let room = ""
  if (endRoom && open && !showChip) room = "pr-7"
  else if (endRoom) room = "transition-[padding] duration-100 hover:pr-7 focus-within:pr-7"

  const boxExtra = `flex-1 ${room} ${disabled ? "opacity-50" : ""}`
  const box = (
    <Hint label={hintLabel} detail={hintDetail} hidden={open} wait>
      <div className={bare ? bareBox(error, boxExtra) : fieldBox(error, boxExtra)}>
        {labelSlot}
        {picker?.swatch !== undefined && !showChip && (
          // Named as the end button is, since both open the picker; the field's text already says what's set.
          <Hint label="Picker">
            <PopoverTrigger
              aria-label={`${label} picker`}
              disabled={disabled}
              className="-ml-0.5 grid size-5 shrink-0 place-items-center rounded-sm outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
            >
              {picker.swatch}
            </PopoverTrigger>
          </Hint>
        )}
        {showChip && (
          <TokenChip
            name={chip.name}
            token={chip.token}
            namespace={chip.namespace}
            preview={chip.preview}
            struck={chip.token === undefined}
            overridden={chip.overridden}
            fill={narrow}
            label={label}
            trigger={offers}
            hint={!narrow}
            onType={(key) => {
              if (expression && key === "=") expression.onEquals("")
              else typed.setTyped(key)
              input.current?.focus()
            }}
            onStep={onStep}
            onRemove={detach}
          />
        )}
        <input
          ref={input}
          aria-label={label}
          aria-invalid={error || undefined}
          aria-describedby={description === undefined ? undefined : `${searchId}-description`}
          disabled={disabled}
          inputMode={inputMode}
          spellCheck={false}
          placeholder={fieldPlaceholder}
          value={typed.typed ?? (showChip ? "" : (shown ?? ""))}
          role={search ? "combobox" : undefined}
          aria-expanded={search ? showList : undefined}
          aria-controls={search ? searchId : undefined}
          aria-autocomplete={search ? "list" : undefined}
          aria-activedescendant={showList && found[lit] ? `${searchId}-${lit}` : undefined}
          style={inputStyle}
          onChange={(event) => {
            if (expression && event.target.value.startsWith("=")) {
              clearTyping()
              expression.onEquals(event.target.value.slice(1))
              return
            }
            typed.input.onChange(event)
            if (search) {
              setSearching(true)
              setHighlight(0)
            }
          }}
          onFocus={(event) => {
            typed.input.onFocus()
            if (editText !== undefined && !typing) typed.setTyped(editText)
            if (selectOnFocus) event.currentTarget.select()
            if (search) {
              setSearching(true)
              setHighlight(0)
            }
            expression?.onOpen?.()
          }}
          onBlur={() => {
            typed.input.onBlur()
            if (search) closeSearch()
          }}
          onKeyDown={(event) => {
            if (showChip && event.currentTarget.value === "" && (event.key === "Backspace" || event.key === "Delete")) {
              event.preventDefault()
              detach()
              return
            }
            if (expression && event.key === "=") {
              event.preventDefault()
              clearTyping()
              expression.onEquals("")
              return
            }
            if (search && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
              // Up and Down open the list, then move through it, rather than stepping the value.
              event.preventDefault()
              if (!searching) {
                setSearching(true)
                setHighlight(0)
              } else if (found.length > 0) {
                highlightAt((lit + (event.key === "ArrowDown" ? 1 : -1) + found.length) % found.length)
              }
              return
            }
            if (search && event.key === "Enter" && showList && found[lit]) {
              event.preventDefault()
              take(found[lit].value)
              return
            }
            if (search && event.key === "Escape" && searching) closeSearch()
            if (offers && !altSteps && event.key === "ArrowDown" && event.altKey) {
              event.preventDefault()
              setOpen(true)
              return
            }
            typed.input.onKeyDown(event)
          }}
          className={`${inputBase} ${showChip ? "min-w-1" : "min-w-6"} ${muted && !typing ? "text-muted-foreground" : ""} ${said && !typing ? "text-destructive" : ""} ${typed.focused ? "" : "truncate"} ${bare ? "text-center" : ""} ${inputClassName}`}
        />
        {comesTo && !narrow && !showChip && !typed.focused && !typed.error && (
          <span className="min-w-0 shrink truncate text-muted-foreground/70 tabular-nums">{comesTo}</span>
        )}
        {unitPart}
        {mark}
        {showChip && !bare && (
          <Hint
            label="Detach"
            detail={chip.token ? `Keeps ${chip.token.detail}, not the token` : "Clears the missing token"}
          >
            <button
              type="button"
              aria-label={`Detach ${label} from ${chip.name}`}
              disabled={disabled}
              onClick={detach}
              className={fieldEndButton}
            >
              <Unlink className="size-3.5" />
            </button>
          </Hint>
        )}
        {!showChip && offers && !bare && (
          <Hint label={picker ? "Picker" : "Tokens"} detail={altSteps ? undefined : "Alt+Down"}>
            <PopoverTrigger aria-label={`${label} tokens`} disabled={disabled} className={fieldEndButton}>
              <ChevronDown className="size-3.5" />
            </PopoverTrigger>
          </Hint>
        )}
        {description !== undefined && (
          <span id={`${searchId}-description`} className="sr-only">
            {description}
          </span>
        )}
      </div>
    </Hint>
  )

  let message = typed.message
  if (!message && said && !typing) message = { tone: "error", text: said.reason, action: said.action }

  let popup: ReactNode
  if (picker) {
    popup = (
      <PopoverContent className={picker.className ?? "w-64 gap-0 p-0"} align="start">
        {picker.content}
      </PopoverContent>
    )
  } else if (tokens) {
    const close = () => {
      picked.current = true
      clearTyping()
      setListOpen(false)
    }
    const replacement = chip?.token?.deprecated
    const replacedBy = replacement === undefined ? undefined : tokens.list.find((each) => each.name === replacement)
    const onAllow = own?.onAllow
    const onCreate = own?.onCreate
    popup = (
      <PopoverContent
        className="w-60 gap-0 p-1"
        align="start"
        finalFocus={() => {
          if (!picked.current) return true
          picked.current = false
          return input.current
        }}
      >
        <TokenMenu
          label={label}
          tokens={tokens.list}
          current={tokens.current}
          none={tokens.none}
          own={own?.text}
          holdsOwn={chip === undefined && shown !== undefined && shown !== ""}
          nearest={own?.nearest}
          same={own?.same}
          replaced={chip && replacedBy ? { name: chip.name, by: replacedBy } : undefined}
          namespace={own?.namespace ?? chip?.namespace}
          tokensOnly={own?.tokensOnly}
          allowed={own?.allowed}
          onAllow={
            onAllow &&
            ((reason) => {
              onAllow(reason)
              close()
            })
          }
          onCreate={
            onCreate &&
            ((name) => {
              onCreate(name)
              close()
            })
          }
          onPick={(name) => {
            tokens.onPick(name)
            close()
          }}
        />
      </PopoverContent>
    )
  }

  return (
    <>
      <div className={`flex min-w-0 items-center gap-1 ${search ? "relative" : ""} ${rowClassName}`}>
        {popup ? (
          <Popover open={open} onOpenChange={setOpen}>
            {box}
            {popup}
          </Popover>
        ) : (
          box
        )}
        {trailing}
        {showList && (
          <SearchList
            id={searchId}
            label={search.label}
            options={found}
            highlight={lit}
            empty={nothingFound}
            className="absolute top-full right-0 left-0 z-30 mt-1"
            onHighlight={highlightAt}
            onPick={(index) => take(found[index]!.value)}
          />
        )}
      </div>
      {!line && message && <MessageLine message={message} />}
      {!line && !message && narrow && typed.focused && comesTo && (
        <p className="col-span-full mt-1 text-[11px] leading-snug text-muted-foreground">{comesTo}</p>
      )}
    </>
  )
}

/** The step Up and Down take in a percentage: 1, 10 with Shift, a quarter with Alt. */
const percentStep = ({ shift, alt }: ScrubKeys) => {
  if (shift) return 10
  return alt ? 0.25 : 1
}

/**
 * A percentage, as opacity, a color's alpha, scale and a gradient stop's position take one: typed with the app's
 * maths (`50`, `50%`, `+10`, `*0.5`), stepped by 1 with Up and Down (10 with Shift), scrubbed by its inner label, and
 * held to its range with a note when what's typed is past either end. Text it can't read is refused, never stored as
 * a number it isn't.
 */
export function PercentField({
  label,
  value,
  placeholder = "100",
  unsetIs,
  min = 0,
  max = 100,
  places = 2,
  inner,
  narrow,
  mixed,
  disabled,
  hint,
  rowClassName,
  keywords,
  tokens,
  status,
  own,
  onChange
}: {
  label: string
  value: number | undefined
  /** What unset shows, faintly. */
  placeholder?: string
  /** What unset counts as for maths and steps: the placeholder's number unless said. */
  unsetIs?: number
  min?: number
  max?: number
  /** Decimals kept: 0 for a color's alpha, as `bg-primary/50` takes whole percentages. */
  places?: number
  inner?: ReactNode
  narrow?: boolean
  mixed?: boolean
  disabled?: boolean
  hint?: { label?: string; detail?: string }
  rowClassName?: string
  /** Words it also reads as percentages, as a position's X reads `left` as 0 and `right` as 100. */
  keywords?: Readonly<Record<string, number>>
  /**
   * The opacity tokens it offers, as Opacity and a color's alpha do: the one it holds (`current`) is its chip, typing a
   * token's name (`muted`, `opacity-muted`) picks it, and Up and Down step through them in order.
   */
  tokens?: { list: readonly OpacityToken[]; current?: string; onPick: (name: string | undefined) => void }
  /** Slot 5's marks. */
  status?: StatusMarks
  /** A value of its own, which its token list offers the nearest token and Create token for. */
  own?: OwnValue
  onChange: (value: number | undefined) => void
}) {
  const held = tokens?.current === undefined ? undefined : tokens.list.find((token) => token.name === tokens.current)
  const from = value ?? held?.percent ?? unsetIs ?? (Number(placeholder) || 0)
  const settle = (number: number) => clamp(Number(formatNumber(number, places)), min, max)
  const words = Object.keys(keywords ?? {})
  let takes =
    words.length > 0
      ? `${label} takes a percentage, or ${words.slice(0, -1).join(", ")} or ${words.at(-1)}`
      : `${label} takes a percentage, such as 50`
  if (tokens) takes = `${takes}, or an opacity token`
  // A token steps to the next in the list's order, Shift to the first or last, as every token does.
  const stepToken = (up: boolean, { shift }: ScrubKeys) => {
    if (!tokens || !held) return false
    const last = tokens.list.length - 1
    let next = clamp(tokens.list.indexOf(held) + (up ? 1 : -1), 0, last)
    if (shift) next = up ? last : 0
    tokens.onPick(tokens.list[next]!.name)
    return true
  }
  return (
    <ValueField
      label={label}
      inner={inner}
      scrub={
        inner === undefined
          ? undefined
          : { from: () => from, apply: (next) => onChange(settle(next)), by: { step: 1, shiftStep: 10, min, max } }
      }
      shown={value === undefined ? undefined : formatNumber(value, places)}
      placeholder={placeholder}
      mixed={mixed}
      chip={
        tokens?.current === undefined
          ? undefined
          : {
              name: tokens.current,
              token: held,
              onRemove: () => tokens.onPick(undefined),
              onDetach: held ? () => onChange(held.percent) : undefined,
              onReplace: (replacement) => tokens.onPick(replacement)
            }
      }
      unit="%"
      comesTo={held?.detail}
      status={status}
      own={own}
      tokens={tokens && { list: tokens.list, current: tokens.current, onPick: tokens.onPick }}
      narrow={narrow}
      hint={hint}
      disabled={disabled}
      rowClassName={rowClassName}
      read={(text): Reading<number | undefined | { token: string }> => {
        const trimmed = text.trim().toLowerCase()
        const token = tokens?.list.find((each) => each.name === trimmed || `opacity-${each.name}` === trimmed)
        if (token) return { value: { token: token.name } }
        const word = keywords?.[trimmed]
        if (word !== undefined) return { value: word }
        const reading = readNumber(text.replace(/%\s*$/, ""), from, label)
        if ("clear" in reading) return { value: undefined }
        if ("reason" in reading) {
          return { reason: reading.reason.startsWith("Can't read") ? takes : reading.reason }
        }
        const kept = Number(formatNumber(reading.value, places))
        if (kept > max)
          return { value: max, message: { tone: "note", text: `${label} goes up to ${max}%, so it's ${max}%.` } }
        if (kept < min)
          return { value: min, message: { tone: "note", text: `${label} goes down to ${min}%, so it's ${min}%.` } }
        return { value: kept }
      }}
      onCommit={(next) => {
        if (typeof next === "object") tokens?.onPick(next.token)
        else onChange(next)
      }}
      onStep={(up, keys) => {
        if (!stepToken(up, keys)) onChange(settle(from + (up ? 1 : -1) * percentStep(keys)))
      }}
    />
  )
}
