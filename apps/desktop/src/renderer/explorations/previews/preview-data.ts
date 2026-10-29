import type { TokenCategory } from "@parity/core"

/**
 * How a token is drawn. Parity files tokens by category; a preview needs to know more, since Effects holds blurs and
 * aspect ratios, Shadows holds four kinds of shadow, and Other holds z-indexes, opacities, border widths and cursors.
 * The kind comes from the category, the name and the value, as `previewKind` in the proposal says.
 */
export type PreviewKind =
  | "color"
  | "spacing"
  | "radius"
  | "border-width"
  | "border"
  | "shadow"
  | "inset-shadow"
  | "drop-shadow"
  | "text-shadow"
  | "font"
  | "font-size"
  | "font-weight"
  | "leading"
  | "tracking"
  | "opacity"
  | "blur"
  | "backdrop-blur"
  | "perspective"
  | "aspect"
  | "duration"
  | "easing"
  | "animation"
  | "z-index"
  | "breakpoint"
  | "container"
  | "cursor"
  | "number"

export interface SampleToken {
  /** The custom property, without `--`. */
  name: string
  kind: PreviewKind
  /** Where Parity files it today. */
  category: TokenCategory
  source: "semantic" | "theme"
  /** Its value per theme: `default` is the root (light). */
  values: Record<string, string>
  /** What a value that references other tokens comes to, as `resolveTokenValue` gives it. */
  resolved?: string
  /** The tokens it goes through on the way, as `radius-lg` goes through `radius`. */
  via?: string[]
  /** What a `.lib.par` says about it, and which library. */
  description?: string
  library?: string
  /** How many layers use it, across the project's designs. */
  uses?: number
}

const theme = (
  kind: PreviewKind,
  category: TokenCategory,
  entries: [name: string, value: string, resolved?: string][]
): SampleToken[] =>
  entries.map(([name, value, resolved]) => ({
    name,
    kind,
    category,
    source: "theme",
    values: { default: value },
    ...(resolved ? { resolved, via: [value.match(/var\(--([\w-]+)\)/)?.[1] ?? ""].filter(Boolean) } : {})
  }))

/** The example's own colors, light and dark, as shadcn writes them. */
export const projectColors: SampleToken[] = (
  [
    ["background", "oklch(1 0 0)", "oklch(0.145 0 0)", 61],
    ["foreground", "oklch(0.145 0 0)", "oklch(0.985 0 0)", 212],
    ["card", "oklch(1 0 0)", "oklch(0.205 0 0)", 22],
    ["primary", "oklch(0.205 0 0)", "oklch(0.922 0 0)", 48],
    ["primary-foreground", "oklch(0.985 0 0)", "oklch(0.205 0 0)", 41],
    ["secondary", "oklch(0.97 0 0)", "oklch(0.269 0 0)", 12],
    ["muted", "oklch(0.97 0 0)", "oklch(0.269 0 0)", 33],
    ["muted-foreground", "oklch(0.556 0 0)", "oklch(0.708 0 0)", 187],
    ["accent", "oklch(0.97 0 0)", "oklch(0.269 0 0)", 9],
    ["destructive", "oklch(0.577 0.245 27.325)", "oklch(0.704 0.191 22.216)", 6],
    ["border", "oklch(0.922 0 0)", "oklch(1 0 0 / 10%)", 96],
    ["input", "oklch(0.922 0 0)", "oklch(1 0 0 / 15%)", 14],
    ["ring", "oklch(0.708 0 0)", "oklch(0.556 0 0)", 0]
  ] as const
).map(([name, light, dark, uses]) => ({
  name,
  kind: "color",
  category: "color",
  source: "semantic",
  values: { default: light, dark },
  uses
}))

const shades = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950"]
const lightness = [0.97, 0.936, 0.885, 0.808, 0.704, 0.637, 0.577, 0.505, 0.444, 0.396, 0.258]
const chroma = [0.014, 0.032, 0.062, 0.114, 0.191, 0.237, 0.245, 0.213, 0.177, 0.141, 0.092]

/** A few of Tailwind's hues, shade by shade, for the palette grid. */
export const palette: SampleToken[] = (
  [
    ["red", 25],
    ["amber", 75],
    ["emerald", 162],
    ["sky", 237],
    ["violet", 293]
  ] as const
).flatMap(([hue, angle]) =>
  shades.map((shade, index) => ({
    name: `color-${hue}-${shade}`,
    kind: "color" as const,
    category: "color" as const,
    source: "theme" as const,
    values: { default: `oklch(${lightness[index]} ${(chroma[index]! * 0.8).toFixed(3)} ${angle})` }
  }))
)

