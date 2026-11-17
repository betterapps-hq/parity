/*
 * What the text fields know of a font: its family, faces and stack, which fonts.ts lists from the project and the
 * computer. The font tokens themselves, and Tailwind v4's weight, leading, tracking and text size scales, are in
 * tokens.ts. Blend modes are here
 * too, as the keywords Appearance's menu offers.
 */
import { type WeightToken } from "./tokens.ts"

export interface FontFamily {
  /** The first family, as it's shown. */
  name: string
  /** The whole stack, as CSS writes it. */
  stack: string
  /** The weights it has a face for. */
  weights: number[]
  /** A variable font's weight axis. */
  axis?: [number, number]
  italic: boolean
}

/** The families in a stack, as typed: `Inter, system-ui, sans-serif`. */
export function stackFamilies(stack: string): string[] {
  return stack
    .split(",")
    .map((family) => family.trim().replaceAll(/^["']|["']$/g, ""))
    .filter(Boolean)
}

/** The generic family a stack falls back to, which picks the nearest font token. */
export function genericOf(stack: string): "serif" | "monospace" | "sans-serif" {
  const families = stackFamilies(stack).map((family) => family.toLowerCase())

  if (families.includes("monospace")) {
    return "monospace"
  }

  if (families.includes("serif")) {
    return "serif"
  }

  return "sans-serif"
}

/** A weight's name where a token names it (Semibold), or its number. */
export function weightName(value: number, tokens: readonly WeightToken[]): string {
  return tokens.find((token) => token.weight === value)?.label ?? String(value)
}

/** `mix-blend-mode`'s keywords, grouped as Figma's blend menu is; `plus-*` aren't Baseline. */
export const blendModes = [
  { value: "normal", label: "Normal", group: 0 },
  { value: "darken", label: "Darken", group: 1 },
  { value: "multiply", label: "Multiply", group: 1 },
  { value: "color-burn", label: "Color burn", group: 1 },
  { value: "plus-darker", label: "Plus darker", group: 1, browsers: "Safari" },
  { value: "lighten", label: "Lighten", group: 2 },
  { value: "screen", label: "Screen", group: 2 },
  { value: "color-dodge", label: "Color dodge", group: 2 },
  { value: "plus-lighter", label: "Plus lighter", group: 2, browsers: "Chromium and Safari" },
  { value: "overlay", label: "Overlay", group: 3 },
  { value: "soft-light", label: "Soft light", group: 3 },
  { value: "hard-light", label: "Hard light", group: 3 },
  { value: "difference", label: "Difference", group: 4 },
  { value: "exclusion", label: "Exclusion", group: 4 },
  { value: "hue", label: "Hue", group: 5 },
  { value: "saturation", label: "Saturation", group: 5 },
  { value: "color", label: "Color", group: 5 },
  { value: "luminosity", label: "Luminosity", group: 5 }
] as const

export type BlendMode = (typeof blendModes)[number]["value"]
