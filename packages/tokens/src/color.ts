/*
 * What the color picker works out: a color read from a token's value or typed as hex, the same color as hue,
 * saturation and brightness for the picker's square and strip, written back in the notation the token used, and the
 * token nearest a color picked freely.
 */

/** A color as sRGB channels from 0 to 1, with alpha. */
export interface Rgba {
  r: number
  g: number
  b: number
  a: number
}

/** A color as the picker shows it: hue in degrees from 0 to 360, saturation and brightness from 0 to 100. */
export interface Hsb {
  h: number
  s: number
  b: number
}

/** A color's hue, saturation and brightness (HSV). A gray keeps hue 0. */
export function rgbaToHsb({ r, g, b }: Rgba): Hsb {
  const max = Math.max(r, g, b)
  const delta = max - Math.min(r, g, b)
  let hue = 0
  if (delta > 0) {
    if (max === r) hue = ((g - b) / delta + 6) % 6
    else if (max === g) hue = (b - r) / delta + 2
    else hue = (r - g) / delta + 4
  }
  return { h: hue * 60, s: max === 0 ? 0 : (delta / max) * 100, b: max * 100 }
}

/** The color at a hue, saturation and brightness, with `alpha` from 0 to 1. */
export function hsbToRgba({ h, s, b }: Hsb, alpha = 1): Rgba {
  const value = clamp(b / 100)
  const chroma = value * clamp(s / 100)
  const sector = (((h % 360) + 360) % 360) / 60
  const second = chroma * (1 - Math.abs((sector % 2) - 1))
  const [r, g, bl] = (
    [
      [chroma, second, 0],
      [second, chroma, 0],
      [0, chroma, second],
      [0, second, chroma],
      [second, 0, chroma],
      [chroma, 0, second]
    ] as const
  )[Math.floor(sector) % 6]!
  const lift = value - chroma
  return { r: r + lift, g: g + lift, b: bl + lift, a: clamp(alpha) }
}

/** `#rrggbb`, or `#rrggbbaa` when the color is translucent. */
export function formatHex({ r, g, b, a }: Rgba): string {
  const channels = a < 1 ? [r, g, b, a] : [r, g, b]
  return `#${channels
    .map((channel) =>
      Math.round(clamp(channel) * 255)
        .toString(16)
        .padStart(2, "0")
    )
    .join("")}`
}

/**
 * Reads `oklch(L C H)` or `oklch(L C H / A)`, as shadcn's themes write colors. Lightness and alpha take a number from 0
 * to 1 or a percentage, and `none` counts as 0. Colors outside sRGB are brought into it.
 */
export function parseOklch(value: string): Rgba | undefined {
  const match = /^oklch\(\s*([^\s/)]+)\s+([^\s/)]+)\s+([^\s/)]+)\s*(?:\/\s*([^\s)]+)\s*)?\)$/i.exec(value.trim())
  if (!match) return undefined
  const [, lightness, chroma, hue, alpha] = match
  const l = component(lightness!, 1)
  const c = component(chroma!, 0.4)
  const h = component(hue!.replace(/deg$/i, ""), 1)
  const a = alpha === undefined ? 1 : component(alpha, 1)
  if ([l, c, h, a].some((part) => part === undefined)) return undefined
  return oklchToRgba({ l: l!, c: c!, h: h! }, a!)
}

/** `oklch(L C H)` to three decimals, with `/ A` when the color is translucent. */
export function formatOklch(color: Rgba): string {
  const { l, c, h } = rgbaToOklch(color)
  const parts = [l, c, h].map((part) => decimals(part, 3))
  return `oklch(${parts.join(" ")}${color.a < 1 ? ` / ${decimals(color.a, 3)}` : ""})`
}

/** A color in OKLCH: lightness from 0 to 1, chroma from 0 (about 0.4 at most in sRGB), and hue in degrees. */
export interface Oklch {
  l: number
  c: number
  h: number
}

/** A color's lightness, chroma and hue. A gray has no hue, so it keeps hue 0 rather than one rounding wanders to. */
export function rgbaToOklch(color: Rgba): Oklch {
  const [l, a, b] = toOklab(color)
  const chroma = Math.hypot(a, b)
  if (chroma < 0.0005) return { l, c: 0, h: 0 }
  return { l, c: chroma, h: ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360 }
}

