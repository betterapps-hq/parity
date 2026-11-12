import {
  applyFieldInput,
  type FieldLength,
  fieldLength,
  type FieldRules,
  isNamedLength,
  type Length,
  lengthToken,
  type NodeStyle,
  readFieldInput
} from "@parity-app/core"
import type { Rect } from "./drop-slot.ts"
import type { HandleBox } from "./handles.ts"
import { dragThreshold } from "./move-resize.ts"
import { sidesOf, tidySides } from "./style-editing.ts"

/**
 * Padding and gap handles on a selected layout, as in Figma: a short bar in the middle of each side's padding and of
 * each gap between its children, dragged by steps of the spacing scale, or clicked to type a value. A drag can change
 * the opposite side with the one dragged, or every side, as the keys held say (the app's keymap names them). A side bound to a length token stays bound while the
 * drag lands on a token's value, so a drag that stays on the scale keeps the token.
 */

export type PaddingSide = "top" | "right" | "bottom" | "left"

/** The sides in the order padding lists them. */
export const paddingSides: readonly PaddingSide[] = ["top", "right", "bottom", "left"]

const opposite: Record<PaddingSide, PaddingSide> = { top: "bottom", right: "left", bottom: "top", left: "right" }

/** A selected layout as it's drawn, in screen pixels. */
export interface SpacingLayout {
  /** Its border box. */
  rect: Rect
  border: Record<PaddingSide, number>
  padding: Record<PaddingSide, number>
  /** Its children that are drawn, in order. */
  children: readonly Rect[]
  /** The way its children run. */
  direction: "row" | "column"
  /** Whether its children sit in one line, so a gap is a single space between each two. A grid or a wrap isn't. */
  oneLine: boolean
  /**
   * What no press target may cover, so a click there still selects it: every child drawn, those placed absolutely
   * too. Its children when not given.
   */
  covered?: readonly Rect[]
}

/** A handle on one side's padding or on one gap. */
export type SpacingHandle = (
  | { kind: "padding"; side: PaddingSide }
  | {
      kind: "gap"
      /** The gap after this child. */
      index: number
      direction: "row" | "column"
    }
) & {
  /** The space it changes, shaded while the handle is hovered or dragged. */
  area: HandleBox
  /** The bar drawn in the middle of it. */
  bar: HandleBox
  /**
   * Where a press takes it: the bar and a margin around it, clear of the resize strips on the layout's edges and of
   * the children.
   */
  hit: HandleBox
}

/** A bar's length and thickness, and the least its press target takes across and along it, in screen pixels. */
export const spacingBar = { length: 16, thickness: 2, hitAcross: 8, hitAlong: 24 }

/** Space left along a layout's edges for its resize strips, which straddle them. */
const resizeStrip = 4

/** Under this many screen pixels along a side or a gap, there's no room for its handle. */
const tooShort = spacingBar.hitAlong

/** Under this many screen pixels of free space across a side's padding or a gap, there's no room for its handle. */
const tooThin = 4

const box = (left: number, top: number, right: number, bottom: number): HandleBox => ({
  x: left,
  y: top,
  w: Math.max(0, right - left),
  h: Math.max(0, bottom - top)
})

/**
 * Where each padding and gap handle goes on a selected layout. Each padding side has one, even at 0, so padding can be
 * dragged out of nothing; a gap has one between each two children in a single line. A side or gap too short for its
 * press target has none. A press target never covers a child, so a click on one still selects it: it's cut back to
 * the free space, and where less than 4 pixels are free across it, as where a child sits against an edge with no
 * padding, there's no handle.
 */
