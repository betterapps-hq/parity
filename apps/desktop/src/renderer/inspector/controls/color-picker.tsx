/* oxlint-disable jsx-a11y/prefer-tag-over-role -- the saturation and brightness square is a slider on two axes, which no input element is; the hue and alpha strips beside it are drawn and keyed the same way */
import { Button, Input, Tabs, TabsContent, TabsList, TabsTrigger } from "@buildkitgg/shadcn-baseui-kit"
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
import { Pipette } from "lucide-react"
import { type KeyboardEvent, type PointerEvent, type ReactNode, useState } from "react"
import { AppSelect } from "../../chrome/AppSelect.tsx"
import { Hint } from "../../chrome/Hint.tsx"
import { GroupLabel } from "../../chrome/PanelSection.tsx"
import { swatch } from "../../chrome/token-previews.tsx"
import { clamp, mixColor, stepCount } from "./css-values.ts"
import {
  arrowMoves,
  drag,
  type Message,
  MessageLine,
  PercentField,
  type Reading,
  type SharedLine,
  type ScrubKeys,
  stepToken,
  ThemeMark,
  TokenMenu,
  tokenNamed,
  useTokens,
  useTyped,
  ValueField
} from "./field-parts.tsx"
import { overChecker as drawnOverChecker } from "./list-parts.tsx"
import { type ColorToken, colorToken } from "./tokens.ts"
import { optionNamed } from "./typing.ts"

/*
 * The color field and its picker, as PAR-652's design-options-values.md (Color) and design-options-fields.md specify
 * them, on the shared field. At rest, a token is a pill; a plain color is its value in short form, with no mark: its
 * Tokens tab offers the nearest token first. The picker's Custom tab edits the color live: a square, hue and alpha strips, a
 * model menu, the eyedropper, the design's colors and the nearest token. The Tokens panel's picker edits a token's own
 * value.
 */

/** A palette color's hue and shade, `blue` and 500 in `blue-500`; nothing for a semantic color, which has no shades. */
function shadeOf(name: string): { hue: string; shade: number } | undefined {
  const match = /^([a-z]+)-(50|[1-9]00|950)$/.exec(name)

  return match ? { hue: match[1]!, shade: Number(match[2]) } : undefined
}

/** Whether a style's color is a plain value (`#2563eb`, `oklch(…)`) rather than a token's name. */
const parsesAsColor = (value: string | undefined): value is string =>
  value !== undefined && parseColor(value) !== undefined

/** The token whose color looks closest to `value`, and how far off it is. */
export function nearestColorToken(
  value: string,
  tokens: readonly ColorToken[]
): { token: ColorToken; distance: number } | undefined {
  const color = parseColor(value)
  // A deprecated token isn't offered as the nearest: it's on its way out.
  const current = tokens.filter((token) => token.deprecated === undefined)
  const nearest = color && nearestColor(color, Object.fromEntries(current.map((token) => [token.name, token.hex])))
  const token = tokens.find((other) => other.name === nearest?.name)

  return nearest && token && { token, distance: nearest.distance }
}

/** A plain color in short form, as Figma shows it: `2F6FED` for hex, `oklch 62% .19 260` for OKLCH. */
export function shortForm(value: string): string {
  if (value.startsWith("#")) {
    return value.slice(1, 7).toUpperCase()
  }

  const { l, c, h } = rgbaToOklch(parseColor(value)!)

  return `oklch ${Math.round(l * 100)}% ${c.toFixed(2).replace(/^0/, "")} ${Math.round(h)}`
}

type ColorModel = "hex" | "rgb" | "hsl" | "hsb" | "oklch"

