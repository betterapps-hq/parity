import { applyFieldInput, readFieldInput } from "@parity-app/core"
import type { PreviewKind } from "@parity-app/tokens"
import { CircleAlert } from "lucide-react"
import {
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
  type ReactNode,
  useState
} from "react"
import { Hint } from "../../chrome/Hint.tsx"
import { onPaper, paper, TokenArt } from "../../chrome/token-previews.tsx"

/*
 * What the text, keyword, expression and CSS fields share: typing that's checked before it's stored, Up and Down
 * steps, scrubbing a label, the box a field draws, and the line it says things on under its row. They follow
 * design-options-fields.md's anatomy, as the length fields in controls.tsx do.
 */

/** What a field says under its row: why it can't read what's typed, what it did, or a question with an answer. */
export interface Message {
  tone: "error" | "note"
  text: string
  /** A button after the text, as "Did you mean 24px?" offers the other reading. */
  action?: { label: string; run: () => void }
}

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
 * Text typed into a field, checked before it's stored: `read` gives what to store, or the reason it can't. Text it
 * can't read stays, outlined, with the reason under the row; Enter keeps it, and Escape or leaving puts the value back
 * and says so. Up and Down step the value, ending any typing.
 */
export function useTyped<T>({
  label,
  shown,
  read,
  onCommit,
  onStep
}: {
  label: string
  /** The value as the field shows it at rest, which Escape puts back. */
  shown: string
  read: (text: string) => { value: T; message?: Message } | { reason: string }
  onCommit: (value: T) => void
  onStep?: (up: boolean, shift: boolean) => void
}) {
  const [typed, setTyped] = useState<string>()
  const [focused, setFocused] = useState(false)
  const [message, setMessage] = useState<Message>()
  const error = message?.tone === "error"
  const commit = (leaving: boolean): boolean => {
    if (typed === undefined) return true
    const outcome = read(typed)
    if ("value" in outcome) {
      onCommit(outcome.value)
      setMessage(outcome.message)
    } else if (leaving) {
      setMessage({ tone: "note", text: `${label} is back to ${shown || "unset"}. ${outcome.reason}.` })
    } else {
      setMessage({ tone: "error", text: outcome.reason })
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
          setMessage(error ? { tone: "note", text: `${label} is back to ${shown || "unset"}.` } : undefined)
        }
        if (onStep && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
          event.preventDefault()
          setTyped(undefined)
          setMessage(undefined)
          onStep(event.key === "ArrowUp", event.shiftKey)
        }
      }
    }
  }
}

/**
 * Dragging a label left or right to change a value, one Up step per screen pixel and a Shift step with Shift, as
 * design-options-fields.md's Keys and scrubbing sets for values other than spacing steps.
 */
export function scrub(
  from: () => number,
  apply: (value: number) => void,
  { step, shiftStep, min = -Infinity, max = Infinity }: { step: number; shiftStep: number; min?: number; max?: number }
) {
  return (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    const handle = event.currentTarget
    handle.setPointerCapture(event.pointerId)
    const startX = event.clientX
    const start = from()
    const move = (moveEvent: PointerEvent) => {
      const dx = Math.trunc(moveEvent.clientX - startX)
      const next = start + dx * (moveEvent.shiftKey ? shiftStep : step)
      apply(Math.round(Math.min(max, Math.max(min, next)) * 10_000) / 10_000)
    }
    const end = () => {
      handle.removeEventListener("pointermove", move)
      handle.removeEventListener("pointerup", end)
      handle.removeEventListener("pointercancel", end)
    }
    handle.addEventListener("pointermove", move)
    handle.addEventListener("pointerup", end)
    handle.addEventListener("pointercancel", end)
  }
}

/** The field's box: outlined in the error color while what's typed can't be read. */
export function fieldBox(error: boolean, extra = ""): string {
  const ring = error ? "border-destructive focus-within:ring-destructive/40" : "focus-within:ring-ring"
  return `flex h-7 min-w-0 items-center gap-1 rounded-md border bg-transparent px-1.5 text-xs focus-within:ring-2 dark:bg-input/30 ${ring} ${extra}`
}

/** The input inside a field's box. */
export const fieldInput = "w-full min-w-0 bg-transparent tabular-nums outline-none placeholder:text-muted-foreground"

/** The status slot's mark for input the field can't read. */
export function InvalidMark() {
  return <CircleAlert aria-hidden className="size-3.5 shrink-0 text-destructive" />
}

/** What a field says under its row, with its answer button when it asks something. */
export function MessageLine({ message }: { message: Message | undefined }) {
  if (!message) return null
  const error = message.tone === "error"
  return (
    <p
      role={error ? "alert" : "status"}
      className={`mt-1 flex flex-wrap items-center gap-x-1.5 text-[11px] leading-snug ${error ? "text-destructive" : "text-muted-foreground"}`}
    >
      {message.text}
      {message.action && (
        <button
          type="button"
          onClick={message.action.run}
          className="rounded px-1 font-medium text-foreground underline-offset-2 hover:underline"
        >
          {message.action.label}
        </button>
      )}
    </p>
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

/** A token's chip in a field, with what it comes to faintly after its name and × to take it off. */
export function TokenChip({
  name,
  detail,
  preview,
  struck = false,
  fill = false,
  onRemove
}: {
  name: string
  detail?: string
  preview?: ReactElement
  struck?: boolean
  /**
   * Shrinks to fit a field too narrow to leave room to type beside it, with × only while the field is hovered or
   * focused, so the name has the room at rest. The field's box takes `group/field`.
   */
  fill?: boolean
  onRemove?: () => void
}) {
  return (
    <span
      className={`flex h-5 ${fill ? "min-w-0 shrink" : "max-w-[75%] shrink-0"} items-center gap-1 rounded bg-accent px-1 text-xs ${struck ? "text-amber-700 line-through dark:text-amber-400" : ""}`}
    >
      {preview}
      <span className="truncate">{name}</span>
      {detail && <span className="shrink-0 text-muted-foreground no-underline">{detail}</span>}
      {onRemove && (
        <button
          type="button"
          aria-label={`Remove ${name}`}
          onClick={onRemove}
          className={`-mr-0.5 size-4 shrink-0 place-items-center rounded text-muted-foreground hover:bg-background hover:text-foreground ${fill ? "hidden group-focus-within/field:grid group-hover/field:grid" : "grid"}`}
        >
          ×
        </button>
      )}
    </span>
  )
}

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

/** A number as a field shows it: no trailing zeros, at most three decimals. */
export function formatNumber(value: number): string {
  return String(Math.round(value * 1000) / 1000)
}
