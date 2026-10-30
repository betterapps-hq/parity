import { readFileSync } from "node:fs"
import { describe, expect, it } from "vite-plus/test"
import { readDesignTokens } from "./dtcg.ts"
import {
  codeForms,
  defaultValues,
  type PreviewKind,
  previewKind,
  substituteReferences,
  tokenReferences,
  unclosedInValue,
  valueParts
} from "./kinds.ts"
import { describedCategories, describedTokenCss, describedTokenVar, extractTokens, type Token } from "./tokens.ts"

/** Each token's kind, by name, reading tokens as the app does: compiled CSS, Tailwind's theme, a library's categories. */
function kinds(css: string, theme: { name: string; value: string }[] = [], types = new Map<string, string>()) {
  const tokens = extractTokens(css, theme)
  const lookup = defaultValues(tokens)
  return Object.fromEntries(tokens.map((token) => [token.name, previewKind(token, types.get(token.name), lookup)]))
}

/** A registry library's tokens, read and categorized as the app reads them, by name. */
async function registryKinds(library: string): Promise<Record<string, PreviewKind>> {
  const file = new URL(`../../registry/libraries/${library}.lib.par`, import.meta.url)
  const described = await readDesignTokens(JSON.parse(readFileSync(file, "utf8")).tokens, () =>
    Promise.reject(new Error("The registry's tokens are inline"))
  )
  const types = new Map(described.map((token) => [describedTokenVar(token), token.type]))
  const tokens = extractTokens(describedTokenCss(described), [], describedCategories(described))
  const lookup = defaultValues(tokens)
  return Object.fromEntries(tokens.map((token) => [token.name, previewKind(token, types.get(token.name), lookup)]))
}

describe("defaultValues", () => {
  it("looks a token up by its default value, or the first it has when only a dark theme sets it", () => {
    const lookup = defaultValues([
      { name: "radius", values: { default: "4px" } },
      { name: "glow", values: { dark: "0 0 8px white" } }
    ])
    expect([lookup("radius"), lookup("glow"), lookup("missing")]).toEqual(["4px", "0 0 8px white", undefined])
  })

  it("looks a token up in a theme, else its default, and not in a theme it isn't set in", () => {
    const lookup = defaultValues([
      { name: "radius", values: { default: "4px", dark: "6px" } },
      { name: "glow", values: { dark: "0 0 8px white" } }
    ])
    expect([lookup("radius", "dark"), lookup("radius", "contrast"), lookup("glow", "default")]).toEqual([
      "6px",
      "4px",
      undefined
    ])
  })

  it("resolves a reference in the theme the token is read in, so a dark-only token doesn't shadow a fallback", () => {
    const tokens = [
      { name: "brand-surface", values: { default: "var(--brand-gradient, linear-gradient(red, blue))" } },
      { name: "brand-gradient", values: { dark: "none" } },
      { name: "hero", values: { dark: "var(--hero-fill)" } },
      { name: "hero-fill", values: { default: "linear-gradient(black, navy)" } }
    ]
    const lookup = defaultValues(tokens)
    expect(previewKind({ ...tokens[0]!, category: "other" }, undefined, lookup)).toBe("gradient")
    expect(previewKind({ ...tokens[2]!, category: "other" }, undefined, lookup)).toBe("gradient")
  })
})

