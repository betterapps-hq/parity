import { describe, expect, it } from "vite-plus/test"
import type { ProjectStorybook } from "./storybook.ts"
import { componentStories, setupGuide, storiesTree, storyName } from "./views.ts"

const storybook: ProjectStorybook = {
  configDir: ".storybook",
  stories: {
    Card: [{ path: "src/card.stories.tsx" }],
    Button: [
      { path: "src/button.stories.tsx", exports: ["Primary", "PrimaryLarge"] },
      { path: "src/button.sizes.stories.tsx", exports: ["Size_2"] }
    ],
    Badge: []
  }
}

const button = { type: "component", key: "Button" }

describe("the Storybook extension's views", () => {
  it("names stories as Storybook does", () => {
    expect(storyName("PrimaryLarge")).toBe("Primary Large")
    expect(storyName("Size_2")).toBe("Size 2")
    expect(storyName("H1Heading")).toBe("H 1 Heading")
  })

  it("lists components with stories by name, each with its stories under it", () => {
    const { items, options } = storiesTree(storybook)

    expect(options.itemActions).toEqual([{ command: "storybook.open" }])
    expect(items.map((item) => [item.key, item.label, item.parent, item.detail])).toEqual([
      ["Button", "Button", undefined, "3 stories"],
      ["src/button.stories.tsx#Primary", "Primary", "Button", "button.stories.tsx"],
      ["src/button.stories.tsx#PrimaryLarge", "Primary Large", "Button", "button.stories.tsx"],
      ["src/button.sizes.stories.tsx#Size_2", "Size 2", "Button", "button.sizes.stories.tsx"],
      ["Card", "Card", undefined, "1 story"],
      ["src/card.stories.tsx", "card.stories.tsx", "Card", "src/card.stories.tsx"]
    ])
    expect(items.every((item) => item.target?.type === "component")).toBe(true)
  })

  it("gives the Design tab's section every story, each about its component", () => {
    const { items } = componentStories(storybook)

    expect(items.filter((item) => item.target?.key === "Button").map((item) => item.label)).toEqual([
      "Primary",
      "Primary Large",
      "Size 2"
    ])
    expect(items[0]?.target).toEqual(button)
    expect(items.some((item) => item.parent !== undefined)).toBe(false)
  })

  it("marks each setup step done, or says what's missing", () => {
    const steps = (found = storybook, running?: { address: string }) =>
      setupGuide(found, running).items.map((item) => [item.key, item.label, item.tone])

    expect(steps()).toEqual([
      ["config", "Config found", "success"],
      ["stories", "Stories found", "success"],
      ["running", "Storybook isn't running yet", "info"]
    ])
    expect(setupGuide(storybook).items[1]?.detail).toBe("4 stories for 2 components.")
    expect(steps(storybook, { address: "http://storybook.localhost" })[2]).toEqual([
      "running",
      "Storybook is running",
      "success"
    ])
    expect(steps({ configDir: ".storybook", stories: {} })[1]).toEqual(["stories", "No stories yet", "warning"])
  })
})
