import {
  type EffectColor,
  type Filter,
  isNamedLength,
  type Move,
  type NodeStyle,
  type Shadow,
  type Transform
} from "@parity-app/core"
import type { Length } from "../controls/data.ts"
import type { FilterEntry, ListColor, ShadowEntry, ShadowLayer } from "../controls/lists-data.ts"
import type { Move as ControlMove, TransformValue } from "../controls/motion-data.ts"

/*
 * Effects' values between the document (`NodeStyle`'s `shadow`, `filter`, `backdropFilter` and `transform`) and the
 * approved controls' models (lists-data.ts, motion-data.ts). The Shadow list holds the box's shadows and the drop
 * shadows that follow the shape, which are the layer's `filter: drop-shadow()`; the Filter list holds the blurs and
 * adjustments on the layer and behind it.
 */

/** What a shadow of the list starts from when it's a token's: the panel's default numbers, used once it's detached. */
const tokenLayer: ShadowLayer = { x: 0, y: 4, blur: 12, spread: -2, color: "black", alpha: 10 }

const listColor = ({ color, alpha }: EffectColor): ListColor => (alpha === undefined ? { color } : { color, alpha })

const effectColor = ({ color, alpha }: ListColor): EffectColor => (alpha === undefined ? { color } : { color, alpha })

const withOff = <T extends object>(value: T, off: boolean | undefined): T => (off ? { ...value, off: true } : value)

function shadowEntry(shadow: Shadow, id: string, follow = false): ShadowEntry {
  let entry: ShadowEntry

  if ("token" in shadow) {
    entry = { id, kind: shadow.kind, token: shadow.token, layer: tokenLayer }

    if (shadow.color) {
      entry.colorOverride = listColor(shadow.color)
    }
  } else if (shadow.kind === "ring") {
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
    entry = { id, kind: shadow.kind, layer: { x, y, blur, spread, ...listColor(shadow.color) } }
  }

  if (follow) {
    entry.follow = true
  }

  return withOff(entry, shadow.off)
}

function documentShadow(entry: ShadowEntry): Shadow {
  if (entry.kind === "ring") {
    const ring: Shadow = { kind: "ring", width: entry.width ?? 1, color: effectColor(entry.layer) }

    return withOff(entry.inset ? { ...ring, inset: true } : ring, entry.off)
  }

  if (entry.token !== undefined) {
    const token: Shadow = { kind: entry.kind, token: entry.token }

    return withOff(entry.colorOverride ? { ...token, color: effectColor(entry.colorOverride) } : token, entry.off)
  }

  const { x, y, blur, spread } = entry.layer

  return withOff({ kind: entry.kind, x, y, blur, spread, color: effectColor(entry.layer) }, entry.off)
}

/** The box's shadows: one token's, or the stack's. */
function boxShadows(shadow: NodeStyle["shadow"]): Shadow[] {
  if (shadow === undefined || shadow === "") {
    return []
  }

  return Array.isArray(shadow) ? shadow : [{ kind: "drop", token: shadow }]
}

/** The Shadow list's entries: the box's shadows, then the layer's drop shadows that follow its shape. */
export function shadowEntriesOf(style: Pick<NodeStyle, "shadow" | "filter">): ShadowEntry[] {
  const follow = (style.filter ?? []).flatMap((entry, index) =>
    entry.kind === "dropShadow" ? [withOff(shadowEntry(entry.shadow, `follow-${index}`, true), entry.off)] : []
  )

  return [...boxShadows(style.shadow).map((shadow, index) => shadowEntry(shadow, `shadow-${index}`)), ...follow]
}

const follows = (entry: ShadowEntry) => entry.kind === "drop" && entry.follow === true

/** A drop shadow that follows the shape, as the layer's filter holds it. */
function dropShadowFilter(entry: ShadowEntry): Filter {
  const { off, ...shadow } = documentShadow(entry)
  const filter: Filter = { kind: "dropShadow", shadow }

  return withOff(filter, off)
}

/**
 * What the Shadow list's entries write: the box's shadows, and the layer's filters with its drop shadows in place of
 * the ones it had, after its blurs and adjustments. A list with no box shadows unsets `shadow`.
 */
export function shadowStyleOf(
  entries: readonly ShadowEntry[],
  style: Pick<NodeStyle, "filter">
): Pick<NodeStyle, "shadow" | "filter"> {
  const box = entries.flatMap((entry) => (follows(entry) ? [] : [documentShadow(entry)]))
  const follow = entries.flatMap((entry) => (follows(entry) ? [dropShadowFilter(entry)] : []))
  const filter = [...(style.filter ?? []).filter((entry) => entry.kind !== "dropShadow"), ...follow]

  return { shadow: box.length > 0 ? box : undefined, filter: filter.length > 0 ? filter : undefined }
}

