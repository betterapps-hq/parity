import { describe, expect, it } from "vite-plus/test"
import { groupWarnings, warningLine } from "./warnings.ts"

describe("warning groups", () => {
  it("gathers one finding in many places into a group with a count and every place", () => {
    const at = Array.from({ length: 12 }, (_, index) => `home/row${index}`)

    const groups = groupWarnings(
      at.map((place) => ({ category: "unnamed_layout", message: "name layouts that group things", at: place }))
    )

    expect(groups).toEqual([
      { category: "unnamed_layout", severity: "suggestion", message: "name layouts that group things", count: 12, at }
    ])
    expect(warningLine(groups[0]!)).toBe(
      "12 places (home/row0, home/row1, home/row2, home/row3, home/row4 and 7 more): name layouts that group things"
    )
  })

  it("counts a place once when the same finding repeats there", () => {
    const repeated = { category: "not_a_token" as const, message: 'background "pink" isn\'t a token', at: "home/card" }
    const [group] = groupWarnings([repeated, repeated, { ...repeated, at: "home/hero" }])
    expect(group).toMatchObject({ count: 2, at: ["home/card", "home/hero"] })
  })

  it("keeps different messages and categories apart, errors first and suggestions last", () => {
    const groups = groupWarnings([
      { category: "unnamed_layout", message: "name it", at: "home/a" },
      { category: "unknown_prop", message: 'Button has no prop "size"', at: "home/b" },
      { category: "unknown_prop", message: 'Button has no prop "tone"', at: "home/c" },
      { category: "render_failed", message: "failed to render: boom", at: "Home (Default, Desktop)" },
      { category: "overlap", message: "Home (home) overlaps Pricing (pricing)" }
    ])

    expect(groups.map((group) => [group.severity, group.category, group.count])).toEqual([
      ["error", "render_failed", 1],
      ["warning", "unknown_prop", 1],
      ["warning", "unknown_prop", 1],
      ["warning", "overlap", 1],
      ["suggestion", "unnamed_layout", 1]
    ])
    expect(groups.map(warningLine)).toEqual([
      "Home (Default, Desktop): failed to render: boom",
      'home/b: Button has no prop "size"',
      'home/c: Button has no prop "tone"',
      "Home (home) overlaps Pricing (pricing)",
      "home/a: name it"
    ])
  })
})
