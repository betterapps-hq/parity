/*
 * Picking up a list's entry and putting it down somewhere else, for every list that's put in order by hand
 * (design-options-fields.md, Lists). Pressed by its handle, or dragged by its body, the entry lifts off the list as a
 * card that follows the pointer up and down; the entries it passes slide aside to make room, and the list can preview
 * the order it's over; let go, it drops into the gap at its own size and clicks in, then fades into the list. Escape
 * clicks it back where it was. Up and Down on its handle move it a place, clicking in the same way. sort-layout.ts works
 * out where it lands; this draws it, straight on the page so carrying it costs no render, and the list is put in its new
 * order once, when it's let go.
 */
import { type KeyboardEvent, type PointerEvent, type RefObject, useLayoutEffect, useRef } from "react"
import { flushSync } from "react-dom"
import { carriedShift, type SortBox, type SortLayout, sortLayout } from "./sort-layout.ts"

type Move = (from: number, to: number) => void

/** Where an entry is being carried from and the place it's over, in its group; nothing once it's put down. */
export type Carried = { from: number; to: number } | undefined

/** Quick to start and soft to stop, as something moved aside is (Material's emphasized deceleration). */
const ease = "cubic-bezier(0.2, 0, 0, 1)"

/**
 * Into place: off at once, and still moving when it reaches the gap, so it stops dead there, which is the click, rather
 * than easing the last pixel in.
 */
const snap = "cubic-bezier(0.2, 0.2, 0.6, 0.8)"

/** Gathering speed toward the gap, as something dropped does: its size and shadow are spent just as it arrives. */
const falling = "cubic-bezier(0.4, 0, 1, 1)"

/** Letting go of a press: quick, then still. */
const springing = "cubic-bezier(0, 0, 0.2, 1)"

/**
 * How long, in ms, the card takes to lift, the others to slide aside, the card to click in once it's arrived (pressed a
 * touch and let go), and its surface to fade into the list. Its trip into the gap takes 110 to 220, by how far it goes.
 */
const timings = { lift: 150, slide: 200, seat: 110, fade: 160 }

/** How far a press on the card's body moves before it's carrying rather than clicking, in px. */
const threshold = 4

/** The card's surface: the popover's, 4px past the entry by a spread shadow, so lifting moves nothing else. */
const surface = "0 0 0 4px var(--popover)"

/** The card's edge round its surface, brighter by `percent` as it clicks in. */
const edge = (percent: number) => `0 0 0 5px color-mix(in oklab, var(--foreground) ${percent}%, transparent)`

/** No shadow at all, in a place of the list of four, so each eases away rather than vanishing. */
const none = "0 0 0 0 transparent"

/** The card as it's carried: raised on the popover's surface, a little larger, edged and shadowed. */
const raised = {
  backgroundColor: "var(--popover)",
  boxShadow: `${surface}, ${edge(12)}, 0 16px 32px -12px oklch(0 0 0 / 50%), 0 4px 10px -4px oklch(0 0 0 / 30%)`,
  scale: "1.02"
}

/** The card moved by a key, hopping over the others on its way. */
const hopping = {
  backgroundColor: "var(--popover)",
  boxShadow: `${surface}, ${edge(12)}, 0 8px 16px -8px oklch(0 0 0 / 40%), 0 2px 6px -3px oklch(0 0 0 / 25%)`,
  scale: "1.012"
}

/** The card as it arrives: exactly its own size, its shadow gone, its edge flashing as it clicks in. */
const arrived = {
  backgroundColor: "var(--popover)",
  boxShadow: `${surface}, ${edge(32)}, ${none}, ${none}`,
  scale: "1"
}

/** The card clicked in: a card still, flat in its place for the moment it takes to fade. */
const seated = { backgroundColor: "var(--popover)", boxShadow: `${surface}, ${edge(12)}, ${none}, ${none}`, scale: "1" }

/** The card gone into the list. */
const lowered = { backgroundColor: "transparent", boxShadow: `${none}, ${none}, ${none}, ${none}`, scale: "1" }

/** An entry's movement over `travel` ms, and its look over `lift` ms. */
const motion = (travel: number, lift: number) =>
  [
    `translate ${travel}ms ${ease}`,
    ...["scale", "box-shadow", "background-color"].map((look) => `${look} ${lift}ms ${ease}`)
  ].join(", ")