/** The picker's tabs: the project's color tokens, and a color of its own. */
const pickerTabs = ["tokens", "custom"] as const

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
  // What the model's fields say, on one line under their row, as any row of fields does.
  const [message, setMessage] = useState<Message>()
  const line: SharedLine = { message, onMessage: setMessage }
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
    if (!("EyeDropper" in window)) {
      return
    }

    // SAFETY: `window.EyeDropper` is Chromium's EyeDropper API, which TypeScript's DOM types leave out.
    const EyeDropper = window.EyeDropper as new () => { open: () => Promise<{ sRGBHex: string }> }
    const picked = await new EyeDropper().open().catch(() => undefined)
    const rgba = picked && parseColor(picked.sRGBHex)

    if (rgba) {
      fromRgba(rgba)
    }
  }

  const rgb = rgbaToRgb255(color)
  const hsl = rgbaToHsl(color)
  const oklch = rgbaToOklch(color)

  const fields: Record<ColorModel, ReactNode> = {
    hex: <HexField key="hex" color={color} onChange={fromRgba} line={line} />,
    rgb: (["r", "g", "b"] as const).map((channel) => (
      <ChannelField
        line={line}
        key={channel}
        label={{ r: "Red", g: "Green", b: "Blue" }[channel]}
        value={rgb[channel]}
        max={255}
        onChange={(next) => fromRgba(rgb255ToRgba({ ...rgb, [channel]: next }))}
      />
    )),
    hsl: (["h", "s", "l"] as const).map((channel) => (
      <ChannelField
        line={line}
        key={channel}
        label={{ h: "Hue", s: "Saturation", l: "Lightness" }[channel]}
        value={channel === "h" ? hsb.h : hsl[channel]}
        max={channel === "h" ? 359 : 100}
        onChange={(next) => {
          if (channel === "h") {
            update({ ...hsb, h: next })
          } else {
            fromRgba(hslToRgba({ ...hsl, h: hsb.h, [channel]: next }))
          }
        }}
      />
    )),
    hsb: (["h", "s", "b"] as const).map((channel) => (
      <ChannelField
        line={line}
        key={channel}
        label={{ h: "Hue", s: "Saturation", b: "Brightness" }[channel]}
        value={hsb[channel]}
        max={channel === "h" ? 359 : 100}
        onChange={(next) => update({ ...hsb, [channel]: next })}
      />
    )),
    oklch: [
      <ChannelField
        line={line}
        key="l"
        label="Lightness"
        value={oklch.l * 100}
        max={100}
        onChange={(next) => fromRgba(oklchToRgba({ ...oklch, l: next / 100 }))}
      />,
      <ChannelField
        line={line}
        key="c"
        label="Chroma"
        value={oklch.c}
        max={0.4}
        step={0.01}
        places={3}
        onChange={(next) => fromRgba(oklchToRgba({ ...oklch, c: next }))}
      />,
      <ChannelField
        line={line}
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
            overChecker
            background={`linear-gradient(to right, transparent, ${solid})`}
            onChange={(next) => update(hsb, Math.round(next) >= 100 ? undefined : Math.round(next))}
          />
        </div>
      </div>
      <div className="flex items-center gap-1">
        <AppSelect
          variant="panel"
          aria-label="Color model"
          className="w-[4.5rem] shrink-0 px-2"
          items={models}
          value={model}
          onValueChange={(next) => {
            const picked = models.find((option) => option.value === next)

            if (!picked) {
              return
            }

            setModel(picked.value)
            // A plain color is written in the model it's picked in.
            update(hsb, alpha, picked.value)
          }}
        />
        <div className="grid min-w-0 flex-1 auto-cols-fr grid-flow-col gap-1">{fields[model]}</div>
      </div>
      <MessageLine message={message} />
    </div>
  )
}

/**
 * A hex field: `2F6FED` with or without `#`, of 3, 6 or 8 digits; an `oklch()` pasted in is read too. What's typed is
 * checked as CSS checks a color (`CSS.supports`) and must read as hex or `oklch()`.
 */
function HexField({ color, onChange, line }: { color: Rgba; onChange: (color: Rgba) => void; line: SharedLine }) {
  const typed = useTyped<Rgba>({
    label: "Hex",
    shown: formatHex(color).slice(1).toUpperCase(),
    read: (text) => {
      const trimmed = text.trim()
      const candidate = /^[\da-f]+$/i.test(trimmed) ? `#${trimmed}` : trimmed
      const read = CSS.supports("color", candidate) ? parseColor(candidate) : undefined

      return read ? { value: read } : { reason: "Enter a hex color, such as 2F6FED" }
    },
    onCommit: (read) => onChange({ ...read, a: 1 }),
    line
  })

  return (
    <Input
      aria-label="Hex"
      {...typed.input}
      aria-invalid={typed.error || undefined}
      className="h-7 px-2 font-mono text-xs"
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
  line
}: {
  label: string
  value: number
  max: number
  step?: number
  places?: number
  onChange: (value: number) => void
  line: SharedLine
}) {
  const typed = useTyped<number>({
    label,
    shown: places === 0 ? String(Math.round(value)) : value.toFixed(places).replace(/^0/, ""),
    read: (text) => {
      const number = Number(text)

      return text.trim() !== "" && Number.isFinite(number)
        ? { value: clamp(number, 0, max) }
        : { reason: `${label} goes from 0 to ${max}` }
    },
    onCommit: onChange,
    onStep: (up, shift) => onChange(clamp(value + step * stepCount(up, shift), 0, max)),
    line
  })

  return (
    <Hint label={label}>
      <Input
        aria-label={label}
        inputMode="decimal"
        {...typed.input}
        aria-invalid={typed.error || undefined}
        className="h-7 min-w-0 px-1 text-center text-xs tabular-nums"
      />
    </Hint>
  )
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
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(x * 100)}
      tabIndex={0}
      onKeyDown={(event) => {
        const move = arrowMoves.get(event.key)

        if (!move) {
          return
        }

        event.preventDefault()
        onKey(move[0] * keyStep(event), move[1] * keyStep(event))
      }}
      onPointerDown={(event: PointerEvent<HTMLDivElement>) =>
        drag(event, { move: (point) => onMove(point.x, point.y), press: true })
      }
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

