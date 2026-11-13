/*
 * Typography presets on the simpler fields (PAR-186), as call 6 settled them after PAR-707's exploration:
 * a design language's bundle of type values that a text layer syncs to.
 * The rows a preset sets fold into its row, locked; an unlocked row changed on the layer overrides the preset there;
 * picking the preset again takes back every override; Detach keeps every value it gave. This file holds the stand-in
 * project's presets in PAR-186's value forms (tokens where the project has them), a layer's own values over them, and
 * what the Text section shows and writes. PAR-707's exploration, removed once this story carried its chosen design,
 * modeled Fluent, MUI, Chakra and Tailwind projects' presets and their code (`typography-preset/presets.ts` in edcde46e).
 */
import { formatNumber } from "@parity-app/style-schema"
import { sameValue } from "./css-values.ts"
import { resolveFont, sizePx } from "./font-fields.tsx"
import {
  type FontSize,
  fontSizeWrites,
  type FontValue,
  fontWrites,
  type LetterSpacing,
  letterSpacingWrites,
  type LineHeight,
  lineHeightWrites,
  type WeightValue,
  weightWrites
} from "./text-writes.ts"
import type { TokenSets } from "./tokens.ts"
import { mergeWrites, type StoredObject, type Writes } from "./writes.ts"

/** The project's tokens type values name, which a preset's and a layer's values are measured with. */
export type TypeTokens = Pick<TokenSets, "font" | "size" | "weight" | "leading" | "tracking">

export type TypeField = "font" | "size" | "weight" | "lineHeight" | "letterSpacing"

export interface TypeValues {
  font?: FontValue
  size?: FontSize
  weight?: WeightValue
  lineHeight?: LineHeight
  letterSpacing?: LetterSpacing
}

/** The rows a preset can set, in the Text section's order. */
export const typeFields: { field: TypeField; label: string }[] = [
  { field: "font", label: "Font" },
  { field: "size", label: "Size" },
  { field: "weight", label: "Weight" },
  { field: "lineHeight", label: "Line height" },
  { field: "letterSpacing", label: "Letter spacing" }
]

export const fieldLabel = (field: TypeField) => typeFields.find((entry) => entry.field === field)!.label

export interface TypePreset {
  name: string
  /** Where it comes from, which the picker groups by ("From the project"). */
  source: string
  values: TypeValues
  /** Values a wider viewport changes, from its width up, as a responsive preset writes its own media query. */
  wider?: { viewport: string; values: TypeValues }
}

/**
 * The stand-in project's presets, written as Tailwind project utilities (`type-heading`) or, for one that sets only a
 * size and its line height, a `--text-*` size (`text-label`). Display grows from Desktop up; Label sets no font or
 * weight, so those rows stay ordinary while it's applied.
 */
export const typePresets: TypePreset[] = [
  {
    name: "display",
    source: "the project",
    values: {
      font: { token: "brand" },
      size: { token: "display" },
      weight: { token: "bold" },
      lineHeight: { px: 40 },
      letterSpacing: { token: "tight" }
    },
    wider: { viewport: "Desktop", values: { size: { px: 48 }, lineHeight: { px: 48 } } }
  },
  {
    name: "heading",
    source: "the project",
    values: {
      font: { token: "sans" },
      size: { token: "xl" },
      weight: { token: "semibold" },
      lineHeight: { px: 28 },
      letterSpacing: { token: "tight" }
    }
  },
  {
    name: "body",
    source: "the project",
    values: { font: { token: "sans" }, size: { token: "base" }, weight: { token: "normal" }, lineHeight: { px: 24 } }
  },
  { name: "label", source: "the project", values: { size: { token: "sm" }, lineHeight: { px: 20 } } },
  {
    name: "caption",
    source: "the project",
    values: {
      font: { token: "sans" },
      size: { token: "xs" },
      weight: { token: "medium" },
      lineHeight: { px: 16 },
      letterSpacing: { token: "wide" }
    }
  }
]

