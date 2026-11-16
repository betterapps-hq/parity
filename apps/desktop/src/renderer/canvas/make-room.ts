import { makeRoomMs, settle, translated } from "./drag-motion.ts"
import { styleElements } from "./element-lift.ts"

/** Elements still sliding, and what ends each slide at once, putting back what was written on it. */
const sliding = new WeakMap<Element, () => void>()

/**
 * Slides elements from where they're drawn to where `change` lays them out, so a layout making room for what's carried
 * moves aside rather than jumping (FLIP): each is measured, `change` is made, and each moved one is drawn back where it
 * was by a `translate` that then eases away in `makeRoomMs`. One still sliding is measured where it's drawn mid-slide,
 * so a slide that's turned around carries on from there. Anything not drawn before, such as a layer that's shown
 * again, takes its place at once. With reduced motion nothing slides.
 */
export function slideElements(elements: Iterable<Element>, change: () => void, reduced: boolean): void {
  const before = new Map<Element, DOMRect>()

  for (const element of new Set(elements)) {
    if (element.isConnected) {
      before.set(element, element.getBoundingClientRect())
    }

    sliding.get(element)?.()
  }

  change()

  if (reduced) {
    return
  }

  const moved = [...before].flatMap(([element, was]) => {
    if (!element.isConnected || (was.width === 0 && was.height === 0)) {
      return []
    }

    const now = element.getBoundingClientRect()
    const away = { x: was.left - now.left, y: was.top - now.top }

    if (Math.abs(away.x) < 0.5 && Math.abs(away.y) < 0.5) {
      return []
    }

    // A slide is in the element's own pixels, which the canvas scales.
    const size = element instanceof HTMLElement ? element.offsetWidth : 0
    const ratio = size > 0 ? now.width / size : 1
    const own = getComputedStyle(element).translate
    const from = translated(own, { x: away.x / ratio, y: away.y / ratio })

    return from ? [{ element, own, from }] : []
  })

  // Each is drawn where it was, at once, then eases to where it's laid out.
  const slides = moved.map(({ element, own, from }) => ({
    element,
    own,
    restore: styleElements([element], { transition: "none", translate: from })
  }))

  slides[0]?.element.getBoundingClientRect()

  for (const { element, own, restore } of slides) {
    if (element instanceof HTMLElement || element instanceof SVGElement) {
      element.style.setProperty("transition", `translate ${makeRoomMs}ms ${settle}`, "important")
      element.style.setProperty("translate", own, "important")
    }

    let timer = 0

    const end = () => {
      window.clearTimeout(timer)
      restore()
      sliding.delete(element)
    }

    timer = window.setTimeout(end, makeRoomMs)
    sliding.set(element, end)
  }
}
