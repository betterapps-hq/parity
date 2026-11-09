import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
  ToggleGroup,
  ToggleGroupItem
} from "@buildkitgg/shadcn-baseui-kit"
import { AppWindow, ArrowUpToLine, Crosshair, Ellipsis, Layers, Maximize, Move, Rows3 } from "lucide-react"
import type { CSSProperties, ReactNode } from "react"
import { kindColors } from "../../canvas/kinds.tsx"
import { ChoiceInput } from "../../chrome/fields.tsx"
import { Hint } from "../../chrome/Hint.tsx"
import { PanelSection } from "../../chrome/PanelSection.tsx"
import { formatNumber } from "./css-values.ts"
import { MessageLine, useTokens } from "./field-parts.tsx"
import { Field } from "./field-row.tsx"
import {
  distances,
  inFlow,
  insetPixels,
  layerSize,
  parent,
  type Placement,
  type Position,
  placed
} from "./position-writes.ts"
import { type Side, type Sides, sideNames, sideNumber, sideRules } from "./sides-writes.ts"
import { SideField, useSidesLine } from "./sides.tsx"

/*
 * Position (PAR-652): Placement's toggles, the pin box for a layer that isn't In layout, its presets (Figma's
 * constraints, written in CSS), and Layer order. PositionPreview is the canvas's stand-in: Pricing with Plans placed
 * in it, each pinned side measured to Pricing's edge, drawn in the layer's color as the canvas draws a selection.
 */

/** The layer's color, which the canvas draws a selected layer's outline and measurements in. */
const layerColor = kindColors.layer

const placements = [
  { value: "static", label: "In layout", detail: "Placed by its layout, as its children are", Icon: Rows3 },
  { value: "absolute", label: "Absolute", detail: "Placed against Pricing, out of the layout", Icon: Crosshair },
  {
    value: "fixed",
    label: "Fixed",
    detail: "Placed against the window, so it stays put as the page scrolls",
    Icon: AppWindow
  },
  {
    value: "sticky",
    label: "Sticky",
    detail: "In layout, until scrolling would take it past its inset",
    Icon: ArrowUpToLine
  },
  { value: "relative", label: "Relative", detail: "In layout, then moved by its insets", Icon: Move }
] as const satisfies readonly { value: Placement; label: string; detail: string; Icon: unknown }[]

type AxisPreset = "start" | "end" | "both" | "center" | "scale"

/** Which of Figma's constraints an axis is, from its pinned sides. */
function presetOf(start: Side, end: Side, center: number | undefined): AxisPreset | undefined {
  if (center !== undefined) return "center"
  const pinned = (side: Side) => side !== undefined && side !== "auto"
  const percent = (side: Side) => typeof side === "object" && "percent" in side
  if (pinned(start) && pinned(end)) return percent(start) && percent(end) ? "scale" : "both"
  if (pinned(start)) return "start"
  if (pinned(end)) return "end"
  return undefined
}

/** A share of Pricing as Scale pins it, to a tenth of a percent. */
const tenth = (number: number) => Number(formatNumber(number, 1))

/**
 * Position, for a layer that isn't a design's root: Placement's toggles (In layout, Absolute, Fixed, Sticky, and
 * Relative once set from More), then the pin box when it isn't In layout, with Figma's constraints as presets for
 * Absolute and Fixed, and Layer order, shown by default when Absolute, Fixed or Sticky.
 */
