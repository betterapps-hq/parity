import { readExtension } from "@parity-app/extension/manifest"
import { describe, expect, it } from "vite-plus/test"
import packageJson from "../package.json" with { type: "json" }
import { accessibilityPage } from "./accessibility.ts"

const story = "http://localhost:6006/?path=/story/button--primary"

describe("the accessibility extension", () => {
  it("has a manifest Parity accepts, building on the Storybook extension", () => {
    const found = readExtension(packageJson)

    expect(found.manifest.extensionDependencies).toEqual(["@parity-app/extension-storybook"])
    expect(found.manifest.contributes.agentTools?.map((tool) => tool.name)).toEqual(["a11y.page"])
    // Every placement, Search's among them, is greyed where there's no component with stories to check.
    expect(
      Object.values(found.manifest.contributes.menus ?? {})
        .flat()
        .map((item) => item?.enablement)
    ).toEqual(["a11y.hasStories", "a11y.hasStories", "a11y.hasStories", "a11y.hasStories"])
  })
})

describe("accessibilityPage", () => {
  it("opens the panel on a story's page only", () => {
    expect(accessibilityPage(story)).toBe(`${story}&addonPanel=storybook/a11y/panel`)
    expect(() => accessibilityPage("http://localhost:6006/?path=/docs/button--docs")).toThrow(
      "Only a story's page has the accessibility panel"
    )
  })
})
