import type { Fill, Paint } from "@parity-app/core"
import { paintsOf } from "@parity-app/core"
import {
  type GradientPaint as ControlGradient,
  gradientDirections,
  type Paint as ControlPaint,
  type PaintEntry,
  type Stop
} from "./controls/lists-data.ts"
import type { GradientToken } from "./controls/tokens.ts"

/*
 * A node's fill as the Paint stack control holds it, and back (PAR-931). The control's model (lists-data.ts) gives
 * every entry and stop an id and calls conic gradients angular; the document's paints have no ids, and a gradient
 * token is only its name.
 */

const controlKinds = { linear: "linear", radial: "radial", conic: "angular" } as const

const documentKinds = { linear: "linear", radial: "radial", angular: "conic" } as const

/** A document paint as the control draws it, its stops given ids, a token's stops from the project's gradient tokens. */
function controlPaint(paint: Paint, id: string, gradients: readonly GradientToken[]): ControlPaint {
  if (paint.kind === "solid") {
    return { kind: "solid", color: paint.color, alpha: paint.alpha }
  }

  if (paint.kind === "image") {
    return { kind: "image", src: paint.src, fit: paint.fit, scale: paint.scale, position: paint.position ?? [50, 50] }
  }

  if (paint.kind === "gradient") {
    const token = gradients.find((each) => each.name === paint.token)

    return { ...(token?.paint ?? { kind: "linear", angle: 180, stops: [] }), token: paint.token }
  }

  return {
    kind: controlKinds[paint.kind],
    angle: paint.angle ?? (paint.kind === "linear" ? 180 : 0),
    center: paint.center,
    repeat: paint.repeat,
    interpolation: paint.interpolation,
    stops: paint.stops.map((stop, index) => ({ ...stop, id: `${id}-stop-${index}` }))
  }
}

/** A gradient the control holds as the document keeps it: a token's name alone, or its own stops without ids. */
function documentGradient(paint: ControlGradient): Paint {
  if (paint.token !== undefined) {
    return { kind: "gradient", token: paint.token }
  }

  return {
    kind: documentKinds[paint.kind],
    angle: paint.angle,
    center: paint.center,
    repeat: paint.repeat || undefined,
    interpolation: paint.interpolation,
    stops: paint.stops.map(({ color, alpha, position, hint }) => ({ color, alpha, position, hint }))
  }
}

/** An entry of the control as the document keeps it. */
function documentPaint({ paint, off }: PaintEntry): Paint {
  const hidden = off ? { hidden: true } : {}

  if (paint.kind === "solid") {
    return { kind: "solid", color: paint.color, alpha: paint.alpha, ...hidden }
  }

  if (paint.kind === "image") {
    return { kind: "image", src: paint.src, fit: paint.fit, scale: paint.scale, position: paint.position, ...hidden }
  }

  return { ...documentGradient(paint), ...hidden }
}

/** The control's entries as the document's paints, top first. */
export function paintsFromEntries(entries: readonly PaintEntry[]): Paint[] {
  return entries.map(documentPaint)
}

/**
 * A fill as the control's entries, top first. Each entry keeps the id of `previous`'s entry in the same place, so an
 * editor that's open stays open as its paint changes; `previous` itself comes back when it already holds this fill.
 */
export function entriesFromFill(
  fill: Fill | undefined,
  gradients: readonly GradientToken[],
  previous: readonly PaintEntry[] = []
): PaintEntry[] {
  const paints = paintsOf(fill)

  if (previous.length > 0 && JSON.stringify(paintsFromEntries(previous)) === JSON.stringify(paints)) {
    return [...previous]
  }

  return paints.map((paint, index) => {
    const id = previous[index]?.id ?? `fill-${index}`
    const entry: PaintEntry = { id, paint: controlPaint(paint, id, gradients) }

    if (paint.hidden) {
      entry.off = true
    }

    return entry
  })
}

