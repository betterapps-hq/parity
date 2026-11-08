/* oxlint-disable jsx-a11y/prefer-tag-over-role -- the dial is a slider drawn as a clock face, which no input element is */
import { Popover, PopoverContent, PopoverTrigger } from "@buildkitgg/shadcn-baseui-kit"
import { type KeyboardEvent, type PointerEvent, type ReactNode, useRef } from "react"
import { Hint } from "../../chrome/Hint.tsx"
import { type Angle, angleDegrees, angleOf, angleUnits, splitUnit } from "./motion-data.ts"
import { readUnitNumber, UnitField } from "./unit-field.tsx"

/**
 * An angle (PAR-652's Angle), as Position's Rotation takes it: degrees with °, typed in deg, turn, rad or grad and kept
 * in degrees, or as read from code until it's edited. Negatives are kept, and angles are never folded into −180 to
 * 180, since a transition to 270° turns the other way from one to −90°. The dial beside it sets it by dragging, Shift
 * snapping to 15°.
 */
export function AngleField({
  label,
  inner,
  value,
  mixed,
  onChange
}: {
  label: string
  inner?: ReactNode
  value: Angle | undefined
  mixed?: boolean
  onChange: (value: Angle | undefined) => void
}) {
  const degrees = angleDegrees(value)
  // A value read from code in another unit keeps it until it's edited, and says so.
  let kept: string | undefined
  if (value !== undefined && "value" in value) {
    const read = splitUnit(value.value)
    if (read && read.unit !== "deg" && read.unit !== "") kept = `as ${value.value}`
  }
  const set = (next: number) => onChange(angleOf(Number(next.toFixed(2))))
  return (
    <UnitField
      label={label}
      inner={inner}
      unit="°"
      shown={value === undefined ? undefined : String(degrees)}
      placeholder="0"
      detail={kept}
      mixed={mixed}
      onType={(text) => {
        if (text.trim() === "") {
          onChange(undefined)
          return undefined
        }
        const reading = readUnitNumber(text, {
          units: angleUnits,
          current: degrees,
          takes: `${label} takes an angle, such as 45, 0.25turn or 1rad`
        })
        if ("reason" in reading) return reading.reason
        set(reading.value)
        return undefined
      }}
      onStep={(up, shift) => set(degrees + (up ? 1 : -1) * (shift ? 15 : 1))}
      scrub={{
        from: () => degrees,
        apply: (from, dx, shift) => set(shift ? Math.round((from + dx) / 15) * 15 : from + Math.trunc(dx))
      }}
      trailing={<AngleDial label={label} degrees={degrees} onChange={set} />}
    />
  )
}

/**
 * The dial, as DevTools' angle clock: 0° points up and it turns clockwise, as CSS does. Dragging round it again keeps
 * counting, so two turns are 720°; Shift snaps to 15°. Arrow keys step 1°, Shift 15°.
 */
export function AngleDial({
  label,
  degrees,
  onChange
}: {
  label: string
  degrees: number
  onChange: (degrees: number) => void
}) {
  return (
    <Popover>
      <Hint label={`Set ${label.toLowerCase()} on a dial`}>
        <PopoverTrigger
          aria-label={`${label} dial`}
          className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-popup-open:bg-accent"
        >
          <DialFace degrees={degrees} size={16} />
        </PopoverTrigger>
      </Hint>
      <PopoverContent className="w-48 items-center gap-2 p-3" align="end">
        <Dial label={label} degrees={degrees} onChange={onChange} />
        <p className="text-center text-[11px] text-muted-foreground">Drag round it. Shift snaps to 15°.</p>
      </PopoverContent>
    </Popover>
  )
}

/** A small clock face with its hand at the angle. */
function DialFace({ degrees, size }: { degrees: number; size: number }) {
  const radians = ((degrees - 90) * Math.PI) / 180
  const middle = size / 2
  const reach = middle - 2
  return (
    <svg aria-hidden width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <circle cx={middle} cy={middle} r={middle - 0.75} fill="none" stroke="currentColor" strokeWidth={1.5} />
      <line
        x1={middle}
        y1={middle}
        x2={middle + Math.cos(radians) * reach}
        y2={middle + Math.sin(radians) * reach}
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
      />
    </svg>
  )
}

