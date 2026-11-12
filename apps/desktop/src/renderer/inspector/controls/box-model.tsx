import { Popover, PopoverContent, PopoverTrigger } from "@buildkitgg/shadcn-baseui-kit"
import { createContext, type CSSProperties, type ReactNode, use, useLayoutEffect, useRef, useState } from "react"
import { KeyHints } from "../../canvas/KeyHints.tsx"
import { spacingColors } from "../../canvas/spacing-colors.ts"
import { gestures as held } from "../../chrome/keymap.ts"
import { sameValue, tint } from "./css-values.ts"
import { useTokens } from "./field-parts.tsx"
import {
  type Side,
  type SideKind,
  type SideRules,
  type Sides,
  sideInline,
  sideNames,
  sideRules,
  sideShown
} from "./sides-writes.ts"
import { setSides, SideField, type Spread, spreadTo } from "./sides.tsx"
import type { LengthToken } from "./tokens.ts"

/*
 * The box-model widget (PAR-652's Spacing): Spacing's padding and margin in one box, as DevTools and Webflow lay them
 * out, margin's ring around padding's around the layer's size. Each side shows its value where the side is, and opens
 * its field in a popover to edit it. SpacingPreview, the canvas's stand-in, draws padding and margin as the canvas does
 * and highlights the side that's hovered.
 */

/** The fill a side's value rests on, which a story swaps to compare how strong it should be. */
export const ValueFill = createContext("bg-background/60")

/** Which sides are hovered in a field or the widget, for the preview to highlight. */
export interface SpacingHover {
  box: "padding" | "margin" | "border"
  sides: number[]
}

/**
 * Padding in modes' green and margin in pink, the pair chosen from those compared (PAR-186), as the canvas colors them
 * (PAR-797). The canvas doesn't draw margin yet.
 */
const colors = spacingColors

/** Padding, hatched in its color as the canvas hatches it (CanvasOverlay). Margin is flat, outside the layer. */
const hatched = (color: string) =>
  `repeating-linear-gradient(-45deg, ${tint(color, 28)} 0 1px, ${tint(color, 10)} 1px 5px)`

/** A side that's hovered or being edited, as the canvas shades the handle it's dragging. */
const active = (color: string) => tint(color, 30)

/** What a side shows: its number, and its unit after it, muted. */
interface Shown {
  number: string
  unit?: string
}

/** What a side shows unset, and says unset to a screen reader: padding's 0px, Unset; an inset's Auto. */
interface Unset extends Shown {
  name: string
}

/**
 * One side's value, compact, where the side is drawn: its measurement with its unit, a token's shaded as a token is, as
 * Webflow shades a variable's. It opens the side's field in a popover, on hover after a moment or on a press or Enter:
 * the field every side has, its token's name and value, its unit and the app's maths, with the keys that reach the
 * other sides where it's one of four. The box model's sides are these, and so are the inset box's.
 */
