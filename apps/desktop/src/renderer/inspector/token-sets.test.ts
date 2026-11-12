import type { Token } from "@parity-app/tokens"
import { describe, expect, it } from "vite-plus/test"
import { type FieldToken, tailwindWeights, type TokenSetName } from "./controls/tokens.ts"
import { projectTokenSets, shadowLayers } from "./token-sets.ts"

/** Pixels in px or rem, NaN for anything else, as the browser would measure them. */
const length = (value: string) => {
  const match = /^(-?[\d.]+)(px|rem)$/.exec(value)

  if (!match) {
    return Number.NaN
  }

  return Number(match[1]) * (match[2] === "rem" ? 16 : 1)
}

/** Colors as the browser reads them, for the ones these tests use. */
const color = (value: string) => (value === "rgb(0 0 0 / 0.1)" ? "#0000001a" : value)

function token(name: string, category: Token["category"], value: string, derived?: Token["derived"]): Token {
  const made: Token = { name, category, source: "theme", values: { default: value } }

  if (derived) {
    made.derived = derived
  }

  return made
}

/** One project, with a token or two of every kind the panel offers, and some it leaves out. */
const tokens: Token[] = [
  token("primary", "color", "#171717"),
  token("muted", "color", "oklch(0.97 0 0)"),
  token("radius-lg", "radius", "0.625rem"),
  token("spacing", "spacing", "4px"),
  token("spacing-4", "spacing", "16px", { from: "spacing", factor: 4 }),
  token("spacing-gutter", "spacing", "24px"),
  token("container-sm", "container", "384px"),
  token("breakpoint-md", "breakpoint", "48rem"),
  token("text-xl", "font-size", "20px"),
  token("text-xl--line-height", "font-size", "calc(1.75 / 1.25)"),
  token("font-semibold", "font-weight", "600"),
  token("leading-tight", "leading", "1.25"),
  token("tracking-wide", "tracking", "0.025em"),
  token("font-sans", "font", '"Geist", sans-serif'),
  token("shadow-sm", "shadow", "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)"),
  token("inset-shadow-xs", "shadow", "inset 0 1px 1px rgb(0 0 0 / 0.1)"),
  token("drop-shadow-md", "shadow", "0 3px 3px rgb(0 0 0 / 0.1)"),
  token("text-shadow-sm", "shadow", "0 1px 0 rgb(0 0 0 / 0.1)"),
  token("blur-sm", "effect", "8px"),
  token("z-modal", "other", "50"),
  token("z-raised", "other", "10"),
  token("z-top", "other", "var(--z-modal)"),
  token("gradient-brand", "other", "linear-gradient(90deg, #2563eb 0%, #0d9488 100%)"),
  token("duration-fast", "motion", "150ms"),
  token("duration-slow", "motion", "0.4s"),
  token("ease-snappy", "motion", "cubic-bezier(0.2, 0.8, 0.2, 1)"),
  token("ease-out", "motion", "cubic-bezier(0, 0, 0.2, 1)"),
  token("default-transition-duration", "motion", "150ms")
]

const sets = projectTokenSets(tokens, length, color)

describe("the project's tokens as the Design tab's fields offer them", () => {
  const cases: { set: TokenSetName; offers: [string, string][]; why: string }[] = [
    {
      set: "color",
      offers: [
        ["primary", "171717"],
        ["muted", "oklch(0.97 0 0)"]
      ],
      why: "each color by its real name, with what it comes to as written"
    },
    {
      set: "radius",
      offers: [
        ["radius-lg", "10px"],
        ["radius-full", "Full"]
      ],
      why: "Full beside the project's radii"
    },
    { set: "spacing", offers: [["spacing-gutter", "24px"]], why: "not the scale's base or steps, held as pixels" },
    { set: "container", offers: [["container-sm", "384px"]], why: "containers in pixels" },
    { set: "breakpoint", offers: [["breakpoint-md", "768px"]], why: "breakpoints in pixels" },
    { set: "size", offers: [["text-xl", "20px"]], why: "text sizes in pixels" },
    { set: "weight", offers: [["font-semibold", "600"]], why: "the project's weights" },
    { set: "leading", offers: [["leading-tight", "1.25×"]], why: "line heights as multiples" },
    { set: "tracking", offers: [["tracking-wide", "0.025em"]], why: "letter spacing in em" },
    { set: "font", offers: [["font-sans", "Geist"]], why: "a font by its first family" },
    { set: "shadow", offers: [["shadow-sm", "2 layers"]], why: "a shadow with its layers read" },
    { set: "insetShadow", offers: [["inset-shadow-xs", "0px 1px 1px 0px"]], why: "inset shadows apart" },
    { set: "dropShadow", offers: [["drop-shadow-md", "0px 3px 3px"]], why: "drop shadows apart" },
    { set: "textShadow", offers: [["text-shadow-sm", "0px 1px 0px"]], why: "text shadows apart" },
    { set: "blur", offers: [["blur-sm", "8px"]], why: "blurs in pixels" },
    {
      set: "zIndex",
      offers: [
        ["z-raised", "10"],
        ["z-modal", "50"],
        ["z-top", "50"]
      ],
      why: "layer orders in the order they stack, references filled in"
    },
    { set: "gradient", offers: [["gradient-brand", "Linear 90°"]], why: "a gradient read as its paint" },
    {
      set: "duration",
      offers: [
        ["duration-fast", "150ms"],
        ["duration-slow", "400ms"]
      ],
      why: "durations in milliseconds, not Tailwind's default"
    },
    { set: "easing", offers: [["ease-snappy", "0.2, 0.8, 0.2, 1"]], why: "easings, not Tailwind's own" },
    { set: "borderWidth", offers: [], why: "nothing for a kind the project can't have yet" },
    { set: "opacity", offers: [], why: "nothing for a kind the project can't have yet" },
    { set: "cursor", offers: [], why: "nothing for a kind the project can't have yet" }
  ]

  it.each(cases)("offers $set: $why", ({ set, offers }) => {
    expect(sets[set].map((each: FieldToken) => [each.name, each.detail])).toEqual(offers)
  })

  it("pairs a text size with its line height", () => {
    expect(sets.size[0]).toMatchObject({ lineHeight: 28 })
  })

  it("steps through Tailwind's hundreds where the project has no weights", () => {
    expect(projectTokenSets([], length, color).weight).toBe(tailwindWeights)
  })
})

describe("shadowLayers", () => {
  it("reads each layer's numbers, inset and color, as a plain color", () => {
    expect(shadowLayers("0 1px 3px 0 rgb(0 0 0 / 0.1), inset 0 -1px 0 0 #ffffff", length, color)).toEqual([
      { x: 0, y: 1, blur: 3, spread: 0, color: "#0000001a" },
      { x: 0, y: -1, blur: 0, spread: 0, color: "#ffffff", inset: true }
    ])
  })

  it("reads nothing from what isn't a shadow", () => {
    expect(shadowLayers("none", length, color)).toEqual([])
  })
})
