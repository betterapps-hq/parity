import { Popover, PopoverContent, PopoverTrigger } from "@buildkitgg/shadcn-baseui-kit"
import { type CSSProperties, type ReactNode, useLayoutEffect, useRef, useState } from "react"
import { KeyHints } from "../../canvas/KeyHints.tsx"
import { kindColors } from "../../canvas/kinds.tsx"
import { spacingColor } from "../../canvas/SpacingHandles.tsx"
import { gestures as held } from "../../chrome/keymap.ts"
import { formatNumber } from "./css-values.ts"
import { useTokens } from "./field-parts.tsx"
import { type Side, type SideRules, type Sides, sideInline, sideNames, sideRules } from "./sides-writes.ts"
import { SideField, spreadTo } from "./sides.tsx"
import type { LengthToken } from "./tokens.ts"

/*
 * The box-model widget (PAR-652's Spacing): Spacing's padding and margin in one box, as DevTools and Webflow lay them
 * out, margin's ring around padding's around the layer's size. Each side shows its value where the side is, and opens
 * its field in a popover to edit it. SpacingPreview, the canvas's stand-in, draws padding and margin as the canvas does
 * and highlights the side that's hovered.
 */

/** Which sides are hovered in a field or the widget, for the preview to highlight. */
export interface SpacingHover {
  box: "padding" | "margin" | "border"
  sides: number[]
}

/** The colors the box and its preview draw padding and margin in. */
export interface SpacingColors {
  padding: string
  margin: string
}

/**
 * Padding in the canvas's spacing pink, and margin, which the canvas doesn't draw yet, in the same pink until it has a
 * color of its own. The Margin colors story tries some.
 */
export const spacingColors: SpacingColors = { padding: spacingColor, margin: spacingColor }

const tint = (color: string, strength: number) => `color-mix(in oklch, ${color} ${strength}%, transparent)`
/** Padding, hatched in its color as the canvas hatches it (CanvasOverlay). Margin is flat, outside the layer. */
const hatched = (color: string) =>
  `repeating-linear-gradient(-45deg, ${tint(color, 28)} 0 1px, ${tint(color, 10)} 1px 5px)`
/** A side that's hovered or being edited, as the canvas shades the handle it's dragging. */
const active = (color: string) => tint(color, 30)

/**
 * A side's measurement as the box shows it, with its unit: `16px`, `10%`, `Auto`, a token's value. A token missing from
 * the project shows its name, since it has no value.
 */
function measurement(side: Side, token: LengthToken | undefined): { number: string; unit?: string } | undefined {
  if (side === undefined) return undefined
  if (side === "auto") return { number: "Auto" }
  if ("number" in side) return { number: formatNumber(side.number), unit: "px" }
  if ("percent" in side) return { number: formatNumber(side.percent), unit: "%" }
  return token ? { number: formatNumber(token.px), unit: "px" } : { number: side.token }
}

/**
 * One side in the box: its measurement with its unit, where the side is, a token's shaded as a token is, as Webflow
 * shades a variable's. It opens the side's field in a popover, on hover after a moment or on a press or Enter: the
 * field every side has, its token's name and value, its unit and the app's maths, with the keys that reach the other
 * sides. Hovering it, or editing it, highlights the side on the canvas.
 */
