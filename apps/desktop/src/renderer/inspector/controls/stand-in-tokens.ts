import type { ShadowLayer } from "./lists-data.ts"
/*
 * The exploration's stand-in tokens, every kind in one place, for the stories: shadcn's neutral theme's colors, as hex,
 * and Tailwind v4's radius, blur, shadow, text, leading, tracking and weight scales, with a few of the project's own
 * (spacing, stroke widths, layer order, durations, easings, gradients, opacities, cursors, containers, fonts). A story
 * gives them to its fields through `ProjectData`, as the Design tab gives the project's own; tokens made with Create
 * token are added in the story's state, never to these arrays, so one story's token doesn't leak into another. Nothing
 * in the live panel imports this file (stand-in-tokens.test.ts checks), and PAR-936 removes it.
 */
import {
  type ColorToken,
  colorToken,
  durationToken,
  type DurationToken,
  easingToken,
  type EasingToken,
  type FieldToken,
  fontToken,
  type FontToken,
  type GradientToken,
  gradientToken,
  leadingToken,
  type LeadingToken,
  type LengthToken,
  lengthToken,
  opacityToken,
  type OpacityToken,
  type ShadowToken,
  shadowToken,
  type SizeToken,
  tailwindWeights,
  type TokenSets,
  trackingToken,
  type TrackingToken,
  type WeightToken
} from "./tokens.ts"

/** shadcn's neutral theme, a few of Tailwind's palette shades, black and white, and a color the project replaced. */
export const colorTokens: ColorToken[] = [
  colorToken("background", "#ffffff"),
  colorToken("foreground", "#0a0a0a"),
  colorToken("card", "#ffffff"),
  colorToken("primary", "#171717"),
  colorToken("primary-foreground", "#fafafa"),
  colorToken("secondary", "#f5f5f5"),
  colorToken("muted", "#f5f5f5"),
  colorToken("muted-foreground", "#737373"),
  colorToken("accent", "#f5f5f5"),
  colorToken("destructive", "#e7000b"),
  colorToken("border", "#e5e5e5"),
  colorToken("ring", "#a1a1a1"),
  colorToken("chart-1", "#f54900"),
  colorToken("chart-2", "#009689"),
  colorToken("chart-3", "#104e64"),
  colorToken("chart-4", "#ffb900"),
  colorToken("chart-5", "#fe9a00"),
  // A few of the palette's shades, as a project with Tailwind's colors lists them after its semantic tokens.
  colorToken("blue-500", "#3b82f6"),
  colorToken("blue-600", "#2563eb"),
  colorToken("teal-600", "#0d9488"),
  colorToken("orange-600", "#ea580c"),
  colorToken("amber-400", "#fbbf24"),
  // Tailwind's black and white, which its shadows are drawn in.
  colorToken("black", "#000000"),
  colorToken("white", "#ffffff"),
  // An old brand color the project has replaced, kept so layers still using it draw and say so.
  colorToken("brand-blue", "#1d4ed8", "blue-600")
]

export const radiusTokens: LengthToken[] = [
  lengthToken("radius", "radius-xs", 2),
  lengthToken("radius", "radius-sm", 6),
  lengthToken("radius", "radius-md", 8),
  lengthToken("radius", "radius-lg", 10),
  lengthToken("radius", "radius-xl", 14),
  lengthToken("radius", "radius-2xl", 18),
  lengthToken("radius", "radius-full", 9999),
  // An old card radius the project has replaced with radius-xl.
  lengthToken("radius", "radius-card", 12, "radius-xl")
]

/** Tailwind's blur scale, for Layer blur and Background blur alike. */
export const blurTokens: LengthToken[] = [
  lengthToken("blur", "blur-xs", 4),
  lengthToken("blur", "blur-sm", 8),
  lengthToken("blur", "blur-md", 12),
  lengthToken("blur", "blur-lg", 16),
  lengthToken("blur", "blur-xl", 24),
  lengthToken("blur", "blur-2xl", 40),
  lengthToken("blur", "blur-3xl", 64)
]

/** The project's spacing tokens, beside Tailwind's steps: `--spacing-gutter` writes `p-gutter`. */
export const spacingTokens: LengthToken[] = [
  lengthToken("spacing", "spacing-inset", 16),
  lengthToken("spacing", "spacing-gutter", 24),
  lengthToken("spacing", "spacing-section", 64),
  // An old card padding the project has replaced with spacing-gutter.
  lengthToken("spacing", "spacing-card", 20, "spacing-gutter")
]

export const borderWidthTokens: LengthToken[] = [
  lengthToken("border-width", "border-width-hairline", 1),
  lengthToken("border-width", "border-width-thick", 3)
]

const layer = (name: string, order: number): LengthToken => ({
  name,
  kind: "z-index",
  value: String(order),
  detail: String(order),
  px: order
})

