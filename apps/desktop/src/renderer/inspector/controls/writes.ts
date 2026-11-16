/*
 * What each control's value is stored as and what it writes, for the readout beside each story: the stored value in
 * PAR-652's value forms (`{ token }`, `{ step }`, `{ value }`, `{ keyword }`, `{ mode }`) and the CSS. The stored value
 * is kept apart from any framework's classes (call 7), which are written from it elsewhere.
 */
import { lengthForm, trackSizeCss } from "@parity-app/style-schema"
import { colorCss, isPlainColor, lengthCss } from "./css-values.ts"
import {
  type Draft,
  isFixedSize,
  isLengthToken,
  isSizeMode,
  isTokenSize,
  type Length,
  type Radius,
  type Size
} from "./data.ts"
import { sideCss, sideNumber, type Sides, sideStored, sidesWrites, type SideValue } from "./sides-writes.ts"
import type { LengthToken } from "./tokens.ts"

/**
 * A stored value as JSON holds it: text, a number, a list, or an object of them, as PAR-652's value forms are. An
 * unset part is undefined, which JSON leaves out of an object and writes as null in a list.
 */
export type StoredValue = string | number | boolean | null | undefined | readonly StoredValue[] | StoredObject

/** A stored value's object form (`{ token }`, `{ value, allow }`), or several properties' values by name. */
export interface StoredObject {
  [key: string]: StoredValue
}

/** A stored form with why it's allowed here, where it is: `{ value, allow }`. */
export function withAllow(form: StoredObject, allow: string | undefined): StoredObject {
  return allow === undefined ? form : { ...form, allow }
}

/** What a control writes: its stored value and the CSS declarations. */
export interface Writes {
  stored: StoredValue
  css: string[]
  /** What it changes in the markup rather than the style, as a text layer's tag does. */
  markup?: string
}

/** A length in pixels for a property, as a spacing step where it is one: `gap: calc(var(--spacing) * 4)`. */
export function lengthWrites(property: string, px: number | undefined): Writes {
  if (px === undefined) {
    return { stored: undefined, css: [] }
  }

  return { stored: lengthForm(px), css: [`${property}: ${lengthCss(px)}`] }
}

/** A color: a token, with its alpha written after it, or a plain value, whose alpha is part of it. */
export function colorWrites(
  prefix: "bg" | "border",
  value: string | undefined,
  alpha: number | undefined,
  allowed?: string
): Writes {
  const property = prefix === "bg" ? "background-color" : "border-color"

  if (value === undefined) {
    return { stored: undefined, css: [] }
  }

  const css = colorCss(value, alpha)

  if (isPlainColor(value)) {
    // The alpha is part of a plain color, stored and written with it: `#2f6fed80`, `oklch(… / 50%)`.
    return { stored: withAllow({ value: css }, allowed), css: [`${property}: ${css}`] }
  }

  const stored: StoredObject = { token: value }

  if (alpha !== undefined) {
    stored.alpha = { step: alpha }
  }

  return { stored, css: [`${property}: ${css}`] }
}

/** A token or a value of its own, stored with its form and why it's allowed, if it is. */
function lengthStored(value: Length | undefined): StoredValue {
  if (value === undefined) {
    return undefined
  }

  if (isLengthToken(value)) {
    return { token: value }
  }

  return withAllow({ value: `${value.px}px` }, value.allow)
}

/** A radius as stored: a length's form, or a percentage as its value (`{ value: "50%" }`). */
const radiusStored = (value: Radius | undefined): StoredValue =>
  value !== undefined && !isLengthToken(value) && "percent" in value
    ? { value: `${value.percent}%` }
    : lengthStored(value)

const cornerNames = ["top-left", "top-right", "bottom-right", "bottom-left"] as const

