import { boardTarget, editNode, isNamedLength, type Length, type NodeStyle } from "@parity-app/core"
import {
  type LengthToken,
  type PaddingSide,
  paddingSides,
  pickedSpacing,
  resizeStart,
  type SpacingEdit,
  type SpacingEditStart,
  spacingDrag,
  type SpacingHandle,
  type SpacingLayout,
  sidesOf,
  spacingStep,
  typedSpacing
} from "@parity-app/editor"
import type { Token } from "@parity-app/tokens"
import type { PointerEvent as ReactPointerEvent } from "react"
import { px } from "../lengths.ts"
import { resolveTokenValue, spacingUnit } from "../tokens-store.ts"
import type { ProjectSession } from "../workspace.ts"
import { followPress, gestures } from "./gesture.ts"
import { sidesHeld, type SpacingKeys } from "./SpacingHandles.tsx"

/**
 * The canvas's side of PAR-169's padding and gap handles: measuring a selected layout for `spacingHandles`, and
 * writing what `@parity-app/editor`'s rules give for a drag, a typed or picked value, or a step from the keyboard, in
 * the state and variant the frame shows, as every edit is.
 */

/** The selected layout whose handles show, as the frame it was picked in shows it. */
export interface SpacingTarget {
  design: string
  mode: string
  state: string
  node: string
}

/** A selected layout measured for its handles. */
export interface SpacingMeasure {
  /** In the overlay's pixels. */
  layout: SpacingLayout
  /** What its padding and gap draw at, in its own pixels. */
  drawn: { padding: Record<PaddingSide, number>; gap: number }
  /** Screen pixels per layout pixel. */
  scale: number
}

/**
 * Measures a laid out element and its children that are drawn in the flow, with `toOverlay` taking screen pixels to
 * the overlay's. Its children run along a single line when it's a flex box that doesn't wrap; a grid or a wrap has
 * gaps in two directions, which have no handles yet.
 */
export function measureSpacing(
  element: HTMLElement,
  children: readonly (HTMLElement | undefined)[],
  toOverlay: (rect: DOMRect) => { left: number; top: number; right: number; bottom: number }
): SpacingMeasure {
  const rect = element.getBoundingClientRect()
  const style = getComputedStyle(element)
  const scale = rect.width / Math.max(1, element.offsetWidth)
  const own = (name: string) => parseFloat(style.getPropertyValue(name)) || 0

  const sides = (prefix: string, suffix = ""): Record<PaddingSide, number> => ({
    top: own(`${prefix}-top${suffix}`),
    right: own(`${prefix}-right${suffix}`),
    bottom: own(`${prefix}-bottom${suffix}`),
    left: own(`${prefix}-left${suffix}`)
  })

  const scaled = (values: Record<PaddingSide, number>) =>
    // SAFETY: the entries are the four sides of `values`, each kept.
    Object.fromEntries(Object.entries(values).map(([side, value]) => [side, value * scale])) as Record<
      PaddingSide,
      number
    >

  const padding = sides("padding")
  const row = style.flexDirection.startsWith("row")

  const drawn = children.flatMap((child) => {
    if (!child) {
      return []
    }

    const box = child.getBoundingClientRect()

    return box.width > 0 || box.height > 0
      ? [{ box: toOverlay(box), flows: getComputedStyle(child).position !== "absolute" }]
      : []
  })

  return {
    layout: {
      rect: toOverlay(rect),
      border: scaled(sides("border", "-width")),
      padding: scaled(padding),
      children: drawn.flatMap((child) => (child.flows ? [child.box] : [])),
      // No handle covers a child, so a click on one selects it, those placed absolutely too.
      covered: drawn.map((child) => child.box),
      direction: row ? "row" : "column",
      oneLine: style.display.includes("flex") && style.flexWrap === "nowrap"
    },
    drawn: { padding, gap: own(row ? "column-gap" : "row-gap") },
    scale
  }
}

/**
 * The project's length tokens a padding or gap can be bound to, with what each draws at: its semantic spacing and
 * container tokens, not the steps of the scale, which a design writes as numbers. A token whose length can't be worked
 * out is left out.
 */
export function lengthTokens(tokens: readonly Token[]): LengthToken[] {
  const unit = spacingUnit(tokens)

  return tokens.flatMap((token) => {
    if ((token.category !== "spacing" && token.category !== "container") || token.derived || token.name === "spacing") {
      return []
    }

    // The scale's own variable isn't set on Parity's page, so a step of it is worked out here.
    const value = resolveTokenValue(tokens, token.name).replaceAll("var(--spacing)", `${unit}px`)

    if (value.includes("var(")) {
      return []
    }

    const length = px(value)

    return Number.isFinite(length) ? [{ name: token.name, px: length }] : []
  })
}

