import { describe, expect, it } from "vite-plus/test"
import { readDesignTokens } from "./dtcg.ts"
import { describedCategories, describedTokenCss, extractTokens } from "./tokens.ts"

describe("extractTokens", () => {
  it("collects root and theme values and categorizes them", () => {
    const css = [
      "@layer theme { :host, :host { --spacing: 0.25rem; --text-sm: 0.875rem; --text-sm--line-height: 1.43; } }",
      ":host { --background: oklch(1 0 0); --radius: 0.625rem; --tw-ring: 0; }",
      ".dark { --background: oklch(0.145 0 0); }"
    ].join("\n")
    const tokens = extractTokens(css)
    expect(tokens.find((t) => t.name === "background")).toEqual({
      name: "background",
      category: "color",
      source: "semantic",
      values: { default: "oklch(1 0 0)", dark: "oklch(0.145 0 0)" }
    })
    expect(tokens.find((t) => t.name === "spacing")?.category).toBe("spacing")
    expect(tokens.find((t) => t.name === "text-sm")?.category).toBe("font-size")
    expect(tokens.find((t) => t.name === "radius")?.category).toBe("radius")
    expect(tokens.some((t) => t.name.startsWith("tw-"))).toBe(false)
  })
})

describe("extractTokens with at-rules", () => {
  it("keeps the default's value when a prefers-color-scheme block overrides it", () => {
    const css = [
      ":root { --c: #fff; }",
      "@media (prefers-color-scheme: dark) { :root { --c: #00f; } }",
      ".dark { --c: #000; }"
    ].join("\n")
    expect(extractTokens(css).find((t) => t.name === "c")?.values).toEqual({ default: "#fff", dark: "#000" })
  })

  it("leaves out a token only a media query declares", () => {
    const css = "@media (prefers-color-scheme: dark) { :host { --only-dark: #00f; } }"
    expect(extractTokens(css).some((t) => t.name === "only-dark")).toBe(false)
  })

  it("reads values under @layer and @supports as the theme they'd be without them", () => {
    const css = [
      "@layer base { :host { --c: #fff; } }",
      "@supports (color: oklch(0 0 0)) { @layer base { :host { --c: oklch(1 0 0); } .dark { --c: oklch(0 0 0); } } }"
    ].join("\n")
    expect(extractTokens(css).find((t) => t.name === "c")?.values).toEqual({
      default: "oklch(1 0 0)",
      dark: "oklch(0 0 0)"
    })
  })
})

describe("library tokens in frames", () => {
  it("declares run-time tokens before the project's styles, files them by category, and pairs line heights", async () => {
    const described = await readDesignTokens(
      {
        "font-size": {
          base300: {
            $value: "14px",
            $extensions: { parity: { var: "fontSizeBase300", lineHeight: "lineHeightBase300" } }
          }
        },
        leading: { base300: { $value: "20px", $extensions: { parity: { var: "lineHeightBase300" } } } },
        spacing: { m: { $value: "12px", $extensions: { parity: { var: "spacingHorizontalM" } } } }
      },
      async () => ({})
    )
    const css = describedTokenCss(described)
    expect(css).toContain("--fontSizeBase300--line-height: var(--lineHeightBase300);")
    // The project's own declaration, later in the stylesheet, wins over the library's.
    const tokens = extractTokens(`${css}:host { --spacingHorizontalM: 16px }`, [], describedCategories(described))
    const byName = Object.fromEntries(tokens.map((token) => [token.name, token]))
    expect(byName.spacingHorizontalM?.category).toBe("spacing")
    expect(byName.fontSizeBase300?.category).toBe("font-size")
    expect(byName.lineHeightBase300?.category).toBe("leading")
    expect(byName.spacingHorizontalM?.values.default).toBe("16px")
  })
})