/** Radius: one for every corner, or each corner's own, and the corner shape where it's set. */
export function radiusWrites(radius: Draft["radius"], cornerStyle?: string): Writes {
  const one = (value: Radius | undefined) => {
    if (value === undefined) {
      return undefined
    }

    if (isLengthToken(value)) {
      return `var(--${value})`
    }

    return "percent" in value ? `${value.percent}%` : `${value.px}px`
  }

  const css: string[] = []
  let stored: StoredValue

  if (Array.isArray(radius)) {
    stored = radius.map(radiusStored)
    radius.forEach((value, index) => {
      const written = one(value)

      if (written !== undefined) {
        css.push(`border-${cornerNames[index]}-radius: ${written}`)
      }
    })
  } else {
    stored = radiusStored(radius)
    const written = one(radius)

    if (written !== undefined) {
      css.push(`border-radius: ${written}`)
    }
  }

  if (cornerStyle && cornerStyle !== "round") {
    css.push(`corner-shape: ${cornerStyle}`)
    // oxlint-disable-next-line anti-slop/no-shape-in-symbol-names -- stored keys are CSS's property names, as `fontWeight` is.
    stored = { radius: stored, cornerShape: { keyword: cornerStyle } }
  }

  return { stored, css }
}

/** Where a stroke is drawn: in layout as a border, or as an outline inside, centered on or outside the edge (call 2). */
export type StrokePosition = "inside" | "center" | "outside"

/** A stroke 1px on every side, the project's usual. */
export const oneEverySide: Sides = [{ number: 1 }, { number: 1 }, { number: 1 }, { number: 1 }]

/**
 * A stroke: its width per side, its color, and where it's drawn. An outline has one width, so out of layout, sides
 * that differ are written at the widest, as taking a stroke out of layout makes them; a token side is as wide as the
 * project's border-width token says (`tokens`).
 */
export function strokeWrites(
  draft: Draft,
  inLayout: boolean,
  position: StrokePosition,
  tokens: readonly LengthToken[]
): Writes {
  if (draft.border === undefined && draft.borderWidth === undefined) {
    return { stored: undefined, css: [] }
  }

  const color = colorWrites("border", draft.border, draft.borderAlpha, draft.borderAllowed)
  const sides = draft.borderWidth ?? oneEverySide
  const widths = sidesWrites("border", sides)
  const stored: StoredObject = { width: widths.stored, color: color.stored }

  if (!inLayout) {
    stored.position = { keyword: position }
  }

  if (!inLayout) {
    const px = Math.max(...sides.map((side) => sideNumber(side, tokens) ?? 0)) || 1
    const offset = { inside: -px, center: -px / 2, outside: 0 }[position]
    const colorValue = color.css[0]?.replace("border-color: ", "") ?? "currentColor"

    return { stored, css: [`outline: ${px}px solid ${colorValue}`, `outline-offset: ${offset}px`] }
  }

  return { stored, css: [...widths.css, ...color.css] }
}

/** A width or height: a length, a percentage, or a mode (Hug, Fill, Min content, Max content). */
function sizeWrites(property: "width" | "height", size: Size | undefined, setBy?: string): Writes {
  if (setBy) {
    return { stored: { mode: "auto", setBy }, css: [] }
  }

  if (size === undefined) {
    return { stored: undefined, css: [] }
  }

  if (isFixedSize(size)) {
    return { stored: lengthForm(size), css: [`${property}: ${lengthCss(size)}`] }
  }

  if (isTokenSize(size)) {
    return { stored: { token: size.token }, css: [`${property}: var(--${size.token})`] }
  }

  if (isSizeMode(size)) {
    const modes = { hug: "fit-content", fill: "100%", min: "min-content", max: "max-content" } as const

    return { stored: { mode: size }, css: [`${property}: ${modes[size]}`] }
  }

  return { stored: { value: `${size.percent}%` }, css: [`${property}: ${size.percent}%`] }
}

/** Width and height, their limits and the aspect ratio, outside a layout (Fill is `100%`, Hug `fit-content`). */
export function sizeRowWrites(draft: Draft): Writes {
  const width = sizeWrites("width", draft.width)
  const height = sizeWrites("height", draft.height, draft.aspect ? "Aspect ratio" : undefined)
  const css = [...width.css, ...height.css]

  const limits = [
    ["minWidth", "min-width"],
    ["maxWidth", "max-width"],
    ["minHeight", "min-height"],
    ["maxHeight", "max-height"]
  ] as const

  const stored: StoredObject = { width: width.stored, height: height.stored }

  for (const [key, property] of limits) {
    const px = draft[key]

    if (px === undefined) {
      continue
    }

    stored[key] = lengthForm(px)
    css.push(`${property}: ${lengthCss(px)}`)
  }

  if (draft.aspect) {
    stored.aspect = { value: draft.aspect }
    css.push(`aspect-ratio: ${draft.aspect}`)
  }

  return { stored, css }
}