/** Layer order's tokens, in the order they stack; `px` is the count. */
export const zIndexTokens: LengthToken[] = [
  layer("z-raised", 10),
  layer("z-dropdown", 20),
  layer("z-sticky", 30),
  layer("z-overlay", 40),
  layer("z-modal", 50),
  layer("z-toast", 60)
]

/** The project's container sizes, which a width's expression can name. */
export const containerTokens: LengthToken[] = [
  lengthToken("container", "container-sm", 384),
  lengthToken("container", "container-md", 448),
  lengthToken("container", "container-lg", 512)
]

/** Tailwind's breakpoints, the widths a design's frame is drawn at. */
export const breakpointTokens: LengthToken[] = [
  lengthToken("breakpoint", "breakpoint-sm", 640),
  lengthToken("breakpoint", "breakpoint-md", 768),
  lengthToken("breakpoint", "breakpoint-lg", 1024),
  lengthToken("breakpoint", "breakpoint-xl", 1280),
  lengthToken("breakpoint", "breakpoint-2xl", 1536)
]

/** A project's duration tokens; a project without them leaves every whole millisecond unmarked. */
export const durationTokens: DurationToken[] = [
  durationToken("duration-fast", 150),
  durationToken("duration-normal", 250),
  durationToken("duration-slow", 400)
]

/** The project's easing tokens. */
export const easingTokens: EasingToken[] = [
  easingToken("ease-snappy", [0.2, 0.8, 0.2, 1]),
  easingToken("ease-gentle", [0.33, 0, 0.15, 1])
]

/** Tailwind's shadow color: black at the token's alpha. */
const part = (x: number, y: number, blur: number, spread: number, alpha: number): ShadowLayer => ({
  x,
  y,
  blur,
  spread,
  color: "black",
  alpha
})

export const shadowTokens: ShadowToken[] = [
  shadowToken("shadow", "shadow-2xs", [part(0, 1, 0, 0, 5)], colorTokens),
  shadowToken("shadow", "shadow-xs", [part(0, 1, 2, 0, 5)], colorTokens),
  shadowToken("shadow", "shadow-sm", [part(0, 1, 3, 0, 10), part(0, 1, 2, -1, 10)], colorTokens),
  shadowToken("shadow", "shadow-md", [part(0, 4, 6, -1, 10), part(0, 2, 4, -2, 10)], colorTokens),
  shadowToken("shadow", "shadow-lg", [part(0, 10, 15, -3, 10), part(0, 4, 6, -4, 10)], colorTokens),
  shadowToken("shadow", "shadow-xl", [part(0, 20, 25, -5, 10), part(0, 8, 10, -6, 10)], colorTokens),
  shadowToken("shadow", "shadow-2xl", [part(0, 25, 50, -12, 25)], colorTokens)
]

export const insetShadowTokens: ShadowToken[] = [
  shadowToken("inset-shadow", "inset-shadow-2xs", [part(0, 1, 0, 0, 5)], colorTokens),
  shadowToken("inset-shadow", "inset-shadow-xs", [part(0, 1, 1, 0, 5)], colorTokens),
  shadowToken("inset-shadow", "inset-shadow-sm", [part(0, 2, 4, 0, 5)], colorTokens)
]

export const dropShadowTokens: ShadowToken[] = [
  shadowToken("drop-shadow", "drop-shadow-xs", [part(0, 1, 1, 0, 5)], colorTokens),
  shadowToken("drop-shadow", "drop-shadow-sm", [part(0, 1, 2, 0, 15)], colorTokens),
  shadowToken("drop-shadow", "drop-shadow-md", [part(0, 3, 3, 0, 12)], colorTokens),
  shadowToken("drop-shadow", "drop-shadow-lg", [part(0, 4, 4, 0, 15)], colorTokens),
  shadowToken("drop-shadow", "drop-shadow-xl", [part(0, 9, 7, 0, 10)], colorTokens),
  shadowToken("drop-shadow", "drop-shadow-2xl", [part(0, 25, 25, 0, 15)], colorTokens)
]

export const textShadowTokens: ShadowToken[] = [
  shadowToken("text-shadow", "text-shadow-2xs", [part(0, 1, 0, 0, 15)], colorTokens),
  shadowToken("text-shadow", "text-shadow-xs", [part(0, 1, 1, 0, 20)], colorTokens),
  shadowToken(
    "text-shadow",
    "text-shadow-sm",
    [part(0, 1, 0, 0, 7.5), part(0, 1, 1, 0, 7.5), part(0, 2, 2, 0, 7.5)],
    colorTokens
  ),
  shadowToken(
    "text-shadow",
    "text-shadow-md",
    [part(0, 1, 1, 0, 10), part(0, 1, 2, 0, 10), part(0, 2, 4, 0, 10)],
    colorTokens
  ),
  shadowToken(
    "text-shadow",
    "text-shadow-lg",
    [part(0, 1, 2, 0, 10), part(0, 3, 2, 0, 10), part(0, 4, 8, 0, 10)],
    colorTokens
  )
]

