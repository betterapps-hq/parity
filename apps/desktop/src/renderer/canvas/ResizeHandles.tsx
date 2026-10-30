import { type Edge, handleBoxes } from "@parity-app/editor"
import { type CSSProperties, type PointerEvent as ReactPointerEvent, useState } from "react"
import { Hint } from "../chrome/Hint.tsx"

export const resizeCursors: Record<Edge, string> = {
  n: "ns-resize",
  s: "ns-resize",
  e: "ew-resize",
  w: "ew-resize",
  ne: "nesw-resize",
  sw: "nesw-resize",
  nw: "nwse-resize",
  se: "nwse-resize"
}

export interface ResizeHandlesProps {
  handles: {
    kind: "node" | "frame"
    /** Around the layer or frame, in the overlay's pixels. */
    box: { x: number; y: number; w: number; h: number }
    color: string
    edges: Edge[]
  }
  onStart: (edge: Edge, event: ReactPointerEvent) => void
  onReset: (edge: Edge) => void
}

/**
 * Square handles on the corners, and invisible strips along the sides, as in Figma. Around a layer under 24px on an
 * axis they sit outside it (see `handleBoxes`), so a press on the layer drags it rather than resizing it. Each names
 * itself after a moment's hover; pressing one closes that, and it stays closed until the pointer is released, so it
 * never sits over a resize.
 */
export function ResizeHandles({ handles, onStart, onReset }: ResizeHandlesProps) {
  const { color } = handles
  const [hint, setHint] = useState<Edge>()
  const [pressed, setPressed] = useState(false)
  return handleBoxes(handles.box, handles.edges).map(({ edge, box }) => {
    const corner = edge.length === 2
    let style: CSSProperties = { left: box.x, top: box.y, width: box.w, height: box.h }
    if (corner) style = { ...style, background: "white", border: `1.5px solid ${color}`, borderRadius: 2 }
    return (
      <Hint
        key={edge}
        label={handles.kind === "frame" ? "Drag to resize this frame" : "Drag to resize"}
        detail="Double-click to reset."
        wait
        open={hint === edge}
        onOpenChange={(open) => setHint(open && !pressed ? edge : undefined)}
      >
        <div
          role="presentation"
          className={`resize-handle pointer-events-auto absolute ${corner ? "z-10 shadow-sm" : ""}`}
          style={{ ...style, cursor: resizeCursors[edge] }}
          onPointerDown={(event) => {
            if (event.button !== 0) return
            event.stopPropagation()
            event.preventDefault()
            setHint(undefined)
            setPressed(true)
            const release = () => {
              setPressed(false)
              window.removeEventListener("pointerup", release, true)
              window.removeEventListener("pointercancel", release, true)
            }
            window.addEventListener("pointerup", release, true)
            window.addEventListener("pointercancel", release, true)
            onStart(edge, event)
          }}
          onDoubleClick={(event) => {
            event.stopPropagation()
            onReset(edge)
          }}
        />
      </Hint>
    )
  })
}
