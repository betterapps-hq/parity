import { Popover, PopoverContent, PopoverTrigger } from "@buildkitgg/shadcn-baseui-kit"
import { ChevronDown, Unlink } from "lucide-react"
import { type KeyboardEvent, type PointerEvent, type ReactNode, useRef, useState } from "react"
import { Hint } from "../../chrome/Hint.tsx"
import { PanelSection } from "../../chrome/PanelSection.tsx"
import { formatNumber } from "./css-values.ts"
import {
  type Message,
  MessageLine,
  notAToken,
  type Reading,
  readNumber,
  scrub,
  type ScrubBy,
  TokenList,
  useTyped
} from "./field-parts.tsx"
import type { FieldToken } from "./tokens.ts"

/*
 * A simpler field, for the spike that answers "this feels so busy": the same values, typing and tokens as the field core
 * in field-parts.tsx, drawn the way Figma, Penpot and Plasmic draw theirs.
 *
 * - Its name sits above it in words, and dragging the name changes the value, so there's no icon to learn. A pair of
 *   fields that share a name (sides, corners) shows a letter or a corner inside each instead.
 * - The box is filled, with no border, and the default unit (px) isn't shown.
 * - A value of its own has no mark. A token is a named pill in the value's place.
 * - Hovering changes nothing but the fill. The one button a field has (Tokens, or Detach on a token) sits over the end
 *   of the box, in room the box always keeps, and fades in, so nothing moves.
 * - Only real problems show: a token the project no longer has, one it has replaced, and, in a project set to Tokens
 *   only, a value of its own, with the nearest token under it.
 */

/** What a simpler field holds: a token by name, a number of its own in the field's unit, or nothing. */
export type Holds = { token: string } | { value: number } | undefined

/** A token a number field offers: a `FieldToken` with what it comes to in the field's unit. */
export type NumberToken = FieldToken & { px: number }

/** A token's name without the namespace the field implies: `xl` for `radius-xl` in Corner radius. */
const short = (name: string, namespace = "") =>
  namespace !== "" && name.startsWith(namespace) ? name.slice(namespace.length) : name

/** The name above a field: dragging it changes the value, as Plasmic's labels and Figma's icons do. */
function Caption({ text, onScrub }: { text: string; onScrub?: (event: PointerEvent<Element>) => void }) {
  return (
    <span
      onPointerDown={onScrub}
      className={`self-start text-[11px] text-muted-foreground select-none ${onScrub ? "cursor-ew-resize touch-none" : ""}`}
    >
      {text}
    </span>
  )
}

/** The filled box every simpler field draws, with room kept at its end for the one button, so hovering moves nothing. */
const box = (error: boolean) =>
  `group/simple relative flex h-7 min-w-0 items-center gap-1.5 rounded-md bg-muted pr-7 pl-2 text-xs ring-inset hover:ring-1 hover:ring-border focus-within:ring-2 ${error ? "ring-1 ring-destructive focus-within:ring-destructive/50" : "focus-within:ring-ring"} dark:bg-input/40`

/** The one button over the end of a field, faded in while the field's hovered or focused, or its list is open. */
const endButton =
  "absolute top-1/2 right-1 grid size-5 -translate-y-1/2 place-items-center rounded text-muted-foreground opacity-0 outline-none group-focus-within/simple:opacity-100 group-hover/simple:opacity-100 hover:bg-background/70 hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring data-popup-open:opacity-100"

