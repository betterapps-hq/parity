import { readFileSync } from "node:fs"
import { describe, expect, it } from "vite-plus/test"
import { type InferredKind, inferTokenKind, simplifyCalc } from "./inference.ts"
import { resolveReferences } from "./kinds.ts"

interface Labelled {
  library: string
  name: string
  values: { default: string; dark?: string }
  /** What the library itself files it as. */
  label: InferredKind
}

/**
 * Every token of five libraries, read from their npm packages, each with the kind its library files it under: Chakra
 * 3.37.0, Fluent 9.75.0, Mantine 8.3.18, MUI 7.3.11 and Shadcn Nova 0.4.2 on Tailwind 4.3.3. The rules were made from
 * these. Primer Primitives 11.10.0 was checked after, labelled from its own `$type` and Figma scopes, not its names:
 * 99.7% before it was added, and its three misses that were the rules' were fixed. Where a label differs from what the
 * library states, `corrected` keeps the library's.
 */
const labelled = JSON.parse(
  readFileSync(new URL("../fixtures/token-categories.json", import.meta.url), "utf8")
) as Labelled[]

describe("inferTokenKind", () => {
  it("files every token in the fixture as its library does, and reports how often for each library", () => {
    const byLibrary = Map.groupBy(labelled, (token) => token.library)
    const accuracy: Record<string, string> = {}
    const misses: string[] = []
    for (const [library, tokens] of byLibrary) {
      const values = new Map(tokens.map((token) => [token.name, token.values.default]))
      let right = 0
      for (const token of tokens) {
        const value = resolveReferences(token.values.default, (name) => values.get(name))
        const kind = inferTokenKind(token.name, value)
        if (kind === token.label) right++
        else misses.push(`${library} ${token.name} = ${value}: ${kind}, not ${token.label}`)
      }
      accuracy[library] = `${((100 * right) / tokens.length).toFixed(1)}% of ${tokens.length}`
    }
    console.log("Token kinds inferred as each library files them:", accuracy)
    expect(misses).toEqual([])
  })

  it("lets the value decide, and the name only choose among what the value allows", () => {
    // Mantine's `color-text` is black, whatever its name says.
    expect(inferTokenKind("mantine-color-text", "#000")).toBe("color")
    expect(inferTokenKind("radius-md", "0.375rem")).toBe("radius")
    expect(inferTokenKind("fontSizeBase300", "14px")).toBe("font-size")
    expect(inferTokenKind("shadow2", "0 0 2px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.14)")).toBe("shadow")
    expect(inferTokenKind("drop-shadow-md", "0 3px 3px rgb(0 0 0 / 0.12)")).toBe("drop-shadow")
  })

  it("chooses nothing when neither the value nor the name settles it", () => {
    expect(inferTokenKind("mantine-scale", "1")).toBe("setting")
    expect(inferTokenKind("sidebar-gutter-thing", "12px")).toBe("spacing")
    expect(inferTokenKind("sidebar-thing", "12px")).toBe("setting")
  })

  it("takes the kind a DTCG type states, and narrows by one that only says it's a length", () => {
    expect(inferTokenKind("brand", "16px", "dimension")).toBe("setting")
    expect(inferTokenKind("brand-gap", "16px", "dimension")).toBe("spacing")
    expect(inferTokenKind("heading", "600 1rem/1.5 Inter, sans-serif", "typography")).toBe("type-style")
    expect(inferTokenKind("brand", "#fff", "color")).toBe("color")
  })

  it("reads the group after the name, leaves 0 a length when typed a number, and lets the name decide a bare var()", () => {
    expect(inferTokenKind("brand-lg", "12px", undefined, "spacing")).toBe("spacing")
    expect(inferTokenKind("radius-lg", "12px", undefined, "spacing")).toBe("radius")
    expect(inferTokenKind("radius-none", "0", "number")).toBe("radius")
    expect(inferTokenKind("brand", "0", "dimension", "spacing")).toBe("spacing")
    expect(inferTokenKind("radius-md", "var(--unknown)")).toBe("radius")
    expect(inferTokenKind("brand", "var(--unknown)")).toBe("setting")
    expect(inferTokenKind("font-size-inherit", "inherit")).toBe("font-size")
  })

  it("takes a shadow with a named color or a variable as one", () => {
    expect(inferTokenKind("shadow-sm", "0 1px 2px black")).toBe("shadow")
    expect(inferTokenKind("ring", "0 0 0 1px currentColor")).toBe("setting")
    expect(inferTokenKind("shadow-ring", "0 0 0 1px currentColor")).toBe("shadow")
    expect(inferTokenKind("shadow-md", "0 1px 2px var(--unknown)")).toBe("shadow")
  })

  it("works out a simple calc() in pixels", () => {
    expect(simplifyCalc("calc(1rem * 1.5)")).toBe("24px")
    expect(simplifyCalc("calc(0.625rem - 4px)")).toBe("6px")
    expect(simplifyCalc("calc(100% - 4px)")).toBe("calc(100% - 4px)")
  })
})