export function PositionSection({
  position,
  set,
  layerOrder,
  onLayerOrder,
  showLayerOrder: layerOrderAdded = false,
  context = "Pricing",
  stickyStopped,
  onClipInstead
}: {
  position: Position
  set: (position: Position) => void
  layerOrder: Side
  onLayerOrder: (value: Side) => void
  /** Layer order added from More on a layer In layout or Relative. */
  showLayerOrder?: boolean
  /** The stacking context Layer order orders within, and what makes it one. */
  context?: string
  /** Why a Sticky layer won't stick: a layout around it that hides its overflow. */
  stickyStopped?: string
  onClipInstead?: () => void
}) {
  const spacing = useTokens("spacing").tokens
  const rect = placed(position, spacing)
  const measured = distances(rect)
  const placement = position.placement
  const shownPlacements = placements.filter((option) => option.value !== "relative" || placement === "relative")
  const layerOrderShown =
    layerOrderAdded || layerOrder !== undefined || ["absolute", "fixed", "sticky"].includes(placement)
  const choose = (next: Placement) => {
    if (next === placement) return
    if (next === "static") set({ placement: next, insets: [undefined, undefined, undefined, undefined] })
    else if (next === "sticky") set({ placement: next, insets: [{ number: 0 }, undefined, undefined, undefined] })
    else if (next === "relative") set({ placement: next, insets: [undefined, undefined, undefined, undefined] })
    else if (placement === "absolute" || placement === "fixed") set({ ...position, placement: next })
    // Taken out of the layout, it stays where it was, pinned to the left and top, as Figma's absolute position does.
    else set({ placement: next, insets: [{ number: inFlow.y }, undefined, undefined, { number: inFlow.x }] })
  }
  return (
    <PanelSection
      title="Position"
      action={
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="More position options"
            className="grid size-6 place-items-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-popup-open:bg-accent"
          >
            <Ellipsis className="size-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuCheckboxItem
              className="text-xs"
              checked={placement === "relative"}
              onCheckedChange={(on) => choose(on ? "relative" : "static")}
            >
              Relative
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              className="text-xs"
              checked={layerOrderShown}
              disabled={["absolute", "fixed", "sticky"].includes(placement) || layerOrder !== undefined}
              onCheckedChange={() => onLayerOrder({ number: 1 })}
            >
              Layer order
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>
      }
    >
      <div className="flex flex-col gap-1">
        <Field label="Placement">
          <ToggleGroup
            variant="outline"
            size="sm"
            spacing={0}
            aria-label="Placement"
            value={[placement]}
            onValueChange={([next]) => next && choose(next as Placement)}
          >
            {shownPlacements.map((option) => (
              <Hint key={option.value} label={option.label} detail={option.detail}>
                <ToggleGroupItem value={option.value} aria-label={option.label} className="h-7 px-2">
                  <option.Icon />
                </ToggleGroupItem>
              </Hint>
            ))}
          </ToggleGroup>
        </Field>
        {placement !== "static" && <PinBox position={position} measured={measured} stopped={stickyStopped} set={set} />}
        {stickyStopped && (
          // Under the fields, past the labels' column.
          <div className="pl-24">
            <MessageLine
              message={{
                tone: "note",
                text: stickyStopped,
                action: onClipInstead && { label: "Clip without scrolling", run: onClipInstead }
              }}
            />
          </div>
        )}
        {(placement === "absolute" || placement === "fixed") && <Presets position={position} rect={rect} set={set} />}
        {layerOrderShown && <LayerOrderField value={layerOrder} context={context} onChange={onLayerOrder} />}
      </div>
    </PanelSection>
  )
}

/**
 * The pin box: a field on each side of a small box, each side pinned or not. Clicking a side's pin pins it at its
 * measured distance, and clicking again unpins it to Auto, as Framer's pin box does; typing in an unpinned side pins
 * it, and typing `auto` unpins it. Centered, the axis shows its offset from the center. What the fields say goes under
 * the whole box, where it has the section's width.
 */
