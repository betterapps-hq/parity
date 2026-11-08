/*
 * What each control's value is stored as and what it writes, for the readout beside each story: the stored value in
 * PAR-652's value forms (`{ token }`, `{ step }`, `{ value }`, `{ keyword }`, `{ mode }`), the CSS, and the Tailwind
 * classes. The stored value is kept apart from the Tailwind (call 7), so another framework's output can sit beside it.
 */
import { arbitrary, colorCss, fraction, isPlainColor, lengthClass, lengthCss, lengthForm } from "./css-values.ts"
import { type Draft, type Length, type Size, type Track, trackCss } from "./data.ts"
import { radiusTokens } from "./tokens.ts"

/** What a control writes: its stored value, the CSS declarations and the Tailwind classes. */
export interface Writes {
  stored: unknown
  css: string[]
  tailwind: string[]
  /** What it changes in the markup rather than the style, as a text layer's tag does. */
  markup?: string
}

/** A length in pixels for a property, as a spacing step where it is one: `gap: calc(var(--spacing) * 4)`, `gap-4`. */
export function lengthWrites(property: string, prefix: string, px: number | undefined): Writes {
  if (px === undefined) return { stored: undefined, css: [], tailwind: [] }
  return { stored: lengthForm(px), css: [`${property}: ${lengthCss(px)}`], tailwind: [`${prefix}-${lengthClass(px)}`] }
}

/** A color: a token, with its alpha written after it, or a plain value, whose alpha is part of it. */
export function colorWrites(
  prefix: "bg" | "border",
  value: string | undefined,
  alpha: number | undefined,
  allowed?: string
): Writes {
  const property = prefix === "bg" ? "background-color" : "border-color"
  if (value === undefined) return { stored: undefined, css: [], tailwind: [] }
  const css = colorCss(value, alpha)
  if (isPlainColor(value)) {
    // The alpha is part of a plain color, stored and written with it: `#2f6fed80`, `oklch(… / 50%)`.
    return {
      stored: { value: css, ...(allowed === undefined ? {} : { allow: allowed }) },
      css: [`${property}: ${css}`],
      tailwind: [`${prefix}-[${arbitrary(css)}]`]
    }
  }
  return {
    stored: { token: value, ...(alpha === undefined ? {} : { alpha: { step: alpha } }) },
    css: [`${property}: ${css}`],
    tailwind: [`${prefix}-${value}${alpha === undefined ? "" : `/${alpha}`}`]
  }
}

/** A token or a value of its own, stored with its form and why it's allowed, if it is. */
function lengthStored(value: Length | undefined): unknown {
  if (value === undefined) return undefined
  if (typeof value === "string") return { token: value }
  return { value: `${value.px}px`, ...(value.allow === undefined ? {} : { allow: value.allow }) }
}

const cornerNames = ["top-left", "top-right", "bottom-right", "bottom-left"] as const
const cornerClasses = ["tl", "tr", "br", "bl"] as const

/** Radius: one for every corner, or each corner's own, and the corner shape where it's set. */
export function radiusWrites(radius: Draft["radius"], cornerShape?: string): Writes {
  const one = (value: Length | undefined, side?: string) => {
    const prefix = side ? `rounded-${side}` : "rounded"
    if (value === undefined) return undefined
    if (typeof value === "string") {
      const token = radiusTokens.find((other) => other.name === value)
      return { css: `var(--${value})`, tailwind: `${prefix}-${value.replace("radius-", "")}`, full: token?.px === 9999 }
    }
    return { css: `${value.px}px`, tailwind: `${prefix}-[${value.px}px]`, full: false }
  }
  const css: string[] = []
  const tailwind: string[] = []
  let stored: unknown
  if (Array.isArray(radius)) {
    stored = radius.map(lengthStored)
    radius.forEach((value, index) => {
      const written = one(value, cornerClasses[index])
      if (!written) return
      css.push(`border-${cornerNames[index]}-radius: ${written.css}`)
      tailwind.push(written.tailwind)
    })
  } else {
    stored = lengthStored(radius)
    const written = one(radius)
    if (written) {
      css.push(`border-radius: ${written.css}`)
      tailwind.push(written.tailwind)
    }
  }
  if (cornerShape && cornerShape !== "round") {
    css.push(`corner-shape: ${cornerShape}`)
    tailwind.push(`[corner-shape:${cornerShape}]`)
    stored = { radius: stored, cornerShape: { keyword: cornerShape } }
  }
  return { stored, css, tailwind }
}

