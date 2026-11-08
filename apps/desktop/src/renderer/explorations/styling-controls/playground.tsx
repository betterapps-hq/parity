import { TooltipProvider } from "@buildkitgg/shadcn-baseui-kit"
import { createContext, type CSSProperties, type ReactNode, useContext, useState } from "react"
import { mixColor } from "./css-values.ts"
import { type Draft, usedColors } from "./data.ts"
import { ProjectTokens, useTokenSets } from "./field-parts.tsx"
import { hexOf, lengthPx, type TokenSets } from "./tokens.ts"
import type { StrokePosition, Writes } from "./writes.ts"

/*
 * Where each control is tried on its own: the control at the inspector's width, and beside it what it stores and what
 * it writes as CSS and as Tailwind, updated as it's used. A preview draws the result where it helps. Each story has its
 * own project tokens, so a token made with Create token is there for the story's fields and preview only.
 */

/** A style that changes as the control is used, for a story's state. */
export function useDraft(start: Draft) {
  const [draft, setDraft] = useState(start)
  return [draft, (change: Partial<Draft>) => setDraft((current) => ({ ...current, ...change }))] as const
}

/**
 * Set around stories shown together, as Every control does, so each Playground inside shows its control alone, without
 * what it writes or its preview.
 */
export const ControlOnly = createContext(false)

export function Playground({
  writes,
  preview,
  tokens,
  children
}: {
  writes: Writes
  preview?: ReactNode
  /** Sets the story's project starts with in place of the stand-ins, as `{ duration: [] }` for one with none. */
  tokens?: Partial<TokenSets>
  children: ReactNode
}) {
  const only = useContext(ControlOnly)
  // The inspector's width, so the control lays out as it will there.
  const control = (
    <section aria-label="Control" className="flex w-80 shrink-0 flex-col gap-1 rounded-lg border p-3">
      {children}
    </section>
  )
  return (
    <TooltipProvider>
      <ProjectTokens tokens={tokens}>
        {only ? (
          control
        ) : (
          // It scrolls itself: the app's stylesheet keeps the page from scrolling, as the app's window mustn't.
          <div className="flex h-screen flex-wrap content-start items-start gap-6 overflow-y-auto bg-background p-6 text-foreground">
            {control}
            <Readout writes={writes} />
            {preview && (
              <section
                aria-label="Preview"
                className="grid shrink-0 place-items-center rounded-lg border bg-muted/40 p-6"
              >
                {preview}
              </section>
            )}
          </div>
        )}
      </ProjectTokens>
    </TooltipProvider>
  )
}

export function Readout({ writes }: { writes: Writes }) {
  const blocks = [
    { title: "Stored", text: writes.stored === undefined ? "Unset" : JSON.stringify(writes.stored, null, 2) },
    { title: "CSS", text: writes.css.length > 0 ? writes.css.map((line) => `${line};`).join("\n") : "Nothing" },
    { title: "Tailwind", text: writes.tailwind.length > 0 ? writes.tailwind.join(" ") : "Nothing" },
    ...(writes.markup === undefined ? [] : [{ title: "Markup", text: writes.markup }])
  ]
  return (
    <section aria-label="What it writes" className="flex w-80 min-w-0 shrink-0 flex-col gap-3">
      {blocks.map((block) => (
        <div key={block.title} className="flex flex-col gap-1">
          <h2 className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{block.title}</h2>
          <pre
            aria-label={block.title}
            className="overflow-x-auto rounded-md border bg-muted/40 p-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap"
          >
            {block.text}
          </pre>
        </div>
      ))}
    </section>
  )
}

/** The shapes behind Plans, in the design's own colors: two circles and a square turned a little. */
const [shapeA, shapeB, shapeC] = usedColors

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
          <div className="absolute top-4 left-6 size-40 rounded-full" style={{ background: shapeA }} />
          <div className="absolute right-10 bottom-2 size-48 rounded-full" style={{ background: shapeB }} />
          <div className="absolute top-1/3 left-1/2 size-28 rotate-12" style={{ background: shapeC }} />
        </div>
        {children}
      </div>
    )
  }
  return (
    <div className="relative grid size-64 place-items-center">
      <div aria-hidden className="absolute inset-4 overflow-hidden rounded-2xl">
        <div className="absolute top-3 left-4 size-24 rounded-full" style={{ background: shapeA }} />
        <div className="absolute right-4 bottom-3 size-28 rounded-full" style={{ background: shapeB }} />
        <div className="absolute top-1/3 left-1/2 size-16 rotate-12" style={{ background: shapeC }} />
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
export function drawnStyle(
  draft: Draft,
  sets: TokenSets,
  { inLayout = true, position = "inside" }: { inLayout?: boolean; position?: StrokePosition } = {}
): CSSProperties {
  const radii = Array.isArray(draft.radius) ? draft.radius : [draft.radius, draft.radius, draft.radius, draft.radius]
  const widths = Array.isArray(draft.borderWidth) ? draft.borderWidth : [0, 0, 0, 0].map(() => draft.borderWidth ?? 0)
  const strokeColor = mixColor(hexOf(draft.border, sets.color), draft.borderAlpha) ?? "transparent"
  const width = typeof draft.borderWidth === "number" ? draft.borderWidth : 1
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
        typeof radius === "object" && "percent" in radius
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
  cornerShape
}: {
  draft: Draft
  inLayout?: boolean
  position?: StrokePosition
  cornerShape?: string
}) {
  const sets = useTokenSets()
  // `corner-shape` is Chromium's only, and not in React's CSS types yet.
  const shape: CSSProperties & { cornerShape?: string } = cornerShape ? { cornerShape } : {}
  return (
    <PreviewStage>
      <Card style={{ ...drawnStyle(draft, sets, { inLayout, position }), ...shape }} />
    </PreviewStage>
  )
}
