import { Popover, PopoverContent, PopoverTrigger } from "@buildkitgg/shadcn-baseui-kit"
import { formatHex, formatOklch, parseColor, sameColorDistance } from "@parity-app/tokens"
import { ChevronDown, Unlink } from "lucide-react"
import {
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type Ref,
  useCallback,
  useEffect,
  useRef,
  useState
} from "react"
import { Hint } from "../../chrome/Hint.tsx"
import { PanelSection } from "../../chrome/PanelSection.tsx"
import { swatch } from "../../chrome/token-previews.tsx"
import { ColorEditor, nearestColorToken, shortForm } from "./color-picker.tsx"
import { clamp, formatNumber, isPlainColor, mixColor, stepSpacing } from "./css-values.ts"
import {
  type Message,
  MessageLine,
  notAToken,
  type Reading,
  readNumber,
  scrub,
  type ScrubBy,
  type ScrubKeys,
  TokenMenu,
  useTyped
} from "./field-parts.tsx"
import type { ColorToken, FieldToken } from "./tokens.ts"
import { readLength } from "./typing.ts"

/*
 * Simpler fields, the spike that answers "this feels so busy" (PAR-186), with what the judges found built in: the same
 * values, typing and tokens as the field core in field-parts.tsx, drawn the way Figma, Penpot and Plasmic draw theirs.
 *
 * - Its name sits above it in words, and dragging the name changes the value. Fields that share a name (sides,
 *   corners) carry a letter, an arrow or a corner inside, which names its part in a hint and drags too.
 * - The box is filled, with no border, and pixels aren't shown; other units are.
 * - A value of its own has no mark. Its token list offers the nearest token first, then Create token, and in a project
 *   set to Tokens only, Allow here.
 * - A token is a pill with its name, and what it comes to is in the pill's hint, as Figma's variables show. Backspace on
 *   the pill detaches it, keeping the value; typing on it replaces it.
 * - Hovering changes nothing but the outline. The one button a field has (Tokens, or Detach on a token) sits over the
 *   end of the box, in room the box always keeps, and fades in, so nothing moves.
 * - Only real problems show: a token the project no longer has (a red pill), one it has replaced (an amber pill), and,
 *   in a project set to Tokens only, a value of its own, outlined, with the nearest token under it.
 */

/** What a simpler field holds: a token by name, or a number of its own, a percentage where it says so, or nothing. */
export type Holds = { token: string } | { value: number; percent?: boolean; allow?: string } | undefined

/** A token a number field offers: a `FieldToken` with what it comes to in the field's unit. */
export type NumberToken = FieldToken & { px: number }

/** What a number field's typing comes to: its own value, or CSS's shorthand for every part of its group. */
type Entry = { one: Holds } | { all: Holds[] }

/** A token's name without the namespace the field implies: `xl` for `radius-xl` in Radius. */
const short = (name: string, namespace = "") =>
  namespace !== "" && name.startsWith(namespace) ? name.slice(namespace.length) : name

/** The latest of a value that's new every render, for an answer that runs later than the render that made it. */
function useLatest<T>(value: T) {
  const latest = useRef(value)
  useEffect(() => {
    latest.current = value
  })
  return latest
}

/** The name above a field: dragging it changes the value, as Plasmic's labels and Figma's icons do. */
function Caption({ text, onScrub }: { text: string; onScrub?: (event: PointerEvent<Element>) => void }) {
  return (
    <span
      onPointerDown={onScrub}
      className={`truncate text-[11px] text-muted-foreground select-none ${onScrub ? "cursor-ew-resize touch-none" : ""}`}
    >
      {text}
    </span>
  )
}

/** The row a field's name sits in, the toggle's height whether it has one or not, so fields side by side line up. */
const captionRow = "flex h-5 min-w-0 items-center justify-between gap-1 whitespace-nowrap"

/**
 * The filled box every simpler field draws, with room kept at its end for the one button, so hovering moves nothing.
 * Hovering outlines it faintly, focus outlines it in the ring's color, and an error in red, which hovering leaves.
 */
const box = (error: boolean, extra = "") =>
  `group/simple relative flex h-7 min-w-0 items-center gap-1.5 rounded-md bg-muted pr-7 text-xs ring-inset dark:bg-input/40 ${error ? "ring-1 ring-destructive" : "hover:not-focus-within:ring-1 hover:not-focus-within:ring-border focus-within:ring-1 focus-within:ring-ring"} ${extra}`

/** The one button over the end of a field, faded in while the field's hovered or focused, or its list is open. */
const endButton =
  "absolute top-1/2 right-1 grid size-5 -translate-y-1/2 place-items-center rounded text-muted-foreground opacity-0 outline-none group-focus-within/simple:opacity-100 group-hover/simple:opacity-100 hover:bg-background/70 hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring data-popup-open:opacity-100"

/** A key that types a character, which typing on a token's pill starts with. */
const typesCharacter = (event: KeyboardEvent) =>
  event.key.length === 1 && event.key !== " " && !event.ctrlKey && !event.metaKey && !event.altKey

