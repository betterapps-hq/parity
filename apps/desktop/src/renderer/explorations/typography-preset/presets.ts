// The typography presets of four of the repository's fixture projects, as their libraries define them, and what a text
// layer with one applied stores and writes. Values are the libraries' own, read from the versions the fixtures install:
// Fluent's `typographyStyles` (@fluentui/tokens), Material UI 9's default theme run through `responsiveFontSizes`, and
// Chakra UI 3's `textStyles`. No Tailwind fixture defines a preset, so the Tailwind project has Tailwind's documented
// `--text-tiny` and a DTCG typography token from `@parity-app/tokens`' tests.

import type { Token } from "@parity-app/tokens"

/** What a typography preset can set, each one of the Text section's rows. */
export type TypeField = "font" | "weight" | "size" | "lineHeight" | "letterSpacing" | "case"

export type LineHeight = { px: number } | { multiple: number }
export type LetterSpacing = { em: number } | { px: number }
export type TextCase = "uppercase" | "lowercase" | "capitalize" | "none"

interface TypeValueMap {
  font: string
  weight: number
  size: number
  lineHeight: LineHeight
  letterSpacing: LetterSpacing
  case: TextCase
}

export type TypeValue<F extends TypeField = TypeField> = TypeValueMap[F]
export type TypeValues = Partial<TypeValueMap>

/** The rows a preset can cover, in the Text section's order. */
export const typeFields: { field: TypeField; label: string }[] = [
  { field: "font", label: "Font" },
  { field: "weight", label: "Weight" },
  { field: "size", label: "Size" },
  { field: "lineHeight", label: "Line height" },
  { field: "letterSpacing", label: "Letter spacing" },
  { field: "case", label: "Case" }
]

export const fieldLabel = (field: TypeField) => typeFields.find((entry) => entry.field === field)!.label

export type ViewportId = "mobile" | "tablet" | "laptop" | "desktop"

/** The viewports a design shows, from the Modes panel, narrowest first: a viewport's patch applies from it up. */
export const viewports: { id: ViewportId; name: string; width: number }[] = [
  { id: "mobile", name: "Mobile", width: 390 },
  { id: "tablet", name: "Tablet", width: 768 },
  { id: "laptop", name: "Laptop", width: 1024 },
  { id: "desktop", name: "Desktop", width: 1440 }
]

export interface Preset {
  name: string
  /** Where it comes from, in the library's own words. */
  source: string
  values: TypeValues
  /** What it changes from a viewport width up, as the project's CSS redefines it there. */
  from?: { width: number; values: TypeValues }[]
}

export type ProjectId = "fluent" | "mui" | "chakra" | "tailwind"

export interface PresetProject {
  id: ProjectId
  name: string
  fixture: string
  /** The library's own name, for its adapter's code. A Tailwind project has only Tailwind's. */
  library?: string
  /** Fonts the project loads, by name, with the stack each is written as. */
  fonts: { name: string; stack: string; token?: string }[]
  /** What a text layer inherits when neither a preset nor the layer sets it. */
  inherited: TypeValueMap
  colors: Token[]
  presets: Preset[]
  /** The breakpoints Tailwind's variants use in this project, narrowest first. */
  breakpoints: { prefix: string; width: number }[]
  /** The preset the stories start with. */
  initial: string
}

const color = (name: string, value: string): Token => ({
  name,
  category: "color",
  source: "semantic",
  values: { default: value }
})

const tailwindBreakpoints = [
  { prefix: "sm", width: 640 },
  { prefix: "md", width: 768 },
  { prefix: "lg", width: 1024 },
  { prefix: "xl", width: 1280 }
]

const segoe = `"Segoe UI", "Segoe UI Web (West European)", -apple-system, BlinkMacSystemFont, Roboto, "Helvetica Neue", sans-serif`

const fluentSource = "Fluent's typographyStyles"
const fluent = (name: string, size: number, lineHeight: number, weight: number): Preset => ({
  name,
  source: fluentSource,
  values: { font: "Segoe UI", size, weight, lineHeight: { px: lineHeight } }
})

