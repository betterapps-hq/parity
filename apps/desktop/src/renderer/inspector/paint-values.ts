import type { Color, Paint } from "@parity-app/core"
import { isReadFailure, readGradient } from "@parity-app/style-schema"
import { listColor, storedColors } from "./color-values.ts"
import {
  type GradientPaint as ControlGradient,
  type ListColor,
  type Paint as ControlPaint,
  type PaintEntry
} from "./controls/lists-data.ts"
import type { GradientToken } from "./controls/tokens.ts"

/*
 * A node's fills as the Paint stack control holds them, and back (PAR-931). The control's model (lists-data.ts) gives
 * every entry and stop an id, calls a paint's type its kind and conic gradients angular, and holds a color as text;
 * the document's paints have no ids, a gradient token is only its name, and a color says which form it is.
 */

const controlKinds = { linear: "linear", radial: "radial", conic: "angular" } as const

const documentKinds = { linear: "linear", radial: "radial", angular: "conic" } as const

/** A document paint as the control draws it, its stops given ids, a token's stops from the project's gradient tokens. */
function controlPaint(paint: Paint, id: string, gradients: readonly GradientToken[]): ControlPaint {
  if (paint.type === "solid") {
    return { kind: "solid", ...listColor(paint.color) }
  }

  if (paint.type === "image") {
    return { kind: "image", src: paint.src, fit: paint.fit, scale: paint.scale, position: paint.position ?? [50, 50] }
  }

  if (paint.type === "gradient") {
    const token = gradients.find((each) => each.name === paint.token)

    return { ...(token?.paint ?? { kind: "linear", angle: 180, stops: [] }), token: paint.token }
  }

  return {
    kind: controlKinds[paint.type],
    angle: paint.angle ?? (paint.type === "linear" ? 180 : 0),
    center: paint.center,
    repeat: paint.repeat,
    interpolation: paint.interpolation,
    stops: paint.stops.map(({ color, ...stop }, index) => ({ ...stop, ...listColor(color), id: `${id}-stop-${index}` }))
  }
}

/** Reads a color the control holds back into the document (`storedColors`). */
type StoredColor = (color: ListColor) => Color

/** A gradient the control holds as the document keeps it: a token's name alone, or its own stops without ids. */
function documentGradient(paint: ControlGradient, stored: StoredColor): Paint {
  if (paint.token !== undefined) {
    return { type: "gradient", token: paint.token }
  }

  return {
    type: documentKinds[paint.kind],
    angle: paint.angle,
    center: paint.center,
    repeat: paint.repeat || undefined,
    interpolation: paint.interpolation,
    stops: paint.stops.map(({ color, alpha, position, hint }) => ({ color: stored({ color, alpha }), position, hint }))
  }
}

/** An entry of the control as the document keeps it. */
function documentPaint({ paint, off }: PaintEntry, stored: StoredColor): Paint {
  const hidden = off ? { off: true } : {}

  if (paint.kind === "solid") {
    return { type: "solid", color: stored({ color: paint.color, alpha: paint.alpha }), ...hidden }
  }

  if (paint.kind === "image") {
    return { type: "image", src: paint.src, fit: paint.fit, scale: paint.scale, position: paint.position, ...hidden }
  }

  return { ...documentGradient(paint, stored), ...hidden }
}

/** Every color a fill holds: its solids', and its gradients' stops'. */
function colorsOf(fills: readonly Paint[]): Color[] {
  return fills.flatMap((paint) => {
    if (paint.type === "solid") {
      return [paint.color]
    }

    return paint.type === "image" || paint.type === "gradient" ? [] : paint.stops.map((stop) => stop.color)
  })
}

/**
 * The control's entries as the document's paints, top first. A color the entries still hold as the fills they were
 * read from (`under`) stored it comes back in the form it had there.
 */
export function paintsFromEntries(entries: readonly PaintEntry[], under: readonly Paint[] = []): Paint[] {
  const stored = storedColors(colorsOf(under))

  return entries.map((entry) => documentPaint(entry, stored))
}

/**
 * A node's fills as the control's entries, top first. Each entry keeps the id of `previous`'s entry in the same place,
 * so an editor that's open stays open as its paint changes; `previous` itself comes back when it already holds these
 * fills.
 */
export function entriesFromFill(
  fills: readonly Paint[] | undefined,
  gradients: readonly GradientToken[],
  previous: readonly PaintEntry[] = []
): PaintEntry[] {
  const paints = fills ?? []

  if (previous.length > 0 && JSON.stringify(paintsFromEntries(previous, paints)) === JSON.stringify(paints)) {
    return [...previous]
  }

  return paints.map((paint, index) => {
    const id = previous[index]?.id ?? `fill-${index}`
    const entry: PaintEntry = { id, paint: controlPaint(paint, id, gradients) }

    if (paint.off) {
      entry.off = true
    }

    return entry
  })
}

const kindDetails = { linear: "Linear", radial: "Radial", angular: "Angular" } as const

/**
 * A project's gradient token as the Paint stack control offers it, its value read as the paint the gradient editor
 * starts from; nothing for a value that isn't a gradient of plain stops.
 */
export function gradientTokenOf(name: string, value: string): GradientToken | undefined {
  const read = readGradient(value)

  if (isReadFailure(read)) {
    return undefined
  }

  const kind = controlKinds[read.type]

  const paint: ControlGradient = {
    kind,
    angle: read.angle ?? (kind === "linear" ? 180 : 0),
    stops: read.stops.map(({ color, ...stop }, index) => ({ id: `${name}-${index}`, ...listColor(color), ...stop }))
  }

  if (read.center) {
    paint.center = read.center
  }

  if (read.interpolation) {
    paint.interpolation = read.interpolation
  }

  if (read.repeat) {
    paint.repeat = true
  }

  const detail = kind === "linear" ? `Linear ${paint.angle}°` : kindDetails[kind]

  return { name, kind: "gradient", value, detail, paint }
}