export function spacingHandles(layout: SpacingLayout): SpacingHandle[] {
  const { rect, border, padding } = layout

  // Inside the border.
  const outer = {
    left: rect.left + border.left,
    top: rect.top + border.top,
    right: rect.right - border.right,
    bottom: rect.bottom - border.bottom
  }

  // Inside the padding.
  const inner = {
    left: outer.left + padding.left,
    top: outer.top + padding.top,
    right: outer.right - padding.right,
    bottom: outer.bottom - padding.bottom
  }

  const handles: SpacingHandle[] = []
  const { length, thickness, hitAcross, hitAlong } = spacingBar
  const covered = layout.covered ?? layout.children

  for (const side of paddingSides) {
    const vertical = side === "left" || side === "right"

    // The padding's own area runs the whole edge, corners included, as Figma shades a side and DevTools draws it.
    const area = {
      top: () => box(outer.left, outer.top, outer.right, inner.top),
      bottom: () => box(outer.left, inner.bottom, outer.right, outer.bottom),
      left: () => box(outer.left, outer.top, inner.left, outer.bottom),
      right: () => box(inner.right, outer.top, outer.right, outer.bottom)
    }[side]()

    // Its bar and press target go between the paddings across it, in the middle.
    const [start, end] = vertical ? [inner.top, inner.bottom] : [inner.left, inner.right]
    const along = Math.max(0, end - start)

    if (along < tooShort) {
      continue
    }

    // Across the side, from the layout's edge inwards: past the resize strip, at least `hitAcross` deep.
    const edge = { top: outer.top, bottom: outer.bottom, left: outer.left, right: outer.right }[side]
    const inward = side === "top" || side === "left" ? 1 : -1
    const depth = padding[side]
    const from = edge + inward * resizeStrip
    const centre = (start + end) / 2
    const hitHalf = Math.min(hitAlong, along) / 2
    // Inwards no further than the first child in its way.
    let reach = Math.max(depth, resizeStrip + hitAcross)

    for (const child of covered) {
      const [start, end] = vertical ? [child.top, child.bottom] : [child.left, child.right]

      if (end <= centre - hitHalf || start >= centre + hitHalf) {
        continue
      }

      const sides = { top: child.top, bottom: child.bottom, left: child.left, right: child.right }

      // A child wholly in the resize strip, or outside the layout, is in no way; one reaching the edge leaves nothing.
      if ((sides[opposite[side]] - edge) * inward <= resizeStrip) {
        continue
      }

      reach = Math.min(reach, Math.max(0, (sides[side] - edge) * inward))
    }

    if (reach - resizeStrip < tooThin) {
      continue
    }

    const to = edge + inward * reach
    const middle = depth >= hitAcross && reach >= depth ? edge + (inward * depth) / 2 : (from + to) / 2
    const [near, far] = [Math.min(from, to), Math.max(from, to)]

    if (vertical) {
      handles.push({
        kind: "padding",
        side,
        area,
        bar: box(middle - thickness / 2, centre - length / 2, middle + thickness / 2, centre + length / 2),
        hit: box(near, centre - hitHalf, far, centre + hitHalf)
      })
    } else {
      handles.push({
        kind: "padding",
        side,
        area,
        bar: box(centre - length / 2, middle - thickness / 2, centre + length / 2, middle + thickness / 2),
        hit: box(centre - hitHalf, near, centre + hitHalf, far)
      })
    }
  }

  if (!layout.oneLine) {
    return handles
  }

  const row = layout.direction === "row"

  for (let index = 0; index + 1 < layout.children.length; index++) {
    const before = layout.children[index]!
    const after = layout.children[index + 1]!

    // The children as drawn, which in a reversed layout run the other way.
    const [first, second] = (row ? before.left <= after.left : before.top <= after.top)
      ? [before, after]
      : [after, before]

    const area = row
      ? box(first.right, inner.top, second.left, inner.bottom)
      : box(inner.left, first.bottom, inner.right, second.top)

    if ((row ? area.h : area.w) < tooShort || (row ? second.left - first.right : second.top - first.bottom) < 0) {
      continue
    }

    const middle = row ? (first.right + second.left) / 2 : (first.bottom + second.top) / 2
    const centre = row ? area.y + area.h / 2 : area.x + area.w / 2
    const hitHalf = hitAlong / 2
    // At least `hitAcross` wide, but no wider than the space between the children it's beside, or any other child.
    const wide = Math.max(hitAcross, row ? area.w : area.h) / 2
    let [low, high] = [middle - wide, middle + wide]

    for (const child of covered) {
      const [start, end] = row ? [child.top, child.bottom] : [child.left, child.right]

      if (end <= centre - hitHalf || start >= centre + hitHalf) {
        continue
      }

      const [from, to] = row ? [child.left, child.right] : [child.top, child.bottom]

      if (to <= middle) {
        low = Math.max(low, to)
      } else if (from >= middle) {
        high = Math.min(high, from)
      } else {
        low = high
      }
    }

    if (high - low < tooThin) {
      continue
    }

    handles.push({
      kind: "gap",
      index,
      direction: layout.direction,
      area,
      bar: row
        ? box(middle - thickness / 2, centre - length / 2, middle + thickness / 2, centre + length / 2)
        : box(centre - length / 2, middle - thickness / 2, centre + length / 2, middle + thickness / 2),
      hit: row ? box(low, centre - hitHalf, high, centre + hitHalf) : box(centre - hitHalf, low, centre + hitHalf, high)
    })
  }

  return handles
}