const roboto = `"Roboto", "Helvetica", "Arial", sans-serif`
const muiSource = "Material UI's typography variants"
const mui = (
  name: string,
  weight: number,
  size: number,
  lineHeight: number,
  letterSpacing: number,
  sizes?: [number, number, number],
  textCase?: TextCase
): Preset => ({
  name,
  source: muiSource,
  values: {
    font: "Roboto",
    weight,
    size,
    lineHeight: { multiple: lineHeight },
    letterSpacing: { em: letterSpacing },
    ...(textCase && { case: textCase })
  },
  // responsiveFontSizes grows a heading's size at MUI's sm, md and lg breakpoints.
  ...(sizes && {
    from: [
      { width: 600, values: { size: sizes[0] } },
      { width: 900, values: { size: sizes[1] } },
      { width: 1200, values: { size: sizes[2] } }
    ].filter((step, index, steps) => step.values.size !== (steps[index - 1]?.values.size ?? size))
  })
})

const chakraSource = "Chakra's textStyles"
const chakra = (name: string, size: number, lineHeight: number, extra: TypeValues = {}): Preset => ({
  name,
  source: chakraSource,
  values: { size, lineHeight: { px: lineHeight }, ...extra }
})
const tight = { letterSpacing: { em: -0.025 } } satisfies TypeValues

export const projects: PresetProject[] = [
  {
    id: "fluent",
    name: "Fluent",
    fixture: "fixtures/fluent",
    library: "Fluent",
    fonts: [{ name: "Segoe UI", stack: segoe, token: "fontFamilyBase" }],
    inherited: {
      font: "Segoe UI",
      size: 14,
      weight: 400,
      lineHeight: { px: 20 },
      letterSpacing: { em: 0 },
      case: "none"
    },
    colors: [
      color("colorNeutralForeground1", "#242424"),
      color("colorNeutralForeground3", "#616161"),
      color("colorBrandForeground1", "#0f6cbd")
    ],
    presets: [
      fluent("caption2", 10, 14, 400),
      fluent("caption2Strong", 10, 14, 600),
      fluent("caption1", 12, 16, 400),
      fluent("caption1Strong", 12, 16, 600),
      fluent("caption1Stronger", 12, 16, 700),
      fluent("body1", 14, 20, 400),
      fluent("body1Strong", 14, 20, 600),
      fluent("body1Stronger", 14, 20, 700),
      fluent("body2", 16, 22, 400),
      fluent("subtitle2", 16, 22, 600),
      fluent("subtitle2Stronger", 16, 22, 700),
      fluent("subtitle1", 20, 28, 600),
      fluent("title3", 24, 32, 600),
      fluent("title2", 28, 36, 600),
      fluent("title1", 32, 40, 600),
      fluent("largeTitle", 40, 52, 600),
      fluent("display", 68, 92, 600)
    ],
    breakpoints: tailwindBreakpoints,
    initial: "subtitle1"
  },
  {
    id: "mui",
    name: "Material UI",
    fixture: "fixtures/mui",
    library: "Material UI",
    fonts: [{ name: "Roboto", stack: roboto }],
    inherited: {
      font: "Roboto",
      size: 16,
      weight: 400,
      lineHeight: { multiple: 1.5 },
      letterSpacing: { em: 0.00938 },
      case: "none"
    },
    colors: [
      color("text.primary", "rgba(0, 0, 0, 0.87)"),
      color("text.secondary", "rgba(0, 0, 0, 0.6)"),
      color("primary.main", "#1976d2")
    ],
    presets: [
      mui("h1", 300, 56, 1.167, -0.01562, [75.41, 85.69, 96]),
      mui("h2", 300, 38, 1.2, -0.00833, [50, 53.33, 60]),
      mui("h3", 400, 32, 1.167, 0, [41.13, 44.56, 48]),
      mui("h4", 400, 25, 1.235, 0.00735, [29.15, 32.39, 34]),
      mui("h5", 400, 20, 1.334, 0, [20.99, 23.99, 24]),
      mui("h6", 500, 18, 1.6, 0.0075, [20, 20, 20]),
      mui("subtitle1", 400, 16, 1.75, 0.00938),
      mui("subtitle2", 500, 14, 1.57, 0.00714),
      mui("body1", 400, 16, 1.5, 0.00938),
      mui("body2", 400, 14, 1.43, 0.01071),
      mui("button", 500, 14, 1.75, 0.02857, undefined, "uppercase"),
      mui("caption", 400, 12, 1.66, 0.03333),
      mui("overline", 400, 12, 2.66, 0.08333, undefined, "uppercase")
    ],
    breakpoints: [
      { prefix: "sm", width: 600 },
      { prefix: "md", width: 900 },
      { prefix: "lg", width: 1200 }
    ],
    initial: "h4"
  },
  {
    id: "chakra",
    name: "Chakra",
    fixture: "fixtures/chakra",
    library: "Chakra",
    fonts: [
      {
        name: "Inter",
        stack: `Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif`,
        token: "body"
      },
      { name: "SF Mono", stack: `SFMono-Regular, Menlo, Monaco, Consolas, monospace`, token: "mono" }
    ],
    inherited: {
      font: "Inter",
      size: 16,
      weight: 400,
      lineHeight: { multiple: 1.5 },
      letterSpacing: { em: 0 },
      case: "none"
    },
    colors: [color("fg", "#09090b"), color("fg.muted", "#52525b"), color("blue.fg", "#1d4ed8")],
    presets: [
      chakra("2xs", 10, 12),
      chakra("xs", 12, 16),
      chakra("sm", 14, 20),
      chakra("md", 16, 24),
      chakra("lg", 18, 28),
      chakra("xl", 20, 30),
      chakra("2xl", 24, 32),
      chakra("3xl", 30, 38),
      chakra("4xl", 36, 44, tight),
      chakra("5xl", 48, 60, tight),
      chakra("6xl", 60, 72, tight),
      chakra("7xl", 72, 92, tight),
      chakra("label", 14, 20, { weight: 500 })
    ],
    breakpoints: [
      { prefix: "sm", width: 480 },
      { prefix: "md", width: 768 },
      { prefix: "lg", width: 1024 },
      { prefix: "xl", width: 1280 }
    ],
    initial: "lg"
  },
  {
    id: "tailwind",
    name: "Tailwind",
    fixture: "fixtures/buildkit",
    fonts: [
      { name: "Geist", stack: `"Geist Variable", sans-serif`, token: "font-sans" },
      { name: "Geist Mono", stack: `"Geist Mono Variable", monospace`, token: "font-mono" }
    ],
    inherited: {
      font: "Geist",
      size: 16,
      weight: 400,
      lineHeight: { multiple: 1.5 },
      letterSpacing: { em: 0 },
      case: "none"
    },
    colors: [
      color("foreground", "oklch(0.145 0 0)"),
      color("muted-foreground", "oklch(0.556 0 0)"),
      color("primary", "oklch(0.205 0 0)")
    ],
    presets: [
      {
        name: "tiny",
        source: "Tailwind's @theme",
        values: { size: 10, lineHeight: { px: 24 }, letterSpacing: { px: 2 }, weight: 500 }
      },
      {
        name: "body",
        source: "tokens.json",
        values: { font: "Geist", size: 16, weight: 600, lineHeight: { multiple: 1.5 } }
      }
    ],
    breakpoints: tailwindBreakpoints,
    initial: "body"
  }
]

