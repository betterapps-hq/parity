import type { CSSProperties, ReactNode } from "react"

/*
 * Previews for the text, keyword and opacity stories: a paragraph set in the style being edited, and the look of a
 * filled layer, which they draw on playground.tsx's Card over its PreviewStage, so opacity, blend modes, cursors and
 * stroke styles show what they do.
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

/** A layer filled in blue (Tailwind's blue-600) with white text, rounded, as the stories that change a whole layer draw Card. */
export const filledLayer: CSSProperties = { background: "#2563eb", color: "white", borderRadius: 12 }