/** The line a group's fields say things on, under all of them. */
export interface GroupLine {
  message: Message | undefined
  onMessage: (message: Message | undefined) => void
  /**
   * What a part says while its value stands, as Tokens only refusing it does, by the part's name: the line shows it
   * whenever nothing typed is being said.
   */
  onStanding: (part: string, message: Message | undefined) => void
}

export interface SimpleNumberProps {
  /** The field's name: shown above it unless `caption` is false, and its accessible name. */
  label: string
  /** Shows the name above the field; a field in a group whose name is above the group has none of its own. */
  caption?: boolean
  /** A letter, an arrow or a corner inside the field, where a group's fields need telling apart; it drags too. */
  glyph?: ReactNode
  /** What the glyph's hint calls the part: Top, Vertical, Top left. */
  glyphHint?: string
  holds: Holds
  mixed?: boolean
  /** The unit after the number, where it isn't pixels: `%`, `°`, `ms`. */
  unit?: string
  /** What unset shows, faintly: `0`, `100`, Auto. */
  unset?: string
  /** What unset comes to, which Up, Down and dragging start from: 100 for Opacity. */
  unsetValue?: number
  /** A length, read in pixels or rem (`16`, `1rem`); otherwise a number in `unit`. */
  length?: boolean
  /** A length that takes a percentage too, as padding does: `10%` stays a percentage. */
  percent?: boolean
  /** The lowest and highest it takes; what's typed past them comes back to them, and says so. */
  min?: number
  max?: number
  /** Up and Down: a whole spacing step (4px), as spacing moves, or one. */
  stepBy?: "spacing" | "one"
  tokens: readonly NumberToken[]
  /** What the tokens' names start with, which the pill leaves off: `radius-`. */
  namespace?: string
  /** The list's first row, which unsets the field (None, Auto); without it, the list is tokens only. */
  none?: string
  /** A project set to Tokens only: a value of its own is refused, with the nearest token under the field. */
  tokensOnly?: boolean
  scrubBy: ScrubBy
  /**
   * One of a group's parts, whose edits reach the opposite part with Alt and every part with Alt+Shift, as Figma's do:
   * `onChange` gets the keys, Shift with Alt isn't ten steps, and Alt+Down steps rather than opening the list.
   */
  spreads?: boolean
  onChange: (holds: Holds, keys?: ScrubKeys) => void
  /** CSS's shorthand typed into a group's part (`8 16`): every part, in CSS's order. Without it, a space is refused. */
  onShorthand?: (parts: Holds[]) => void
  /** Makes a token of the value of its own, by the name given: the list's Create token. */
  onCreate?: (name: string, value: number) => void
  /** The line under the group the field is in, which says what it says. */
  line?: GroupLine
  /** Words at the end of the name's row, as Each corner opens a radius's corners. */
  captionAction?: ReactNode
}

/**
 * A number field, simpler: its name above, the value, the unit where it isn't px, and nothing else at rest. A token is
 * a named pill: clicking it opens the list, Backspace on it detaches it, and Detach takes the Tokens button's place.
 * Typing a number, maths (`+2`, `*2`) or a token's name sets it; Up and Down step it, through the scale on a token;
 * Alt+Down opens the list.
 */
