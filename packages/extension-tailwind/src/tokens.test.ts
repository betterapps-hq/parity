import { describe, expect, it } from "vite-plus/test"
import { writeTailwindTokens } from "./tokens.ts"

const source = `@import "tailwindcss";

@theme inline {
  --font-sans: 'Geist Variable', sans-serif;
  --color-primary: var(--primary);
}

:root {
  --radius: 0.625rem;
  --primary: oklch(0.205 0 0);
}

.dark {
  --primary: oklch(0.922 0 0);
}
`

/** What Tailwind's own theme holds that the stylesheet doesn't declare. */
const theme = [
  { name: "font-sans", value: "'Geist Variable', sans-serif" },
  { name: "spacing", value: "0.25rem" }
]

describe("writeTailwindTokens", () => {
  it("writes a theme variable into the @theme block that declares it, else a new @theme block", () => {
    const next = writeTailwindTokens(
      source,
      [
        { name: "font-sans", theme: "default", value: "Inter, sans-serif" },
        { name: "spacing", theme: "default", value: "0.3rem" }
      ],
      theme
    )

    expect(next).toContain("@theme inline {\n  --font-sans: Inter, sans-serif;")
    expect(next).toMatch(/\n@theme \{\n {2}--spacing: 0\.3rem;\n\}\n$/)
  })

  it("adds a new token in one of Tailwind's namespaces to @theme, so its class exists (PAR-911)", () => {
    const next = writeTailwindTokens(
      source,
      [
        { name: "text-display", theme: "default", value: "4rem" },
        { name: "shadow-popup", theme: "default", value: "0 8px 24px rgb(0 0 0 / 0.2)" }
      ],
      theme
    )

    expect(next).toMatch(
      /\n@theme \{\n {2}--text-display: 4rem;\n {2}--shadow-popup: 0 8px 24px rgb\(0 0 0 \/ 0\.2\);\n\}\n$/
    )
  })

  it("adds any other new token to the root, and a theme's value to its block, as plain CSS does", () => {
    const next = writeTailwindTokens(
      source,
      [
        { name: "brand", theme: "default", value: "teal" },
        { name: "brand", theme: "dark", value: "aqua" },
        { name: "shadow-popup", theme: "dark", value: "none" }
      ],
      theme
    )

    expect(next).toContain("--primary: oklch(0.205 0 0);\n  --brand: teal;\n}")
    expect(next).toContain(".dark {\n  --primary: oklch(0.922 0 0);\n  --brand: aqua;\n  --shadow-popup: none;\n}")
    expect(next).not.toContain("@theme {")
  })

  it("edits a namespaced variable where the stylesheet declares it, the root included", () => {
    const css = ":root {\n  --radius-card: 1rem;\n}\n"

    expect(writeTailwindTokens(css, [{ name: "radius-card", theme: "default", value: "2rem" }], [])).toBe(
      ":root {\n  --radius-card: 2rem;\n}\n"
    )
  })

  it("takes a value back out of the @theme block it added, leaving the stylesheet as it was", () => {
    const added = writeTailwindTokens(source, [{ name: "spacing", theme: "default", value: "0.3rem" }], theme)
    expect(writeTailwindTokens(added, [{ name: "spacing", theme: "default", value: undefined }], theme)).toBe(source)
  })
})
