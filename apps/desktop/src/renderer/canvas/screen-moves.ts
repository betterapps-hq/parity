import { translated } from "./drag-motion.ts"

/** A point or a move, in pixels. */
export interface Point {
  x: number
  y: number
}

/** How far apart the moves that find what a translate does on screen are, in pixels. */
const reach = 100

/**
 * What a change to an element's `translate` does on screen, in client pixels for each pixel along x and y: whatever
 * it's in scales and turns it. It's moved a way along each for a moment, its transition off, to see. Nothing for a
 * translate that isn't in pixels.
 */
export function translateOnScreen(element: HTMLElement | SVGElement, translate: string): DOMMatrix | undefined {
  const { style } = element

  const saved = (["transition", "translate"] as const).map((name) => ({
    name,
    value: style.getPropertyValue(name),
    priority: style.getPropertyPriority(name)
  }))

  const put = ({ name, value, priority }: (typeof saved)[number]) => {
    if (value) {
      style.setProperty(name, value, priority)
    } else {
      style.removeProperty(name)
    }
  }

  const was = element.getBoundingClientRect()
  style.setProperty("transition", "none", "important")

  const along = (by: Point) => {
    const moved = translated(translate, by)

    if (!moved) {
      return undefined
    }

    style.setProperty("translate", moved, "important")
    const now = element.getBoundingClientRect()

    return { x: (now.left - was.left) / reach, y: (now.top - was.top) / reach }
  }

  const x = along({ x: reach, y: 0 })
  const y = along({ x: 0, y: reach })
  put(saved[1]!)
  // Drawn where it was again before its transition comes back.
  element.getBoundingClientRect()
  put(saved[0]!)

  return x && y ? new DOMMatrix([x.x, x.y, y.x, y.y, 0, 0]) : undefined
}

/**
 * A move on screen as a change to a translate: back through what a translate does there (`translateOnScreen`), or, when
 * that isn't known or can't be undone, divided by `ratio`, the screen's pixels per pixel of what it's in.
 */
export function asTranslate(by: Point, moves: DOMMatrix | undefined, ratio: number): Point {
  const back = moves?.inverse()

  if (back && [back.a, back.b, back.c, back.d].every(Number.isFinite)) {
    const { x, y } = back.transformPoint(by)

    return { x, y }
  }

  return { x: by.x / ratio, y: by.y / ratio }
}
