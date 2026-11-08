import { Button, Toggle } from "@buildkitgg/shadcn-baseui-kit"
import { FlipHorizontal2, FlipVertical2, Link2, Minus, Plus, Unlink2 } from "lucide-react"
import { useState } from "react"
import { Field } from "../../chrome/fields.tsx"
import { Hint } from "../../chrome/Hint.tsx"
import { PanelSection } from "../../chrome/PanelSection.tsx"
import type { Move, TransformValue } from "./motion-data.ts"
import { PositionInBox } from "./position-box.tsx"
import { readLength } from "./typing.ts"
import { readUnitNumber, UnitField } from "./unit-field.tsx"

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
  const scaleField = (axis: "x" | "y") => {
    const key = axis === "x" ? "scaleX" : "scaleY"
    const current = value[key] ?? 100
    const apply = (next: number) => {
      const rounded = Math.round(next * 100) / 100
      onChange(linked ? { ...value, scaleX: rounded, scaleY: rounded } : { ...value, [key]: rounded })
    }
    return (
      <UnitField
        label={`Scale ${axis.toUpperCase()}`}
        inner={axis.toUpperCase()}
        unit="%"
        shown={value[key] === undefined ? undefined : String(value[key])}
        placeholder="100"
        mixed={mixed}
        onType={(text) => {
          if (text.trim() === "") {
            onChange(linked ? { ...value, scaleX: undefined, scaleY: undefined } : { ...value, [key]: undefined })
            return undefined
          }
          const reading = readUnitNumber(text, {
            units: { "%": 1 },
            current,
            takes: "Scale takes a percentage, such as 105 or 90%"
          })
          if ("reason" in reading) return reading.reason
          if (reading.value <= 0) return "Scale takes more than 0%. Flip it with the flip buttons"
          apply(reading.value)
          return undefined
        }}
        onStep={(up, shift) => apply(Math.max(1, current + (up ? 1 : -1) * (shift ? 10 : 1)))}
        scrub={{
          from: () => current,
          apply: (from, dx, shift) => apply(Math.max(1, from + Math.trunc(dx) * (shift ? 10 : 1)))
        }}
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
            <div className="grid grid-cols-2 gap-1">
              <MoveField axis="x" value={value.moveX} mixed={mixed} onChange={(moveX) => change({ moveX })} />
              <MoveField axis="y" value={value.moveY} mixed={mixed} onChange={(moveY) => change({ moveY })} />
            </div>
          </Field>
          <Field label="Scale">
            <div className="flex flex-col gap-1">
              <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-1">
                {scaleField("x")}
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

/** Move on one axis: a length, `spacing-4` for a step, or a percentage of the layer's own size. */
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
  let shown: string | undefined
  let unit = "px"
  if (value !== undefined && "px" in value) shown = String(value.px)
  if (value !== undefined && "percent" in value) {
    shown = String(value.percent)
    unit = "%"
  }
  const set = (next: Move) => onChange(next)
  const amount = Number(shown ?? 0)
  return (
    <UnitField
      label={label}
      inner={axis.toUpperCase()}
      unit={unit}
      shown={shown}
      placeholder="0"
      mixed={mixed}
      onType={(text) => {
        // A bare number keeps the unit shown, so 25 in a field showing % is 25%.
        const bare = /^\s*-?\d*\.?\d+\s*$/.test(text)
        const reading = readLength(bare && unit === "%" ? `${text}%` : text, {
          label,
          current: value !== undefined && "px" in value ? value.px : 0,
          takesPercent: true
        })
        if ("clear" in reading) {
          onChange(undefined)
          return undefined
        }
        if ("reason" in reading) return reading.reason
        set("px" in reading ? { px: reading.px } : { percent: reading.percent })
        return undefined
      }}
      onStep={(up, shift) => {
        const direction = up ? 1 : -1
        if (value !== undefined && "percent" in value) {
          set({ percent: value.percent + direction * (shift ? 10 : 1) })
          return
        }
        const px = value?.px ?? 0
        // A whole spacing step goes to the next one (16 to 20); a value of its own moves 1px.
        if (px % 4 === 0) set({ px: px + direction * (shift ? 40 : 4) })
        else set({ px: px + direction * (shift ? 10 : 1) })
      }}
      scrub={{
        from: () => amount,
        apply: (from, dx) => set(unit === "%" ? { percent: from + Math.trunc(dx) } : { px: from + Math.trunc(dx) })
      }}
    />
  )
}

/** The card drawn moved and scaled about its origin, over an outline of where the layout puts it. */
export function TransformPreview({ value }: { value: TransformValue }) {
  const move = (part: Move | undefined) => {
    if (part === undefined) return "0"
    return "px" in part ? `${part.px}px` : `${part.percent}%`
  }
  const x = (value.scaleX ?? 100) * (value.flipX ? -1 : 1)
  const y = (value.scaleY ?? 100) * (value.flipY ? -1 : 1)
  const origin = value.origin ?? { x: 50, y: 50 }
  return (
    <div className="relative grid h-72 w-80 place-items-center">
      <div className="relative h-[120px] w-[200px]">
        <div aria-hidden className="absolute inset-0 rounded-xl border border-dashed border-muted-foreground/40" />
        <div
          aria-label="The layer"
          className="absolute inset-0 flex items-end rounded-xl border bg-card p-3 text-xs text-card-foreground shadow-sm"
          style={{
            translate: `${move(value.moveX)} ${move(value.moveY)}`,
            scale: `${x}% ${y}%`,
            transformOrigin: `${origin.x}% ${origin.y}%`
          }}
        >
          Plans
          {/* The origin is a point on the layer, so it moves with it. */}
          <span
            aria-hidden
            className="absolute size-2 -translate-1/2 rounded-full bg-[#0d99ff] ring-2 ring-background"
            style={{ left: `${origin.x}%`, top: `${origin.y}%` }}
          />
        </div>
      </div>
    </div>
  )
}
