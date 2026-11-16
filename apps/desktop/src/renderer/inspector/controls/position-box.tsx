import { type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode, useRef, useState } from "react"
import { kindColors } from "../../canvas/kinds.tsx"
import { Hint } from "../../chrome/Hint.tsx"
import { type BoxPoint, clamp, type SpotValue, spotKeywords, spotValues } from "./css-values.ts"
import { arrowMoves, drag, useLiveEdits, type DragPoint } from "./field-parts.tsx"
import { PercentField } from "./number-field.tsx"

/*
 * The nine-spot boxes, which every control that places something in a box draws. `SpotBox` is the one Layout's
 * alignment and a grid child's place in its cell draw what they place in, one stop for Tab. `NineSpots` is the one
 * Transform's Origin, Image's Position and a fill image's position take any position in, and `PositionInBox` adds X
 * and Y beside it, for a position that can sit off the spots.
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

  if (point.shift) {
    return { x: Math.round(x / 50) * 50, y: Math.round(y / 50) * 50 }
  }

  return { x: Math.round(x), y: Math.round(y) }
}

/** Where something sits on an axis of a box, as CSS's alignment keywords say it. */
export type Place = "start" | "center" | "end"

export const places: readonly Place[] = ["start", "center", "end"]

/** A spot by its places across and down. */
export interface PlaceSpot {
  x: Place
  y: Place
}

const placePercents = { start: 0, center: 50, end: 100 } as const

/** A spot's name, as every nine-spot box names it: Top left, Top, Center. */
export const placeName = (spot: PlaceSpot) => spotLabel({ x: placePercents[spot.x], y: placePercents[spot.y] })

/** Where a run of `length` sits on an axis of a box drawn from `from` to `to`, at a place. */
export function along(place: Place, length: number, from: number, to: number) {
  if (place === "start") {
    return from
  }

  if (place === "center") {
    return (from + to - length) / 2
  }

  return to - length
}

/**
 * The box of nine spots that Layout's alignment and a grid child's place in its cell draw what they place in, under
 * the spots: `drawing` draws it, given the spot hovered, to show it there faintly first, and the spots it covers show
 * no dot. It's one stop for Tab, as Figma's is: the spot at `anchor` takes focus, arrow keys move it a spot
 * (`onMove`), and `keys` are its other keys, by their letter. A click says whether the spot was covered and the anchor.
 */
export function SpotBox({
  label,
  hint,
  anchor,
  covers,
  spotLabel: nameOf = placeName,
  dotsOnHover = false,
  className,
  style,
  drawing,
  keys,
  onMove,
  onSpot
}: {
  label: string
  hint: { label: string; detail: string }
  anchor: PlaceSpot
  covers: (spot: PlaceSpot) => boolean
  /** Each spot's accessible name, its place's name unless said. */
  spotLabel?: (spot: PlaceSpot) => string
  /** The uncovered spots' dots show only while the box is hovered, as a grid's cells already mark them. */
  dotsOnHover?: boolean
  /** Its size. */
  className: string
  style?: CSSProperties
  drawing: (hovered: PlaceSpot | undefined) => ReactNode
  keys?: ReadonlyMap<string, () => void>
  onMove: (spot: PlaceSpot) => void
  onSpot: (spot: PlaceSpot, at: { covered: boolean; anchor: boolean }) => void
}) {
  const box = useRef<HTMLFieldSetElement>(null)
  const [hovered, setHovered] = useState<PlaceSpot>()

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const move = arrowMoves.get(event.key)

    if (move) {
      event.preventDefault()

      const next = {
        x: places[clamp(places.indexOf(anchor.x) + move[0], 0, 2)]!,
        y: places[clamp(places.indexOf(anchor.y) + move[1], 0, 2)]!
      }

      onMove(next)
      box.current?.querySelector<HTMLButtonElement>(`[data-spot="${next.x}-${next.y}"]`)?.focus()

      return
    }

    const run = keys?.get(event.key.toLowerCase())

    if (run) {
      event.preventDefault()
      run()
    }
  }

  return (
    <Hint label={hint.label} detail={hint.detail} wait>
      <fieldset
        ref={box}
        aria-label={label}
        onPointerLeave={() => setHovered(undefined)}
        style={style}
        className={`group/box relative m-0 grid min-w-0 shrink-0 grid-cols-3 grid-rows-3 rounded-md border bg-muted/40 p-0.5 ${className}`}
      >
        <svg aria-hidden viewBox="0 0 60 60" className="pointer-events-none absolute inset-0 size-full">
          {drawing(hovered)}
        </svg>
        {places.flatMap((y) =>
          places.map((x) => {
            const spot = { x, y }
            const covered = covers(spot)
            const isAnchor = anchor.x === x && anchor.y === y

            return (
              <button
                key={`${x}-${y}`}
                type="button"
                data-spot={`${x}-${y}`}
                tabIndex={isAnchor ? 0 : -1}
                aria-label={nameOf(spot)}
                aria-pressed={covered}
                onKeyDown={onKeyDown}
                onPointerEnter={() => setHovered(spot)}
                onClick={() => onSpot(spot, { covered, anchor: isAnchor })}
                className="group/spot relative z-10 grid place-items-center rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {!covered && (
                  <span
                    className={`block size-1 rounded-full bg-muted-foreground/50 group-hover/spot:opacity-0 ${dotsOnHover ? "opacity-0 group-hover/box:opacity-100" : ""}`}
                  />
                )}
              </button>
            )
          })
        )}
      </fieldset>
    </Hint>
  )
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
 * Clicking a spot chooses it, as Enter or Space does once the arrows have moved the focus to it; where the box takes any position (`onDrag`), dragging anywhere in it sets one, and a
 * position off the spots shows as a dot between their centers.
 */