function filterEntry(entry: Filter, id: string, behind: boolean): FilterEntry | undefined {
  let shown: FilterEntry

  switch (entry.kind) {
    case "blur":
      shown = behind ? { id, kind: "backdropBlur", value: entry.value } : { id, kind: "blur", value: entry.value }
      break
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

/** A blur's token, or nothing for a length the document can't hold (a blur of its own, in px). */
const blurToken = (value: Length | undefined): string | undefined =>
  value === undefined || value instanceof Object ? undefined : value

function documentFilter(entry: FilterEntry): Filter | undefined {
  let filter: Filter

  switch (entry.kind) {
    case "blur":
    case "backdropBlur": {
      const value = blurToken(entry.value)

      if (value === undefined) {
        return undefined
      }

      filter = { kind: "blur", value }
      break
    }

    case "adjust":
      filter = { kind: "adjust", values: entry.values }
      break
    case "dropShadow":
      filter = dropShadowFilter(entry.shadow)
      break
    case "custom":
      return undefined
  }

  return withOff(filter, entry.off)
}

/**
 * What the Filter list's entries write: the layer's filters, keeping its drop shadows after them, and the filters
 * behind it. A blur with no token yet writes nothing until one is chosen.
 */
export function filterStyleOf(
  entries: readonly FilterEntry[],
  style: Pick<NodeStyle, "filter">
): Pick<NodeStyle, "filter" | "backdropFilter"> {
  const behind = (entry: FilterEntry) =>
    entry.kind === "backdropBlur" || ((entry.kind === "adjust" || entry.kind === "custom") && entry.behind === true)

  const layer = entries.filter((entry) => !behind(entry)).flatMap((entry) => documentFilter(entry) ?? [])
  const back = entries.filter(behind).flatMap((entry) => documentFilter(entry) ?? [])
  const filter = [...layer, ...(style.filter ?? []).filter((entry) => entry.kind === "dropShadow")]

  return { filter: filter.length > 0 ? filter : undefined, backdropFilter: back.length > 0 ? back : undefined }
}

/**
 * A move as the Transform control holds it, in px: a step is `unit` px, a token what `tokenPx` says it comes to (0 when
 * it can't say).
 */
function controlMove(
  move: Move | undefined,
  unit: number,
  tokenPx: (name: string) => number | undefined
): ControlMove | undefined {
  if (move === undefined) {
    return undefined
  }

  if (move instanceof Object) {
    return { percent: move.percent }
  }

  return { px: isNamedLength(move) ? (tokenPx(move) ?? 0) : move * unit }
}

function documentMove(move: ControlMove | undefined, unit: number): Move | undefined {
  if (move === undefined) {
    return undefined
  }

  return "percent" in move ? { percent: move.percent } : move.px / unit
}

/** The Transform control's value: scale as a size and a flip, and moves in px. */
export function transformValueOf(
  transform: Transform | undefined,
  unit: number,
  tokenPx: (name: string) => number | undefined = () => undefined
): TransformValue {
  if (!transform) {
    return {}
  }

  const value: TransformValue = {}
  const moveX = controlMove(transform.x, unit, tokenPx)
  const moveY = controlMove(transform.y, unit, tokenPx)

  if (moveX) {
    value.moveX = moveX
  }

  if (moveY) {
    value.moveY = moveY
  }

  for (const axis of ["X", "Y"] as const) {
    const scale = transform[`scale${axis}`]

    if (scale !== undefined) {
      value[`scale${axis}`] = Math.abs(scale)

      if (scale < 0) {
        value[`flip${axis}`] = true
      }
    }
  }

  if (transform.scaleX !== undefined || transform.scaleY !== undefined) {
    value.scaleLinked = Math.abs(transform.scaleX ?? 100) === Math.abs(transform.scaleY ?? 100)
  }

  if (transform.origin) {
    value.origin = transform.origin
  }

  return value
}

/**
 * What the Transform control's value writes, over the transform's rotation and skew, which it doesn't show. A flip
 * with no scale is -100%. Nothing set unsets the transform.
 */
export function transformOf(value: TransformValue, under: Transform | undefined, unit: number): Transform | undefined {
  const transform: Transform = {}

  if (under?.rotate !== undefined) {
    transform.rotate = under.rotate
  }

  if (under?.skewX !== undefined) {
    transform.skewX = under.skewX
  }

  if (under?.skewY !== undefined) {
    transform.skewY = under.skewY
  }

  const x = documentMove(value.moveX, unit)
  const y = documentMove(value.moveY, unit)

  if (x !== undefined) {
    transform.x = x
  }

  if (y !== undefined) {
    transform.y = y
  }

  for (const axis of ["X", "Y"] as const) {
    const scale = value[`scale${axis}`]
    const flip = value[`flip${axis}`] === true

    if (scale !== undefined || flip) {
      transform[`scale${axis}`] = (scale ?? 100) * (flip ? -1 : 1)
    }
  }

  if (value.origin) {
    transform.origin = value.origin
  }

  return Object.keys(transform).length > 0 ? transform : undefined
}
