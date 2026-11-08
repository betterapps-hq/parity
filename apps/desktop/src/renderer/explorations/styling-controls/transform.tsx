import { Button, Toggle } from "@buildkitgg/shadcn-baseui-kit"
import { FlipHorizontal2, FlipVertical2, Link2, Minus, Plus, Unlink2 } from "lucide-react"
import { useState } from "react"
import { kindColors } from "../../canvas/kinds.tsx"
import { Field } from "../../chrome/fields.tsx"
import { Hint } from "../../chrome/Hint.tsx"
import { PanelSection } from "../../chrome/PanelSection.tsx"
import { formatNumber, stepSpacing } from "./css-values.ts"
import type { Draft } from "./data.ts"
import { PercentField, type Reading, useTokenSets, ValueField } from "./field-parts.tsx"
import type { Move, TransformValue } from "./motion-data.ts"
import { Card, drawnStyle, PreviewStage } from "./playground.tsx"
import { PositionInBox } from "./position-box.tsx"
import { readLength } from "./typing.ts"

/*
 * Transform (PAR-652): Move, Scale with its flips, and Origin, as fixed rows, since CSS applies translate, rotate and
 * scale in its own order whatever the panel's. Rotation is Position's. They move how the layer is drawn, not where
 * the layout puts it, so nothing around it moves, which the section says under its title.
 */
export function TransformSection({
  value,
  mixed,
  onChange
}: {
  value: TransformValue
  mixed?: boolean
  onChange: (value: TransformValue) => void
}) {
  const set = Object.values(value).some((part) => part !== undefined)
  const [added, setAdded] = useState(set)
  const shown = added || set
  const change = (part: Partial<TransformValue>) => onChange({ ...value, ...part })
  const action = (
    <Hint label={shown ? "Remove transform" : "Add transform"}>
      <Button
        variant="ghost"
        size="icon-sm"
        className="size-6"
        aria-label={shown ? "Remove transform" : "Add transform"}
        onClick={() => {
          if (shown) onChange({})
          setAdded(!shown)
        }}
      >
        {shown ? <Minus /> : <Plus />}
      </Button>
    </Hint>
  )
  const linked = value.scaleLinked ?? true
  // Scale is a percentage, any whole one a step; it flips with the flip buttons, so it stays above 0.
  const scaleField = (axis: "x" | "y") => {
    const key = axis === "x" ? "scaleX" : "scaleY"
    return (
      <PercentField
        label={`Scale ${axis.toUpperCase()}`}
        inner={axis.toUpperCase()}
        value={value[key]}
        min={1}
        max={Infinity}
        mixed={mixed}
        // Each in its place in the row, so what either says goes under the whole row.
        rowClassName={axis === "x" ? "col-start-1 row-start-1" : "col-start-3 row-start-1"}
        onChange={(next) => onChange(linked ? { ...value, scaleX: next, scaleY: next } : { ...value, [key]: next })}
      />
    )
  }
  return (
    <PanelSection
      title="Transform"
      action={action}
      description={
        shown ? "Moves how the layer is drawn, not where the layout puts it, so nothing around it moves." : undefined
      }
    >
      {shown && (
        <div className="flex flex-col gap-1">
          <Field label="Move" hint="A percentage is of the layer's own size">
            <div className="grid grid-cols-2 gap-x-1">
              <MoveField axis="x" value={value.moveX} mixed={mixed} onChange={(moveX) => change({ moveX })} />
              <MoveField axis="y" value={value.moveY} mixed={mixed} onChange={(moveY) => change({ moveY })} />
            </div>
          </Field>
          <Field label="Scale">
            <div className="flex flex-col gap-1">
              <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-x-1">
                {scaleField("x")}
                <div className="col-start-2 row-start-1">
                  <Hint label={linked ? "Scale X and Y apart" : "Scale X and Y together"}>
                    <Toggle
                      size="sm"
                      className="size-7 min-w-7 px-0"
                      aria-label="Scale X and Y together"
                      pressed={linked}
                      onPressedChange={(pressed) =>
                        onChange({
                          ...value,
                          scaleLinked: pressed ? undefined : false,
                          ...(pressed ? { scaleY: value.scaleX } : {})
                        })
                      }
                    >
                      {linked ? <Link2 /> : <Unlink2 />}
                    </Toggle>
                  </Hint>
                </div>
                {scaleField("y")}
              </div>
              <div className="flex gap-1">
                <Hint label="Flip horizontally" detail="Scales X by −100%">
                  <Toggle
                    variant="outline"
                    size="sm"
                    className="h-7 px-2"
                    aria-label="Flip horizontally"
                    pressed={value.flipX ?? false}
                    onPressedChange={(flipX) => change({ flipX: flipX || undefined })}
                  >
                    <FlipHorizontal2 />
                  </Toggle>
                </Hint>
                <Hint label="Flip vertically" detail="Scales Y by −100%">
                  <Toggle
                    variant="outline"
                    size="sm"
                    className="h-7 px-2"
                    aria-label="Flip vertically"
                    pressed={value.flipY ?? false}
                    onPressedChange={(flipY) => change({ flipY: flipY || undefined })}
                  >
                    <FlipVertical2 />
                  </Toggle>
                </Hint>
              </div>
            </div>
          </Field>
          <Field label="Origin" hint="The point it scales and rotates about">
            <PositionInBox
              label="Origin"
              value={value.origin}
              mixed={mixed}
              onChange={(origin) => change({ origin })}
            />
          </Field>
        </div>
      )}
    </PanelSection>
  )
}

