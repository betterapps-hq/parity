import { type CSSProperties, type ReactNode, useLayoutEffect, useRef, useState } from "react"
import { MessageLine, useTokens } from "./field-parts.tsx"
import { type Side, type SideRules, type Sides, sideInline, sideNames, sideRules } from "./sides-writes.ts"
import { SideField, spreadTo, useSidesLine } from "./sides.tsx"
import type { LengthToken } from "./tokens.ts"

/*
 * The box-model widget (PAR-652's Spacing), in place of Padding's sides while Each side is pressed: padding's ring around the
 * layer's size, and margin's ring around that once a margin is set, each side a field typed as any side is, and
 * SpacingPreview, the canvas's stand-in, which draws padding and margin as DevTools does and highlights the side
 * that's hovered.
 */

/** Which sides are hovered in a field or the widget, for the preview to highlight. */
export interface SpacingHover {
  box: "padding" | "margin" | "border"
  sides: number[]
}

/**
 * Padding's ring, with margin's around it once a margin is set, as DevTools' box model lays them out: each side's
 * field where the side is, the layer's size in the middle. Each field is typed, stepped and scrubbed as any side, Alt
 * reaching the opposite side and Alt+Shift all four. What the fields say goes under the widget. Hovering a field
 * highlights its side on the canvas.
 */
export function BoxModel({
  padding,
  margin,
  showMargin,
  paddingMixed = [],
  marginMixed = [],
  measuredMargin,
  size,
  onPadding,
  onMargin,
  onHover
}: {
  padding: Sides
  margin: Sides
  /** Margin's ring shows once a margin is set, or once Margin is added from the section's menu. */
  showMargin: boolean
  paddingMixed?: readonly boolean[]
  marginMixed?: readonly boolean[]
  /** What each margin side comes to, for Auto. */
  measuredMargin?: readonly (number | undefined)[]
  /** The layer's size inside its padding. */
  size: { width: number; height: number }
  onPadding: (sides: Sides, cleared: number[]) => void
  onMargin: (sides: Sides, cleared: number[]) => void
  onHover?: (hover: SpacingHover | undefined) => void
}) {
  const { lineFor, said } = useSidesLine()
  const side = (
    box: "padding" | "margin",
    index: number,
    sides: Sides,
    rules: SideRules,
    mixed: readonly boolean[],
    onChange: (sides: Sides, cleared: number[]) => void
  ) => {
    const label = `${sideNames[index]} ${box}`
    return (
      <div
        className="w-10 shrink-0"
        onPointerEnter={() => onHover?.({ box, sides: [index] })}
        onPointerLeave={() => onHover?.(undefined)}
      >
        <SideField
          label={label}
          rules={rules}
          value={sides[index]}
          mixed={mixed[index]}
          bare
          narrow
          spreads
          measured={box === "margin" ? measuredMargin?.[index] : undefined}
          line={lineFor(label)}
          onChange={(value: Side, spread) => {
            const reached = spreadTo([index], spread)
            onChange(sides.map((other, at) => (reached.includes(at) ? value : other)) as Sides, reached)
          }}
          onShorthand={(next) => onChange(next, [0, 1, 2, 3])}
        />
      </div>
    )
  }
  const paddingSide = (index: number) => side("padding", index, padding, sideRules.padding, paddingMixed, onPadding)
  const marginSide = (index: number) => side("margin", index, margin, sideRules.margin, marginMixed, onMargin)
  const ring = (
    <div className="relative flex min-w-0 flex-1 flex-col items-center rounded-md border border-emerald-500/60 bg-emerald-500/10 px-1 py-0.5">
      <span className="absolute top-1 left-1.5 text-[10px] text-muted-foreground">Padding</span>
      {paddingSide(0)}
      <div className="flex w-full items-center justify-between gap-1">
        {paddingSide(3)}
        <div className="grid h-9 min-w-0 flex-1 place-items-center rounded-sm border bg-background text-[11px] whitespace-nowrap text-muted-foreground tabular-nums">
          {size.width} × {size.height}
        </div>
        {paddingSide(1)}
      </div>
      {paddingSide(2)}
    </div>
  )
  return (
    <fieldset className="m-0 grid min-w-0 gap-1 border-0 p-0 pt-1" aria-label="Box model">
      {showMargin ? (
        <div className="relative flex flex-col items-center rounded-md border border-dashed border-orange-400/70 bg-orange-400/10 px-1 py-0.5">
          <span className="absolute top-1 left-1.5 text-[10px] text-muted-foreground">Margin</span>
          {marginSide(0)}
          <div className="flex w-full items-center gap-1">
            {marginSide(3)}
            {ring}
            {marginSide(1)}
          </div>
          {marginSide(2)}
        </div>
      ) : (
        ring
      )}
      {said.map((message) => (
        <MessageLine key={message.text} message={message} />
      ))}
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
 * A card, Plans, in a parent, Pricing, drawn with the sides set: padding tinted green and margin orange, as DevTools
 * draws them, the hovered side stronger. It measures what the browser made of them (Auto, a percentage), which the
 * fields show as what they come to.
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
    alignSelf: margins[1] === "auto" || margins[3] === "auto" ? "auto" : undefined
  }
  const strong = (which: SpacingHover["box"], index: number) => hover?.box === which && hover.sides.includes(index)
  const band = (which: "padding" | "margin", index: number, position: CSSProperties): ReactNode => {
    const color = which === "padding" ? "16 185 129" : "251 146 60"
    return (
      <div
        key={`${which}-${index}`}
        aria-hidden
        className="pointer-events-none absolute"
        style={{
          ...position,
          background: `rgb(${color} / ${strong(which, index) ? 0.6 : 0.25})`,
          outline: strong(which, index) ? `1px solid rgb(${color})` : undefined
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