function BoxSide({
  box,
  index,
  sides,
  rules,
  mixed,
  measured,
  onChange,
  onHover
}: {
  box: "padding" | "margin"
  index: number
  sides: Sides
  rules: SideRules
  mixed: boolean
  measured?: number
  onChange: (sides: Sides, cleared: number[]) => void
  onHover?: (hover: SpacingHover | undefined) => void
}) {
  const [open, setOpen] = useState(false)
  const { tokens } = useTokens(rules.tokens.set)
  const label = `${sideNames[index]} ${box}`
  const value = sides[index]
  const tokenName = typeof value === "object" && "token" in value ? value.token : undefined
  const token = tokens.find((other) => other.name === tokenName)
  const shown = mixed ? { number: "Mixed" } : (measurement(value, token) ?? { number: "0", unit: "px" })
  const faint = mixed || value === undefined
  const highlight = (on: boolean) => onHover?.(on ? { box, sides: [index] } : undefined)
  let named = `${shown.number}${shown.unit ?? ""}`
  if (tokenName !== undefined) named = `${tokenName}, ${token?.detail ?? "missing"}`
  else if (value === undefined && !mixed) named = "Unset"
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        highlight(next)
      }}
    >
      <PopoverTrigger
        openOnHover
        delay={350}
        closeDelay={150}
        aria-label={`${label}: ${named}`}
        onPointerEnter={() => highlight(true)}
        onPointerLeave={() => {
          if (!open) highlight(false)
        }}
        className={`flex h-5 max-w-14 min-w-6 items-baseline justify-center rounded-sm px-1 text-xs leading-5 tabular-nums outline-none hover:bg-foreground/10 focus-visible:ring-2 focus-visible:ring-ring data-popup-open:bg-foreground/15 ${faint ? "text-muted-foreground" : ""} ${tokenName === undefined ? "" : "bg-foreground/10"}`}
      >
        <span className="truncate">{shown.number}</span>
        {shown.unit && <span className="text-muted-foreground">{shown.unit}</span>}
      </PopoverTrigger>
      <PopoverContent className="w-52 gap-2 p-2" side={index === 2 ? "bottom" : "top"}>
        <div className="flex items-baseline justify-between gap-2 text-xs">
          <span className="font-medium">{label}</span>
          {/* A token's value, which its chip in the field doesn't say. */}
          {token && <span className="text-muted-foreground tabular-nums">{token.detail}</span>}
        </div>
        <SideField
          label={label}
          rules={rules}
          value={value}
          mixed={mixed}
          spreads
          measured={measured}
          onChange={(next: Side, spread) => {
            const reached = spreadTo([index], spread)
            onChange(sides.map((other, at) => (reached.includes(at) ? next : other)) as Sides, reached)
          }}
          onShorthand={(next) => onChange(next, [0, 1, 2, 3])}
        />
        <span className="text-xs text-muted-foreground">
          <KeyHints
            rows={[
              { keys: held.oppositePadding.keys, does: "Both sides" },
              { keys: held.everyPadding.keys, does: "All sides" }
            ]}
          />
        </span>
      </PopoverContent>
    </Popover>
  )
}

/**
 * Spacing's box: margin's ring around padding's around the layer's size, each side's measurement and unit where the side
 * is, as DevTools' box model lays them out. Hovering a value opens its field in a popover after a moment; pressing it, or
 * Enter, opens it at once. Padding is hatched in its color, as the canvas shades it, and margin, outside it, is flat
 * in its own within a dashed edge.
 */
