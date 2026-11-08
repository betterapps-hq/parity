import { Popover, PopoverContent, PopoverTrigger } from "@buildkitgg/shadcn-baseui-kit"
import { CircleAlert, Hexagon, X } from "lucide-react"
import { type PointerEvent as ReactPointerEvent, type ReactNode, useState } from "react"
import { Hint } from "../../chrome/Hint.tsx"

/*
 * The field Angle, Time, Easing, Move, Scale and a position's X and Y share, with the slots every field has (PAR-652's
 * design-options-fields.md): an inner label that scrubs, the value or a token's chip, the unit, what it comes to faintly,
 * one status mark, and the token button. What's typed is committed on Enter or on leaving; what it can't read stays,
 * outlined, with the reason under it, and Escape or leaving puts the value back and says so.
 */

/** A token a field offers, with its small preview. */
export interface TokenOption {
  name: string
  /** The name without the namespace the field implies (`fast` in a duration). */
  label: string
  /** What it comes to (`150ms`). */
  detail: string
  preview?: ReactNode
}

export interface UnitFieldProps {
  label: string
  /** A short label inside the field that scrubs it (X, Y), or a button such as the easing's curve. */
  inner?: ReactNode
  /** The unit after the value (°, ms, %), hidden while typing. */
  unit?: string
  /** The value as shown; unset shows the placeholder faintly. */
  shown: string | undefined
  placeholder: string
  /** What it comes to, or where it's from, faint after the value at rest (`set by Easing`, `as 0.25turn`). */
  detail?: string
  mixed?: boolean
  /** The token the field holds, as a chip in the value's place. */
  chip?: { name: string; title: string; preview?: ReactNode; onRemove: () => void }
  tokens?: readonly TokenOption[]
  onPickToken?: (name: string) => void
  /** The status slot: off the system, allowed here, or set for a theme. */
  mark?: ReactNode
  /** Reads what's typed and applies it, or says why it can't. */
  onType: (text: string) => string | undefined
  onStep: (up: boolean, shift: boolean) => void
  /** Dragging the inner label: the value it starts from, and what a drag of `dx` screen pixels makes it. */
  scrub?: { from: () => number; apply: (from: number, dx: number, shift: boolean) => void }
  /** A button after the field, as Angle's dial is. */
  trailing?: ReactNode
  narrow?: boolean
}

