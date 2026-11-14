import { readExtension } from "@parity-app/extensions"
import { describe, expect, it } from "vite-plus/test"
import packageJson from "../package.json" with { type: "json" }
import { componentsWithStories, readDetected, readStoryIndex, servesStories, storyPage } from "./storybook.ts"

const entries = readStoryIndex({
  v: 5,
  entries: {
    "button--docs": { id: "button--docs", type: "docs", importPath: "./src/button.stories.tsx" },
    "button--primary": { id: "button--primary", type: "story", importPath: "./src/button.stories.tsx" },
    "card--plain": { id: "card--plain", type: "story", importPath: "./src/card.stories.tsx" },
    "later--kind": { id: "later--kind", type: "test", importPath: "./src/later.stories.tsx" }
  }
})

describe("the Storybook extension", () => {
  it("has a manifest Parity accepts", () => {
    const found = readExtension(packageJson)

    expect(found.manifest.contributes.commands?.map((command) => command.id)).toEqual(["storybook.open"])
    expect(found.manifest.contributes.statusItems?.map((item) => item.id)).toEqual(["storybook.stories"])
  })

  it("reads what detection found, and which components have stories", () => {
    const detected = readDetected({
      configDir: ".storybook",
      main: ".storybook/main.ts",
      port: 6007,
      stories: { Button: [{ path: "src/button.stories.tsx", exports: ["Primary"] }], Card: [] }
    })

    expect(detected?.port).toBe(6007)
    expect(componentsWithStories(detected!)).toEqual(["Button"])
    expect(readDetected({ stories: {} })).toBeUndefined()
  })

  it("leaves out index entries of kinds it doesn't know", () => {
    expect(entries.map((entry) => entry.id)).toEqual(["button--docs", "button--primary", "card--plain"])
    expect(() => readStoryIndex("not an index")).toThrow("Storybook's index isn't one Parity can read")
    expect(() => readStoryIndex([])).toThrow("Storybook's index isn't one Parity can read")
    expect(() => readStoryIndex({ entries: [] })).toThrow("Storybook's index isn't one Parity can read")
  })

  it("tells a Storybook serving the project's stories from another's", () => {
    expect(servesStories(entries, ["src/card.stories.tsx"])).toBe(true)
    expect(servesStories(entries, ["src/other.stories.tsx"])).toBe(false)
    expect(servesStories(entries, [])).toBe(true)
  })

  it("opens a component's docs first, then its first story, then Storybook's home", () => {
    const address = "http://localhost:6006"

    expect(storyPage(address, entries, ["src/button.stories.tsx"])).toBe(`${address}/?path=/docs/button--docs`)
    expect(storyPage(address, entries, ["src/card.stories.tsx"])).toBe(`${address}/?path=/story/card--plain`)
    expect(storyPage(address, entries, ["src/gone.stories.tsx"])).toBe(address)
  })
})
