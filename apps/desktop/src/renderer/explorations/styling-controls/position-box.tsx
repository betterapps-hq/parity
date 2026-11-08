import { type PointerEvent, useRef } from "react"
import { Hint } from "../../chrome/Hint.tsx"
import { type BoxPosition, spotName, spotValues } from "./motion-data.ts"
import { readUnitNumber, UnitField } from "./unit-field.tsx"

/*
 * Position in a box (PAR-652), as Transform's Origin, Image's Position and a fill image's position take it: the nine
 * spots, and X and Y beside them. A position off the spots lights none and shows as a dot where it is. Dragging in the
 * box sets any position, Shift snapping to the spots.
 */

const xWords: Record<string, number> = { left: 0, center: 50, right: 100 }
const yWords: Record<string, number> = { top: 0, center: 50, bottom: 100 }

const spotLabel = (x: number, y: number) => {
  const name = spotName({ x, y })!
  return name[0]!.toUpperCase() + name.slice(1)
}

/** Where a spot's center sits across the box, as a share: the spots are a third of the box apart. */
const across = (percent: number) => 1 / 6 + (percent / 100) * (4 / 6)

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
  const box = useRef<HTMLFieldSetElement>(null)
  const shown = value ?? placeholder
  const onSpot = spotName(shown) !== undefined
  const fromPointer = (event: PointerEvent | globalThis.PointerEvent): BoxPosition => {
    const rect = box.current!.getBoundingClientRect()
    const share = (offset: number, size: number) => Math.min(1, Math.max(0, (offset / size - 1 / 6) / (4 / 6)))
    const x = share(event.clientX - rect.left, rect.width) * 100
    const y = share(event.clientY - rect.top, rect.height) * 100
    if (event.shiftKey) return { x: Math.round(x / 50) * 50, y: Math.round(y / 50) * 50 }
    return { x: Math.round(x), y: Math.round(y) }
  }
  const press = (event: PointerEvent<HTMLFieldSetElement>) => {
    if (event.button !== 0) return
    const target = event.currentTarget
    target.setPointerCapture(event.pointerId)
    onChange(fromPointer(event))
    const move = (moveEvent: globalThis.PointerEvent) => onChange(fromPointer(moveEvent))
    const end = () => {
      target.removeEventListener("pointermove", move)
      target.removeEventListener("pointerup", end)
      target.removeEventListener("pointercancel", end)
    }
    target.addEventListener("pointermove", move)
    target.addEventListener("pointerup", end)
    target.addEventListener("pointercancel", end)
  }
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
      <fieldset
        ref={box}
        aria-label={label}
        onPointerDown={press}
        className="relative grid size-[64px] shrink-0 cursor-crosshair touch-none grid-cols-3 grid-rows-3 rounded-md border bg-muted/40"
      >
        {spotValues.flatMap((y) =>
          spotValues.map((x) => {
            const lit = onSpot && shown.x === x && shown.y === y
            return (
              <Hint key={`${x}-${y}`} label={spotLabel(x, y)} wait>
                <button
                  type="button"
                  aria-label={spotLabel(x, y)}
                  aria-pressed={value !== undefined && lit}
                  onClick={(event) => {
                    // A press already set it from the pointer; this is for the keyboard.
                    if (event.detail === 0) onChange({ x, y })
                  }}
                  className="group grid place-items-center rounded-sm outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span
                    className={`block rounded-full ${lit ? "size-2" : "size-1 bg-muted-foreground/50 group-hover:bg-muted-foreground"} ${lit && value !== undefined ? "bg-[#0d99ff]" : ""} ${lit && value === undefined ? "bg-muted-foreground" : ""}`}
                  />
                </button>
              </Hint>
            )
          })
        )}
        {!onSpot && (
          <span
            aria-hidden
            className="pointer-events-none absolute size-2 -translate-1/2 rounded-full bg-[#0d99ff] ring-2 ring-background"
            style={{ left: `${across(shown.x) * 100}%`, top: `${across(shown.y) * 100}%` }}
          />
        )}
      </fieldset>
      <div className="grid min-w-0 flex-1 gap-1">
        {axisField("x")}
        {axisField("y")}
      </div>
    </div>
  )
}