function PinBox({
  position,
  measured,
  stopped,
  set
}: {
  position: Position
  measured: [number, number, number, number]
  stopped?: string
  set: (position: Position) => void
}) {
  const { lineFor, said } = useSidesLine()
  const sticky = position.placement === "sticky" || position.placement === "relative"
  const pinned = (index: number) => {
    if (index % 2 === 1 && position.centerX !== undefined) return false
    if (index % 2 === 0 && position.centerY !== undefined) return false
    return position.insets[index] !== undefined
  }
  const setSide = (index: number, value: Side) => {
    const insets = [...position.insets] as Sides
    insets[index] = value === "auto" ? undefined : value
    const next = { ...position, insets }
    // Pinning a side of a centered axis ends the centering.
    if (index % 2 === 1 && value !== undefined && value !== "auto") delete next.centerX
    if (index % 2 === 0 && value !== undefined && value !== "auto") delete next.centerY
    set(next)
  }
  const toggle = (index: number) => {
    if (pinned(index)) setSide(index, undefined)
    else setSide(index, { number: sticky ? 0 : measured[index] })
  }
  const field = (index: number): ReactNode => {
    const name = sideNames[index]!
    const centered = index % 2 === 1 ? position.centerX : position.centerY
    // Centered, the start side's field is the offset from the center, and the end side's says Centered.
    if (centered !== undefined) {
      if (index === 1 || index === 2)
        return <span className="grid h-7 place-items-center text-xs text-muted-foreground">Centered</span>
      const axis = index === 3 ? "centerX" : "centerY"
      const label = `${index === 3 ? "Horizontal" : "Vertical"} offset from center`
      return (
        <SideField
          label={label}
          rules={sideRules.inset}
          value={{ number: centered }}
          narrow
          line={lineFor(label)}
          onChange={(value) => {
            if (typeof value === "object" && "number" in value) set({ ...position, [axis]: value.number })
          }}
        />
      )
    }
    const placeholder = sticky ? "Auto" : `Auto ${measured[index]}`
    return (
      <SideField
        label={`${name} inset`}
        rules={sideRules.inset}
        value={position.insets[index]}
        narrow
        placeholder={placeholder}
        measured={measured[index]}
        percentOf={`Pricing's ${index % 2 === 0 ? "height" : "width"}`}
        line={lineFor(`${name} inset`)}
        onChange={(value) => setSide(index, value)}
        onShorthand={(sides) =>
          set({
            ...position,
            insets: sides.map((side) => (side === "auto" ? undefined : side)) as Sides,
            centerX: undefined,
            centerY: undefined
          })
        }
      />
    )
  }
  const pin = (index: number, style: CSSProperties, vertical: boolean) => {
    const on = pinned(index)
    const name = sideNames[index]!.toLowerCase()
    return (
      <Hint label={on ? `Unpin the ${name}` : `Pin the ${name}`}>
        <button
          type="button"
          aria-label={on ? `Unpin the ${name}` : `Pin the ${name}`}
          aria-pressed={on}
          onClick={() => toggle(index)}
          className="group/pin absolute grid place-items-center rounded-sm outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
          style={style}
        >
          <span
            className={`block ${vertical ? "h-full w-0 border-l-2" : "h-0 w-full border-t-2"} ${on ? "" : "border-dashed border-muted-foreground/40 group-hover/pin:border-muted-foreground"}`}
            style={on ? { borderColor: layerColor } : undefined}
          />
        </button>
      </Hint>
    )
  }
  const hint = [stopped, "Click a side to pin it at its distance, and again to unpin it"].filter(Boolean).join("\n")
  return (
    // The pin box takes the section's whole width, so the box and its fields have room, with its label above.
    <div className={`flex flex-col gap-1 py-0.5 ${stopped ? "opacity-50" : ""}`}>
      <Hint label="Insets" detail={hint} wait>
        <span className="w-fit text-xs text-muted-foreground">Insets</span>
      </Hint>
      <div className="grid grid-cols-[72px_1fr_72px] items-center gap-1.5">
        <span />
        <div className="mx-auto w-[72px]">{field(0)}</div>
        <span />
        <div>{field(3)}</div>
        <div className="relative h-24 rounded-md border bg-muted/40">
          {/* Plans, inside Pricing; a centered axis draws its center line. */}
          <div className="absolute inset-x-[30%] inset-y-[32%] rounded-sm border bg-background" />
          {position.centerX !== undefined && (
            <div aria-hidden className="absolute inset-y-1 left-1/2 border-l" style={{ borderColor: layerColor }} />
          )}
          {position.centerY !== undefined && (
            <div aria-hidden className="absolute inset-x-1 top-1/2 border-t" style={{ borderColor: layerColor }} />
          )}
          {pin(0, { top: 2, left: "42%", width: "16%", height: "28%" }, true)}
          {pin(2, { bottom: 2, left: "42%", width: "16%", height: "28%" }, true)}
          {pin(3, { left: 2, top: "38%", height: "24%", width: "28%" }, false)}
          {pin(1, { right: 2, top: "38%", height: "24%", width: "28%" }, false)}
        </div>
        <div>{field(1)}</div>
        <span />
        <div className="mx-auto w-[72px]">{field(2)}</div>
        <span />
      </div>
      {said.map((message) => (
        <MessageLine key={message.text} message={message} />
      ))}
    </div>
  )
}