export const presetNamed = (name: string | undefined) => typePresets.find((preset) => preset.name === name)

/** The rows a preset sets, in order. */
export const coveredBy = (preset: TypePreset | undefined): TypeField[] =>
  preset ? typeFields.flatMap(({ field }) => (preset.values[field] === undefined ? [] : [field])) : []

/** A text layer: the preset it follows, if any, and its own values, which override the preset's where it sets them. */
export interface PresetLayer {
  preset?: string
  own: TypeValues
  /** Weight's italic toggle, which no preset sets. */
  italic?: boolean
}

/** What the text inherits while a row is unset: the project's sans at 16/24, Regular, no letter spacing. */
export const inherited: Required<TypeValues> = {
  font: { token: "sans" },
  size: { token: "base" },
  weight: { token: "normal" },
  lineHeight: { px: 24 },
  letterSpacing: { em: 0 }
}

export type Source = "preset" | "override" | "own" | "inherited"

/** A row's value and where it comes from: the preset, the layer over the preset, the layer alone, or its parent. */
export function shownValue<F extends TypeField>(
  layer: PresetLayer,
  field: F
): { value: TypeValues[F] | undefined; source: Source } {
  const preset = presetNamed(layer.preset)
  const own = layer.own[field]
  const fromPreset = preset?.values[field]

  if (fromPreset !== undefined) {
    return own === undefined ? { value: fromPreset, source: "preset" } : { value: own, source: "override" }
  }

  return own === undefined ? { value: undefined, source: "inherited" } : { value: own, source: "own" }
}

/** Sets a row on the layer. Set to what its preset gives, it follows the preset again rather than overriding it. */
export function setValue<F extends TypeField>(
  layer: PresetLayer,
  field: F,
  value: TypeValues[F] | undefined
): PresetLayer {
  const own = { ...layer.own }
  const fromPreset = presetNamed(layer.preset)?.values[field]

  if (value === undefined || (fromPreset !== undefined && sameValue(value, fromPreset))) {
    delete own[field]
  } else {
    own[field] = value
  }

  return { ...layer, own }
}

/** Values that set one row. */
function rowValues<F extends TypeField>(field: F, value: TypeValues[F]): TypeValues {
  const values: TypeValues = {}
  values[field] = value

  return values
}

/** Puts a row back to its preset's value. */
export const resetValue = (layer: PresetLayer, field: TypeField) => setValue(layer, field, undefined)

/** The rows the layer overrides its preset in. */
export const overridesOf = (layer: PresetLayer): TypeField[] =>
  coveredBy(presetNamed(layer.preset)).filter((field) => layer.own[field] !== undefined)

/** Picks a preset, or none: its rows follow it, so picking the one applied again takes back every override. */
export function applyPreset(layer: PresetLayer, name: string | undefined): PresetLayer {
  const own = { ...layer.own }

  for (const field of coveredBy(presetNamed(name))) {
    delete own[field]
  }

  return { ...layer, preset: name, own }
}

/** Detach: the layer keeps every value its preset gave it, overrides included, as its own. */
export function detachPreset(layer: PresetLayer): PresetLayer {
  const preset = presetNamed(layer.preset)

  return { own: { ...preset?.values, ...layer.own }, italic: layer.italic }
}

/* What the values come to */

/** Every row's value as the text draws it, from the layer, its preset and what it inherits. */
export function typeOf(layer: PresetLayer): Required<TypeValues> {
  const values = { ...inherited }

  for (const { field } of typeFields) {
    const { value } = shownValue(layer, field)

    if (value !== undefined) {
      Object.assign(values, { [field]: value })
    }
  }

  return values
}

const weightNumber = (weight: WeightValue, tokens: TypeTokens) =>
  "token" in weight ? (tokens.weight.find((token) => token.name === weight.token)?.weight ?? 400) : weight.value

