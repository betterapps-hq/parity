import { isEasingKeyword, radiusKeywords } from "@parity-app/core"
import { formatNumber } from "@parity-app/style-schema"
import { defaultValues, type PreviewKind, previewKind, type Token } from "@parity-app/tokens"
import { px } from "../lengths.ts"
import { comesTo } from "../token-values.ts"
import { isPlainColor } from "./controls/css-values.ts"
import type { ShadowLayer } from "./controls/lists-data.ts"
import { easingValuePlot, splitUnit } from "./controls/motion-data.ts"
import {
  colorToken,
  type ColorToken,
  durationToken,
  type DurationToken,
  easingToken,
  type EasingToken,
  type FontToken,
  type GradientToken,
  type LeadingToken,
  type LengthToken,
  lengthToken,
  type ShadowToken,
  shadowToken,
  type SizeToken,
  tailwindWeights,
  type TokenSets,
  type TrackingToken,
  type WeightToken
} from "./controls/tokens.ts"
import { gradientTokenOf } from "./paint-values.ts"

/**
 * The project's own tokens as the Design tab's fields offer them, converted once where they enter the panel
 * (`StyleSections` gives them to `ProjectData`). Each keeps its real name, the one `NodeStyle` holds (`radius-lg`,
 * `text-xl`), and what it comes to, references and spacing steps filled in: a shadow's layers and a gradient's stops
 * are read from its value so its card draws it. A spacing step (`spacing-4`) isn't listed, since the fields hold a step
 * as its pixels, and neither are Tailwind's own easings and defaults (`ease-out`, `default-transition-duration`), which
 * are the fields' presets and what unset is. Sets the project has nothing for are empty. `length` measures a length and
 * `toPlain` reads a color, the browser's unless a test gives its own.
 */
export function projectTokenSets(
  tokens: readonly Token[],
  length: (value: string) => number = px,
  toPlain: (value: string) => string = plainColor
): TokenSets {
  const byName = new Map(tokens.map((token) => [token.name, token]))
  const lookup = defaultValues(tokens)

  const read = tokens.map((token) => ({
    token,
    kind: previewKind(token, undefined, lookup),
    value: comesTo(byName, token.name) ?? ""
  }))

  type Read = (typeof read)[number]

  const where = (test: (each: Read) => boolean) => read.filter(test)
  const measurable = (value: string) => Number.isFinite(length(value))

  const lengths = (kind: "radius" | "spacing" | "container" | "breakpoint", category: Token["category"]) =>
    where(
      (each) =>
        each.token.category === category &&
        !each.token.derived &&
        each.token.name !== "spacing" &&
        measurable(each.value)
    ).map((each) => lengthToken(kind, each.token.name, length(each.value)))

  const color: ColorToken[] = where((each) => each.token.category === "color").map((each) =>
    colorToken(each.token.name, each.value)
  )

  // A shadow's colors are read as plain colors, so its card draws them without the project's color tokens.
  const shadows = (kind: PreviewKind): ShadowToken[] =>
    where((each) => each.token.category === "shadow" && each.kind === kind).map((each) =>
      shadowToken(kind, each.token.name, shadowLayers(each.value, length, toPlain), [])
    )

  const blur: LengthToken[] = where((each) => each.kind === "blur" && measurable(each.value)).map((each) =>
    lengthToken("blur", each.token.name, length(each.value))
  )

  const zIndex: LengthToken[] = where((each) => each.kind === "z-index")
    .flatMap((each): LengthToken[] => {
      const order = Number(each.value)

      return Number.isInteger(order)
        ? [{ name: each.token.name, kind: "z-index", value: String(order), detail: String(order), px: order }]
        : []
    })
    .toSorted((one, other) => one.px - other.px)

  const gradient: GradientToken[] = where((each) => each.kind === "gradient").flatMap((each) => {
    const paint = gradientTokenOf(each.token.name, each.value)

    return paint ? [paint] : []
  })

  // Tailwind's own easings are its presets, and its defaults are what an unset time or easing is.
  const motion = where((each) => !each.token.name.startsWith("default-") && !isEasingKeyword(each.token.name))

  const duration: DurationToken[] = motion
    .filter((each) => each.kind === "duration")
    .flatMap((each) => {
      const split = splitUnit(lookup(each.token.name)?.trim() ?? "")
      const ms = split && (split.unit === "s" ? split.number * 1000 : split.number)

      return ms !== undefined && Number.isFinite(ms) ? [durationToken(each.token.name, ms)] : []
    })

  const easing: EasingToken[] = motion
    .filter((each) => each.kind === "easing")
    .map((each) => {
      const plot = easingValuePlot(lookup(each.token.name)?.trim() ?? "")

      return easingToken(each.token.name, plot?.kind === "bezier" ? plot.curve : undefined)
    })

  const font: FontToken[] = where((each) => each.token.category === "font").map((each) => ({
    name: each.token.name,
    kind: "font",
    value: each.value,
    detail: firstFamily(each.value),
    stack: each.value
  }))

  const ownWeights: WeightToken[] = where((each) => each.token.category === "font-weight").flatMap((each) => {
    const number = Number(each.value)
    // Named in words as Tailwind's weights are, by the hundred: 600 is Semibold.
    const label = tailwindWeights.find((token) => token.weight === number)?.label ?? each.token.name

    return Number.isFinite(number)
      ? [{ name: each.token.name, kind: "font-weight", value: each.value, detail: each.value, weight: number, label }]
      : []
  })

  // A weight is a number in the style, so a project without weight tokens still steps through Tailwind's hundreds.
  const weight = ownWeights.length > 0 ? ownWeights : tailwindWeights

  // A radius keyword the framework writes without a token of its own, `radius-full`, is offered as one.
  const radius = lengths("radius", "radius")

  const keywords = Object.keys(radiusKeywords)
    .filter((name) => !radius.some((token) => token.name === name))
    .map((name) => lengthToken("radius", name, 9999))

  const size: SizeToken[] = where((each) => each.token.category === "font-size" && measurable(each.value)).map(
    (each) => {
      const pixels = length(each.value)
      // Tailwind pairs each text size with its line height, `--text-xl--line-height`, as a multiple or a length.
      const paired = comesTo(byName, `${each.token.name}--line-height`)

      return {
        name: each.token.name,
        kind: "font-size",
        value: `${formatNumber(pixels)}px`,
        detail: `${formatNumber(pixels)}px`,
        px: pixels,
        lineHeight: paired === undefined ? Math.round(pixels * 1.5) : lineHeightPx(paired, pixels, length)
      }
    }
  )

  const leading: LeadingToken[] = where((each) => each.token.category === "leading").flatMap((each) => {
    const multiple = Number(each.value)

    return Number.isFinite(multiple)
      ? [{ name: each.token.name, kind: "leading", value: each.value, detail: `${formatNumber(multiple)}×`, multiple }]
      : []
  })

  const tracking: TrackingToken[] = where((each) => each.token.category === "tracking").flatMap((each) => {
    const em = /^(-?[\d.]+)em$/.exec(each.value.trim())

    return em
      ? [{ name: each.token.name, kind: "tracking", value: each.value, detail: each.value, em: Number(em[1]) }]
      : []
  })

  return {
    color,
    radius: [...radius, ...keywords],
    blur,
    spacing: lengths("spacing", "spacing"),
    borderWidth: [],
    zIndex,
    container: lengths("container", "container"),
    breakpoint: lengths("breakpoint", "breakpoint"),
    duration,
    easing,
    shadow: shadows("shadow"),
    insetShadow: shadows("inset-shadow"),
    dropShadow: shadows("drop-shadow"),
    textShadow: shadows("text-shadow"),
    gradient,
    weight,
    size,
    leading,
    tracking,
    opacity: [],
    cursor: [],
    font
  }
}