/** Figma's constraints for each axis, written in CSS, and Fill parent (`inset-0`). */
function Presets({
  position,
  rect,
  set
}: {
  position: Position
  rect: { x: number; y: number; width: number; height: number }
  set: (position: Position) => void
}) {
  const [top, right, bottom, left] = position.insets
  const across = presetOf(left, right, position.centerX)
  const down = presetOf(top, bottom, position.centerY)
  // Not pinned unpins the axis, so it stays where the flow puts it.
  const apply = (horizontal: boolean, preset: AxisPreset | undefined) => {
    const insets = [...position.insets] as Sides
    const [startIndex, endIndex] = horizontal ? [3, 1] : [0, 2]
    const of = horizontal ? parent.width : parent.height
    const start = horizontal ? rect.x : rect.y
    const size = horizontal ? rect.width : rect.height
    const end = of - start - size
    const next: Position = { ...position, insets }
    if (horizontal) delete next.centerX
    else delete next.centerY
    insets[startIndex] = undefined
    insets[endIndex] = undefined
    if (preset === "start" || preset === "both") insets[startIndex] = { number: Math.round(start) }
    if (preset === "end" || preset === "both") insets[endIndex] = { number: Math.round(end) }
    if (preset === "scale") {
      insets[startIndex] = { percent: tenth((start / of) * 100) }
      insets[endIndex] = { percent: tenth((end / of) * 100) }
    }
    if (preset === "center") {
      const offset = Math.round(start - (of - (horizontal ? layerSize.width : layerSize.height)) / 2)
      if (horizontal) next.centerX = offset
      else next.centerY = offset
    }
    set(next)
  }
  const options = (horizontal: boolean) => [
    { value: "start" as const, label: horizontal ? "Left" : "Top" },
    { value: "end" as const, label: horizontal ? "Right" : "Bottom" },
    { value: "both" as const, label: horizontal ? "Left and right" : "Top and bottom" },
    { value: "center" as const, label: "Center" },
    { value: "scale" as const, label: "Scale" }
  ]
  const filled = position.insets.every((side) => typeof side === "object" && "number" in side && side.number === 0)
  return (
    <>
      <Field label="Horizontal" hint="Figma's horizontal constraint: what Plans keeps as Pricing's width changes">
        <ChoiceInput
          value={across}
          options={options(true)}
          placeholder="Not pinned"
          onChange={(preset) => apply(true, preset)}
        />
      </Field>
      <Field label="Vertical" hint="Figma's vertical constraint: what Plans keeps as Pricing's height changes">
        <ChoiceInput
          value={down}
          options={options(false)}
          placeholder="Not pinned"
          onChange={(preset) => apply(false, preset)}
        />
      </Field>
      <div className="grid grid-cols-[88px_1fr] gap-2">
        <span />
        <Button
          variant="outline"
          size="sm"
          className="h-7 justify-start gap-1.5 text-xs"
          aria-pressed={filled}
          onClick={() =>
            set({
              ...position,
              insets: [{ number: 0 }, { number: 0 }, { number: 0 }, { number: 0 }],
              centerX: undefined,
              centerY: undefined
            })
          }
        >
          <Maximize className="size-3.5" />
          Fill parent
        </Button>
      </div>
    </>
  )
}

/**
 * Layer order: a whole number or a z-index token, Auto when unset. Up and Down step by one, Shift by ten; a token
 * steps through the scale. Its hint names the stacking context it orders within.
 */
export function LayerOrderField({
  value,
  context,
  mixed,
  onChange
}: {
  value: Side
  /** The stacking context it orders within, and what makes it one. */
  context: string
  mixed?: boolean
  onChange: (value: Side) => void
}) {
  return (
    <Field label="Layer order" hint={`Orders this layer within ${context}. Higher is in front.`}>
      <SideField
        label="Layer order"
        inner={<Layers className="size-3.5" />}
        rules={sideRules.layer}
        value={value}
        mixed={mixed}
        placeholder="Auto"
        onChange={(next) => onChange(next === "auto" ? undefined : next)}
      />
    </Field>
  )
}

