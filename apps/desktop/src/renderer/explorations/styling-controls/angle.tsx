/* oxlint-disable jsx-a11y/prefer-tag-over-role -- the dial is a slider drawn as a clock face, which no input element is */
import { Popover, PopoverContent, PopoverTrigger } from "@buildkitgg/shadcn-baseui-kit"
import type { KeyboardEvent, PointerEvent, ReactNode } from "react"
import { kindColors } from "../../canvas/kinds.tsx"
import { Hint } from "../../chrome/Hint.tsx"
import { drag, type Reading, readUnitNumber, ValueField } from "./field-parts.tsx"
import { type Angle, angleDegrees, angleOf, angleUnits, splitUnit } from "./motion-data.ts"

/** Snaps to 15° with Shift, and to whole degrees otherwise, as the dial does; the label's scrub snaps with Shift. */
const snapped = (degrees: number, shift: boolean) => (shift ? Math.round(degrees / 15) * 15 : Math.round(degrees))

/**
 * An angle (PAR-652's Angle), as Position's Rotation takes it: degrees with °, typed in deg, turn, rad or grad with the
 * app's maths and kept in degrees, or as read from code until it's edited. Negatives are kept, and angles are never
 * folded into −180 to 180, since a transition to 270° turns the other way from one to −90°. Up and Down step 1°, Shift
 * 15°; the inner label, where there is one, scrubs a degree a pixel, Shift snapping to 15°. The dial beside it sets it
 * by dragging, Shift snapping to 15°.
 */
export function AngleField({
  label,
  inner,
  value,
  mixed,
  keywords,
  onChange
}: {
  label: string
  inner?: ReactNode
  value: Angle | undefined
  mixed?: boolean
  /** Words the field also reads as angles, as a gradient reads `to right` as 90°. */
  keywords?: Readonly<Record<string, number>>
  onChange: (value: Angle | undefined) => void
}) {
  const degrees = angleDegrees(value)
  // A value read from code in another unit keeps it until it's edited, and says so.
  let kept: string | undefined
  if (value !== undefined && "value" in value) {
    const read = splitUnit(value.value)
    if (read && read.unit !== "deg" && read.unit !== "") kept = `as ${value.value}`
  }
  const angle = (next: number) => angleOf(Number(next.toFixed(2)))
  const read = (text: string): Reading<Angle | undefined> => {
    if (text.trim() === "") return { value: undefined }
    const keyword = keywords?.[text.trim().toLowerCase().replace(/\s+/g, " ")]
    if (keyword !== undefined) return { value: angle(keyword) }
    const reading = readUnitNumber(text, {
      units: angleUnits,
      current: degrees,
      label,
      takes: `Enter an angle, such as 45 or 0.25turn`
    })
    if ("reason" in reading) return reading
    return { value: angle(reading.value) }
  }
  return (
    <ValueField
      label={label}
      inner={inner}
      scrub={{
        from: () => degrees,
        apply: (next) => onChange(angle(next)),
        by: { move: (start, dx, { shift }) => (shift ? snapped(start + dx, true) : start + Math.trunc(dx)) }
      }}
      shown={value === undefined ? undefined : String(degrees)}
      placeholder="0"
      mixed={mixed}
      unit="°"
      comesTo={kept}
      read={read}
      onCommit={onChange}
      onStep={(up, { shift }) => onChange(angle(degrees + (up ? 1 : -1) * (shift ? 15 : 1)))}
      trailing={<AngleDial label={label} degrees={degrees} onChange={(next) => onChange(angle(next))} />}
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
        <p className="text-center type-description text-muted-foreground">Drag round it. Shift snaps to 15°.</p>
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
  const size = 128
  const middle = size / 2
  const radians = ((degrees - 90) * Math.PI) / 180
  const press = (event: PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    const box = event.currentTarget.getBoundingClientRect()
    // Where the pointer is round the dial, 0 to 360 from the top, clockwise.
    const around = ({ clientX, clientY }: { clientX: number; clientY: number }) => {
      const x = clientX - box.left - box.width / 2
      const y = clientY - box.top - box.height / 2
      return ((Math.atan2(y, x) * 180) / Math.PI + 90 + 360) % 360
    }
    // Keep whole turns: start from the turn the angle is on, and follow the pointer across 0° without jumping back.
    let last = around(event)
    let total = degrees - (((degrees % 360) + 360) % 360) + last
    onChange(snapped(total, event.shiftKey))
    drag(event, {
      move: (point) => {
        const now = around(point)
        let delta = now - last
        if (delta > 180) delta -= 360
        if (delta < -180) delta += 360
        total += delta
        last = now
        onChange(snapped(total, point.shift))
      }
    })
  }
  const key = (event: KeyboardEvent<SVGSVGElement>) => {
    const step = event.shiftKey ? 15 : 1
    if (event.key === "ArrowUp" || event.key === "ArrowRight") onChange(degrees + step)
    else if (event.key === "ArrowDown" || event.key === "ArrowLeft") onChange(degrees - step)
    else return
    event.preventDefault()
  }
  const hand = { x: middle + Math.cos(radians) * (middle - 14), y: middle + Math.sin(radians) * (middle - 14) }
  return (
    <svg
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
        x2={hand.x}
        y2={hand.y}
        stroke={kindColors.layer}
        strokeWidth={2}
        strokeLinecap="round"
      />
      <circle cx={middle} cy={middle} r={3} fill={kindColors.layer} />
      <circle cx={hand.x} cy={hand.y} r={5} className="fill-background" stroke={kindColors.layer} strokeWidth={2} />
    </svg>
  )
}
