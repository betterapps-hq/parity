import { colorDistance, contrastRatio, formatHex, oklchToRgba, parseHex, rgbaToOklch } from "@parity-app/tokens"

/**
 * The colors people and agents wear on the canvas: a gradient for pointers and badges, a solid color for outlines and
 * name tags, and the ink that reads on both. People and agents each have their own list, and neither runs out. What
 * keeps them apart is their style, not their hue: an agent's palette is vivid and its gradient sweeps across
 * neighbouring hues; a person's is soft and light, and its gradient stays in one hue.
 */
export interface Palette {
  /** Its number in its list, from 0. A room hands out numbers, never colors, so every copy draws the same one. */
  n: number
  /** A hand-tuned palette's name, as `Ember`; a generated one's is its hue, as `Hue 137`. */
  name: string
  stops: [string, string, string]
  color: string
  ink: string
}

/**
 * The agents' hand-tuned palettes, from the desktop app's `agent-colors.ts`, with Sky's ink a step deeper so its text
 * passes on the blue end of its gradient. The first agents at work get these.
 */
const tunedAgents: Omit<Palette, "n">[] = [
  { name: "Ember", stops: ["#FFB347", "#FF5A5F", "#FF4FA3"], color: "#FF6A5A", ink: "#3D0D05" },
  { name: "Citrus", stops: ["#F4FF7A", "#B6F25A", "#5FE08A"], color: "#B6F25A", ink: "#1F3A08" },
  { name: "Indigo", stops: ["#8FA8FF", "#7A6EFF", "#B36BFF"], color: "#7A6EFF", ink: "#120C40" },
  { name: "Sky", stops: ["#8FF3FF", "#4CC4FF", "#6B8CFF"], color: "#4CC4FF", ink: "#022A40" },
  { name: "Magenta", stops: ["#FF8AF0", "#E66AEB", "#9B6BFF"], color: "#E66AEB", ink: "#3A0A3D" },
  { name: "Gold", stops: ["#FFF3A0", "#FFD54A", "#FFA94D"], color: "#FFD54A", ink: "#3A2A05" },
  { name: "Sunset", stops: ["#FFE08A", "#FF9B4A", "#FF6B6B"], color: "#FF9B4A", ink: "#3A1A05" },
  { name: "Mint", stops: ["#B8FFB0", "#5EE89A", "#2FCFB5"], color: "#5EE89A", ink: "#0A3A1E" },
  { name: "Lagoon", stops: ["#7CFFE4", "#34D8D0", "#3AA8FF"], color: "#34D8D0", ink: "#053A38" },
  { name: "Orchid", stops: ["#9D8CFF", "#B57CFF", "#FF8AD8"], color: "#B57CFF", ink: "#2A0B40" },
  { name: "Rose", stops: ["#FFB3C8", "#FF6FA0", "#FF8A6B"], color: "#FF6FA0", ink: "#40081F" },
  { name: "Aurora", stops: ["#5CE1FF", "#5B7CFF", "#9D6BFF"], color: "#6C8BFF", ink: "#0B1640" }
]

/** The agents' hand-tuned palettes, numbered. */
export const tunedAgentPalettes: readonly Palette[] = tunedAgents.map((each, n) => ({ n, ...each }))

/** How a list's generated palettes look: the lightness and chroma steps they alternate between, and their gradient. */
interface Style {
  steps: readonly { lightness: number; chroma: number }[]
  /** The gradient's three stops around a palette's color. */
  stops: (lightness: number, chroma: number, hue: number) => [string, string, string]
  /** Where its hues start, in OKLCH degrees. */
  firstHue: number
  /**
   * How many hues to a ring, when hues are handed out in evenly spaced rings (see `onRing`) rather than by the golden
   * angle.
   */
  ring?: number
}

/** Agents: vivid, the gradient sweeping from a lighter hue before to a deeper one after, as the hand-tuned ones do. */
const agentStyle: Style = {
  steps: [
    { lightness: 0.76, chroma: 0.17 },
    { lightness: 0.68, chroma: 0.18 }
  ],
  stops: (lightness, chroma, hue) => [
    inGamut(lightness + 0.1, chroma * 0.85, hue - 34),
    inGamut(lightness, chroma, hue),
    inGamut(lightness - 0.03, chroma * 1.05, hue + 38)
  ],
  firstHue: 45
}

/** People: soft and light, the gradient running from paler to deeper in the one hue. */
const personStyle: Style = {
  steps: [
    { lightness: 0.9, chroma: 0.09 },
    { lightness: 0.83, chroma: 0.11 }
  ],
  stops: (lightness, chroma, hue) => [
    inGamut(lightness + 0.05, chroma * 0.6, hue),
    inGamut(lightness, chroma, hue),
    inGamut(lightness - 0.07, chroma * 1.2, hue)
  ],
  firstHue: 20,
  ring: 12
}

/** Hues, in OKLCH degrees, that turn olive on a deeper step, so they always take the lighter one. */
const yellows = { from: 60, to: 130 }

/** The angle that spreads hues furthest apart however many have been taken: 360° divided by the golden ratio, squared. */
const goldenAngle = 180 * (3 - Math.sqrt(5))

/** WCAG AA for text: the least contrast badge text may have over any part of its badge. */
export const inkContrast = 4.5

/**
 * How far, in OKLab, a generated agent palette's color always is from the hand-tuned ones', so it doesn't pass for one
 * of them; candidates closer than this are skipped.
 */
export const tunedClearance = 0.06

