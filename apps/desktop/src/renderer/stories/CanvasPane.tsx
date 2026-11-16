import type { ReactNode } from "react"
import { canvasBackground, type Theme } from "./canvas-kit.tsx"

interface CanvasPaneProps {
  theme: Theme
  width: number
  height: number
  children: ReactNode
}

/** Each pane's color scheme, so colors chosen by `light-dark()` follow the pane's theme rather than the page's. */
const schemes: Record<Theme, string> = { light: "scheme-light", dark: "scheme-dark" }

/**
 * A piece of the canvas in one theme, `width` wide at most and `height` tall at least. What's inside is placed
 * absolutely, in pixels from its top-left, or flows and grows it. It's a container, so what's inside can respond to how
 * wide the canvas is.
 */
export function CanvasPane({ theme, width, height, children }: CanvasPaneProps) {
  return (
    <div
      className={`${theme} ${schemes[theme]} @container relative overflow-hidden rounded-xl border text-foreground`}
      style={{ width, maxWidth: "100%", minHeight: height, background: canvasBackground[theme] }}
    >
      {children}
    </div>
  )
}
