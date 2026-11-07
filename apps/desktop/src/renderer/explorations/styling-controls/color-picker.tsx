/* oxlint-disable jsx-a11y/prefer-tag-over-role -- the saturation and brightness square is a slider on two axes, which no input element is; the hue and alpha strips beside it are drawn and keyed the same way */
import {
  Button,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from "@buildkitgg/shadcn-baseui-kit"
import {
  formatHex,
  formatOklch,
  type Hsb,
  hsbToRgba,
  hslToRgba,
  nearestColor,
  oklchToRgba,
  parseColor,
  type Rgba,
  rgb255ToRgba,
  rgbaToHsb,
  rgbaToHsl,
  rgbaToOklch,
  rgbaToRgb255,
  sameColorDistance
} from "@parity-app/tokens"
import { Check, Circle, CircleAlert, CircleCheck, Pipette, X } from "lucide-react"
import { type KeyboardEvent, type PointerEvent, type ReactNode, useRef, useState } from "react"
import { Hint } from "../../chrome/Hint.tsx"
import { type ColorToken, colorTokens } from "./data.ts"

/*
 * The color field and its picker, as PAR-652's design-options-values.md (Color) and design-options-fields.md specify
 * them. At rest, a token is a chip; a plain color is its value in short form, with a hollow mark for a value off the
 * token system. The picker's Custom tab edits the color live: a square, hue and alpha strips, a model menu, the
 * eyedropper, the design's colors and the nearest token. The Tokens panel's picker edits a token's own value.
 */

/** Whether a style's color is a plain value (`#2563eb`, `oklch(…)`) rather than a token's name. */
const isPlainColor = (value: string | undefined): value is string =>
  value !== undefined && parseColor(value) !== undefined

/** The stand-in token whose color looks closest to `value`, and how far off it is. */
function nearestToken(value: string): { token: ColorToken; distance: number } | undefined {
  const color = parseColor(value)
  const nearest = color && nearestColor(color, Object.fromEntries(colorTokens.map((token) => [token.name, token.hex])))
  const token = colorTokens.find((other) => other.name === nearest?.name)
  return nearest && token && { token, distance: nearest.distance }
}

/** A plain color in short form, as Figma shows it: `2F6FED` for hex, `oklch 62% .19 260` for OKLCH. */
function shortForm(value: string): string {
  if (value.startsWith("#")) return value.slice(1, 7).toUpperCase()
  const { l, c, h } = rgbaToOklch(parseColor(value)!)
  return `oklch ${Math.round(l * 100)}% ${c.toFixed(2).replace(/^0/, "")} ${Math.round(h)}`
}

type ColorModel = "hex" | "rgb" | "hsl" | "hsb" | "oklch"

const models: { value: ColorModel; label: string }[] = [
  { value: "hex", label: "Hex" },
  { value: "rgb", label: "RGB" },
  { value: "hsl", label: "HSL" },
  { value: "hsb", label: "HSB" },
  { value: "oklch", label: "OKLCH" }
]

/** A color written in the model it was picked in: OKLCH as `oklch()`, the rest as hex, as HSB is written. */
const written = (color: Rgba, model: ColorModel) =>
  model === "oklch" ? formatOklch({ ...color, a: 1 }) : formatHex({ ...color, a: 1 })

/**
 * The square, hue and alpha strips, the model's fields and the eyedropper, on an opaque color and its alpha (0 to 100,
 * unset for opaque): one alpha, shown here and as the % beside the swatch.
 */
export function ColorEditor({
  value,
  alpha,
  onChange,
  model: modelAtStart
}: {
  value: string
  alpha: number | undefined
  onChange: (value: string, alpha: number | undefined) => void
  model?: ColorModel
}) {
  const start = parseColor(value) ?? { r: 0, g: 0, b: 0, a: 1 }
  const [hsb, setHsb] = useState(() => rgbaToHsb(start))
  const [model, setModel] = useState<ColorModel>(modelAtStart ?? (value.startsWith("oklch") ? "oklch" : "hex"))
  // What the model's fields say under their row, as any field does.
  const [message, setMessage] = useState<FieldMessage>()
  const opacity = alpha ?? 100
  const color = hsbToRgba(hsb)
  const update = (next: Hsb, nextAlpha = alpha, nextModel = model) => {
    setHsb(next)
    onChange(written(hsbToRgba(next), nextModel), nextAlpha)
  }
  // A gray keeps the hue the strip was on, so dragging into the gray corner and out again doesn't jump to red.
  const fromRgba = (rgba: Rgba) => {
    const next = rgbaToHsb(rgba)
    update(next.s === 0 || next.b === 0 ? { ...next, h: hsb.h } : next)
  }
  const eyedropper = "EyeDropper" in window
  const pickFromScreen = async () => {
    const EyeDropper = (window as unknown as { EyeDropper: new () => { open: () => Promise<{ sRGBHex: string }> } })
      .EyeDropper
    const picked = await new EyeDropper().open().catch(() => undefined)
    const rgba = picked && parseColor(picked.sRGBHex)
    if (rgba) fromRgba(rgba)
  }
  const rgb = rgbaToRgb255(color)
  const hsl = rgbaToHsl(color)
  const oklch = rgbaToOklch(color)
  const fields: Record<ColorModel, ReactNode> = {
    hex: <HexField key="hex" color={color} onChange={fromRgba} onMessage={setMessage} />,
    rgb: (["r", "g", "b"] as const).map((channel) => (
      <ChannelField
        onMessage={setMessage}
        key={channel}
        label={{ r: "Red", g: "Green", b: "Blue" }[channel]}
        value={rgb[channel]}
        max={255}
        onChange={(next) => fromRgba(rgb255ToRgba({ ...rgb, [channel]: next }))}
      />
    )),
    hsl: (["h", "s", "l"] as const).map((channel) => (
      <ChannelField
        onMessage={setMessage}
        key={channel}
        label={{ h: "Hue", s: "Saturation", l: "Lightness" }[channel]}
        value={channel === "h" ? hsb.h : hsl[channel]}
        max={channel === "h" ? 359 : 100}
        onChange={(next) => {
          if (channel === "h") update({ ...hsb, h: next })
          else fromRgba(hslToRgba({ ...hsl, h: hsb.h, [channel]: next }))
        }}
      />
    )),
    hsb: (["h", "s", "b"] as const).map((channel) => (
      <ChannelField
        onMessage={setMessage}
        key={channel}
        label={{ h: "Hue", s: "Saturation", b: "Brightness" }[channel]}
        value={hsb[channel]}
        max={channel === "h" ? 359 : 100}
        onChange={(next) => update({ ...hsb, [channel]: next })}
      />
    )),
    oklch: [
      <ChannelField
        onMessage={setMessage}
        key="l"
        label="Lightness"
        value={oklch.l * 100}
        max={100}
        onChange={(next) => fromRgba(oklchToRgba({ ...oklch, l: next / 100 }))}
      />,
      <ChannelField
        onMessage={setMessage}
        key="c"
        label="Chroma"
        value={oklch.c}
        max={0.4}
        step={0.01}
        places={3}
        onChange={(next) => fromRgba(oklchToRgba({ ...oklch, c: next }))}
      />,
      <ChannelField
        onMessage={setMessage}
        key="h"
        label="Hue"
        value={oklch.h}
        max={359}
        onChange={(next) => fromRgba(oklchToRgba({ ...oklch, h: next }))}
      />
    ]
  }
  const solid = formatHex(color)
  return (
    <div className="flex flex-col gap-2">
      <Strip2d
        label="Saturation and brightness"
        valueText={`Saturation ${Math.round(hsb.s)}%, brightness ${Math.round(hsb.b)}%`}
        x={hsb.s / 100}
        y={1 - hsb.b / 100}
        onMove={(x, y) => update({ ...hsb, s: x * 100, b: (1 - y) * 100 })}
        onKey={(dx, dy) => update({ ...hsb, s: clamp(hsb.s + dx, 0, 100), b: clamp(hsb.b - dy, 0, 100) })}
        background={`linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hsb.h} 100% 50%))`}
      />
      <div className="flex items-center gap-2">
        <Hint label={eyedropper ? "Pick a color from the screen" : "The eyedropper needs Parity's own window"}>
          <Button
            variant="outline"
            size="icon-sm"
            className="size-7 shrink-0"
            aria-label="Pick a color from the screen"
            disabled={!eyedropper}
            onClick={pickFromScreen}
          >
            <Pipette />
          </Button>
        </Hint>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Strip
            label="Hue"
            value={hsb.h}
            max={359}
            unit="°"
            background="linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)"
            onChange={(h) => update({ ...hsb, h })}
          />
          <Strip
            label="Opacity"
            value={opacity}
            max={100}
            unit="%"
            checker
            background={`linear-gradient(to right, transparent, ${solid})`}
            onChange={(next) => update(hsb, Math.round(next) >= 100 ? undefined : Math.round(next))}
          />
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Select
          items={models}
          value={model}
          onValueChange={(next) => {
            if (!next) return
            setModel(next as ColorModel)
            // A plain color is written in the model it's picked in.
            update(hsb, alpha, next as ColorModel)
          }}
        >
          <SelectTrigger size="sm" aria-label="Color model" className="h-7 w-[4.5rem] shrink-0 px-2 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {models.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="grid min-w-0 flex-1 auto-cols-fr grid-flow-col gap-1">{fields[model]}</div>
      </div>
      {message && (
        <p
          role={message.tone === "error" ? "alert" : "status"}
          className={`-mt-1 text-[11px] leading-snug ${message.tone === "error" ? "text-destructive" : "text-muted-foreground"}`}
        >
          {message.text}
        </p>
      )}
    </div>
  )
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/** What a field says under its row: why it can't read what's typed, or that it put the value back. */
export interface FieldMessage {
  tone: "error" | "note"
  text: string
}

/**
 * Text typed into a field, checked before it's stored: `read` gives the value, or the reason it can't. Text it can't
 * read stays, outlined in the error color, with the reason under the row; Enter keeps it, and Escape or leaving puts
 * the value back and says so. Nothing is stored until it reads.
 */
function useTypedField<T>({
  shown,
  name,
  read,
  onCommit,
  onMessage
}: {
  shown: string
  name: string
  read: (text: string) => { value: T } | { reason: string }
  onCommit: (value: T) => void
  onMessage: (message: FieldMessage | undefined) => void
}) {
  const [typed, setTyped] = useState<string>()
  const [error, setError] = useState(false)
  const commit = (leaving: boolean): boolean => {
    if (typed === undefined) return true
    const outcome = read(typed)
    if ("value" in outcome) {
      onCommit(outcome.value)
      onMessage(undefined)
    } else if (!leaving) {
      setError(true)
      onMessage({ tone: "error", text: outcome.reason })
      return false
    } else {
      onMessage({ tone: "note", text: `${name} is back to ${shown}. ${outcome.reason}.` })
    }
    setError(false)
    setTyped(undefined)
    return true
  }
  return {
    value: typed ?? shown,
    error,
    onChange: (text: string) => setTyped(text),
    onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter" && commit(false)) event.currentTarget.blur()
      if (event.key === "Escape" && typed !== undefined) {
        event.stopPropagation()
        setTyped(undefined)
        setError(false)
        onMessage(error ? { tone: "note", text: `${name} is back to ${shown}.` } : undefined)
      }
    },
    onBlur: () => commit(true),
    reset: () => {
      setTyped(undefined)
      setError(false)
    }
  }
}

/**
 * A hex field: `2F6FED` with or without `#`, of 3, 6 or 8 digits; an `oklch()` pasted in is read too. What's typed is
 * checked as CSS checks a color (`CSS.supports`) and must read as hex or `oklch()`.
 */
function HexField({
  color,
  onChange,
  onMessage
}: {
  color: Rgba
  onChange: (color: Rgba) => void
  onMessage: (message: FieldMessage | undefined) => void
}) {
  const field = useTypedField<Rgba>({
    shown: formatHex(color).slice(1).toUpperCase(),
    name: "Hex",
    read: (text) => {
      const trimmed = text.trim()
      const candidate = /^[\da-f]+$/i.test(trimmed) ? `#${trimmed}` : trimmed
      const read = CSS.supports("color", candidate) ? parseColor(candidate) : undefined
      return read ? { value: read } : { reason: "Type a hex color, such as 2F6FED" }
    },
    onCommit: (read) => onChange({ ...read, a: 1 }),
    onMessage
  })
  return (
    <Input
      aria-label="Hex"
      aria-invalid={field.error || undefined}
      value={field.value}
      onChange={(event) => field.onChange(event.target.value)}
      onKeyDown={field.onKeyDown}
      onBlur={field.onBlur}
      className="h-7 px-2 font-mono text-xs uppercase"
    />
  )
}

/**
 * One of a model's channels, typed or stepped with the arrow keys (Shift for ten), committed on Enter or leaving. A
 * number past either end is brought to it; anything else is refused.
 */
function ChannelField({
  label,
  value,
  max,
  step = 1,
  places = 0,
  onChange,
  onMessage
}: {
  label: string
  value: number
  max: number
  step?: number
  places?: number
  onChange: (value: number) => void
  onMessage: (message: FieldMessage | undefined) => void
}) {
  const field = useTypedField<number>({
    shown: places === 0 ? String(Math.round(value)) : value.toFixed(places).replace(/^0/, ""),
    name: label,
    read: (text) => {
      const number = Number(text)
      return text.trim() !== "" && Number.isFinite(number)
        ? { value: clamp(number, 0, max) }
        : { reason: `${label} takes a number from 0 to ${max}` }
    },
    onCommit: onChange,
    onMessage
  })
  return (
    <Hint label={label}>
      <Input
        aria-label={label}
        aria-invalid={field.error || undefined}
        inputMode="decimal"
        value={field.value}
        onChange={(event) => field.onChange(event.target.value)}
        onKeyDown={(event) => {
          field.onKeyDown(event)
          if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return
          event.preventDefault()
          field.reset()
          onMessage(undefined)
          const by = (event.key === "ArrowUp" ? step : -step) * (event.shiftKey ? 10 : 1)
          onChange(clamp(value + by, 0, max))
        }}
        onBlur={field.onBlur}
        className="h-7 min-w-0 px-1 text-center text-xs tabular-nums"
      />
    </Hint>
  )
}

/** Moves a pointer drag's position, as fractions of the box, until the button goes up. */
function drag(event: PointerEvent<HTMLDivElement>, apply: (x: number, y: number) => void) {
  const box = event.currentTarget.getBoundingClientRect()
  const move = (x: number, y: number) =>
    apply(clamp((x - box.left) / box.width, 0, 1), clamp((y - box.top) / box.height, 0, 1))
  move(event.clientX, event.clientY)
  event.currentTarget.setPointerCapture(event.pointerId)
  const target = event.currentTarget
  const onMove = (next: globalThis.PointerEvent) => move(next.clientX, next.clientY)
  const onUp = () => {
    target.removeEventListener("pointermove", onMove)
    target.removeEventListener("pointerup", onUp)
  }
  target.addEventListener("pointermove", onMove)
  target.addEventListener("pointerup", onUp)
}

/** The arrow keys' step, ten with Shift, as every field steps. */
const keyStep = (event: KeyboardEvent) => (event.shiftKey ? 10 : 1)

/** The square: a slider on two axes, dragged or moved with the arrow keys. */
function Strip2d({
  label,
  valueText,
  x,
  y,
  background,
  onMove,
  onKey
}: {
  label: string
  valueText: string
  x: number
  y: number
  background: string
  onMove: (x: number, y: number) => void
  onKey: (dx: number, dy: number) => void
}) {
  return (
    <div
      role="slider"
      aria-label={label}
      aria-valuetext={valueText}
      aria-valuenow={Math.round(x * 100)}
      tabIndex={0}
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
        onKey(move[0] * keyStep(event), move[1] * keyStep(event))
      }}
      onPointerDown={(event) => drag(event, onMove)}
      className="relative h-36 cursor-crosshair touch-none rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
      style={{ background }}
    >
      <span
        className="pointer-events-none absolute size-3 -translate-1/2 rounded-full border-2 border-white shadow"
        style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
      />
    </div>
  )
}