/** A stack's first family, unquoted, as a font field names it: `Geist` for `"Geist", sans-serif`. */
function firstFamily(stack: string): string {
  return (
    stack
      .split(",")[0]
      ?.trim()
      .replace(/^["']|["']$/g, "") ?? stack
  )
}

/** A paired line height in pixels: a multiple of the size (`calc(1.75 / 1.25)` comes to one), or a length. */
function lineHeightPx(value: string, size: number, length: (value: string) => number): number {
  const division = /^calc\(\s*([\d.]+)\s*\/\s*([\d.]+)\s*\)$/.exec(value.trim())
  const multiple = division ? Number(division[1]) / Number(division[2]) : Number(value)

  if (Number.isFinite(multiple)) {
    return Math.round(size * multiple * 100) / 100
  }

  const pixels = length(value)

  return Number.isFinite(pixels) ? pixels : Math.round(size * 1.5)
}

/** Splits at the commas and spaces that aren't inside parentheses. */
function topLevel(text: string, separator: "," | " "): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ""

  for (const character of text) {
    if (character === "(") {
      depth += 1
    } else if (character === ")") {
      depth -= 1
    }

    const splits = depth === 0 && (separator === " " ? /\s/.test(character) : character === separator)

    if (splits) {
      parts.push(current)
      current = ""
    } else {
      current += character
    }
  }

  parts.push(current)

  return parts.flatMap((part) => (part.trim() ? [part.trim()] : []))
}

let paint: CanvasRenderingContext2D | null | undefined

/**
 * A color as a plain color the controls draw as written: `#rrggbb`, with its alpha as two more digits, as the browser
 * reads it (`rgb(0 0 0 / 0.1)` is `#0000001a`). One it can't read stays as it is.
 */
export function plainColor(color: string): string {
  if (isPlainColor(color)) {
    return color
  }

  paint ??= document.createElement("canvas").getContext("2d")

  if (!paint) {
    return color
  }

  paint.fillStyle = "#000000"
  paint.fillStyle = color
  const drawn = paint.fillStyle
  const rgba = /^rgba\((\d+), (\d+), (\d+), ([\d.]+)\)$/.exec(drawn)

  if (!rgba) {
    return drawn
  }

  const hex = (number: number) => Math.round(number).toString(16).padStart(2, "0")
  const channels = [rgba[1], rgba[2], rgba[3]].map((channel) => hex(Number(channel))).join("")

  return `#${channels}${hex(Number(rgba[4]) * 255)}`
}

/** A shadow value's layers, top first: `0 1px 3px 0 rgb(0 0 0 / 0.1), …`, each color plain, as `color` makes it. */
export function shadowLayers(
  value: string,
  length: (value: string) => number = px,
  color: (value: string) => string = plainColor
): ShadowLayer[] {
  return topLevel(value, ",").flatMap((layer) => {
    const words = topLevel(layer, " ")
    const inset = words.includes("inset")
    const numbers: number[] = []
    let drawn = "#000000"

    for (const word of words) {
      if (word === "inset") {
        continue
      }

      const pixels = word === "0" ? 0 : length(word)

      if (Number.isFinite(pixels) && numbers.length < 4) {
        numbers.push(pixels)
      } else {
        drawn = color(word)
      }
    }

    if (numbers.length < 2) {
      return []
    }

    const [x = 0, y = 0, blur = 0, spread = 0] = numbers
    const parsed: ShadowLayer = { x, y, blur, spread, color: drawn }

    if (inset) {
      parsed.inset = true
    }

    return [parsed]
  })
}
