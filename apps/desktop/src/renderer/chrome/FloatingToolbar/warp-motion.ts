import { along, springs } from "../../springs.ts"

/*
 * The toolbar's warp (PAR-780, PAR-795), from one side of the bar to the other around its anchor, the review button. On
 * the way in:
 *
 * 1. The bar crouches, squashing wide and short, as a ripple in the review tool's color spreads from the anchor.
 * 2. The tools are pulled into the anchor, the farthest first, shrinking and blurring, and the anchor bursts.
 * 3. The bar hops, its width springing to the new side's with a little overshoot, and lands with a jelly wobble.
 * 4. The review tool's parts burst out from where the anchor was, nearest first, each on its own spring.
 *
 * On the way back the review tool's parts sink and are pulled down into where the anchor sits, inside the smaller bar,
 * so nothing slides off its edges. The bar dips as it lands, and once they're in, the anchor re-forms and the tools
 * burst back out of it.
 */

export type Direction = "in" | "out"

/**
 * The moments of the warp, in milliseconds from the click. On the way back the width waits for the parts to be pulled
 * in, so the bar's edges don't overtake them.
 */
export const timing = {
  in: { width: 60, burst: 90 },
  out: { width: 110, burst: 170 },
  stagger: 14,
  pullStagger: 10
}

/** How long the bar crouches before it springs. */
const crouch = 90

/** The buttons, dividers and words on one side of the bar, which move one by one. */
function partsOf(side: HTMLElement): HTMLElement[] {
  return [...side.querySelectorAll<HTMLElement>("button, [role='separator'], [data-warp-part]")]
}

function centerOf(element: Element): number {
  const box = element.getBoundingClientRect()

  return box.left + box.width / 2
}

export interface WarpParts {
  /** The bar, which crouches, hops and wobbles. */
  bar: HTMLElement
  /** The ripple spreading from the anchor. */
  flash: HTMLElement
  /** The ring of color around the bar. */
  glow: HTMLElement
  leaving: HTMLElement
  entering: HTMLElement
}

/**
 * Plays the warp from `leaving` to `entering`, around the anchor (`data-warp-anchor`) on the tools' side, which stays put
 * however wide the bar is, since both sides sit in its middle. `color` is the ripple's and the ring's.
 */
export function playWarp(
  { bar, flash, glow, leaving, entering }: WarpParts,
  direction: Direction,
  color: string
): void {
  const leavingParts = partsOf(leaving)
  const enteringParts = partsOf(entering)

  // A warp started mid-warp starts from where things rest, not from where the last one left them.
  for (const element of [bar, flash, glow, ...leavingParts, ...enteringParts]) {
    for (const running of element.getAnimations()) {
      running.cancel()
    }
  }

  const tools = direction === "in" ? leaving : entering
  const anchor = tools.querySelector<HTMLElement>("[data-warp-anchor]") ?? tools
  const anchorX = centerOf(anchor)
  const distance = (part: HTMLElement) => Math.abs(centerOf(part) - anchorX)

  bar.style.setProperty("--warp", color)
  land(bar, direction)
  ripple({ bar, flash, glow }, anchorX)
  pullIn(leavingParts, anchor, anchorX, direction, distance)
  burstOut(enteringParts, anchor, anchorX, timing[direction].burst, distance)
}

/** The crouch, then the jelly landing: wide and short, tall and thin, settling. In, it hops up first; out, it dips. */
function land(bar: HTMLElement, direction: Direction): void {
  const { jelly } = springs
  const total = crouch + jelly.duration
  const lift = direction === "in" ? -7 : 3

  bar.animate(
    [
      { offset: 0, scale: "1 1", translate: "0 0", easing: "cubic-bezier(0.4, 0, 0.6, 1)" },
      ...jelly.points.map((progress, step) => {
        const time = (step / (jelly.points.length - 1)) * jelly.duration
        const tall = 0.86 + 0.14 * progress
        const hop = Math.min(time / (jelly.duration * 0.4), 1)

        return {
          offset: (crouch + time) / total,
          scale: `${1 + (1 - tall) * 0.45} ${tall}`,
          translate: `0 ${lift * Math.sin(Math.PI * hop)}px`
        }
      })
    ],
    { duration: total }
  )
}