/** A strip: hue or alpha, dragged or stepped with the arrow keys; alpha is drawn over the checkerboard. */
function Strip({
  label,
  value,
  max,
  unit,
  background,
  overChecker = false,
  onChange
}: {
  label: string
  value: number
  max: number
  unit: string
  background: string
  overChecker?: boolean
  onChange: (value: number) => void
}) {
  const style = overChecker ? drawnOverChecker(background) : { background }

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
        const move = arrowMoves.get(event.key)

        if (!move) {
          return
        }

        // Right and Up raise it, Left and Down lower it.
        event.preventDefault()
        onChange(clamp(value + (move[0] - move[1]) * keyStep(event), 0, max))
      }}
      onPointerDown={(event: PointerEvent<HTMLDivElement>) =>
        drag(event, { move: (point) => onChange(point.x * max), press: true })
      }
      className="relative h-3 cursor-ew-resize touch-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
      style={style}
    >
      <span
        className="pointer-events-none absolute top-1/2 size-3.5 -translate-1/2 rounded-full border-2 border-white shadow"
        style={{ left: `${(value / max) * 100}%` }}
      />
    </div>
  )
}

/** A color drawn at its alpha over the checkerboard, as the app's swatches are painted (chrome's `swatch()`). */
function ColorSwatch({
  color,
  alpha,
  className = "size-3.5 rounded-sm"
}: {
  color: string
  alpha?: number
  className?: string
}) {
  return <span aria-hidden className={`block shrink-0 ${className}`} style={swatch(mixColor(color, alpha))} />
}

