import { type PointerEvent as ReactPointerEvent, type ReactNode, useRef, useState } from "react"
import { createPortal } from "react-dom"

/** How far a press moves before it carries what it pressed, in screen pixels. */
const carryAfter = 4

/** Where a carried row or column would land: its slot among them, and the marker's place on screen. */
interface Landing {
  to: number
  marker: { x: number; y: number; length: number }
}

/** A row's name or a column's header made carryable (see `useCarry`). */
interface Carry {
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void
  /** Whether the press that ends in a click carried something, so the click does nothing. */
  carried: () => boolean
  /** Where it would land, while it's carried. */
  marker: ReactNode
}

/**
 * Carries a row's name or a column's header across its board to put it somewhere else (PAR-1071): pressing and moving
 * it shows a marker where it would land, between the others, and letting go there moves it (`onDrop`, with where it
 * lands among them). A press that doesn't move is a click. `items` are the rows or columns on screen, in order, the
 * pressed one among them at `from`, read as the press starts.
 */
export function useCarry({
  axis,
  items,
  from,
  color,
  onDrop
}: {
  axis: "x" | "y"
  items: () => HTMLElement[]
  from: () => number
  color: string
  onDrop: (to: number) => void
}): Carry {
  const [landing, setLanding] = useState<Landing>()
  const moved = useRef(false)

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    event.stopPropagation()

    if (event.button !== 0) {
      return
    }

    const target = event.currentTarget
    const pressed = from()
    const start = { x: event.clientX, y: event.clientY }
    let last: Landing | undefined
    moved.current = false
    target.setPointerCapture(event.pointerId)

    const move = (pointer: PointerEvent) => {
      if (!moved.current && Math.hypot(pointer.clientX - start.x, pointer.clientY - start.y) < carryAfter) {
        return
      }

      moved.current = true
      last = landingAt(axis, items(), axis === "x" ? pointer.clientX : pointer.clientY)
      setLanding(last)
    }

    const up = () => {
      target.removeEventListener("pointermove", move)
      target.removeEventListener("pointerup", up)
      target.removeEventListener("pointercancel", up)
      setLanding(undefined)

      // A slot just before or after itself leaves it where it is.
      if (last && pressed >= 0 && last.to !== pressed && last.to !== pressed + 1) {
        onDrop(last.to > pressed ? last.to - 1 : last.to)
      }
    }

    target.addEventListener("pointermove", move)
    target.addEventListener("pointerup", up)
    target.addEventListener("pointercancel", up)
  }

  const marker =
    landing &&
    createPortal(
      <div
        aria-hidden
        className="pointer-events-none fixed z-50 rounded-full"
        style={{
          left: landing.marker.x - (axis === "x" ? 1 : 0),
          top: landing.marker.y - (axis === "y" ? 1 : 0),
          width: axis === "x" ? 2 : landing.marker.length,
          height: axis === "x" ? landing.marker.length : 2,
          background: color
        }}
      />,
      document.body
    )

  return {
    onPointerDown,
    carried: () => {
      const was = moved.current
      moved.current = false

      return was
    },
    marker
  }
}

/** Halfway across the gap between the two a slot falls between, or just past the end it's at. */
function markerAt(before: number | undefined, after: number | undefined): number {
  if (before !== undefined && after !== undefined) {
    return (before + after) / 2
  }

  return before === undefined ? after! - 6 : before + 6
}

/** The slot a pointer at `at` along the axis is over, before the first item whose middle is past it, and its marker. */
function landingAt(axis: "x" | "y", items: HTMLElement[], at: number): Landing | undefined {
  const boxes = items.map((item) => item.getBoundingClientRect())

  if (boxes.length === 0) {
    return undefined
  }

  const start = (box: DOMRect) => (axis === "x" ? box.left : box.top)
  const end = (box: DOMRect) => (axis === "x" ? box.right : box.bottom)
  const to = boxes.filter((box) => (start(box) + end(box)) / 2 < at).length
  const before = boxes[to - 1]
  const after = boxes[to]
  const along = markerAt(before && end(before), after && start(after))
  const across = Math.min(...boxes.map((box) => (axis === "x" ? box.top : box.left)))
  const length = Math.max(...boxes.map((box) => (axis === "x" ? box.bottom : box.right))) - across

  return { to, marker: axis === "x" ? { x: along, y: across, length } : { x: across, y: along, length } }
}