/** Layer blur (`filter`) or Background blur (`backdrop-filter`). */
export function blurWrites(which: "blur" | "backdropBlur", value: Length | undefined): Writes {
  const property = which === "blur" ? "filter" : "backdrop-filter"
  const prefix = which === "blur" ? "blur" : "backdrop-blur"
  if (value === undefined) return { stored: undefined, css: [], tailwind: [] }
  if (typeof value === "string") {
    // A token in the theme's blur namespace (`--blur-*`) is a utility of its own, a token made here included;
    // another custom property is written as a variable.
    const themed = value.startsWith("blur-")
    return {
      stored: { token: value },
      css: [`${property}: blur(var(--${value}))`],
      tailwind: [themed ? `${prefix}-${value.replace("blur-", "")}` : `${prefix}-(--${value})`]
    }
  }
  return {
    stored: lengthStored(value),
    css: [`${property}: blur(${value.px}px)`],
    tailwind: [`${prefix}-[${value.px}px]`]
  }
}

/** Where a stroke is drawn: in layout as a border, or as an outline inside, centered on or outside the edge (call 2). */
export type StrokePosition = "inside" | "center" | "outside"

const sideNames = ["top", "right", "bottom", "left"] as const
const sideClasses = ["t", "r", "b", "l"] as const

/** A stroke: its width per side, its color, and where it's drawn. */
export function strokeWrites(draft: Draft, inLayout: boolean, position: StrokePosition): Writes {
  if (draft.border === undefined && draft.borderWidth === undefined) return { stored: undefined, css: [], tailwind: [] }
  const color = colorWrites("border", draft.border, draft.borderAlpha, draft.borderAllowed)
  const widths = Array.isArray(draft.borderWidth) ? draft.borderWidth : undefined
  const width = typeof draft.borderWidth === "number" ? draft.borderWidth : undefined
  const widthClass = (px: number, side?: string) => {
    const prefix = side ? `border-${side}` : "border"
    return px === 1 ? prefix : `${prefix}-${px}`
  }
  const stored = {
    width: widths ? widths.map((px) => ({ step: px })) : { step: width ?? 1 },
    color: color.stored,
    ...(inLayout ? {} : { position: { keyword: position } })
  }
  if (!inLayout) {
    const px = width ?? 1
    const offset = { inside: -px, center: -px / 2, outside: 0 }[position]
    const colorValue = color.css[0]?.replace("border-color: ", "") ?? "currentColor"
    return {
      stored,
      css: [`outline: ${px}px solid ${colorValue}`, `outline-offset: ${offset}px`],
      tailwind: [
        px === 1 ? "outline" : `outline-${px}`,
        ...color.tailwind.map((name) => name.replace(/^border-/, "outline-")),
        offset < 0 ? `-outline-offset-${-offset}` : "outline-offset-0"
      ]
    }
  }
  const css: string[] = []
  const tailwind: string[] = []
  if (widths) {
    widths.forEach((px, index) => {
      if (px === 0) return
      css.push(`border-${sideNames[index]}-width: ${px}px`)
      tailwind.push(widthClass(px, sideClasses[index]))
    })
  } else {
    css.push(`border-width: ${width ?? 1}px`)
    tailwind.push(widthClass(width ?? 1))
  }
  return { stored, css: [...css, ...color.css], tailwind: [...tailwind, ...color.tailwind] }
}

/** A width or height: a length, a percentage, or a mode (Hug, Fill, Min content, Max content). */
function sizeWrites(axis: "w" | "h", size: Size | undefined, setBy?: string): Writes {
  const property = axis === "w" ? "width" : "height"
  if (setBy) return { stored: { mode: "auto", setBy }, css: [], tailwind: [] }
  if (size === undefined) return { stored: undefined, css: [], tailwind: [] }
  if (typeof size === "number") {
    return {
      stored: lengthForm(size),
      css: [`${property}: ${lengthCss(size)}`],
      tailwind: [`${axis}-${lengthClass(size)}`]
    }
  }
  if (typeof size === "object") {
    const share = fraction(size.percent)
    return {
      stored: { value: `${size.percent}%` },
      css: [`${property}: ${size.percent}%`],
      tailwind: [share ? `${axis}-${share}` : `${axis}-[${size.percent}%]`]
    }
  }
  const modes = {
    hug: { css: "fit-content", tailwind: "fit" },
    fill: { css: "100%", tailwind: "full" },
    min: { css: "min-content", tailwind: "min" },
    max: { css: "max-content", tailwind: "max" }
  } as const
  return {
    stored: { mode: size },
    css: [`${property}: ${modes[size].css}`],
    tailwind: [`${axis}-${modes[size].tailwind}`]
  }
}

