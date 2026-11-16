import { AsyncLocalStorage } from "node:async_hooks"
import { memoryPorts } from "@parity-app/channel"
import type { AgentToolInput, ExtensionModule, Parity } from "@parity-app/extension"
import { type ExtensionPackage, readExtension } from "@parity-app/extension/manifest"
import { type ChildEnd, lifecycle } from "@parity-app/processes"
import { describe, expect, it, vi } from "vite-plus/test"
import { z } from "zod"
import { agentExtensions, readToolInput } from "./agents.ts"
import { serveExtensionHost } from "./host.ts"
import { type ExtensionEdits, type ExtensionStatus, extensionHosts, type OpenedProject } from "./hosts.ts"

const project: OpenedProject = { id: "shop", root: "/shop", name: "Shop" }

const icon = { viewBox: "0 0 24 24", path: "M0 0h24v24H0z" }

const stories = readExtension({
  name: "parity-stories",
  version: "1.2.0",
  main: "dist/extension.js",
  parity: {
    displayName: "Stories",
    prefix: "stories",
    icon,
    activates: ["onDetect"],
    permissions: { edits: true },
    contributes: {
      commands: [{ id: "stories.open", title: "Open in Stories" }],
      nodeTypes: [{ id: "story", name: "Story" }]
    }
  }
})

const checks = readExtension({
  name: "parity-checks",
  version: "1.0.0",
  main: "dist/extension.js",
  parity: {
    displayName: "Checks",
    prefix: "checks",
    icon,
    activates: ["onCommand:checks.run"],
    extensionDependencies: ["parity-stories"],
    permissions: { edits: true },
    contributes: {
      commands: [{ id: "checks.run", title: "Run checks" }],
      agentTools: [
        {
          name: "checks.page",
          description: "Gives the page that checks a component",
          input: { type: "object", properties: { component: { type: "string" } }, required: ["component"] }
        }
      ]
    }
  }
})

/** Carries an agent's call through an extension's code, as the host script does with Node's own. */
const calls = new AsyncLocalStorage<number | undefined>()

/** Hosts whose processes are in memory, each running the module given here through the real host code. */
function setUp(modules: Record<string, ExtensionModule>, installed: ExtensionPackage[] = [stories, checks]) {
  const changes: ExtensionStatus[][] = []
  const started: string[] = []
  const asked: string[] = []
  const transact = vi.fn<ExtensionEdits["transact"]>(() => Promise.resolve())

  const hosts = extensionHosts<OpenedProject>({
    extensions: installed.map((found) => ({
      package: found,
      main: found.id,
      detect: () => (found.id in modules ? {} : undefined)
    })),
    start(extension) {
      const [service, host] = memoryPorts()
      let end: (ending: ChildEnd) => void = () => undefined
      started.push(extension.package.id)

      const life = lifecycle({
        onOutput: () => undefined,
        onEnd: (listener) => (end = listener),
        kill: () => end({ signal: "SIGTERM" })
      })

      serveExtensionHost({
        port: host,
        load: (main) => Promise.resolve(Object.assign(Object.create(null), modules[main])),
        exit: () => end({ code: 0 }),
        calls: { run: (call, task) => calls.run(call, task), current: () => calls.getStore() }
      })

      return { port: service, life }
    },
    state: { read: () => ({ app: {}, project: {}, status: {} }), write: () => undefined },
    window: {
      updateSetting: () => Promise.resolve(),
      changed: (_projectId, extensions) => changes.push(extensions),
      logged: () => undefined,
      async ui(_projectId, _extension, method) {
        asked.push(method)

        return method === "ui.pick" ? { index: 0 } : undefined
      },
      reveal: () => undefined
    },
    processes: {
      start: () => Promise.reject(new Error("Not in this test")),
      adopt: () => {
        throw new Error("Not in this test")
      },
      find: () => Promise.resolve([]),
      stop: () => Promise.resolve(),
      restart: () => Promise.reject(new Error("Not in this test")),
      ready: () => Promise.reject(new Error("Not in this test")),
      ended: () => Promise.reject(new Error("Not in this test")),
      report: () => undefined,
      summarize: () => undefined,
      markReady: () => undefined,
      snapshot: () => ({ list: [], output: {}, ready: {} }),
      watch: () => () => undefined,
      reattached: () => undefined,
      stopAll: () => undefined
    },
    providers: {
      register: () => undefined,
      changed: () => undefined,
      dispose: () => undefined,
      disposeAll: () => undefined
    },
    files: {
      place: { home: "/home", variables: {}, platform: "linux" },
      read: () => Promise.reject(new Error("Not in this test")),
      list: () => Promise.reject(new Error("Not in this test")),
      watch: () => () => undefined
    },
    edits: { transact, files: () => Promise.resolve([]) }
  })

  return { hosts, changes, started, asked, transact }
}

