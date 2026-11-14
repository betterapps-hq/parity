import { describe, expect, it } from "vite-plus/test"
import { type AdapterFacts, extensionAdds } from "./extension-adds.ts"

/** A project on React, Vite, Tailwind, TanStack Router and Storybook, as the window is told about it. */
const project: AdapterFacts = {
  renderer: { id: "react" },
  builder: { id: "vite" },
  styles: { id: "tailwind" },
  router: { id: "tanstack-router" },
  routes: [{}, { parent: "__root__" }, { parent: "__root__" }],
  entities: {
    screens: [{ adapter: "storybook" }, { adapter: "storybook" }]
  },
  actions: [{ adapter: "tanstack-router", name: "Open in browser" }],
  status: [{ adapter: "react" }, { adapter: "tanstack-router" }]
}

const storybook = {
  contributes: {
    commands: [{ id: "storybook.open", title: "Open in Storybook" }],
    statusItems: [{ id: "storybook.stories", title: "Storybook" }]
  }
}

describe("what an extension adds", () => {
  it("says what its adapter does for its role, and that it shows in the status bar", () => {
    expect(extensionAdds("react", project)).toEqual(["Renders the project's components", "A status bar item"])
    expect(extensionAdds("vite", project)).toEqual(["Serves the project's code to the canvas"])
    expect(extensionAdds("tailwind", project)).toEqual(["Reads the theme as tokens", "Writes styles as classes"])
  })

  it("counts a router's pages, leaving out the root, and lists its actions by name", () => {
    expect(extensionAdds("tanstack-router", project)).toEqual([
      "Reads the app's routes as pages (2)",
      "Open in browser",
      "A status bar item"
    ])
  })

  it("counts the screens an adapter read, and lists its extension's commands and status item", () => {
    expect(extensionAdds("storybook", project, [storybook])).toEqual([
      "Reads its files as screens (2)",
      "Open in Storybook",
      "A status bar item"
    ])
  })

  it("is nothing for a tool the project doesn't use", () => {
    expect(extensionAdds("vue", project, [storybook])).toEqual([])
  })
})
