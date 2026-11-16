import type { Palette } from "@parity-app/presence-colors"

/**
 * The canvas framed in someone's color, while you follow them or while you present: a line around its edge with a
 * hairline of their ink inside it, so a light color still holds an edge, and a soft glow of the color falling inward.
 */
export function CanvasFrame({ palette }: { palette: Palette }) {
  const { color, ink } = palette

  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-0 z-10 rounded-[inherit]"
      style={{
        boxShadow: [
          `inset 0 0 0 2.5px ${color}`,
          `inset 0 0 0 3.5px color-mix(in oklch, ${ink} 30%, transparent)`,
          `inset 0 0 28px -14px color-mix(in oklch, ${color} 80%, transparent)`
        ].join(", ")
      }}
    />
  )
}