export interface SimpleNumberProps {
  /** The field's name: shown above it unless `caption` is false, and its accessible name. */
  label: string
  /** Shows the name above the field; a field in a group whose name is above the group has none of its own. */
  caption?: boolean
  /** A letter or corner inside the field, where a group's fields need telling apart; it scrubs too. */
  glyph?: ReactNode
  holds: Holds
  mixed?: boolean
  /** The unit after the number, where it isn't pixels: `%`, `°`, `ms`. */
  unit?: string
  /** What unset shows, faintly: `0`, Auto. */
  unset?: string
  tokens: readonly NumberToken[]
  /** What the tokens' names start with, which the pill leaves off: `radius-`. */
  namespace?: string
  /** The list's first row, which unsets the field (None, Auto); without it, the list is tokens only. */
  none?: string
  /** A project set to Tokens only: a value of its own is refused, with the nearest token under the field. */
  tokensOnly?: boolean
  scrubBy: ScrubBy
  /** A field in a pair or four: the pill keeps to the name, and what the token comes to is in the hint. */
  narrow?: boolean
  onChange: (holds: Holds) => void
  /** Where the field's messages go, where a group says them under all its fields. */
  onMessage?: (message: Message | undefined) => void
  message?: Message
  /** Words at the end of the name's row, as Each corner opens a radius's corners. */
  captionAction?: ReactNode
}

/**
 * A number field, simpler: its name above, the value, the unit where it isn't px, and nothing else at rest. A token is
 * a named pill; clicking it opens the list, and Detach takes its place at the end. Typing a number, maths (`+2`, `*2`)
 * or a token's name sets it; Up and Down step it, through the scale on a token; Alt+Down opens the list; Backspace in
 * the empty field detaches a token.
 */
