import {
  type Color,
  type Filter,
  type Length as StoredLength,
  namedCss,
  type NodeStyle,
  type Shadow,
  type TransformStyle
} from "@parity-app/core"
import type { StyleValues } from "@parity-app/editor"
import { listColor, storedColors } from "../color-values.ts"
import type { Length } from "../controls/data.ts"
import type { FilterEntry, ListColor, ShadowEntry, ShadowLayer } from "../controls/lists-data.ts"
import type { Move as ControlMove, TransformValue } from "../controls/motion-data.ts"

/*
 * Effects' values between the document (`NodeStyle`'s `boxShadow`, `filter`, `backdropFilter` and its transform keys)
 * and the approved controls' models (lists-data.ts, motion-data.ts). The Shadow list holds the box's shadows and the
 * drop shadows that follow the shape, which are the layer's `filter: drop-shadow()`; the Filter list holds the blurs
 * and adjustments on the layer and behind it. The controls call an entry's type its kind and hold a color as text.
 */

/** What a shadow of the list starts from when it's a token's: the panel's default numbers, used once it's detached. */
const tokenLayer: ShadowLayer = { x: 0, y: 4, blur: 12, spread: -2, color: "black", alpha: 10 }

/** Reads a color a list holds back into the document (`storedColors`). */
type StoredColor = (color: ListColor) => Color

const withOff = <T extends object>(value: T, off: boolean | undefined): T => (off ? { ...value, off: true } : value)

function shadowEntry(shadow: Shadow, id: string, follow = false): ShadowEntry {
  let entry: ShadowEntry

  if ("token" in shadow) {
    entry = { id, kind: shadow.type, token: shadow.token, layer: tokenLayer }

    if (shadow.color) {
      entry.colorOverride = listColor(shadow.color)
    }
  } else if (shadow.type === "ring") {
    entry = {
      id,
      kind: "ring",
      width: shadow.width,
      layer: { x: 0, y: 0, blur: 0, spread: 0, ...listColor(shadow.color) }
    }

    if (shadow.inset) {
      entry.inset = true
    }
  } else {
    const { x, y, blur, spread } = shadow
    entry = { id, kind: shadow.type, layer: { x, y, blur, spread, ...listColor(shadow.color) } }
  }

  if (follow) {
    entry.follow = true
  }

  return withOff(entry, shadow.off)
}

function documentShadow(entry: ShadowEntry, stored: StoredColor): Shadow {
  if (entry.kind === "ring") {
    const ring: Shadow = { type: "ring", width: entry.width ?? 1, color: stored(entry.layer) }

    return withOff(entry.inset ? { ...ring, inset: true } : ring, entry.off)
  }

  if (entry.token !== undefined) {
    const token: Shadow = { type: entry.kind, token: entry.token }

    return withOff(entry.colorOverride ? { ...token, color: stored(entry.colorOverride) } : token, entry.off)
  }

  const { x, y, blur, spread } = entry.layer

  return withOff({ type: entry.kind, x, y, blur, spread, color: stored(entry.layer) }, entry.off)
}

/** The Shadow list's entries: the box's shadows, then the layer's drop shadows that follow its shape. */
export function shadowEntriesOf(style: Pick<NodeStyle, "boxShadow" | "filter">): ShadowEntry[] {
  const follow = (style.filter ?? []).flatMap((entry, index) =>
    entry.type === "dropShadow" ? [withOff(shadowEntry(entry.shadow, `follow-${index}`, true), entry.off)] : []
  )

  return [...(style.boxShadow ?? []).map((shadow, index) => shadowEntry(shadow, `shadow-${index}`)), ...follow]
}

const follows = (entry: ShadowEntry) => entry.kind === "drop" && entry.follow === true

/** A drop shadow that follows the shape, as the layer's filter holds it. */
function dropShadowFilter(entry: ShadowEntry, stored: StoredColor): Filter {
  const { off, ...shadow } = documentShadow(entry, stored)
  const filter: Filter = { type: "dropShadow", shadow }

  return withOff(filter, off)
}

/** Every color a layer's shadows hold: its box shadows', and its drop shadows' that follow the shape. */
function shadowColors(style: Pick<NodeStyle, "boxShadow" | "filter">): Color[] {
  const shadows = [
    ...(style.boxShadow ?? []),
    ...(style.filter ?? []).flatMap((entry) => (entry.type === "dropShadow" ? [entry.shadow] : []))
  ]

  return shadows.flatMap((shadow) => (shadow.color ? [shadow.color] : []))
}

/**
 * What the Shadow list's entries write: the box's shadows, and the layer's filters with its drop shadows in place of
 * the ones it had, after its blurs and adjustments. A list with no box shadows unsets `boxShadow`. A color the layer
 * already held comes back in the form it was stored.
 */