/**
 * A style's color, on the shared field: a token as a chip, or a plain color in short form with its status mark; then
 * its alpha as its own % field. It types like a text field with the chip in it: typing a hex or a token's name beside
 * the chip, or on it, replaces it, and Backspace removes it. The swatch opens the picker, and so does the chip once the
 * field's focused, on Tokens for a token and Custom for a value. Custom edits the layer's color live, as a plain value, and offers the
 * nearest token in one click. A project that takes tokens only refuses plain colors: Custom only offers the nearest
 * token, and a plain color already there shows in the error color with the nearest token under it, until it's allowed
 * here.
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
  model,
  mixed = false,
  theme
}: {
  label: string
  value: string | undefined
  alpha: number | undefined
  onChange: (value: string | undefined, alpha: number | undefined) => void
  /** The selected layers have different colors here: it shows Mixed, and typing replaces every one. */
  mixed?: boolean
  /** Set for one theme: its name and the value it has there, shown as a mark with the value in its hint. */
  theme?: { name: string; value: string }
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
  const { tokens: colors, create } = useTokens("color")
  const [open, setOpen] = useState(openAtStart)
  const current = colors.find((token) => token.name === value)
  const plain = parsesAsColor(value)
  const [tab, setTab] = useState<"tokens" | "custom">(tabAtStart ?? (plain ? "custom" : "tokens"))
  // Custom works from the layer's color, or the token's.
  const [custom, setCustom] = useState(() => (plain ? value : (current?.hex ?? "#3b82f6")))
  // The editor starts again from a color picked from In this design.
  const [round, setRound] = useState(0)
  const nearest = nearestColorToken(custom, colors)
  const nearestToValue = plain ? nearestColorToken(value, colors) : undefined

  const replacedBy =
    current?.deprecated === undefined ? undefined : colors.find((each) => each.name === current.deprecated)

  const choose = (next: string) => {
    onChange(next, alpha)
    setOpen(false)
  }

  const pick = (next: string, nextAlpha: number | undefined) => {
    setCustom(next)
    onChange(next, nextAlpha)
  }

  // Tokens only refuses a plain color unless it's allowed here as an exception.
  const refused = plain && tokensOnly && allowed === undefined
  // A token's name the field holds: one of the project's, or one it no longer has, struck through.
  const chipName = value !== undefined && !plain ? value : undefined

  /** What's typed, checked before it's stored: a token's name, or a color CSS takes (`CSS.supports`) as hex or OKLCH. */
  const read = (text: string): Reading<{ value: string | undefined; alpha: number | undefined }> => {
    const trimmed = text.trim()

    if (trimmed === "") {
      return { value: { value: current ? value : undefined, alpha } }
    }

    const token = tokenNamed(colors, trimmed)

    if (token) {
      return { value: { value: token.name, alpha } }
    }

    const candidate = /^[\da-f]+$/i.test(trimmed) ? `#${trimmed}` : trimmed
    const color = CSS.supports("color", candidate) ? parseColor(candidate) : undefined

    if (!color) {
      return { reason: "Enter a color, such as 2F6FED, or a token's name" }
    }

    // Locked to tokens, the field's `locked` turns a value of its own away before it gets here, offering the nearest.
    const opaque = { ...color, a: 1 }

    return {
      value: {
        value: candidate.startsWith("oklch") ? formatOklch(opaque) : formatHex(opaque),
        alpha: color.a < 1 ? Math.round(color.a * 100) : alpha
      }
    }
  }

  // The swatch opens the picker where no chip shows, the token's color while its name is typed over; Mixed is split
  // diagonally, as Figma draws it.
  let shownSwatch = <span className="block size-3.5 rounded-sm border border-dashed border-muted-foreground/60" />
  const swatchColor = plain ? value : current?.hex

  if (swatchColor) {
    shownSwatch = <ColorSwatch color={swatchColor} alpha={alpha} />
  } else if (mixed) {
    shownSwatch = (
      <span
        className="block size-3.5 rounded-sm border"
        style={{ background: "linear-gradient(135deg, #2563eb 50%, #f54900 50%)" }}
      />
    )
  }

  // Up and Down step a palette color to the next shade of its hue (blue-500 to blue-600), Shift to its lightest or
  // darkest, keeping its alpha. A semantic color has no shades, so they open its list instead. A color of its own is on
  // no scale, so they leave it: the token nearest it is first in that list.
  const step = (up: boolean, { shift }: ScrubKeys) => {
    if (!current) {
      return
    }

    const hue = shadeOf(current.name)?.hue

    if (hue === undefined) {
      setTab("tokens")
      setOpen(true)

      return
    }

    const shades = colors
      .filter((other) => shadeOf(other.name)?.hue === hue)
      .toSorted((a, b) => shadeOf(a.name)!.shade - shadeOf(b.name)!.shade)

    onChange(stepToken(shades, current, up, shift).name, alpha)
  }

  const tokenMenu = (
    <TokenMenu
      label={label}
      tokens={colors}
      current={value}
      own={plain ? `${value.startsWith("#") ? "#" : ""}${shortForm(value)}` : undefined}
      nearest={nearestToValue?.token}
      same={nearestToValue !== undefined && nearestToValue.distance < sameColorDistance}
      replaced={current && replacedBy ? { name: current.name, by: replacedBy } : undefined}
      tokensOnly={tokensOnly}
      allowed={allowed}
      onAllow={
        onAllow &&
        ((reason) => {
          onAllow(reason)
          setOpen(false)
        })
      }
      onCreate={
        create && plain
          ? (name) => {
              create(colorToken(name, formatHex({ ...parseColor(value)!, a: 1 })))
              choose(name)
            }
          : undefined
      }
      onPick={(name) => {
        if (name) {
          choose(name)
        }
      }}
    />
  )

  // Locked to tokens, the picker is only the tokens: no tabs, and no Custom to make a color of its own in.
  const picker = tokensOnly ? (
    <div className="p-1">{tokenMenu}</div>
  ) : (
    <Tabs
      value={tab}
      onValueChange={(next) => {
        const picked = optionNamed(pickerTabs, next)

        if (picked) {
          setTab(picked)
        }
      }}
    >
      <TabsList className="m-2 mb-0 w-[calc(100%-1rem)]">
        <TabsTrigger value="tokens" className="text-xs">
          Tokens
        </TabsTrigger>
        <TabsTrigger value="custom" className="text-xs">
          Custom
        </TabsTrigger>
      </TabsList>
      <TabsContent value="tokens" className="p-1">
        {tokenMenu}
      </TabsContent>
      <TabsContent value="custom" className="flex flex-col gap-3 p-2">
        <ColorEditor key={round} value={custom} alpha={alpha} model={model} onChange={pick} />
        {/*
         * Any color goes here, as a token does; the nearest token is offered beside it, one click away. The two swatches
         * show how near it is, so nothing says it in words.
         */}
        {nearest && (
          <div className="flex items-center gap-2 rounded-md border p-2">
            <span className="flex shrink-0 -space-x-1">
              <ColorSwatch color={custom} className="size-5 rounded-full ring-2 ring-popover" />
              <ColorSwatch color={nearest.token.hex} className="size-5 rounded-sm ring-2 ring-popover" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-mono text-xs">{nearest.token.name}</span>
              <span className="text-2xs text-muted-foreground">Nearest token</span>
            </span>
            <Button
              size="sm"
              variant="outline"
              aria-label={`Use ${nearest.token.name}`}
              className="h-6 px-2 text-xs"
              onClick={() => choose(nearest.token.name)}
            >
              Use
            </Button>
          </div>
        )}
        {used.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <GroupLabel as="p">In this design</GroupLabel>
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
                    <ColorSwatch color={color} className="size-5 rounded-full" />
                  </button>
                </Hint>
              ))}
            </div>
          </div>
        )}
      </TabsContent>
    </Tabs>
  )

  return (
    // The alpha sits beside the color, and what either says goes on the line under both.
    <div className="grid grid-cols-[minmax(0,1fr)_3.5rem] gap-x-1">
      <ValueField
        label={label}
        shown={plain ? shortForm(value) : undefined}
        placeholder="None"
        mixed={mixed}
        chip={
          chipName === undefined
            ? undefined
            : {
                name: chipName,
                token: current,
                preview: current ? <ColorSwatch color={current.hex} alpha={alpha} /> : undefined,
                onRemove: () => onChange(undefined, alpha),
                onDetach: current ? () => onChange(current.hex, alpha) : undefined,
                onReplace: (replacement) => onChange(replacement, alpha)
              }
        }
        status={{ theme: theme ? <ThemeMark label={label} theme={theme} /> : undefined }}
        picker={{
          content: picker,
          swatch: shownSwatch,
          open,
          onOpenChange: (next) => {
            setOpen(next)

            if (next) {
              setTab(plain ? "custom" : "tokens")
            }
          }
        }}
        refused={
          refused && nearestToValue
            ? { nearest: nearestToValue.token, onUse: () => onChange(nearestToValue.token.name, alpha) }
            : undefined
        }
        locked={
          tokensOnly
            ? {
                tokens: colors,
                nearestTo: (text) => {
                  const candidate = /^[\da-f]+$/i.test(text) ? `#${text}` : text

                  return CSS.supports("color", candidate) ? nearestColorToken(candidate, colors)?.token : undefined
                }
              }
            : undefined
        }
        inputMode="text"
        inputClassName="font-mono placeholder:font-sans"
        // An OKLCH color shows short at rest; typing works on the whole of it.
        editText={plain && value.startsWith("oklch") ? value : undefined}
        read={read}
        onStep={step}
        onCommit={(next) => {
          if (next.value !== value || next.alpha !== alpha) {
            onChange(next.value, next.alpha)
          }
        }}
      />
      <PercentField
        label={`${label} opacity`}
        value={alpha}
        places={0}
        disabled={!value}
        hint={{
          label: `${label} opacity`,
          detail: plain ? "Part of the color, written as #2f6fed80" : "Written after the token, as bg-primary/50"
        }}
        rowClassName="col-start-2 row-start-1"
        // Opaque is unset, so 100% writes nothing after the color.
        onChange={(next) => onChange(value, next === undefined || next >= 100 ? undefined : next)}
      />
    </div>
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
        <ColorSwatch color={value} className="size-8 rounded-sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-xs">{start.name}</p>
          <p className="font-mono text-2xs text-muted-foreground">{value}</p>
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
