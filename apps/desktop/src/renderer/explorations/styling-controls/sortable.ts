/*
 * Picking up a list's entry and putting it down somewhere else, for every list that's put in order by hand
 * (design-options-fields.md, Lists). Pressed by its handle, or dragged by its body, the entry lifts off the list as a
 * card that follows the pointer up and down; the entries it passes slide aside to make room; let go, it settles into
 * the gap. Escape puts it back where it was. Up and Down on its handle move it a place, the entries sliding the same
 * way. sort-layout.ts works out where it lands; this draws it, straight on the page so carrying it costs no render,
 * and the list is put in its new order once, when it's let go.
 */
import { type KeyboardEvent, type PointerEvent, type RefObject, useLayoutEffect, useRef } from "react"
import { flushSync } from "react-dom"
import { carriedShift, type SortBox, type SortLayout, sortLayout } from "./sort-layout.ts"

type Move = (from: number, to: number) => void

/** Quick to start and soft to stop, as something set down is (Material's emphasized deceleration). */
const ease = "cubic-bezier(0.2, 0, 0, 1)"

/** How long the card takes to lift and set down, the others to slide aside, and the card to settle, in ms. */
const timings = { lift: 150, slide: 200, settle: 240 }

/** How far a press on the card's body moves before it's carrying rather than clicking, in px. */
const threshold = 4

/**
 * The card as it's carried: raised on the popover's surface, a little larger, edged and shadowed. Its surface reaches
 * 4px past the entry by a spread shadow in the same color, so lifting moves nothing else.
 */
const raised = {
  backgroundColor: "var(--popover)",
  boxShadow:
    "0 0 0 4px var(--popover), 0 0 0 5px color-mix(in oklab, var(--foreground) 12%, transparent), 0 16px 32px -12px oklch(0 0 0 / 50%), 0 4px 10px -4px oklch(0 0 0 / 30%)",
  scale: "1.02"
}

/** The card set down: the same four shadows at nothing, so each eases away rather than vanishing. */
const lowered = {
  backgroundColor: "transparent",
  boxShadow: "0 0 0 0 transparent, 0 0 0 0 transparent, 0 0 0 0 transparent, 0 0 0 0 transparent",
  scale: "1"
}

/** An entry's movement and look, the movement over `slide` ms. */
const motion = (slide: number, lift: number) =>
  ["translate", "scale", "box-shadow", "background-color"]
    .map((property, at) => `${property} ${at === 0 ? slide : lift}ms ${ease}`)
    .join(", ")

/** The timings, or none where the system asks for reduced motion: the card still follows the pointer. */
function timingsIn(page: Document): typeof timings {
  const still = page.defaultView?.matchMedia("(prefers-reduced-motion: reduce)").matches ?? false

  return still ? { lift: 0, slide: 0, settle: 0 } : timings
}

/** Back to how the list draws it. */
function release(element: HTMLElement) {
  for (const property of [
    "transition",
    "translate",
    "scale",
    "box-shadow",
    "background-color",
    "z-index",
    "position"
  ]) {
    element.style.removeProperty(property)
  }

  delete element.dataset.sort
}

/** Entries still sliding or settling, put back as the list draws them once they're done. */
let settling: { elements: HTMLElement[]; timer: number } | undefined

function settle(elements: HTMLElement[], after: number) {
  if (settling) {
    window.clearTimeout(settling.timer)
  }

  settling = {
    elements,
    timer: window.setTimeout(() => {
      elements.forEach(release)
      settling = undefined
    }, after + 50)
  }
}

/** Ends a settling at once, for a new carry that has to measure the list as it's laid out. */
function finishSettling() {
  if (settling) {
    window.clearTimeout(settling.timer)
    settling.elements.forEach(release)
    settling = undefined
  }
}

/** The entries of `group` beside `item`, in the list's order, and where `item` is among them. */
function groupOf(
  item: HTMLElement,
  group: string
): { list: HTMLElement; items: HTMLElement[]; from: number } | undefined {
  const list = item.parentElement

  if (!list) {
    return undefined
  }

  const items = [...list.children].filter(
    (child): child is HTMLElement => child instanceof HTMLElement && child.dataset.sortGroup === group
  )

  return { list, items, from: items.indexOf(item) }
}

/**
 * Puts the list in its new order with `change`, at once, and slides each entry from where it was drawn to its new
 * place, so nothing jumps whether it was carried there, made room, or was moved by a key.
 */
