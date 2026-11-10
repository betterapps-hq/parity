/*
 * Colors read from a token's value or typed as hex, and how far apart two colors look: what contrast fixes and the
 * tokens nearest a color work from.
 */

/** A color as sRGB channels from 0 to 1, with alpha. */
export interface Rgba {
  r: number
  g: number
  b: number
  a: number
}

/**
 * Reads `oklch(L C H)` or `oklch(L C H / A)`, as shadcn's themes write colors. Lightness and alpha take a number from 0
 * to 1 or a percentage, and `none` counts as 0. Colors outside sRGB are brought into it.
 */
export function parseOklch(value: string): Rgba | undefined {
  const match = /^oklch\(\s*([^\s/)]+)\s+([^\s/)]+)\s+([^\s/)]+)\s*(?:\/\s*([^\s)]+)\s*)?\)$/i.exec(value.trim())

  if (!match) {
    return undefined
  }

  const [, lightness, chroma, hue, alpha] = match
  const l = component(lightness!, 1)
  const c = component(chroma!, 0.4)
  const h = component(hue!.replace(/deg$/i, ""), 1)
  const a = alpha === undefined ? 1 : component(alpha, 1)

  if ([l, c, h, a].some((part) => part === undefined)) {
    return undefined
  }

  return oklchToRgba({ l: l!, c: c!, h: h! }, a!)
}

/** A color in OKLCH: lightness from 0 to 1, chroma from 0 (about 0.4 at most in sRGB), and hue in degrees. */
export interface Oklch {
  l: number
  c: number
  h: number
}

/** The color at a lightness, chroma and hue, with `alpha` from 0 to 1, brought into sRGB when it falls outside. */
export function oklchToRgba({ l, c, h }: Oklch, alpha = 1): Rgba {
  const radians = (h * Math.PI) / 180

  return { ...fromOklab(l, c * Math.cos(radians), c * Math.sin(radians)), a: clamp(alpha) }
}

/** Parses `#rgb`, `#rgba`, `#rrggbb` or `#rrggbbaa`. */
export function parseHex(hex: string): Rgba | undefined {
  const digits = /^#([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i.exec(hex.trim())?.[1]

  if (!digits) {
    return undefined
  }

  const full =
    digits.length <= 4
      ? digits
          .split("")
          .map((digit) => digit + digit)
          .join("")
      : digits

  const channel = (index: number) => Number.parseInt(full.slice(index * 2, index * 2 + 2), 16) / 255

  return { r: channel(0), g: channel(1), b: channel(2), a: full.length === 8 ? channel(3) : 1 }
}

/** A color written as hex or `oklch()`; anything else, such as `var()` or a color name, isn't read here. */
export function parseColor(value: string): Rgba | undefined {
  return parseHex(value) ?? parseOklch(value)
}

const clamp = (value: number) => Math.min(1, Math.max(0, value))

/** One of `oklch()`'s parts: a number, a percentage of `full`, or `none`. */
function component(text: string, full: number): number | undefined {
  if (text.toLowerCase() === "none") {
    return 0
  }

  const percent = text.endsWith("%")
  const number = Number(percent ? text.slice(0, -1) : text)

  if (text === "" || !Number.isFinite(number)) {
    return undefined
  }

  return percent ? (number / 100) * full : number
}

/** How far apart two opaque colors look: the distance between them in OKLab. */
export function colorDistance(a: Rgba, b: Rgba): number {
  const [l1, a1, b1] = toOklab(a)
  const [l2, a2, b2] = toOklab(b)

  return Math.hypot(l1 - l2, a1 - a2, b1 - b2)
}

/** An sRGB channel without its gamma. */
export function toLinear(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
}

function fromLinear(channel: number): number {
  return clamp(channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055)
}

/** A color in OKLab: lightness, then its green–red and blue–yellow axes. */
function toOklab({ r, g, b }: Rgba): [number, number, number] {
  const [lr, lg, lb] = [toLinear(r), toLinear(g), toLinear(b)]
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)

  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675778 * s
  ]
}

/** OKLab back to opaque sRGB, clipped into it. */
function fromOklab(lightness: number, a: number, b: number): Rgba {
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3

  return {
    r: fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
    a: 1
  }
}
