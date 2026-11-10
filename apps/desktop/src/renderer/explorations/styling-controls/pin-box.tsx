import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
  ToggleGroup,
  ToggleGroupItem
} from "@buildkitgg/shadcn-baseui-kit"
import {
  AppWindow,
  ArrowUpToLine,
  Crosshair,
  Ellipsis,
  Layers,
  Maximize,
  Move,
  MoveDiagonal2,
  Rows3
} from "lucide-react"
import type { CSSProperties, ReactNode } from "react"
import { kindColors } from "../../canvas/kinds.tsx"
import { Hint } from "../../chrome/Hint.tsx"
import { PanelSection } from "../../chrome/PanelSection.tsx"
import { SideValue } from "./box-model.tsx"
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
import { type Side, type SideRules, type Sides, sideNames, sideNumber, sideRules } from "./sides-writes.ts"
import { setSides, SideField, spreadTo } from "./sides.tsx"

/*
 * Position (PAR-652): Placement's toggles beside Layer order, then the inset box for a layer that isn't In layout,
 * which lays the insets out as the box model lays out spacing: what the layer is placed against, named in its corner,
 * the layer in its middle, and each side's inset where the side is. PositionPreview is the canvas's stand-in: Pricing
 * with Plans placed in it, each pinned side measured to Pricing's edge, drawn in the layer's color as the canvas draws
 * a selection.
 */

/** The layer's color, which the canvas draws a selected layer's outline and measurements in. */
const layerColor = kindColors.layer

const tint = (strength: number) => `color-mix(in oklch, ${layerColor} ${strength}%, transparent)`

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

/**
 * What each placement places the layer against, which the inset box names in its corner, and what its insets'
 * percentages are of. Relative's insets move it from where In layout would put it.
 */
const against = {
  absolute: { name: "Parent", of: "the parent" },
  fixed: { name: "Window", of: "the window" },
  sticky: { name: "Scroll area", of: "the scroll area" },
  relative: { name: "In layout", of: "the parent" }
} as const satisfies Record<Exclude<Placement, "static">, { name: string; of: string }>

/** An inset as the box holds it, where `auto` is unpinned. */
const unpinnedAuto = (side: Side) => (side === "auto" ? undefined : side)

/** A share of what it's placed against, as Scale pins it, to a tenth of a percent. */
const tenth = (number: number) => Number(formatNumber(number, 1))

/** An offset from the center is a length: it has no percentage, and no Auto. */
const offsetRules: SideRules = { ...sideRules.inset, percent: false, auto: false }

/**
 * Position, for a layer that isn't a design's root: Placement's toggles (In layout, Absolute, Fixed, Sticky, and
 * Relative once set from More) beside Layer order, shown by default when Absolute, Fixed or Sticky, then the inset box
 * when it isn't In layout.
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
  const placement = position.placement
  const shownPlacements = placements.filter((option) => option.value !== "relative" || placement === "relative")

  const layerOrderShown =
    layerOrderAdded || layerOrder !== undefined || ["absolute", "fixed", "sticky"].includes(placement)

  const choose = (next: Placement) => {
    if (next === placement) {
      return
    }

    if (next === "static") {
      set({ placement: next, insets: [undefined, undefined, undefined, undefined] })
    } else if (next === "sticky") {
      set({ placement: next, insets: [{ number: 0 }, undefined, undefined, undefined] })
    } else if (next === "relative") {
      set({ placement: next, insets: [undefined, undefined, undefined, undefined] })
    } else if (placement === "absolute" || placement === "fixed") {
      set({ ...position, placement: next })
    }
    // Taken out of the layout, it stays where it was, pinned to the left and top, as Figma's absolute position does.
    else {
      set({ placement: next, insets: [{ number: inFlow.y }, undefined, undefined, { number: inFlow.x }] })
    }
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
      <div className="flex flex-col gap-3">
        {/* Side by side, as both say how the layer sits among the others. */}
        <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-2">
          <Field label="Placement" half>
            <ToggleGroup
              variant="outline"
              size="sm"
              spacing={0}
              aria-label="Placement"
              value={[placement]}
              onValueChange={([next]) => {
                const chosen = placements.find((option) => option.value === next)

                if (chosen) {
                  choose(chosen.value)
                }
              }}
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
          {layerOrderShown && <LayerOrderField value={layerOrder} context={context} half onChange={onLayerOrder} />}
        </div>
        {placement !== "static" && (
          <InsetBox position={position} placement={placement} stopped={stickyStopped} set={set} />
        )}
        {stickyStopped && (
          <MessageLine
            message={{
              tone: "note",
              text: stickyStopped,
              action: onClipInstead && { label: "Clip without scrolling", run: onClipInstead }
            }}
          />
        )}
      </div>
    </PanelSection>
  )
}

