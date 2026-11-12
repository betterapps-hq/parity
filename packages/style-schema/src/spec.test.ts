import { listAll } from "@webref/css"
import { expect, it } from "vite-plus/test"
import { features as webFeatures } from "web-features"
import { z } from "zod"

// Writes spec.json, the part of the ledger that comes from spec data: every property Chromium draws, with its value
// grammar from the W3C's specs (@webref/css) and its Baseline status (web-features), and the grammar of every value
// type and other property those grammars name. Run `vp test run packages/style-schema/src/spec.test.ts -u` after updating either package, or
// after Electron moves to a newer Chromium, and place what joins the list in placements.ts.

/** The Chromium that frames render in, which is Electron's. */
const chromium = 156

/** Properties web-features lists for Chromium that aren't counted: deprecated, with a standard property in their place. */
const deprecated = new Set(["clip", "page-break-after", "page-break-before", "page-break-inside"])

/**
 * Properties Chromium draws that web-features has no entry for yet, so they have no Baseline status, and the prefixed
 * ones designs still use (design-options-css.md, Prefixed properties people still use).
 */
const unlisted = [
  "background-repeat-x",
  "background-repeat-y",
  "caret-animation",
  "flex-line-count",
  "line-clamp",
  "mask-border",
  "mask-border-outset",
  "mask-border-repeat",
  "mask-border-slice",
  "mask-border-source",
  "mask-border-width",
  "overflow-clip-margin",
  "speak",
  "text-decoration-inset",
  "view-transition-group",
  "-webkit-app-region",
  "-webkit-box-orient",
  "-webkit-box-reflect",
  "-webkit-font-smoothing",
  "-webkit-line-clamp",
  "-webkit-tap-highlight-color",
  "-webkit-text-fill-color",
  "-webkit-text-stroke",
  "-webkit-text-stroke-color",
  "-webkit-text-stroke-width"
]

/** Grammars for the properties above that no spec gives one: each is as Chromium reads it. */
const grammars = new Map([
  ["background-repeat-x", "repeat | no-repeat"],
  ["background-repeat-y", "repeat | no-repeat"],
  ["-webkit-app-region", "drag | no-drag"],
  ["-webkit-box-orient", "horizontal | vertical | inline-axis | block-axis"],
  ["-webkit-box-reflect", "[ above | below | right | left ]? <length>? <image>?"],
  ["-webkit-font-smoothing", "auto | none | antialiased | subpixel-antialiased"],
  ["-webkit-tap-highlight-color", "<color>"]
])

const status = z.object({
  baseline: z.union([z.literal("high"), z.literal("low"), z.literal(false)]),
  support: z.record(z.string(), z.string())
})

const featureStatuses = z.record(
  z.string(),
  z.object({ status: z.object({ by_compat_key: z.record(z.string(), status).optional() }).optional() })
)

const baselines = { high: "widely", low: "newly", none: "limited" } as const

it("spec.json is what the spec data gives", async () => {
  const css = await listAll()
  const features = featureStatuses.parse(webFeatures)
  const statuses = new Map<string, z.infer<typeof status>>()

  for (const feature of Object.values(features)) {
    for (const [key, value] of Object.entries(feature.status?.by_compat_key ?? {})) {
      const [, name] = /^css\.properties\.([^.]+)$/.exec(key) ?? []

      if (name !== undefined) {
        statuses.set(name, value)
      }
    }
  }

  const drawn = [...statuses].flatMap(([name, { support }]) => {
    const since = Number.parseInt((support.chrome ?? "").replace("≤", ""), 10)

    return since <= chromium && !name.startsWith("-") && !deprecated.has(name) ? [name] : []
  })

  const syntaxes = new Map(css.properties.map(({ name, syntax }) => [name, syntax]))
  const properties: Record<string, { syntax?: string; baseline: (typeof baselines)[keyof typeof baselines] }> = {}

  for (const name of [...drawn, ...unlisted].toSorted()) {
    const syntax = syntaxes.get(name) ?? grammars.get(name)
    const baseline = baselines[statuses.get(name)?.baseline || "none"]
    properties[name] = syntax === undefined ? { baseline } : { syntax, baseline }
  }

  const types: Record<string, string> = {}

  // Sorted by code unit, as `toSorted()` does by default, so the file is the same on every machine: `localeCompare`
  // orders punctuation by the machine's locale data.
  const named = new Map(
    [...css.types, ...css.functions].map(({ name, syntax }) => [name.replaceAll(/^<|>$/g, ""), syntax])
  )

  for (const name of [...named.keys()].toSorted()) {
    const syntax = named.get(name)

    if (syntax !== undefined) {
      types[name] = syntax
    }
  }

  // A grammar can name another property's (`<'box-shadow-blur'>`), which needn't be one Chromium draws by itself.
  const referenced: Record<string, string> = {}
  const unread = [...Object.values(properties).flatMap(({ syntax }) => syntax ?? []), ...Object.values(types)]

  for (let grammar = unread.pop(); grammar !== undefined; grammar = unread.pop()) {
    for (const [, name] of grammar.matchAll(/<'([a-z-]+)'>/g)) {
      const syntax = name === undefined || name in properties || name in referenced ? undefined : syntaxes.get(name)

      if (name !== undefined && syntax !== undefined) {
        referenced[name] = syntax
        unread.push(syntax)
      }
    }
  }

  const sorted = Object.fromEntries(
    Object.keys(referenced)
      .toSorted()
      .map((name) => [name, referenced[name]])
  )

  const spec = { chromium, properties, referenced: sorted, types }

  await expect(`${JSON.stringify(spec, null, 2)}\n`).toMatchFileSnapshot("./spec.json")
})
