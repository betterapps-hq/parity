import { describe, expect, it } from "vitest"
import { setCustomProperty } from "./css-source.ts"
import { extractTokens, themeFallbackCss } from "./tokens.ts"

const source = `@import "tailwindcss";

@theme inline {
  --font-sans: 'Geist Variable', sans-serif;
  --color-primary: var(--primary);
}

/* Light theme */
:root {
  --radius: 0.625rem;
  --primary: oklch(0.205 0 0); /* brand */
  --background: oklch(1 0 0);
}

.dark {
  --primary: oklch(0.922 0 0);
}

@layer base {
  * { border-color: var(--border); }
}
`

describe("setCustomProperty", () => {
  it("replaces a value in place, keeping comments and formatting", () => {
    const next = setCustomProperty(source, "primary", "oklch(0.5 0.2 260)", { blocks: [":root"], create: ":root" })
    expect(next).toContain("--primary: oklch(0.5 0.2 260); /* brand */")
    expect(next).toContain(".dark {\n  --primary: oklch(0.922 0 0);")
    expect(next.length - source.length).toBe("oklch(0.5 0.2 260)".length - "oklch(0.205 0 0)".length)
  })

  it("edits the theme class's own declaration", () => {
    const next = setCustomProperty(source, "primary", "red", { blocks: [".dark"], create: ".dark" })
    expect(next).toContain(".dark {\n  --primary: red;")
    expect(next).toContain("--primary: oklch(0.205 0 0); /* brand */")
  })

  it("adds a missing declaration to the block, matching its indentation", () => {
    const next = setCustomProperty(source, "background", "black", { blocks: [".dark"], create: ".dark" })
    expect(next).toContain(".dark {\n  --primary: oklch(0.922 0 0);\n  --background: black;\n}")
  })

  it("creates the block when the stylesheet has none", () => {
    const next = setCustomProperty("body { margin: 0 }", "color-brand", "#f00", {
      blocks: ["@theme"],
      create: "@theme"
    })
    expect(next).toBe("body { margin: 0 }\n\n@theme {\n  --color-brand: #f00;\n}\n")
  })

  it("doesn't match a prefix of another property or a nested block", () => {
    const css = ":root {\n  --radius-lg: 1rem;\n  @media (x) { --radius: 9px; }\n}\n"
    expect(setCustomProperty(css, "radius", "2px", { blocks: [":root"], create: ":root" })).toBe(
      ":root {\n  --radius-lg: 1rem;\n  @media (x) { --radius: 9px; }\n  --radius: 2px;\n}\n"
    )
  })
})

describe("extractTokens", () => {
  const compiled = ":host { --primary: oklch(0.2 0 0); --spacing: 0.25rem; }\n.dark { --primary: oklch(0.9 0 0); }"
  const theme = [
    { name: "spacing", value: "0.25rem" },
    { name: "color-primary", value: "var(--primary)" },
    { name: "color-red-500", value: "oklch(0.637 0.237 25.331)" },
    { name: "text-sm", value: "0.875rem" },
    { name: "text-sm--line-height", value: "calc(1.25 / 0.875)" }
  ]

  it("adds the framework's theme and tells semantic tokens from the scale", () => {
    const tokens = extractTokens(compiled, theme)
    const own = tokens.filter((token) => !token.derived)
    expect(own.map((token) => [token.name, token.source, token.category])).toEqual([
      ["color-red-500", "theme", "color"],
      ["primary", "semantic", "color"],
      ["spacing", "theme", "spacing"],
      ["text-sm", "theme", "font-size"]
    ])
    expect(tokens.find((token) => token.name === "primary")?.values).toEqual({
      default: "oklch(0.2 0 0)",
      dark: "oklch(0.9 0 0)"
    })

    // The spacing scale's steps are listed as tokens of their own, following the base.
    expect(tokens.find((token) => token.name === "spacing-4")).toMatchObject({
      category: "spacing",
      derived: { from: "spacing", factor: 4 },
      values: { default: "calc(var(--spacing) * 4)" }
    })
  })

  it("takes a class as a theme only when it overrides the root's tokens", () => {
    const tokens = extractTokens(`${compiled}
.scroll-fade-b { --_scroll-fade-size-b: 12%; }`)
    expect(new Set(tokens.flatMap((token) => Object.keys(token.values)))).toEqual(new Set(["default", "dark"]))
    expect(tokens.find((token) => token.name === "_scroll-fade-size-b")).toBeUndefined()
  })

  it("declares the theme variables compiled CSS left out", () => {
    const css = themeFallbackCss(compiled, theme)
    expect(css).toContain("--color-red-500: oklch(0.637 0.237 25.331);")
    expect(css).toContain("--text-sm--line-height: calc(1.25 / 0.875);")
    expect(css).not.toContain("--spacing:")
  })
})