/**
 * Pricing with Plans placed in it, as the canvas draws it: each pinned side measured to Pricing's edge in the
 * accent color. Fixed draws the window instead of Pricing; Sticky marks the line it sticks at.
 */
export function PositionPreview({ position, layerOrder }: { position: Position; layerOrder?: Side }) {
  const spacing = useTokens("spacing").tokens
  const layerTokens = useTokens("zIndex").tokens
  const rect = placed(position, spacing)
  const [top, right, bottom, left] = distances(rect)
  const pinnedAt = (index: number) => {
    if (index % 2 === 1 && position.centerX !== undefined) return false
    if (index % 2 === 0 && position.centerY !== undefined) return false
    // Only Absolute and Fixed measure to Pricing's edges; Relative and Sticky insets are offsets.
    const measures = position.placement === "absolute" || position.placement === "fixed"
    return position.insets[index] !== undefined && measures
  }
  const guide = (index: number, style: CSSProperties, label: number, vertical: boolean) =>
    pinnedAt(index) && (
      <div key={index} aria-hidden className="pointer-events-none absolute" style={style}>
        <div
          className={`absolute ${vertical ? "inset-y-0 left-1/2 border-l" : "inset-x-0 top-1/2 border-t"}`}
          style={{ borderColor: layerColor }}
        />
        <span
          className="absolute top-1/2 left-1/2 -translate-1/2 rounded-sm px-1 text-2xs font-medium text-white tabular-nums"
          style={{ background: layerColor }}
        >
          {label}
        </span>
      </div>
    )
  const z = sideNumber(layerOrder, layerTokens)
  let title = "Pricing"
  if (position.placement === "fixed") title = "The window"
  const stickAt = position.placement === "sticky" ? insetPixels(position.insets[0], parent.height, spacing) : undefined
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{title}</span>
      <div
        className="relative isolate overflow-hidden rounded-md bg-white text-neutral-900 outline-1 outline-neutral-400 outline-dashed"
        style={{ width: parent.width, height: parent.height }}
      >
        {/* A sibling in the flow, which Plans covers or goes behind by its layer order. */}
        <div
          className="absolute top-12 left-28 grid h-16 w-40 place-items-center rounded-md bg-neutral-200 text-xs text-neutral-500"
          style={{ zIndex: 1 }}
        >
          Hero
        </div>
        {position.placement === "relative" && (
          // Where the flow put it, before its insets moved it.
          <div
            aria-hidden
            className="absolute rounded-md border border-dashed border-neutral-400"
            style={{ left: inFlow.x, top: inFlow.y, width: layerSize.width, height: layerSize.height }}
          />
        )}
        {stickAt !== undefined && (
          <div
            aria-hidden
            className="absolute inset-x-0 border-t border-dashed"
            style={{ top: stickAt, borderColor: layerColor }}
          >
            <span className="absolute top-0.5 right-1 text-2xs" style={{ color: layerColor }}>
              Sticks here
            </span>
          </div>
        )}
        <div
          aria-label="Plans"
          className="absolute grid place-items-center rounded-md border border-neutral-800 bg-neutral-50 text-sm font-semibold"
          style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height, zIndex: z }}
        >
          Plans
        </div>
        {guide(0, { left: rect.x + rect.width / 2 - 8, top: 0, width: 16, height: rect.y }, top, true)}
        {guide(
          2,
          { left: rect.x + rect.width / 2 - 8, top: rect.y + rect.height, width: 16, height: bottom },
          bottom,
          true
        )}
        {guide(3, { top: rect.y + rect.height / 2 - 8, left: 0, height: 16, width: rect.x }, left, false)}
        {guide(
          1,
          { top: rect.y + rect.height / 2 - 8, left: rect.x + rect.width, height: 16, width: right },
          right,
          false
        )}
      </div>
    </div>
  )
}