/** A strip: hue or alpha, dragged or stepped with the arrow keys. */
function Strip({
  label,
  value,
  max,
  unit,
  background,
  checker = false,
  onChange
}: {
  label: string
  value: number
  max: number
  unit: string
  background: string
  checker?: boolean
  onChange: (value: number) => void
}) {
  return (
    <div
      role="slider"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.round(value)}
      aria-valuetext={`${Math.round(value)}${unit}`}
      tabIndex={0}
      onKeyDown={(event) => {
        const direction = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 }[event.key]
        if (direction === undefined) return
        event.preventDefault()
        onChange(clamp(value + direction * keyStep(event), 0, max))
      }}
      onPointerDown={(event) => drag(event, (x) => onChange(x * max))}
      className="relative h-3 cursor-ew-resize touch-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
      style={{
        background: checker
          ? `${background}, repeating-conic-gradient(#ccc 0 25%, #fff 0 50%) 0 0 / 6px 6px`
          : background
      }}
    >
      <span
        className="pointer-events-none absolute top-1/2 size-3.5 -translate-1/2 rounded-full border-2 border-white shadow"
        style={{ left: `${(value / max) * 100}%` }}
      />
    </div>
  )
}

/**
 * A style's color: a token as a chip, or a plain color in short form with its status mark; then its alpha as its own %
 * field. The field types like a text field with the chip in it: click beside the chip to type a hex or a token's name,
 * which replaces it, and Backspace or the chip's × removes it. The chip or swatch opens the picker, on Tokens for a
 * token and Custom for a value. Custom edits the layer's color live, as a plain
 * value, and offers the nearest token in one click. A project that takes tokens only refuses plain colors: Custom only
 * offers the nearest token, and a plain color already there shows in the error color with the nearest token under it,
 * until it's allowed here.
 */
