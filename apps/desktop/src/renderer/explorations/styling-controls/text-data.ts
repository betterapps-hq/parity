/*
 * Stand-in tokens and fonts for the text, keyword and opacity fields: the project's fonts (Geist, as the app's own
 * sans, and three more as font tokens), fonts installed on this computer in place of Google Fonts, which the app
 * would add to the project, and Tailwind v4's weight, leading, tracking and text size scales.
 */

export interface FontFamily {
  /** The first family, as it's shown. */
  name: string
  /** The whole stack, as CSS writes it. */
  stack: string
  /** The project's font token for it (`sans` is `--font-sans`), when it has one. */
  token?: string
  /** The weights it has a face for. */
  weights: number[]
  /** A variable font's weight axis. */
  axis?: [number, number]
  italic: boolean
}

/** The project's fonts, each a font token, first in the list. */
export const projectFonts: FontFamily[] = [
  {
    name: "Geist",
    stack: '"Geist Variable", sans-serif',
    token: "sans",
    weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
    axis: [100, 900],
    italic: false
  },
  { name: "Georgia", stack: "Georgia, serif", token: "serif", weights: [400, 700], italic: true },
  { name: "Consolas", stack: "Consolas, monospace", token: "mono", weights: [400, 700], italic: true },
  { name: "Trebuchet MS", stack: '"Trebuchet MS", sans-serif', token: "brand", weights: [400, 700], italic: true }
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
  if (families.includes("monospace")) return "monospace"
  if (families.includes("serif")) return "serif"
  return "sans-serif"
}

/** Tailwind's font-weight tokens, which name each hundred. */
export const weightTokens = [
  { name: "thin", value: 100, label: "Thin" },
  { name: "extralight", value: 200, label: "Extra light" },
  { name: "light", value: 300, label: "Light" },
  { name: "normal", value: 400, label: "Regular" },
  { name: "medium", value: 500, label: "Medium" },
  { name: "semibold", value: 600, label: "Semibold" },
  { name: "bold", value: 700, label: "Bold" },
  { name: "extrabold", value: 800, label: "Extra bold" },
  { name: "black", value: 900, label: "Black" }
] as const

/** A weight's name where it has one (Semibold), or its number. */
export function weightName(value: number): string {
  return weightTokens.find((token) => token.value === value)?.label ?? String(value)
}

/** Tailwind v4's text sizes, each with the line height it pairs; `display` is the project's, pairing more. */
export const sizeTokens = [
  { name: "xs", px: 12, lineHeight: 16 },
  { name: "sm", px: 14, lineHeight: 20 },
  { name: "base", px: 16, lineHeight: 24 },
  { name: "lg", px: 18, lineHeight: 28 },
  { name: "xl", px: 20, lineHeight: 28 },
  // A project size that pairs a weight and letter spacing too, so a line height beside it is its own class.
  { name: "display", px: 36, lineHeight: 40, pairsMore: true }
] as const

export type SizeToken = (typeof sizeTokens)[number]

/** Tailwind v4's leading tokens, as multiples. */
export const leadingTokens = [
  { name: "none", value: 1 },
  { name: "tight", value: 1.25 },
  { name: "snug", value: 1.375 },
  { name: "normal", value: 1.5 },
  { name: "relaxed", value: 1.625 },
  { name: "loose", value: 2 }
] as const

/** Tailwind v4's tracking tokens, in em. */
export const trackingTokens = [
  { name: "tighter", em: -0.05 },
  { name: "tight", em: -0.025 },
  { name: "normal", em: 0 },
  { name: "wide", em: 0.025 },
  { name: "wider", em: 0.05 },
  { name: "widest", em: 0.1 }
] as const

/** The project's opacity tokens. */
export const opacityTokens = [
  { name: "disabled", percent: 50 },
  { name: "muted", percent: 70 }
] as const

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