/** Splits CSS at its top-level separators, leaving what's inside brackets whole. */
function topLevel(css: string, separator: "," | " "): string[] {
  const parts: string[] = []
  let depth = 0
  let part = ""

  for (const character of css) {
    if (character === "(") {
      depth += 1
    } else if (character === ")") {
      depth -= 1
    }

    if (depth === 0 && (separator === " " ? /\s/.test(character) : character === separator)) {
      parts.push(part.trim())
      part = ""
    } else {
      part += character
    }
  }

  return [...parts, part.trim()].filter(Boolean)
}

const percent = (value: string | undefined): number | undefined =>
  value?.endsWith("%") ? Number.parseFloat(value) : undefined

const fromKinds = new Map<string, ControlGradient["kind"]>([
  ["linear", "linear"],
  ["radial", "radial"],
  ["conic", "angular"]
])

const kindDetails = { linear: "Linear", radial: "Radial", angular: "Angular" } as const

const isDirection = (head: string): head is keyof typeof gradientDirections => head in gradientDirections

/** A stop's color as the control holds it: a custom property as its token's name, anything else as written. */
const stopColor = (color: string): string => /^var\(--([\w-]+)\)$/.exec(color)?.[1] ?? color

/** The gradient's head, before its stops: the angle, where its center is, and the color space it blends in. */
function readHead(
  kind: ControlGradient["kind"],
  head: string | undefined
): Pick<ControlGradient, "angle" | "center" | "interpolation"> {
  const words = topLevel(head ?? "", " ")
  const degrees = words.find((word) => word.endsWith("deg"))
  let angle = kind === "linear" ? 180 : 0

  if (degrees) {
    angle = Number.parseFloat(degrees)
  } else if (head && isDirection(head)) {
    angle = gradientDirections[head]
  }

  const read: Pick<ControlGradient, "angle" | "center" | "interpolation"> = { angle }
  const at = words.indexOf("at")

  if (at !== -1) {
    read.center = [percent(words[at + 1]) ?? 50, percent(words[at + 2]) ?? 50]
  }

  const blend = words.includes("in") ? words[words.indexOf("in") + 1] : undefined

  if (blend === "oklch" || blend === "srgb") {
    read.interpolation = blend
  }

  return read
}

/**
 * A project's gradient token as the Paint stack control offers it, its value read as the paint the gradient editor
 * starts from; nothing for a value that isn't a gradient of plain stops.
 */
export function gradientTokenOf(name: string, value: string): GradientToken | undefined {
  const match = /^(repeating-)?(linear|radial|conic)-gradient\((.*)\)$/s.exec(value.trim())

  if (!match) {
    return undefined
  }

  const kind = fromKinds.get(match[2]!)

  if (!kind) {
    return undefined
  }

  const parts = topLevel(match[3]!, ",")
  const first = parts[0] ?? ""
  const headed = /^(to |at |from |in |-?[\d.]+(deg|turn|rad))/.test(first) || /^[a-z-]+ at /.test(first)
  const stops: Stop[] = []

  for (const part of headed ? parts.slice(1) : parts) {
    const words = topLevel(part, " ")
    const hint = words.length === 1 ? percent(words[0]) : undefined
    const previous = stops.at(-1)

    if (hint !== undefined && previous) {
      previous.hint = hint
      continue
    }

    const color = words.filter((word) => percent(word) === undefined).join(" ")
    const position = words.map(percent).find((each) => each !== undefined)
    stops.push({ id: `${name}-${stops.length}`, color: stopColor(color), position: position ?? Number.NaN })
  }

  if (stops.length < 2) {
    return undefined
  }

  // Stops without a place are spread evenly, as CSS spreads them.
  stops.forEach((stop, index) => {
    if (Number.isNaN(stop.position)) {
      stop.position = Math.round((index / (stops.length - 1)) * 100)
    }
  })

  const paint: ControlGradient = { kind, stops, ...readHead(kind, headed ? first : undefined) }

  if (match[1]) {
    paint.repeat = true
  }

  const detail = kind === "linear" ? `Linear ${paint.angle}°` : kindDetails[kind]

  return { name, kind: "gradient", value, detail, paint }
}
