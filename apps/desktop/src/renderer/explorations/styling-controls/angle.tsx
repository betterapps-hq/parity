/* oxlint-disable jsx-a11y/prefer-tag-over-role -- the knob is a slider drawn as a dial, which no input element is */
import { type KeyboardEvent, type PointerEvent, type ReactNode, useState } from "react"
import { kindColors } from "../../canvas/kinds.tsx"
import { Hint } from "../../chrome/Hint.tsx"
import { drag, type Reading, readUnitNumber, ValueField } from "./field-parts.tsx"
import { type Angle, angleDegrees, angleOf, angleUnits, splitUnit } from "./motion-data.ts"

/** Snaps to 15° with Shift, and to whole degrees otherwise, as the knob does; the glyph's scrub snaps with Shift. */
const snapped = (degrees: number, shift: boolean) => (shift ? Math.round(degrees / 15) * 15 : Math.round(degrees))

/** An angle within one turn, 0 to 360, as a gradient's: 370° is 10°, and −90° is 270°. */
const wrapped = (degrees: number) => Number((((degrees % 360) + 360) % 360).toFixed(2))

/** The whole turns in an angle and where it ends after them: 450° is 1 turn and 90°, −450° is −1 turn and −90°. */
function turnsOf(degrees: number) {
  const whole = Math.trunc(degrees / 360)

  return { whole, rest: Number((degrees - whole * 360).toFixed(2)) }
}

/** 450° as "1 turn + 90°", and 720° as "2 turns", for the knob's name; under a turn there's nothing to add. */
function turnsText(degrees: number) {
  const { whole, rest } = turnsOf(degrees)

  if (whole === 0) {
    return undefined
  }

  const count = `${whole < 0 ? "−" : ""}${Math.abs(whole)} ${Math.abs(whole) === 1 ? "turn" : "turns"}`

  if (rest === 0) {
    return count
  }

  return `${count} ${rest < 0 ? "−" : "+"} ${Math.abs(rest)}°`
}

/**
 * An angle (PAR-652's Angle), as Position's Rotation and a gradient's Angle take it: degrees with °, typed in deg,
 * turn, rad or grad with the app's maths and kept in degrees, or as read from code until it's edited. Negatives are
 * kept, and angles are never folded into −180 to 180, since a transition to 270° turns the other way from one to −90°.
 *
 * The field's glyph is an angle, as Figma's and Penpot's are, and dragging it scrubs a degree a pixel, Shift snapping
 * to 15°. Up and Down step 1°, Shift 15°. Beside it is a knob, as Framer's is, that's dragged round to set the angle
 * where it's seen, with no popover in the way. Past 360° the knob counts the whole turns in its middle.
 *
 * A field can wrap within a turn, where only the direction matters, as a gradient's Angle does: 370° comes to 10°.
 * Rotation doesn't, since a transition to 450° turns further than one to 90°.
 */
export function AngleField({
  label,
  inner = <AngleGlyph />,
  value,
  mixed,
  keywords,
  wraps = false,
  onChange
}: {
  label: string
  inner?: ReactNode
  value: Angle | undefined
  mixed?: boolean
  /** Words the field also reads as angles, as a gradient reads `to right` as 90°. */
  keywords?: Readonly<Record<string, number>>
  /** Keeps the angle within a turn, 0 to 360: typed, stepped, scrubbed or turned past 360°, it comes back round. */
  wraps?: boolean
  onChange: (value: Angle | undefined) => void
}) {
  const degrees = angleDegrees(value)
  // A value read from code in another unit keeps it until it's edited, and says so.
  let kept: string | undefined

  if (value !== undefined && "value" in value) {
    const read = splitUnit(value.value)

    if (read && read.unit !== "deg" && read.unit !== "") {
      kept = `as ${value.value}`
    }
  }

  const angle = (next: number) => angleOf(wraps ? wrapped(next) : Number(next.toFixed(2)))

  const read = (text: string): Reading<Angle | undefined> => {
    if (text.trim() === "") {
      return { value: undefined }
    }

    const keyword = keywords?.[text.trim().toLowerCase().replace(/\s+/g, " ")]

    if (keyword !== undefined) {
      return { value: angle(keyword) }
    }

    const reading = readUnitNumber(text, {
      units: angleUnits,
      current: degrees,
      label,
      takes: `Enter an angle, such as 45 or 0.25turn`
    })

    if ("reason" in reading) {
      return reading
    }

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
      trailing={
        <AngleKnob
          label={label}
          degrees={degrees}
          set={value !== undefined}
          onChange={(next) => onChange(angle(next))}
        />
      }
    />
  )
}

