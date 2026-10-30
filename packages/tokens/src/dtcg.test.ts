import { describe, expect, it } from "vite-plus/test"
import { readDesignTokens } from "./dtcg.ts"

const files: Record<string, unknown> = {
  "tokens/base.tokens.json": {
    color: {
      $type: "color",
      neutral: {
        "950": { $value: { colorSpace: "srgb", components: [0.04, 0.04, 0.04], hex: "#0a0a0a" } },
        "50": { $value: { colorSpace: "oklch", components: [0.985, 0, 0] } }
      }
    },
    radius: { $type: "dimension", md: { $value: { value: 0.5, unit: "rem" }, $description: "Cards and inputs" } },
    font: { sans: { $type: "fontFamily", $value: ["Geist Variable", "sans-serif"] } }
  },
  "tokens/light.tokens.json": {
    color: { primary: { $type: "color", $value: "{color.neutral.950}", $description: "Buttons and links" } }
  },
  "tokens/dark.tokens.json": { color: { primary: { $type: "color", $value: "{color.neutral.50}" } } }
}

const read = async (path: string) => {
  if (!(path in files)) throw new Error(`No file ${path}`)
  return structuredClone(files[path])
}

describe("readDesignTokens", () => {
  it("reads a token file: types from the groups around a token, descriptions, and values as CSS", async () => {
    const tokens = await readDesignTokens("base.tokens.json", read, "tokens")
    expect(tokens).toEqual([
      { path: "color.neutral.50", type: "color", values: { default: "oklch(0.985 0 0)" } },
      { path: "color.neutral.950", type: "color", values: { default: "#0a0a0a" } },
      { path: "radius.md", type: "dimension", description: "Cards and inputs", values: { default: "0.5rem" } },
      { path: "font.sans", type: "fontFamily", values: { default: '"Geist Variable", sans-serif' } }
    ])
  })

  it("layers a resolver's sets and themes, following aliases, and keeps per theme only what differs", async () => {
    const resolver = {
      version: "2025-10-01",
      sets: { base: { sources: [{ $ref: "base.tokens.json" }] } },
      modifiers: {
        theme: {
          contexts: { light: [{ $ref: "light.tokens.json" }], dark: [{ $ref: "dark.tokens.json" }] },
          default: "light"
        }
      },
      resolutionOrder: [{ $ref: "#/sets/base" }, { $ref: "#/modifiers/theme" }]
    }
    const tokens = await readDesignTokens(resolver, read, "tokens")
    expect(tokens.find((token) => token.path === "color.primary")).toEqual({
      path: "color.primary",
      type: "color",
      description: "Buttons and links",
      values: { default: "#0a0a0a", dark: "oklch(0.985 0 0)" }
    })
    expect(tokens.find((token) => token.path === "radius.md")?.values).toEqual({ default: "0.5rem" })
  })

  it("says which alias is broken", async () => {
    await expect(readDesignTokens({ a: { $type: "color", $value: "{color.missing}" } }, read)).rejects.toThrow(
      "{color.missing}"
    )
  })
})
