/* oxlint-disable jsx-a11y/prefer-tag-over-role -- the saturation and brightness square is a slider on two axes, which no input element is; the hue strip beside it is drawn and keyed the same way */
import {
  Button,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from "@buildkitgg/shadcn-baseui-kit"
import {
  formatHex,
  type Hsb,
  hsbToRgba,
  nearestColor,
  parseColor,
  parseHex,
  rgbaToHsb,
  sameColorDistance
} from "@parity-app/tokens"
import { Check, ChevronsUpDown, Pipette } from "lucide-react"
import { type PointerEvent, useState } from "react"
import { Hint } from "../../chrome/Hint.tsx"
import { type ColorToken, colorTokens } from "./data.ts"

/*
 * The color picker: a saturation and brightness square, a hue strip, hex and HSB typed, and the eyedropper. A style
 * names a token, so a color picked freely is answered with the token nearest it; the Tokens panel's picker edits the
 * token's own value instead.
 */

/** A hex color as the picker's fields show it, in whole numbers. */
function hexToHsb(hex: string): Hsb {
  const { h, s, b } = rgbaToHsb(parseHex(hex) ?? { r: 0, g: 0, b: 0, a: 1 })
  return { h: Math.round(h) % 360, s: Math.round(s), b: Math.round(b) }
}

const hsbToHex = (hsb: Hsb) => formatHex(hsbToRgba(hsb))

/** The stand-in token whose color looks closest to `hex`, and how far off it is. */
function nearestToken(value: string): { token: ColorToken; distance: number } | undefined {
  const color = parseColor(value)
  const nearest = color && nearestColor(color, Object.fromEntries(colorTokens.map((token) => [token.name, token.hex])))
  const token = colorTokens.find((other) => other.name === nearest?.name)
  return nearest && token && { token, distance: nearest.distance }
}

/** The square, strip, fields and eyedropper, on a color given as hex. */
export function ColorEditor({ hex, onChange }: { hex: string; onChange: (hex: string) => void }) {
  const [hsb, setHsb] = useState(() => hexToHsb(hex))
  const [typed, setTyped] = useState(hex)
  const update = (next: Hsb) => {
    setHsb(next)
    const value = hsbToHex(next)
    setTyped(value)
    onChange(value)
  }
  const drag = (event: PointerEvent<HTMLDivElement>, apply: (x: number, y: number) => void) => {
    const box = event.currentTarget.getBoundingClientRect()
    const move = (x: number, y: number) =>
      apply(Math.min(1, Math.max(0, (x - box.left) / box.width)), Math.min(1, Math.max(0, (y - box.top) / box.height)))
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
  const eyedropper = "EyeDropper" in window
  const pickFromScreen = async () => {
    const EyeDropper = (window as unknown as { EyeDropper: new () => { open: () => Promise<{ sRGBHex: string }> } })
      .EyeDropper
    const picked = await new EyeDropper().open().catch(() => undefined)
    if (picked) update(hexToHsb(picked.sRGBHex))
  }
  return (
    <div className="flex flex-col gap-2">
      <div
        role="slider"
        aria-label="Saturation and brightness"
        aria-valuetext={`Saturation ${hsb.s}%, brightness ${hsb.b}%`}
        aria-valuenow={hsb.s}
        tabIndex={0}
        onKeyDown={(event) => {
          const step = event.shiftKey ? 10 : 1
          const keys: Record<string, Partial<Hsb>> = {
            ArrowLeft: { s: Math.max(0, hsb.s - step) },
            ArrowRight: { s: Math.min(100, hsb.s + step) },
            ArrowUp: { b: Math.min(100, hsb.b + step) },
            ArrowDown: { b: Math.max(0, hsb.b - step) }
          }
          const change = keys[event.key]
          if (!change) return
          event.preventDefault()
          update({ ...hsb, ...change })
        }}
        onPointerDown={(event) =>
          drag(event, (x, y) => update({ ...hsb, s: Math.round(x * 100), b: Math.round((1 - y) * 100) }))
        }
        className="relative h-36 cursor-crosshair touch-none rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
        style={{
          background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hsb.h} 100% 50%))`
        }}
      >
        <span
          className="pointer-events-none absolute size-3 -translate-1/2 rounded-full border-2 border-white shadow"
          style={{ left: `${hsb.s}%`, top: `${100 - hsb.b}%` }}
        />
      </div>
      <div className="flex items-center gap-2">
        <Hint label={eyedropper ? "Pick a color from the screen" : "The eyedropper needs Parity's own window"}>
          <Button
            variant="outline"
            size="icon-sm"
            className="size-7"
            aria-label="Pick a color from the screen"
            disabled={!eyedropper}
            onClick={pickFromScreen}
          >
            <Pipette />
          </Button>
        </Hint>
        <div
          role="slider"
          aria-label="Hue"
          aria-valuemin={0}
          aria-valuemax={359}
          aria-valuenow={hsb.h}
          tabIndex={0}
          onKeyDown={(event) => {
            const step = event.shiftKey ? 10 : 1
            if (event.key === "ArrowLeft" || event.key === "ArrowDown")
              update({ ...hsb, h: (hsb.h - step + 360) % 360 })
            else if (event.key === "ArrowRight" || event.key === "ArrowUp") update({ ...hsb, h: (hsb.h + step) % 360 })
            else return
            event.preventDefault()
          }}
          onPointerDown={(event) => drag(event, (x) => update({ ...hsb, h: Math.round(x * 359) }))}
          className="relative h-3 flex-1 cursor-ew-resize touch-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
          style={{
            background: "linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)"
          }}
        >
          <span
            className="pointer-events-none absolute top-1/2 size-3.5 -translate-1/2 rounded-full border-2 border-white shadow"
            style={{ left: `${(hsb.h / 359) * 100}%` }}
          />
        </div>
      </div>
      <div className="grid grid-cols-[1fr_repeat(3,2.5rem)] gap-1">
        <Input
          aria-label="Hex"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
          onBlur={() => {
            const value = typed.startsWith("#") ? typed : `#${typed}`
            if (parseHex(value)) update(hexToHsb(value))
            else setTyped(hsbToHex(hsb))
          }}
          className="h-7 px-2 font-mono text-xs"
        />
        {(["h", "s", "b"] as const).map((channel) => (
          <Input
            key={channel}
            aria-label={{ h: "Hue", s: "Saturation", b: "Brightness" }[channel]}
            inputMode="numeric"
            value={hsb[channel]}
            onChange={(event) => {
              const number = Number(event.target.value)
              if (!Number.isFinite(number)) return
              const max = channel === "h" ? 359 : 100
              update({ ...hsb, [channel]: Math.min(max, Math.max(0, Math.round(number))) })
            }}
            className="h-7 px-1.5 text-center text-xs tabular-nums"
          />
        ))}
      </div>
      <div className="grid grid-cols-[1fr_repeat(3,2.5rem)] gap-1 text-center text-[10px] text-muted-foreground">
        <span className="text-left">Hex</span>
        <span>H</span>
        <span>S</span>
        <span>B</span>
      </div>
    </div>
  )
}