/** Which padding sides an edit changes besides its own: the opposite one, or every side. */
export interface SidesHeld {
  opposite: boolean
  every: boolean
}

/** The sides a padding handle changes: its own, its opposite too, or all four. */
export function changedSides(side: PaddingSide, held: SidesHeld): PaddingSide[] {
  if (held.every) {
    return [...paddingSides]
  }

  if (held.opposite) {
    return [side, opposite[side]]
  }

  return [side]
}

/** A length token on the spacing scale, by name, with what it draws at, in layout pixels. */
export interface LengthToken {
  name: string
  px: number
}

export interface SpacingEditStart {
  /** The handle pressed. */
  handle: { kind: "padding"; side: PaddingSide } | { kind: "gap"; direction: "row" | "column" }
  /** The layout's style as the board being edited shows it. */
  style: NodeStyle
  /**
   * What it draws at, in layout pixels: each side's padding, and the gap. A side or a gap set by a token, or unset,
   * starts from here.
   */
  drawn: { padding: Record<PaddingSide, number>; gap: number }
  /** Layout pixels per spacing step. */
  unit: number
  /** Screen pixels per layout pixel. */
  scale: number
  /** The project's length tokens, which a side or gap bound to one can stay bound to. */
  tokens: readonly LengthToken[]
}

export interface SpacingMove extends SidesHeld {
  /** How far the pointer is from where it was pressed, in screen pixels. */
  dx: number
  dy: number
}

/** What a padding or gap handle changes, and what to show beside it. */
export interface SpacingEdit {
  change: Pick<NodeStyle, "padding" | "gap">
  /** The value it came to, in layout pixels, and the token it's bound to, if it is. */
  px: number
  token?: string
  /** The padding sides it changed. */
  sides?: PaddingSide[]
}

/** What one side, or the gap, is now, as it's stored. */
function lengthAt(style: NodeStyle, handle: SpacingEditStart["handle"]): Length | undefined {
  if (handle.kind === "gap") {
    return style.gap
  }

  return sidesOf(style.padding)?.[paddingSides.indexOf(handle.side)]
}

/**
 * The token a value keeps, when it started bound to one and lands on a token's value: its own first. A length written
 * out (`10px`, `auto`, `clamp(…)`) names no token, so it goes to steps from what's drawn, as an unbound value does.
 */
function keptToken(start: Length | undefined, px: number, tokens: readonly LengthToken[]): string | undefined {
  const bound = lengthToken(start)

  if (bound === undefined) {
    return undefined
  }

  const near = (token: LengthToken) => Math.abs(token.px - px) < 0.01
  const own = tokens.find((token) => token.name === bound)

  if (own && near(own)) {
    return own.name
  }

  return tokens.find(near)?.name
}

/** The style a padding or gap handle writes for a value, steps or a token's name, on the sides it changes. */
function writeValue(start: SpacingEditStart, value: FieldLength, sides: readonly PaddingSide[]): SpacingEdit["change"] {
  const written = fieldLength(value)

  if (start.handle.kind === "gap") {
    return { gap: written }
  }

  const [top, right, bottom, left] = sidesOf(start.style.padding) ?? [
    { step: 0 },
    { step: 0 },
    { step: 0 },
    { step: 0 }
  ]

  const next: [Length, Length, Length, Length] = [top, right, bottom, left]

  for (const side of sides) {
    next[paddingSides.indexOf(side)] = written
  }

  return { padding: tidySides(next) }
}

function startPx(start: SpacingEditStart): number {
  return start.handle.kind === "gap" ? start.drawn.gap : start.drawn.padding[start.handle.side]
}

/**
 * How far a drag grows a handle's value, in screen pixels: padding grows as its handle goes outwards, away from the
 * content, as an edge dragged out grows a layer; a gap grows as its handle goes right or down.
 */
function growth(handle: SpacingEditStart["handle"], dx: number, dy: number): number {
  if (handle.kind === "gap") {
    return handle.direction === "row" ? dx : dy
  }

  return { top: -dy, bottom: dy, left: -dx, right: dx }[handle.side]
}

/**
 * Follows one drag of a padding or gap handle, giving the style each pointer position makes, or nothing until the
 * pointer has moved `dragThreshold` pixels towards or away from the space. Padding grows as its handle goes outwards, a
 * gap as its handle goes right or down. The value goes in whole steps of the spacing scale, from what's drawn, and can't
 * go below 0. A value bound to a length token stays bound wherever it lands on a token's value, its own first.
 */