function slideInto(elements: HTMLElement[], change: () => void, slide: number, lift: number) {
  const drawn = elements.map((element) => element.getBoundingClientRect().top)
  flushSync(change)

  for (const element of elements) {
    element.style.transition = "none"
    element.style.translate = ""
  }

  for (const [at, element] of elements.entries()) {
    const by = drawn[at]! - element.getBoundingClientRect().top

    if (Math.abs(by) > 0.5) {
      element.style.translate = `0 ${by}px`
    }
  }

  // Reading a size has the page take those places in before they ease away.
  void elements[0]?.offsetHeight

  for (const element of elements) {
    element.style.transition = motion(slide, lift)
    element.style.translate = ""
  }
}

/** Says what moved, for a screen reader, in one region shared by every list. */
function announce(page: Document, text: string) {
  let region = page.querySelector<HTMLElement>("[data-sort-announcer]")

  if (!region) {
    region = page.createElement("div")
    region.dataset.sortAnnouncer = ""
    region.setAttribute("aria-live", "assertive")
    region.className = "sr-only"
    page.body.append(region)
  }

  const said = region
  said.textContent = ""
  window.setTimeout(() => {
    said.textContent = text
  }, 50)
}

/** What scrolls the list, where carrying near its edge scrolls it: its nearest scrolling box, or the page. */
function scrollerOf(element: HTMLElement): Element {
  for (let at = element.parentElement; at; at = at.parentElement) {
    if (/auto|scroll|overlay/.test(getComputedStyle(at).overflowY) && at.scrollHeight > at.clientHeight) {
      return at
    }
  }

  return element.ownerDocument.scrollingElement ?? element.ownerDocument.documentElement
}

/** How fast to scroll for a pointer at `y`, in px a frame: faster the nearer an edge it is, within 40px of it. */
function scrollSpeed(scroller: Element, y: number): number {
  const page = scroller.ownerDocument
  const zone = 40
  const most = 12

  const { top, bottom } =
    scroller === page.scrollingElement
      ? { top: 0, bottom: page.defaultView?.innerHeight ?? 0 }
      : scroller.getBoundingClientRect()

  if (y < top + zone) {
    return -most * Math.min(1, (top + zone - y) / zone)
  }

  return y > bottom - zone ? most * Math.min(1, (y - (bottom - zone)) / zone) : 0
}

interface Carry {
  item: HTMLElement
  items: HTMLElement[]
  list: HTMLElement
  boxes: SortBox[]
  from: number
  label: string
  move: () => Move | undefined
  /** Where the pointer was pressed, from the list's top. */
  pressedAt: number
  pointerY: number
  shift: number
  layout: SortLayout
  scroller: Element
  speed: number
  frame?: number
  /** It was dragged by its body, so the click that follows letting go mustn't open what the body opens. */
  byBody: boolean
  stop: () => void
}

let carrying: Carry | undefined

/** Draws the card under the pointer and the others aside to make room. */
function draw(carry: Carry) {
  const pointer = carry.pointerY - carry.list.getBoundingClientRect().top - carry.pressedAt
  carry.shift = carriedShift(carry.boxes, carry.from, pointer, carry.boxes[carry.from]!.height * 0.75)
  carry.layout = sortLayout(carry.boxes, carry.from, carry.shift)
  carry.item.style.translate = `0 ${carry.shift}px`

  for (const [at, element] of carry.items.entries()) {
    const by = carry.layout.offsets[at] ?? 0

    if (at !== carry.from) {
      element.style.translate = by === 0 ? "" : `0 ${by}px`
    }
  }
}

/** Scrolls while the pointer's near an edge, redrawing as the list moves under it. */
function scrollWhileNear(carry: Carry) {
  carry.speed = scrollSpeed(carry.scroller, carry.pointerY)

  if (carry.speed === 0 || carry.frame !== undefined) {
    return
  }

  const tick = () => {
    if (carrying !== carry || carry.speed === 0) {
      carry.frame = undefined

      return
    }

    carry.scroller.scrollBy(0, carry.speed)
    draw(carry)
    carry.frame = requestAnimationFrame(tick)
  }

  carry.frame = requestAnimationFrame(tick)
}