export const spacing: SampleToken[] = [
  { name: "spacing", kind: "spacing", category: "spacing", source: "theme", values: { default: "0.25rem" }, uses: 0 },
  ...[1, 2, 3, 4, 6, 8, 12, 16, 24].map((step): SampleToken => ({
    name: `spacing-${step}`,
    kind: "spacing",
    category: "spacing",
    source: "theme",
    values: { default: `calc(var(--spacing) * ${step})` },
    resolved: `${step * 4}px`,
    via: ["spacing"]
  })),
  // Longer than a row can draw at its true size.
  {
    name: "spacing-sidebar",
    kind: "spacing",
    category: "spacing",
    source: "theme",
    values: { default: "16rem" },
    description: "The sidebar's width.",
    uses: 3
  }
]

/** The example's radius scale, built on its `--radius`. */
export const radii: SampleToken[] = [
  { name: "radius", kind: "radius", category: "radius", source: "semantic", values: { default: "0.625rem" }, uses: 0 },
  ...theme("radius", "radius", [
    ["radius-sm", "calc(var(--radius) * 0.6)", "6px"],
    ["radius-md", "calc(var(--radius) * 0.8)", "8px"],
    ["radius-lg", "var(--radius)", "10px"],
    ["radius-xl", "calc(var(--radius) * 1.4)", "14px"],
    ["radius-2xl", "calc(var(--radius) * 1.8)", "18px"],
    ["radius-4xl", "calc(var(--radius) * 2.6)", "26px"]
  ])
]

export const shadows: SampleToken[] = [
  ...theme("shadow", "shadow", [
    ["shadow-2xs", "0 1px rgb(0 0 0 / 0.05)"],
    ["shadow-xs", "0 1px 2px 0 rgb(0 0 0 / 0.05)"],
    ["shadow-sm", "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)"],
    ["shadow-md", "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)"],
    ["shadow-lg", "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)"],
    ["shadow-xl", "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)"],
    ["shadow-2xl", "0 25px 50px -12px rgb(0 0 0 / 0.25)"]
  ]),
  ...theme("inset-shadow", "shadow", [
    ["inset-shadow-xs", "inset 0 1px 1px rgb(0 0 0 / 0.05)"],
    ["inset-shadow-sm", "inset 0 2px 4px rgb(0 0 0 / 0.05)"]
  ]),
  ...theme("drop-shadow", "shadow", [
    ["drop-shadow-sm", "0 1px 2px rgb(0 0 0 / 0.15)"],
    ["drop-shadow-lg", "0 4px 4px rgb(0 0 0 / 0.15)"],
    ["drop-shadow-2xl", "0 25px 25px rgb(0 0 0 / 0.15)"]
  ]),
  ...theme("text-shadow", "shadow", [
    ["text-shadow-xs", "0px 1px 1px rgb(0 0 0 / 0.2)"],
    ["text-shadow-lg", "0px 1px 2px rgb(0 0 0 / 0.1), 0px 3px 2px rgb(0 0 0 / 0.1), 0px 4px 8px rgb(0 0 0 / 0.1)"]
  ])
]

