/*
 * What the text, opacity and keyword fields store and write, for the readout beside their stories: the stored value
 * in PAR-652's value forms, the CSS, and the Tailwind classes, as design-options-values.md's Writes lines give them.
 */
import { arbitrary, formatNumber, lengthClass, lengthCss, lengthForm } from "./css-values.ts"
import { type BlendMode, stackFamilies } from "./text-data.ts"
import type { SizeToken } from "./tokens.ts"
import type { Writes } from "./writes.ts"

const nothing: Writes = { stored: undefined, css: [], tailwind: [] }

/** A number in a class or declaration, to four decimals, as a multiple, em or opacity is stored. */
const bare = (value: number) => formatNumber(value, 4)

/** A font: a font token, or a stack of its own (`"Segoe UI", sans-serif`), allowed here with a reason or not. */
export type FontValue = { token: string } | { stack: string; allow?: string }

const genericFamilies = new Set([
  "serif",
  "sans-serif",
  "monospace",
  "cursive",
  "fantasy",
  "system-ui",
  "ui-sans-serif"
])

/** A stack as CSS writes it, each family with a space quoted. */
export function stackCss(stack: string): string {
  return stackFamilies(stack)
    .map((family) => (genericFamilies.has(family) || !family.includes(" ") ? family : `"${family}"`))
    .join(", ")
}

export function fontWrites(font: FontValue | undefined): Writes {
  if (font === undefined) return nothing
  if ("token" in font) {
    return {
      stored: { token: font.token },
      css: [`font-family: var(--font-${font.token})`],
      tailwind: [`font-${font.token}`]
    }
  }
  // A family name with spaces is quoted, with underscores for the spaces: `font-['Open_Sans',sans-serif]`.
  const families = stackFamilies(font.stack).map((family) => (family.includes(" ") ? `'${family}'` : family))
  return {
    stored: { value: stackCss(font.stack), ...(font.allow === undefined ? {} : { allow: font.allow }) },
    css: [`font-family: ${stackCss(font.stack)}`],
    tailwind: [`font-[${arbitrary(families.join(", "))}]`]
  }
}

/** Text's size: a font size token (`xl`), or pixels of its own (22). */
export type FontSize = { token: string } | { px: number; allow?: string }

/** Text's size alone, as `text-xl` or `text-[22px]`; a size token's paired line height is lineHeightWrites' to write. */
export function fontSizeWrites(size: FontSize | undefined): Writes {
  if (size === undefined) return nothing
  if ("token" in size) {
    return {
      stored: { token: size.token },
      css: [`font-size: var(--text-${size.token})`],
      tailwind: [`text-${size.token}`]
    }
  }
  const value = `${formatNumber(size.px)}px`
  return {
    stored: { value, ...(size.allow === undefined ? {} : { allow: size.allow }) },
    css: [`font-size: ${value}`],
    tailwind: [`text-[${value}]`]
  }
}

/** A weight: a font-weight token (`semibold`), or a number of its own (550). */
export type WeightValue = { token: string } | { value: number; allow?: string }

export function weightWrites(weight: WeightValue | undefined, italic: boolean | undefined): Writes {
  const stored: Record<string, unknown> = {}
  const css: string[] = []
  const tailwind: string[] = []
  if (weight !== undefined && "token" in weight) {
    stored.fontWeight = { token: weight.token }
    css.push(`font-weight: var(--font-weight-${weight.token})`)
    tailwind.push(`font-${weight.token}`)
  } else if (weight !== undefined) {
    stored.fontWeight = { value: weight.value, ...(weight.allow === undefined ? {} : { allow: weight.allow }) }
    css.push(`font-weight: ${weight.value}`)
    tailwind.push(`font-[${weight.value}]`)
  }
  if (italic !== undefined) {
    stored.fontStyle = { keyword: italic ? "italic" : "normal" }
    css.push(`font-style: ${italic ? "italic" : "normal"}`)
    tailwind.push(italic ? "italic" : "not-italic")
  }
  return Object.keys(stored).length > 0 ? { stored, css, tailwind } : nothing
}

/**
 * A line height: Auto (`normal`), a leading token, a multiple (1.5), or pixels, which are a spacing step when they
 * fall on a quarter step (22px is `leading-5.5`) and a value of their own otherwise (22.5px).
 */
export type LineHeight =
  | { keyword: "normal" }
  | { token: string }
  | { multiple: number }
  | { px: number; allow?: string }

function lineHeightParts(lineHeight: LineHeight): { stored: unknown; css: string; suffix: string } {
  if ("keyword" in lineHeight) return { stored: { keyword: "normal" }, css: "normal", suffix: "[normal]" }
  if ("token" in lineHeight) {
    return { stored: { token: lineHeight.token }, css: `var(--leading-${lineHeight.token})`, suffix: lineHeight.token }
  }
  if ("multiple" in lineHeight) {
    const value = bare(lineHeight.multiple)
    return { stored: { value }, css: value, suffix: `[${value}]` }
  }
  // Whole pixels are a spacing step (22px is `leading-5.5`), as every length writes them.
  const form = lengthForm(lineHeight.px)
  const stored =
    "step" in form ? form : { ...form, ...(lineHeight.allow === undefined ? {} : { allow: lineHeight.allow }) }
  return { stored, css: lengthCss(lineHeight.px), suffix: lengthClass(lineHeight.px) }
}