/** An angle drawn as the field's glyph: two arms with the arc between them, as Figma's and Penpot's rotation is. */
export function AngleGlyph() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 14 14"
      className="size-3.5"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 11.5 H2.5 L9 3" strokeWidth="1.4" />
      <path d="M6.5 11.5 A4 4 0 0 0 5.3 8.4" strokeWidth="1.2" opacity="0.7" />
    </svg>
  )
}

/** Where a point is round the knob's middle, 0 to 360 from the top, clockwise, as CSS turns. */
function around(box: DOMRect, { clientX, clientY }: { clientX: number; clientY: number }) {
  const x = clientX - box.left - box.width / 2
  const y = clientY - box.top - box.height / 2

  return ((Math.atan2(y, x) * 180) / Math.PI + 90 + 360) % 360
}

/**
 * The knob: a dial the size of the field's height, its pointer at the angle, 0° straight up and clockwise as CSS
 * turns. Pressing it and dragging round sets the angle from where the pointer is about its middle, so the further out
 * the pointer goes the finer the control; going round again keeps counting, so two turns are 720°. Shift snaps to
 * 15°. Double-clicking it sets 0°. It's a slider for the keyboard: Left and Right (or Down and Up) step 1°, Shift 15°,
 * Page Up and Page Down 15°, and Home 0°.
 *
 * Past a turn, the knob counts the whole turns in its middle, and shows how far round the last turn the angle is as an
 * arc along the rim from the top, with a dot for the pointer at its end: 450° is 1 with a quarter arc.
 */