export const projectById = (id: ProjectId) => projects.find((project) => project.id === id)!

export const presetByName = (project: PresetProject, name: string | undefined) =>
  project.presets.find((preset) => preset.name === name)

/** A text layer's text style: a preset, and the layer's own values, which override the preset where it sets them. */
export interface TextLayer {
  preset?: string
  /** The layer's own type, per viewport, mobile first: each wider viewport holds only what changes there. */
  own: Partial<Record<ViewportId, TypeValues>>
  color?: string
  align?: "start" | "center" | "end" | "justify"
  italic?: boolean
  decoration?: "underline" | "line-through"
}

export function layerWith(preset: string | undefined): TextLayer {
  return { preset, own: {} }
}

const widthOf = (viewport: ViewportId) => viewports.find((entry) => entry.id === viewport)!.width
const viewportsUpTo = (viewport: ViewportId) => viewports.filter((entry) => entry.width <= widthOf(viewport))

/** What a preset sets in a viewport. */
export function presetAt(preset: Preset, viewport: ViewportId): TypeValues {
  const width = widthOf(viewport)
  return Object.assign(
    {},
    preset.values,
    ...(preset.from ?? []).filter((step) => step.width <= width).map((step) => step.values)
  ) as TypeValues
}

/** Every field a preset sets, in any viewport. */
export function coveredBy(preset: Preset | undefined): Set<TypeField> {
  if (!preset) return new Set()
  return new Set(
    [preset.values, ...(preset.from ?? []).map((step) => step.values)].flatMap(
      (values) => Object.keys(values) as TypeField[]
    )
  )
}

/** Where a row's value comes from in a viewport. */
export type Source =
  | { kind: "preset" }
  | { kind: "override"; from: ViewportId }
  | { kind: "own"; from: ViewportId }
  | { kind: "inherited" }