/** Width and height, their limits and the aspect ratio, outside a layout (Fill is `100%`, Hug `fit-content`). */
export function sizeRowWrites(draft: Draft): Writes {
  const width = sizeWrites("w", draft.width ?? 520)
  const height = sizeWrites("h", draft.height, draft.aspect ? "Aspect ratio" : undefined)
  const css = [...width.css, ...height.css]
  const tailwind = [...width.tailwind, ...height.tailwind]
  const limits = [
    ["minWidth", "min-width", "min-w"],
    ["maxWidth", "max-width", "max-w"],
    ["minHeight", "min-height", "min-h"],
    ["maxHeight", "max-height", "max-h"]
  ] as const
  const stored: Record<string, unknown> = { width: width.stored, height: height.stored }
  for (const [key, property, prefix] of limits) {
    const px = draft[key]
    if (px === undefined) continue
    stored[key] = lengthForm(px)
    css.push(`${property}: ${lengthCss(px)}`)
    tailwind.push(`${prefix}-${lengthClass(px)}`)
  }
  if (draft.aspect) {
    const named = { "1 / 1": "square", "16 / 9": "video" }[draft.aspect]
    stored.aspect = { value: draft.aspect }
    css.push(`aspect-ratio: ${draft.aspect}`)
    tailwind.push(`aspect-${named ?? draft.aspect.replace(/\s*\/\s*/, "/")}`)
  }
  return { stored, css, tailwind }
}

/** Grid tracks in Tailwind's arbitrary value: `200px_minmax(0,1fr)`. */
const tracksClass = (tracks: Track[]) => arbitrary(tracks.map(trackCss).join(" "))

/** The layout: flex or grid, its direction, wrapping, alignment and tracks. */
export function layoutWrites(draft: Draft): Writes {
  const css: string[] = []
  const tailwind: string[] = []
  const stored: Record<string, unknown> = {}
  if (draft.columns !== undefined) {
    css.push("display: grid")
    tailwind.push("grid")
    stored.display = { keyword: "grid" }
    if (Array.isArray(draft.columns)) {
      const equal = draft.columns.every((track) => track.kind === "fr" && track.value === 1)
      stored.columns = draft.columns
      css.push(`grid-template-columns: ${draft.columns.map(trackCss).join(" ")}`)
      tailwind.push(equal ? `grid-cols-${draft.columns.length}` : `grid-cols-[${tracksClass(draft.columns)}]`)
    } else {
      stored.columns = { repeat: "auto-fit", min: lengthForm(draft.columns.fit) }
      css.push(`grid-template-columns: repeat(auto-fit, minmax(${draft.columns.fit}px, 1fr))`)
      tailwind.push(`grid-cols-[${arbitrary(`repeat(auto-fit, minmax(${draft.columns.fit}px, 1fr))`)}]`)
    }
    if (draft.rows?.length) {
      stored.rows = draft.rows
      css.push(`grid-template-rows: ${draft.rows.map(trackCss).join(" ")}`)
      tailwind.push(`grid-rows-[${tracksClass(draft.rows)}]`)
    }
    return { stored, css, tailwind }
  }
  const direction = draft.direction ?? "column"
  const reversed = draft.reverse ? "-reverse" : ""
  stored.direction = { keyword: `${direction}${reversed}` }
  css.push("display: flex", `flex-direction: ${direction}${reversed}`)
  tailwind.push("flex", direction === "row" ? `flex-row${reversed}` : `flex-col${reversed}`)
  if (draft.wrap) {
    stored.wrap = { keyword: "wrap" }
    css.push("flex-wrap: wrap")
    tailwind.push("flex-wrap")
  }
  // The box is physical, so a reversed layout writes the other end.
  const justify = draft.justify ?? "start"
  const written = draft.reverse ? ({ start: "end", center: "center", end: "start" } as const)[justify] : justify
  if (written !== "start") {
    stored.justify = { keyword: written }
    css.push(`justify-content: ${written === "center" ? "center" : "flex-end"}`)
    tailwind.push(`justify-${written}`)
  }
  const align = draft.align
  if (align !== undefined && align !== "stretch") {
    stored.align = { keyword: align }
    const value = { start: "flex-start", center: "center", end: "flex-end", baseline: "baseline" }[align as string]
    css.push(`align-items: ${value ?? align}`)
    tailwind.push(
      { start: "items-start", center: "items-center", end: "items-end", baseline: "items-baseline" }[align as string] ??
        "items-baseline-last"
    )
  }
  return { stored, css, tailwind }
}