export function UnitField({
  label,
  inner,
  unit,
  shown,
  placeholder,
  detail,
  mixed = false,
  chip,
  tokens,
  onPickToken,
  mark,
  onType,
  onStep,
  scrub,
  trailing,
  narrow = false
}: UnitFieldProps) {
  const [typed, setTyped] = useState<string>()
  const [focused, setFocused] = useState(false)
  const [message, setMessage] = useState<{ tone: "error" | "note"; text: string }>()
  const [tokensOpen, setTokensOpen] = useState(false)
  const error = message?.tone === "error"
  const current = shown ?? placeholder
  const commit = (leaving: boolean): boolean => {
    if (typed === undefined) return true
    const reason = onType(typed)
    if (reason === undefined) setMessage(undefined)
    else if (!leaving) {
      setMessage({ tone: "error", text: reason })
      return false
    } else setMessage({ tone: "note", text: `${label} is back to ${current}${unit ?? ""}. ${reason}.` })
    setTyped(undefined)
    return true
  }
  const startScrub = (event: ReactPointerEvent<HTMLElement>) => {
    if (!scrub || event.button !== 0) return
    event.preventDefault()
    const handle = event.currentTarget
    handle.setPointerCapture(event.pointerId)
    const startX = event.clientX
    const from = scrub.from()
    setTyped(undefined)
    setMessage(undefined)
    const move = (moveEvent: PointerEvent) => scrub.apply(from, moveEvent.clientX - startX, moveEvent.shiftKey)
    const end = () => {
      handle.removeEventListener("pointermove", move)
      handle.removeEventListener("pointerup", end)
      handle.removeEventListener("pointercancel", end)
    }
    handle.addEventListener("pointermove", move)
    handle.addEventListener("pointerup", end)
    handle.addEventListener("pointercancel", end)
  }
  // While a chip shows, the input after it takes typing, which replaces the token.
  const showChip = chip !== undefined && typed === undefined
  let value = typed ?? shown ?? ""
  // Unset shows what it is faintly, or Mixed; beside a chip, nothing.
  let fieldPlaceholder = mixed && shown === undefined ? "Mixed" : placeholder
  if (showChip) {
    value = ""
    fieldPlaceholder = ""
  }
  let after: ReactNode
  if (error) after = <CircleAlert aria-hidden className="size-3.5 shrink-0 text-destructive" />
  else if (!focused && !showChip && unit && (shown !== undefined || !mixed)) {
    after = (
      <span className={`shrink-0 text-muted-foreground ${narrow ? "hidden group-hover/unit:inline" : ""}`}>{unit}</span>
    )
  }
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex min-w-0 items-center gap-1">
        <div
          className={`group/unit flex h-7 min-w-0 flex-1 items-center gap-1 rounded-md border bg-transparent px-1.5 text-xs focus-within:ring-2 dark:bg-input/30 ${error ? "border-destructive focus-within:ring-destructive/40" : "focus-within:ring-ring"}`}
        >
          {typeof inner === "string" ? (
            <span
              onPointerDown={startScrub}
              className={`shrink-0 text-muted-foreground select-none ${scrub ? "cursor-ew-resize touch-none" : ""}`}
            >
              {inner}
            </span>
          ) : (
            inner
          )}
          {showChip && (
            <span className="flex h-5 min-w-0 shrink items-center gap-1 rounded bg-accent pr-0.5 pl-1 text-foreground">
              <Hint label={chip.title}>
                <span className="flex min-w-0 items-center gap-1">
                  {chip.preview}
                  <span className="truncate">{chip.name}</span>
                </span>
              </Hint>
              <button
                type="button"
                aria-label={`Remove ${chip.name} from ${label}`}
                onClick={chip.onRemove}
                className="grid size-4 shrink-0 place-items-center rounded text-muted-foreground hover:bg-background hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            </span>
          )}
          <input
            aria-label={label}
            aria-invalid={error || undefined}
            placeholder={fieldPlaceholder}
            value={value}
            onFocus={() => {
              setFocused(true)
              if (message?.tone === "note") setMessage(undefined)
            }}
            onChange={(event) => setTyped(event.target.value)}
            onKeyDown={(event) => {
              if (showChip && event.currentTarget.value === "" && ["Backspace", "Delete"].includes(event.key)) {
                event.preventDefault()
                chip.onRemove()
              }
              if (event.key === "Enter" && commit(false)) event.currentTarget.blur()
              if (event.key === "Escape" && typed !== undefined) {
                setTyped(undefined)
                setMessage(error ? { tone: "note", text: `${label} is back to ${current}${unit ?? ""}.` } : undefined)
              }
              if (event.key === "ArrowDown" && event.altKey && tokens?.length) {
                event.preventDefault()
                setTokensOpen(true)
                return
              }
              if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                event.preventDefault()
                setTyped(undefined)
                setMessage(undefined)
                onStep(event.key === "ArrowUp", event.shiftKey)
              }
            }}
            onBlur={() => {
              setFocused(false)
              commit(true)
            }}
            className={`w-0 flex-1 bg-transparent tabular-nums outline-none placeholder:text-muted-foreground ${showChip ? "min-w-1" : "min-w-6"}`}
          />
          {after}
          {detail && !focused && !error && (
            <span className={`truncate text-muted-foreground/70 ${narrow ? "hidden" : ""}`}>{detail}</span>
          )}
          {mark}
          {tokens && tokens.length > 0 && !showChip && (
            <Popover open={tokensOpen} onOpenChange={setTokensOpen}>
              <Hint label={`Choose a token for ${label}`} detail="Alt+Down">
                <PopoverTrigger
                  aria-label={`Choose a token for ${label}`}
                  className="-mr-1 grid size-5 shrink-0 place-items-center rounded text-muted-foreground opacity-0 outline-none group-focus-within/unit:opacity-100 group-hover/unit:opacity-100 hover:bg-accent hover:text-foreground focus-visible:opacity-100 data-popup-open:opacity-100"
                >
                  <Hexagon className="size-3" />
                </PopoverTrigger>
              </Hint>
              <PopoverContent className="w-56 gap-0 p-1" align="end">
                {tokens.map((token) => (
                  <button
                    key={token.name}
                    type="button"
                    onClick={() => {
                      onPickToken?.(token.name)
                      setTokensOpen(false)
                      setTyped(undefined)
                      setMessage(undefined)
                    }}
                    className="flex h-7 items-center gap-2 rounded px-2 text-left text-xs hover:bg-accent"
                  >
                    {token.preview}
                    <span className="flex-1 truncate">{token.label}</span>
                    <span className="text-muted-foreground tabular-nums">{token.detail}</span>
                  </button>
                ))}
              </PopoverContent>
            </Popover>
          )}
        </div>
        {trailing}
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

/**
 * A number typed in a field's units, with the app's maths: `45`, `45deg`, `0.25turn`, `+15`, `*2`. A bare number is in
 * the base unit (the factor 1), and a leading `-` is a negative number, not a step down.
 */
export function readUnitNumber(
  text: string,
  { units, current, takes }: { units: Record<string, number>; current: number; takes: string }
): { value: number; unit: string } | { reason: string } {
  const trimmed = text.trim()
  const relative = /^([+*/])\s*(.+)$/.exec(trimmed)
  const body = relative ? relative[2]! : trimmed
  const match = /^(-?\d*\.?\d+)\s*([a-z%°]*)$/i.exec(body)
  const unit = match?.[2]?.toLowerCase().replace("°", "deg") ?? ""
  const factor = unit === "" ? 1 : units[unit]
  if (!match || factor === undefined) return { reason: `Can't read "${trimmed}". ${takes}` }
  const number = Number(match[1]) * factor
  if (!relative) return { value: number, unit }
  if (relative[1] === "+") return { value: current + number, unit }
  if (number === 0) return { reason: "Can't divide by 0" }
  return { value: relative[1] === "*" ? current * Number(match[1]) : current / Number(match[1]), unit }
}
