import { describe, expect, it } from "vite-plus/test"
import { holdsWhen, parseWhen, type WhenContext, type WhenValue, whenKeys } from "./when.ts"

/** A context with these keys, the tools named, and a target. */
function context(values: Record<string, WhenValue>, uses: string[] = [], target?: string): WhenContext {
  const made: WhenContext = { value: (key) => values[key], uses: (tool) => uses.includes(tool) }

  if (target !== undefined) {
    made.target = target
  }

  return made
}

describe("when and enablement", () => {
  const route = context(
    { "node.type": "route", "selection.count": 2, tool: "select", "fact.load": "620", "timings.measured": true },
    ["storybook"]
  )

  it.each([
    ["node.type == route", true],
    ["node.type != route", false],
    ["node.type == component", false],
    ["selection.count > 1", true],
    ["selection.count >= 3", false],
    ["tool == select", true],
    ["project.uses(storybook)", true],
    ["project.uses(tailwind)", false],
    ["fact.load > 500", true],
    ["fact.load <= 500", false],
    ["timings.measured", true],
    ["!timings.measured", false],
    ["timings.unset", false],
    ["timings.unset != yes", true],
    ["node.type == route && selection.count > 1", true],
    ["node.type == component || tool == select", true],
    ["!(node.type == route && tool == hand)", true],
    ["node.type == 'route'", true]
  ])("%s is %s", (text, expected) => {
    expect(holdsWhen(text, route)).toBe(expected)
  })

  it("holds a list key for what it lists", () => {
    const stories = { "storybook.hasStories": ["Button", "Card"] }

    expect(holdsWhen("storybook.hasStories", context(stories, [], "Button"))).toBe(true)
    expect(holdsWhen("storybook.hasStories", context(stories, [], "Badge"))).toBe(false)
    expect(holdsWhen("storybook.hasStories", context(stories))).toBe(false)
  })

  it("holds when there's no expression, and not when it doesn't read", () => {
    expect(holdsWhen(undefined, route)).toBe(true)
    expect(holdsWhen("node.type ==", route)).toBe(false)
  })

  it("names what's wrong with one that doesn't read", () => {
    expect(() => parseWhen("")).toThrow("is empty")
    expect(() => parseWhen("node.type ==")).toThrow('expected a value after "=="')
    expect(() => parseWhen("(tool == select")).toThrow('expected ")"')
    expect(() => parseWhen("tool select")).toThrow('didn\'t expect "select"')
    expect(() => parseWhen("node.count(2)")).toThrow("project.uses(tool) is")
  })

  it("lists the keys an expression looks up", () => {
    expect(whenKeys(parseWhen("node.type == route && !timings.measured || project.uses(storybook)"))).toEqual([
      "node.type",
      "timings.measured"
    ])
  })
})
