import { type PointerEvent, useRef } from "react"
import { kindColors } from "../../canvas/kinds.tsx"
import { Hint } from "../../chrome/Hint.tsx"
import { type BoxPoint, clamp, type SpotValue, spotKeywords, spotValues } from "./css-values.ts"
import { drag, type DragPoint } from "./field-parts.tsx"
import type { BoxPosition } from "./motion-data.ts"
import { readUnitNumber, UnitField } from "./unit-field.tsx"

/*
 * The nine-spot box, which every control that places something in a box draws: Layout's alignment, Transform's
 * Origin, Image's Position and a fill image's position. `NineSpots` is the box itself; `PositionInBox` adds X and Y
 * beside it, for a position that can sit off the spots.
 */

/** One of the nine spots, as percentages from the box's top left. */
export interface Spot {
  x: SpotValue
  y: SpotValue
}

/** A spot's name as its hint and accessible name say it: Top left, Top, Center. */
export const spotLabel = (spot: BoxPoint): string => {
  const name = spotKeywords(spot) ?? "off the spots"
  return name[0]!.toUpperCase() + name.slice(1)
}

/**
 * Where a spot's center sits across the box, as a share: the spots are a third of the box apart, so 0% is a sixth of
 * the way in and 100% five sixths. A dot off the spots sits between their centers by the same rule.
 */
export const spotCenter = (percent: number): number => 1 / 6 + (percent / 100) * (4 / 6)

/** The position a pointer in the box comes to, by the spots' centers; Shift snaps it to the nearest spot. */
export function positionAt(point: DragPoint): BoxPoint {
  const share = (fraction: number) => clamp((fraction - 1 / 6) / (4 / 6), 0, 1) * 100
  const x = share(point.x)
  const y = share(point.y)
  if (point.shift) return { x: Math.round(x / 50) * 50, y: Math.round(y / 50) * 50 }
  return { x: Math.round(x), y: Math.round(y) }
}

export interface NineSpotsProps {
  /** The box's accessible name. */
  label: string
  /** Whether a spot is lit: one for a position, or a whole line where children stretch across it. */
  lit: (spot: Spot) => boolean
  /** Lit in the layer's color when the value is set here, muted when the spot only shows what unset comes to. */
  set?: boolean
  /** A position off the spots, drawn as a dot where it sits between them. */
  off?: BoxPoint
  /** Each spot's accessible name and hint; its name in the box's words unless said. */
  spotName?: (spot: Spot) => string
  onSpot: (spot: Spot) => void
  /** Dragging in the box sets any position, from where the pointer is; the spots then answer only the keyboard. */
  onDrag?: (point: DragPoint) => void
}

/**
 * The nine-spot box: three spots across and three down, the lit ones in the layer's color, each named in its hint.
 * Clicking a spot chooses it; where the box takes any position (`onDrag`), dragging anywhere in it sets one, and a
 * position off the spots shows as a dot between their centers.
 */
export function NineSpots({ label, lit, set = true, off, spotName = spotLabel, onSpot, onDrag }: NineSpotsProps) {
  const box = useRef<HTMLFieldSetElement>(null)
  const press = (event: PointerEvent<HTMLFieldSetElement>) => {
    if (onDrag) drag(event, { move: onDrag, within: box.current, press: true })
  }
  return (
    <fieldset
      ref={box}
      aria-label={label}
      onPointerDown={press}
      className={`relative grid size-16 shrink-0 grid-cols-3 grid-rows-3 rounded-md border bg-muted/40 ${onDrag ? "cursor-crosshair touch-none" : ""}`}
    >
      {spotValues.flatMap((y) =>
        spotValues.map((x) => {
          const spot = { x, y }
          const on = lit(spot)
          const name = spotName(spot)
          return (
            <Hint key={`${x}-${y}`} label={name} wait>
              <button
                type="button"
                aria-label={name}
                aria-pressed={set && on}
                onClick={(event) => {
                  // A press in a box that drags has set it from the pointer already; this is for the keyboard.
                  if (!onDrag || event.detail === 0) onSpot(spot)
                }}
                className="group/spot grid place-items-center rounded-sm outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span
                  className={`block rounded-full ${on ? "size-2" : "size-1 bg-muted-foreground/50 group-hover/spot:bg-muted-foreground"} ${on && !set ? "bg-muted-foreground" : ""}`}
                  style={on && set ? { background: kindColors.layer } : undefined}
                />
              </button>
            </Hint>
          )
        })
      )}
      {off && (
        <span
          aria-hidden
          className="pointer-events-none absolute size-2 -translate-1/2 rounded-full ring-2 ring-background"
          style={{
            left: `${spotCenter(off.x) * 100}%`,
            top: `${spotCenter(off.y) * 100}%`,
            background: kindColors.layer
          }}
        />
      )}
    </fieldset>
  )
}

const xWords: Record<string, number> = { left: 0, center: 50, right: 100 }
const yWords: Record<string, number> = { top: 0, center: 50, bottom: 100 }

/**
 * Position in a box (PAR-652), as Transform's Origin, Image's Position and a fill image's position take it: the nine
 * spots, and X and Y beside them. A position off the spots lights none and shows as a dot where it is. Dragging in the
 * box sets any position, Shift snapping to the spots.
 */
export function PositionInBox({
  label,
  value,
  placeholder = { x: 50, y: 50 },
  mixed,
  onChange
}: {
  label: string
  value: BoxPosition | undefined
  /** Where it is unset: the center for an origin and an image's position. */
  placeholder?: BoxPosition
  mixed?: boolean
  onChange: (value: BoxPosition | undefined) => void
}) {
  const shown = value ?? placeholder
  const onSpot = spotKeywords(shown) !== undefined
  const axisField = (axis: "x" | "y") => {
    const words = axis === "x" ? xWords : yWords
    const current = shown[axis]
    const set = (next: number) => onChange({ ...shown, [axis]: Math.round(next * 100) / 100 })
    return (
      <UnitField
        label={`${label} ${axis.toUpperCase()}`}
        inner={axis.toUpperCase()}
        unit="%"
        shown={value === undefined ? undefined : String(value[axis])}
        placeholder={String(placeholder[axis])}
        mixed={mixed}
        narrow
        onType={(text) => {
          const trimmed = text.trim().toLowerCase()
          if (trimmed === "") {
            onChange(undefined)
            return undefined
          }
          if (words[trimmed] !== undefined) {
            set(words[trimmed]!)
            return undefined
          }
          const reading = readUnitNumber(trimmed, {
            units: { "%": 1 },
            current,
            takes: `${axis.toUpperCase()} takes a percentage, or ${Object.keys(words)
              .join(", ")
              .replace(/, (\w+)$/, " or $1")}`
          })
          if ("reason" in reading) return reading.reason
          set(reading.value)
          return undefined
        }}
        onStep={(up, shift) => set(current + (up ? 1 : -1) * (shift ? 10 : 1))}
        scrub={{ from: () => current, apply: (from, dx) => set(from + Math.trunc(dx)) }}
      />
    )
  }
  return (
    <div className="flex items-start gap-2">
      <NineSpots
        label={label}
        lit={(spot) => onSpot && shown.x === spot.x && shown.y === spot.y}
        set={value !== undefined}
        off={onSpot ? undefined : shown}
        onSpot={onChange}
        onDrag={(point) => onChange(positionAt(point))}
      />
      <div className="grid min-w-0 flex-1 gap-1">
        {axisField("x")}
        {axisField("y")}
      </div>
    </div>
  )
}
