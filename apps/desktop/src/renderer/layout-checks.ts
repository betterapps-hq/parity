// What the offscreen renderer reads from the page for agents' layout problems, beyond each node's box (PAR-886): an
// element drawn narrower than the width it's given, and a node whose box the layout around it doesn't set, so reaching
// past its parent is intended.
import type { Squeeze } from "@parity-app/agent"

/** How much narrower than its width an element may be drawn before it counts: a pixel, as `offsetWidth` rounds. */
const squeezeTolerance = 1

/** The limits on an element's width, in CSS pixels at its border box: what `width` sets, and its min and max. */
export interface WidthLimits {
  width: number
  min?: number
  max?: number
}

/** How wide an element's limits make it: its width, kept below its max, then above its min, as CSS does. */
export function wantedWidth(limits: WidthLimits): number {
  return Math.max(Math.min(limits.width, limits.max ?? Number.POSITIVE_INFINITY), limits.min ?? 0)
}

/** Whether an element is drawn narrower than its limits make it, beyond the tolerance, and by how much. */
export function squeezeOf(drawn: number, limits: WidthLimits): Squeeze | undefined {
  const wants = wantedWidth(limits)

  return drawn < wants - squeezeTolerance ? { width: drawn, wants: round(wants) } : undefined
}

/**
 * An element drawn narrower than its width, as a flex item that shrinks is: a sidebar beside content that can't shrink.
 * Its parent has room for its width, so what's beside it took the room. Only a width in pixels counts (a rem is pixels once computed); a percentage, `auto` or a sum with one is left out, and
 * so is an element whose width doesn't apply (inline, a table's part) or that isn't drawn.
 */
export function squeezedElement(element: HTMLElement): Squeeze | undefined {
  const computed = element.computedStyleMap()
  const width = pixels(computed.get("width"))

  if (width === undefined || element.getClientRects().length === 0) {
    return undefined
  }

  const display = String(computed.get("display"))

  if (display === "inline" || display === "contents" || display.startsWith("table-")) {
    return undefined
  }

  const style = getComputedStyle(element)

  // Lengths are the content box's unless the box sizing says the border box's, as Tailwind's base styles set.
  const extra =
    style.boxSizing === "border-box"
      ? 0
      : [style.paddingLeft, style.paddingRight, style.borderLeftWidth, style.borderRightWidth].reduce(
          (sum, length) => sum + Number.parseFloat(length),
          0
        )

  const max = maxWidth(element, computed.get("max-width"))

  if (max === null) {
    return undefined
  }

  const min = pixels(computed.get("min-width"))
  const limits: WidthLimits = { width: width + extra }

  if (max !== undefined) {
    limits.max = max + extra
  }

  if (min !== undefined) {
    limits.min = min + extra
  }

  const squeeze = squeezeOf(element.offsetWidth, limits)

  // Squeezed by what's beside it: alone, it would fit its parent. One kept narrow by its parent's own size, such as an
  // indicator as wide as the bordered box it sits in, is the parent's choice.
  return squeeze && contentWidth(element.parentElement) >= squeeze.wants - squeezeTolerance ? squeeze : undefined
}

/** The width of an element's content box, inside its padding and borders; nothing for no element. */
function contentWidth(element: HTMLElement | null): number {
  if (!element) {
    return 0
  }

  const style = getComputedStyle(element)

  return element.clientWidth - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight)
}

/**
 * Whether the layout around an element doesn't set its box, so reaching past its parent is intended: positioned
 * absolutely, fixed or sticky, nudged from where it sits, moved by a transform or a negative margin, or inline, whose
 * box follows its font rather than its line. A badge over a card's corner is one.
 */
export function isOutOfFlow(element: HTMLElement): boolean {
  const style = getComputedStyle(element)

  if (style.display === "inline" || style.position === "absolute" || style.position === "fixed") {
    return true
  }

  if (style.position === "sticky" || style.position === "relative") {
    const insets = [style.top, style.right, style.bottom, style.left]

    if (insets.some((inset) => inset !== "auto" && Number.parseFloat(inset) !== 0)) {
      return true
    }
  }

  if ([style.transform, style.translate, style.scale, style.rotate].some((value) => value && value !== "none")) {
    return true
  }

  return [style.marginTop, style.marginRight, style.marginBottom, style.marginLeft].some(
    (margin) => Number.parseFloat(margin) < 0
  )
}

/** A computed length in pixels, or nothing for a keyword, a percentage or a sum. */
function pixels(value: CSSStyleValue | undefined): number | undefined {
  return value instanceof CSSUnitValue && value.unit === "px" ? value.value : undefined
}

/**
 * An element's computed max width in pixels, a percentage taken of its parent's content box; nothing for `none`, and
 * null when it can't be told, as for a sum.
 */
function maxWidth(element: HTMLElement, value: CSSStyleValue | undefined): number | undefined | null {
  if (value === undefined || String(value) === "none") {
    return undefined
  }

  if (value instanceof CSSUnitValue && value.unit === "px") {
    return value.value
  }

  if (value instanceof CSSUnitValue && value.unit === "percent" && element.parentElement) {
    return (contentWidth(element.parentElement) * value.value) / 100
  }

  return null
}

function round(value: number): number {
  return Math.round(value * 10) / 10
}
