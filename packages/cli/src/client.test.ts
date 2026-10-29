import { describe, expect, it } from "vitest"
import {
  type AccessibilityFinding,
  describeAccessibility,
  describeComponents,
  describeProblems,
  describeTokens
} from "./client.ts"

const tab = { id: "D:/app", name: "app" }

describe("describeProblems", () => {
  it("lists each problem once, with the frames it's in", () => {
    const text = describeProblems({
      tab,
      design: { id: "dashboard", name: "Dashboard" },
      frames: 4,
      warnings: [],
      problems: [
        { state: "default", mode: "mobile", problem: "content is wider than the 390px frame" },
        { state: "loading", mode: "mobile", problem: "content is wider than the 390px frame" },
        { state: "default", mode: "desktop", problem: "cut off by a parent that clips", node: "stats" },
        { state: "loading", mode: "desktop", problem: "cut off by a parent that clips", node: "stats" },
        { state: "default", mode: "mobile", problem: "cut off by a parent that clips", node: "stats" },
        { state: "loading", mode: "mobile", problem: "cut off by a parent that clips", node: "stats" }
      ]
    })
    expect(text).toBe(
      [
        "2 problems in Dashboard (dashboard), 4 frames:",
        "  content is wider than the 390px frame, in default, loading in mobile",
        "  stats: cut off by a parent that clips, in every frame"
      ].join("\n")
    )
  })

  it("says when there's nothing to fix", () => {
    const text = describeProblems({ tab, design: { id: "home", name: "Home" }, frames: 1, warnings: [], problems: [] })
    expect(text).toBe("No problems found in Home (home), 1 frame.")
  })
})

describe("describeComponents", () => {
  it("lists the project's components, then the exports left out and why", () => {
    const text = describeComponents({
      components: ["PromoTag", "ui/Button"],
      leftOut: [
        { name: "PromoPrice", path: "src/promo.tsx", reason: "returns string only" },
        { name: "Loose", path: "src/promo.tsx", reason: "its type is any", undecided: true }
      ]
    })
    expect(text).toBe(
      [
        "The project's own:",
        "  PromoTag",
        "",
        "ui, as ui/Name:",
        "  Button",
        "",
        "Not components:",
        "  PromoPrice, in src/promo.tsx: returns string only",
        "  Loose, in src/promo.tsx: can't tell, its type is any"
      ].join("\n")
    )
  })

  it("says which components fail to draw and why, and what was corrected by hand", () => {
    const text = describeComponents({
      components: ["PromoGate", "PromoPrice"],
      drawn: 12,
      failing: [
        {
          id: "PromoGate",
          problem: "provider",
          reason: "Needs a provider, which a decorator can add: PromoGate must be used within a PromoProvider"
        }
      ],
      corrections: {
        include: [{ path: "src/promo.tsx", export: "PromoPrice" }],
        exclude: [{ path: "src/pages/legacy.tsx", export: "default" }]
      }
    })
    expect(text).toBe(
      [
        "The project's own:",
        "  PromoGate, PromoPrice",
        "",
        "Failing to draw on the canvas, 1 of 13 drawn so far:",
        "  PromoGate: Needs a provider, which a decorator can add: PromoGate must be used within a PromoProvider",
        "",
        "Corrected by hand in the project file:",
        "  listed: PromoPrice, in src/promo.tsx",
        "  taken off: the default export, in src/pages/legacy.tsx"
      ].join("\n")
    )
  })
})

describe("describeAccessibility", () => {
  const finding = (node: string, state: string): AccessibilityFinding => ({
    state,
    mode: "desktop",
    rule: "color-contrast",
    impact: "serious",
    help: "Elements must meet minimum color contrast ratio thresholds",
    helpUrl: "https://dequeuniversity.com/rules/axe/4.14/color-contrast",
    node,
    name: "Member row",
    detail: "#737373 on #f5f5f5 is 4.34:1, and 14px text needs 4.5:1."
  })

  it("puts alike layers, such as list rows, on one line", () => {
    const text = describeAccessibility({
      tab,
      design: { id: "team", name: "Team" },
      frames: 3,
      warnings: [],
      findings: [
        finding("row-1", "default"),
        finding("row-2", "default"),
        finding("row-1", "error"),
        finding("row-2", "error")
      ]
    })
    expect(text).toContain(
      "  Member row (row-1, row-2), in default, error in desktop: #737373 on #f5f5f5 is 4.34:1, and 14px text needs 4.5:1."
    )
    expect(text.split("\n")[0]).toBe("1 rule broken in Team (team), 3 frames, with axe-core against WCAG 2.2 AA.")
  })
})

describe("describeTokens", () => {
  it("groups tokens by category and lists the default theme first", () => {
    const text = describeTokens([
      {
        name: "muted-foreground",
        category: "color",
        source: "semantic",
        values: { dark: "#a1a1a1", default: "#737373" }
      }
    ])
    expect(text).toContain("color, semantic:\n  muted-foreground: default #737373, dark #a1a1a1")
  })
})
