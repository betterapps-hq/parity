import { z } from "zod"
import type { StyleKey } from "./model.ts"
import { placements } from "./placements.ts"
import specData from "./spec.json" with { type: "json" }

// Every CSS property a frame can draw, and what Parity knows of each: where it goes in the Design tab and the tokens it
// takes (placements.ts, by hand), its value grammar and Baseline status (spec.json, generated from spec data), and the
// stored key that owns it (`owned`, below). docs/proposals/design-options-css.md is this in prose.

/** The Design tab's sections, in its order, and `left-out` for what has no place in it. */
export type Section =
  | "position"
  | "size"
  | "layout"
  | "spacing"
  | "appearance"
  | "text"
  | "image"
  | "icon"
  | "fill"
  | "stroke"
  | "effects"
  | "transform"
  | "interaction"
  | "motion"
  | "css"
  | "left-out"

/**
 * Where a property is edited: its own control, a row under its section's More, the CSS row at the end of the tab, or
 * nowhere a control reaches.
 */
export type Where = "control" | "more" | "css" | "left-out"

/** The kinds of token a property takes, by the names the Tokens panel's previews have, and `any` for a custom property. */
export type TokenKind =
  | "animation"
  | "any"
  | "aspect"
  | "backdrop-blur"
  | "blur"
  | "border"
  | "border-width"
  | "color"
  | "container"
  | "cursor"
  | "drop-shadow"
  | "duration"
  | "easing"
  | "font"
  | "font-size"
  | "font-weight"
  | "gradient"
  | "inset-shadow"
  | "leading"
  | "number"
  | "opacity"
  | "perspective"
  | "radius"
  | "shadow"
  | "spacing"
  | "stroke-style"
  | "text-shadow"
  | "tracking"
  | "transition"
  | "type-style"
  | "z-index"

/** One concept of the Design tab and the properties that are its longhands, shorthand and logical forms. */
export interface Placement {
  section: Section
  concept: string
  where: Where
  tokens: readonly TokenKind[]
  properties: readonly string[]
}

/**
 * How widely browsers other than Chromium draw a property, from the web-features project's Baseline: every major
 * browser for two and a half years, every major browser more recently, or at least one doesn't yet.
 */
export type Baseline = "widely" | "newly" | "limited"

const spec = z
  .object({
    chromium: z.number(),
    properties: z.record(
      z.string(),
      z.object({ syntax: z.string().optional(), baseline: z.enum(["widely", "newly", "limited"]) })
    ),
    referenced: z.record(z.string(), z.string()),
    types: z.record(z.string(), z.string())
  })
  .parse(specData)

/** The Chromium whose properties the ledger counts, which is the one frames render in. */
export const ledgerChromium = spec.chromium

/**
 * What the properties' grammars name besides basic types: each value type's grammar, by its name without angle
 * brackets, and the grammar of each property a grammar refers to that Chromium doesn't draw by itself.
 */
export const namedGrammars = {
  types: spec.types,
  properties: spec.referenced
}

/** Every property Chromium draws, as the spec data lists them. */
export const specProperties: readonly string[] = Object.keys(spec.properties)

/**
 * The properties each stored key owns: a property has one owner, so one row in the panel answers for it. A property no
 * key owns is the CSS map's.
 */
export const owned: Readonly<Record<StyleKey, readonly string[]>> = {
  display: ["display"],
  direction: ["flex-direction"],
  columns: ["grid-template-columns"],
  rows: ["grid-template-rows"],
  gap: ["gap"],
  rowGap: ["row-gap"],
  padding: ["padding"],
  margin: ["margin"],
  align: ["align-items"],
  justify: ["justify-content", "justify-items"],
  wrap: ["flex-wrap"],
  width: ["width"],
  height: ["height"],
  minWidth: ["min-width"],
  maxWidth: ["max-width"],
  minHeight: ["min-height"],
  maxHeight: ["max-height"],
  colSpan: ["grid-column"],
  rowSpan: ["grid-row"],
  grow: ["flex", "flex-shrink"],
  self: ["align-self"],
  position: ["position"],
  top: ["top"],
  right: ["right"],
  bottom: ["bottom"],
  left: ["left"],
  zIndex: ["z-index"],
  background: [
    "background",
    "background-color",
    "background-image",
    "background-size",
    "background-position",
    "background-repeat"
  ],
  foreground: ["color"],
  border: ["border-color"],
  borderWidth: ["border-width"],
  borderStyle: ["border-style"],
  radius: ["border-radius"],
  shadow: ["box-shadow"],
  opacity: ["opacity"],
  overflow: ["overflow"],
  filter: ["filter"],
  backdropFilter: ["backdrop-filter"],
  transform: ["translate", "rotate", "scale", "transform", "transform-origin"],
  font: ["font-family"],
  size: ["font-size"],
  weight: ["font-weight"],
  leading: ["line-height"],
  tracking: ["letter-spacing"],
  textAlign: ["text-align"],
  textTransform: ["text-transform"],
  decoration: ["text-decoration-line"],
  italic: ["font-style"],
  lines: ["-webkit-line-clamp", "-webkit-box-orient", "text-overflow", "white-space"]
}

/**
 * The properties a key writes that another key owns, because its own can't work without them (principle 8 of
 * design-options.md, and design-options-css.md's Properties set by another control). Filling writes the flex item and
 * the least size that lets it shrink, a font size brings its line height, and cutting text off clips it.
 */
export const setsForOthers: Readonly<Partial<Record<StyleKey, readonly string[]>>> = {
  width: ["flex", "flex-shrink", "min-width", "align-self"],
  height: ["flex", "flex-shrink", "min-height", "align-self"],
  grow: ["min-width", "min-height"],
  size: ["line-height"],
  lines: ["overflow", "display"]
}

/** What the ledger holds for one property. */
export interface LedgerEntry extends Omit<Placement, "properties"> {
  /** As CSS spells it. */
  property: string
  /** The stored key that owns it. Unset, the CSS map holds it. */
  key?: StyleKey
  /** Its value grammar, in CSS's value definition syntax. Unset where no spec gives one. */
  syntax?: string
  baseline: Baseline
}

function entries(): Map<string, LedgerEntry> {
  const keys = new Map<string, StyleKey>()

  for (const [key, properties] of Object.entries(owned)) {
    for (const property of properties) {
      // SAFETY: `owned` is a record by style key, so each of its keys is one.
      keys.set(property, key as StyleKey)
    }
  }

  const built = new Map<string, LedgerEntry>()

  for (const { properties, ...placement } of placements) {
    for (const property of properties) {
      const listed = spec.properties[property]

      if (!listed) {
        continue
      }

      const entry: LedgerEntry = { property, ...placement, baseline: listed.baseline }
      const key = keys.get(property)

      if (key !== undefined) {
        entry.key = key
      }

      if (listed.syntax !== undefined) {
        entry.syntax = listed.syntax
      }

      built.set(property, entry)
    }
  }

  return built
}

/** Every property Chromium draws that Parity places, by name, in the Design tab's order. */
export const ledger: ReadonlyMap<string, LedgerEntry> = entries()