const storiesApi: ExtensionModule = {
  activate: () => ({
    storyUrl: (component) => `http://localhost:6006/?path=/story/${String(component).toLowerCase()}`,
    count: () => 2
  })
}

describe("an extension's API for others", () => {
  it("activates the extension it builds on first, and calls its API in that one's process", async () => {
    let checksParity: Parity | undefined

    const { hosts, started } = setUp({
      "parity-stories": storiesApi,
      "parity-checks": {
        activate(parity) {
          checksParity = parity
          parity.commands.register("checks.run", () => undefined)
        }
      }
    })

    hosts.open(project)
    await hosts.run("shop", "checks.run")

    expect(started).toEqual(["parity-stories", "parity-checks"])

    const other = checksParity?.extensions.get<{ storyUrl(component: string): string }>("parity-stories")

    expect(other?.displayName).toBe("Stories")
    expect(other?.version).toBe("1.2.0")
    await expect(other?.api.storyUrl("Button")).resolves.toBe("http://localhost:6006/?path=/story/button")
  })

  it("refuses an extension the manifest doesn't name", async () => {
    let storiesParity: Parity | undefined

    const { hosts } = setUp({
      "parity-stories": {
        activate(parity) {
          storiesParity = parity
        }
      },
      "parity-checks": { activate: () => undefined }
    })

    hosts.open(project)
    await hosts.run("shop", "stories.open").catch(() => undefined)

    expect(() => storiesParity?.extensions.get("parity-checks")).toThrow(
      "parity-checks isn't in the manifest's extensionDependencies"
    )
  })

  it("starts an extension once when one listed before it builds on it and both start on detection", async () => {
    const eager = readExtension({
      name: "parity-eager",
      version: "1.0.0",
      main: "dist/extension.js",
      parity: {
        displayName: "Eager",
        prefix: "eager",
        icon,
        activates: ["onDetect"],
        extensionDependencies: ["parity-stories"],
        contributes: {}
      }
    })

    const { hosts, started, changes } = setUp(
      { "parity-eager": { activate: () => undefined }, "parity-stories": storiesApi },
      [eager, stories]
    )

    hosts.open(project)
    await vi.waitFor(() => expect(changes.at(-1)?.every((each) => each.state === "running")).toBe(true))

    // The one listed first starts its process, then its dependency's, and the dependency isn't started a second time.
    expect(started).toEqual(["parity-eager", "parity-stories"])
  })

  it("leaves out an extension whose dependency isn't in the project", () => {
    const { hosts, changes } = setUp({ "parity-checks": { activate: () => undefined } })

    hosts.open(project)

    expect(changes.at(-1)).toEqual([])
  })
})