/** What an edit of the target starts from: its style as the frame shows it, and what it draws at. */
function editStart(
  session: ProjectSession,
  target: SpacingTarget,
  handle: SpacingHandle,
  measure: SpacingMeasure
): { start: SpacingEditStart; frame: NonNullable<ReturnType<ProjectSession["store"]["editFrame"]>> } | undefined {
  const { store, tokens } = session
  const entry = store.getEntry(target.design)
  const frame = store.editFrame(target)

  if (!entry || !frame) {
    return undefined
  }

  const shown = resizeStart(entry.container, target.node, { state: frame.state, viewport: frame.viewport })

  if (!shown) {
    return undefined
  }

  const all = tokens.get()

  return {
    frame,
    start: {
      handle: handle.kind === "padding" ? { kind: "padding", side: handle.side } : handle,
      style: shown.style,
      drawn: measure.drawn,
      unit: spacingUnit(all),
      scale: measure.scale,
      tokens: lengthTokens(all)
    }
  }
}

/** A spacing as a handle shows it: what it draws at, in CSS pixels, and the token it's bound to. */
export interface SpacingValue {
  px: number
  token?: string
}

/** What a handle shows when it isn't being dragged: what it draws at, and the token it's bound to. */
export function spacingValue(
  session: ProjectSession,
  target: SpacingTarget,
  handle: SpacingHandle,
  measure: SpacingMeasure
): SpacingValue {
  const drawn = handle.kind === "gap" ? measure.drawn.gap : measure.drawn.padding[handle.side]
  const edit = editStart(session, target, handle, measure)
  const style: NodeStyle = edit?.start.style ?? {}
  const written = handle.kind === "gap" ? style.gap : sidesOf(style.padding)?.[paddingSides.indexOf(handle.side)]

  return isNamedLength(written) ? { px: drawn, token: written } : { px: drawn }
}

function write(
  session: ProjectSession,
  frame: { design: string; state: { id: string } },
  node: string,
  edit: SpacingEdit,
  gesture?: string
): void {
  const label = "gap" in edit.change ? "Change gap" : "Change padding"
  session.store.updateContainer(
    frame.design,
    label,
    (container) => editNode(container, boardTarget(container, frame.state.id), node, { style: edit.change }),
    gesture ? { gesture } : undefined
  )
}

/** The cursor a handle shows while it's dragged: up and down for top and bottom padding, and gaps in a column. */
export function spacingCursor(handle: SpacingHandle): string {
  if (handle.kind === "gap") {
    return handle.direction === "row" ? "ew-resize" : "ns-resize"
  }

  return handle.side === "top" || handle.side === "bottom" ? "ns-resize" : "ew-resize"
}

/**
 * Follows a press on a handle. Once it's a drag it writes as the pointer moves, one undo step, with Alt and Alt+Shift
 * read at each move; Escape takes it back (see `gestures.resize`). Released without dragging, it's a click, and `type`
 * opens the box to type a value in.
 */
export function pressSpacing(
  session: ProjectSession,
  target: SpacingTarget,
  handle: SpacingHandle,
  measure: SpacingMeasure,
  event: ReactPointerEvent,
  show: (edit: SpacingEdit | undefined) => void,
  type: () => void
): void {
  const edit = editStart(session, target, handle, measure)

  if (!edit) {
    return
  }

  const drag = spacingDrag(edit.start)
  const start = { clientX: event.clientX, clientY: event.clientY }
  let last = ""
  followPress(gestures.resize, session.store, start, {
    design: edit.frame.design,
    cursor: spacingCursor(handle),
    move(moveEvent, { gesture }) {
      const next = drag({
        dx: moveEvent.clientX - start.clientX,
        dy: moveEvent.clientY - start.clientY,
        ...sidesHeld(moveEvent)
      })

      if (!next) {
        return
      }

      show(next)
      const serialized = JSON.stringify(next.change)

      if (serialized === last) {
        return
      }

      last = serialized
      write(session, edit.frame, target.node, next, gesture)
    },
    end: () => show(undefined),
    click: type
  })
}

/** A value typed after a click; the reason when it can't be read. */
export function typeSpacing(
  session: ProjectSession,
  target: SpacingTarget,
  handle: SpacingHandle,
  measure: SpacingMeasure,
  text: string,
  keys: SpacingKeys
): string | undefined {
  const edit = editStart(session, target, handle, measure)

  if (!edit) {
    return undefined
  }

  const next = typedSpacing(edit.start, text, keys)

  if ("reason" in next) {
    return next.reason
  }

  write(session, edit.frame, target.node, next)

  return undefined
}

/** A token or a step picked from the list beside the box. */
export function pickSpacing(
  session: ProjectSession,
  target: SpacingTarget,
  handle: SpacingHandle,
  measure: SpacingMeasure,
  value: Length,
  keys: SpacingKeys
): void {
  const edit = editStart(session, target, handle, measure)

  if (edit) {
    write(session, edit.frame, target.node, pickedSpacing(edit.start, value, keys))
  }
}

/** Up or Down on a focused handle. */
export function stepSpacing(
  session: ProjectSession,
  target: SpacingTarget,
  handle: SpacingHandle,
  measure: SpacingMeasure,
  count: number,
  keys: SpacingKeys
): void {
  const edit = editStart(session, target, handle, measure)

  if (edit) {
    write(session, edit.frame, target.node, spacingStep(edit.start, count, keys))
  }
}