export const weightLabel = (weight: WeightValue, tokens: TypeTokens) =>
  tokens.weight.find((token) => token.weight === weightNumber(weight, tokens))?.label ??
  String(weightNumber(weight, tokens))

function lineHeightPx(lineHeight: LineHeight, size: number, tokens: TypeTokens): number {
  if ("keyword" in lineHeight) {
    return Math.round(size * 1.2)
  }

  if ("px" in lineHeight) {
    return lineHeight.px
  }

  const multiple =
    "multiple" in lineHeight
      ? lineHeight.multiple
      : (tokens.leading.find((token) => token.name === lineHeight.token)?.multiple ?? 1.5)

  return Math.round(size * multiple * 100) / 100
}

function letterSpacingEm(spacing: LetterSpacing, size: number, tokens: TypeTokens): number {
  if ("token" in spacing) {
    return tokens.tracking.find((token) => token.name === spacing.token)?.em ?? 0
  }

  return "em" in spacing ? spacing.em : spacing.px / size
}

/** A set of type values in numbers, for the summary, the preview and matching a preset. */
export function measured(values: Required<TypeValues>, tokens: TypeTokens) {
  const size = sizePx(values.size, tokens.size)
  const font = resolveFont(values.font, tokens.font)

  return {
    font: font?.name ?? "",
    stack: font?.stack ?? "sans-serif",
    size,
    weight: weightNumber(values.weight, tokens),
    lineHeight: lineHeightPx(values.lineHeight, size, tokens),
    letterSpacing: letterSpacingEm(values.letterSpacing, size, tokens)
  }
}

/** A preset's values over what text inherits, as its summary and the picker draw it. */
export const presetType = (preset: TypePreset): Required<TypeValues> => ({ ...inherited, ...preset.values })

/** "Geist 20/28 Semibold": the font, size and line height, and weight a preset sets, in what it sets. */
export function summary(preset: TypePreset, tokens: TypeTokens): string {
  const values = measured(presetType(preset), tokens)
  const covered = new Set(coveredBy(preset))

  const parts = [
    covered.has("font") ? values.font : undefined,
    `${formatNumber(values.size)}/${formatNumber(values.lineHeight)}`,
    covered.has("weight") ? weightLabel(presetType(preset).weight, tokens) : undefined
  ]

  return parts.filter(Boolean).join(" ")
}

/** What a row is in each viewport, for the dot after its name: "36px on Mobile, 48px from Desktop". */
export function viewportsOf(preset: TypePreset | undefined, field: TypeField, tokens: TypeTokens): string | undefined {
  const wider = preset?.wider?.values[field]

  if (!preset?.wider || wider === undefined) {
    return undefined
  }

  const base = preset.values[field]

  const words = (value: TypeValues[TypeField]) => {
    const numbers = measured({ ...presetType(preset), ...rowValues(field, value) }, tokens)

    return field === "size" ? `${formatNumber(numbers.size)}px` : `${formatNumber(numbers.lineHeight)}px`
  }

  return `${words(base)} on Mobile, ${words(wider)} from ${preset.wider.viewport}`
}

/** A preset the layer's type matches, or comes near (see `closestPreset`), and the rows that differ. */
export interface PresetMatch {
  preset: TypePreset
  differs: TypeField[]
}

/**
 * How far apart two values of a row are, in steps a designer would take: a font that differs is one, and so is each
 * 4px of size or line height, 100 of weight, and 0.025em of letter spacing, the gap between Normal and Tight.
 */
const rowSteps: Record<Exclude<TypeField, "font">, number> = {
  size: 4,
  weight: 100,
  lineHeight: 4,
  letterSpacing: 0.025
}

/** The furthest a preset can be, in those steps summed over the rows it sets, and still be offered as near. */
const nearSteps = 3

/**
 * For a layer with no preset: the preset its type matches in every row the preset sets, or else the nearest, by the
 * steps between its rows and the preset's summed over the rows the preset sets, when that's within `nearSteps`. A layer
 * that sets no type of its own is offered none: it has the type it inherits, which isn't a choice to match.
 */