/** Whether a style's color is a plain value (`#2563eb`, `oklch(…)`) rather than a token's name. */
export const isPlainColor = (value: string | undefined): value is string =>
  value !== undefined && parseColor(value) !== undefined

/**
 * A style's color: a token by name, or a plain color marked as not a token with the nearest token one click away. The
 * opacity after it is written with a token (`primary/50`) or into a plain color's own alpha. The picker has the
 * project's color tokens and a Custom tab, whose color can be used as it is or answered with the nearest token. A
 * project that takes tokens only refuses plain colors: the mark says so, and Custom offers only the token.
 */
export function ColorInput({
  label,
  value,
  alpha,
  onChange,
  tokensOnly = false,
  used = [],
  open: openAtStart = false,
  tab: tabAtStart = "tokens"
}: {
  label: string
  value: string | undefined
  alpha: number | undefined
  onChange: (value: string | undefined, alpha: number | undefined) => void
  /** The project's Tokens only setting. */
  tokensOnly?: boolean
  /** Colors the design already uses, offered at the bottom of Custom. */
  used?: string[]
  open?: boolean
  tab?: "tokens" | "custom"
}) {
  const [open, setOpen] = useState(openAtStart)
  const [tab, setTab] = useState(tabAtStart)
  const current = colorTokens.find((token) => token.name === value)
  const plain = isPlainColor(value)
  const swatch = plain ? value : current?.hex
  // Custom works in hex; a plain color written as oklch() starts it from the same color.
  const [custom, setCustom] = useState(() => (plain ? formatHex(parseColor(value)!) : (current?.hex ?? "#3b82f6")))
  // The editor starts again from a color picked from Used in this design.
  const [round, setRound] = useState(0)
  const nearest = nearestToken(custom)
  const nearestToValue = plain ? nearestToken(value) : undefined
  const [typedAlpha, setTypedAlpha] = useState(alpha === undefined ? "" : String(alpha))
  const choose = (next: string) => {
    onChange(next, alpha)
    setOpen(false)
  }
  const same = nearest !== undefined && nearest.distance < sameColorDistance
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            render={
              <Button
                variant="outline"
                size="sm"
                aria-label={`${label}: ${value ?? "none"}${plain ? ", not a token" : ""}`}
                aria-invalid={plain && tokensOnly}
                className="h-7 min-w-0 flex-1 justify-between gap-1.5 px-2 text-xs font-normal"
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  {swatch && (
                    <Checker hex={swatch} alpha={alpha} className={plain ? "size-3.5 rounded-full" : undefined} />
                  )}
                  <span className={`truncate font-mono ${value ? "" : "text-muted-foreground"}`}>
                    {value ?? "None"}
                  </span>
                </span>
                <ChevronsUpDown className="size-3 opacity-50" />
              </Button>
            }
          />
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
                <ColorEditor key={round} hex={custom} onChange={setCustom} />
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
                    <div className="flex gap-1">
                      {!tokensOnly && !same && (
                        <Button size="sm" className="h-7 flex-1 text-xs" onClick={() => choose(custom)}>
                          Use {custom}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant={tokensOnly || same ? "default" : "outline"}
                        className="h-7 min-w-0 flex-1 text-xs"
                        onClick={() => choose(nearest.token.name)}
                      >
                        <span className="truncate">Use {nearest.token.name}</span>
                      </Button>
                    </div>
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
                            aria-label={`Start from ${color}`}
                            onClick={() => {
                              setCustom(color)
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
        <Hint
          label={`${label} opacity`}
          detail={plain ? "Written into the color, as #2563eb80" : "Written with the token, as bg-primary/50"}
        >
          <div className="flex h-7 w-14 shrink-0 items-center rounded-md border bg-transparent pr-1.5 focus-within:ring-2 focus-within:ring-ring dark:bg-input/30">
            <input
              aria-label={`${label} opacity`}
              inputMode="numeric"
              placeholder="100"
              disabled={!value}
              value={typedAlpha}
              onChange={(event) => setTypedAlpha(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
              onBlur={() => {
                const number = Number(typedAlpha)
                const next = typedAlpha === "" || number >= 100 ? undefined : Math.max(0, Math.round(number))
                setTypedAlpha(next === undefined ? "" : String(next))
                onChange(value, next)
              }}
              className="w-full min-w-0 bg-transparent px-1.5 text-right text-xs tabular-nums outline-none placeholder:text-muted-foreground"
            />
            <span className="text-xs text-muted-foreground">%</span>
          </div>
        </Hint>
      </div>
      {plain && nearestToValue && (
        <p
          role={tokensOnly ? "alert" : "status"}
          className={`flex flex-wrap items-center gap-x-1 text-[11px] leading-snug ${tokensOnly ? "text-destructive" : "text-muted-foreground"}`}
        >
          {tokensOnly ? "Not a token, and this project takes tokens only." : "Not a token."}
          <button
            type="button"
            onClick={() => onChange(nearestToValue.token.name, alpha)}
            className="inline-flex items-center gap-1 rounded-sm font-medium text-foreground underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <Checker hex={nearestToValue.token.hex} className="size-2.5" />
            Use {nearestToValue.token.name}
          </button>
        </p>
      )}
    </div>
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

/** The Tokens panel's color token, its value edited with the same picker. */
export function TokenColorEditor({ token: start }: { token: ColorToken }) {
  const [hex, setHex] = useState(start.hex)
  const [saved, setSaved] = useState(start.hex)
  // Cancel puts the editor back on the saved value, so it starts again from there.
  const [round, setRound] = useState(0)
  return (
    <div className="flex w-64 flex-col gap-3 rounded-lg border bg-popover p-3 text-popover-foreground shadow-md">
      <div className="flex items-center gap-2">
        <Checker hex={hex} className="size-8" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-xs">{start.name}</p>
          <p className="font-mono text-[11px] text-muted-foreground">{hex}</p>
        </div>
      </div>
      <ColorEditor key={round} hex={hex} onChange={setHex} />
      <div className="flex justify-end gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          disabled={hex === saved}
          onClick={() => {
            setHex(saved)
            setRound(round + 1)
          }}
        >
          Cancel
        </Button>
        <Button size="sm" className="h-7 text-xs" disabled={hex === saved} onClick={() => setSaved(hex)}>
          Save
        </Button>
      </div>
    </div>
  )
}