export const fonts: SampleToken[] = [
  {
    name: "font-sans",
    kind: "font",
    category: "font",
    source: "semantic",
    values: { default: "'Geist Variable', sans-serif" },
    uses: 61
  },
  {
    name: "font-heading",
    kind: "font",
    category: "font",
    source: "semantic",
    values: { default: "var(--font-sans)" },
    resolved: "'Geist Variable', sans-serif",
    via: ["font-sans"],
    uses: 18
  },
  ...theme("font", "font", [
    ["font-serif", 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif'],
    ["font-mono", 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace']
  ])
]

export const fontSizes: SampleToken[] = theme("font-size", "font-size", [
  ["text-xs", "0.75rem"],
  ["text-sm", "0.875rem"],
  ["text-base", "1rem"],
  ["text-lg", "1.125rem"],
  ["text-xl", "1.25rem"],
  ["text-2xl", "1.5rem"],
  ["text-4xl", "2.25rem"],
  ["text-6xl", "3.75rem"]
])

export const fontWeights: SampleToken[] = theme("font-weight", "font-weight", [
  ["font-weight-light", "300"],
  ["font-weight-normal", "400"],
  ["font-weight-medium", "500"],
  ["font-weight-semibold", "600"],
  ["font-weight-bold", "700"],
  ["font-weight-black", "900"]
])

export const leadings: SampleToken[] = theme("leading", "leading", [
  ["leading-tight", "1.25"],
  ["leading-snug", "1.375"],
  ["leading-normal", "1.5"],
  ["leading-relaxed", "1.625"],
  ["leading-loose", "2"]
])

export const trackings: SampleToken[] = theme("tracking", "tracking", [
  ["tracking-tighter", "-0.05em"],
  ["tracking-tight", "-0.025em"],
  ["tracking-normal", "0em"],
  ["tracking-wide", "0.025em"],
  ["tracking-widest", "0.1em"]
])

/** Fluent's stroke widths and Chakra's borders, which Parity files under Other today. */
export const borders: SampleToken[] = [
  ...(
    [
      ["strokeWidthThin", "1px"],
      ["strokeWidthThick", "2px"],
      ["strokeWidthThicker", "3px"],
      ["strokeWidthThickest", "4px"]
    ] as const
  ).map(([name, value]): SampleToken => ({
    name,
    kind: "border-width",
    category: "other",
    source: "theme",
    values: { default: value },
    library: "Fluent UI"
  })),
  ...(
    [
      ["chakra-borders-xs", "0.5px solid"],
      ["chakra-borders-md", "2px solid"]
    ] as const
  ).map(([name, value]): SampleToken => ({
    name,
    kind: "border",
    category: "other",
    source: "theme",
    values: { default: value },
    library: "Chakra UI"
  }))
]

/** A project's own opacities. Tailwind has no opacity scale, so they're the project's, under Other today. */
export const opacities: SampleToken[] = (
  [
    ["opacity-disabled", "0.5", "Controls that can't be used"],
    ["opacity-muted", "0.7", "Secondary icons and helper text"],
    ["opacity-scrim", "0.8", "Behind dialogs and sheets"]
  ] as const
).map(([name, value, description]) => ({
  name,
  kind: "opacity",
  category: "other",
  source: "semantic",
  values: { default: value },
  description
}))

export const effects: SampleToken[] = [
  ...theme("blur", "effect", [
    ["blur-xs", "4px"],
    ["blur-sm", "8px"],
    ["blur-md", "12px"],
    ["blur-xl", "24px"],
    ["blur-3xl", "64px"]
  ]),
  ...theme("backdrop-blur", "effect", [
    ["backdrop-blur-sm", "8px"],
    ["backdrop-blur-lg", "16px"]
  ]),
  ...theme("perspective", "effect", [
    ["perspective-dramatic", "100px"],
    ["perspective-normal", "500px"],
    ["perspective-distant", "1200px"]
  ]),
  ...theme("aspect", "effect", [
    ["aspect-video", "16 / 9"],
    ["aspect-square", "1 / 1"],
    ["aspect-portrait", "3 / 4"],
    ["aspect-ultrawide", "18 / 5"]
  ])
]

/** Fluent's durations, read from its `.lib.par`. */
export const durations: SampleToken[] = (
  [
    ["durationUltraFast", "50ms", "Micro interactions such as a checkbox"],
    ["durationFaster", "100ms", "Hover and press feedback"],
    ["durationFast", "150ms", "Small elements entering"],
    ["durationNormal", "200ms", "The default for most transitions"],
    ["durationGentle", "250ms", "Larger surfaces"],
    ["durationSlow", "300ms", "Panels and drawers"],
    ["durationUltraSlow", "500ms", "Page-level changes"]
  ] as const
).map(([name, value, description]) => ({
  name,
  kind: "duration",
  category: "motion",
  source: "theme",
  values: { default: value },
  description,
  library: "Fluent UI"
}))

export const easings: SampleToken[] = [
  ...theme("easing", "motion", [
    ["ease-in", "cubic-bezier(0.4, 0, 1, 1)"],
    ["ease-out", "cubic-bezier(0, 0, 0.2, 1)"],
    ["ease-in-out", "cubic-bezier(0.4, 0, 0.2, 1)"]
  ]),
  {
    name: "curveDecelerateMax",
    kind: "easing",
    category: "motion",
    source: "theme",
    values: { default: "cubic-bezier(0.1, 0.9, 0.2, 1)" },
    description: "Things arriving: fast, then settling",
    library: "Fluent UI"
  },
  {
    name: "ease-spring",
    kind: "easing",
    category: "motion",
    source: "semantic",
    values: {
      default: "linear(0, 0.18 7%, 0.62 17%, 0.96 27%, 1.1 34%, 1.12 39%, 1.06 49%, 0.99 60%, 0.98 69%, 1.003 85%, 1)"
    },
    uses: 4
  }
]

export const animations: SampleToken[] = [
  ...theme("animation", "motion", [
    ["animate-spin", "spin 1s linear infinite"],
    ["animate-ping", "ping 1s cubic-bezier(0, 0, 0.2, 1) infinite"],
    ["animate-pulse", "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite"],
    ["animate-bounce", "bounce 1s infinite"]
  ]),
  {
    name: "animate-fade-in",
    kind: "animation",
    category: "motion",
    source: "semantic",
    values: { default: "fade-in 150ms ease-out" },
    uses: 7
  }
]

/** Chakra's z-index scale, under Other today. Listed top layer first, as they stack. */
export const zIndexes: SampleToken[] = (
  [
    ["tooltip", 1800],
    ["toast", 1700],
    ["popover", 1500],
    ["modal", 1400],
    ["overlay", 1300],
    ["sticky", 1100],
    ["dropdown", 1000],
    ["docked", 10],
    ["base", 0],
    ["hide", -1]
  ] as const
).map(([name, value]) => ({
  name: `chakra-z-index-${name}`,
  kind: "z-index",
  category: "other",
  source: "theme",
  values: { default: String(value) },
  library: "Chakra UI"
}))

export const breakpoints: SampleToken[] = theme("breakpoint", "breakpoint", [
  ["breakpoint-sm", "40rem"],
  ["breakpoint-md", "48rem"],
  ["breakpoint-lg", "64rem"],
  ["breakpoint-xl", "80rem"],
  ["breakpoint-2xl", "96rem"]
])

export const containers: SampleToken[] = theme("container", "container", [
  ["container-xs", "20rem"],
  ["container-md", "28rem"],
  ["container-2xl", "42rem"],
  ["container-4xl", "56rem"],
  ["container-7xl", "80rem"]
])

export const others: SampleToken[] = [
  ...(
    [
      ["chakra-cursor-button", "pointer"],
      ["chakra-cursor-disabled", "not-allowed"],
      ["chakra-cursor-option", "default"]
    ] as const
  ).map(([name, value]): SampleToken => ({
    name,
    kind: "cursor",
    category: "other",
    source: "theme",
    values: { default: value },
    library: "Chakra UI"
  })),
  {
    name: "mantine-scale",
    kind: "number",
    category: "other",
    source: "theme",
    values: { default: "1" },
    library: "Mantine",
    description: "Multiplies Mantine's sizes"
  }
]

/** The Tokens panel's sections, in order, each with the kinds it holds and a heading for each kind when it holds more. */
export const tokenSections: { title: string; kinds: { kind: PreviewKind; heading?: string }[] }[] = [
  { title: "Colors", kinds: [{ kind: "color" }] },
  { title: "Fonts", kinds: [{ kind: "font" }] },
  { title: "Font sizes", kinds: [{ kind: "font-size" }] },
  { title: "Font weights", kinds: [{ kind: "font-weight" }] },
  { title: "Line height", kinds: [{ kind: "leading" }] },
  { title: "Letter spacing", kinds: [{ kind: "tracking" }] },
  { title: "Spacing", kinds: [{ kind: "spacing" }] },
  { title: "Radius", kinds: [{ kind: "radius" }] },
  {
    title: "Borders",
    kinds: [
      { kind: "border-width", heading: "Widths" },
      { kind: "border", heading: "Width and style" }
    ]
  },
  {
    title: "Shadows",
    kinds: [
      { kind: "shadow", heading: "Box" },
      { kind: "inset-shadow", heading: "Inset" },
      { kind: "drop-shadow", heading: "Drop" },
      { kind: "text-shadow", heading: "Text" }
    ]
  },
  { title: "Opacity", kinds: [{ kind: "opacity" }] },
  {
    title: "Blur",
    kinds: [
      { kind: "blur", heading: "Layer" },
      { kind: "backdrop-blur", heading: "Backdrop" }
    ]
  },
  {
    title: "Motion",
    kinds: [
      { kind: "duration", heading: "Durations" },
      { kind: "easing", heading: "Easing" },
      { kind: "animation", heading: "Animations" }
    ]
  },
  { title: "Layers", kinds: [{ kind: "z-index" }] },
  { title: "Breakpoints", kinds: [{ kind: "breakpoint" }] },
  { title: "Containers", kinds: [{ kind: "container" }] },
  { title: "Aspect ratios", kinds: [{ kind: "aspect" }] },
  { title: "Perspective", kinds: [{ kind: "perspective" }] },
  { title: "Cursors", kinds: [{ kind: "cursor" }] },
  { title: "Other", kinds: [{ kind: "number" }] }
]

/** Every sample token, project colors first. */
export const allTokens: SampleToken[] = [
  ...projectColors,
  ...palette,
  ...fonts,
  ...fontSizes,
  ...fontWeights,
  ...leadings,
  ...trackings,
  ...spacing,
  ...radii,
  ...borders,
  ...shadows,
  ...opacities,
  ...effects,
  ...durations,
  ...easings,
  ...animations,
  ...zIndexes,
  ...breakpoints,
  ...containers,
  ...others
]

export function tokensOfKind(kind: PreviewKind, from: SampleToken[] = allTokens): SampleToken[] {
  return from.filter((token) => token.kind === kind)
}

/** A token by its name. */
export function token(name: string): SampleToken {
  const found = allTokens.find((candidate) => candidate.name === name)
  if (!found) throw new Error(`No sample token named ${name}`)
  return found
}

/** The value a token draws with: what its references come to, else its own. */
export function drawn(token: SampleToken, themeName = "default"): string {
  return themeName === "default" ? (token.resolved ?? token.values.default!) : (token.values[themeName] ?? "")
}

const reference = /var\(\s*--([\w-]+)\s*(?:,([^()]*))?\)/g

/** The tokens a value refers to with `var()`, in order. */
export function references(value: string): string[] {
  return [...value.matchAll(reference)].map((match) => match[1]!)
}

/**
 * A value with each `var()` replaced by what its token comes to, as the browser would: `calc(var(--radius) * 0.8)`
 * becomes `calc(0.625rem * 0.8)`. A reference to no token takes its fallback, or stays as written.
 */
export function substituted(value: string): string {
  return value.replace(reference, (whole, name: string, fallback?: string) => {
    const found = allTokens.find((candidate) => candidate.name === name)
    return found ? drawn(found) : (fallback?.trim() ?? whole)
  })
}

/**
 * Each kind's Tailwind theme namespace and the utilities that read it, each with what it sets. A token named in the
 * namespace (`radius-md`) gets the utility Tailwind makes for it (`rounded-md`); any other gets the utility with the
 * variable (`z-(--chakra-z-index-modal)`).
 */
const utilities: Partial<Record<PreviewKind, [namespace: string, utilities: [utility: string, sets: string][]]>> = {
  color: [
    "color-",
    [
      ["bg", "Background"],
      ["text", "Text"],
      ["border", "Border"]
    ]
  ],
  spacing: [
    "spacing-",
    [
      ["p", "Padding"],
      ["gap", "Gap"],
      ["w", "Width"]
    ]
  ],
  radius: ["radius-", [["rounded", "Corner radius"]]],
  "border-width": ["", [["border", "Border width"]]],
  shadow: ["shadow-", [["shadow", "Shadow"]]],
  "inset-shadow": ["inset-shadow-", [["inset-shadow", "Inset shadow"]]],
  "drop-shadow": ["drop-shadow-", [["drop-shadow", "Drop shadow"]]],
  "text-shadow": ["text-shadow-", [["text-shadow", "Text shadow"]]],
  font: ["font-", [["font", "Font"]]],
  "font-size": ["text-", [["text", "Font size"]]],
  "font-weight": ["font-weight-", [["font", "Font weight"]]],
  leading: ["leading-", [["leading", "Line height"]]],
  tracking: ["tracking-", [["tracking", "Letter spacing"]]],
  opacity: ["", [["opacity", "Opacity"]]],
  blur: ["blur-", [["blur", "Blur"]]],
  "backdrop-blur": ["backdrop-blur-", [["backdrop-blur", "Backdrop blur"]]],
  perspective: ["perspective-", [["perspective", "Perspective"]]],
  aspect: ["aspect-", [["aspect", "Aspect ratio"]]],
  duration: ["", [["duration", "Duration"]]],
  easing: ["ease-", [["ease", "Easing"]]],
  animation: ["animate-", [["animate", "Animation"]]],
  "z-index": ["", [["z", "Stacking"]]],
  container: ["container-", [["max-w", "Max width"]]],
  cursor: ["", [["cursor", "Cursor"]]]
}

/**
 * What copying a token gives: its name as CSS writes it, `--radius-md`. Parity's fields take it (the name with or
 * without the dashes, never `var()`), and it reads as a token, not a class, in a message to the agent.
 */
export const cssName = (token: SampleToken) => `--${token.name}`

/** One way to write a token in code: in CSS or with Tailwind, saying what it sets, and the text itself. */
export interface CodeForm {
  group: "CSS" | "Tailwind"
  label: string
  text: string
}

/**
 * The ways to write a token in code, for the detail's Copy as menu: `var()`, which works anywhere CSS does, then the
 * Tailwind classes that use it. A breakpoint or container width is a query instead (`@media (width >= 48rem)`, `md:`),
 * as `var()` can't go in one.
 */
export function codeFor(token: SampleToken): CodeForm[] {
  const css: CodeForm = { group: "CSS", label: "Variable", text: `var(--${token.name})` }
  const step = (namespace: string) => (token.name.startsWith(namespace) ? token.name.slice(namespace.length) : "")
  if (token.kind === "breakpoint") {
    return [
      { group: "CSS", label: "Media query", text: `@media (width >= ${drawn(token)})` },
      { group: "Tailwind", label: "Variant", text: `${step("breakpoint-")}:` }
    ]
  }
  if (token.kind === "border") return [css, { group: "Tailwind", label: "Border", text: `[border:${css.text}]` }]
  const [namespace, names] = utilities[token.kind] ?? ["", []]
  const named = (namespace && step(namespace)) || undefined
  // A project's own colors reach Tailwind through `@theme inline`, by their own names (`bg-primary`).
  const own = named ?? (token.kind === "color" ? token.name : undefined)
  const classes = names.map(([utility, label]): CodeForm => ({
    group: "Tailwind",
    label,
    text: own
      ? `${utility}-${own}`
      : token.kind === "border-width"
        ? `${utility}-(length:--${token.name})`
        : `${utility}-(--${token.name})`
  }))
  if (token.kind === "container" && named) {
    classes.push({ group: "Tailwind", label: "Container query", text: `@${named}:` })
  }
  // The spacing scale's base is what its steps are made of, not a length a class sets.
  return token.kind === "spacing" && !named ? [css] : [css, ...classes]
}

/** A length in pixels, from px, rem or em, or from anything else the browser can work out, such as `calc()`. */
export function px(value: string): number {
  const match = /^(-?[\d.]+)(px|rem|em)?$/.exec(value.trim())
  if (!match) return measured(value)
  return Number(match[1]) * (match[2] === "rem" || match[2] === "em" ? 16 : 1)
}

const lengths = new Map<string, number>()

/** A length the browser works out, by laying out an element that wide once; NaN when it isn't a length. */
function measured(value: string): number {
  const known = lengths.get(value)
  if (known !== undefined) return known
  if (typeof document === "undefined" || !CSS.supports("width", value)) return Number.NaN
  const probe = document.createElement("div")
  probe.style.cssText = `position: absolute; visibility: hidden; width: ${value}`
  document.body.append(probe)
  const length = probe.getBoundingClientRect().width
  probe.remove()
  lengths.set(value, length)
  return length
}

/** A duration in milliseconds, from ms or s. */
export function ms(value: string): number {
  const match = /^([\d.]+)(ms|s)$/.exec(value.trim())
  return match ? Number(match[1]) * (match[2] === "s" ? 1000 : 1) : Number.NaN
}

/**
 * How a component's preview stands: not made yet, being made, made, made but out of date while a new one is made, or
 * why it can't be made.
 */
export type PreviewState =
  | "queued"
  | "making"
  | "ready"
  | "stale"
  | "failed"
  | "needs-props"
  | "needs-provider"
  | "server-only"
  | "draws-nothing"

/** Which drawing stands in for a component's bitmap in the explorations. */
export type ArtName =
  | "button"
  | "button-outline"
  | "badge"
  | "card"
  | "input"
  | "label"
  | "tabs"
  | "avatar"
  | "table"
  | "empty"
  | "separator"
  | "member-row"
  | "stat-card"
  | "plan-card"
  | "project-card"
  | "activity-item"
  | "usage-meter"
  | "notification-item"
  | "invoice-row"
  | "top-bar"
  | "page-team"
  | "page-dashboard"

export interface SampleComponent {
  id: string
  name: string
  /** Where it's defined, or the design it's a component design in. */
  file: string
  /** The Components panel's group: component designs, the UI kit, the app by folder, or pages. */
  group: "designs" | "kit" | "app" | "pages"
  /** A heading inside the group: the file for a kit, the folder for the app, the route for a page. */
  family?: string
  state: PreviewState
  art?: ArtName
  /** Its size as drawn, in CSS pixels. */
  size?: [width: number, height: number]
  variants?: Record<string, string[]>
  props?: string[]
  stories?: number
  /** Why it failed, or what it needs: the props without a value, or the provider. */
  problem?: string
  needs?: string[]
  /** Instances across the project's designs. */
  uses?: number
  /** How long ago its bitmap was made. */
  made?: string
}

export const components: SampleComponent[] = [
  {
    id: "design:member-row",
    name: "Member row",
    file: "shadcn-vite.par",
    group: "designs",
    state: "ready",
    art: "member-row",
    size: [560, 56],
    props: ["name", "email", "role"],
    uses: 6,
    made: "From its board"
  },
  {
    id: "design:stat-card",
    name: "Stat card",
    file: "shadcn-vite.par",
    group: "designs",
    state: "ready",
    art: "stat-card",
    size: [240, 120],
    props: ["label", "value", "change"],
    uses: 4,
    made: "From its board"
  },
  {
    id: "design:plan-card",
    name: "Plan card",
    file: "shadcn-vite.par",
    group: "designs",
    state: "stale",
    art: "plan-card",
    size: [280, 300],
    variants: { tone: ["Plain", "Featured"] },
    props: ["name", "price", "cta"],
    uses: 3,
    made: "Updating after an edit"
  },
  {
    id: "design:project-card",
    name: "Project card",
    file: "shadcn-vite.par",
    group: "designs",
    state: "ready",
    art: "project-card",
    size: [300, 160],
    uses: 8,
    made: "From its board"
  },
  {
    id: "design:activity-item",
    name: "Activity item",
    file: "shadcn-vite.par",
    group: "designs",
    state: "ready",
    art: "activity-item",
    size: [360, 52],
    uses: 5,
    made: "From its board"
  },
  {
    id: "design:usage-meter",
    name: "Usage meter",
    file: "shadcn-vite.par",
    group: "designs",
    state: "ready",
    art: "usage-meter",
    size: [320, 64],
    uses: 3,
    made: "From its board"
  },
  {
    id: "src/components/ui/button.tsx#Button",
    name: "Button",
    file: "src/components/ui/button.tsx",
    group: "kit",
    family: "button",
    state: "ready",
    art: "button",
    size: [84, 36],
    variants: {
      variant: ["default", "destructive", "outline", "secondary", "ghost", "link"],
      size: ["default", "sm", "lg", "icon"]
    },
    props: ["asChild"],
    stories: 6,
    uses: 48,
    made: "2 min ago"
  },
  {
    id: "src/components/ui/badge.tsx#Badge",
    name: "Badge",
    file: "src/components/ui/badge.tsx",
    group: "kit",
    family: "badge",
    state: "ready",
    art: "badge",
    size: [52, 22],
    variants: { variant: ["default", "secondary", "destructive", "outline"] },
    stories: 4,
    uses: 31,
    made: "2 min ago"
  },
  {
    id: "src/components/ui/card.tsx#Card",
    name: "Card",
    file: "src/components/ui/card.tsx",
    group: "kit",
    family: "card",
    state: "ready",
    art: "card",
    size: [320, 180],
    stories: 2,
    uses: 22,
    made: "2 min ago"
  },
  {
    id: "src/components/ui/input.tsx#Input",
    name: "Input",
    file: "src/components/ui/input.tsx",
    group: "kit",
    family: "input",
    state: "ready",
    art: "input",
    size: [240, 36],
    uses: 17,
    made: "2 min ago"
  },
  {
    id: "src/components/ui/label.tsx#Label",
    name: "Label",
    file: "src/components/ui/label.tsx",
    group: "kit",
    family: "label",
    state: "ready",
    art: "label",
    size: [96, 20],
    uses: 15,
    made: "2 min ago"
  },
  {
    id: "src/components/ui/tabs.tsx#Tabs",
    name: "Tabs",
    file: "src/components/ui/tabs.tsx",
    group: "kit",
    family: "tabs",
    state: "making",
    art: "tabs",
    size: [260, 36],
    uses: 4
  },
  {
    id: "src/components/ui/avatar.tsx#Avatar",
    name: "Avatar",
    file: "src/components/ui/avatar.tsx",
    group: "kit",
    family: "avatar",
    state: "queued",
    art: "avatar",
    size: [32, 32],
    uses: 12
  },
  {
    id: "src/components/ui/table.tsx#Table",
    name: "Table",
    file: "src/components/ui/table.tsx",
    group: "kit",
    family: "table",
    state: "queued",
    art: "table",
    size: [480, 160],
    uses: 3
  },
  {
    id: "src/components/ui/empty.tsx#Empty",
    name: "Empty",
    file: "src/components/ui/empty.tsx",
    group: "kit",
    family: "empty",
    state: "ready",
    art: "empty",
    size: [360, 220],
    uses: 2,
    made: "2 min ago"
  },
  {
    id: "src/components/ui/separator.tsx#Separator",
    name: "Separator",
    file: "src/components/ui/separator.tsx",
    group: "kit",
    family: "separator",
    state: "ready",
    art: "separator",
    size: [240, 1],
    uses: 9,
    made: "2 min ago"
  },
  {
    id: "src/components/team/member-list.tsx#MemberRow",
    name: "MemberRow",
    file: "src/components/team/member-list.tsx",
    group: "app",
    family: "components/team",
    state: "needs-props",
    props: ["member", "onRemove"],
    needs: ["member"],
    problem: "TypeError: Cannot read properties of undefined (reading 'name')",
    uses: 0
  },
  {
    id: "src/components/theme-toggle.tsx#ThemeToggle",
    name: "ThemeToggle",
    file: "src/components/theme-toggle.tsx",
    group: "app",
    family: "components",
    state: "needs-provider",
    needs: ["ThemeProvider"],
    problem: "useTheme must be used within a ThemeProvider",
    uses: 1
  },
  {
    id: "src/components/reports/revenue-chart.tsx#RevenueChart",
    name: "RevenueChart",
    file: "src/components/reports/revenue-chart.tsx",
    group: "app",
    family: "components/reports",
    state: "failed",
    problem:
      "TypeError: Cannot read properties of undefined (reading 'map')\n    at RevenueChart (revenue-chart.tsx:18:22)",
    uses: 1
  },
  {
    id: "src/components/billing/invoice-pdf.tsx#InvoicePdf",
    name: "InvoicePdf",
    file: "src/components/billing/invoice-pdf.tsx",
    group: "app",
    family: "components/billing",
    state: "server-only",
    problem: 'Module "node:fs" has been externalized for browser compatibility',
    uses: 0
  },
  {
    id: "src/components/billing/invoice-row.tsx#InvoiceRow",
    name: "InvoiceRow",
    file: "src/components/billing/invoice-row.tsx",
    group: "app",
    family: "components/billing",
    state: "ready",
    art: "invoice-row",
    size: [520, 48],
    props: ["invoice"],
    stories: 1,
    uses: 2,
    made: "2 min ago"
  },
  {
    id: "src/components/inbox/notification-item.tsx#NotificationItem",
    name: "NotificationItem",
    file: "src/components/inbox/notification-item.tsx",
    group: "app",
    family: "components/inbox",
    state: "ready",
    art: "notification-item",
    size: [380, 64],
    uses: 3,
    made: "2 min ago"
  },
  {
    id: "src/components/app-top-bar.tsx#AppTopBar",
    name: "AppTopBar",
    file: "src/components/app-top-bar.tsx",
    group: "app",
    family: "components",
    state: "ready",
    art: "top-bar",
    size: [1280, 56],
    uses: 14,
    made: "2 min ago"
  },
  {
    id: "src/components/theme-provider.tsx#ThemeProvider",
    name: "ThemeProvider",
    file: "src/components/theme-provider.tsx",
    group: "app",
    family: "components",
    state: "draws-nothing",
    uses: 0
  },
  {
    id: "src/App.tsx#App",
    name: "App",
    file: "src/App.tsx",
    group: "pages",
    family: "/",
    state: "ready",
    art: "page-dashboard",
    size: [1280, 800],
    uses: 0,
    made: "4 min ago"
  },
  {
    id: "src/routes/team.tsx#TeamPage",
    name: "TeamPage",
    file: "src/routes/team.tsx",
    group: "pages",
    family: "/team",
    state: "ready",
    art: "page-team",
    size: [1280, 800],
    uses: 0,
    made: "4 min ago"
  }
]

export function component(name: string): SampleComponent {
  const found = components.find((candidate) => candidate.name === name)
  if (!found) throw new Error(`No sample component named ${name}`)
  return found
}

export const groupTitles: Record<SampleComponent["group"], string> = {
  designs: "Component designs",
  kit: "UI kit",
  app: "shadcn-vite",
  pages: "Pages"
}
