import storybookPackage from "@parity-app/extension-storybook/package.json" with { type: "json" }
import routerPackage from "@parity-app/extension-tanstack-router/package.json" with { type: "json" }
import { readExtension } from "@parity-app/extensions"
import { describe, expect, it } from "vite-plus/test"
import type { ExtensionStatus, ProjectProcess } from "../shared/protocol.ts"
import { commandsAt, extensionKeyFor, extensionKeys, statusItems, statusTooltip } from "./extensions.ts"

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

describe("commandsAt for a page (PAR-1095)", () => {
  const pricing = { type: "route", key: "/pricing" } as const
  const router = readExtension(routerPackage)

  const tanstack = storybook({
    id: router.id,
    prefix: router.manifest.prefix,
    contributes: router.manifest.contributes,
    context: {}
  })

  it("places the router's Open in browser on a page, and nothing placed for components", () => {
    expect(commandsAt([storybook(), tanstack], "layers", pricing)).toMatchObject([
      { command: { id: "tanstack-router.open" }, enabled: true }
    ])
  })

  it("leaves Open in browser off a component and a layer", () => {
    const title = { type: "layer", design: "app.par#home", node: "title" } as const

    expect(commandsAt([tanstack], "layers", button)).toEqual([])
    expect(commandsAt([tanstack], "layers", title)).toEqual([])
  })
})

describe("commandsAt for a process (PAR-1127)", () => {
  /** A server in the processes list, started by the extension `extension`. */
  const server = (extension: string, change: Partial<ProjectProcess> = {}): ProjectProcess => ({
    id: `extension:${extension}:/example:server`,
    owner: { kind: "extension", extension },
    lifetime: "server",
    name: "Server",
    projectId: "/example",
    project: "example",
    state: "running",
    startedAt: 0,
    endpoint: { url: "http://localhost:6006", port: 6006, protocol: "http" },
    addresses: [],
    run: 1,
    canStop: true,
    canRestart: true,
    ...change
  })

  /** An extension that places Show logs on the servers it runs, greyed until one listens. */
  const logs = storybook({
    id: "parity-logs",
    prefix: "logs",
    contributes: {
      commands: [{ id: "logs.show", title: "Show logs" }],
      menus: {
        process: [
          {
            command: "logs.show",
            when: "process.isMine && process.isServer",
            enablement: "process.hasEndpoint",
            disabledReason: "Not listening yet"
          }
        ]
      }
    },
    context: {}
  })

  const target = (process: ProjectProcess) => ({ type: "process", id: process.id }) as const

  it("places a command on a process its extension runs, and on none another runs or Parity does", () => {
    const mine = server("parity-logs")
    const theirs = server("other")
    const build = server("", { owner: { kind: "parity", role: "builder" } })

    expect(commandsAt([logs], "process", target(mine), { process: mine })).toMatchObject([
      { command: { id: "logs.show" }, enabled: true }
    ])
    expect(commandsAt([logs], "process", target(theirs), { process: theirs })).toEqual([])
    expect(commandsAt([logs], "process", target(build), { process: build })).toEqual([])
  })

  it("counts a process the extension adopted as its own, and greys the command until the server listens", () => {
    const adopted = server("", { owner: { kind: "adopted", by: "parity-logs" }, endpoint: undefined })

    expect(commandsAt([logs], "process", target(adopted), { process: adopted })).toMatchObject([
      { enabled: false, disabledReason: "Not listening yet" }
    ])
  })

  it("tests the extension's context lists by the id it knows the process by", () => {
    const watching = storybook({
      ...logs,
      contributes: {
        commands: [{ id: "logs.show", title: "Show logs" }],
        menus: { process: [{ command: "logs.show", when: "logs.watched" }] }
      },
      context: { "logs.watched": ["parity:builder"] }
    })

    const build = server("", { id: "builder:/example", owner: { kind: "parity", role: "builder" } })

    expect(
      commandsAt([watching], "process", { type: "process", id: "parity:builder" }, { process: build })
    ).toHaveLength(1)
    expect(commandsAt([watching], "process", { type: "process", id: "parity:typecheck" }, { process: build })).toEqual(
      []
    )
  })

  it("leaves process keys false off a process, and process commands off other placements", () => {
    expect(commandsAt([logs], "process", target(server("parity-logs")))).toEqual([])
    expect(commandsAt([logs], "layers", button, { process: server("parity-logs") })).toEqual([])
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

describe("statusTooltip (PAR-1095)", () => {
  it("names the tool's version detection found, and notes one Parity doesn't test", () => {
    expect(
      statusTooltip("React", "Renders the project's components", { version: "19.3.1", status: "supported" })
    ).toEqual({ hint: "React 19.3.1", detail: "Renders the project's components" })
    expect(
      statusTooltip("React", "Renders the project's components", { version: "18.3.1", status: "dropped" })
    ).toEqual({
      hint: "React 18.3.1",
      detail: "Renders the project's components. Parity doesn't test this version"
    })
  })

  it("keeps the title alone when detection found no version", () => {
    expect(statusTooltip("TanStack Router", "Click to show them")).toEqual({
      hint: "TanStack Router",
      detail: "Click to show them"
    })
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
