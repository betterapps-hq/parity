import { readExtension } from "@parity-app/extensions"
import { describe, expect, it } from "vite-plus/test"
import packageJson from "../package.json" with { type: "json" }
import {
  componentsWithStories,
  projectStorybook,
  readStoryIndex,
  scriptsOf,
  servesStories,
  storyPage
} from "./storybook.ts"

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

    expect(found.manifest.contributes.commands?.map((command) => command.id)).toEqual([
      "storybook.open",
      "storybook.setup"
    ])
    expect(found.manifest.contributes.tabs?.map((tab) => tab.id)).toEqual(["storybook.stories"])
    expect(found.manifest.contributes.sections?.map((section) => section.id)).toEqual(["storybook.componentStories"])
    expect(found.manifest.contributes.pages?.map((page) => page.id)).toEqual(["storybook.setupGuide"])
    expect(found.manifest.contributes.statusItems?.map((item) => item.id)).toEqual(["storybook.stories"])
    // The config folder is the project's, where stories open the person's (PAR-1090).
    expect(found.manifest.contributes.settings).toMatchObject({
      "storybook.configDir": { scope: "project", default: ".storybook" },
      "storybook.openIn": { scope: "app", enum: ["browser", "parity"], default: "browser" }
    })
  })

  it("gives Storybook's supported versions by its peer dependencies, storybook first", () => {
    expect(readExtension(packageJson).versions).toEqual({
      packages: ["storybook", "@storybook/react", "@storybook/react-vite"],
      range: "^9.0.0 || ^10.0.0",
      scope: "@storybook/"
    })
  })

  it("reads the config folder and port from the setting and the script, and which components have stories (PAR-1128)", () => {
    const stories = { Button: [{ path: "src/button.stories.tsx", exports: ["Primary"] }], Card: [] }
    const scripts = scriptsOf(JSON.stringify({ scripts: { storybook: "storybook dev -p 6007 -c config/sb" } }))

    expect(projectStorybook(scripts, ".storybook", stories)).toEqual({ configDir: "config/sb", port: 6007, stories })
    expect(projectStorybook(scripts, "stories-config", stories).configDir).toBe("stories-config")
    expect(projectStorybook(undefined, ".storybook", {})).toEqual({ configDir: ".storybook", stories: {} })
    expect(componentsWithStories(projectStorybook(scripts, "", stories))).toEqual(["Button"])
    expect(scriptsOf("not json")).toBeUndefined()
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

  it("opens a component's docs first, then its first story, then Storybook's home, or its first story when asked", () => {
    const address = "http://localhost:6006"

    expect(storyPage(address, entries, ["src/button.stories.tsx"])).toBe(`${address}/?path=/docs/button--docs`)
    expect(storyPage(address, entries, ["src/card.stories.tsx"])).toBe(`${address}/?path=/story/card--plain`)
    expect(storyPage(address, entries, ["src/gone.stories.tsx"])).toBe(address)
    expect(storyPage(address, entries, ["src/button.stories.tsx"], "story")).toBe(
      `${address}/?path=/story/button--primary`
    )
  })
})
