/**
 * Contrast fixes from the project's own tokens: given what a contrast check measured in each frame and what every color
 * token comes to there, the token closest to the failing text color that passes in all of them.
 */

/** A color as sRGB channels from 0 to 1, with alpha. */
export interface Rgba {
  r: number
  g: number
  b: number
  a: number
}

/** One frame a layer's text was measured in, failing or passing. */
export interface ContrastFrame {
  /** The text color measured, as hex. */
  foreground: string
  /** The opaque color behind the text, as hex. */
  background: string
  /** The ratio the text needs here: 4.5, or 3 when it's large. */
  required: number
  /** What each color token comes to in this frame, as hex, by token name. */
  tokens: Readonly<Record<string, string>>
}

export interface ContrastFix {
  /** The token to color the text with. */
  token: string
  /** The ratio it reaches in each frame, in the order given, to two decimals. */
  ratios: number[]
}

export interface ContrastFixOptions {
  /** The token the text is colored with now, which is never suggested. */
  current?: string
  /**
   * Tokens to try before the rest, such as the project's own semantic ones, so text colored by a theme stays colored by
   * one. The others are tried only when none of these pass.
   */
  preferred?: ReadonlySet<string>
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

/** A color laid over an opaque one, as the text is drawn on its background. */
export function composite(top: Rgba, bottom: Rgba): Rgba {
  const mix = (a: number, b: number) => a * top.a + b * (1 - top.a)

  return { r: mix(top.r, bottom.r), g: mix(top.g, bottom.g), b: mix(top.b, bottom.b), a: 1 }
}

const linear = (channel: number) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)

/** WCAG 2's relative luminance of an opaque color. */
export function luminance({ r, g, b }: Rgba): number {
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
}

/** WCAG 2's contrast ratio of text over an opaque background, with the text's alpha laid over it first. */
export function contrastRatio(foreground: Rgba, background: Rgba): number {
  const [light, dark] = [luminance(composite(foreground, background)), luminance(background)].sort((a, b) => b - a)

  return (light! + 0.05) / (dark! + 0.05)
}

/** How far apart two opaque colors look: the distance between them in OKLab. */
export function colorDistance(a: Rgba, b: Rgba): number {
  const [l1, a1, b1] = oklab(a)
  const [l2, a2, b2] = oklab(b)

  return Math.hypot(l1 - l2, a1 - a2, b1 - b2)
}

function oklab({ r, g, b }: Rgba): [number, number, number] {
  const [lr, lg, lb] = [linear(r), linear(g), linear(b)]
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)

  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675778 * s
  ]
}

/**
 * The token closest to the text's color that passes in every frame, or none when no token does. A token must have a
 * value in every frame. Closeness is how far the token's color is from the measured one, added up over the frames, so
 * the fix changes the text as little as it can.
 */
export function contrastFix(
  frames: readonly ContrastFrame[],
  options: ContrastFixOptions = {}
): ContrastFix | undefined {
  const measured = frames.map((frame) => {
    const background = parseHex(frame.background)
    const foreground = parseHex(frame.foreground)

    return background && foreground
      ? { ...frame, background, foreground: composite(foreground, background) }
      : undefined
  })

  if (frames.length === 0 || measured.some((frame) => !frame)) {
    return undefined
  }

  const names = Object.keys(frames[0]!.tokens).filter((name) => name !== options.current)
  const candidates: { token: string; ratios: number[]; distance: number; preferred: boolean }[] = []

  for (const token of names) {
    let distance = 0
    const ratios: number[] = []

    for (const frame of measured) {
      const color = parseHex(frame!.tokens[token] ?? "")

      if (!color) {
        break
      }

      const ratio = contrastRatio(color, frame!.background)

      if (ratio < frame!.required) {
        break
      }

      ratios.push(Math.floor(ratio * 100) / 100)
      distance += colorDistance(composite(color, frame!.background), frame!.foreground)
    }

    if (ratios.length < frames.length) {
      continue
    }

    candidates.push({ token, ratios, distance, preferred: options.preferred?.has(token) ?? false })
  }

  const best = candidates.sort(
    (a, b) => Number(b.preferred) - Number(a.preferred) || a.distance - b.distance || a.token.localeCompare(b.token)
  )[0]

  return best && { token: best.token, ratios: best.ratios }
}