/** A grid child's place: span and start lines, or start and end lines, and where it sits in its cell. */
export function placementWrites(draft: Draft): Writes {
  const css: string[] = []
  const tailwind: string[] = []
  const stored: Record<string, unknown> = {}
  const axis = (name: "col" | "row", start?: number, span?: number | "all", end?: number) => {
    const property = name === "col" ? "grid-column" : "grid-row"
    if (span === "all") {
      stored[name] = { span: { keyword: "all" } }
      css.push(`${property}: 1 / -1`)
      tailwind.push(`${name}-span-full`)
      return
    }
    if (start === undefined && span === undefined && end === undefined) return
    stored[name] = { start, ...(end === undefined ? { span } : { end }) }
    css.push(`${property}: ${start ?? "auto"} / ${end ?? `span ${span ?? 1}`}`)
    if (end === undefined && span !== undefined) tailwind.push(`${name}-span-${span}`)
    if (start !== undefined) tailwind.push(start < 0 ? `-${name}-start-${-start}` : `${name}-start-${start}`)
    if (end !== undefined) tailwind.push(end < 0 ? `-${name}-end-${-end}` : `${name}-end-${end}`)
  }
  // Its own size, which unset fills its cell.
  for (const [key, size] of [
    ["width", sizeWrites("w", draft.childWidth)],
    ["height", sizeWrites("h", draft.childHeight)]
  ] as const) {
    if (size.stored === undefined) continue
    stored[key] = size.stored
    css.push(...size.css)
    tailwind.push(...size.tailwind)
  }
  axis("col", draft.colStart, draft.colSpan, draft.endLines ? draft.colEnd : undefined)
  axis("row", draft.rowStart, draft.rowSpan, draft.endLines ? draft.rowEnd : undefined)
  if (draft.alignSelf) {
    stored.alignSelf = { keyword: draft.alignSelf }
    css.push(`align-self: ${draft.alignSelf}`)
    tailwind.push(`self-${draft.alignSelf}`)
  }
  if (draft.justifySelf) {
    stored.justifySelf = { keyword: draft.justifySelf }
    css.push(`justify-self: ${draft.justifySelf}`)
    tailwind.push(`justify-self-${draft.justifySelf}`)
  }
  return { stored: Object.keys(stored).length > 0 ? stored : undefined, css, tailwind }
}

/** A text layer's tag: the element it's written as, which is markup, not style. */
export function tagWrites(tag: string | undefined): Writes {
  const element = tag ?? "p"
  return {
    stored: tag === undefined ? undefined : { keyword: tag },
    css: [],
    tailwind: [],
    markup: `<${element}>Simple pricing for every team</${element}>`
  }
}

/**
 * What a control writes when it's set in a state, Hover say: stored under the state, and written with its prefix in
 * Tailwind (call 7), which another framework would write its own way.
 */
export function inState(writes: Writes, state: "hover"): Writes {
  return {
    stored: { [state]: writes.stored },
    css: writes.css.map((line) => `&:${state} { ${line} }`),
    tailwind: writes.tailwind.map((name) => `${state}:${name}`)
  }
}

/** Layers whose values differ: each keeps its own, and nothing is written until one is set for them all. */
export const mixedWrites: Writes = { stored: "Mixed: each layer keeps its own", css: [], tailwind: [] }

/** Several properties' writes as one, each stored under its own key (call 4); unset when none is set. */
export function mergeWrites(parts: Record<string, Writes>): Writes {
  const set = Object.entries(parts).filter(([, part]) => part.stored !== undefined)
  return {
    stored: set.length > 0 ? Object.fromEntries(set.map(([key, part]) => [key, part.stored])) : undefined,
    css: set.flatMap(([, part]) => part.css),
    tailwind: set.flatMap(([, part]) => part.tailwind)
  }
}