/** Whether the system asks for reduced motion: then the card still follows the pointer, and nothing else moves. */
const still = (page: Document) => page.defaultView?.matchMedia("(prefers-reduced-motion: reduce)").matches ?? false

/** The timings, or none for reduced motion. */
const timingsIn = (page: Document): typeof timings => (still(page) ? { lift: 0, slide: 0, seat: 0, fade: 0 } : timings)

/** How long the card takes to reach its gap from `distance` px away, quicker the nearer it is, or none for reduced motion. */
const tripIn = (page: Document, distance: number) =>
  still(page) ? 0 : Math.round(Math.min(220, 110 + Math.abs(distance) * 1.4))

/** The click a card's landing plays, which a new landing or carry stops. */
const seatId = "sort-seat"

const stopSeat = (element: HTMLElement) => {
  for (const animation of element.getAnimations()) {
    if (animation.id === seatId) {
      animation.cancel()
    }
  }
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

/** Entries still settling or marked as landed, and what's left to do to them. */
let pending: { elements: HTMLElement[]; timers: number[] } | undefined

/** Stops what's left to do, leaving the entries as they're drawn now, for a key press that carries on from there. */
function stopPending() {
  for (const timer of pending?.timers ?? []) {
    window.clearTimeout(timer)
  }

  pending = undefined
}

/** Ends it all at once, for a carry that has to measure the list as it's laid out. */
function finishPending() {
  const elements = pending?.elements ?? []
  stopPending()

  for (const element of elements) {
    stopSeat(element)
    release(element)
  }
}

/** Puts `elements` back as the list draws them after `after` ms. */
function later(elements: HTMLElement[], after: number) {
  stopPending()

  pending = {
    elements,
    timers: [
      window.setTimeout(() => {
        elements.forEach(release)
        pending = undefined
      }, after + 50)
    ]
  }
}

/**
 * Seats `item` in its gap, which it reaches in `trip` ms: shrinking back to its own size and losing its shadow on the
 * way, so it arrives exactly the gap's size, then clicking in, pressed a touch with its edge flashing, and fading into
 * the list. Moved by a key, it `hops` on the way. With reduced motion, its edge shows where it went for a moment.
 * `mark` says what it's doing, for the list's checks.
 */
function land(
  item: HTMLElement,
  elements: HTMLElement[],
  trip: number,
  { hops = false, mark = "landed" }: { hops?: boolean; mark?: string } = {}
) {
  // It sets off from however it's drawn now: lifted, or partway through a click a key press cut short.
  const drawn = getComputedStyle(item)
  const from = { backgroundColor: drawn.backgroundColor, boxShadow: drawn.boxShadow, scale: drawn.scale }
  stopSeat(item)
  item.style.position = "relative"
  item.style.zIndex = "20"
  item.dataset.sort = mark

  if (still(item.ownerDocument)) {
    Object.assign(item.style, seated)
    later(elements, 400)

    return
  }

  // What the click ends on, so nothing changes when it's done.
  Object.assign(item.style, lowered)
  const { seat, fade } = timings
  const length = trip + seat + fade
  const at = (ms: number) => Math.min(1, ms / length)

  const frames: Keyframe[] = [
    { offset: 0, ...from, easing: falling },
    ...(hops ? [{ offset: at(trip * 0.35), ...hopping, easing: falling }] : []),
    // Its own size a little before it arrives, so it's never too big for the gap.
    { offset: at(trip * 0.8), scale: "1", easing: "linear" },
    { offset: at(trip), ...arrived, easing: springing },
    { offset: at(trip + seat * 0.35), scale: "0.993", easing: springing },
    { offset: at(trip + seat), ...seated, easing: "ease-out" },
    { offset: 1, ...lowered }
  ]

  const click = item.animate(frames, { duration: length })
  click.id = seatId
  later(elements, length)
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

/** Slides `elements` from where they're drawn to where the list puts them, over `trip` ms, into place. */
function slideHome(elements: HTMLElement[], trip: number) {
  for (const element of elements) {
    element.style.transition = `translate ${trip}ms ${snap}`
    element.style.translate = ""
  }
}

/**
 * Puts the list in its new order with `change`, at once, and slides each entry from where it was drawn to its new
 * place over `trip` ms, so nothing jumps whether it was carried there, made room, or was moved by a key. Only their
 * places ease: how the moved card looks is its landing's to draw.
 */
function slideInto(elements: HTMLElement[], change: () => void, trip: number) {
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
  slideHome(elements, trip)
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

/** What a list hears from its entry: where it's put down, and the place it's over while it's carried. */
interface Listeners {
  onMove?: Move
  onCarry?: (carried: Carried) => void
}

interface Carry {
  item: HTMLElement
  items: HTMLElement[]
  list: HTMLElement
  boxes: SortBox[]
  from: number
  label: string
  listeners: () => Listeners
  /** The entry's hook that picked it up, which puts it back if the entry goes while it's carried. */
  owner: object
  /** Where the pointer was pressed, from the list's top. */
  pressedAt: number
  pointerY: number
  shift: number
  layout: SortLayout
  /** The place the list was last told it's over, so it hears of each change once. */
  told: number
  scroller: Element
  speed: number
  frame?: number
  /** It was dragged by its body, so the click that follows letting go mustn't open what the body opens. */
  byBody: boolean
  stop: () => void
}

let carrying: Carry | undefined

/** Draws the card under the pointer and the others aside to make room, and tells the list when the place changes. */
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

  if (carry.layout.to !== carry.told) {
    carry.told = carry.layout.to
    carry.listeners().onCarry?.({ from: carry.from, to: carry.told })
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
  const to = cancelled ? from : carry.layout.to
  const { onMove, onCarry } = carry.listeners()

  // The list stops previewing in the same render that puts it in order, so the preview never shows a step between.
  if (to !== from && onMove) {
    const trip = tripIn(page, carry.shift - carry.layout.landing)

    slideInto(
      items,
      () => {
        onMove(from, to)
        onCarry?.(undefined)
      },
      trip
    )
    land(item, items, trip)
    announce(page, `Moved ${carry.label} to place ${to + 1} of ${items.length}`)
  } else {
    onCarry?.(undefined)
    const trip = tripIn(page, carry.shift)
    slideHome(items, trip)
    land(item, items, trip, { mark: "settling" })
  }

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
  listeners: () => Listeners
  owner: object
  pointerId: number
  pressedY: number
  pointerY: number
  holder: Element
  byBody: boolean
}): boolean {
  finishPending()
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
    listeners: options.listeners,
    owner: options.owner,
    pressedAt: options.pressedY - listTop,
    pointerY: options.pointerY,
    shift: 0,
    layout: { to: from, offsets: items.map(() => 0), landing: 0 },
    told: from,
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
 * new order, and without it the entry stays put, as one alone in its group does. `onCarry` hears the place it's over
 * each time that changes while it's carried, and nothing once it's put down, so the list can draw that order before
 * it's let go.
 */
export function useSortable<E extends HTMLElement = HTMLDivElement>({
  group,
  label,
  onMove,
  onCarry
}: {
  group: string
  label: string
} & Listeners): Sortable<E> {
  const node = useRef<E>(null)
  const latest = useRef<Listeners>({ onMove, onCarry })

  // The list's newest order is what a carry previews and puts down into, though it was picked up before it changed.
  useLayoutEffect(() => {
    latest.current = { onMove, onCarry }
  })

  // An entry that goes while it's carried, as when an undo removes it, never hears the pointer let go: it's put back,
  // so the grabbing cursor, the Escape listener and the others' offsets go with it.
  useLayoutEffect(
    () => () => {
      if (carrying?.owner === latest) {
        putDown(true)
      }
    },
    []
  )

  const listeners = () => latest.current

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
            listeners,
            owner: latest,
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
          listeners,
          owner: latest,
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

        // Measured where they're drawn, so a second press while they still slide carries on from there, and a click
        // still playing carries on into the next.
        stopPending()
        const page = item.ownerDocument
        const past = found.items[to]!.getBoundingClientRect().top - item.getBoundingClientRect().top
        const trip = tripIn(page, past)
        slideInto(found.items, () => onMove(found.from, to), trip)
        land(item, found.items, trip, { hops: true })
        announce(page, `Moved ${label} to place ${to + 1} of ${found.items.length}`)
      }
    }
  }
}