export function SimpleNumber({
  label,
  caption = true,
  glyph,
  glyphHint,
  holds,
  mixed = false,
  unit,
  unset = "0",
  unsetValue = 0,
  length = false,
  percent = false,
  min,
  max,
  stepBy = "one",
  tokens,
  namespace = "",
  none,
  tokensOnly = false,
  scrubBy,
  spreads = false,
  onChange,
  onShorthand,
  onCreate,
  line,
  captionAction
}: SimpleNumberProps) {
  const [open, setOpen] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  // Set when a pick closes the list, so the focus goes to the value's text rather than a pill that may have gone.
  const picked = useRef(false)
  const change = useLatest(onChange)
  const tokenName = holds !== undefined && "token" in holds ? holds.token : undefined
  const token = tokenName === undefined ? undefined : tokens.find((each) => each.name === tokenName)
  const replacement =
    token?.deprecated === undefined ? undefined : tokens.find((each) => each.name === token.deprecated)
  const own = holds !== undefined && "value" in holds ? holds : undefined
  const current = own?.value ?? token?.px
  // The scale Up, Down and dragging move a token through: the project's tokens, smallest first, without the replaced.
  const scale = tokens.filter((each) => each.deprecated === undefined).toSorted((a, b) => a.px - b.px)
  const nearestTo = (value: number) =>
    scale.reduce<NumberToken | undefined>(
      (best, each) => (best === undefined || Math.abs(each.px - value) < Math.abs(best.px - value) ? each : best),
      undefined
    )
  const indexNear = (name: string | undefined, value: number) => {
    const at = scale.findIndex((each) => each.name === name)
    if (at !== -1) return at
    const near = nearestTo(value)
    return near ? scale.indexOf(near) : 0
  }
  const nearest = own === undefined || own.percent ? undefined : nearestTo(own.value)
  const refused =
    tokensOnly && own !== undefined && own.allow === undefined && nearest !== undefined && nearest.px !== own.value
  const said = (value: number, isPercent = false) => `${formatNumber(value)}${isPercent ? "%" : (unit ?? "px")}`

  let takes = `${label} takes a number, such as 4, or a token`
  if (unit === "%") takes = `${label} takes a percentage, such as 50%, or a token`
  if (length) takes = `${label} takes a length, such as 8 or 0.5rem${percent ? ", or a percentage" : ""}, or a token`

  /** One value typed: a token's name, with or without its namespace, or a number, held to the field's range. */
  const readOne = (text: string): Reading<Holds> => {
    const trimmed = text.trim()
    if (trimmed === "") return { value: undefined }
    const named = tokens.find((each) => each.name === trimmed || short(each.name, namespace) === trimmed)
    if (named) return { value: { token: named.name } }
    let number: number
    let isPercent = false
    if (length) {
      const reading = readLength(trimmed, { label, current: own?.percent ? undefined : current, takesPercent: percent })
      if ("clear" in reading) return { value: undefined }
      if ("reason" in reading) return { reason: reading.reason.startsWith("Can't read") ? takes : reading.reason }
      if ("percent" in reading) {
        number = reading.percent
        isPercent = true
      } else number = reading.px
    } else {
      const bare = unit !== undefined && trimmed.endsWith(unit) ? trimmed.slice(0, -unit.length) : trimmed
      const reading = readNumber(bare, current ?? unsetValue, label)
      if ("clear" in reading) return { value: undefined }
      if ("reason" in reading) return { reason: reading.reason.startsWith("Can't read") ? takes : reading.reason }
      number = reading.value
    }
    let message: Message | undefined
    const low = min ?? -Infinity
    const high = isPercent ? Infinity : (max ?? Infinity)
    if (number < low) {
      message = {
        tone: "note",
        text:
          low === 0
            ? `${label} can't be negative, so it's ${said(0, isPercent)}.`
            : `${label} goes down to ${said(low, isPercent)}, so it's ${said(low, isPercent)}.`
      }
      number = low
    } else if (number > high) {
      message = { tone: "note", text: `${label} goes up to ${said(high)}, so it's ${said(high)}.` }
      number = high
    }
    if (tokensOnly && !isPercent) {
      // Nothing is what None is, where the field can be unset.
      if (number === 0 && none !== undefined) return { value: undefined }
      const near = nearestTo(number)
      if (near && near.px !== number) return notAToken(near, () => onChange({ token: near.name }))
      if (near) return { value: { token: near.name } }
    }
    const value: Holds = isPercent ? { value: number, percent: true } : { value: number }
    return message ? { value, message } : { value }
  }

  /** What's typed: one value, or, in a group's part, CSS's shorthand of two to four, which sets every part. */
  const read = (text: string): Reading<Entry> => {
    const one = readOne(text)
    if ("value" in one)
      return one.message ? { value: { one: one.value }, message: one.message } : { value: { one: one.value } }
    const parts = text.trim().split(/\s+/)
    if (onShorthand === undefined || parts.length < 2) return one
    if (parts.length > 4) return { reason: `${label} takes one to four values, as CSS's shorthand does` }
    const all: Holds[] = []
    for (const part of parts) {
      const reading = readOne(part)
      if (!("value" in reading)) return { reason: `Can't read ${part}. ${reading.reason}` }
      all.push(reading.value)
    }
    const [a, b = a, c = a, d = b] = all
    return { value: { all: [a, b, c, d] } }
  }

  // What the field shows faintly with nothing in it.
  const atRest = mixed ? "Mixed" : unset
  const typed = useTyped<Entry>({
    label,
    shown: own === undefined ? "" : formatNumber(own.value),
    backTo: tokenName ?? (own === undefined ? atRest : said(own.value, own.percent)),
    read,
    onCommit: (entry) => ("all" in entry ? onShorthand?.(entry.all) : onChange(entry.one)),
    line
  })
  const typing = typed.typed !== undefined
  const showPill = tokenName !== undefined && !typing
  const placeholder = showPill ? "" : atRest

  const step = (up: boolean, keys: ScrubKeys) => {
    typed.setTyped(undefined)
    typed.setMessage(undefined)
    const big = keys.shift && !(spreads && keys.alt)
    if ((token !== undefined || tokensOnly) && scale.length > 0) {
      const last = scale.length - 1
      const from = current ?? unsetValue
      let next: number
      if (token) next = clamp(indexNear(token.name, token.px) + (up ? 1 : -1), 0, last)
      else {
        next = up ? scale.findIndex((each) => each.px > from) : scale.findLastIndex((each) => each.px < from)
        if (next === -1) next = up ? last : 0
      }
      if (big) next = up ? last : 0
      onChange({ token: scale[next]!.name }, keys)
      return
    }
    // A missing token has no value to step from.
    if (tokenName !== undefined) return
    const from = current ?? unsetValue
    const by = (up ? 1 : -1) * (big ? 10 : 1)
    const moved = stepBy === "spacing" && !own?.percent ? stepSpacing(from, by) : from + by
    const next = clamp(moved, min ?? -Infinity, own?.percent ? Infinity : (max ?? Infinity))
    onChange(own?.percent ? { value: next, percent: true } : { value: next }, keys)
  }

  const onScrub = (event: PointerEvent<Element>) => {
    typed.setTyped(undefined)
    typed.setMessage(undefined)
    if ((token !== undefined || tokensOnly) && scale.length > 0) {
      // A token drags through the scale, a token every 8 pixels, rather than turning into a number.
      const start = indexNear(token?.name, current ?? unsetValue)
      scrub(
        () => start,
        (at, keys) => onChange({ token: scale[Math.round(at)]!.name }, keys),
        { move: (from, dx) => from + dx / 8, min: 0, max: scale.length - 1 }
      )(event)
      return
    }
    const isPercent = own?.percent === true
    scrub(
      () => current ?? unsetValue,
      (value, keys) => onChange(isPercent ? { value, percent: true } : { value }, keys),
      {
        ...scrubBy,
        min: min ?? scrubBy.min ?? -Infinity,
        max: isPercent ? Infinity : (max ?? scrubBy.max ?? Infinity)
      }
    )(event)
  }

  const detach = () => {
    onChange(token ? { value: token.px } : undefined)
    // The pill and Detach go, so the value's text takes the focus.
    input.current?.focus()
  }

  const keys = (event: KeyboardEvent) => ({ shift: event.shiftKey, alt: event.altKey })
  const onPillKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault()
      detach()
      return
    }
    if (event.key === "ArrowDown" && event.altKey && !spreads) {
      event.preventDefault()
      setOpen(true)
      return
    }
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault()
      step(event.key === "ArrowUp", keys(event))
      return
    }
    // Typing on the pill replaces the token, as typing over a selection does.
    if (typesCharacter(event)) {
      event.preventDefault()
      input.current?.focus()
      typed.setTyped(event.key)
    }
  }

  // Tokens only says why a value of its own is refused under the field, or under its group.
  let standing: Message | undefined
  if (refused && nearest && !typing) {
    const answer = notAToken(nearest, () => change.current({ token: nearest.name }))
    standing = { tone: "error", text: answer.reason, action: answer.action }
  }
  const standingFor = standing ? nearest?.name : undefined
  const onStanding = line?.onStanding
  useEffect(() => {
    onStanding?.(label, standing)
    return () => onStanding?.(label, undefined)
    // Only when what it says changes: the message is a new object every render.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [standingFor, label, onStanding])

  let pillTone = "bg-foreground/10 hover:bg-foreground/15"
  let pillHint = { label: tokenName, detail: token?.detail }
  let pillName = `${label}: ${tokenName}`
  if (!token) {
    pillTone = "bg-destructive/15 text-destructive hover:bg-destructive/25"
    pillHint = { label: `${tokenName} is missing`, detail: "The project no longer has it. Pick another, or detach." }
    pillName += ", missing"
  } else if (replacement) {
    pillTone = "bg-amber-500/15 text-amber-700 hover:bg-amber-500/25 dark:text-amber-300"
    pillHint = { label: `${token.name} is replaced by ${replacement.name}`, detail: token.detail }
    pillName += `, replaced by ${replacement.name}`
  }
  const shownUnit = own?.percent ? "%" : unit

  const field = (
    <div className={box(refused || typed.error, glyph === undefined ? "pl-2" : "pl-1.5")}>
      {glyph !== undefined && (
        <Hint label={glyphHint ?? label} detail="Drag to change">
          <span
            aria-hidden
            onPointerDown={onScrub}
            className="flex size-4 shrink-0 cursor-ew-resize touch-none items-center justify-center text-muted-foreground select-none"
          >
            {glyph}
          </span>
        </Hint>
      )}
      {showPill && (
        <Hint label={pillHint.label} detail={pillHint.detail} hidden={open} wait>
          <PopoverTrigger
            aria-label={pillName}
            onKeyDown={onPillKey}
            className={`inline-flex h-5 max-w-full min-w-0 shrink items-center rounded px-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring ${glyph === undefined ? "-ml-1" : ""} ${pillTone}`}
          >
            <span className="truncate">{short(tokenName, namespace)}</span>
          </PopoverTrigger>
        </Hint>
      )}
      <input
        ref={input}
        aria-label={label}
        aria-invalid={typed.error || refused || undefined}
        inputMode="decimal"
        spellCheck={false}
        placeholder={placeholder}
        value={typed.typed ?? (showPill ? "" : (typed.input.value as string))}
        onChange={typed.input.onChange}
        onFocus={(event) => {
          typed.input.onFocus()
          event.currentTarget.select()
        }}
        onBlur={typed.input.onBlur}
        onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
          if (event.key === "ArrowDown" && event.altKey && !spreads) {
            event.preventDefault()
            setOpen(true)
            return
          }
          if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            event.preventDefault()
            step(event.key === "ArrowUp", keys(event))
            return
          }
          if (showPill && event.currentTarget.value === "" && event.key === "Backspace") {
            event.preventDefault()
            detach()
            return
          }
          typed.input.onKeyDown(event)
        }}
        className={`h-full min-w-0 bg-transparent tabular-nums outline-none placeholder:text-muted-foreground ${showPill ? "w-0 flex-1" : "[field-sizing:content] min-w-[1ch]"} ${refused && !typing ? "text-destructive" : ""}`}
      />
      {!showPill && shownUnit && (own !== undefined || !mixed) && (
        <span className="-ml-1.5 shrink-0 text-muted-foreground select-none">{shownUnit}</span>
      )}
      {/* The rest of the box focuses the input, as clicking anywhere in a text field does. */}
      {!showPill && (
        <span
          aria-hidden
          className="h-full flex-1 cursor-text"
          onMouseDown={(event) => {
            event.preventDefault()
            input.current?.focus()
          }}
        />
      )}
      {tokenName === undefined ? (
        <Hint label="Tokens" detail={spreads ? undefined : "Alt+Down"}>
          <PopoverTrigger aria-label={`${label} tokens`} className={endButton}>
            <ChevronDown className="size-3.5" />
          </PopoverTrigger>
        </Hint>
      ) : (
        <Hint label="Detach" detail={token ? `Keeps ${said(token.px)}, not the token` : "Clears the missing token"}>
          <button type="button" aria-label={`Detach ${label} from ${tokenName}`} className={endButton} onClick={detach}>
            <Unlink className="size-3.5" />
          </button>
        </Hint>
      )}
    </div>
  )

  const close = () => {
    picked.current = true
    typed.setTyped(undefined)
    setOpen(false)
  }

  return (
    <div className="flex min-w-0 flex-col gap-1">
      {caption && (
        <div className={captionRow}>
          <Caption text={label} onScrub={onScrub} />
          {captionAction}
        </div>
      )}
      <Popover open={open} onOpenChange={setOpen}>
        {field}
        <PopoverContent
          className="w-60 gap-0 p-1"
          align={showPill ? "start" : "end"}
          finalFocus={() => {
            if (!picked.current) return true
            picked.current = false
            return input.current
          }}
        >
          <TokenMenu
            label={label}
            tokens={tokens}
            current={tokenName}
            none={none}
            own={own === undefined ? undefined : said(own.value, own.percent)}
            nearest={nearest}
            same={nearest !== undefined && nearest.px === own?.value}
            order={(a, b) => a.px - b.px}
            replaced={token && replacement ? { name: token.name, by: replacement } : undefined}
            namespace={namespace}
            tokensOnly={tokensOnly}
            allowed={own?.allow}
            onAllow={(reason) => {
              if (own === undefined) return
              onChange(reason === undefined ? { value: own.value } : { value: own.value, allow: reason })
              close()
            }}
            onCreate={
              onCreate && own !== undefined && !own.percent
                ? (name) => {
                    onCreate(name, own.value)
                    close()
                  }
                : undefined
            }
            onPick={(name) => {
              onChange(name === undefined ? undefined : { token: name })
              close()
            }}
          />
        </PopoverContent>
      </Popover>
      {line === undefined && <MessageLine message={typed.message ?? standing} />}
    </div>
  )
}

