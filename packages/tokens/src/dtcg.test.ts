import { describe, expect, it } from "vite-plus/test"
import { readDesignTokens, type SkippedToken } from "./dtcg.ts"

const files = new Map(
  Object.entries({
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
  })
)

const read = async (path: string) => {
  if (!files.has(path)) {
    throw new Error(`No file ${path}`)
  }

  return structuredClone(files.get(path))
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

  it("writes composite values as CSS, following aliases inside them", async () => {
    const px = (value: number) => ({ value, unit: "px" })

    const tokens = await readDesignTokens(
      {
        line: { $type: "color", $value: "#e5e5e5" },
        card: {
          $type: "shadow",
          $value: { color: { colorSpace: "srgb", components: [0, 0, 0], alpha: 0.1 }, offsetY: px(1), blur: px(3) }
        },
        body: {
          $type: "typography",
          $value: {
            fontFamily: ["Geist Variable", "sans-serif"],
            fontSize: { value: 1, unit: "rem" },
            fontWeight: 600,
            lineHeight: 1.5
          }
        },
        divider: { $type: "border", $value: { color: "{line}", width: px(1), style: "solid" } },
        fade: {
          $type: "transition",
          $value: {
            duration: { value: 200, unit: "ms" },
            delay: { value: 0, unit: "ms" },
            timingFunction: [0.4, 0, 0.2, 1]
          }
        },
        sky: {
          $type: "gradient",
          $value: [
            { color: "#fff", position: 0 },
            { color: "#000", position: 1 }
          ]
        }
      },
      read
    )

    expect(Object.fromEntries(tokens.map((token) => [token.path, token.values.default]))).toEqual({
      line: "#e5e5e5",
      card: "0 1px 3px 0 rgb(0 0 0 / 0.1)",
      body: '600 1rem/1.5 "Geist Variable", sans-serif',
      divider: "1px solid #e5e5e5",
      fade: "200ms cubic-bezier(0.4, 0, 0.2, 1) 0ms",
      sky: "linear-gradient(#fff 0%, #000 100%)"
    })
  })
})

describe("readDesignTokens with malformed tokens", () => {
  /** The tokens read from `document`, by path, and what was skipped. */
  async function readSkipping(document: Parameters<typeof readDesignTokens>[0]) {
    const skipped: SkippedToken[] = []
    const tokens = await readDesignTokens(document, read, "", (entry) => skipped.push(entry))

    return { paths: tokens.map((token) => token.path), tokens, skipped }
  }

  it.each([
    ["color", { colorSpace: "srgb", components: [1, 0] }, "/$value/components: expected 3 components"],
    ["dimension", { value: "4", unit: "px" }, "/$value/value: expected a number"],
    ["shadow", { color: "#000", offsetX: 2 }, "/$value/offsetX: expected a string or an object"],
    ["typography", { fontFamily: "Inter" }, "/$value/fontSize: expected a string or an object"],
    ["border", { color: "#000", width: "1px" }, "/$value/style: expected a string or an object"],
    [
      "transition",
      { duration: "200ms", delay: "0ms", timingFunction: [0, 0, 1.5, 1] },
      "/$value/timingFunction/2: expected at most 1"
    ],
    ["gradient", [{ color: "#fff", position: 0 }, { color: "#000" }], "/$value/1/position: expected a number"]
  ])("skips a malformed %s, says why, and reads the rest of the file", async (type, value, problem) => {
    const { paths, skipped } = await readSkipping({ bad: { $type: type, $value: value }, good: { $value: "1px" } })
    expect(paths).toEqual(["good"])
    expect(skipped).toEqual([{ path: "bad", problem }])
  })

  it("skips a token whose own fields are malformed", async () => {
    const { paths, skipped } = await readSkipping({ note: { $value: "1px", $description: 4 } })
    expect(paths).toEqual([])
    expect(skipped).toEqual([{ path: "note", problem: "/$description: expected a string" }])
  })

  it("skips a value malformed in one context only there, and reports each problem once", async () => {
    const { tokens, skipped } = await readSkipping({
      sets: {
        base: {
          sources: [
            { radius: { $type: "dimension", $value: { value: 4, unit: "px" } }, bad: { $type: "color", $value: 5 } }
          ]
        }
      },
      modifiers: {
        theme: {
          contexts: {
            light: [],
            dark: [{ radius: { $type: "dimension", $value: { value: 6, unit: "pixels!" } } }]
          }
        }
      },
      resolutionOrder: [{ $ref: "#/sets/base" }, { $ref: "#/modifiers/theme" }]
    })

    expect(tokens).toEqual([{ path: "radius", type: "dimension", values: { default: "4px" } }])
    expect(skipped).toEqual([
      { path: "bad", problem: "/$value: expected a string or an object" },
      { path: "radius", problem: "/$value/unit: expected a unit such as px or rem" }
    ])
  })

  it("skips a resolver's malformed sets, modifiers and steps, saying where they are", async () => {
    const { paths, skipped } = await readSkipping({
      sets: { base: { sources: [{ gap: { $value: "4px" } }] }, broken: { sources: "base.tokens.json" } },
      modifiers: { theme: { contexts: "light" } },
      resolutionOrder: [{ $ref: "#/sets/base" }, { sources: 5 }, "#/sets/broken"]
    })

    expect(paths).toEqual(["gap"])
    expect(skipped).toEqual([
      { path: "/sets/broken", problem: "/sources: expected an array" },
      { path: "/modifiers/theme", problem: "/contexts: expected an object" },
      { path: "/resolutionOrder/1", problem: "/sources: expected an array" },
      { path: "/resolutionOrder/2", problem: "/: expected an object" }
    ])
  })
})
