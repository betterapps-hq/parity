import { prepareCanvasCss, type TokenCategory } from "@parity-app/core"
import { extractTokens } from "@parity-app/tokens"
import { describe, expect, it } from "vite-plus/test"
import { cssTokens } from "./tokens.ts"

/**
 * Libgen reads a library's source CSS and the app reads a project's CSS as frames get it, and the two must agree on
 * every token's themes and category: both use the rules in `@parity-app/tokens`'s `policy.ts`.
 */
interface Case {
  name: string
  css: string
  /** By token: its category and values, or undefined when it isn't a token. */
  expected: Record<string, { category: TokenCategory; values: Record<string, string> } | undefined>
}

const cases: Case[] = [
  {
    name: "font sizes by name, however they're written",
    css: ":root { --fontSizeBase300: 16px; --mantine-font-size-md: 1rem; --text-sm: 0.875rem; --text-wrap: balance }",
    expected: {
      fontSizeBase300: { category: "font-size", values: { default: "16px" } },
      "mantine-font-size-md": { category: "font-size", values: { default: "1rem" } },
      "text-sm": { category: "font-size", values: { default: "0.875rem" } },
      "text-wrap": { category: "other", values: { default: "balance" } }
    }
  },
  {
    name: "colours by name or value",
    css: ":root { --brand: #f00; --text-color: var(--brand); --colorNeutralBackground1: white }",
    expected: {
      brand: { category: "color", values: { default: "#f00" } },
      "text-color": { category: "color", values: { default: "var(--brand)" } },
      colorNeutralBackground1: { category: "color", values: { default: "white" } }
    }
  },
  {
    name: "spacing by name",
    css: ":root { --mantine-spacing-md: 1rem; --spacingHorizontalM: 12px; --app-gap: 8px; --letter-spacing: 0.01em }",
    expected: {
      "mantine-spacing-md": { category: "spacing", values: { default: "1rem" } },
      spacingHorizontalM: { category: "spacing", values: { default: "12px" } },
      "app-gap": { category: "spacing", values: { default: "8px" } },
      "letter-spacing": { category: "tracking", values: { default: "0.01em" } }
    }
  },
  {
    name: "a theme as an attribute",
    css: ':root { --c: #fff } [data-theme="dark"] { --c: #000 }',
    expected: { c: { category: "color", values: { default: "#fff", dark: "#000" } } }
  },
  {
    name: "a theme as a class, alone or on the root",
    css: ":root { --c: #fff; --d: #eee } .dark { --c: #000 } html.dark { --d: #111 }",
    expected: {
      c: { category: "color", values: { default: "#fff", dark: "#000" } },
      d: { category: "color", values: { default: "#eee", dark: "#111" } }
    }
  },
  {
    name: "light as the default",
    css: ":root { --c: #fff } [data-scheme='light'] { --c: #fafafa } [data-scheme='dark'] { --c: #000 }",
    expected: { c: { category: "color", values: { default: "#fafafa", dark: "#000" } } }
  },
  {
    name: "a prefers-color-scheme block staying out of the default",
    css: ":root { --c: #fff } .dark { --c: #000 } @media (prefers-color-scheme: dark) { :root { --c: #00f } }",
    expected: { c: { category: "color", values: { default: "#fff", dark: "#000" } } }
  },
  {
    name: "two dark sources, the later winning as in the cascade",
    css: ':root { --c: #fff } .dark { --c: #111 } [data-theme="dark"] { --c: #222 }',
    expected: { c: { category: "color", values: { default: "#fff", dark: "#222" } } }
  },
  {
    name: "layers and feature checks keeping their theme",
    css: "@layer base { :root { --radius: 4px } } @supports (color: red) { @layer base { .dark { --radius: 2px } } }",
    expected: { radius: { category: "radius", values: { default: "4px", dark: "2px" } } }
  },
  {
    name: "a component's own variables, which aren't tokens",
    css: ":root { --c: #fff } .card { --card-pad: 4px } .dark .card { --c: #000 } @media (width > 1px) { :root { --w: 1 } }",
    expected: { c: { category: "color", values: { default: "#fff" } }, "card-pad": undefined, w: undefined }
  }
]

/** What libgen and the app each read from the CSS, by token. */
function readBoth(css: string) {
  const library = new Map(cssTokens(css).map((token) => [token.var, token]))
  const compiled = prepareCanvasCss(css, { baseUrl: "http://localhost" }).scoped
  const project = new Map(extractTokens(compiled).map((token) => [token.name, token]))
  return { library, project }
}

describe("libgen and the app reading the same CSS", () => {
  it.each(cases)("agree on $name", ({ css, expected }) => {
    const { library, project } = readBoth(css)
    for (const [name, want] of Object.entries(expected)) {
      const fromLibrary = library.get(name)
      const fromProject = project.get(name)
      expect(
        fromLibrary && { category: fromLibrary.category, values: fromLibrary.values },
        `libgen, --${name}`
      ).toEqual(want)
      expect(fromProject && { category: fromProject.category, values: fromProject.values }, `app, --${name}`).toEqual(
        want
      )
    }
  })

  it("differ only in that libgen reads a prefers-color-scheme block as its theme", () => {
    const { library, project } = readBoth(
      ":root { --c: #fff; --d: #eee } .dark { --d: #222 } @media (prefers-color-scheme: dark) { :root { --c: #000; --d: #111 } }"
    )
    // A theme's own selector beats the media query wherever it is.
    expect(library.get("c")?.values).toEqual({ default: "#fff", dark: "#000" })
    expect(library.get("d")?.values).toEqual({ default: "#eee", dark: "#222" })
    expect(project.get("c")?.values).toEqual({ default: "#fff" })
    expect(project.get("d")?.values).toEqual({ default: "#eee", dark: "#222" })
  })
})