/**
 * Move on one axis: a length, `spacing-4` for a step, or a percentage of the layer's own size. A length steps and
 * scrubs along the spacing scale, as every spacing length does; a percentage by 1, 10 with Shift.
 */
function MoveField({
  axis,
  value,
  mixed,
  onChange
}: {
  axis: "x" | "y"
  value: Move | undefined
  mixed?: boolean
  onChange: (value: Move | undefined) => void
}) {
  const label = `Move ${axis.toUpperCase()}`
  const percent = value !== undefined && "percent" in value
  let amount = 0
  if (value !== undefined) amount = "px" in value ? value.px : value.percent
  const shown = value === undefined ? undefined : formatNumber(amount)
  const unit = percent ? "%" : "px"
  const read = (text: string): Reading<Move | undefined> => {
    // A bare number keeps the unit shown, so 25 in a field showing % is 25%.
    const bare = /^\s*-?\d*\.?\d+\s*$/.test(text)
    const reading = readLength(bare && percent ? `${text}%` : text, {
      label,
      current: value !== undefined && "px" in value ? value.px : 0,
      takesPercent: true
    })
    if ("clear" in reading) return { value: undefined }
    if ("reason" in reading) return reading
    return { value: "px" in reading ? { px: reading.px } : { percent: reading.percent } }
  }
  const moved = (next: number): Move => (percent ? { percent: next } : { px: next })
  return (
    <ValueField
      label={label}
      inner={axis.toUpperCase()}
      scrub={{
        from: () => amount,
        apply: (next) => onChange(moved(next)),
        by: percent ? { step: 1, shiftStep: 10 } : { spacing: true }
      }}
      shown={shown}
      placeholder="0"
      mixed={mixed}
      unit={unit}
      // Each in its column, so what either says goes under both.
      rowClassName={axis === "x" ? "col-start-1 row-start-1" : "col-start-2 row-start-1"}
      read={read}
      onCommit={onChange}
      onStep={(up, { shift }) => {
        const count = (up ? 1 : -1) * (shift ? 10 : 1)
        onChange(moved(percent ? amount + count : stepSpacing(amount, count)))
      }}
    />
  )
}

/** The layer as the previews draw it: the card, white, with the project's large radius. */
const layerCard: Draft = { background: "card", radius: "radius-xl" }

/**
 * The card drawn moved, scaled and rotated about its origin, over an outline of where the layout puts it, since
 * nothing around it moves. The origin is a dot on the layer, in the layer's color, so it moves with it.
 */
export function TransformPreview({ value, rotate = 0 }: { value: TransformValue; rotate?: number }) {
  const sets = useTokenSets()
  const move = (part: Move | undefined) => {
    if (part === undefined) return "0"
    return "px" in part ? `${part.px}px` : `${part.percent}%`
  }
  const x = (value.scaleX ?? 100) * (value.flipX ? -1 : 1)
  const y = (value.scaleY ?? 100) * (value.flipY ? -1 : 1)
  const origin = value.origin ?? { x: 50, y: 50 }
  const style = drawnStyle(layerCard, sets)
  return (
    <PreviewStage>
      <div className="relative">
        <div
          aria-hidden
          className="absolute inset-0 border border-dashed border-muted-foreground/60"
          style={{ borderRadius: style.borderRadius }}
        />
        <Card
          style={{
            ...style,
            translate: `${move(value.moveX)} ${move(value.moveY)}`,
            scale: `${x}% ${y}%`,
            rotate: `${rotate}deg`,
            transformOrigin: `${origin.x}% ${origin.y}%`
          }}
        >
          {/* At the corner, so the origin's dot at the center doesn't cover it. */}
          <span className="absolute bottom-3 left-3">Plans</span>
          <span
            aria-hidden
            className="absolute size-2 -translate-1/2 rounded-full ring-2 ring-background"
            style={{ left: `${origin.x}%`, top: `${origin.y}%`, background: kindColors.layer }}
          />
        </Card>
      </div>
    </PreviewStage>
  )
}
