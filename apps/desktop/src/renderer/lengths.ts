import { parsedLength } from "@parity-app/tokens"

/** A length in pixels, from px, rem or em, or from anything else the browser can work out, such as `calc()`. */
export function px(value: string): number {
  const parsed = parsedLength(value)
  return Number.isNaN(parsed) ? measured(value) : parsed
}

const lengths = new Map<string, number>()

/** A length the browser works out, by laying out an element that wide once; NaN when it isn't a length. */
function measured(value: string): number {
  const known = lengths.get(value)
  if (known !== undefined) return known
  if (typeof document === "undefined" || !CSS.supports("width", value)) return Number.NaN
  const probe = document.createElement("div")
  probe.style.cssText = `position: absolute; visibility: hidden; width: ${value}`
  document.body.append(probe)
  const length = probe.getBoundingClientRect().width
  probe.remove()
  lengths.set(value, length)
  return length
}