/** Lets the card go: into the place it's over, or back where it was when `cancelled`. */
function putDown(cancelled: boolean) {
  const carry = carrying

  if (!carry) {
    return
  }

  carrying = undefined
  carry.stop()
  const { item, items, from } = carry
  const page = item.ownerDocument
  const { lift, settle: settleTime } = timingsIn(page)
  const to = cancelled ? from : carry.layout.to
  const move = carry.move()

  if (to !== from && move) {
    slideInto(items, () => move(from, to), settleTime, lift)
    announce(page, `Moved ${carry.label} to place ${to + 1} of ${items.length}`)
  } else {
    for (const element of items) {
      element.style.transition = motion(settleTime, lift)
      element.style.translate = ""
    }
  }

  Object.assign(item.style, lowered)
  item.dataset.sort = "settling"
  settle(items, settleTime)

  if (carry.byBody) {
    const swallow = (click: Event) => {
      click.stopPropagation()
      click.preventDefault()
    }

    page.addEventListener("click", swallow, { capture: true, once: true })
    window.setTimeout(() => page.removeEventListener("click", swallow, { capture: true }), 0)
  }
}

/** Lifts `item` off its list under a pointer pressed at `pressedY`, now at `pointerY`, captured by `holder`. */
function pickUp(options: {
  item: HTMLElement
  group: string
  label: string
  move: () => Move | undefined
  pointerId: number
  pressedY: number
  pointerY: number
  holder: Element
  byBody: boolean
}): boolean {
  finishSettling()
  const found = groupOf(options.item, options.group)

  if (!found || found.from < 0 || found.items.length < 2) {
    return false
  }

  const { list, items, from } = found
  const { item, holder, pointerId } = options
  const page = item.ownerDocument
  const listTop = list.getBoundingClientRect().top

  const boxes = items.map((element) => {
    const box = element.getBoundingClientRect()

    return { top: box.top - listTop, height: box.height }
  })

  try {
    holder.setPointerCapture(pointerId)
  } catch {
    // The pointer's already gone, so there's nothing to carry.
    return false
  }

  // Everything shows it's being carried, nothing's selected as it's moved past, and no hint opens over the list.
  const grabbing = page.createElement("style")
  grabbing.textContent =
    "* { cursor: grabbing !important; user-select: none !important; } [data-slot='tooltip-content'] { visibility: hidden !important; }"
  page.head.append(grabbing)
  page.getSelection()?.removeAllRanges()
  const { lift, slide } = timingsIn(page)

  for (const element of items) {
    element.style.transition = motion(slide, lift)
  }

  // It follows the pointer at once, and only its lifting eases.
  item.style.transition = motion(0, lift)
  item.style.position = "relative"
  item.style.zIndex = "20"
  item.dataset.sort = "lifted"
  Object.assign(item.style, raised)

  const onMove = (event: Event) => {
    if (event instanceof MouseEvent && carrying === carry) {
      carry.pointerY = event.clientY
      draw(carry)
      scrollWhileNear(carry)
    }
  }

  const onUp = () => putDown(false)
  const onCancel = () => putDown(true)

  const onKey = (event: globalThis.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault()
      event.stopPropagation()
      putDown(true)
    }
  }

  const carry: Carry = {
    item,
    items,
    list,
    boxes,
    from,
    label: options.label,
    move: options.move,
    pressedAt: options.pressedY - listTop,
    pointerY: options.pointerY,
    shift: 0,
    layout: { to: from, offsets: items.map(() => 0), landing: 0 },
    scroller: scrollerOf(list),
    speed: 0,
    byBody: options.byBody,
    stop: () => {
      holder.removeEventListener("pointermove", onMove)
      holder.removeEventListener("pointerup", onUp)
      holder.removeEventListener("pointercancel", onCancel)
      page.removeEventListener("keydown", onKey, { capture: true })
      grabbing.remove()

      if (carry.frame !== undefined) {
        cancelAnimationFrame(carry.frame)
        carry.frame = undefined
      }

      if (holder.hasPointerCapture(pointerId)) {
        holder.releasePointerCapture(pointerId)
      }
    }
  }

  holder.addEventListener("pointermove", onMove)
  holder.addEventListener("pointerup", onUp)
  holder.addEventListener("pointercancel", onCancel)
  page.addEventListener("keydown", onKey, { capture: true })
  carrying = carry
  draw(carry)

  return true
}