/** A corner drawn as a field's glyph: the arc at that corner, from the top left, clockwise. */
export function CornerGlyph({ corner = 0 }: { corner?: 0 | 1 | 2 | 3 }) {
  return (
    <svg aria-hidden viewBox="0 0 12 12" className="size-3" style={{ transform: `rotate(${corner * 90}deg)` }}>
      <path d="M1.5 11 V6 A4.5 4.5 0 0 1 6 1.5 H11" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  )
}

/** The pair of sides a field sets, drawn as a double arrow: up and down, or left and right. */
export function PairGlyph({ across = false }: { across?: boolean }) {
  return (
    <svg aria-hidden viewBox="0 0 12 12" className="size-3" style={across ? { transform: "rotate(90deg)" } : undefined}>
      <path
        d="M6 1.5 V10.5 M3.5 4 L6 1.5 L8.5 4 M3.5 8 L6 10.5 L8.5 8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** One side's letter as a field's glyph: T, R, B or L. */
export function SideGlyph({ letter }: { letter: string }) {
  return <span className="text-[11px] leading-none font-medium">{letter}</span>
}

/**
 * What a group's parts are, which its toggle draws: a rounded square's four corners, or its four sides, each drawn
 * apart from the rest.
 */
export type Parts = "corners" | "sides"

const partsIcons: Record<Parts, string> = {
  corners:
    "M1.5 4.5 V3.5 A2 2 0 0 1 3.5 1.5 H4.5 M7.5 1.5 H8.5 A2 2 0 0 1 10.5 3.5 V4.5 M10.5 7.5 V8.5 A2 2 0 0 1 8.5 10.5 H7.5 M4.5 10.5 H3.5 A2 2 0 0 1 1.5 8.5 V7.5",
  sides: "M3.5 1.5 H8.5 M10.5 3.5 V8.5 M3.5 10.5 H8.5 M1.5 3.5 V8.5"
}

/**
 * The toggle at the end of a group's name row that opens every part, as Figma's and Penpot's do: an icon drawn as the
 * fields' own glyphs are, named in its hint (Each corner, Each side), and filled while every part is open. It's a
 * toggle, so its name stays the same and it says whether it's pressed.
 */
export function EachToggle({
  label,
  parts,
  pressed,
  onClick,
  ref
}: {
  /** Its name, in its hint and for screen readers: Each corner, Each side. */
  label: string
  parts: Parts
  pressed: boolean
  onClick: () => void
  ref?: Ref<HTMLButtonElement>
}) {
  return (
    <Hint label={label}>
      <button
        ref={ref}
        type="button"
        aria-label={label}
        aria-pressed={pressed}
        onClick={onClick}
        className="grid size-5 shrink-0 place-items-center rounded text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring aria-pressed:bg-muted aria-pressed:text-foreground dark:hover:bg-input/40 dark:aria-pressed:bg-input/60"
      >
        <svg aria-hidden viewBox="0 0 12 12" className="size-3">
          <path d={partsIcons[parts]} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </button>
    </Hint>
  )
}

/**
 * A group of fields under one name, as Padding's sides and Radius's corners are: the name, with the toggle that opens
 * every part on the right, then the fields, with what any of them says under all.
 */
export function SimpleGroup({
  label,
  each,
  parts,
  expanded,
  onExpand,
  toggleRef,
  children
}: {
  label: string
  /** The toggle's name: Each side, Each corner. */
  each: string
  parts: Parts
  expanded: boolean
  onExpand: (expanded: boolean) => void
  /** The toggle, for a field that swaps a group in and out to keep the focus on it. */
  toggleRef?: Ref<HTMLButtonElement>
  children: (line: GroupLine) => ReactNode
}) {
  const [message, setMessage] = useState<Message>()
  const [standing, setStanding] = useState<Record<string, Message | undefined>>({})
  const onStanding = useCallback(
    (part: string, said: Message | undefined) =>
      setStanding((current) => (current[part] === said ? current : { ...current, [part]: said })),
    []
  )
  const shown = message ?? Object.values(standing).find((said) => said !== undefined)
  return (
    <div className="col-span-2 flex min-w-0 flex-col gap-1">
      <div className={captionRow}>
        <Caption text={label} />
        <EachToggle ref={toggleRef} label={each} parts={parts} pressed={expanded} onClick={() => onExpand(!expanded)} />
      </div>
      <div className="grid grid-cols-2 gap-x-2 gap-y-1.5">
        {children({ message, onMessage: setMessage, onStanding })}
      </div>
      <MessageLine message={shown} />
    </div>
  )
}

/** A section of simpler fields: the panel's section, then two fields to a row, as Figma's with property labels on. */
export function SimpleSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <PanelSection title={title}>
      <div className="grid grid-cols-2 gap-x-2 gap-y-2.5 px-1">{children}</div>
    </PanelSection>
  )
}

