import storybookPackage from "@parity-app/extension-storybook/package.json" with { type: "json" }
import { readExtension } from "@parity-app/extensions"
import { describe, expect, it } from "vite-plus/test"
import type { ExtensionStatus } from "../shared/protocol.ts"
import { commandsAt, statusItems } from "./extensions.ts"

const { id, manifest } = readExtension(storybookPackage)

/** Storybook's extension as the window has it, in a state and with the context a test gives. */
function storybook(change: Partial<ExtensionStatus> = {}): ExtensionStatus {
  return {
    id,
    displayName: manifest.displayName,
    icon: manifest.icon,
    contributes: manifest.contributes,
    state: "running",
    status: {},
    context: { "storybook.hasStories": ["Button"] },
    facts: {},
    ...change
  }
}

const button = { type: "component", key: "Button" } as const
const badge = { type: "component", key: "Badge" } as const

describe("commandsAt", () => {
  it("places a command where the manifest does, enabled for a component its context lists", () => {
    const [placed] = commandsAt([storybook()], "canvas", button)

    expect(placed?.command.title).toBe("Open in Storybook")
    expect(placed?.enabled).toBe(true)
  })

  it("greys it with the manifest's reason for a component the context doesn't list", () => {
    expect(commandsAt([storybook()], "componentCard", badge)).toMatchObject([
      { enabled: false, disabledReason: "No story found" }
    ])
  })

  it("enables a command without enablement anywhere it's placed, with or without a component", () => {
    expect(commandsAt([storybook()], "search", badge)).toMatchObject([{ enabled: true }])
    expect(commandsAt([storybook()], "search")).toMatchObject([{ enabled: true }])
  })

  it("leaves out a placement the manifest doesn't name, and an extension stopped after crashing", () => {
    expect(commandsAt([storybook()], "media", button)).toEqual([])
    expect(commandsAt([storybook({ state: "crashed" })], "canvas", button)).toEqual([])
    expect(commandsAt([storybook({ state: "stuck" })], "canvas", button)).toHaveLength(1)
  })
})

describe("statusItems", () => {
  it("gives each declared item with the value its code set last", () => {
    const status = { "storybook.stories": { value: "3", tooltip: "3 components have stories" } }

    expect(statusItems([storybook({ status })])).toMatchObject([
      { item: { id: "storybook.stories", label: "in Storybook" }, value: "3", tooltip: "3 components have stories" }
    ])
    expect(statusItems([storybook({ state: "crashed", status })])).toEqual([])
  })
})