describe("previewKind", () => {
  it("splits Tailwind's theme finer than its categories", () => {
    const theme = Object.entries({
      "color-red-500": "oklch(0.637 0.237 25.331)",
      spacing: "0.25rem",
      "radius-md": "0.375rem",
      "shadow-lg": "0 10px 15px -3px rgb(0 0 0 / 0.1)",
      "inset-shadow-xs": "inset 0 1px 1px rgb(0 0 0 / 0.05)",
      "drop-shadow-md": "0 3px 3px rgb(0 0 0 / 0.12)",
      "text-shadow-xs": "0px 1px 1px rgb(0 0 0 / 0.2)",
      "text-sm": "0.875rem",
      "font-sans": "ui-sans-serif, system-ui, sans-serif",
      "font-weight-semibold": "600",
      "leading-tight": "1.25",
      "tracking-tight": "-0.025em",
      "blur-md": "12px",
      "perspective-near": "300px",
      "aspect-video": "16 / 9",
      "ease-out": "cubic-bezier(0, 0, 0.2, 1)",
      "animate-spin": "spin 1s linear infinite",
      "breakpoint-md": "48rem",
      "container-md": "28rem"
    }).map(([name, value]) => ({ name, value }))
    // The spacing scale's steps come too, as spacing.
    expect(kinds("", theme)).toMatchObject({
      "spacing-4": "spacing",
      "color-red-500": "color",
      spacing: "spacing",
      "radius-md": "radius",
      "shadow-lg": "shadow",
      "inset-shadow-xs": "inset-shadow",
      "drop-shadow-md": "drop-shadow",
      "text-shadow-xs": "text-shadow",
      "text-sm": "font-size",
      "font-sans": "font",
      "font-weight-semibold": "font-weight",
      "leading-tight": "leading",
      "tracking-tight": "tracking",
      "blur-md": "blur",
      "perspective-near": "perspective",
      "aspect-video": "aspect",
      "ease-out": "easing",
      "animate-spin": "animation",
      "breakpoint-md": "breakpoint",
      "container-md": "container"
    })
  })

  it("reads a project's own tokens by name and value, whatever Other holds them under", () => {
    const css = `:root { --opacity-scrim: 0.8; --layer-modal: 50; --z-index-toast: 60; --cursor-grab: grab;
      --duration-slow: 300ms; --border-width-thick: 2px; --sidebar-scale: 1.2 }`
    expect(kinds(css)).toMatchObject({
      "opacity-scrim": "opacity",
      "z-index-toast": "z-index",
      "cursor-grab": "cursor",
      "duration-slow": "duration",
      "border-width-thick": "border-width",
      "sidebar-scale": "number"
    })
  })

  it("places Chakra's tokens: layers, borders, cursors, ratios, blurs and animations", async () => {
    const chakra = await registryKinds("chakra")
    expect(chakra).toMatchObject({
      "chakra-z-index-modal": "z-index",
      "chakra-borders-sm": "border",
      "chakra-cursor-button": "cursor",
      "chakra-aspect-ratios-wide": "aspect",
      "chakra-blurs-md": "blur",
      "chakra-animations-spin": "animation",
      "chakra-durations-fast": "duration",
      "chakra-easings-ease-in": "easing",
      "chakra-shadows-inner": "inset-shadow",
      "chakra-colors-blue-contrast": "color",
      "chakra-sizes-breakpoint-md": "breakpoint"
    })
    expect(Object.values(chakra).filter((kind) => kind === "number")).toHaveLength(0)
  })

  it("places Fluent's camel-cased tokens: stroke widths, durations and curves", async () => {
    const fluent = await registryKinds("fluent")
    expect(fluent).toMatchObject({
      strokeWidthThin: "border-width",
      durationNormal: "duration",
      curveDecelerateMax: "easing",
      borderRadiusMedium: "radius",
      shadow4: "shadow",
      fontWeightSemibold: "font-weight"
    })
    expect(Object.values(fluent).filter((kind) => kind === "number")).toHaveLength(0)
  })

  it("places Mantine's tokens, a color named for a curve as a color, and leaves its scale a number", async () => {
    const mantine = await registryKinds("mantine")
    expect(mantine).toMatchObject({
      "mantine-z-index-modal": "z-index",
      "mantine-breakpoint-md": "breakpoint",
      "rp-curve-root-color": "color",
      "mantine-scale": "number"
    })
  })
})