export function SimpleNumber({
  label,
  caption = true,
  glyph,
  holds,
  mixed = false,
  unit,
  unset = "0",
  tokens,
  namespace = "",
  none,
  tokensOnly = false,
  scrubBy,
  narrow = false,
  onChange,
  onMessage,
  message: groupMessage,
  captionAction
}: SimpleNumberProps) {
  const [open, setOpen] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const tokenName = holds !== undefined && "token" in holds ? holds.token : undefined
  const token = tokenName === undefined ? undefined : tokens.find((each) => each.name === tokenName)
  const replacement = token?.deprecated ? tokens.find((each) => each.name === token.deprecated) : undefined
  const own = holds !== undefined && "value" in holds ? holds.value : undefined
  const current = own ?? token?.px
  const nearest =
    own === undefined
      ? undefined
      : tokens
          .filter((each) => !each.deprecated)
          .reduce<NumberToken | undefined>(
            (best, each) => (best === undefined || Math.abs(each.px - own) < Math.abs(best.px - own) ? each : best),
            undefined
          )
  const refused = tokensOnly && own !== undefined && nearest !== undefined && nearest.px !== own

  const read = (text: string): Reading<Holds> => {
    const trimmed = text.trim()
    const named = tokens.find((each) => each.name === trimmed || short(each.name, namespace) === trimmed)
    if (named) return { value: { token: named.name } }
    const reading = readNumber(trimmed.replace(/px$|%$|°$|ms$/i, ""), current, label)
    if ("clear" in reading) return { value: undefined }
    if ("reason" in reading) return { reason: reading.reason }
    if (tokensOnly) {
      const near = tokens.reduce((best, each) =>
        Math.abs(each.px - reading.value) < Math.abs(best.px - reading.value) ? each : best
      )
      if (near.px !== reading.value) return notAToken(near, () => onChange({ token: near.name }))
      return { value: { token: near.name } }
    }
    return { value: { value: reading.value } }
  }

  const typed = useTyped({
    label,
    shown: own === undefined ? "" : formatNumber(own),
    backTo: tokenName ?? (own === undefined ? unset : `${formatNumber(own)}${unit ?? "px"}`),
    read,
    onCommit: onChange,
    line: onMessage ? { message: groupMessage, onMessage } : undefined
  })
  const typing = typed.typed !== undefined
  const showPill = tokenName !== undefined && !typing
  let placeholder = mixed ? "Mixed" : unset
  if (showPill) placeholder = ""

  const step = (up: boolean, big: boolean) => {
    typed.setTyped(undefined)
    if (token) {
      const scale = tokens.filter((each) => !each.deprecated)
      const at = scale.findIndex((each) => each.name === token.name)
      const next = scale[Math.min(scale.length - 1, Math.max(0, at + (up ? 1 : -1)))]
      if (next) onChange({ token: next.name })
      return
    }
    onChange({ value: (current ?? 0) + (up ? 1 : -1) * (big ? 10 : 1) })
  }
  const scrubbing = scrub(
    () => current ?? 0,
    (value) => onChange({ value }),
    scrubBy
  )
  const onScrub = (event: PointerEvent<Element>) => {
    typed.setTyped(undefined)
    scrubbing(event)
  }

  let message = typed.message
  if (!message && refused && nearest && !typing) {
    const said = notAToken(nearest, () => onChange({ token: nearest.name }))
    message = { tone: "error", text: said.reason, action: said.action }
  }

  const pillText = token ? short(token.name, namespace) : short(tokenName ?? "", namespace)
  const pillHint = (() => {
    if (tokenName === undefined) return undefined
    if (!token)
      return { label: `${tokenName} is missing`, detail: "The project no longer has this token. Pick another." }
    if (replacement) return { label: `${token.name} is replaced`, detail: `Use ${replacement.name} instead.` }
    return { label: token.name, detail: token.detail }
  })()

  const field = (
    <div className={box(refused || typed.error)}>
      {glyph !== undefined && (
        <span
          aria-hidden
          onPointerDown={onScrub}
          className="flex shrink-0 cursor-ew-resize touch-none items-center text-muted-foreground select-none"
        >
          {glyph}
        </span>
      )}
      {showPill && (
        <Hint label={pillHint?.label} detail={pillHint?.detail} hidden={open} wait>
          <PopoverTrigger
            aria-label={`${label}: ${tokenName}${token ? "" : ", missing"}`}
            className={`-ml-1 inline-flex h-5 max-w-full min-w-0 shrink items-center gap-1 rounded bg-background/80 px-1.5 outline-none hover:bg-background focus-visible:ring-2 focus-visible:ring-ring dark:bg-background/40 ${token ? "" : "text-destructive line-through"}`}
          >
            <span className="truncate">{pillText}</span>
            {replacement && <span aria-label="Replaced" className="size-1.5 shrink-0 rounded-full bg-amber-500" />}
          </PopoverTrigger>
        </Hint>
      )}
      {showPill && token && !narrow && (
        <span className="shrink-0 text-muted-foreground tabular-nums">{token.detail.replace(/px$/, "")}</span>
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
          if (event.key === "ArrowDown" && event.altKey) {
            event.preventDefault()
            setOpen(true)
            return
          }
          if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            event.preventDefault()
            step(event.key === "ArrowUp", event.shiftKey)
            return
          }
          if (showPill && event.currentTarget.value === "" && event.key === "Backspace") {
            event.preventDefault()
            onChange(token ? { value: token.px } : undefined)
            return
          }
          typed.input.onKeyDown(event)
        }}
        className={`h-full min-w-0 bg-transparent tabular-nums outline-none placeholder:text-muted-foreground ${showPill ? "w-0 flex-1" : "[field-sizing:content] min-w-[1ch]"} ${refused && !typing ? "text-destructive" : ""}`}
      />
      {!showPill && unit && (own !== undefined || !mixed) && (
        <span className="-ml-1 shrink-0 text-muted-foreground select-none">{unit}</span>
      )}
      {/* The rest of the box focuses the input, as clicking anywhere in a text field does. */}
      {!showPill && (
        <span aria-hidden className="h-full flex-1 cursor-text" onPointerDown={() => input.current?.focus()} />
      )}
      {tokenName === undefined ? (
        <Hint label="Tokens" detail="Alt+Down">
          <PopoverTrigger aria-label={`${label} tokens`} className={endButton}>
            <ChevronDown className="size-3.5" />
          </PopoverTrigger>
        </Hint>
      ) : (
        <Hint label="Detach" detail={token ? `Keeps ${token.detail}, not the token` : "Clears the missing token"}>
          <button
            type="button"
            aria-label={`Detach ${label} from ${tokenName}`}
            className={endButton}
            onClick={() => onChange(token ? { value: token.px } : undefined)}
          >
            <Unlink className="size-3.5" />
          </button>
        </Hint>
      )}
    </div>
  )

  return (
    <div className="flex min-w-0 flex-col gap-1">
      {caption && (
        <div className="flex min-w-0 items-center justify-between gap-1">
          <Caption text={label} onScrub={onScrub} />
          {captionAction}
        </div>
      )}
      <Popover open={open} onOpenChange={setOpen}>
        {field}
        <PopoverContent className="w-56 gap-0 p-1" align={showPill ? "start" : "end"}>
          {replacement && (
            <button
              type="button"
              onClick={() => {
                onChange({ token: replacement.name })
                setOpen(false)
              }}
              className="mb-1 rounded-sm bg-amber-500/10 px-2 py-1.5 text-left text-xs hover:bg-amber-500/20"
            >
              {token?.name} is replaced. Use {replacement.name}
            </button>
          )}
          <TokenList
            label={label}
            tokens={tokens}
            current={tokenName}
            none={none}
            own={own !== undefined}
            onPick={(name) => {
              onChange(name === undefined ? undefined : { token: name })
              typed.setTyped(undefined)
              setOpen(false)
            }}
          />
        </PopoverContent>
      </Popover>
      {!onMessage && <MessageLine message={message} />}
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

/** A small text button in a group's name row, as Each side and Each corner are: words where Figma has an icon. */
export function CaptionButton({
  pressed,
  onClick,
  children
}: {
  pressed: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className="rounded px-1 text-[11px] text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
    </button>
  )
}

/** The line a group's fields say things on, under all of them. */
export interface GroupLine {
  message: Message | undefined
  onMessage: (message: Message | undefined) => void
}

/**
 * A group of fields under one name, as Padding's sides and Corner radius's corners are: the name, with the words that
 * switch between the short form and every part on the right, then the fields, with what any of them says under all.
 */
export function SimpleGroup({
  label,
  each,
  expanded,
  onExpand,
  children
}: {
  label: string
  /** The words for every part: Each side, Each corner. */
  each: string
  expanded: boolean
  onExpand: (expanded: boolean) => void
  children: (line: GroupLine) => ReactNode
}) {
  const [message, setMessage] = useState<Message>()
  return (
    <div className="col-span-2 flex min-w-0 flex-col gap-1">
      <div className="flex items-center justify-between">
        <Caption text={label} />
        <CaptionButton pressed={expanded} onClick={() => onExpand(!expanded)}>
          {expanded ? "Together" : each}
        </CaptionButton>
      </div>
      <div className="grid grid-cols-2 gap-x-2 gap-y-1.5">{children({ message, onMessage: setMessage })}</div>
      <MessageLine message={message} />
    </div>
  )
}

/** A section of simpler fields: the panel's section, then two fields to a row, as Figma's with property labels on. */
export function SimpleSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <PanelSection title={title}>
      <div className="grid grid-cols-2 gap-x-2 gap-y-2.5 pr-3 pl-1">{children}</div>
    </PanelSection>
  )
}