export function shadowStyleOf(
  entries: readonly ShadowEntry[],
  style: Pick<NodeStyle, "boxShadow" | "filter">
): Pick<StyleValues, "boxShadow" | "filter"> {
  const stored = storedColors(shadowColors(style))
  const box = entries.flatMap((entry) => (follows(entry) ? [] : [documentShadow(entry, stored)]))
  const follow = entries.flatMap((entry) => (follows(entry) ? [dropShadowFilter(entry, stored)] : []))
  const filter = [...(style.filter ?? []).filter((entry) => entry.type !== "dropShadow"), ...follow]

  return { boxShadow: box.length > 0 ? box : undefined, filter: filter.length > 0 ? filter : undefined }
}

type Blur = Extract<Filter, { type: "blur" }>

const blurPixels = /^(\d+(?:\.\d+)?)px$/

/** A blur's value as the list's field holds one: a token's name or pixels. Nothing for a value the field can't hold. */
function blurLength(value: Blur["value"]): Length | undefined {
  if ("token" in value) {
    return value.token
  }

  const px = "value" in value ? blurPixels.exec(value.value)?.[1] : undefined

  return px === undefined ? undefined : { px: Number(px) }
}

/** A blur as CSS, which is what the list shows of one whose value its field can't hold. */
const blurText = (value: Blur["value"]) => `blur(${namedCss(value)})`

function filterEntry(entry: Filter, id: string, behind: boolean): FilterEntry | undefined {
  let shown: FilterEntry

  switch (entry.type) {
    case "blur": {
      const value = blurLength(entry.value)

      if (value === undefined) {
        shown = { id, kind: "custom", text: blurText(entry.value) }

        if (behind) {
          shown.behind = true
        }
      } else {
        shown = behind ? { id, kind: "backdropBlur", value } : { id, kind: "blur", value }
      }

      break
    }

    case "adjust":
      shown = { id, kind: "adjust", values: entry.values }

      if (behind) {
        shown.behind = true
      }

      break
    case "dropShadow":
      return undefined
  }

  return withOff(shown, entry.off)
}

/** The Filter list's entries: the layer's blurs and adjustments, then those behind it. Drop shadows are the Shadow list's. */
export function filterEntriesOf(style: Pick<NodeStyle, "filter" | "backdropFilter">): FilterEntry[] {
  return [
    ...(style.filter ?? []).flatMap((entry, index) => filterEntry(entry, `filter-${index}`, false) ?? []),
    ...(style.backdropFilter ?? []).flatMap((entry, index) => filterEntry(entry, `behind-${index}`, true) ?? [])
  ]
}

/**
 * A blur's value as the document holds it: the token the field names, or, for pixels or text the list was given and
 * didn't change, the value the layer already held (`known`). Pixels chosen in the list write nothing, since Effects
 * takes tokens only.
 */
function blurValue(
  entry: Extract<FilterEntry, { kind: "blur" | "backdropBlur" | "custom" }>,
  known: readonly Blur[]
): Blur["value"] | undefined {
  if (entry.kind === "custom") {
    return known.find((blur) => blurText(blur.value) === entry.text)?.value
  }

  const { value } = entry

  if (value === undefined) {
    return undefined
  }

  if (!(value instanceof Object)) {
    return { token: value }
  }

  return known.find((blur) => {
    const held = blurLength(blur.value)

    return held instanceof Object && held.px === value.px
  })?.value
}

function documentFilter(entry: FilterEntry, known: readonly Blur[], stored: StoredColor): Filter | undefined {
  let filter: Filter

  switch (entry.kind) {
    case "blur":
    case "backdropBlur":
    case "custom": {
      const value = blurValue(entry, known)

      if (value === undefined) {
        return undefined
      }

      filter = { type: "blur", value }
      break
    }

    case "adjust":
      filter = { type: "adjust", values: entry.values }
      break
    case "dropShadow":
      filter = dropShadowFilter(entry.shadow, stored)
      break
  }

  return withOff(filter, entry.off)
}

const blursOf = (filters: readonly Filter[] | undefined): Blur[] =>
  (filters ?? []).flatMap((entry) => (entry.type === "blur" ? [entry] : []))

/**
 * What the Filter list's entries write: the layer's filters, keeping its drop shadows after them, and the filters
 * behind it. A blur with no token yet writes nothing until one is chosen.
 */