export function ColorInput({
  label,
  value,
  alpha,
  onChange,
  tokensOnly = false,
  allowed,
  onAllow,
  used = [],
  open: openAtStart = false,
  tab: tabAtStart,
  model
}: {
  label: string
  value: string | undefined
  alpha: number | undefined
  onChange: (value: string | undefined, alpha: number | undefined) => void
  /** The project's Tokens only setting. */
  tokensOnly?: boolean
  /** Why this plain color is allowed here as an exception, kept with the value; set, it fills the mark. */
  allowed?: string
  onAllow?: (reason: string | undefined) => void
  /** Colors the design already uses, offered at the bottom of Custom. */
  used?: string[]
  open?: boolean
  /** The tab it opens on at first, for a story; afterwards it opens on the one for the color's form. */
  tab?: "tokens" | "custom"
  model?: ColorModel
}) {
  const [open, setOpen] = useState(openAtStart)
  const current = colorTokens.find((token) => token.name === value)
  const plain = isPlainColor(value)
  const [tab, setTab] = useState<"tokens" | "custom">(tabAtStart ?? (plain ? "custom" : "tokens"))
  // Custom works from the layer's color, or the token's, and Tokens only keeps what's picked here until it's used.
  const [custom, setCustom] = useState(() => (plain ? value : (current?.hex ?? "#3b82f6")))
  // The editor starts again from a color picked from In this design.
  const [round, setRound] = useState(0)
  const nearest = nearestToken(custom)
  const nearestToValue = plain ? nearestToken(value) : undefined
  const [typedAlpha, setTypedAlpha] = useState<string>()
  const choose = (next: string) => {
    onChange(next, alpha)
    setOpen(false)
  }
  const pick = (next: string, nextAlpha: number | undefined) => {
    setCustom(next)
    if (!tokensOnly) onChange(next, nextAlpha)
  }
  // Tokens only refuses a plain color unless it's allowed here as an exception.
  const refused = plain && tokensOnly && allowed === undefined
  const swatch = plain ? value : current?.hex
  // The field types like a text field with the chip in it: typing replaces the token, and Backspace removes it.
  const [typed, setTyped] = useState<string>()
  const [focused, setFocused] = useState(false)
  const [message, setMessage] = useState<FieldMessage>()
  const input = useRef<HTMLInputElement>(null)
  const showChip = current !== undefined && typed === undefined
  const error = message?.tone === "error"
  const shown = plain ? shortForm(value) : ""
  let currentText = "none"
  if (current) currentText = current.name
  else if (plain) currentText = shown
  /** What's typed, checked before it's stored: a token's name, or a color CSS takes (`CSS.supports`) as hex or OKLCH. */
  const read = (text: string): { value: string | undefined; alpha: number | undefined } | { reason: string } => {
    const trimmed = text.trim()
    if (trimmed === "") return { value: current ? value : undefined, alpha }
    const token = colorTokens.find((other) => other.name === trimmed.toLowerCase())
    if (token) return { value: token.name, alpha }
    const candidate = /^[\da-f]+$/i.test(trimmed) ? `#${trimmed}` : trimmed
    const color = CSS.supports("color", candidate) ? parseColor(candidate) : undefined
    if (!color) return { reason: "Type a color, such as 2F6FED, or a token's name" }
    if (tokensOnly) return { reason: `Not a token. Nearest: ${nearestToken(candidate)?.token.name}` }
    const opaque = { ...color, a: 1 }
    return {
      value: candidate.startsWith("oklch") ? formatOklch(opaque) : formatHex(opaque),
      alpha: color.a < 1 ? Math.round(color.a * 100) : alpha
    }
  }
  const commit = (leaving: boolean): boolean => {
    if (typed === undefined) return true
    const outcome = read(typed)
    if ("reason" in outcome && !leaving) {
      setMessage({ tone: "error", text: outcome.reason })
      return false
    }
    if ("reason" in outcome) {
      setMessage({ tone: "note", text: `${label} is back to ${currentText}. ${outcome.reason}.` })
    } else {
      if (outcome.value !== value || outcome.alpha !== alpha) onChange(outcome.value, outcome.alpha)
      setMessage(undefined)
    }
    setTyped(undefined)
    return true
  }
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        <Popover
          open={open}
          onOpenChange={(next) => {
            setOpen(next)
            if (next) setTab(plain ? "custom" : "tokens")
          }}
        >
          <div
            className={`group/color flex h-7 min-w-0 flex-1 items-center gap-1 rounded-md border bg-transparent pl-1 text-xs focus-within:ring-2 dark:bg-input/30 ${error || refused ? "border-destructive focus-within:ring-destructive/40" : "focus-within:ring-ring"}`}
          >
            {showChip ? (
              // A token is a chip on a tinted background, as Figma UI3's variable pill is: clicking it opens the
              // picker, and its × takes the token off.
              <span className="flex min-w-0 shrink items-center rounded-sm bg-accent">
                <PopoverTrigger
                  aria-label={`${label}: ${current.name}`}
                  onKeyDown={(event) => {
                    if (event.key.length === 1 && event.key !== " " && !event.ctrlKey && !event.metaKey) {
                      event.preventDefault()
                      setTyped(event.key)
                      input.current?.focus()
                    } else if (event.key === "Backspace" || event.key === "Delete") {
                      event.preventDefault()
                      onChange(undefined, alpha)
                      input.current?.focus()
                    }
                  }}
                  className="flex min-w-0 items-center gap-1.5 rounded-sm px-1 py-0.5 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Checker hex={current.hex} alpha={alpha} />
                  <span className="truncate font-mono">{current.name}</span>
                </PopoverTrigger>
                <button
                  type="button"
                  aria-label={`Remove ${current.name} from ${label}`}
                  onClick={() => {
                    onChange(undefined, alpha)
                    input.current?.focus()
                  }}
                  className="mr-0.5 hidden size-4 shrink-0 place-items-center rounded-sm text-muted-foreground outline-none group-hover/color:grid hover:bg-background/60 hover:text-foreground focus-visible:grid focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X className="size-3" />
                </button>
              </span>
            ) : (
              <PopoverTrigger
                aria-label={`${label} picker`}
                className="grid size-5 shrink-0 place-items-center rounded-sm outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
              >
                {swatch ? (
                  <Checker hex={swatch} alpha={alpha} />
                ) : (
                  <span className="block size-3.5 rounded-sm border border-dashed border-muted-foreground/60" />
                )}
              </PopoverTrigger>
            )}
            {/* Always there, after the chip or swatch: click beside the chip to type, and Backspace removes it. */}
            <input
              ref={input}
              aria-label={label}
              aria-invalid={error || refused || undefined}
              spellCheck={false}
              placeholder={showChip ? "" : "None"}
              value={typed ?? shown}
              onFocus={() => {
                setFocused(true)
                if (message?.tone === "note") setMessage(undefined)
                // An OKLCH color shows short at rest; typing works on the whole of it.
                if (plain && value.startsWith("oklch")) setTyped(value)
              }}
              onChange={(event) => setTyped(event.target.value)}
              onKeyDown={(event) => {
                if (showChip && event.currentTarget.value === "" && ["Backspace", "Delete"].includes(event.key)) {
                  event.preventDefault()
                  onChange(undefined, alpha)
                }
                if (event.key === "Enter" && commit(false)) event.currentTarget.blur()
                if (event.key === "Escape" && typed !== undefined) {
                  setTyped(undefined)
                  setMessage(error ? { tone: "note", text: `${label} is back to ${currentText}.` } : undefined)
                }
              }}
              onBlur={() => {
                setFocused(false)
                commit(true)
              }}
              className={`w-0 flex-1 bg-transparent font-mono outline-none placeholder:font-sans placeholder:text-muted-foreground ${showChip ? "min-w-1" : "min-w-8"} ${refused ? "text-destructive" : ""} ${focused ? "" : "truncate"}`}
            />
            {error && <CircleAlert aria-hidden className="mr-1 size-3.5 shrink-0 text-destructive" />}
          </div>
          <PopoverContent className="w-64 gap-0 p-0" align="start">
            <Tabs value={tab} onValueChange={(next) => setTab(next as "tokens" | "custom")}>
              <TabsList className="m-2 mb-0 w-[calc(100%-1rem)]">
                <TabsTrigger value="tokens" className="text-xs">
                  Tokens
                </TabsTrigger>
                <TabsTrigger value="custom" className="text-xs">
                  Custom
                </TabsTrigger>
              </TabsList>
              <TabsContent value="tokens" className="max-h-64 overflow-y-auto p-1">
                {colorTokens.map((token) => (
                  <button
                    key={token.name}
                    type="button"
                    onClick={() => choose(token.name)}
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-accent"
                  >
                    <Checker hex={token.hex} />
                    <span className="min-w-0 flex-1 truncate font-mono">{token.name}</span>
                    {token.name === value && <Check className="size-3.5" />}
                  </button>
                ))}
              </TabsContent>
              <TabsContent value="custom" className="flex flex-col gap-3 p-2">
                <ColorEditor key={round} value={custom} alpha={alpha} model={model} onChange={pick} />
                {nearest && (
                  <div className="flex flex-col gap-2 rounded-md border p-2">
                    <div className="flex items-center gap-2">
                      <span className="flex -space-x-1">
                        <Checker hex={custom} className="size-5 rounded-full ring-2 ring-popover" />
                        <Checker hex={nearest.token.hex} className="size-5 ring-2 ring-popover" />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-xs">
                        Nearest token <span className="font-mono">{nearest.token.name}</span>
                      </span>
                      <span className="text-[11px] text-muted-foreground">{closeness(nearest.distance)}</span>
                    </div>
                    {tokensOnly && (
                      <p className="text-[11px] text-muted-foreground">
                        This project takes tokens only, so a color is set by its nearest token.
                      </p>
                    )}
                    <Button
                      size="sm"
                      variant={tokensOnly ? "default" : "outline"}
                      className="h-7 text-xs"
                      onClick={() => choose(nearest.token.name)}
                    >
                      Use {nearest.token.name}
                    </Button>
                  </div>
                )}
                {used.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <p className="text-[11px] text-muted-foreground">In this design</p>
                    <div className="flex flex-wrap gap-1">
                      {used.map((color) => (
                        <Hint key={color} label={color}>
                          <button
                            type="button"
                            aria-label={`Use ${color}`}
                            onClick={() => {
                              pick(color, alpha)
                              setRound(round + 1)
                            }}
                            className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <Checker hex={color} className="size-5 rounded-full" />
                          </button>
                        </Hint>
                      ))}
                    </div>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </PopoverContent>
        </Popover>
        {plain && nearestToValue && (
          <OffSystemMark
            label={label}
            description={`${value} isn't one of the project's tokens. It stays the same in every theme.`}
            nearest={{ name: nearestToValue.token.name, preview: <Checker hex={nearestToValue.token.hex} /> }}
            isTaken={(name) => colorTokens.some((token) => token.name === name)}
            allowed={allowed}
            onUse={() => onChange(nearestToValue.token.name, alpha)}
            onCreate={(name) => {
              colorTokens.push({ name, hex: formatHex({ ...parseColor(value)!, a: 1 }) })
              onChange(name, alpha)
            }}
            onAllow={(next) => onAllow?.(next)}
          />
        )}
        <Hint
          label={`${label} opacity`}
          detail={plain ? "Part of the color, written as #2f6fed80" : "Written after the token, as bg-primary/50"}
        >
          <div className="flex h-7 w-14 shrink-0 items-center rounded-md border bg-transparent pr-1.5 focus-within:ring-2 focus-within:ring-ring dark:bg-input/30">
            <input
              aria-label={`${label} opacity`}
              inputMode="numeric"
              placeholder="100"
              disabled={!value}
              value={typedAlpha ?? (alpha === undefined ? "" : String(alpha))}
              onChange={(event) => setTypedAlpha(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
              onBlur={() => {
                if (typedAlpha === undefined) return
                const number = Number(typedAlpha)
                const next = typedAlpha === "" || number >= 100 ? undefined : Math.max(0, Math.round(number))
                setTypedAlpha(undefined)
                onChange(value, next)
              }}
              className="w-full min-w-0 bg-transparent px-1.5 text-right text-xs tabular-nums outline-none placeholder:text-muted-foreground"
            />
            <span className="text-xs text-muted-foreground">%</span>
          </div>
        </Hint>
      </div>
      {message && (
        <p
          role={error ? "alert" : "status"}
          className={`text-[11px] leading-snug ${error ? "text-destructive" : "text-muted-foreground"}`}
        >
          {message.text}
        </p>
      )}
      {!message && refused && nearestToValue && (
        <p role="alert" className="flex flex-wrap items-center gap-x-1 text-[11px] leading-snug text-destructive">
          Not a token. Nearest:
          <button
            type="button"
            onClick={() => onChange(nearestToValue.token.name, alpha)}
            className="inline-flex items-center gap-1 rounded-sm font-medium text-foreground underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <Checker hex={nearestToValue.token.hex} className="size-2.5" />
            {nearestToValue.token.name}
          </button>
        </p>
      )}
    </div>
  )
}

/**
 * The status slot's mark for a value off the token system, or refused by Tokens only: hollow, or filled once it's
 * allowed here, with the reason in its hint. Its menu has the nearest token, Create token (named here, with this value)
 * and Allow here, which asks why and keeps the reason with the value. Any field's value of its own uses it: a color, a
 * radius, a blur.
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
  onCreate: (name: string) => void
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
          className={`grid shrink-0 place-items-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-popup-open:bg-accent ${compact ? "size-6" : "size-7"}`}
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
        {name === undefined ? (
          <MenuButton onClick={() => setName("")}>Create token…</MenuButton>
        ) : (
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
            <Input
              ref={(input) => input?.focus()}
              aria-label="Why it's allowed here"
              placeholder="Photo backdrop"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="h-7 text-xs"
            />
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

/** How close a suggested token is, in words. */
function closeness(distance: number): string {
  if (distance < sameColorDistance) return "Same color"
  if (distance < sameColorDistance * 4) return "Close"
  return "Nearest"
}

/** A swatch over a checkerboard, so a translucent color shows as one. */
export function Checker({ hex, alpha, className = "size-3.5" }: { hex: string; alpha?: number; className?: string }) {
  return (
    <span
      className={`${className} relative inline-block shrink-0 overflow-hidden rounded-sm`}
      style={{ background: "repeating-conic-gradient(#ccc 0 25%, #fff 0 50%) 0 0 / 6px 6px" }}
    >
      <span className="absolute inset-0" style={{ background: hex, opacity: (alpha ?? 100) / 100 }} />
    </span>
  )
}

/** The Tokens panel's color token, its value edited with the same picker and written on Save. */
export function TokenColorEditor({ token: start }: { token: ColorToken }) {
  const [value, setValue] = useState(start.hex)
  const [saved, setSaved] = useState(start.hex)
  // Cancel puts the editor back on the saved value, so it starts again from there.
  const [round, setRound] = useState(0)
  return (
    <div className="flex w-64 flex-col gap-3 rounded-lg border bg-popover p-3 text-popover-foreground shadow-md">
      <div className="flex items-center gap-2">
        <Checker hex={value} className="size-8" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-xs">{start.name}</p>
          <p className="font-mono text-[11px] text-muted-foreground">{value}</p>
        </div>
      </div>
      <ColorEditor key={round} value={value} alpha={undefined} onChange={(next) => setValue(next)} />
      <div className="flex justify-end gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          disabled={value === saved}
          onClick={() => {
            setValue(saved)
            setRound(round + 1)
          }}
        >
          Cancel
        </Button>
        <Button size="sm" className="h-7 text-xs" disabled={value === saved} onClick={() => setSaved(value)}>
          Save
        </Button>
      </div>
    </div>
  )
}