/** A toggle in the insets' header, drawn as the other headers' toggles are. */
function HeaderToggle({
  label,
  pressed,
  onClick,
  children
}: {
  label: string
  pressed: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <Hint label={label}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={pressed}
        onClick={onClick}
        className="grid size-5 shrink-0 place-items-center rounded text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring aria-pressed:bg-muted aria-pressed:text-foreground dark:hover:bg-input/40 dark:aria-pressed:bg-input/60 [&_svg]:size-3"
      >
        {children}
      </button>
    </Hint>
  )
}

/** Where each side's band sits in the box's grid, from the top, clockwise: across the top, beside the layer, under. */
const bandCells = [
  "col-span-3 row-start-1",
  "col-start-3 row-start-2",
  "col-span-3 row-start-3",
  "col-start-1 row-start-2"
]

/**
 * The inset box, laid out as the box model is: what the layer is placed against, named in its corner, the layer in its
 * middle, and each side's inset on a line from the edge to the layer, where the side is. A pinned side's line is solid,
 * in the layer's color, as the canvas measures it; an unpinned side's is dashed, and says Auto. Clicking a side pins it
 * at its distance, and again unpins it, as Framer's pin box does. Its value opens its field in a popover, with room for
 * a token's chip; typing in an unpinned side pins it, and Alt and Alt+Shift reach the opposite side and all four. The
 * layer's center lines center it on that axis, Absolute or Fixed, keeping its offset from the center, which the start
 * side holds. Fill and Scale, in the header, pin every side at 0, or at its share of what it's placed against.
 */
