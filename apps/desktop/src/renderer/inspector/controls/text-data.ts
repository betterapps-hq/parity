/*
 * Stand-in fonts for the text fields, with the faces each has: the project's fonts, which its font tokens name, and
 * fonts installed on this computer in place of Google Fonts, which the app would add to the project. The font tokens
 * themselves, and Tailwind v4's weight, leading, tracking and text size scales, are in tokens.ts. Blend modes are here
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

/** The project's fonts, which its font tokens name: Geist, as the app's own sans, and three more. */
export const projectFonts: FontFamily[] = [
  {
    name: "Geist",
    stack: '"Geist Variable", sans-serif',
    weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
    axis: [100, 900],
    italic: false
  },
  { name: "Georgia", stack: "Georgia, serif", weights: [400, 700], italic: true },
  { name: "Consolas", stack: "Consolas, monospace", weights: [400, 700], italic: true },
  { name: "Trebuchet MS", stack: '"Trebuchet MS", sans-serif', weights: [400, 700], italic: true }
]

/**
 * More fonts, after the project's. The app lists Google Fonts here and adds the one chosen to the project; this
 * prototype lists fonts installed on Windows, so each draws in its own face without a download.
 */
export const moreFonts: FontFamily[] = [
  { name: "Segoe UI", stack: '"Segoe UI", sans-serif', weights: [300, 400, 600, 700], italic: true },
  { name: "Arial", stack: "Arial, sans-serif", weights: [400, 700], italic: true },
  { name: "Verdana", stack: "Verdana, sans-serif", weights: [400, 700], italic: true },
  { name: "Palatino Linotype", stack: '"Palatino Linotype", serif', weights: [400, 700], italic: true },
  { name: "Times New Roman", stack: '"Times New Roman", serif', weights: [400, 700], italic: true },
  { name: "Courier New", stack: '"Courier New", monospace', weights: [400, 700], italic: true },
  { name: "Impact", stack: "Impact, sans-serif", weights: [400], italic: false }
]

export const allFonts = [...projectFonts, ...moreFonts]

/** A font by its first family's name, ignoring case and quotes. */
export function findFont(name: string): FontFamily | undefined {
  const bare = name.replaceAll(/["']/g, "").trim().toLowerCase()

  return allFonts.find(
    (font) => font.name.toLowerCase() === bare || (bare === "geist variable" && font.name === "Geist")
  )
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
