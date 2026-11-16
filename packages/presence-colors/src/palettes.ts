import { contrastRatio, formatHex, oklchToRgba, parseHex, rgbaToOklch } from "@parity-app/tokens"

/**
 * The colors people and agents wear on the canvas: a gradient for pointers and badges, a solid color for outlines and
 * name tags, and the ink that reads on both. People and agents draw from the same list, so they look like one system.
 */
export interface Palette {
  /** Its number in the list, from 0. A room hands out numbers, never colors, so every copy draws the same one. */
  n: number
  /** A hand-tuned palette's name, as `Ember`; a generated one's is its hue, as `Hue 137`. */
  name: string
  stops: [string, string, string]
  color: string
  ink: string
}

/**
 * The hand-tuned palettes, in the order they're handed out: each is as far as it can be from all those before it, so
 * the first few people in a room look the most different. The first twelve are the agents' palettes from the desktop
 * app's `agent-colors.ts`, with Sky's ink a step deeper so its text passes on the blue end of its gradient. The next
 * twelve fill the gaps in hue between them, a step lighter or deeper than their neighbours.
 */
const tuned: Omit<Palette, "n">[] = [
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
  { name: "Aurora", stops: ["#5CE1FF", "#5B7CFF", "#9D6BFF"], color: "#6C8BFF", ink: "#0B1640" },
  { name: "Flamingo", stops: ["#FFD4FF", "#FFA7D8", "#FD94A2"], color: "#FFA7D8", ink: "#3B132B" },
  { name: "Glacier", stops: ["#CFFFFF", "#9BE4FE", "#9CCDFC"], color: "#9BE4FE", ink: "#002936" },
  { name: "Iris", stops: ["#CCDAFF", "#BFB0FF", "#CF94E2"], color: "#BFB0FF", ink: "#251C43" },
  { name: "Teal", stops: ["#6CCFC0", "#00B3C2", "#189CCE"], color: "#00B3C2", ink: "#002A2F" },
  { name: "Fern", stops: ["#C4DB67", "#69CC59", "#00BE8E"], color: "#69CC59", ink: "#0D2C08" },
  { name: "Apricot", stops: ["#FFE0C2", "#FFB694", "#FF9C8A"], color: "#FFB694", ink: "#3E1602" },
  { name: "Grape", stops: ["#AB93FF", "#B75EDF", "#D94AB3"], color: "#B75EDF", ink: "#260E31" },
  { name: "Jade", stops: ["#95DBA4", "#35C5A1", "#00B1B6"], color: "#35C5A1", ink: "#002C21" },
  { name: "Scarlet", stops: ["#FF8FA8", "#F34E6A", "#FF6B3D"], color: "#F34E6A", ink: "#3F1219" },
  { name: "Cobalt", stops: ["#2AB6EC", "#2A8EEF", "#767CF5"], color: "#2A8EEF", ink: "#01203F" },
  { name: "Pear", stops: ["#FBF7A6", "#DCDD40", "#9EE05A"], color: "#DCDD40", ink: "#262600" },
  { name: "Amber", stops: ["#FFE3A3", "#F9AD26", "#FF8A3D"], color: "#F9AD26", ink: "#341F00" }
]

export const tunedPalettes: readonly Palette[] = tuned.map((palette, n) => ({ n, ...palette }))

/** The angle that spreads hues furthest apart however many have been taken: 360° divided by the golden ratio, squared. */
const goldenAngle = 180 * (3 - Math.sqrt(5))

/** Where the generated hues start, in OKLCH degrees. */
const firstHue = 20

/**
 * The two steps generated palettes alternate between, both inside the hand-tuned set's range so they sit with it. Every
 * step takes dark ink, as the hand-tuned palettes do.
 */
export const generatedSteps = [
  { lightness: 0.84, chroma: 0.13 },
  { lightness: 0.72, chroma: 0.16 }
] as const

/** Hues, in OKLCH degrees, that turn olive on the deeper step, so they always take the lighter one. */
const yellows = { from: 60, to: 130 }

/** WCAG AA for text: the least contrast badge text may have over any part of its badge. */
export const inkContrast = 4.5

/**
 * Palette `n`: hand-tuned below `tunedPalettes.length`, and made from `n` above it, so the list never runs out and
 * every copy makes the same palette for the same number.
 */
export function palette(n: number): Palette {
  if (!Number.isInteger(n) || n < 0) {
    throw new RangeError(`A palette's number is a whole number from 0, not ${n}.`)
  }

  return tunedPalettes[n] ?? generate(n)
}

/** The least contrast a palette's ink has over its badge, which runs through its three stops. */
export function badgeContrast({ stops, color, ink }: Palette): number {
  const text = parseRequired(ink)

  return Math.min(...[...stops, color].map((stop) => contrastRatio(text, parseRequired(stop))))
}

/**
 * A palette past the hand-tuned ones. Its hue steps round the wheel by the golden angle, so each new hue lands in the
 * widest gap left, and it alternates between two lightness steps, except yellows, which stay on the lighter one. Its stops sit either side of its hue, lighter before
 * and deeper after, as the hand-tuned ones do, and its ink is the lightest dark of its hue that reads on all of them.
 */
function generate(n: number): Palette {
  const index = n - tunedPalettes.length
  const hue = (firstHue + index * goldenAngle) % 360
  const yellow = hue >= yellows.from && hue <= yellows.to
  const { lightness, chroma } = generatedSteps[yellow ? 0 : index % generatedSteps.length]!
  const color = inGamut(lightness, chroma, hue)

  const stops: [string, string, string] = [
    inGamut(lightness + 0.09, chroma * 0.8, hue - 22),
    color,
    inGamut(lightness - 0.04, chroma * 1.05, hue + 26)
  ]

  return { n, name: `Hue ${Math.round(hue)}`, stops, color, ink: inkFor(hue, [...stops, color]) }
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