export function AngleKnob({
  label,
  degrees,
  set = true,
  onChange
}: {
  label: string
  degrees: number
  /** The angle is set here; unset, the pointer's drawn faintly at what unset comes to. */
  set?: boolean
  onChange: (degrees: number) => void
}) {
  const [turning, setTurning] = useState(false)
  const radians = ((degrees - 90) * Math.PI) / 180

  const press = (event: PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) {
      return
    }

    event.preventDefault()
    event.currentTarget.focus()
    const box = event.currentTarget.getBoundingClientRect()
    // Keep whole turns: start from the turn the angle is on, and follow the pointer across 0° without jumping back.
    let last = around(box, event)
    let total = degrees - (((degrees % 360) + 360) % 360) + last
    // A press near the middle has no direction yet, so it only grabs the knob; the angle follows once it moves.
    let moved = false
    setTurning(true)
    drag(event, {
      move: (point) => {
        const now = around(box, point)

        if (!moved) {
          moved = true
          last = now
          total = degrees - (((degrees % 360) + 360) % 360) + now
        }

        let delta = now - last

        if (delta > 180) {
          delta -= 360
        }

        if (delta < -180) {
          delta += 360
        }

        total += delta
        last = now
        onChange(snapped(total, point.shift))
      },
      end: () => setTurning(false)
    })
  }

  const key = (event: KeyboardEvent<SVGSVGElement>) => {
    const step = event.shiftKey ? 15 : 1

    const steps = new Map([
      ["ArrowUp", step],
      ["ArrowRight", step],
      ["ArrowDown", -step],
      ["ArrowLeft", -step],
      ["PageUp", 15],
      ["PageDown", -15]
    ])

    const by = steps.get(event.key)

    if (event.key === "Home") {
      onChange(0)
    } else if (by !== undefined) {
      onChange(degrees + by)
    } else {
      return
    }

    event.preventDefault()
  }

  const size = 28
  const middle = size / 2
  const rim = middle - 2.5
  const { whole, rest } = turnsOf(degrees)
  const lapped = whole !== 0
  const tip = { x: middle + Math.cos(radians) * (rim - 2.5), y: middle + Math.sin(radians) * (rim - 2.5) }
  const hand = turning ? kindColors.layer : "currentColor"
  // How far round the last turn: an arc along the rim from the top, clockwise, or back for a negative angle.
  const lap = rim + 0.5
  const end = { x: middle + Math.sin((rest * Math.PI) / 180) * lap, y: middle - Math.cos((rest * Math.PI) / 180) * lap }
  const arc = `M ${middle} ${middle - lap} A ${lap} ${lap} 0 ${Math.abs(rest) > 180 ? 1 : 0} ${rest > 0 ? 1 : 0} ${end.x} ${end.y}`

  return (
    <Hint
      label={`${label} knob`}
      detail={"Drag round it to turn. Shift snaps to 15°.\nDouble-click for 0°."}
      hidden={turning}
      wait
    >
      <svg
        role="slider"
        tabIndex={0}
        aria-label={`${label} knob`}
        aria-valuenow={degrees}
        aria-valuetext={lapped ? `${degrees}°, ${turnsText(degrees)}` : `${degrees}°`}
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        onPointerDown={press}
        onDoubleClick={() => onChange(0)}
        onKeyDown={key}
        className={`group/knob shrink-0 touch-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring ${turning ? "cursor-grabbing" : "cursor-grab"} ${set ? "text-foreground" : "text-muted-foreground"}`}
      >
        <circle
          cx={middle}
          cy={middle}
          r={middle - 0.5}
          className="fill-muted stroke-transparent group-hover/knob:stroke-border dark:fill-input/40"
        />
        {/* The quarters, faint, so up, right, down and left can be read at a glance. */}
        {[0, 90, 180, 270].map((quarter) => {
          const at = ((quarter - 90) * Math.PI) / 180

          return (
            <line
              key={quarter}
              x1={middle + Math.cos(at) * (rim + 0.5)}
              y1={middle + Math.sin(at) * (rim + 0.5)}
              x2={middle + Math.cos(at) * (rim - 1.5)}
              y2={middle + Math.sin(at) * (rim - 1.5)}
              className="stroke-muted-foreground/40"
              strokeWidth={1}
              strokeLinecap="round"
            />
          )
        })}
        {lapped && rest !== 0 && (
          <path d={arc} fill="none" stroke={hand} strokeOpacity={0.55} strokeWidth={1.5} strokeLinecap="round" />
        )}
        {lapped && rest === 0 && (
          <circle cx={middle} cy={middle} r={lap} fill="none" stroke={hand} strokeOpacity={0.55} strokeWidth={1.5} />
        )}
        {/* Past a turn, the pointer's a dot at the end of the arc, leaving the middle for the count. */}
        {lapped ? (
          <circle cx={end.x} cy={end.y} r={1.75} fill={hand} />
        ) : (
          <line x1={middle} y1={middle} x2={tip.x} y2={tip.y} stroke={hand} strokeWidth={1.75} strokeLinecap="round" />
        )}
        {lapped ? (
          <text
            x={middle}
            y={middle}
            textAnchor="middle"
            dominantBaseline="central"
            fill={hand}
            className="text-[9px] font-medium tabular-nums select-none"
          >
            {whole < 0 ? `−${-whole}` : whole}
          </text>
        ) : (
          <circle cx={middle} cy={middle} r={1.75} fill={hand} />
        )}
      </svg>
    </Hint>
  )
}