/** A ring of the color around the bar, and a ripple spreading from the anchor behind the buttons. */
function ripple({ bar, flash, glow }: Pick<WarpParts, "bar" | "flash" | "glow">, anchorX: number): void {
  glow.animate([{ opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 0 }], { duration: 800, easing: "ease-out" })
  flash.style.left = `${anchorX - bar.getBoundingClientRect().left}px`
  flash.animate(
    [
      { scale: 0.2, opacity: 0.9 },
      { scale: 16, opacity: 0 }
    ],
    { duration: 700, easing: "cubic-bezier(0.2, 0.7, 0.2, 1)" }
  )
}

/**
 * The leaving side is pulled into the anchor, the farthest first. In, the anchor then bursts; out, everything sinks as
 * it goes, fast at first so the shrinking bar doesn't catch it.
 */
function pullIn(
  parts: HTMLElement[],
  anchor: HTMLElement,
  anchorX: number,
  direction: Direction,
  distance: (part: HTMLElement) => number
): void {
  for (const [order, part] of parts.toSorted((a, b) => distance(b) - distance(a)).entries()) {
    if (part === anchor) {
      part.animate(
        [
          { scale: 1, opacity: 1, filter: "blur(0px)" },
          { scale: 1.35, opacity: 1, filter: "blur(0px)", offset: 0.5 },
          { scale: 1.7, opacity: 0, filter: "blur(4px)" }
        ],
        { duration: 260, delay: 40, easing: "cubic-bezier(0.3, 0, 0.2, 1)", fill: "forwards" }
      )
      continue
    }

    const pull = anchorX - centerOf(part)

    part.animate(
      [
        { translate: "0 0", scale: 1, opacity: 1, filter: "blur(0px)" },
        direction === "in"
          ? { translate: `${pull * 0.7}px 0`, scale: 0.3, opacity: 0, filter: "blur(4px)" }
          : { translate: `${pull * 0.9}px 10px`, scale: 0.25, opacity: 0, filter: "blur(4px)" }
      ],
      {
        duration: direction === "in" ? 220 : 260,
        delay: order * timing.pullStagger,
        easing: direction === "in" ? "cubic-bezier(0.55, 0, 0.8, 0.2)" : "cubic-bezier(0.3, 0, 0.1, 1)",
        fill: "forwards"
      }
    )
  }
}

/**
 * The entering side bursts out of the anchor, the nearest first, each on its own spring. Out, the anchor comes back
 * first, shrinking back together from its burst.
 */
function burstOut(
  parts: HTMLElement[],
  anchor: HTMLElement,
  anchorX: number,
  burst: number,
  distance: (part: HTMLElement) => number
): void {
  for (const [order, part] of parts.toSorted((a, b) => distance(a) - distance(b)).entries()) {
    if (part === anchor) {
      part.animate(
        along(springs.pop, (progress) => ({
          scale: String(1.7 - 0.7 * progress),
          opacity: Math.min(1, progress * 2),
          filter: `blur(${Math.max(0, 1 - progress) * 4}px)`
        })),
        { duration: springs.pop.duration, delay: burst - 40, fill: "backwards" }
      )
      continue
    }

    const from = anchorX - centerOf(part)

    part.animate(
      along(springs.pop, (progress) => ({
        translate: `${from * (1 - progress) * 0.85}px ${(1 - progress) * 6}px`,
        scale: String(0.4 + 0.6 * progress),
        opacity: Math.min(1, progress * 2.2),
        filter: `blur(${Math.max(0, 1 - progress) * 5}px)`
      })),
      { duration: springs.pop.duration, delay: burst + order * timing.stagger, fill: "backwards" }
    )
  }
}