export function spacingDrag(start: SpacingEditStart): (move: SpacingMove) => SpacingEdit | undefined {
  const { handle, unit, scale, tokens } = start
  const from = startPx(start)
  const bound = lengthAt(start.style, handle)
  let started = false

  return ({ dx, dy, opposite: other, every }) => {
    const moved = growth(handle, dx, dy)

    if (!started && Math.abs(moved) < dragThreshold) {
      return undefined
    }

    started = true
    const steps = Math.max(0, Math.round((from + moved / scale) / unit))
    const px = steps * unit
    const token = keptToken(bound, px, tokens)
    const sides = handle.kind === "padding" ? changedSides(handle.side, { opposite: other, every }) : undefined

    return spacingEdit(writeValue(start, token ?? steps, sides ?? []), px, token, sides)
  }
}

function spacingEdit(
  change: SpacingEdit["change"],
  px: number,
  token: string | undefined,
  sides: PaddingSide[] | undefined
): SpacingEdit {
  const edit: SpacingEdit = { change, px }

  if (token) {
    edit.token = token
  }

  if (sides) {
    edit.sides = sides
  }

  return edit
}

/** Steps of the spacing scale up or down, from the keyboard. A token-bound value stays bound on a token's value. */
export function spacingStep(start: SpacingEditStart, count: number, held: SidesHeld): SpacingEdit {
  const from = startPx(start) / start.unit
  const next = Math.max(0, count > 0 ? Math.floor(from + 1e-9) + count : Math.ceil(from - 1e-9) + count)
  const px = next * start.unit
  const token = keptToken(lengthAt(start.style, start.handle), px, start.tokens)
  const sides = start.handle.kind === "padding" ? changedSides(start.handle.side, held) : undefined

  return spacingEdit(writeValue(start, token ?? next, sides ?? []), px, token, sides)
}

/**
 * A value typed after clicking a handle, as the inspector's fields read it (see `readFieldInput`): pixels, maths, or a
 * token's name. An empty field takes the side or the gap back to 0. Gives the reason when it can't be read.
 */
export function typedSpacing(start: SpacingEditStart, text: string, held: SidesHeld): SpacingEdit | { reason: string } {
  const label = start.handle.kind === "gap" ? "Gap" : "Padding"
  const rules: FieldRules = { kind: "length", unit: start.unit, min: 0, label }

  const input = readFieldInput(
    text,
    rules,
    start.tokens.map((token) => token.name)
  )

  const outcome = applyFieldInput(input, startPx(start) / start.unit, rules)

  if (!outcome.ok) {
    return { reason: outcome.reason }
  }

  return pickedSpacing(start, outcome.value ?? 0, held)
}

/**
 * A value picked from the list beside the box a value is typed in: a length token by name, or a number of steps of the
 * spacing scale. The sides it changes follow what was held when the handle was clicked.
 */
export function pickedSpacing(start: SpacingEditStart, value: FieldLength, held: SidesHeld): SpacingEdit {
  const token = isNamedLength(value) ? value : undefined
  const named = start.tokens.find((each) => each.name === token)
  const px = isNamedLength(value) ? (named?.px ?? 0) : value * start.unit
  const sides = start.handle.kind === "padding" ? changedSides(start.handle.side, held) : undefined

  return spacingEdit(writeValue(start, value, sides ?? []), px, token, sides)
}

/**
 * The token a handle's label names beside its value: the length token it's bound to, or else its step of the spacing
 * scale (`spacing-4` for 16px with a 4px unit), which every value a drag lands on is. Nothing for a value off the scale.
 */
export function spacingScaleName(value: { px: number; token?: string }, unit: number): string | undefined {
  if (value.token) {
    return value.token
  }

  const steps = Math.round((value.px / unit) * 1e6) / 1e6

  if (Math.abs(steps * 2 - Math.round(steps * 2)) > 1e-6) {
    return undefined
  }

  return `spacing-${Number.isInteger(steps) ? steps : steps.toFixed(1)}`
}

/**
 * What a handle is called, for assistive technology: the side its padding is on, or the gap, numbered in order when
 * there are `gaps` of them.
 */
export function spacingName(
  handle: { kind: "padding"; side: PaddingSide } | { kind: "gap"; index: number },
  gaps = 1
): string {
  if (handle.kind === "gap") {
    return gaps > 1 ? `Gap ${handle.index + 1}` : "Gap"
  }

  return `${handle.side[0]!.toUpperCase()}${handle.side.slice(1)} padding`
}