export interface Shown<F extends TypeField = TypeField> {
  value: TypeValue<F> | undefined
  source: Source
}

/** What one row shows in a viewport, and where it comes from: the layer's own value, else the preset's, else inherited. */
export function shownAt<F extends TypeField>(
  project: PresetProject,
  layer: TextLayer,
  viewport: ViewportId,
  field: F
): Shown<F> {
  const preset = presetByName(project, layer.preset)
  const set = setIn(layer, viewport, field)
  if (set) {
    const value = layer.own[set.id]![field] as TypeValue<F>
    return { value, source: { kind: preset && coveredBy(preset).has(field) ? "override" : "own", from: set.id } }
  }
  if (preset && coveredBy(preset).has(field)) {
    return { value: presetAt(preset, viewport)[field] as TypeValue<F>, source: { kind: "preset" } }
  }
  return { value: (project.inherited as TypeValues)[field] as TypeValue<F> | undefined, source: { kind: "inherited" } }
}

/** Every type value the layer comes to in a viewport, for drawing it. */
export function typeAt(project: PresetProject, layer: TextLayer, viewport: ViewportId): TypeValues {
  return Object.fromEntries(
    typeFields.map(({ field }) => [field, shownAt(project, layer, viewport, field).value])
  ) as TypeValues
}

/** Whether a row's value differs between viewports, which a dot after its label says. */
export function differsByViewport(project: PresetProject, layer: TextLayer, field: TypeField): boolean {
  const values = viewports.map((viewport) => JSON.stringify(shownAt(project, layer, viewport.id, field).value))
  return new Set(values).size > 1
}

/** Each viewport's value for a row, for its hint: "Mobile 25, Tablet 29.15, Laptop 32.39, Desktop 34". */
export function valuesByViewport(project: PresetProject, layer: TextLayer, field: TypeField): string {
  return viewports
    .map((viewport) => `${viewport.name} ${formatValue(field, shownAt(project, layer, viewport.id, field).value)}`)
    .join(", ")
}

/** How many of the layer's own values override its preset, across viewports. */
export function overrideCount(project: PresetProject, layer: TextLayer): number {
  const covered = coveredBy(presetByName(project, layer.preset))
  return Object.values(layer.own).reduce(
    (count, values) => count + Object.keys(values ?? {}).filter((field) => covered.has(field as TypeField)).length,
    0
  )
}

/** Sets one of the layer's own values in a viewport, which applies from it up. */
export function setOwn<F extends TypeField>(
  layer: TextLayer,
  viewport: ViewportId,
  field: F,
  value: TypeValue<F> | undefined
): TextLayer {
  const values: TypeValues = { ...layer.own[viewport] }
  if (value === undefined) delete values[field]
  else values[field] = value
  return { ...layer, own: { ...layer.own, [viewport]: values } }
}

/** Takes back the value a row shows in a viewport, where it was set, so the preset's shows again. */
export function resetOwn(layer: TextLayer, viewport: ViewportId, field: TypeField): TextLayer {
  const set = setIn(layer, viewport, field)
  return set ? setOwn(layer, set.id, field, undefined) : layer
}

/** The viewport whose patch sets the layer's own value for a row in a viewport: that one, or the nearest narrower. */
function setIn(layer: TextLayer, viewport: ViewportId, field: TypeField) {
  return viewportsUpTo(viewport).findLast((entry) => layer.own[entry.id]?.[field] !== undefined)
}

/** Takes back every override of the preset, keeping the layer's values for what the preset doesn't set. */
export function resetOverrides(project: PresetProject, layer: TextLayer): TextLayer {
  const covered = coveredBy(presetByName(project, layer.preset))
  return {
    ...layer,
    own: Object.fromEntries(
      Object.entries(layer.own).map(([viewport, values]) => [
        viewport,
        Object.fromEntries(Object.entries(values ?? {}).filter(([field]) => !covered.has(field as TypeField)))
      ])
    )
  }
}

/** Applies a preset: it fills in the fields it covers, so the layer's own values for those go. */
export function applyPreset(project: PresetProject, layer: TextLayer, name: string | undefined): TextLayer {
  const next = { ...layer, preset: name }
  return name ? resetOverrides(project, next) : next
}