/** The layout: flex or grid, its direction, wrapping, alignment and tracks. */
export function layoutWrites(draft: Draft): Writes {
  const css: string[] = []
  const stored: StoredObject = {}

  if (draft.columns !== undefined) {
    css.push("display: grid")
    stored.display = { keyword: "grid" }

    if (Array.isArray(draft.columns)) {
      stored.columns = draft.columns
      css.push(`grid-template-columns: ${draft.columns.map(trackSizeCss).join(" ")}`)
    } else {
      stored.columns = { repeat: "auto-fit", min: lengthForm(draft.columns.fit) }
      css.push(`grid-template-columns: repeat(auto-fit, minmax(${draft.columns.fit}px, 1fr))`)
    }

    if (draft.rows?.length) {
      stored.rows = draft.rows
      css.push(`grid-template-rows: ${draft.rows.map(trackSizeCss).join(" ")}`)
    } else if (draft.autoRows) {
      stored.autoRows = draft.autoRows
      css.push(`grid-auto-rows: ${trackSizeCss(draft.autoRows)}`)
    }

    if (draft.dense) {
      stored.flow = { keyword: "dense" }
      css.push("grid-auto-flow: dense")
    }

    gapWrites(draft, true, stored, css)

    for (const [key, property, value] of [
      ["itemsX", "justify-items", draft.itemsX],
      ["itemsY", "align-items", draft.itemsY]
    ] as const) {
      if (value === undefined || value === "stretch") {
        continue
      }

      stored[key] = { keyword: value }
      css.push(`${property}: ${value}`)
    }

    return { stored, css }
  }

  const direction = draft.direction ?? "column"
  const reversed = draft.reverse ? "-reverse" : ""
  stored.direction = { keyword: `${direction}${reversed}` }
  css.push("display: flex", `flex-direction: ${direction}${reversed}`)

  if (draft.wrap) {
    stored.wrap = { keyword: "wrap" }
    css.push("flex-wrap: wrap")
  }

  // The box is physical, so a reversed layout writes the other end.
  const justify = draft.justify ?? "start"
  const written = draft.reverse ? ({ start: "end", center: "center", end: "start" } as const)[justify] : justify

  if (draft.gap === "auto") {
    const spread = draft.distribute ?? "between"
    stored.justify = { keyword: `space-${spread}` }
    css.push(`justify-content: space-${spread}`)
  } else if (written !== "start") {
    stored.justify = { keyword: written }
    css.push(`justify-content: ${written === "center" ? "center" : "flex-end"}`)
  }

  const align = draft.align

  if (align !== undefined && align !== "stretch") {
    stored.align = { keyword: align }

    const aligned = {
      start: "flex-start",
      center: "center",
      end: "flex-end",
      baseline: "baseline",
      "last baseline": "last baseline"
    }[align]

    css.push(`align-items: ${aligned}`)
  }

  if (draft.wrap && draft.lines !== undefined) {
    stored.lines = { keyword: draft.lines }
    const value = { center: "center", end: "flex-end", between: "space-between", stretch: "stretch" }[draft.lines]
    css.push(`align-content: ${value}`)
  }

  gapWrites(draft, draft.wrap ?? false, stored, css)

  return { stored, css }
}

/**
 * A layout's gap: one length or spacing token, written as padding's are, or a column and a row gap once they differ
 * (wrapping, or in a grid). A negative gap is a negative margin on each child but the last, since CSS's gap can't be
 * negative.
 */
