import { type CSSProperties, type PointerEvent as ReactPointerEvent, useState } from "react"
import { Hint } from "../chrome/Hint.tsx"
import type { Edge } from "./resize.ts"

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
  onStart(edge: Edge, event: ReactPointerEvent): void
  onReset(edge: Edge): void
}

/**
 * Square handles on the corners, and invisible strips along the sides, as in Figma. Each names itself after a moment's
 * hover; pressing one closes that, and it stays closed until the pointer is released, so it never sits over a resize.
 */
export function ResizeHandles({ handles, onStart, onReset }: ResizeHandlesProps) {
  const { box, color, edges } = handles
  const [hint, setHint] = useState<Edge>()
  const [pressed, setPressed] = useState(false)
  const strip = 8
  const square = 8
  return edges.map((edge) => {
    const corner = edge.length === 2
    let x = box.x + box.w / 2
    if (edge.includes("w")) x = box.x
    else if (edge.includes("e")) x = box.x + box.w
    let y = box.y + box.h / 2
    if (edge.includes("n")) y = box.y
    else if (edge.includes("s")) y = box.y + box.h
    let style: CSSProperties
    if (corner) {
      style = {
        left: x - square / 2,
        top: y - square / 2,
        width: square,
        height: square,
        background: "white",
        border: `1.5px solid ${color}`,
        borderRadius: 2
      }
    } else if (edge === "n" || edge === "s") {
      style = { left: box.x + square, top: y - strip / 2, width: Math.max(0, box.w - square * 2), height: strip }
    } else {
      style = { left: x - strip / 2, top: box.y + square, width: strip, height: Math.max(0, box.h - square * 2) }
    }
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