/** Detaches the preset: the layer keeps what it shows in every viewport, as values of its own. */
export function detach(project: PresetProject, layer: TextLayer): TextLayer {
  const preset = presetByName(project, layer.preset)
  if (!preset) return layer
  const own: TextLayer["own"] = {}
  let below: TypeValues = {}
  for (const viewport of viewports) {
    const shown: TypeValues = {}
    for (const field of coveredBy(preset)) {
      const value = shownAt(project, layer, viewport.id, field).value
      if (value !== undefined) Object.assign(shown, { [field]: value })
    }
    // Mobile first: a wider viewport keeps only what changes there.
    const changed = Object.fromEntries(
      Object.entries(shown).filter(
        ([field, value]) => JSON.stringify(below[field as TypeField]) !== JSON.stringify(value)
      )
    )
    const kept = Object.fromEntries(
      Object.entries(layer.own[viewport.id] ?? {}).filter(([field]) => !coveredBy(preset).has(field as TypeField))
    )
    if (Object.keys(changed).length + Object.keys(kept).length > 0) own[viewport.id] = { ...kept, ...changed }
    below = { ...below, ...shown }
  }
  return { ...layer, preset: undefined, own }
}

const weightNames: Record<number, string> = {
  100: "Thin",
  200: "Extra light",
  300: "Light",
  400: "Regular",
  500: "Medium",
  600: "Semibold",
  700: "Bold",
  800: "Extra bold",
  900: "Black"
}

export const weights = Object.entries(weightNames).map(([weight, name]) => ({ weight: Number(weight), name }))

export const weightName = (weight: number) => weightNames[weight] ?? String(weight)

export const caseNames: Record<TextCase, string> = {
  none: "As typed",
  uppercase: "Uppercase",
  lowercase: "Lowercase",
  capitalize: "Title case"
}

const number = (value: number) => String(Math.round(value * 100) / 100)

/** A small number such as an em letter spacing, to five places. */
const exact = (value: number) => String(Math.round(value * 100_000) / 100_000)

/** A line height in pixels, at a size. */
export const lineHeightPx = (lineHeight: LineHeight, size: number) =>
  "px" in lineHeight ? lineHeight.px : lineHeight.multiple * size

/** A value as its row shows it. */
export function formatValue(field: TypeField, value: TypeValue | undefined): string {
  if (value === undefined) return "None"
  switch (field) {
    case "font":
      return value as string
    case "weight":
      return weightName(value as number)
    case "size":
      return number(value as number)
    case "lineHeight": {
      const lineHeight = value as LineHeight
      return "px" in lineHeight ? number(lineHeight.px) : exact(lineHeight.multiple)
    }
    case "letterSpacing": {
      const spacing = value as LetterSpacing
      return "px" in spacing ? `${number(spacing.px)}px` : `${number(spacing.em * 100)}%`
    }
    case "case":
      return caseNames[value as TextCase]
  }
}

/** A preset's one-line summary, as Figma's styles read: "Segoe UI 20/28 Semibold". */
export function summary(project: PresetProject, values: TypeValues): string {
  const size = values.size ?? project.inherited.size
  const parts = [
    values.font,
    values.size !== undefined &&
      (values.lineHeight ? `${number(size)}/${number(lineHeightPx(values.lineHeight, size))}` : number(size)),
    values.weight !== undefined && weightName(values.weight)
  ]
  return parts.filter(Boolean).join(" ")
}

export const fontStack = (project: PresetProject, font: string | undefined) =>
  project.fonts.find((entry) => entry.name === font)?.stack ?? font

// ---- What it stores ----

type Stored = Record<string, unknown>

function storedValue(field: TypeField, value: TypeValue): unknown {
  switch (field) {
    case "font":
      return { value }
    case "weight":
      return { value }
    case "size":
      return { value, unit: "px" }
    case "lineHeight": {
      const lineHeight = value as LineHeight
      return "px" in lineHeight ? { value: lineHeight.px, unit: "px" } : { value: lineHeight.multiple }
    }
    case "letterSpacing": {
      const spacing = value as LetterSpacing
      return "px" in spacing ? { value: spacing.px, unit: "px" } : { value: spacing.em, unit: "em" }
    }
    case "case":
      return { keyword: value }
  }
}

function storedValues(values: TypeValues | undefined): Stored {
  return Object.fromEntries(
    typeFields
      .filter(({ field }) => values?.[field] !== undefined)
      .map(({ field }) => [field, storedValue(field, values![field]!)])
  )
}

/**
 * What the layer stores, the same in every project: the preset by name, then each of its own values in the form it
 * takes, and each wider viewport's patch with only what changes there. An override is a value set beside a preset.
 */