function gapWrites(draft: Draft, twoWays: boolean, stored: StoredObject, css: string[]) {
  const gap = draft.gap === "auto" ? undefined : draft.gap
  const rowGap = twoWays && draft.rowGap !== "auto" ? draft.rowGap : undefined

  /*
   * A negative gap overlaps the children with a negative margin on each but the last, as Tailwind's `-space-*` writes
   * it; reversed, the margin is on their start side, as `space-*-reverse` moves it. Only a flex layout that doesn't
   * wrap takes one: a grid, or wrapped lines, would write nothing that works, so neither writes it.
   */
  if (gap !== undefined && "number" in gap && gap.number < 0) {
    if (draft.columns !== undefined || draft.wrap) {
      return
    }

    const across = (draft.direction ?? "column") === "row"
    const side = draft.reverse ? "start" : "end"
    stored.gap = lengthForm(gap.number)
    css.push(`& > :not(:last-child) { margin-${across ? "inline" : "block"}-${side}: ${lengthCss(gap.number)} }`)

    return
  }

  const write = (side: SideValue, key: string, property: string) => {
    stored[key] = sideStored("gap", side)
    css.push(`${property}: ${sideCss("gap", side)}`)
  }

  if (rowGap === undefined || JSON.stringify(rowGap) === JSON.stringify(gap)) {
    if (gap !== undefined) {
      write(gap, "gap", "gap")
    }

    return
  }

  if (gap !== undefined) {
    write(gap, "columnGap", "column-gap")
  }

  write(rowGap, "rowGap", "row-gap")
}

/** A grid child's place: span and start lines, or start and end lines, and where it sits in its cell. */
export function placementWrites(draft: Draft): Writes {
  const css: string[] = []
  const stored: StoredObject = {}

  const axis = (name: "col" | "row", start?: number, span?: number | "all", end?: number) => {
    const property = name === "col" ? "grid-column" : "grid-row"

    if (span === "all") {
      stored[name] = { span: { keyword: "all" } }
      css.push(`${property}: 1 / -1`)

      return
    }

    if (start === undefined && span === undefined && end === undefined) {
      return
    }

    stored[name] = { start, ...(end === undefined ? { span } : { end }) }
    css.push(`${property}: ${start ?? "auto"} / ${end ?? `span ${span ?? 1}`}`)
  }

  // Its own size, which unset fills its cell.
  for (const [key, size] of [
    ["width", sizeWrites("width", draft.childWidth)],
    ["height", sizeWrites("height", draft.childHeight)]
  ] as const) {
    if (size.stored === undefined) {
      continue
    }

    stored[key] = size.stored
    css.push(...size.css)
  }

  axis("col", draft.colStart, draft.colSpan, draft.endLines ? draft.colEnd : undefined)
  axis("row", draft.rowStart, draft.rowSpan, draft.endLines ? draft.rowEnd : undefined)

  if (draft.alignSelf) {
    stored.alignSelf = { keyword: draft.alignSelf }
    css.push(`align-self: ${draft.alignSelf}`)
  }

  if (draft.justifySelf) {
    stored.justifySelf = { keyword: draft.justifySelf }
    css.push(`justify-self: ${draft.justifySelf}`)
  }

  return { stored: Object.keys(stored).length > 0 ? stored : undefined, css }
}

/** A text layer's tag, around its text: the element it's written as, which is markup, not style. */
export function tagWrites(tag: string | undefined, text: string): Writes {
  const element = tag ?? "p"

  return {
    stored: tag === undefined ? undefined : { keyword: tag },
    css: [],
    markup: `<${element}>${text}</${element}>`
  }
}

/** What a control writes when it's set in a state, Hover say: stored under the state, and its CSS nested in it. */
export function inState(writes: Writes, state: "hover"): Writes {
  return {
    stored: { [state]: writes.stored },
    css: writes.css.map((line) => `&:${state} { ${line} }`)
  }
}

/** What an unset control writes: nothing stored, and no CSS. */
export const noWrites: Writes = { stored: undefined, css: [] }

/** Layers whose values differ: each keeps its own, and nothing is written until one is set for them all. */
export const mixedWrites: Writes = { stored: "Mixed: each layer keeps its own", css: [] }

/** Several properties' writes as one, each stored under its own key (call 4); unset when none is set. */
export function mergeWrites(parts: Record<string, Writes>): Writes {
  const set = Object.entries(parts).filter(([, part]) => part.stored !== undefined)

  return {
    stored: set.length > 0 ? Object.fromEntries(set.map(([key, part]) => [key, part.stored])) : undefined,
    css: set.flatMap(([, part]) => part.css)
  }
}
