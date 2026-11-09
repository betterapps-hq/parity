import type { SpacingHandle } from "@parity-app/editor"
import { type ChipColors, chipFor, kindColors } from "./kinds.tsx"

/** Padding is modes' green, as the Design panel's box model draws it (PAR-186). */
const padding = kindColors.mode

/**
 * How spacing is colored wherever it's drawn, so a change here reaches the canvas's handles, hatching and chips at once
 * (PAR-797): padding and gaps in modes' green, and margin in pink, which the canvas doesn't draw yet. Gaps take
 * padding's color, so the two change together; give gaps their own here to split them.
 */
export const spacingColors = {
  padding,
  gap: padding,
  margin: "var(--canvas-margin)"
} as const

/**
 * A padding or gap value's chip: its color under the text that color's chips take, which `chipFor` pairs at 4.5:1 or
 * better for each kind's color. `SpacingHandles.test.ts` checks the pair in Chrome, so a color without a safe pair
 * fails there.
 */
export function spacingChip(spacing: SpacingHandle["kind"]): ChipColors {
  return chipFor(spacingColors[spacing])
}

/**
 * Hatching in a spacing color, as Figma hatches padding and gaps: 1px lines rising to the right, 8px apart along an
 * edge, so 4√2px apart across them, over a faint tint. It's in screen pixels, so it looks the same at every zoom.
 */
export function spacingHatch(color: string): string {
  // About as far off white as Figma's lines and tint are: its lines come to roughly 1.4:1 on white.
  const line = `color-mix(in oklch, ${color} 40%, transparent)`
  const tint = `color-mix(in oklch, ${color} 5%, transparent)`

  return `repeating-linear-gradient(-45deg, ${line} 0 1px, ${tint} 1px ${4 * Math.SQRT2}px)`
}
