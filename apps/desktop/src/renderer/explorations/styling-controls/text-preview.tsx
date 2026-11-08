import type { CSSProperties, ReactNode } from "react"

/*
 * Previews for the text, keyword and opacity stories: a paragraph set in the style being edited, and a layer over
 * shapes, so opacity and blend modes show what they do.
 */

/** A paragraph set in the style, on a white card, as Plans' text is. */
export function TextSample({ style, children }: { style: CSSProperties; children?: ReactNode }) {
  return (
    <div className="w-72 rounded-lg border bg-white p-4 text-neutral-900">
      <p aria-label="The text" className="m-0 text-base" style={style}>
        {children ?? "Simple pricing for every team. Start free, then pay as you grow, with every feature included."}
      </p>
    </div>
  )
}

/** A layer drawn over colored shapes, so what's behind it shows through its opacity and blend. */
export function OverShapes({ style, children }: { style: CSSProperties; children?: ReactNode }) {
  return (
    <div className="relative grid size-64 place-items-center">
      <div aria-hidden className="absolute inset-4 overflow-hidden rounded-2xl bg-white">
        <div className="absolute top-3 left-4 size-24 rounded-full bg-[#f54900]" />
        <div className="absolute right-4 bottom-3 size-28 rounded-full bg-[#009689]" />
        <div className="absolute top-1/3 left-1/2 size-16 rotate-12 bg-[#ffb900]" />
      </div>
      <div
        aria-label="The layer"
        className="relative grid h-28 w-44 place-items-center rounded-xl bg-[#2563eb] text-xs text-white"
        style={style}
      >
        {children ?? "Plans"}
      </div>
    </div>
  )
}