describe("a value that is a duration", () => {
  it("makes a duration, whatever the token is named", () => {
    const token = (name: string, value: string, category: Token["category"]) => ({
      name,
      category,
      values: { default: value }
    })
    expect(previewKind(token("animation-delay-75", "75ms", "motion"))).toBe("duration")
    expect(previewKind(token("animation-delay-1000", "1s", "other"))).toBe("duration")
    expect(previewKind(token("animate-spin", "spin 1s linear infinite", "motion"))).toBe("animation")
  })
})

describe("codeForms", () => {
  it("writes a token as var() and as its name, whichever framework it's from", () => {
    expect(codeForms("radius-md", "radius", "0.375rem")).toEqual([
      { group: "CSS", label: "Variable", text: "var(--radius-md)" },
      { group: "Token", label: "Name", text: "radius-md" }
    ])
    expect(codeForms("colorNeutralForeground1", "color", "#242424").map((form) => form.text)).toEqual([
      "var(--colorNeutralForeground1)",
      "colorNeutralForeground1"
    ])
  })

  it("writes a breakpoint as a query, since var() can't go in one", () => {
    expect(codeForms("breakpoint-md", "breakpoint", "48rem").map((form) => form.text)).toEqual([
      "@media (width >= 48rem)",
      "breakpoint-md"
    ])
  })
})

describe("values", () => {
  it("finds what a value leaves open or closes twice", () => {
    expect(unclosedInValue("calc(var(--radius) * 2.6")).toBe("A bracket isn't closed. Add ) at the end.")
    expect(unclosedInValue("calc(var(--radius) * 2.6))")).toBe("There's a ) with nothing to close.")
    expect(unclosedInValue("'Inter, sans-serif")).toBe("A quote isn't closed.")
    expect(unclosedInValue("'Geist (Variable)', sans-serif")).toBeUndefined()
    expect(unclosedInValue("calc(var(--radius) * 2.6)")).toBeUndefined()
  })

  it("lists the tokens a value refers to, and replaces them with what they come to", () => {
    expect(tokenReferences("calc(var(--radius) * 0.8 + var(--gap, 2px))")).toEqual(["radius", "gap"])
    const values: Record<string, string> = { radius: "0.625rem" }
    expect(substituteReferences("calc(var(--radius) * 0.8 + var(--gap, 2px))", (name) => values[name])).toBe(
      "calc(0.625rem * 0.8 + 2px)"
    )
  })

  it("reads a var() in another one's fallback, so a loop can't hide in one", () => {
    expect(tokenReferences("var(--chart-1, var(--safe))")).toEqual(["chart-1", "safe"])
    expect(tokenReferences("calc(var(--a, calc(var(--b) * 2)) + var(--c))")).toEqual(["a", "b", "c"])
    expect(tokenReferences("var(--a, var(--b)")).toEqual(["a", "b"])
    const values: Record<string, string> = { radius: "0.625rem" }
    const lookup = (name: string) => values[name]
    expect(substituteReferences("var(--missing, var(--radius))", lookup)).toBe("0.625rem")
    expect(substituteReferences("calc(var(--missing, calc(var(--radius) * 2)) + 1px)", lookup)).toBe(
      "calc(calc(0.625rem * 2) + 1px)"
    )
    expect(substituteReferences("var(--missing, var(--unknown))", lookup)).toBe("var(--unknown)")
  })

  it("splits a value at the commas outside brackets", () => {
    expect(valueParts("0 1px 2px rgb(0 0 0 / 0.1), 0 2px 4px rgb(0 0 0 / 0.2)")).toEqual([
      "0 1px 2px rgb(0 0 0 / 0.1)",
      "0 2px 4px rgb(0 0 0 / 0.2)"
    ])
    expect(valueParts("cubic-bezier(0.4, 0, 0.2, 1)")).toEqual(["cubic-bezier(0.4, 0, 0.2, 1)"])
  })

  it("splits after a character outside the Basic Multilingual Plane where the comma is", () => {
    expect(valueParts("😀, b")).toEqual(["😀", "b"])
    expect(valueParts('"🎨 Brand", sans-serif')).toEqual(['"🎨 Brand"', "sans-serif"])
  })
})