export function NineSpots({ label, lit, set = true, off, spotName = spotLabel, onSpot, onDrag }: NineSpotsProps) {
  const live = useLiveEdits()
  const box = useRef<HTMLFieldSetElement>(null)

  const press = (event: PointerEvent<HTMLFieldSetElement>) => {
    if (onDrag) {
      drag(event, { runs: live, move: onDrag, within: box.current, press: true })
    }
  }

  // One Tab stop, as Segments has: the lit spot, or the center where none is. The arrows move the focus to the next
  // spot, and Enter or Space chooses it.
  const anchor = spotValues.flatMap((y) => spotValues.map((x) => ({ x, y }))).find((spot) => lit(spot)) ?? {
    x: 50,
    y: 50
  }

  const arrow = (event: KeyboardEvent<HTMLButtonElement>, from: { x: SpotValue; y: SpotValue }) => {
    const move = arrowMoves.get(event.key)

    if (!move) {
      return
    }

    event.preventDefault()
    const at = (value: SpotValue, by: number) => spotValues[clamp(spotValues.indexOf(value) + by, 0, 2)] ?? value
    const next = { x: at(from.x, move[0]), y: at(from.y, move[1]) }
    box.current?.querySelector<HTMLButtonElement>(`[data-spot="${next.x},${next.y}"]`)?.focus()
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
                data-spot={`${x},${y}`}
                tabIndex={x === anchor.x && y === anchor.y ? 0 : -1}
                onKeyDown={(event) => arrow(event, spot)}
                onClick={(event) => {
                  // A press in a box that drags has set it from the pointer already; this is for the keyboard.
                  if (!onDrag || event.detail === 0) {
                    onSpot(spot)
                  }
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

/** The words X and Y also take, as CSS names the spots' sides. */
const axisWords = {
  x: { left: 0, center: 50, right: 100 },
  y: { top: 0, center: 50, bottom: 100 }
} as const

/**
 * Position in a box (PAR-652), as Transform's Origin, Image's Position and a fill image's position take it: the nine
 * spots, and X and Y beside them as percentages from 0 to 100, which also take the sides' words (left, center, right;
 * top, center, bottom). A position off the spots lights none and shows as a dot where it is. Dragging in the box sets
 * any position, Shift snapping to the spots. Clearing X or Y unsets the position.
 */
export function PositionInBox({
  label,
  value,
  placeholder = { x: 50, y: 50 },
  mixed,
  onChange
}: {
  label: string
  value: BoxPoint | undefined
  /** Where it is unset: the center for an origin and an image's position. */
  placeholder?: BoxPoint
  mixed?: boolean
  onChange: (value: BoxPoint | undefined) => void
}) {
  const shown = value ?? placeholder
  const onSpot = spotKeywords(shown) !== undefined

  const axisField = (axis: "x" | "y") => (
    <PercentField
      label={`${label} ${axis.toUpperCase()}`}
      inner={axis.toUpperCase()}
      value={value?.[axis]}
      placeholder={String(placeholder[axis])}
      keywords={axisWords[axis]}
      mixed={mixed}
      narrow
      onChange={(next) => onChange(next === undefined ? undefined : { ...shown, [axis]: next })}
    />
  )

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
      <div className="grid min-w-0 flex-1 grid-cols-1 gap-y-1">
        {axisField("x")}
        {axisField("y")}
      </div>
    </div>
  )
}