/** A color token as a simpler field offers it. */
export type SimpleColorToken = FieldToken & { hex: string }

/**
 * A color field, simpler: the swatch, the hex or the token's name, and the alpha after a hairline, as Figma's fill
 * row. A token shows by name beside its swatch, with no pill, since the swatch already says it's a color; Detach
 * keeps its hex. The end button opens the color tokens.
 */
export function SimpleColor({
  label,
  caption = true,
  value,
  alpha,
  tokens,
  onChange
}: {
  label: string
  caption?: boolean
  /** A token's name or a hex. */
  value: string | undefined
  alpha: number | undefined
  tokens: readonly SimpleColorToken[]
  onChange: (value: string | undefined, alpha: number | undefined) => void
}) {
  const [open, setOpen] = useState(false)
  const token = value?.startsWith("#") ? undefined : tokens.find((each) => each.name === value)
  const missing = value !== undefined && !value.startsWith("#") && token === undefined
  const hex = token?.hex ?? (value?.startsWith("#") ? value : undefined)
  const typedHex = useTyped<string | undefined>({
    label,
    shown: value?.startsWith("#") ? value.slice(1).toUpperCase() : "",
    read: (text) => {
      const trimmed = text.trim().replace(/^#/, "")
      const named = tokens.find((each) => each.name === trimmed)
      if (named) return { value: named.name }
      if (trimmed === "") return { value: undefined }
      if (/^[0-9a-f]{3}([0-9a-f]{3})?$/i.test(trimmed)) {
        const full = trimmed.length === 3 ? [...trimmed].map((c) => c + c).join("") : trimmed
        return { value: `#${full.toLowerCase()}` }
      }
      return { reason: `Can't read "${trimmed}". Type a hex, such as 2563EB, or a color token's name` }
    },
    onCommit: (next) => onChange(next, alpha)
  })
  const typedAlpha = useTyped<number | undefined>({
    label: `${label} opacity`,
    shown: alpha === undefined ? "100" : formatNumber(alpha),
    read: (text) => {
      const reading = readNumber(text.replace(/%$/, ""), alpha ?? 100, `${label} opacity`)
      if ("clear" in reading) return { value: undefined }
      if ("reason" in reading) return { reason: reading.reason }
      return { value: Math.min(100, Math.max(0, reading.value)) }
    },
    onCommit: (next) => onChange(value, next === 100 ? undefined : next)
  })
  const showName = (token !== undefined || missing) && typedHex.typed === undefined
  return (
    <div className="col-span-2 flex min-w-0 flex-col gap-1">
      {caption && <Caption text={label} />}
      <Popover open={open} onOpenChange={setOpen}>
        <div className={box(typedHex.error || typedAlpha.error)}>
          <span
            aria-hidden
            className="size-3.5 shrink-0 rounded-[3px] ring-1 ring-black/10 ring-inset dark:ring-white/15"
            style={{ background: hex ?? "transparent" }}
          />
          {showName ? (
            <span className={`min-w-0 flex-1 truncate ${missing ? "text-destructive line-through" : ""}`}>{value}</span>
          ) : (
            <input
              aria-label={label}
              spellCheck={false}
              placeholder="None"
              {...typedHex.input}
              className="h-full w-0 min-w-0 flex-1 bg-transparent font-mono uppercase outline-none placeholder:font-sans placeholder:text-muted-foreground placeholder:normal-case"
            />
          )}
          {value !== undefined && (
            <span className="flex h-full shrink-0 items-center gap-0.5 border-l pl-1.5">
              <input
                aria-label={`${label} opacity`}
                inputMode="decimal"
                spellCheck={false}
                {...typedAlpha.input}
                className="h-full w-7 bg-transparent text-right tabular-nums outline-none"
              />
              <span className="text-muted-foreground">%</span>
            </span>
          )}
          {token === undefined && !missing ? (
            <Hint label="Color tokens" detail="Alt+Down">
              <PopoverTrigger aria-label={`${label} tokens`} className={endButton}>
                <ChevronDown className="size-3.5" />
              </PopoverTrigger>
            </Hint>
          ) : (
            <Hint label="Detach" detail={token ? `Keeps #${token.detail}` : "Clears the missing token"}>
              <button
                type="button"
                aria-label={`Detach ${label} from ${value}`}
                className={endButton}
                onClick={() => onChange(token?.hex, alpha)}
              >
                <Unlink className="size-3.5" />
              </button>
            </Hint>
          )}
        </div>
        <PopoverContent className="w-56 gap-0 p-1" align="end">
          <TokenList
            label={label}
            tokens={tokens}
            current={token?.name}
            own={value?.startsWith("#")}
            onPick={(name) => {
              onChange(name, alpha)
              setOpen(false)
            }}
          />
        </PopoverContent>
      </Popover>
      <MessageLine message={typedHex.message ?? typedAlpha.message} />
    </div>
  )
}