/** A color typed or picked, with its alpha from 0 to 100, unset for opaque. */
interface Paint {
  value: string | undefined
  alpha: number | undefined
}

/** Two layers' colors at once, split diagonally, as Figma draws Mixed. */
const mixedSwatch = { background: "linear-gradient(135deg, #2563eb 50%, #f54900 50%)" }

/**
 * A color field, simpler: the swatch, the hex or the token's name, and the alpha after a hairline, as Figma's fill row.
 * The swatch of a color of its own opens the picker. A token shows by name beside its swatch, with no pill, since the
 * swatch already says it's a color; clicking it opens the tokens, Backspace on it detaches it, keeping its color, and
 * typing on it replaces it. The end button opens the tokens, or detaches one.
 */
export function SimpleColor({
  label,
  caption = true,
  value,
  alpha,
  mixed = false,
  tokensOnly = false,
  allowed,
  onAllow,
  tokens,
  onCreate,
  onChange
}: {
  label: string
  caption?: boolean
  /** A token's name, or a color of its own: `#2563eb`, `oklch(…)`. */
  value: string | undefined
  alpha: number | undefined
  /** The selected layers have different colors here. */
  mixed?: boolean
  /** A project set to Tokens only: a color of its own is refused, with the nearest token under the field. */
  tokensOnly?: boolean
  /** Why this color of its own is allowed here, in a project set to Tokens only. */
  allowed?: string
  onAllow?: (reason: string | undefined) => void
  tokens: readonly ColorToken[]
  /** Makes a token of the color of its own, by the name given, from its hex: the list's Create token. */
  onCreate?: (name: string, hex: string) => void
  onChange: (value: string | undefined, alpha: number | undefined) => void
}) {
  const [listOpen, setListOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  // What the color and its alpha say, on one line under the row.
  const [message, setMessage] = useState<Message>()
  const line = { message, onMessage: setMessage }
  const input = useRef<HTMLInputElement>(null)
  const picked = useRef(false)
  const change = useLatest(onChange)
  const plain = value !== undefined && isPlainColor(value)
  const token = plain || value === undefined ? undefined : tokens.find((each) => each.name === value)
  const missing = value !== undefined && !plain && token === undefined
  const named = token !== undefined || missing
  const replacement =
    token?.deprecated === undefined ? undefined : tokens.find((each) => each.name === token.deprecated)
  const color = plain ? value : token?.hex
  const near = plain ? nearestColorToken(value, tokens) : undefined
  const refused = tokensOnly && plain && allowed === undefined && near !== undefined
  const ownText = plain ? `${value.startsWith("#") ? "#" : ""}${shortForm(value)}` : undefined
  // What the field shows faintly with nothing in it.
  const atRest = mixed ? "Mixed" : "None"

  const typedColor = useTyped<Paint>({
    label,
    shown: plain ? shortForm(value) : "",
    backTo: value === undefined ? atRest : (ownText ?? value),
    read: (text) => {
      const trimmed = text.trim()
      if (trimmed === "") return { value: { value: undefined, alpha: undefined } }
      const byName = tokens.find((each) => each.name === trimmed.toLowerCase())
      if (byName) return { value: { value: byName.name, alpha } }
      const candidate = /^#?[\da-f]{3,8}$/i.test(trimmed) ? `#${trimmed.replace(/^#/, "")}` : trimmed
      const parsed = CSS.supports("color", candidate) ? parseColor(candidate) : undefined
      if (!parsed) return { reason: `${label} takes a color, such as 2563EB, or a color token's name` }
      const nearest = nearestColorToken(candidate, tokens)
      if (tokensOnly && nearest) return notAToken(nearest.token, () => onChange(nearest.token.name, alpha))
      const opaque = { ...parsed, a: 1 }
      return {
        value: {
          value: candidate.toLowerCase().startsWith("oklch") ? formatOklch(opaque) : formatHex(opaque),
          alpha: parsed.a < 1 ? Math.round(parsed.a * 100) : alpha
        }
      }
    },
    onCommit: (next) => onChange(next.value, next.value === undefined ? undefined : next.alpha),
    line
  })

  const setAlpha = (next: number) => onChange(value, next >= 100 ? undefined : Math.max(0, next))
  const typedAlpha = useTyped<number | undefined>({
    label: `${label} opacity`,
    shown: formatNumber(alpha ?? 100),
    read: (text) => {
      const trimmed = text.trim()
      const reading = readNumber(
        trimmed.endsWith("%") ? trimmed.slice(0, -1) : trimmed,
        alpha ?? 100,
        `${label} opacity`
      )
      if ("clear" in reading) return { value: undefined }
      if ("reason" in reading) {
        return {
          reason: reading.reason.startsWith("Can't read")
            ? `${label} opacity takes a percentage, such as 50%`
            : reading.reason
        }
      }
      if (reading.value > 100) {
        return { value: undefined, message: { tone: "note", text: `${label} opacity goes up to 100%, so it's 100%.` } }
      }
      if (reading.value < 0) {
        return { value: 0, message: { tone: "note", text: `${label} opacity can't be negative, so it's 0%.` } }
      }
      return { value: reading.value >= 100 ? undefined : reading.value }
    },
    onCommit: (next) => onChange(value, next),
    onStep: (up, shift) => setAlpha((alpha ?? 100) + (up ? 1 : -1) * (shift ? 10 : 1)),
    line
  })

  const detach = () => {
    onChange(token?.hex, alpha)
    input.current?.focus()
  }
  const onNameKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault()
      detach()
      return
    }
    if (typesCharacter(event)) {
      event.preventDefault()
      input.current?.focus()
      typedColor.setTyped(event.key)
    }
  }

  let standing: Message | undefined
  if (refused && near && typedColor.typed === undefined) {
    const answer = notAToken(near.token, () => change.current(near.token.name, alpha))
    standing = { tone: "error", text: answer.reason, action: answer.action }
  }

  let chip = <span className="block size-3.5 rounded-[3px] border border-dashed border-muted-foreground/60" />
  if (color) {
    chip = (
      <span
        className="block size-3.5 rounded-[3px] ring-1 ring-black/10 ring-inset dark:ring-white/15"
        style={swatch(mixColor(color, alpha))}
      />
    )
  } else if (missing) chip = <span className="block size-3.5 rounded-[3px] border border-dashed border-destructive" />
  else if (mixed) chip = <span className="block size-3.5 rounded-[3px]" style={mixedSwatch} />

  let nameTone = ""
  let nameHint = { label: value, detail: token ? `#${token.detail}` : undefined }
  let nameLabel = `${label}: ${value}`
  if (missing) {
    nameTone = "text-destructive"
    nameHint = { label: `${value} is missing`, detail: "The project no longer has it. Pick another, or detach." }
    nameLabel += ", missing"
  } else if (token && replacement) {
    nameTone = "text-amber-700 dark:text-amber-300"
    nameHint = { label: `${token.name} is replaced by ${replacement.name}`, detail: `#${token.detail}` }
    nameLabel += `, replaced by ${replacement.name}`
  }
  const typing = typedColor.typed !== undefined
  // A color of its own shows short at rest; focused, OKLCH shows whole, to edit.
  let shownText = typedColor.input.value as string
  if (!typing && typedColor.focused && plain && !value.startsWith("#")) shownText = value

  const close = () => {
    picked.current = true
    typedColor.setTyped(undefined)
    setListOpen(false)
  }

  return (
    <div className="col-span-2 flex min-w-0 flex-col gap-1">
      {caption && (
        <div className={captionRow}>
          <Caption text={label} />
        </div>
      )}
      <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
        <div className={box(refused || typedColor.error || typedAlpha.error, "pl-1.5")}>
          {(!named || typing) && (
            <Hint label="Picker">
              <PopoverTrigger
                aria-label={`${label} color picker`}
                className="grid size-5 shrink-0 place-items-center rounded outline-none hover:bg-background/70 focus-visible:ring-2 focus-visible:ring-ring"
              >
                {chip}
              </PopoverTrigger>
            </Hint>
          )}
          <Popover open={listOpen} onOpenChange={setListOpen}>
            {named && !typing && (
              <Hint label={nameHint.label} detail={nameHint.detail} hidden={listOpen} wait>
                <PopoverTrigger
                  aria-label={nameLabel}
                  onKeyDown={onNameKey}
                  className="flex h-5 min-w-0 shrink items-center gap-1.5 rounded pr-1 pl-0.5 text-left outline-none hover:bg-background/70 focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {chip}
                  <span className={`truncate ${nameTone}`}>{value}</span>
                </PopoverTrigger>
              </Hint>
            )}
            <input
              ref={input}
              aria-label={label}
              aria-invalid={typedColor.error || refused || undefined}
              spellCheck={false}
              placeholder={named && !typing ? "" : atRest}
              value={named && !typing ? "" : shownText}
              onChange={typedColor.input.onChange}
              onFocus={(event) => {
                typedColor.input.onFocus()
                event.currentTarget.select()
              }}
              onBlur={typedColor.input.onBlur}
              onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
                if (event.key === "ArrowDown" && event.altKey) {
                  event.preventDefault()
                  setListOpen(true)
                  return
                }
                if (named && !typing && event.currentTarget.value === "" && event.key === "Backspace") {
                  event.preventDefault()
                  detach()
                  return
                }
                typedColor.input.onKeyDown(event)
              }}
              className={`h-full min-w-0 flex-1 bg-transparent font-mono outline-none placeholder:font-sans placeholder:text-muted-foreground ${refused && !typing ? "text-destructive" : ""}`}
            />
            {value !== undefined && (
              <span className="flex h-full w-14 shrink-0 items-center justify-end border-l-2 border-background dark:border-background/60">
                <input
                  aria-label={`${label} opacity`}
                  inputMode="decimal"
                  spellCheck={false}
                  {...typedAlpha.input}
                  onFocus={(event) => {
                    typedAlpha.input.onFocus()
                    event.currentTarget.select()
                  }}
                  className="h-full w-full min-w-0 bg-transparent text-right tabular-nums outline-none"
                />
                <span className="text-muted-foreground">%</span>
              </span>
            )}
            {named ? (
              <Hint
                label="Detach"
                detail={token ? `Keeps #${token.detail}, not the token` : "Clears the missing token"}
              >
                <button
                  type="button"
                  aria-label={`Detach ${label} from ${value}`}
                  className={endButton}
                  onClick={detach}
                >
                  <Unlink className="size-3.5" />
                </button>
              </Hint>
            ) : (
              <Hint label="Color tokens" detail="Alt+Down">
                <PopoverTrigger aria-label={`${label} tokens`} className={endButton}>
                  <ChevronDown className="size-3.5" />
                </PopoverTrigger>
              </Hint>
            )}
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
                tokens={tokens}
                current={value}
                own={ownText}
                nearest={near?.token}
                same={near !== undefined && near.distance < sameColorDistance}
                replaced={token && replacement ? { name: token.name, by: replacement } : undefined}
                tokensOnly={tokensOnly}
                allowed={allowed}
                onAllow={(reason) => {
                  onAllow?.(reason)
                  close()
                }}
                onCreate={
                  onCreate && plain
                    ? (name) => {
                        onCreate(name, formatHex({ ...parseColor(value)!, a: 1 }))
                        close()
                      }
                    : undefined
                }
                onPick={(name) => {
                  if (name !== undefined) onChange(name, alpha)
                  close()
                }}
              />
            </PopoverContent>
          </Popover>
        </div>
        <PopoverContent className="w-64 gap-0 p-2" align="start">
          <ColorEditor
            value={color ?? "#3b82f6"}
            alpha={alpha}
            onChange={(next, nextAlpha) => onChange(next, nextAlpha)}
          />
        </PopoverContent>
      </Popover>
      <MessageLine message={message ?? standing} />
    </div>
  )
}