export function closestPreset(layer: PresetLayer, tokens: TypeTokens): PresetMatch | undefined {
  if (layer.preset !== undefined || typeFields.every(({ field }) => layer.own[field] === undefined)) {
    return undefined
  }

  const mine = measured(typeOf(layer), tokens)

  const matches = typePresets.map((preset) => {
    const theirs = measured(presetType(preset), tokens)

    const steps = coveredBy(preset).map((field) => ({
      field,
      steps:
        field === "font" ? Number(theirs.font !== mine.font) : Math.abs(theirs[field] - mine[field]) / rowSteps[field]
    }))

    return {
      preset,
      differs: steps.filter((row) => row.steps > 0.001).map((row) => row.field),
      steps: steps.reduce((sum, row) => sum + row.steps, 0)
    }
  })

  const nearest = matches
    .filter((match) => match.steps <= nearSteps)
    .sort((a, b) => a.steps - b.steps || a.differs.length - b.differs.length)[0]

  return nearest && { preset: nearest.preset, differs: nearest.differs }
}

/** Words for a row's value, as the locked row and Use's hint say it. */
export function valueWords(field: TypeField, values: Required<TypeValues>, tokens: TypeTokens): string {
  const numbers = measured(values, tokens)

  if (field === "font") {
    return numbers.font
  }

  if (field === "weight") {
    return weightLabel(values.weight, tokens)
  }

  if (field === "letterSpacing") {
    return `${formatNumber(Math.round(numbers.letterSpacing * 1000) / 10)}%`
  }

  return `${formatNumber(field === "size" ? numbers.size : numbers.lineHeight)}px`
}

/* What it writes */

/** A preset's one class: a project utility when it sets a font, else a `--text-*` size, as Tailwind's adapter writes. */
export const presetClass = (preset: TypePreset) =>
  preset.values.font === undefined ? `text-${preset.name}` : `type-${preset.name}`

/** One row's writes, without the size a line height is written beside. */
function rowWrites(field: TypeField, values: TypeValues): Writes | undefined {
  if (field === "font") {
    return values.font && fontWrites(values.font)
  }

  if (field === "size") {
    return values.size && fontSizeWrites(values.size)
  }

  if (field === "lineHeight") {
    return values.lineHeight && lineHeightWrites(values.lineHeight, undefined)
  }

  if (field === "letterSpacing") {
    return values.letterSpacing && letterSpacingWrites(values.letterSpacing)
  }

  if (values.weight === undefined) {
    return undefined
  }

  const writes = weightWrites(values.weight, undefined)

  // SAFETY: with a weight set and no italic, weightWrites stores `{ fontWeight }`.
  return { ...writes, stored: (writes.stored as StoredObject).fontWeight }
}

const storedKeys: Record<TypeField, string> = {
  font: "fontFamily",
  size: "fontSize",
  weight: "fontWeight",
  lineHeight: "lineHeight",
  letterSpacing: "letterSpacing"
}

/**
 * What the layer stores and writes: its preset by name (`typePreset: { token: "heading" }`) and its own values, the
 * same in every framework. Tailwind writes the preset's one class, then each override as a class after it
 * (`type-heading leading-6`); the CSS is what the class sets, then the overrides.
 */
export function presetWrites(layer: PresetLayer): Writes {
  const preset = presetNamed(layer.preset)
  const parts: Record<string, Writes> = {}

  if (preset) {
    const css = coveredBy(preset).flatMap((field) => rowWrites(field, preset.values)?.css ?? [])
    parts.typePreset = { stored: { token: preset.name }, css, tailwind: [presetClass(preset)] }
  }

  for (const { field } of typeFields) {
    const writes = rowWrites(field, layer.own)

    if (writes) {
      parts[storedKeys[field]] = writes
    }
  }

  return mergeWrites(parts)
}