export function stored(layer: TextLayer): Stored {
  const style: Stored = {
    ...(layer.preset && { typePreset: { token: layer.preset } }),
    ...storedValues(layer.own.mobile),
    ...(layer.color && { color: { token: layer.color } }),
    ...(layer.align && { textAlign: { keyword: layer.align } })
  }
  const patches = Object.fromEntries(
    viewports
      .slice(1)
      .filter((viewport) => Object.keys(layer.own[viewport.id] ?? {}).length > 0)
      .map((viewport) => [viewport.id, storedValues(layer.own[viewport.id])])
  )
  return { style, ...(Object.keys(patches).length > 0 && { viewports: patches }) }
}

/** Which of the stored lines are overrides, for marking them in the code. */
export function overrideFields(project: PresetProject, layer: TextLayer): Set<TypeField> {
  const covered = coveredBy(presetByName(project, layer.preset))
  return new Set(
    Object.values(layer.own).flatMap((values) =>
      (Object.keys(values ?? {}) as TypeField[]).filter((field) => covered.has(field))
    )
  )
}

// ---- What Tailwind writes ----

/** A line of code, marked when it holds an override. */
export interface CodeLine {
  text: string
  override?: boolean
}

const fontWeightClass: Record<number, string> = {
  100: "font-thin",
  200: "font-extralight",
  300: "font-light",
  400: "font-normal",
  500: "font-medium",
  600: "font-semibold",
  700: "font-bold",
  800: "font-extrabold",
  900: "font-black"
}

const leadingNames: Record<number, string> = {
  1: "none",
  1.25: "tight",
  1.375: "snug",
  1.5: "normal",
  1.625: "relaxed",
  2: "loose"
}
const trackingNames: Record<number, string> = {
  [-0.05]: "tighter",
  [-0.025]: "tight",
  0: "normal",
  0.025: "wide",
  0.05: "wider",
  0.1: "widest"
}

function fontClass(project: PresetProject, font: string): string {
  const entry = project.fonts.find((candidate) => candidate.name === font)
  return entry?.token?.startsWith("font-")
    ? entry.token
    : `font-[${(entry?.stack ?? font).split(",")[0]!.replaceAll(" ", "_")}]`
}

function tailwindClass(project: PresetProject, field: TypeField, value: TypeValue): string {
  switch (field) {
    case "font":
      return fontClass(project, value as string)
    case "weight":
      return fontWeightClass[value as number] ?? `font-[${value as number}]`
    case "size":
      return `text-[${number(value as number)}px]`
    case "lineHeight": {
      const lineHeight = value as LineHeight
      if ("px" in lineHeight)
        return lineHeight.px % 4 === 0 ? `leading-${lineHeight.px / 4}` : `leading-[${number(lineHeight.px)}px]`
      return leadingNames[lineHeight.multiple]
        ? `leading-${leadingNames[lineHeight.multiple]}`
        : `leading-[${exact(lineHeight.multiple)}]`
    }
    case "letterSpacing": {
      const spacing = value as LetterSpacing
      if ("px" in spacing) return `tracking-[${number(spacing.px)}px]`
      return trackingNames[spacing.em] ? `tracking-${trackingNames[spacing.em]}` : `tracking-[${exact(spacing.em)}em]`
    }
    case "case":
      return value === "none" ? "normal-case" : (value as string)
  }
}

/** The Tailwind variant a viewport's patch is written under, by the project's breakpoints. */
function variantOf(project: PresetProject, viewport: ViewportId): string | undefined {
  return project.breakpoints.findLast((breakpoint) => breakpoint.width <= widthOf(viewport))?.prefix
}

/**
 * How Tailwind writes a preset: a `--text-*` size that pairs a weight or letter spacing is `text-<name>`; one that names
 * a font, sets case, or pairs only a line height (which Tailwind reads as a plain size) is a project utility.
 */
function writtenAsUtility(preset: Preset): boolean {
  const covered = coveredBy(preset)
  return covered.has("font") || covered.has("case") || !(covered.has("weight") || covered.has("letterSpacing"))
}

export const presetClass = (preset: Preset) =>
  writtenAsUtility(preset) ? `type-${preset.name}` : `text-${preset.name}`