/**
 * Person `n`'s palette. Every copy makes the same palette for the same number, and the list never runs out: hues step
 * round the wheel by the golden angle, so each lands in the widest gap left.
 */
export function palette(n: number): Palette {
  check(n)

  return { n, ...generate(personStyle, n) }
}

const generatedAgents: Omit<Palette, "n">[] = []
let agentCandidates = 0

/**
 * Agent `n`'s palette: hand-tuned for the first `tunedAgentPalettes.length`, generated after, skipping any too close to
 * a hand-tuned one. It never runs out either.
 */
export function agentPalette(n: number): Palette {
  check(n)
  const tuned = tunedAgentPalettes[n]

  if (tuned) {
    return tuned
  }

  while (generatedAgents.length <= n - tunedAgentPalettes.length) {
    const next = generate(agentStyle, agentCandidates)
    agentCandidates += 1
    const color = parseRequired(next.color)

    if (tunedAgents.every((each) => colorDistance(color, parseRequired(each.color)) >= tunedClearance)) {
      generatedAgents.push(next)
    }
  }

  return { ...generatedAgents[n - tunedAgentPalettes.length]!, n }
}

function check(n: number) {
  if (!Number.isInteger(n) || n < 0) {
    throw new RangeError(`A palette's number is a whole number from 0, not ${n}.`)
  }
}

/** The least contrast a palette's ink has over its badge, which runs through its three stops. */
export function badgeContrast({ stops, color, ink }: Palette): number {
  const text = parseRequired(ink)

  return Math.min(...[...stops, color].map((stop) => contrastRatio(text, parseRequired(stop))))
}

/**
 * The `index`th palette in a style. Its hue steps round the wheel by the golden angle from the style's first hue, and
 * it alternates between the style's steps, except yellows, which stay on the lighter one. Its ink is the lightest dark
 * of its hue that reads on all of its stops.
 */
function generate(style: Style, index: number): Omit<Palette, "n"> {
  const { hue, step }: Place = style.ring ? onRing(style.ring, index) : { hue: index * goldenAngle, step: index }
  const at = (style.firstHue + hue) % 360
  const yellow = at >= yellows.from && at <= yellows.to
  const { lightness, chroma } = style.steps[yellow ? 0 : step % style.steps.length]!
  const stops = style.stops(lightness, chroma, at)
  const color = stops[1]

  return { name: `Hue ${Math.round(at)}`, stops, color, ink: inkFor(at, stops) }
}

/** Where a palette sits on the wheel, in degrees from a style's first hue, and which of its steps it takes. */
interface Place {
  hue: number
  step: number
}

/**
 * Where palette `index` sits when they're handed out in rings of `count` evenly spaced hues: the first ring from 0°,
 * each later one turned to fall between those before it (half a slot, then quarters, and so on). Neighbours on a ring
 * take different steps, and each ring swaps them.
 */
function onRing(count: number, index: number): Place {
  const ring = Math.floor(index / count)
  const slot = spread(count)[index % count]!
  let turn = 0

  for (let rest = ring, part = 0.5; rest > 0; rest = Math.floor(rest / 2), part /= 2) {
    turn += (rest % 2) * part
  }

  return { hue: ((slot + turn) * 360) / count, step: slot + ring }
}

/**
 * The slots of an evenly spaced ring of `count`, in the order to hand them out: each as far round the wheel as it can be
 * from those already taken.
 */
function spread(count: number): number[] {
  const order = [0]

  while (order.length < count) {
    let best = 0
    let bestGap = -1

    for (let slot = 0; slot < count; slot += 1) {
      if (order.includes(slot)) {
        continue
      }

      const gap = Math.min(...order.map((taken) => Math.min(Math.abs(slot - taken), count - Math.abs(slot - taken))))

      if (gap > bestGap) {
        best = slot
        bestGap = gap
      }
    }

    order.push(best)
  }

  return order
}

/** The lightest dark ink of `hue`, from a lightness of 0.26 down, that passes the contrast check over every color. */
function inkFor(hue: number, under: string[]): string {
  const backgrounds = under.map(parseRequired)

  for (let lightness = 0.26; lightness > 0; lightness -= 0.02) {
    const ink = inGamut(lightness, 0.07, hue)
    const text = parseRequired(ink)

    if (backgrounds.every((background) => contrastRatio(text, background) >= inkContrast)) {
      return ink
    }
  }

  return "#000000"
}

/**
 * The color at this lightness and hue, with as much of `chroma` as sRGB can show. Chroma is reduced rather than the
 * channels clipped, so the hue holds.
 */
function inGamut(lightness: number, chroma: number, hue: number): string {
  const l = Math.min(Math.max(lightness, 0), 1)
  const h = ((hue % 360) + 360) % 360
  let shown = 0
  let tooMuch = chroma

  if (fits(l, chroma, h)) {
    shown = chroma
  } else {
    for (let step = 0; step < 16; step += 1) {
      const middle = (shown + tooMuch) / 2

      if (fits(l, middle, h)) {
        shown = middle
      } else {
        tooMuch = middle
      }
    }
  }

  return formatHex(oklchToRgba({ l, c: shown, h }))
}

/** Whether sRGB can show this color as it is, without clipping it. */
function fits(l: number, c: number, h: number): boolean {
  const back = rgbaToOklch(oklchToRgba({ l, c, h }))

  return Math.abs(back.l - l) < 0.003 && Math.abs(back.c - c) < 0.003
}

function parseRequired(hex: string) {
  const color = parseHex(hex)

  if (!color) {
    throw new Error(`${hex} isn't a hex color.`)
  }

  return color
}