export function SideValue({
  label,
  value,
  rules,
  mixed = false,
  measured,
  percentOf,
  placeholder,
  unset = { number: "0", unit: "px", name: "Unset" },
  signed = false,
  spreads = false,
  side = "top",
  className = "",
  onChange,
  onEach,
  onShorthand,
  onHover
}: {
  /** The side's name, which its popover is titled with: Top padding. */
  label: string
  value: Side
  rules: SideRules
  mixed?: boolean
  /** What Auto, a percentage or unset comes to, for its field. */
  measured?: number
  percentOf?: string
  placeholder?: string
  unset?: Unset
  /** An offset, which shows its sign: +40px. */
  signed?: boolean
  /** One of four sides, so Alt and Alt+Shift reach the opposite side and all four, which its popover says. */
  spreads?: boolean
  /** Where its popover opens. */
  side?: "top" | "bottom"
  className?: string
  onChange: (value: Side, spread: Spread) => void
  /** Where the layers differ, works out what uses the value there from each one's own pixels. */
  onEach?: (update: (px: number) => number) => void
  onShorthand?: (sides: Sides) => void
  /** Hovered, or its popover open, for the canvas to highlight the side. */
  onHover?: (on: boolean) => void
}) {
  const [open, setOpen] = useState(false)
  const fill = use(ValueFill)
  const { tokens } = useTokens(rules.tokens.set)
  const tokenName = value !== undefined && value !== "auto" && "token" in value ? value.token : undefined
  const token = tokens.find((other) => other.name === tokenName)
  // Its measurement with its unit: `16px`, `10%`, Auto, a token's value, or a missing token's name.
  const shown: Shown = mixed ? { number: "Mixed" } : (sideShown(value, tokens, rules.unit) ?? unset)
  const faint = mixed || value === undefined
  const plus = signed && value !== undefined && value !== "auto" && "number" in value && value.number > 0 ? "+" : ""
  let named = `${plus}${shown.number}${shown.unit ?? ""}`

  if (tokenName !== undefined) {
    named = `${tokenName}, ${token?.detail ?? "missing"}`
  } else if (value === undefined && !mixed) {
    // Unset still shows what it comes to, so its name says that first.
    named = `${shown.number}${shown.unit ?? ""}, ${unset.name.toLowerCase()}`
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        onHover?.(next)
      }}
    >
      {/* A value rests on a faint fill of the panel's own color, so it reads over the margin's and padding's tints and
          looks like something to click; hovered, it lightens, as a token's pill always is. */}
      <PopoverTrigger
        openOnHover
        delay={350}
        closeDelay={150}
        aria-label={`${label}: ${named}`}
        onPointerEnter={() => onHover?.(true)}
        onPointerLeave={() => {
          if (!open) {
            onHover?.(false)
          }
        }}
        className={`flex h-5 max-w-14 min-w-6 items-baseline justify-center rounded-sm px-1 text-xs leading-5 tabular-nums outline-none hover:bg-foreground/10 focus-visible:ring-2 focus-visible:ring-ring data-popup-open:bg-foreground/15 ${faint ? "text-muted-foreground" : ""} ${tokenName === undefined ? fill : "bg-foreground/10"} ${className}`}
      >
        <span className="truncate">
          {plus}
          {shown.number}
        </span>
        {shown.unit && <span className="text-muted-foreground">{shown.unit}</span>}
      </PopoverTrigger>
      <PopoverContent aria-label={label} className="w-52 gap-2 p-2" side={side}>
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
          spreads={spreads}
          measured={measured}
          percentOf={percentOf}
          placeholder={placeholder}
          each={onEach}
          onChange={onChange}
          onShorthand={onShorthand}
        />
        {spreads && (
          <span className="text-xs text-muted-foreground">
            <KeyHints
              rows={[
                { keys: held.oppositePadding.keys, does: "Both sides" },
                { keys: held.everyPadding.keys, does: "All sides" }
              ]}
            />
          </span>
        )}
      </PopoverContent>
    </Popover>
  )
}

