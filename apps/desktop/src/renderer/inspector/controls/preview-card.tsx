import type { CSSProperties, ReactNode } from "react"
import { mixColor } from "./css-values.ts"
import { type Draft, isLengthToken, usedColors } from "./data.ts"
import { useTokenSets } from "./field-parts.tsx"
import { sideNumber, type Sides } from "./sides-writes.ts"
import { hexOf, lengthPx, type TokenSets } from "./tokens.ts"
import type { StrokePosition } from "./writes.ts"

/*
 * The card a list's or an effect's preview draws on, Plans, over shapes that show what's see-through: in a story's
 * preview and in the live controls' cards alike.
 */

/** The shapes behind Plans, in the stand-in design's colors: two circles and a square turned a little. */
const [circleColor, otherCircleColor, squareColor] = usedColors

/**
 * Shapes behind a preview, so a translucent fill, a shadow, a filter or a background blur shows. It's a 256-pixel
 * square for a card; `around` lets what's inside set its own size, with larger shapes spilling past it, as the layer
 * preview's is.
 */
export function PreviewStage({ around = false, children }: { around?: boolean; children: ReactNode }) {
  if (around) {
    return (
      <div className="relative flex w-full max-w-[680px] justify-center">
        <div aria-hidden className="absolute -inset-10 overflow-hidden rounded-3xl">
          <div className="absolute top-4 left-6 size-40 rounded-full" style={{ background: circleColor }} />
          <div className="absolute right-10 bottom-2 size-48 rounded-full" style={{ background: otherCircleColor }} />
          <div className="absolute top-1/3 left-1/2 size-28 rotate-12" style={{ background: squareColor }} />
        </div>
        {children}
      </div>
    )
  }

  return (
    <div className="relative grid size-64 place-items-center">
      <div aria-hidden className="absolute inset-4 overflow-hidden rounded-2xl">
        <div className="absolute top-3 left-4 size-24 rounded-full" style={{ background: circleColor }} />
        <div className="absolute right-4 bottom-3 size-28 rounded-full" style={{ background: otherCircleColor }} />
        <div className="absolute top-1/3 left-1/2 size-16 rotate-12" style={{ background: squareColor }} />
      </div>
      {children}
    </div>
  )
}

/** The 200 by 120 card, Plans, drawn with a style: every list and effect field's preview draws on it. */
export function Card({ style, children = "Plans" }: { style?: CSSProperties; children?: ReactNode }) {
  return (
    <div
      aria-label="The layer"
      className="relative grid place-items-center text-xs text-neutral-900"
      style={{ width: 200, height: 120, ...style }}
    >
      {children}
    </div>
  )
}

/** A style's colors, radii, stroke and blurs as a preview draws them, with the project's tokens resolved. */
const noStroke: Sides = [undefined, undefined, undefined, undefined]

export function drawnStyle(
  draft: Draft,
  sets: TokenSets,
  { inLayout = true, position = "inside" }: { inLayout?: boolean; position?: StrokePosition } = {}
): CSSProperties {
  const radii = Array.isArray(draft.radius) ? draft.radius : [draft.radius, draft.radius, draft.radius, draft.radius]
  const widths = (draft.borderWidth ?? noStroke).map((side) => sideNumber(side, sets.borderWidth) ?? 0)
  const strokeColor = mixColor(hexOf(draft.border, sets.color), draft.borderAlpha) ?? "transparent"
  const width = widths[0] || 1

  const stroke: CSSProperties = inLayout
    ? { borderColor: strokeColor, borderStyle: "solid", borderWidth: widths.map((px) => `${px}px`).join(" ") }
    : {
        outline: `${width}px solid ${strokeColor}`,
        outlineOffset: { inside: -width, center: -width / 2, outside: 0 }[position]
      }

  return {
    background: mixColor(hexOf(draft.background, sets.color), draft.backgroundAlpha) ?? "transparent",
    borderRadius: radii
      .map((radius) =>
        radius !== undefined && !isLengthToken(radius) && "percent" in radius
          ? `${radius.percent}%`
          : `${Math.min(lengthPx(radius, sets.radius), 200)}px`
      )
      .join(" "),
    filter: draft.blur ? `blur(${lengthPx(draft.blur, sets.blur)}px)` : undefined,
    backdropFilter: draft.backdropBlur ? `blur(${lengthPx(draft.backdropBlur, sets.blur)}px)` : undefined,
    ...stroke
  }
}

/**
 * The card drawn with the style's fill, stroke, radius and blurs, over the stage's shapes, so a translucent fill and a
 * background blur show.
 */
export function CardPreview({
  draft,
  inLayout = true,
  position = "inside",
  cornerStyle
}: {
  draft: Draft
  inLayout?: boolean
  position?: StrokePosition
  cornerStyle?: string
}) {
  const sets = useTokenSets()
  // `corner-shape` is Chromium's only, and not in React's CSS types yet.
  // oxlint-disable-next-line anti-slop/no-shape-in-symbol-names -- React's style prop names CSS's `corner-shape` this way.
  const corners: CSSProperties & { cornerShape?: string } = cornerStyle ? { cornerShape: cornerStyle } : {}

  return (
    <PreviewStage>
      <Card style={{ ...drawnStyle(draft, sets, { inLayout, position }), ...corners }} />
    </PreviewStage>
  )
}