const cssValue = (project: PresetProject, field: TypeField, value: TypeValue): [string, string] => {
  switch (field) {
    case "font":
      return ["font-family", fontStack(project, value as string)!]
    case "weight":
      return ["font-weight", String(value as number)]
    case "size":
      return ["font-size", `${number(value as number)}px`]
    case "lineHeight": {
      const lineHeight = value as LineHeight
      return ["line-height", "px" in lineHeight ? `${number(lineHeight.px)}px` : exact(lineHeight.multiple)]
    }
    case "letterSpacing": {
      const spacing = value as LetterSpacing
      return ["letter-spacing", "px" in spacing ? `${number(spacing.px)}px` : `${spacing.em}em`]
    }
    case "case":
      return ["text-transform", value as string]
  }
}

const themeSuffix: Partial<Record<TypeField, string>> = {
  lineHeight: "--line-height",
  letterSpacing: "--letter-spacing",
  weight: "--font-weight"
}

/** The project CSS a preset's class reads, which Parity writes from the library's preset. */
function presetDefinition(project: PresetProject, preset: Preset): CodeLine[] {
  const declarations = (values: TypeValues) =>
    typeFields
      .filter(({ field }) => values[field] !== undefined)
      .map(({ field }) => cssValue(project, field, values[field]!))
  if (writtenAsUtility(preset)) {
    return [
      { text: `@utility type-${preset.name} {` },
      ...declarations(preset.values).map(([property, value]) => ({ text: `  ${property}: ${value};` })),
      ...(preset.from ?? []).flatMap((step) => [
        { text: `  @media (width >= ${step.width}px) {` },
        ...declarations(step.values).map(([property, value]) => ({ text: `    ${property}: ${value};` })),
        { text: "  }" }
      ]),
      { text: "}" }
    ]
  }
  return [
    { text: "@theme {" },
    ...typeFields
      .filter(({ field }) => preset.values[field] !== undefined)
      .map(({ field }) => {
        const [, value] = cssValue(project, field, preset.values[field]!)
        return { text: `  --text-${preset.name}${themeSuffix[field] ?? ""}: ${value};` }
      }),
    { text: "}" }
  ]
}

/** What Tailwind writes for the layer: its class list, then the project CSS its preset's class reads. */
export function tailwindCode(project: PresetProject, layer: TextLayer): CodeLine[] {
  const preset = presetByName(project, layer.preset)
  const covered = coveredBy(preset)
  const classes: CodeLine[] = []
  if (preset) classes.push({ text: presetClass(preset) })
  for (const viewport of viewports) {
    const values = layer.own[viewport.id] ?? {}
    const variant = viewport.id === "mobile" ? undefined : variantOf(project, viewport.id)
    for (const { field } of typeFields) {
      const value = values[field]
      if (value === undefined) continue
      const written = tailwindClass(project, field, value)
      classes.push({ text: variant ? `${variant}:${written}` : written, override: covered.has(field) })
    }
  }
  if (layer.color) classes.push({ text: `text-(--${layer.color.replaceAll(".", "-")})` })
  if (layer.align) classes.push({ text: `text-${layer.align}` })
  if (layer.italic) classes.push({ text: "italic" })
  if (layer.decoration) classes.push({ text: layer.decoration })
  const lines: CodeLine[] = [
    { text: "<p" },
    ...classes.map((line, index) => ({
      text: `${index === 0 ? '  class="' : "    "}${line.text}${index === classes.length - 1 ? '">' : ""}`,
      override: line.override
    }))
  ]
  if (classes.length === 0) lines.splice(0, 1, { text: "<p>" })
  return preset ? [...lines, { text: "" }, { text: "/* index.css */" }, ...presetDefinition(project, preset)] : lines
}

// ---- What the library's own adapter would write (PAR-708) ----

function fluentValue(field: TypeField, value: TypeValue): string {
  switch (field) {
    case "font":
      return "tokens.fontFamilyBase"
    case "weight":
      return String(value as number)
    case "case":
      return JSON.stringify(value)
    default: {
      const [, css] = cssValue(projectById("fluent"), field, value)
      return JSON.stringify(css)
    }
  }
}

/** A type field's CSS-in-JS property, as Fluent, Material UI and Chakra all name them. */
const jsProperty: Record<TypeField, string> = {
  font: "fontFamily",
  weight: "fontWeight",
  size: "fontSize",
  lineHeight: "lineHeight",
  letterSpacing: "letterSpacing",
  case: "textTransform"
}

/** The key a library's responsive object gives the narrowest viewport. */
const baseKey: Partial<Record<ProjectId, string>> = { mui: "xs", chakra: "base" }