/** One side in the box model, which reaches the opposite side or all four with Alt or Alt+Shift. */
function BoxSide({
  box,
  index,
  sides,
  rules,
  mixed,
  measured,
  onChange,
  onEach,
  onHover
}: {
  box: "padding" | "margin"
  index: number
  sides: Sides
  rules: SideRules
  mixed: boolean
  measured?: number
  onChange: (sides: Sides, cleared: number[]) => void
  onEach?: (update: (px: number) => number) => void
  onHover?: (hover: SpacingHover | undefined) => void
}) {
  return (
    <SideValue
      label={`${sideNames[index]} ${box}`}
      value={sides[index]}
      rules={rules}
      mixed={mixed}
      measured={measured}
      spreads
      side={index === 2 ? "bottom" : "top"}
      onChange={(next, spread) => {
        const reached = spreadTo([index], spread)
        onChange(setSides(sides, reached, next), reached)
      }}
      onEach={onEach}
      onShorthand={(next) => onChange(next, [0, 1, 2, 3])}
      onHover={(on) => onHover?.(on ? { box, sides: [index] } : undefined)}
    />
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
  rules = sideRules,
  onPadding,
  onMargin,
  onEach,
  onHover
}: {
  padding: Sides
  /** Unset where the layer takes no margin, as a design's root doesn't: the box is padding's alone. */
  margin?: Sides
  paddingMixed?: readonly boolean[]
  marginMixed?: readonly boolean[]
  /** What each margin side comes to, for Auto. */
  measuredMargin?: readonly (number | undefined)[]
  /** The layer's size inside its padding; unset where there's no one size to show, as for several layers. */
  size?: { width: number; height: number }
  /** What padding's and margin's sides take, where the style holds less than every form. */
  rules?: Pick<Record<SideKind, SideRules>, "padding" | "margin">
  onPadding: (sides: Sides, cleared: number[]) => void
  onMargin?: (sides: Sides, cleared: number[]) => void
  /**
   * Where the layers differ on a side, works out what uses the value there (`+8`, Up and Down, a scrub) from each
   * layer's own pixels on that side.
   */
  onEach?: (box: "padding" | "margin", index: number, update: (px: number) => number) => void
  onHover?: (hover: SpacingHover | undefined) => void
}) {
  const side = (box: "padding" | "margin", index: number) => (
    <BoxSide
      box={box}
      index={index}
      sides={box === "padding" ? padding : (margin ?? noSides)}
      rules={box === "padding" ? rules.padding : rules.margin}
      mixed={(box === "padding" ? paddingMixed : marginMixed)[index] ?? false}
      measured={box === "margin" ? measuredMargin?.[index] : undefined}
      onChange={box === "padding" ? onPadding : (onMargin ?? noChange)}
      onEach={onEach && ((update) => onEach(box, index, update))}
      onHover={onHover}
    />
  )

  const name = (text: string) => (
    <span className="absolute top-1 left-1.5 text-2xs text-muted-foreground select-none">{text}</span>
  )

  // On the background, so margin's pink behind it doesn't muddy padding's green.
  const paddingBox = (
    <div
      className="relative flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-md border bg-background p-1"
      style={{ backgroundImage: hatched(colors.padding), borderColor: tint(colors.padding, 60) }}
    >
      {name("Padding")}
      {side("padding", 0)}
      <div className="flex w-full items-center gap-1">
        {side("padding", 3)}
        <div className="grid h-8 min-w-0 flex-1 place-items-center rounded-sm border bg-background text-2xs whitespace-nowrap text-muted-foreground tabular-nums">
          {size && `${size.width} × ${size.height}`}
        </div>
        {side("padding", 1)}
      </div>
      {side("padding", 2)}
    </div>
  )

  if (margin === undefined) {
    return (
      <fieldset className="m-0 flex min-w-0 p-0" aria-label="Box model">
        {paddingBox}
      </fieldset>
    )
  }

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
        {paddingBox}
        {side("margin", 1)}
      </div>
      {side("margin", 2)}
    </fieldset>
  )
}

const noSides: Sides = [undefined, undefined, undefined, undefined]
const noChange = () => undefined

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
  layout = "flex",
  first = false,
  contained = false,
  onMeasure
}: {
  padding?: Sides
  margin?: Sides
  border?: Sides
  hover?: SpacingHover
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

    if (!element) {
      return
    }

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

    if (sameValue(next, box)) {
      return
    }

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
    alignSelf: margins[1] === "auto" || margins[3] === "auto" ? "auto" : undefined
  }

  const strong = (which: SpacingHover["box"], index: number) => hover?.box === which && hover.sides.includes(index)

  const band = (which: "padding" | "margin", index: number, position: CSSProperties): ReactNode => {
    const color = colors[which]
    let background = which === "padding" ? hatched(color) : tint(color, 14)

    if (strong(which, index)) {
      background = active(color)
    }

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
    const [pt, pr, pb, pl] = box.padding
    const [mt, mr, mb, ml] = box.margin.map((value) => Math.max(0, value))
    const [bt, br, bb, bl] = box.border

    if (padding) {
      bands.push(
        band("padding", 0, { top: 0, left: 0, right: 0, height: pt }),
        band("padding", 2, { bottom: 0, left: 0, right: 0, height: pb }),
        band("padding", 3, { top: pt, bottom: pb, left: 0, width: pl }),
        band("padding", 1, { top: pt, bottom: pb, right: 0, width: pr })
      )
    }

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