export function filterStyleOf(
  entries: readonly FilterEntry[],
  style: Pick<NodeStyle, "filter" | "backdropFilter">
): Pick<StyleValues, "filter" | "backdropFilter"> {
  const behind = (entry: FilterEntry) =>
    entry.kind === "backdropBlur" || ((entry.kind === "adjust" || entry.kind === "custom") && entry.behind === true)

  const stored = storedColors(shadowColors(style))

  const layer = entries
    .filter((entry) => !behind(entry))
    .flatMap((entry) => documentFilter(entry, blursOf(style.filter), stored) ?? [])

  const back = entries
    .filter(behind)
    .flatMap((entry) => documentFilter(entry, blursOf(style.backdropFilter), stored) ?? [])

  const filter = [...layer, ...(style.filter ?? []).filter((entry) => entry.type === "dropShadow")]

  return { filter: filter.length > 0 ? filter : undefined, backdropFilter: back.length > 0 ? back : undefined }
}

const movePercent = /^(-?\d+(?:\.\d+)?)%$/

const movePixels = /^(-?\d+(?:\.\d+)?)px$/

/**
 * A move as the Transform control holds it, in px or percent: a step is `unit` px, a token what `tokenPx` says it
 * comes to (0 when it can't say). Nothing for a length the control can't hold, such as `auto` or `clamp(…)`.
 */
function controlMove(
  move: StoredLength | undefined,
  unit: number,
  tokenPx: (name: string) => number | undefined
): ControlMove | undefined {
  if (move === undefined) {
    return undefined
  }

  if ("step" in move) {
    return { px: move.step * unit }
  }

  if ("token" in move) {
    return { px: tokenPx(move.token) ?? 0 }
  }

  if (!("value" in move)) {
    return undefined
  }

  const percent = movePercent.exec(move.value)?.[1]

  if (percent !== undefined) {
    return { percent: Number(percent) }
  }

  const px = movePixels.exec(move.value)?.[1]

  return px === undefined ? undefined : { px: Number(px) }
}

function documentMove(move: ControlMove | undefined, unit: number): StoredLength | undefined {
  if (move === undefined) {
    return undefined
  }

  return "percent" in move ? { value: `${move.percent}%` } : { step: move.px / unit }
}

/** The Transform control's value: scale as a size and a flip, and moves in px or percent. */
export function transformValueOf(
  style: TransformStyle,
  unit: number,
  tokenPx: (name: string) => number | undefined = () => undefined
): TransformValue {
  const value: TransformValue = {}
  const moveX = controlMove(style.translate?.x, unit, tokenPx)
  const moveY = controlMove(style.translate?.y, unit, tokenPx)

  if (moveX) {
    value.moveX = moveX
  }

  if (moveY) {
    value.moveY = moveY
  }

  const { x, y } = style.scale ?? {}

  if (x !== undefined) {
    value.scaleX = Math.abs(x)

    if (x < 0) {
      value.flipX = true
    }
  }

  if (y !== undefined) {
    value.scaleY = Math.abs(y)

    if (y < 0) {
      value.flipY = true
    }
  }

  if (x !== undefined || y !== undefined) {
    value.scaleLinked = Math.abs(x ?? 100) === Math.abs(y ?? 100)
  }

  if (style.transformOrigin) {
    value.origin = style.transformOrigin
  }

  return value
}

const sameMove = (one: ControlMove | undefined, other: ControlMove | undefined) =>
  JSON.stringify(one) === JSON.stringify(other)

/**
 * What the Transform control's value writes: the layer's `translate`, `scale` and `transformOrigin`, each unset when
 * nothing is left of it. Rotation and skew, which the control doesn't show, are left as they are. A move the control
 * still shows as it read it from `under` stays as stored, so a token or a written length isn't turned into steps by
 * an edit beside it. A flip with no scale is -100%.
 */
export function transformOf(
  value: TransformValue,
  under: TransformStyle,
  unit: number,
  tokenPx: (name: string) => number | undefined = () => undefined
): Pick<StyleValues, "translate" | "scale" | "transformOrigin"> {
  const move = (next: ControlMove | undefined, held: StoredLength | undefined) =>
    sameMove(next, controlMove(held, unit, tokenPx)) ? held : documentMove(next, unit)

  const size = (scale: number | undefined, flip: boolean | undefined) =>
    scale !== undefined || flip === true ? (scale ?? 100) * (flip === true ? -1 : 1) : undefined

  return {
    translate: axes(move(value.moveX, under.translate?.x), move(value.moveY, under.translate?.y)),
    scale: axes(size(value.scaleX, value.flipX), size(value.scaleY, value.flipY)),
    transformOrigin: value.origin
  }
}

/** A value on each axis it's set on. */
interface Axes<T> {
  x?: T
  y?: T
}

/** The axes that are set, or nothing when neither is. */
function axes<T>(x: T | undefined, y: T | undefined): Axes<T> | undefined {
  if (x === undefined && y === undefined) {
    return undefined
  }

  const set: Axes<T> = {}

  if (x !== undefined) {
    set.x = x
  }

  if (y !== undefined) {
    set.y = y
  }

  return set
}
