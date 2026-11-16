import type { ContainerSpec, ImportedScreen, ScreensLook } from "@parity-app/core"
import { describe, expect, it } from "vite-plus/test"
import { storyColors } from "./project-colors.tsx"
import { screensGroupId, screensLook, stateNouns, storyScreensFile } from "./story-screens.ts"

/*
 * How a project's story files are shown (PAR-1131): named, grouped and coloured as their provider's manifest says,
 * so nothing in the window names the tool.
 */

const pages: ScreensLook = {
  name: "Docs",
  group: "Pages",
  states: { one: "page", many: "pages" },
  color: { light: "teal", dark: "aqua" }
}

const screen = (id: string, adapter: string): ImportedScreen => ({
  adapter,
  ref: `${id}.docs`,
  group: id,
  // SAFETY: only the design's id is read here.
  screen: { id } as ContainerSpec
})

const info = { entities: { screens: [screen("intro", "docs"), screen("card", "other")], looks: { docs: pages } } }

describe("story files' look (PAR-1131)", () => {
  it("names a story file's states, groups it and colours it as its provider's manifest says", () => {
    expect(screensLook(info, "intro")).toEqual(pages)
    expect(stateNouns({ path: storyScreensFile, container: { id: "intro" } }, info)).toEqual(pages.states)
    expect(screensGroupId(info, "intro")).toBe("stories:docs")
    expect(storyColors(info)).toEqual({ "--canvas-story": "light-dark(teal, aqua)" })
  })

  it("names other designs' states as states, and leaves the colour alone without one", () => {
    expect(stateNouns({ path: "app.par", container: { id: "intro" } }, info)).toEqual({ one: "state", many: "states" })
    expect(stateNouns({ path: storyScreensFile, container: { id: "card" } }, info)).toEqual({
      one: "state",
      many: "states"
    })
    expect(storyColors({ entities: {} })).toEqual({})
  })
})