/** Each own value, as a responsive object keyed by the library's breakpoints where a wider viewport changes it. */
function responsive(
  project: PresetProject,
  layer: TextLayer,
  write: (field: TypeField, value: TypeValue) => string
): { field: TypeField; text: string }[] {
  return typeFields.flatMap(({ field }) => {
    const set = viewports.filter((viewport) => layer.own[viewport.id]?.[field] !== undefined)
    if (set.length === 0) return []
    if (set.length === 1 && set[0]!.id === "mobile") return [{ field, text: write(field, layer.own.mobile![field]!) }]
    const entries = set.map((viewport) => {
      const key = viewport.id === "mobile" ? baseKey[project.id] : variantOf(project, viewport.id)
      return `${key}: ${write(field, layer.own[viewport.id]![field]!)}`
    })
    return [{ field, text: `{ ${entries.join(", ")} }` }]
  })
}

/** Fluent's styles: the preset spread in, its own values after it, and each wider viewport's in a media query. */
function fluentCode(layer: TextLayer, preset: Preset | undefined, covered: Set<TypeField>, color: Token | undefined) {
  const values = (values: TypeValues | undefined, indent: string): CodeLine[] =>
    typeFields
      .filter(({ field }) => values?.[field] !== undefined)
      .map(({ field }) => ({
        text: `${indent}${jsProperty[field]}: ${fluentValue(field, values![field]!)},`,
        override: covered.has(field)
      }))
  return [
    { text: "const useStyles = makeStyles({" },
    { text: "  text: {" },
    ...(preset ? [{ text: `    ...typographyStyles.${preset.name},` }] : []),
    ...values(layer.own.mobile, "    "),
    ...(color ? [{ text: `    color: tokens.${color.name},` }] : []),
    ...(layer.align ? [{ text: `    textAlign: "${layer.align}",` }] : []),
    ...viewports
      .slice(1)
      .flatMap((viewport) =>
        Object.keys(layer.own[viewport.id] ?? {}).length > 0
          ? [
              { text: `    "@media (min-width: ${viewport.width}px)": {` },
              ...values(layer.own[viewport.id], "      "),
              { text: "    }," }
            ]
          : []
      ),
    { text: "  }," },
    { text: "})" }
  ]
}

const muiAlign: Record<NonNullable<TextLayer["align"]>, string> = {
  start: "left",
  center: "center",
  end: "right",
  justify: "justify"
}

/** What the project's own library would write for the layer, for comparing with Tailwind's. PAR-708 maps these. */
export function libraryCode(project: PresetProject, layer: TextLayer): CodeLine[] {
  const preset = presetByName(project, layer.preset)
  const covered = coveredBy(preset)
  const color = project.colors.find((token) => token.name === layer.color)
  if (project.id === "fluent") return fluentCode(layer, preset, covered, color)
  if (project.id === "mui") {
    const own = responsive(project, layer, (field, value) => {
      const [, css] = cssValue(project, field, value)
      return field === "lineHeight" && "multiple" in (value as LineHeight) ? css : JSON.stringify(css)
    })
    const props = [
      ...(preset ? [{ text: `  variant="${preset.name}"` }] : []),
      ...(color ? [{ text: `  color="${color.name}"` }] : []),
      ...(layer.align ? [{ text: `  align="${muiAlign[layer.align]}"` }] : [])
    ]
    const sx =
      own.length > 0
        ? [
            { text: "  sx={{" },
            ...own.map(({ field, text }) => ({
              text: `    ${jsProperty[field]}: ${text},`,
              override: covered.has(field)
            })),
            { text: "  }}" }
          ]
        : []
    return [{ text: "<Typography" }, ...props, ...sx, { text: ">" }]
  }
  const own = responsive(project, layer, (field, value) => {
    if (field === "font") return `"${project.fonts.find((font) => font.name === value)?.token ?? (value as string)}"`
    const [, css] = cssValue(project, field, value)
    return JSON.stringify(css)
  })
  return [
    { text: "<Text" },
    ...(preset ? [{ text: `  textStyle="${preset.name}"` }] : []),
    ...own.map(({ field, text }) => ({
      text: `  ${jsProperty[field]}=${text.startsWith("{") ? `{${text}}` : text}`,
      override: covered.has(field)
    })),
    ...(color ? [{ text: `  color="${color.name}"` }] : []),
    ...(layer.align ? [{ text: `  textAlign="${layer.align}"` }] : []),
    { text: ">" }
  ]
}
