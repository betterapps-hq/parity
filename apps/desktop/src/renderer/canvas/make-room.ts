import { makeRoomMs, settle, translated } from "./drag-motion.ts"
import { styleElements } from "./element-lift.ts"
import { asTranslate, type Point, translateOnScreen } from "./screen-moves.ts"

/** Elements still sliding, and what ends each slide at once, putting back what was written on it. */
const sliding = new WeakMap<Element, () => void>()

/**
 * Ends the slides of elements and of what holds them at once, so each is drawn where it's laid out: for measuring where
 * something will be, rather than where a slide has it on the way.
 */
export function endSlides(elements: Iterable<Element>): void {
  for (const element of elements) {
    for (let at: Element | null = element; at; at = at.parentElement) {
      sliding.get(at)?.()
    }
  }
}

/**
 * Slides elements from where they're drawn to where `change` lays them out, so a layout making room for what's carried
 * moves aside rather than jumping (FLIP): each is measured, `change` is made, and each moved one is drawn back where it
 * was by a `translate` that then eases away in `makeRoomMs`. One still sliding is measured where it's drawn mid-slide,
 * so a slide that's turned around carries on from there. One inside another that slides, such as a layer in a layout
 * that moves, slides only as far as the outer one's slide doesn't carry it. Anything not drawn before, such as a layer
 * that's shown again, takes its place at once. With reduced motion nothing slides.
 */
export function slideElements(elements: Iterable<Element>, change: () => void, reduced: boolean): void {
  const all = [...new Set(elements)]
  const before = new Map<Element, DOMRect>()

  for (const element of all) {
    if (element.isConnected) {
      before.set(element, element.getBoundingClientRect())
    }
  }

  // Each is measured before any slide is ended, as ending one moves what's inside it.
  for (const element of all) {
    sliding.get(element)?.()
  }

  change()

  if (reduced) {
    return
  }

  // How far each one that slides has moved on screen, which its slide carries what's inside it back by. Outer ones
  // come first, so each inner one knows what's carried it.
  const carried = new Map<Element, Point>()
  const outerFirst = [...before].sort(([a], [b]) => depth(a) - depth(b))

  const moved = outerFirst.flatMap(([element, was]) => {
    if (!element.isConnected || (was.width === 0 && was.height === 0)) {
      return []
    }

    const now = element.getBoundingClientRect()
    const moves = { x: was.left - now.left, y: was.top - now.top }
    const by = carriedBy(element, carried)
    const away = { x: moves.x - by.x, y: moves.y - by.y }

    if (Math.abs(away.x) < 0.5 && Math.abs(away.y) < 0.5) {
      return []
    }

    // A slide is a translate, which moves the element along whatever it's in, scaled and turned with it: the move on
    // screen goes back through what a translate does there.
    const styled = element instanceof HTMLElement || element instanceof SVGElement ? element : undefined
    const own = getComputedStyle(element).translate
    const ratio = element instanceof HTMLElement && element.offsetWidth > 0 ? now.width / element.offsetWidth : 1
    const from = translated(own, asTranslate(away, styled && translateOnScreen(styled, own), ratio))

    if (!from) {
      return []
    }

    carried.set(element, moves)

    return [{ element, own, from }]
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

      // Taking its transition away leaves a slide under way running, so it's called off too, and the element is drawn
      // where it's laid out at once.
      for (const animation of element.getAnimations()) {
        if (animation instanceof CSSTransition && animation.transitionProperty === "translate") {
          animation.cancel()
        }
      }

      sliding.delete(element)
    }

    timer = window.setTimeout(end, makeRoomMs)
    sliding.set(element, end)
  }
}

/** How many elements `element` is inside. */
function depth(element: Element): number {
  let count = 0

  for (let at = element.parentElement; at; at = at.parentElement) {
    count += 1
  }

  return count
}

/** How far the slide of the nearest element around `element` that slides carries it back, on screen. */
function carriedBy(element: Element, carried: ReadonlyMap<Element, Point>): Point {
  for (let at = element.parentElement; at; at = at.parentElement) {
    const by = carried.get(at)

    if (by) {
      return by
    }
  }

  return { x: 0, y: 0 }
}
