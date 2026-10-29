import { describe, expect, it } from "vitest"
import { type AccessibilityFinding, describeAccessibility, describeProblems, describeTokens } from "./client.ts"

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