function Dial({ label, degrees, onChange }: { label: string; degrees: number; onChange: (degrees: number) => void }) {
  const face = useRef<SVGSVGElement>(null)
  const size = 128
  const middle = size / 2
  const radians = ((degrees - 90) * Math.PI) / 180
  // Where the pointer is round the dial, 0 to 360 from the top, clockwise.
  const pointerAngle = (event: PointerEvent | globalThis.PointerEvent) => {
    const box = face.current!.getBoundingClientRect()
    const x = event.clientX - box.left - box.width / 2
    const y = event.clientY - box.top - box.height / 2
    return ((Math.atan2(y, x) * 180) / Math.PI + 90 + 360) % 360
  }
  const press = (event: PointerEvent<SVGSVGElement>) => {
    event.preventDefault()
    const target = event.currentTarget
    target.setPointerCapture(event.pointerId)
    // Keep whole turns: start from the turn the angle is on, and follow the pointer across 0° without jumping back.
    let last = pointerAngle(event)
    let total = degrees - (((degrees % 360) + 360) % 360) + last
    const snap = (value: number, shift: boolean) => (shift ? Math.round(value / 15) * 15 : Math.round(value))
    onChange(snap(total, event.shiftKey))
    const move = (moveEvent: globalThis.PointerEvent) => {
      const now = pointerAngle(moveEvent)
      let delta = now - last
      if (delta > 180) delta -= 360
      if (delta < -180) delta += 360
      total += delta
      last = now
      onChange(snap(total, moveEvent.shiftKey))
    }
    const end = () => {
      target.removeEventListener("pointermove", move)
      target.removeEventListener("pointerup", end)
      target.removeEventListener("pointercancel", end)
    }
    target.addEventListener("pointermove", move)
    target.addEventListener("pointerup", end)
    target.addEventListener("pointercancel", end)
  }
  const key = (event: KeyboardEvent<SVGSVGElement>) => {
    const step = event.shiftKey ? 15 : 1
    if (event.key === "ArrowUp" || event.key === "ArrowRight") onChange(degrees + step)
    else if (event.key === "ArrowDown" || event.key === "ArrowLeft") onChange(degrees - step)
    else return
    event.preventDefault()
  }
  return (
    <svg
      ref={face}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuenow={degrees}
      aria-valuetext={`${degrees}°`}
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      onPointerDown={press}
      onKeyDown={key}
      className="cursor-grab touch-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <circle cx={middle} cy={middle} r={middle - 1} className="fill-muted/40 stroke-border" />
      {Array.from({ length: 24 }, (_, index) => {
        const tick = ((index * 15 - 90) * Math.PI) / 180
        const long = index % 6 === 0
        return (
          <line
            key={index}
            x1={middle + Math.cos(tick) * (middle - (long ? 12 : 7))}
            y1={middle + Math.sin(tick) * (middle - (long ? 12 : 7))}
            x2={middle + Math.cos(tick) * (middle - 3)}
            y2={middle + Math.sin(tick) * (middle - 3)}
            className="stroke-muted-foreground/50"
          />
        )
      })}
      <line
        x1={middle}
        y1={middle}
        x2={middle + Math.cos(radians) * (middle - 14)}
        y2={middle + Math.sin(radians) * (middle - 14)}
        className="stroke-[#0d99ff]"
        strokeWidth={2}
        strokeLinecap="round"
      />
      <circle cx={middle} cy={middle} r={3} className="fill-[#0d99ff]" />
      <circle
        cx={middle + Math.cos(radians) * (middle - 14)}
        cy={middle + Math.sin(radians) * (middle - 14)}
        r={5}
        className="fill-background stroke-[#0d99ff]"
        strokeWidth={2}
      />
    </svg>
  )
}

/** A card drawn rotated, over an outline of where it sits, since rotating doesn't move what's around it. */
export function RotatedPreview({ degrees }: { degrees: number }) {
  return (
    <div className="relative grid size-64 place-items-center">
      <div
        aria-hidden
        className="absolute h-[120px] w-[200px] rounded-xl border border-dashed border-muted-foreground/40"
      />
      <div
        aria-label="The layer"
        className="relative grid h-[120px] w-[200px] place-items-center rounded-xl border bg-card text-xs text-card-foreground shadow-sm"
        style={{ rotate: `${degrees}deg` }}
      >
        Plans
      </div>
    </div>
  )
}