/**
 * What a press on the card's body can start a carry from: anywhere on the card but its own fields and buttons, bar
 * its grip. Not what it opens (its details, a hint): React passes their presses up as if they were the card's, though
 * they're drawn elsewhere, and a drag on its details' offset pad mustn't carry the card.
 */
const startsCarry = (item: HTMLElement, target: EventTarget | null) => {
  if (!(target instanceof Element) || !item.contains(target)) {
    return false
  }

  const control = target.closest(
    "button, a[href], input, textarea, select, [role='slider'], [contenteditable], [tabindex]"
  )

  return !control || control === item || !item.contains(control) || control.closest("[data-sort-grip]") !== null
}

export interface Sortable<E extends HTMLElement> {
  /**
   * For the entry's outermost element. The entries of one group are siblings in the list, whatever else is between
   * them (a group's title); a press on the body that moves 4px carries it, with a mouse or pen.
   */
  item: {
    ref: RefObject<E | null>
    "data-sort-group": string
    onPointerDown: (event: PointerEvent<E>) => void
  }
  /** For the entry's handle: a press picks it up at once, by any pointer; Up and Down move it a place. */
  handle: {
    onPointerDown: (event: PointerEvent<HTMLElement>) => void
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => void
  }
}

/**
 * Makes a list's entry one that's picked up and put down to reorder its list. `group` keeps it among its own kind
 * (a shadow list's Inside or Outside); `label` names it in what's announced ("Fill 2"); `onMove` puts the list in its
 * new order, and without it the entry stays put, as one alone in its group does.
 */
export function useSortable<E extends HTMLElement = HTMLDivElement>({
  group,
  label,
  onMove
}: {
  group: string
  label: string
  onMove?: Move
}): Sortable<E> {
  const node = useRef<E>(null)
  const latest = useRef(onMove)

  // The list's newest order is what a carry puts down into, though it was picked up before it changed.
  useLayoutEffect(() => {
    latest.current = onMove
  })

  const move = () => latest.current

  return {
    item: {
      ref: node,
      "data-sort-group": group,
      onPointerDown: (event) => {
        const item = node.current

        if (!item || !onMove || event.button !== 0 || event.pointerType === "touch") {
          return
        }

        if (!startsCarry(item, event.target)) {
          return
        }

        const page = item.ownerDocument
        const { pointerId, clientX, clientY } = event

        const watch = (moved: globalThis.PointerEvent) => {
          if (
            moved.pointerId !== pointerId ||
            Math.hypot(moved.clientX - clientX, moved.clientY - clientY) < threshold
          ) {
            return
          }

          stop()
          pickUp({
            item,
            group,
            label,
            move,
            pointerId,
            pressedY: clientY,
            pointerY: moved.clientY,
            holder: item,
            byBody: true
          })
        }

        const stop = () => {
          page.removeEventListener("pointermove", watch)
          page.removeEventListener("pointerup", stop)
          page.removeEventListener("pointercancel", stop)
        }

        page.addEventListener("pointermove", watch)
        page.addEventListener("pointerup", stop)
        page.addEventListener("pointercancel", stop)
      }
    },
    handle: {
      onPointerDown: (event) => {
        const item = node.current

        if (!item || !onMove || event.button !== 0) {
          return
        }

        // The handle carries it straight away, so the body doesn't wait to as well.
        event.stopPropagation()
        pickUp({
          item,
          group,
          label,
          move,
          pointerId: event.pointerId,
          pressedY: event.clientY,
          pointerY: event.clientY,
          holder: event.currentTarget,
          byBody: false
        })
      },
      onKeyDown: (event) => {
        const item = node.current
        const by = { ArrowUp: -1, ArrowDown: 1 }[event.key]

        if (!item || !onMove || by === undefined) {
          return
        }

        event.preventDefault()
        const found = groupOf(item, group)
        const to = (found?.from ?? -1) + by

        if (!found || found.from < 0 || to < 0 || to >= found.items.length) {
          return
        }

        // Measured where they're drawn, so a second press while they still slide carries on from there.
        if (settling) {
          window.clearTimeout(settling.timer)
          settling = undefined
        }

        const { slide, lift } = timingsIn(item.ownerDocument)
        item.style.position = "relative"
        item.style.zIndex = "20"
        slideInto(found.items, () => onMove(found.from, to), slide, lift)
        settle(found.items, slide)
        announce(item.ownerDocument, `Moved ${label} to place ${to + 1} of ${found.items.length}`)
      }
    }
  }
}