/** The color at a lightness, chroma and hue, with `alpha` from 0 to 1, brought into sRGB when it falls outside. */
export function oklchToRgba({ l, c, h }: Oklch, alpha = 1): Rgba {
  const radians = (h * Math.PI) / 180
  return { ...fromOklab(l, c * Math.cos(radians), c * Math.sin(radians)), a: clamp(alpha) }
}

/** A color as the picker's RGB fields show it: each channel from 0 to 255. */
export interface Rgb255 {
  r: number
  g: number
  b: number
}

export const rgbaToRgb255 = ({ r, g, b }: Rgba): Rgb255 => ({ r: r * 255, g: g * 255, b: b * 255 })

export const rgb255ToRgba = ({ r, g, b }: Rgb255, alpha = 1): Rgba => ({
  r: clamp(r / 255),
  g: clamp(g / 255),
  b: clamp(b / 255),
  a: clamp(alpha)
})

/** A color as the picker's HSL fields show it: hue in degrees, saturation and lightness from 0 to 100. */
export interface Hsl {
  h: number
  s: number
  l: number
}

/** A color's hue, saturation and lightness, from its hue, saturation and brightness. A gray keeps hue 0. */
export function rgbaToHsl(color: Rgba): Hsl {
  const { h, s, b } = rgbaToHsb(color)
  const value = b / 100
  const lightness = value * (1 - s / 200)
  const saturation = lightness === 0 || lightness === 1 ? 0 : (value - lightness) / Math.min(lightness, 1 - lightness)
  return { h, s: saturation * 100, l: lightness * 100 }
}

/** The color at a hue, saturation and lightness, with `alpha` from 0 to 1. */
export function hslToRgba({ h, s, l }: Hsl, alpha = 1): Rgba {
  const lightness = clamp(l / 100)
  const value = lightness + clamp(s / 100) * Math.min(lightness, 1 - lightness)
  const saturation = value === 0 ? 0 : 2 * (1 - lightness / value)
  return hsbToRgba({ h, s: saturation * 100, b: value * 100 }, alpha)
}

/** Parses `#rgb`, `#rgba`, `#rrggbb` or `#rrggbbaa`. */
export function parseHex(hex: string): Rgba | undefined {
  const digits = /^#([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i.exec(hex.trim())?.[1]
  if (!digits) return undefined
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

/** A picked color written the way `like` is: `oklch()` for a token written in it, hex otherwise. */
export function formatColorLike(color: Rgba, like: string | undefined): string {
  return like !== undefined && /^\s*oklch\(/i.test(like) ? formatOklch(color) : formatHex(color)
}

/** How far apart two colors can be and still look the same, in OKLab. */
export const sameColorDistance = 0.02

export interface NearestColor {
  /** The candidate's name. */
  name: string
  /** How far it is from the color, in OKLab, with any difference in alpha added. */
  distance: number
}

/**
 * The candidate closest to `color`, by name, from colors written as hex or `oklch()`; none when no candidate can be read.
 * Ties go to the name first in alphabetical order, so the answer doesn't depend on the order given.
 */
export function nearestColor(color: Rgba, candidates: Readonly<Record<string, string>>): NearestColor | undefined {
  let best: NearestColor | undefined
  for (const [name, value] of Object.entries(candidates)) {
    const candidate = parseColor(value)
    if (!candidate) continue
    const distance = colorDistance(color, candidate) + Math.abs(color.a - candidate.a)
    if (!best || distance < best.distance || (distance === best.distance && name < best.name)) {
      best = { name, distance }
    }
  }
  return best
}

const clamp = (value: number) => Math.min(1, Math.max(0, value))

/** A number with up to `places` decimals, without trailing zeros, and never `-0`. */
function decimals(value: number, places: number): string {
  const rounded = Number(value.toFixed(places))
  return String(rounded === 0 ? 0 : rounded)
}

/** One of `oklch()`'s parts: a number, a percentage of `full`, or `none`. */
function component(text: string, full: number): number | undefined {
  if (text.toLowerCase() === "none") return 0
  const percent = text.endsWith("%")
  const number = Number(percent ? text.slice(0, -1) : text)
  if (text === "" || !Number.isFinite(number)) return undefined
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
