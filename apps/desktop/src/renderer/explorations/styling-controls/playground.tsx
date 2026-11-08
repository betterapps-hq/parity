import { TooltipProvider } from "@buildkitgg/shadcn-baseui-kit"
import { type CSSProperties, type ReactNode, useState } from "react"
import { blurPx, type Draft, hexOf, radiusPx } from "./data.ts"
import type { StrokePosition, Writes } from "./writes.ts"

/*
 * Where each control is tried on its own: the control at the inspector's width, and beside it what it stores and what
 * it writes as CSS and as Tailwind, updated as it's used. A preview draws the result where it helps.
 */

/** A style that changes as the control is used, for a story's state. */
export function useDraft(start: Draft) {
  const [draft, setDraft] = useState(start)
  return [draft, (change: Partial<Draft>) => setDraft((current) => ({ ...current, ...change }))] as const
}

export function Playground({
  writes,
  preview,
  children
}: {
  writes: Writes
  preview?: ReactNode
  children: ReactNode
}) {
  return (
    <TooltipProvider>
      <div className="flex min-h-screen flex-wrap items-start gap-6 bg-background p-6 text-foreground">
        {/* The inspector's width, so the control lays out as it will there. */}
        <section aria-label="Control" className="flex w-80 shrink-0 flex-col gap-1 rounded-lg border p-3">
          {children}
        </section>
        <Readout writes={writes} />
        {preview && (
          <section aria-label="Preview" className="grid shrink-0 place-items-center rounded-lg border bg-muted/40 p-6">
            {preview}
          </section>
        )}
      </div>
    </TooltipProvider>
  )
}

function Readout({ writes }: { writes: Writes }) {
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

/**
 * A card drawn with the style's fill, stroke, radius and blurs, over shapes, so a translucent fill and a background
 * blur show.
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
  const radii = Array.isArray(draft.radius) ? draft.radius : [draft.radius, draft.radius, draft.radius, draft.radius]
  const widths = Array.isArray(draft.borderWidth) ? draft.borderWidth : [0, 0, 0, 0].map(() => draft.borderWidth ?? 0)
  const strokeColor = tint(hexOf(draft.border), draft.borderAlpha) ?? "transparent"
  const width = typeof draft.borderWidth === "number" ? draft.borderWidth : 1
  const stroke: CSSProperties = inLayout
    ? { borderColor: strokeColor, borderStyle: "solid", borderWidth: widths.map((px) => `${px}px`).join(" ") }
    : {
        outline: `${width}px solid ${strokeColor}`,
        outlineOffset: { inside: -width, center: -width / 2, outside: 0 }[position]
      }
  const style = {
    width: 200,
    height: 120,
    background: tint(hexOf(draft.background), draft.backgroundAlpha) ?? "transparent",
    borderRadius: radii.map((radius) => `${Math.min(radiusPx(radius), 200)}px`).join(" "),
    filter: draft.blur ? `blur(${blurPx(draft.blur)}px)` : undefined,
    backdropFilter: draft.backdropBlur ? `blur(${blurPx(draft.backdropBlur)}px)` : undefined,
    ...stroke,
    ...(cornerShape ? { cornerShape } : {})
  } as CSSProperties
  return (
    <div className="relative grid size-64 place-items-center">
      <div aria-hidden className="absolute inset-4 overflow-hidden rounded-2xl">
        <div className="absolute top-3 left-4 size-24 rounded-full bg-[#f54900]" />
        <div className="absolute right-4 bottom-3 size-28 rounded-full bg-[#009689]" />
        <div className="absolute top-1/3 left-1/2 size-16 rotate-12 bg-[#ffb900]" />
      </div>
      <div aria-label="The layer" className="relative grid place-items-center text-xs text-neutral-900" style={style}>
        Plans
      </div>
    </div>
  )
}

/** A color at an alpha from 0 to 100, as CSS draws it. */
export function tint(color: string | undefined, alpha: number | undefined): string | undefined {
  if (!color) return undefined
  if (alpha === undefined) return color
  return `color-mix(in srgb, ${color} ${alpha}%, transparent)`
}
