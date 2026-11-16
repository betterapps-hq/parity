/**
 * Contrast fixes from the project's own tokens: given what a contrast check measured in each frame and what every color
 * token comes to there, the token closest to the failing text color that passes in all of them.
 */

import { colorDistance, parseHex, type Rgba, toLinear } from "./color.ts"

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

/** A color laid over an opaque one, as the text is drawn on its background. */
export function composite(top: Rgba, bottom: Rgba): Rgba {
  const mix = (a: number, b: number) => a * top.a + b * (1 - top.a)

  return { r: mix(top.r, bottom.r), g: mix(top.g, bottom.g), b: mix(top.b, bottom.b), a: 1 }
}

/** WCAG 2's relative luminance of an opaque color. */
export function luminance({ r, g, b }: Rgba): number {
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
}

/** WCAG 2's contrast ratio of text over an opaque background, with the text's alpha laid over it first. */
export function contrastRatio(foreground: Rgba, background: Rgba): number {
  const [light, dark] = [luminance(composite(foreground, background)), luminance(background)].sort((a, b) => b - a)

  return (light! + 0.05) / (dark! + 0.05)
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