export const gradientTokens: GradientToken[] = [
  gradientToken(
    "gradient-brand",
    {
      kind: "linear",
      angle: 90,
      stops: [
        { id: "brand-1", position: 0, color: "blue-500" },
        { id: "brand-2", position: 100, color: "teal-600" }
      ]
    },
    colorTokens
  ),
  gradientToken(
    "gradient-sunset",
    {
      kind: "linear",
      angle: 135,
      stops: [
        { id: "sunset-1", position: 0, color: "chart-4" },
        { id: "sunset-2", position: 50, color: "chart-5" },
        { id: "sunset-3", position: 100, color: "chart-1" }
      ]
    },
    colorTokens
  )
]

/* Text */
/** The project's font tokens: Geist, as the app's own sans, and three more (`sans` is `--font-sans`). */
export const fontTokens: FontToken[] = [
  fontToken("sans", "Geist", '"Geist Variable", sans-serif'),
  fontToken("serif", "Georgia", "Georgia, serif"),
  fontToken("mono", "Consolas", "Consolas, monospace"),
  fontToken("brand", "Trebuchet MS", '"Trebuchet MS", sans-serif')
]

/** Tailwind's font-weight tokens, which name each hundred. */
export const weightTokens: WeightToken[] = tailwindWeights

const size = (name: string, px: number, lineHeight: number): SizeToken => ({
  name,
  kind: "font-size",
  value: `${px}px`,
  detail: `${px}px`,
  px,
  lineHeight
})

/** Tailwind v4's text sizes, each with the line height it pairs; `display` is the project's, pairing more. */
export const sizeTokens: SizeToken[] = [
  size("xs", 12, 16),
  size("sm", 14, 20),
  size("base", 16, 24),
  size("lg", 18, 28),
  size("xl", 20, 28),
  // A project size that pairs a weight and letter spacing too, so a line height beside it is its own class.
  { ...size("display", 36, 40), pairsMore: true }
]

/** Tailwind v4's leading tokens, as multiples. */
export const leadingTokens: LeadingToken[] = [
  leadingToken("none", 1),
  leadingToken("tight", 1.25),
  leadingToken("snug", 1.375),
  leadingToken("normal", 1.5),
  leadingToken("relaxed", 1.625),
  leadingToken("loose", 2)
]

/** Tailwind v4's tracking tokens, in em. */
export const trackingTokens: TrackingToken[] = [
  trackingToken("tighter", -0.05),
  trackingToken("tight", -0.025),
  trackingToken("normal", 0),
  trackingToken("wide", 0.025),
  trackingToken("wider", 0.05),
  trackingToken("widest", 0.1)
]

/** The project's opacity tokens. */
export const opacityTokens: OpacityToken[] = [opacityToken("disabled", 50), opacityToken("muted", 70)]

/* Interaction */

const cursor = (name: string, value: string): FieldToken => ({ name, kind: "cursor", value, detail: value })

/** The project's cursor tokens and the cursors they hold. */
export const cursorTokens: FieldToken[] = [cursor("cursor-interactive", "pointer"), cursor("cursor-busy", "progress")]

/**
 * The length tokens an expression can name, in pixels: Tailwind's spacing step, the containers, two text sizes and a
 * radius, by the custom property's name without `--`.
 */
export const lengthVars = Object.fromEntries([
  ["spacing", 4],
  ...containerTokens.map((token) => [token.name, token.px] as const),
  ...sizeTokens.flatMap((token) =>
    ["base", "xl"].includes(token.name) ? [[`text-${token.name}`, token.px] as const] : []
  ),
  ...radiusTokens.flatMap((token) => (token.name === "radius-lg" ? [[token.name, token.px] as const] : []))
])

/** Every stand-in set, by name, as a story's `ProjectData` starts. */
export const standInTokenSets: TokenSets = {
  color: colorTokens,
  radius: radiusTokens,
  blur: blurTokens,
  spacing: spacingTokens,
  borderWidth: borderWidthTokens,
  zIndex: zIndexTokens,
  container: containerTokens,
  breakpoint: breakpointTokens,
  duration: durationTokens,
  easing: easingTokens,
  shadow: shadowTokens,
  insetShadow: insetShadowTokens,
  dropShadow: dropShadowTokens,
  textShadow: textShadowTokens,
  gradient: gradientTokens,
  weight: weightTokens,
  size: sizeTokens,
  leading: leadingTokens,
  tracking: trackingTokens,
  opacity: opacityTokens,
  cursor: cursorTokens,
  font: fontTokens
}