function InsetBox({
  position,
  placement,
  stopped,
  set
}: {
  position: Position
  placement: Exclude<Placement, "static">
  stopped?: string
  set: (position: Position) => void
}) {
  const spacing = useTokens("spacing").tokens
  const rect = placed(position, spacing)
  const measured = distances(rect)
  // Sticky and Relative insets are offsets, from where it sticks or where it was, so they start at 0 and don't center.
  const offsets = placement === "sticky" || placement === "relative"
  const { name: againstName, of } = against[placement]
  const centerOf = (index: number) => (index % 2 === 1 ? position.centerX : position.centerY)
  const pinned = (index: number) => centerOf(index) === undefined && position.insets[index] !== undefined

  // The sides an edit reached take its value; pinning a side of a centered axis ends the centering.
  const setInsets = (reached: readonly number[], value: Side) => {
    const next: Position = { ...position, insets: setSides(position.insets, reached, unpinnedAuto(value)) }

    if (value !== undefined && value !== "auto") {
      if (reached.some((index) => index % 2 === 1)) {
        delete next.centerX
      }

      if (reached.some((index) => index % 2 === 0)) {
        delete next.centerY
      }
    }

    set(next)
  }

  const toggle = (index: number) =>
    setInsets([index], pinned(index) ? undefined : { number: offsets ? 0 : measured[index]! })

  // Centered, it keeps its offset from the center, as Figma's Center does; uncentered, it stays put, pinned at the start.
  const center = (horizontal: boolean) => {
    const key = horizontal ? "centerX" : "centerY"
    const [startIndex, endIndex] = horizontal ? [3, 1] : [0, 2]
    const insets: Sides = [...position.insets]
    const next: Position = { ...position, insets }

    if (position[key] === undefined) {
      const of = horizontal ? parent.width : parent.height
      const size = horizontal ? layerSize.width : layerSize.height
      insets[startIndex] = undefined
      insets[endIndex] = undefined
      next[key] = Math.round((horizontal ? rect.x : rect.y) - (of - size) / 2)
    } else {
      delete next[key]
      insets[startIndex] = { number: measured[startIndex]! }
    }

    set(next)
  }

  const isNumber = (side: Side, number: number) =>
    side !== undefined && side !== "auto" && "number" in side && side.number === number

  const isShare = (side: Side) => side !== undefined && side !== "auto" && "percent" in side
  const filled = position.insets.every((side) => isNumber(side, 0))
  const scaled = position.insets.every(isShare)

  // Filled, pressing it again leaves the layer its own size, at the top left.
  const fill = () =>
    set({
      ...position,
      insets: filled
        ? [{ number: 0 }, undefined, undefined, { number: 0 }]
        : [{ number: 0 }, { number: 0 }, { number: 0 }, { number: 0 }],
      centerX: undefined,
      centerY: undefined
    })

  // Each side at its share of what it's placed against, where it is now, so it grows with it; again, back to pixels.
  const scale = () => {
    const of = [parent.height, parent.width, parent.height, parent.width]

    const at = (index: number): Side =>
      scaled ? { number: measured[index]! } : { percent: tenth((measured[index]! / of[index]!) * 100) }

    set({ ...position, insets: [at(0), at(1), at(2), at(3)], centerX: undefined, centerY: undefined })
  }

  const value = (index: number): ReactNode => {
    const name = sideNames[index]!
    const centered = centerOf(index)

    // Centered, the end side says so, and the start side holds the offset from the center, where CSS writes it.
    if (centered !== undefined && (index === 1 || index === 2)) {
      return <span className="block h-5 px-1 text-xs leading-5 text-muted-foreground">Center</span>
    }

    if (centered !== undefined) {
      const axis = index === 3 ? "centerX" : "centerY"

      return (
        <SideValue
          label={`${index === 3 ? "Horizontal" : "Vertical"} offset from center`}
          value={centered === 0 ? undefined : { number: centered }}
          rules={offsetRules}
          unset={{ number: "Center", name: "Centered" }}
          signed
          onChange={(next) => set({ ...position, [axis]: sideNumber(unpinnedAuto(next), spacing) ?? 0 })}
        />
      )
    }

    return (
      <SideValue
        label={`${name} inset`}
        value={position.insets[index]}
        rules={sideRules.inset}
        placeholder="Auto"
        unset={{ number: "Auto", name: "Auto" }}
        measured={offsets ? undefined : measured[index]}
        percentOf={`${of}'s ${index % 2 === 0 ? "height" : "width"}`}
        spreads
        side={index === 2 ? "bottom" : "top"}
        onChange={(next, spread) => setInsets(spreadTo([index], spread), next)}
        onShorthand={([top, right, bottom, left]) =>
          set({
            ...position,
            insets: [unpinnedAuto(top), unpinnedAuto(right), unpinnedAuto(bottom), unpinnedAuto(left)],
            centerX: undefined,
            centerY: undefined
          })
        }
      />
    )
  }

  // A side's band: the line from the edge to the layer, which pins and unpins the side, with its value on it.
  const band = (index: number) => {
    const on = pinned(index)
    const across = index % 2 === 1
    const side = sideNames[index]!.toLowerCase()

    const line = (
      <span
        aria-hidden
        className={`min-h-0 min-w-0 flex-1 ${across ? "h-0 border-t" : "w-0 border-l"} ${on ? "" : "border-dashed border-muted-foreground/40 group-hover/band:border-muted-foreground"}`}
        style={on ? { borderColor: layerColor, borderWidth: across ? "2px 0 0" : "0 0 0 2px" } : undefined}
      />
    )

    return (
      <div key={index} className={`group/band relative ${bandCells[index]}`}>
        <Hint label={on ? `Unpin the ${side}` : `Pin the ${side}`}>
          <button
            type="button"
            aria-label={`Pin the ${side}`}
            aria-pressed={on}
            onClick={() => toggle(index)}
            className="absolute inset-0 outline-none hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          />
        </Hint>
        <div
          className={`pointer-events-none absolute inset-0 flex items-center ${across ? "px-px" : "flex-col py-px"}`}
        >
          {line}
          <span className={`pointer-events-auto ${across ? "mx-0.5" : "my-0.5"}`}>{value(index)}</span>
          {line}
        </div>
      </div>
    )
  }

  /*
   * A center line in the layer, apart from the sides' lines: down its middle centers it across, and across its middle
   * centers it down. Where they cross is the short one's, so all of it can be clicked.
   */
  const centerLine = (horizontal: boolean) => {
    const on = (horizontal ? position.centerX : position.centerY) !== undefined
    const label = horizontal ? "Center horizontally" : "Center vertically"

    return (
      <Hint label={on ? `Stop centering ${horizontal ? "horizontally" : "vertically"}` : label}>
        <button
          type="button"
          aria-label={label}
          aria-pressed={on}
          onClick={() => center(horizontal)}
          className={`group/center absolute grid place-items-center rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring ${horizontal ? "inset-y-0 left-1/2 z-10 w-3 -translate-x-1/2" : "inset-x-[15%] top-1/2 h-4 -translate-y-1/2"}`}
        >
          <span
            className={`block ${horizontal ? "h-3.5 w-0 border-l" : "h-0 w-12 border-t"} ${on ? "" : "border-dashed border-muted-foreground/40 group-hover/center:border-muted-foreground"}`}
            style={on ? { borderColor: layerColor, borderWidth: horizontal ? "0 0 0 2px" : "2px 0 0" } : undefined}
          />
        </button>
      </Hint>
    )
  }

  return (
    <Field
      label="Insets"
      hint={[stopped, "Click a side to pin it at its distance, and again to unpin it"].filter(Boolean).join("\n")}
      action={
        !offsets && (
          <>
            <HeaderToggle label={`Fill ${of}`} pressed={filled} onClick={fill}>
              <Maximize />
            </HeaderToggle>
            <HeaderToggle label={`Scale with ${of}`} pressed={scaled} onClick={scale}>
              <MoveDiagonal2 />
            </HeaderToggle>
          </>
        )
      }
    >
      <fieldset
        aria-label="Insets"
        className={`relative m-0 grid min-w-0 p-0 grid-cols-[minmax(0,1fr)_5rem_minmax(0,1fr)] grid-rows-[2.5rem_2rem_2.5rem] overflow-hidden rounded-md border border-dashed border-muted-foreground/40 bg-muted/30 ${stopped ? "opacity-50" : ""}`}
      >
        {band(0)}
        {band(3)}
        <div
          className="relative col-start-2 row-start-2 rounded-sm border bg-background"
          style={{ borderColor: tint(70) }}
        >
          {!offsets && centerLine(true)}
          {!offsets && centerLine(false)}
        </div>
        {band(1)}
        {band(2)}
        <span className="pointer-events-none absolute top-1 left-1.5 text-2xs text-muted-foreground select-none">
          {againstName}
        </span>
      </fieldset>
    </Field>
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
  half,
  onChange
}: {
  value: Side
  /** The stacking context it orders within, and what makes it one. */
  context: string
  mixed?: boolean
  /** Beside another field, as Position's is beside Placement. */
  half?: boolean
  onChange: (value: Side) => void
}) {
  return (
    <Field label="Layer order" hint={`Orders this layer within ${context}. Higher is in front.`} half={half}>
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
    if (index % 2 === 1 && position.centerX !== undefined) {
      return false
    }

    if (index % 2 === 0 && position.centerY !== undefined) {
      return false
    }

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

  if (position.placement === "fixed") {
    title = "The window"
  }

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