export function BoxModel({
  padding,
  margin,
  paddingMixed = [],
  marginMixed = [],
  measuredMargin,
  size,
  colors = spacingColors,
  onPadding,
  onMargin,
  onHover
}: {
  padding: Sides
  margin: Sides
  paddingMixed?: readonly boolean[]
  marginMixed?: readonly boolean[]
  /** What each margin side comes to, for Auto. */
  measuredMargin?: readonly (number | undefined)[]
  /** The layer's size inside its padding. */
  size: { width: number; height: number }
  colors?: SpacingColors
  onPadding: (sides: Sides, cleared: number[]) => void
  onMargin: (sides: Sides, cleared: number[]) => void
  onHover?: (hover: SpacingHover | undefined) => void
}) {
  const side = (box: "padding" | "margin", index: number) => (
    <BoxSide
      box={box}
      index={index}
      sides={box === "padding" ? padding : margin}
      rules={box === "padding" ? sideRules.padding : sideRules.margin}
      mixed={(box === "padding" ? paddingMixed : marginMixed)[index] ?? false}
      measured={box === "margin" ? measuredMargin?.[index] : undefined}
      onChange={box === "padding" ? onPadding : onMargin}
      onHover={onHover}
    />
  )
  const name = (text: string) => (
    <span className="absolute top-1 left-1.5 text-2xs text-muted-foreground select-none">{text}</span>
  )
  return (
    <fieldset
      className="relative m-0 flex min-w-0 flex-col items-center gap-0.5 rounded-md border border-dashed p-1"
      style={{ background: tint(colors.margin, 10), borderColor: tint(colors.margin, 55) }}
      aria-label="Box model"
    >
      {name("Margin")}
      {side("margin", 0)}
      <div className="flex w-full items-center gap-1">
        {side("margin", 3)}
        <div
          className="relative flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-md border p-1"
          style={{ background: hatched(colors.padding), borderColor: tint(colors.padding, 60) }}
        >
          {name("Padding")}
          {side("padding", 0)}
          <div className="flex w-full items-center gap-1">
            {side("padding", 3)}
            <div className="grid h-8 min-w-0 flex-1 place-items-center rounded-sm border bg-background text-2xs whitespace-nowrap text-muted-foreground tabular-nums">
              {size.width} × {size.height}
            </div>
            {side("padding", 1)}
          </div>
          {side("padding", 2)}
        </div>
        {side("margin", 1)}
      </div>
      {side("margin", 2)}
    </fieldset>
  )
}

/** What the preview measures on its layer: each side's margin, padding and border, and its size, in pixels. */
export interface Measured {
  margin: number[]
  padding: number[]
  border: number[]
  width: number
  height: number
  /** The layer's size inside its padding. */
  content: { width: number; height: number }
}

const sideKeys = ["top", "right", "bottom", "left"] as const

/**
 * A card, Plans, in a parent, Pricing, drawn with the sides set: padding and margin in their colors as the box draws
 * them, the hovered side stronger. It measures what the browser made of them (Auto, a percentage), which the fields
 * show as what they come to.
 */
