import { radiusKeywords } from "@parity-app/core"
import { defaultValues, previewKind, type Token } from "@parity-app/tokens"
import { px } from "../lengths.ts"
import { comesTo } from "../token-values.ts"
import { formatNumber } from "./controls/css-values.ts"
import {
  colorToken,
  type ColorToken,
  type FontToken,
  type LeadingToken,
  lengthToken,
  type ShadowToken,
  type SizeToken,
  type TokenSets,
  type TrackingToken,
  type WeightToken,
  weightTokens
} from "./controls/tokens.ts"

/**
 * The project's own tokens as the Design tab's controls offer them (`ProjectTokens`' `sets`), in place of the
 * stand-ins in controls/tokens.ts. Each keeps its real name, the one `NodeStyle` holds (`radius-lg`, `text-xl`), and
 * what it comes to, references and spacing steps filled in. A spacing step (`spacing-4`) isn't listed: the fields hold
 * a step as its pixels. Sets for what `NodeStyle` can't hold yet (blurs, durations, layer order) are empty, so no field
 * offers one.
 */
export function projectTokenSets(tokens: readonly Token[], length: (value: string) => number = px): TokenSets {
  const byName = new Map(tokens.map((token) => [token.name, token]))
  const lookup = defaultValues(tokens)

  const read = tokens.map((token) => ({
    token,
    kind: previewKind(token, undefined, lookup),
    value: comesTo(byName, token.name) ?? ""
  }))

  const where = (test: (each: (typeof read)[number]) => boolean) => read.filter(test)
  const pixels = (value: string) => length(value)
  const measurable = (value: string) => Number.isFinite(pixels(value))

  const lengths = (kind: "radius" | "spacing" | "container" | "breakpoint", category: Token["category"]) =>
    where(
      (each) =>
        each.token.category === category &&
        !each.token.derived &&
        each.token.name !== "spacing" &&
        measurable(each.value)
    ).map((each) => lengthToken(kind, each.token.name, pixels(each.value)))

  const color: ColorToken[] = where((each) => each.token.category === "color").map((each) =>
    colorToken(each.token.name, each.value)
  )

  const shadow: ShadowToken[] = where((each) => each.token.category === "shadow" && each.kind === "shadow").map(
    (each) => ({ name: each.token.name, kind: "shadow", value: each.value, detail: each.value, layers: [] })
  )

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
    const label = weightTokens.find((token) => token.weight === number)?.label ?? each.token.name

    return Number.isFinite(number)
      ? [{ name: each.token.name, kind: "font-weight", value: each.value, detail: each.value, weight: number, label }]
      : []
  })

  // A weight is a number in the style, so a project without weight tokens still steps through Tailwind's hundreds.
  const weight = ownWeights.length > 0 ? ownWeights : weightTokens

  // A radius keyword the framework writes without a token of its own, `radius-full`, is offered as one.
  const radius = lengths("radius", "radius")

  const keywords = Object.keys(radiusKeywords)
    .filter((name) => !radius.some((token) => token.name === name))
    .map((name) => lengthToken("radius", name, 9999))

  const size: SizeToken[] = where((each) => each.token.category === "font-size" && measurable(each.value)).map(
    (each) => {
      const px = pixels(each.value)
      // Tailwind pairs each text size with its line height, `--text-xl--line-height`, as a multiple or a length.
      const paired = comesTo(byName, `${each.token.name}--line-height`)

      return {
        name: each.token.name,
        kind: "font-size",
        value: `${formatNumber(px)}px`,
        detail: `${formatNumber(px)}px`,
        px,
        lineHeight: paired === undefined ? Math.round(px * 1.5) : lineHeightPx(paired, px, length)
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
    blur: [],
    spacing: lengths("spacing", "spacing"),
    borderWidth: [],
    zIndex: [],
    container: lengths("container", "container"),
    breakpoint: lengths("breakpoint", "breakpoint"),
    duration: [],
    easing: [],
    shadow,
    insetShadow: [],
    dropShadow: [],
    textShadow: [],
    gradient: [],
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

  const px = length(value)

  return Number.isFinite(px) ? px : Math.round(size * 1.5)
}