/**
 * Line height, beside the text's size token when it has one: `text-sm/6` for a size that pairs only a line height,
 * `text-display leading-7` for one that pairs a weight or letter spacing too, and `leading-6` with no size token.
 */
export function lineHeightWrites(lineHeight: LineHeight | undefined, size: SizeToken | undefined): Writes {
  if (lineHeight === undefined) return nothing
  const parts = lineHeightParts(lineHeight)
  const css = [`line-height: ${parts.css}`]
  if (size === undefined) return { stored: parts.stored, css, tailwind: [`leading-${parts.suffix}`] }
  const sizeCss = `font-size: var(--text-${size.name})`
  if ("pairsMore" in size) {
    return { stored: parts.stored, css: [sizeCss, ...css], tailwind: [`text-${size.name}`, `leading-${parts.suffix}`] }
  }
  return { stored: parts.stored, css: [sizeCss, ...css], tailwind: [`text-${size.name}/${parts.suffix}`] }
}

/** Letter spacing: a tracking token, or a value of its own in em (typed as a %) or in px. */
export type LetterSpacing = { token: string } | { em: number; allow?: string } | { px: number; allow?: string }

export function letterSpacingWrites(spacing: LetterSpacing | undefined): Writes {
  if (spacing === undefined) return nothing
  if ("token" in spacing) {
    return {
      stored: { token: spacing.token },
      css: [`letter-spacing: var(--tracking-${spacing.token})`],
      tailwind: [`tracking-${spacing.token}`]
    }
  }
  const value = "em" in spacing ? `${bare(spacing.em)}em` : `${bare(spacing.px)}px`
  return {
    stored: { value, ...(spacing.allow === undefined ? {} : { allow: spacing.allow }) },
    css: [`letter-spacing: ${value}`],
    tailwind: [`tracking-[${arbitrary(value)}]`]
  }
}

/** Layer opacity: an opacity token, or a percentage of its own. */
export type Opacity = { token: string } | { percent: number; allow?: string }

/** Whether a percentage is on opacity's steps, a quarter of a percent, so it's written bare (`opacity-47.5`). */
export const onOpacityStep = (percent: number) => Number.isInteger(percent * 4)

export function opacityWrites(opacity: Opacity | undefined, blend: BlendMode | undefined): Writes {
  const stored: Record<string, unknown> = {}
  const css: string[] = []
  const tailwind: string[] = []
  if (opacity !== undefined && "token" in opacity) {
    stored.opacity = { token: opacity.token }
    css.push(`opacity: var(--opacity-${opacity.token})`)
    tailwind.push(`opacity-${opacity.token}`)
  } else if (opacity !== undefined && onOpacityStep(opacity.percent)) {
    stored.opacity = { step: opacity.percent }
    css.push(`opacity: ${bare(opacity.percent)}%`)
    tailwind.push(`opacity-${bare(opacity.percent)}`)
  } else if (opacity !== undefined) {
    const value = bare(opacity.percent / 100)
    stored.opacity = { value: Number(value), ...(opacity.allow === undefined ? {} : { allow: opacity.allow }) }
    css.push(`opacity: ${value}`)
    // No leading zero inside the brackets: `opacity-[.473]`.
    tailwind.push(`opacity-[${arbitrary(value.replace(/^0\./, "."))}]`)
  }
  if (blend !== undefined) {
    stored.blend = { keyword: blend }
    css.push(`mix-blend-mode: ${blend}`)
    tailwind.push(`mix-blend-${blend}`)
  }
  return Object.keys(stored).length > 0 ? { stored, css, tailwind } : nothing
}

/**
 * A keyword set's value: one of its options, or a keyword outside the set read from code, kept as it was written
 * (`match-parent`), or `inherit`.
 */
export type KeywordValue = { option: string } | { custom: string }

/** What a keyword option writes: its declaration and its utility, or an arbitrary property where there's none. */
export interface KeywordOption {
  value: string
  css: string
  tailwind?: string
  /** A project token of the set's kind (a cursor token), stored as `{ token }` rather than a keyword. */
  token?: boolean
}

export function keywordWrites(
  property: string,
  value: KeywordValue | undefined,
  options: readonly KeywordOption[]
): Writes {
  if (value === undefined) return nothing
  if ("custom" in value) {
    return {
      stored: { keyword: value.custom },
      css: [`${property}: ${value.custom}`],
      tailwind: [`[${property}:${arbitrary(value.custom)}]`]
    }
  }
  const option = options.find((each) => each.value === value.option)
  if (!option) return nothing
  return {
    stored: option.token ? { token: option.value } : { keyword: option.value },
    css: [option.css],
    tailwind: [option.tailwind ?? `[${arbitrary(option.css.replace(": ", ":"))}]`]
  }
}