export function SpacingPreview({
  padding,
  margin,
  border,
  hover,
  colors = spacingColors,
  selected = false,
  layout = "flex",
  first = false,
  contained = false,
  onMeasure
}: {
  padding?: Sides
  margin?: Sides
  border?: Sides
  hover?: SpacingHover
  colors?: SpacingColors
  /** Plans is outlined as the canvas outlines a selected layer, to see the colors beside it. */
  selected?: boolean
  /** Pricing's layout: a flex column, or Block, where vertical margins collapse. */
  layout?: "flex" | "block"
  /** Plans is Pricing's first child, so a top margin can pass through Pricing's edge in a Block layout. */
  first?: boolean
  /** Pricing contains its children's margins (`flow-root`), so none passes through its edge. */
  contained?: boolean
  onMeasure?: (measured: Measured) => void
}) {
  const layer = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState<Measured>()
  const spacing = useTokens("spacing").tokens
  const widths = useTokens("borderWidth").tokens
  useLayoutEffect(() => {
    const element = layer.current
    if (!element) return
    const style = getComputedStyle(element)
    const read = (property: string, suffix = "") =>
      sideKeys.map((key) => Number.parseFloat(style.getPropertyValue(`${property}-${key}${suffix}`)) || 0)
    const paddings = read("padding")
    const next: Measured = {
      margin: read("margin"),
      padding: paddings,
      border: read("border", "-width"),
      width: element.offsetWidth,
      height: element.offsetHeight,
      content: {
        width: Math.round(element.clientWidth - paddings[1]! - paddings[3]!),
        height: Math.round(element.clientHeight - paddings[0]! - paddings[2]!)
      }
    }
    if (JSON.stringify(next) === JSON.stringify(box)) return
    setBox(next)
    onMeasure?.(next)
  }, [padding, margin, border, spacing, widths, layout, first, contained, box, onMeasure])
  const inline = (sides: Sides | undefined, tokens: readonly LengthToken[]) =>
    (sides ?? [undefined, undefined, undefined, undefined]).map((side) => sideInline(side, tokens) ?? "0px")
  // With no padding of its own to show, Plans keeps a little, untinted, so its content doesn't touch its edge.
  const paddings = padding ? inline(padding, spacing) : ["12px", "12px", "12px", "12px"]
  const margins = inline(margin, spacing)
  const borders = inline(border, widths)
  const style: CSSProperties = {
    position: "relative",
    padding: paddings.join(" "),
    margin: margins.join(" "),
    borderWidth: borders.join(" "),
    borderStyle: "solid",
    borderColor: "#262626",
    // Auto margins center a layer only when it doesn't stretch.
    width: margins[1] === "auto" || margins[3] === "auto" ? 200 : undefined,
    alignSelf: margins[1] === "auto" || margins[3] === "auto" ? "auto" : undefined,
    outline: selected ? `2px solid ${kindColors.layer}` : undefined
  }
  const strong = (which: SpacingHover["box"], index: number) => hover?.box === which && hover.sides.includes(index)
  const band = (which: "padding" | "margin", index: number, position: CSSProperties): ReactNode => {
    const color = colors[which]
    let background = which === "padding" ? hatched(color) : tint(color, 14)
    if (strong(which, index)) background = active(color)
    return (
      <div
        key={`${which}-${index}`}
        aria-hidden
        className="pointer-events-none absolute"
        style={{
          ...position,
          background,
          // Margin's edge is dashed, as the box draws it.
          outline: strong(which, index) ? `1px ${which === "margin" ? "dashed" : "solid"} ${color}` : undefined
        }}
      />
    )
  }
  const bands: ReactNode[] = []
  if (box) {
    const [pt, pr, pb, pl] = box.padding as [number, number, number, number]
    const [mt, mr, mb, ml] = box.margin.map((value) => Math.max(0, value)) as [number, number, number, number]
    const [bt, br, bb, bl] = box.border as [number, number, number, number]
    if (padding)
      bands.push(
        band("padding", 0, { top: 0, left: 0, right: 0, height: pt }),
        band("padding", 2, { bottom: 0, left: 0, right: 0, height: pb }),
        band("padding", 3, { top: pt, bottom: pb, left: 0, width: pl }),
        band("padding", 1, { top: pt, bottom: pb, right: 0, width: pr })
      )
    bands.push(
      band("margin", 0, { top: -(bt + mt), left: -(bl + ml), right: -(br + mr), height: mt }),
      band("margin", 2, { bottom: -(bb + mb), left: -(bl + ml), right: -(br + mr), height: mb }),
      band("margin", 3, { top: -bt, bottom: -bb, left: -(bl + ml), width: ml }),
      band("margin", 1, { top: -bt, bottom: -bb, right: -(br + mr), width: mr })
    )
  }
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">
        Pricing, {layout === "block" ? "a Block layout" : "a vertical layout"}
      </span>
      <div
        className="w-[280px] rounded-md bg-white text-neutral-900 outline-1 outline-neutral-400 outline-dashed"
        style={
          layout === "block"
            ? { display: contained ? "flow-root" : "block" }
            : { display: "flex", flexDirection: "column" }
        }
      >
        {!first && <div className="h-8 bg-neutral-100 px-3 text-xs leading-8 text-neutral-500">Header</div>}
        <div ref={layer} aria-label="Plans" className="rounded-md bg-neutral-50" style={style}>
          {bands}
          <div className="relative flex flex-col gap-1.5">
            <div className="text-sm font-semibold">Plans</div>
            <div className="rounded bg-neutral-200 px-2 py-1 text-xs">Hobby</div>
            <div className="rounded bg-neutral-200 px-2 py-1 text-xs">Pro plan</div>
          </div>
        </div>
        <div className="h-8 bg-neutral-100 px-3 text-xs leading-8 text-neutral-500">Footer</div>
      </div>
    </div>
  )
}
