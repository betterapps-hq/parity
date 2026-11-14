import storybookPackage from "@parity-app/extension-storybook/package.json" with { type: "json" }
import { readExtension } from "@parity-app/extensions"
import { describe, expect, it } from "vite-plus/test"
import type { ExtensionStatus } from "../shared/protocol.ts"
import { commandsAt, extensionKeyFor, extensionKeys, statusItems } from "./extensions.ts"

const { id, manifest } = readExtension(storybookPackage)

/** Storybook's extension as the window has it, in a state and with the context a test gives. */
function storybook(change: Partial<ExtensionStatus> = {}): ExtensionStatus {
  return {
    id,
    displayName: manifest.displayName,
    prefix: manifest.prefix,
    icon: manifest.icon,
    contributes: manifest.contributes,
    permissions: {},
    activates: manifest.activates,
    settingProblems: [],
    state: "running",
    status: {},
    context: { "storybook.hasStories": ["Button"] },
    facts: {},
    views: {},
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
    expect(commandsAt([storybook()], "search", badge)).toMatchObject([{ enabled: true }, { enabled: true }])
    expect(commandsAt([storybook()], "search")).toMatchObject([{ enabled: true }, { enabled: true }])
  })

  it("leaves out a placement the manifest doesn't name, and an extension stopped after crashing", () => {
    expect(commandsAt([storybook()], "media", button)).toEqual([])
    expect(commandsAt([storybook({ state: "crashed" })], "canvas", button)).toEqual([])
    expect(commandsAt([storybook({ state: "stuck" })], "canvas", button)).toHaveLength(1)
  })
})

describe("commandsAt for a layer", () => {
  const title = { type: "layer", design: "app.par#home", node: "title" } as const

  const tidy = storybook({
    id: "parity-tidy",
    contributes: {
      commands: [{ id: "tidy.rename", title: "Rename layer" }],
      menus: { layers: [{ command: "tidy.rename", when: "layer" }] }
    },
    context: {}
  })

  it("places what a when names for layers, as `layer`, and nothing placed for components", () => {
    expect(commandsAt([storybook(), tidy], "layers", title)).toMatchObject([{ command: { id: "tidy.rename" } }])
    expect(commandsAt([tidy], "layers", button)).toEqual([])
  })
})

describe("when and enablement over what Parity knows (PAR-1092)", () => {
  const route = { owner: "tanstack-router", type: "route", key: "/settings" }

  /** An extension whose Measure command shows on routes, and runs once a route is measured. */
  const timings = (change: Partial<ExtensionStatus> = {}) =>
    storybook({
      id: "parity-route-timings",
      prefix: "timings",
      contributes: {
        commands: [{ id: "timings.measure", title: "Measure" }],
        menus: {
          layers: [
            {
              command: "timings.measure",
              when: "node.type == route && project.uses(tanstack-router)",
              enablement: "fact.load > 500 || selection.count > 1",
              disabledReason: "Fast enough"
            }
          ]
        },
        keybindings: [
          { command: "timings.measure", key: "mod+shift+m", when: "tool == select" },
          { command: "timings.measure", key: "mod+d" }
        ]
      },
      context: {},
      ...change
    })

  it("shows a command for the node and tools its when names, greyed until its enablement holds", () => {
    const facts = { node: route, selectionCount: 1, tools: ["tanstack-router"] }

    expect(commandsAt([timings()], "layers", undefined, { ...facts, tools: [] })).toEqual([])
    expect(commandsAt([timings()], "layers", undefined, { ...facts, node: { ...route, type: "story" } })).toEqual([])
    expect(commandsAt([timings()], "layers", undefined, facts)).toMatchObject([
      { enabled: false, disabledReason: "Fast enough" }
    ])
    expect(commandsAt([timings()], "layers", undefined, { ...facts, selectionCount: 2 })).toMatchObject([
      { enabled: true }
    ])
    expect(
      commandsAt(
        [timings({ facts: { "/settings": [{ id: "load", label: "Load", value: "620" }] } })],
        "layers",
        undefined,
        facts
      )
    ).toMatchObject([{ enabled: true }])
  })

  it("gives an extension the keys Parity's own don't have, when their when holds", () => {
    const keys = extensionKeys([timings()])

    expect(keys.keys).toMatchObject([{ command: "timings.measure", keys: "Ctrl Shift M" }])
    expect(keys.clashes).toMatchObject([{ command: "timings.measure", keys: "Ctrl D", with: "parity" }])

    const press = { key: "M", code: "KeyM", ctrlKey: true, metaKey: false, altKey: false, shiftKey: true }

    expect(extensionKeyFor(press, [timings()], { tool: "select" })?.command.id).toBe("timings.measure")
    expect(extensionKeyFor(press, [timings()], { tool: "hand" })).toBeUndefined()
    expect(extensionKeyFor(press, [timings({ state: "crashed" })], { tool: "select" })).toBeUndefined()
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