describe("extensions for agents", () => {
  it("runs a command for an agent, gives back what it returned, and names its changes after both", async () => {
    const { hosts, transact } = setUp({
      "parity-stories": {
        activate(parity) {
          parity.commands.register("stories.open", async () => {
            await parity.edits.transact("Add a story", [{ op: "remove", design: "app.par#home", node: "a" }])

            return { url: "http://localhost:6006" }
          })
        }
      }
    })

    hosts.open(project)

    await expect(hosts.runForAgent("shop", { name: "stories.open" }, "Claude Code")).resolves.toEqual({
      url: "http://localhost:6006"
    })
    expect(transact).toHaveBeenCalledWith("shop", "parity-stories", "Claude Code via Stories: Add a story", [
      { op: "remove", design: "app.par#home", node: "a" }
    ])
  })

  it("names each change after the agent whose call made it, while two agents' calls overlap", async () => {
    const gates: (() => void)[] = []

    const { hosts, transact } = setUp({
      "parity-stories": {
        activate(parity) {
          parity.commands.register("stories.open", async () => {
            // Each call waits until the test lets it go on, so both are running when the first makes its change.
            await new Promise<void>((resolve) => gates.push(resolve))
            await parity.edits.transact("Add a story", [{ op: "remove", design: "app.par#home", node: "a" }])
          })
        }
      }
    })

    hosts.open(project)
    const codex = hosts.runForAgent("shop", { name: "stories.open" }, "Codex")
    await vi.waitFor(() => expect(gates).toHaveLength(1))
    const claude = hosts.runForAgent("shop", { name: "stories.open" }, "Claude Code")
    await vi.waitFor(() => expect(gates).toHaveLength(2))
    gates[0]?.()
    await codex
    gates[1]?.()
    await claude

    expect(transact.mock.calls.map(([, , label]) => label)).toEqual([
      "Codex via Stories: Add a story",
      "Claude Code via Stories: Add a story"
    ])
  })

  it("names a change after the agent when its command runs another of the extension's commands", async () => {
    const { hosts, transact, asked } = setUp({
      "parity-stories": { activate: () => undefined },
      "parity-checks": {
        activate(parity) {
          parity.commands.register("checks.run", async () => {
            await parity.edits.transact("Check", [{ op: "remove", design: "app.par#home", node: "a" }])
            await parity.ui.confirm("Go on?").catch(() => false)
          })
          parity.agentTools.register("checks.page", () => parity.commands.execute("checks.run"))
        }
      }
    })

    hosts.open(project)
    await hosts.runForAgent("shop", { name: "checks.page", input: { component: "Button" } }, "Claude Code")

    expect(transact).toHaveBeenCalledWith("shop", "parity-checks", "Claude Code via Checks: Check", expect.any(Array))
    expect(asked).toEqual([])
  })

  it("starts an extension for an agent as the agent's, so its activation's changes are named and it can't ask", async () => {
    const { hosts, transact, asked } = setUp({
      "parity-stories": { activate: () => undefined },
      "parity-checks": {
        async activate(parity) {
          await parity.edits.transact("Set up", [{ op: "remove", design: "app.par#home", node: "a" }])
          await parity.ui.confirm("Set up checks?").catch(() => false)
          parity.commands.register("checks.run", () => undefined)
        }
      }
    })

    hosts.open(project)
    await hosts.runForAgent("shop", { name: "checks.run" }, "Claude Code")

    expect(transact).toHaveBeenCalledWith("shop", "parity-checks", "Claude Code via Checks: Set up", expect.any(Array))
    expect(asked).toEqual([])
  })

  it("names a change after the agent when it comes through another extension's API", async () => {
    const { hosts, transact } = setUp({
      "parity-stories": {
        activate: (parity) => ({
          tidy: async () => {
            await parity.edits.transact("Tidy", [{ op: "remove", design: "app.par#home", node: "a" }])
          }
        })
      },
      "parity-checks": {
        activate(parity) {
          parity.agentTools.register("checks.page", async () => {
            await parity.extensions.get<{ tidy(): void }>("parity-stories").api.tidy()
          })
        }
      }
    })

    hosts.open(project)
    await hosts.runForAgent("shop", { name: "checks.page", input: { component: "Button" } }, "Codex")

    expect(transact).toHaveBeenCalledWith("shop", "parity-stories", "Codex via Stories: Tidy", expect.any(Array))
  })

  it("checks an agent tool's input against its schema before running it", async () => {
    const page = vi.fn<(input: AgentToolInput) => { url: string }>((input) => ({
      url: `/checks/${z.object({ component: z.string() }).parse(input).component}`
    }))

    const { hosts } = setUp({
      "parity-stories": storiesApi,
      "parity-checks": {
        activate(parity) {
          parity.agentTools.register("checks.page", (input) => page(input))
        }
      }
    })

    hosts.open(project)

    await expect(
      hosts.runForAgent("shop", { name: "checks.page", input: { component: "Button" } }, "Claude Code")
    ).resolves.toEqual({ url: "/checks/Button" })
    await expect(hosts.runForAgent("shop", { name: "checks.page", input: {} }, "Claude Code")).rejects.toThrow(
      "checks.page's input doesn't fit its schema"
    )
    await expect(hosts.runForAgent("shop", { name: "checks.missing" }, "Claude Code")).rejects.toThrow(
      "No extension for Shop has a command or agent tool named checks.missing"
    )
    expect(page).toHaveBeenCalledOnce()
  })

  it("fails a question while an agent runs the extension, since there's nobody to ask, and asks the person otherwise", async () => {
    const { hosts, asked } = setUp({
      "parity-stories": {
        activate(parity) {
          parity.commands.register("stories.open", async () => {
            const picked = await parity.ui.pick([{ label: "Button" }])

            return picked?.label ?? null
          })
        }
      }
    })

    hosts.open(project)

    await expect(hosts.runForAgent("shop", { name: "stories.open" }, "Claude Code")).rejects.toThrow(
      "There's nobody to ask: Claude Code is running Stories, so ui.pick can't be answered"
    )
    expect(asked).toEqual([])

    await hosts.run("shop", "stories.open")

    expect(asked).toEqual(["ui.pick"])
  })

  it("lists each extension's commands, tools, node types and facts", async () => {
    const { hosts, changes } = setUp({
      "parity-stories": {
        activate(parity) {
          parity.facts.set({ type: "component", key: "Button" }, [{ id: "stories", label: "stories", value: "2" }])
        }
      },
      "parity-checks": { activate: () => undefined }
    })

    hosts.open(project)
    await vi.waitFor(() => expect(changes.at(-1)?.[0]?.facts).not.toEqual({}))

    expect(agentExtensions(changes.at(-1) ?? [])).toEqual([
      {
        id: "parity-stories",
        name: "Stories",
        state: "running",
        commands: [{ id: "stories.open", title: "Open in Stories" }],
        tools: [],
        nodeTypes: [{ id: "story", name: "Story" }],
        facts: [{ component: "Button", facts: [{ id: "stories", label: "stories", value: "2" }] }]
      },
      {
        id: "parity-checks",
        name: "Checks",
        state: "waiting",
        commands: [{ id: "checks.run", title: "Run checks" }],
        tools: [
          {
            name: "checks.page",
            description: "Gives the page that checks a component",
            input: { type: "object", properties: { component: { type: "string" } }, required: ["component"] }
          }
        ],
        nodeTypes: [],
        facts: []
      }
    ])
  })
})

describe("readToolInput", () => {
  const [tool] = checks.manifest.contributes.agentTools ?? []

  it("gives input that fits, and says what's wrong with input that doesn't", () => {
    if (!tool) {
      throw new Error("The test's manifest has a tool")
    }

    expect(readToolInput(tool, { component: "Button" })).toEqual({ component: "Button" })
    expect(() => readToolInput(tool, { component: 3 })).toThrow("component:")
    expect(() => readToolInput(tool, { component: "Button", extra: true })).toThrow("doesn't fit its schema")
    expect(() => readToolInput(tool, undefined)).toThrow("doesn't fit its schema")
  })
})
