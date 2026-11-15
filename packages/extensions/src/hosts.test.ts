import { createChannel, memoryPorts } from "@parity-app/channel"
import type { ExtensionModule, JsonValue, Parity, ProcessInfo } from "@parity-app/extension-api"
import { type ChildEnd, lifecycle } from "@parity-app/processes"
import { afterEach, describe, expect, it, vi } from "vite-plus/test"
import { serveExtensionHost } from "./host.ts"
import {
  type ExtensionEdits,
  type ExtensionHostsOptions,
  type ExtensionProcesses,
  type ExtensionStateStore,
  type ExtensionStatus,
  extensionHosts,
  type InstalledExtension,
  type OpenedProject,
  type ProcessListener
} from "./hosts.ts"
import { readExtension } from "./manifest.ts"
import type { HostMethods, HostServiceMethods, LogLine, ProcessSnapshot } from "./protocol.ts"

const project: OpenedProject = { id: "shop", root: "/shop", name: "Shop" }

const storybook = readExtension({
  name: "@parity-app/extension-storybook",
  version: "1.0.0",
  main: "src/extension.ts",
  parity: {
    displayName: "Storybook",
    prefix: "storybook",
    icon: { viewBox: "0 0 24 24", path: "M0 0h24v24H0z" },
    activates: ["onDetect"],
    contributes: {
      commands: [{ id: "storybook.open", title: "Open in Storybook" }],
      statusItems: [{ id: "storybook.stories", title: "Storybook", command: "storybook.open" }],
      settings: {
        "storybook.configDir": { type: "string", default: ".storybook", scope: "project", title: "Config folder" },
        "storybook.openIn": {
          type: "string",
          enum: ["browser", "parity"],
          default: "browser",
          scope: "app",
          title: "Open stories in"
        }
      }
    }
  }
})

const timings = readExtension({
  name: "parity-route-timings",
  version: "1.0.0",
  main: "dist/extension.js",
  parity: {
    displayName: "Route timings",
    prefix: "timings",
    icon: { viewBox: "0 0 24 24", path: "M0 0h24v24H0z" },
    activates: ["onCommand:timings.measure"],
    contributes: { commands: [{ id: "timings.measure", title: "Measure route timings" }] }
  }
})

const tidy = readExtension({
  name: "parity-tidy",
  version: "1.0.0",
  main: "dist/extension.js",
  parity: {
    displayName: "Tidy",
    prefix: "tidy",
    icon: { viewBox: "0 0 24 24", path: "M0 0h24v24H0z" },
    activates: ["onCommand:tidy.rename"],
    permissions: { edits: true, write: ["**"] },
    contributes: { commands: [{ id: "tidy.rename", title: "Rename layer" }] }
  }
})

/** A store in memory, which a test can look into. */
function memoryState(): ExtensionStateStore & { saved: Map<string, JsonValue> } {
  const saved = new Map<string, JsonValue>()

  const scoped = (extension: string, root: string, scope: string) => (key: string) =>
    `${extension}|${scope === "app" ? "" : root}|${scope}|${key}`

  const section = (extension: string, root: string, scope: string) => {
    const prefix = scoped(extension, root, scope)("")

    return Object.fromEntries(
      [...saved].flatMap(([key, value]) => (key.startsWith(prefix) ? [[key.slice(prefix.length), value]] : []))
    )
  }

  return {
    saved,
    read: (extension, root) => ({
      app: section(extension, root, "app"),
      project: section(extension, root, "project"),
      // SAFETY: the tests only save status values here.
      status: section(extension, root, "status") as Record<string, { value?: string }>
    }),
    write(extension, root, scope, key, value) {
      const at = scoped(extension, root, scope)(key)

      if (value === undefined) {
        saved.delete(at)
      } else {
        saved.set(at, value)
      }
    }
  }
}

interface Started {
  extension: string
  crash(end?: ChildEnd): void
}

/**
 * Hosts whose processes are in memory: each runs the extension's module given here through the real host code, over a
 * pair of memory ports, and ends as a process would.
 */
function setUp(modules: Record<string, ExtensionModule>, options: Partial<ExtensionHostsOptions<OpenedProject>> = {}) {
  const changes: ExtensionStatus[][] = []
  const lines: { extension: string; line: LogLine }[] = []
  const notified: string[] = []
  const updated: { extension: string; key: string; value?: JsonValue }[] = []
  const started: Started[] = []
  const state = memoryState()

  const installed = (found: typeof storybook): InstalledExtension<OpenedProject> => ({
    package: found,
    main: found.id,
    detect: () => (found.id in modules ? { detected: { configDir: ".storybook" } } : undefined)
  })

  const hosts = extensionHosts<OpenedProject>({
    extensions: [installed(storybook), installed(timings), installed(tidy)],
    start(extension) {
      const [service, host] = memoryPorts()
      let end: (ending: ChildEnd) => void = () => undefined

      const life = lifecycle({
        onOutput: () => undefined,
        onEnd: (listener) => (end = listener),
        kill: () => end({ signal: "SIGTERM" })
      })

      serveExtensionHost({
        port: host,
        // Like a real module namespace, what the host loads has no prototype.
        load: (main) => Promise.resolve(Object.assign(Object.create(null), modules[main])),
        exit: () => end({ code: 0 })
      })

      started.push({
        extension: extension.package.id,
        crash: (ending = { code: 1 }) => {
          host.close?.()
          end(ending)
        }
      })

      return { port: service, life }
    },
    state,
    window: {
      async updateSetting(_projectId, extension, key, value) {
        updated.push(value === undefined ? { extension, key } : { extension, key, value })
      },
      changed: (_projectId, extensions) => changes.push(extensions),
      logged: (_projectId, extension, line) => lines.push({ extension, line }),
      async ui(_projectId, _extension, method, params) {
        if (method === "ui.notify" && "message" in params) {
          notified.push(params.message)

          return { action: "Restart" }
        }

        return undefined
      },
      reveal: () => undefined
    },
    processes: processesMock(),
    edits: {
      transact: vi.fn<ExtensionEdits["transact"]>(() => Promise.resolve()),
      files: vi.fn<ExtensionEdits["files"]>((_projectId, _extension, _label, files) =>
        Promise.resolve(files.map((file) => file.path))
      )
    },
    ...options
  })

  const latest = (id: string) => changes.at(-1)?.find((extension) => extension.id === id)

  return { hosts, changes, lines, notified, updated, started, state, latest }
}

/** Storybook's server, as the service lists it for the extension that started it. */
const storybookServer: ProcessInfo = {
  id: "@parity-app/extension-storybook:storybook",
  name: "Storybook",
  lifetime: "server",
  state: "running",
  owner: { kind: "extension", extension: "@parity-app/extension-storybook" },
  run: 1,
  addresses: [],
  startedAt: 0
}

/** The process manager, doing nothing unless a test says what a method does. */
function processesMock(methods: Partial<ExtensionProcesses> = {}): ExtensionProcesses {
  const nothing = { list: [], output: {}, ready: {} }

  return {
    start: vi.fn<ExtensionProcesses["start"]>(() => Promise.reject(new Error("Not in this test"))),
    adopt: vi.fn<ExtensionProcesses["adopt"]>(() => {
      throw new Error("Not in this test")
    }),
    find: vi.fn<ExtensionProcesses["find"]>(() => Promise.resolve([])),
    stop: vi.fn<ExtensionProcesses["stop"]>(() => Promise.resolve()),
    restart: vi.fn<ExtensionProcesses["restart"]>(() => Promise.reject(new Error("Not in this test"))),
    ready: vi.fn<ExtensionProcesses["ready"]>(() => Promise.reject(new Error("Not in this test"))),
    ended: vi.fn<ExtensionProcesses["ended"]>(() => Promise.reject(new Error("Not in this test"))),
    report: vi.fn<ExtensionProcesses["report"]>(),
    summarize: vi.fn<ExtensionProcesses["summarize"]>(),
    markReady: vi.fn<ExtensionProcesses["markReady"]>(),
    snapshot: vi.fn<ExtensionProcesses["snapshot"]>(() => nothing),
    watch: vi.fn<ExtensionProcesses["watch"]>(() => () => undefined),
    reattached: vi.fn<ExtensionProcesses["reattached"]>(),
    stopAll: vi.fn<ExtensionProcesses["stopAll"]>(),
    routed: vi.fn<ExtensionProcesses["routed"]>(() => Promise.resolve([])),
    ...methods
  }
}

/** Waits for the memory ports to deliver what's in flight, a task at a time. */
async function settle(rounds = 10): Promise<void> {
  for (let round = 0; round < rounds; round++) {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe("extension hosts", () => {
  it("starts only the extensions whose tool is detected, and those that activate on detection at once", async () => {
    const activate = vi.fn<() => void>()
    const { hosts, started, latest } = setUp({ "@parity-app/extension-storybook": { activate } })

    hosts.open(project)
    await settle()

    expect(started.map((each) => each.extension)).toEqual(["@parity-app/extension-storybook"])
    expect(activate).toHaveBeenCalledOnce()
    expect(latest("@parity-app/extension-storybook")?.state).toBe("running")
    expect(latest("parity-route-timings")).toBeUndefined()
  })

  it("gives activate the project and what detection found", async () => {
    let given: Parity | undefined
    const { hosts } = setUp({ "@parity-app/extension-storybook": { activate: (parity) => void (given = parity) } })

    hosts.open(project)
    await settle()

    expect(given?.project).toEqual({ root: "/shop", name: "Shop", detected: { configDir: ".storybook" } })
    expect(given?.extension).toEqual({
      id: "@parity-app/extension-storybook",
      version: "1.0.0",
      displayName: "Storybook"
    })
  })

  it("starts an extension that activates on a command the first time the command runs", async () => {
    const measured = vi.fn<() => void>()

    const { hosts, started } = setUp({
      "parity-route-timings": {
        activate(parity) {
          parity.commands.register("timings.measure", measured)
        }
      }
    })

    hosts.open(project)
    await settle()
    expect(started).toEqual([])

    await hosts.run("shop", "timings.measure", { type: "component", key: "Button" })

    expect(started.map((each) => each.extension)).toEqual(["parity-route-timings"])
    expect(measured).toHaveBeenCalledWith({ type: "component", key: "Button" })
  })

  it("names a command nobody handles, and logs a handler's failure", async () => {
    const { hosts, lines } = setUp({
      "@parity-app/extension-storybook": { activate: () => undefined },
      "parity-route-timings": {
        activate(parity) {
          parity.commands.register("timings.measure", () => {
            throw new Error("No routes")
          })
        }
      }
    })

    hosts.open(project)
    await expect(hosts.run("shop", "storybook.open")).rejects.toThrow("Nothing handles storybook.open")
    await expect(hosts.run("shop", "timings.measure")).rejects.toThrow("No routes")
    expect(lines.at(-1)?.line).toMatchObject({ level: "error", text: "timings.measure failed: No routes" })
  })

  it("draws status items with their last value, then what the code sets", async () => {
    const { hosts, latest, state } = setUp({
      "@parity-app/extension-storybook": {
        activate(parity) {
          parity.status.item("storybook.stories").set({ value: "12", tooltip: "12 components with stories" })
        }
      }
    })

    state.write("@parity-app/extension-storybook", "/shop", "status", "storybook.stories", { value: "9" })
    hosts.open(project)
    expect(latest("@parity-app/extension-storybook")?.status).toEqual({ "storybook.stories": { value: "9" } })

    await settle()

    expect(latest("@parity-app/extension-storybook")?.status["storybook.stories"]).toEqual({
      value: "12",
      tooltip: "12 components with stories"
    })
    expect(state.saved.get("@parity-app/extension-storybook|/shop|status|storybook.stories")).toEqual({
      value: "12",
      tooltip: "12 components with stories"
    })
  })

  it("refuses ids the manifest doesn't declare, and context keys outside the prefix", async () => {
    const problems: string[] = []

    const { hosts, latest } = setUp({
      "@parity-app/extension-storybook": {
        activate(parity) {
          for (const attempt of [
            () => parity.commands.register("storybook.other", () => undefined),
            () => parity.status.item("storybook.other"),
            () => parity.context.set("timings.ready", true)
          ]) {
            try {
              attempt()
            } catch (error) {
              problems.push(error instanceof Error ? error.message : String(error))
            }
          }

          parity.context.set("storybook.hasStories", ["Button"])
          parity.facts.set({ type: "component", key: "Button" }, [{ id: "stories", label: "Stories", value: "3" }])
        }
      }
    })

    hosts.open(project)
    await settle()

    expect(problems).toEqual([
      "storybook.other isn't a command the manifest declares",
      "storybook.other isn't a status item the manifest declares",
      'Context key timings.ready must start with "storybook."'
    ])
    expect(latest("@parity-app/extension-storybook")?.context).toEqual({ "storybook.hasStories": ["Button"] })
    expect(latest("@parity-app/extension-storybook")?.facts).toEqual({
      Button: [{ id: "stories", label: "Stories", value: "3" }]
    })
  })

  it("keeps parity.state between runs, for every project and for this one", async () => {
    let values: JsonValue[] = []

    const modules = {
      "@parity-app/extension-storybook": {
        async activate(parity: Parity) {
          values = [parity.state.app.get("opened") ?? 0, parity.state.project.get("port") ?? null]
          await parity.state.app.update("opened", Number(parity.state.app.get("opened") ?? 0) + 1)
          await parity.state.project.update("port", 6006)
        }
      }
    } satisfies Record<string, ExtensionModule>

    const { hosts } = setUp(modules)
    hosts.open(project)
    await settle()
    expect(values).toEqual([0, null])

    hosts.restart("shop", "@parity-app/extension-storybook")
    await settle()
    expect(values).toEqual([1, 6006])
  })

  it("logs what the extension writes, and passes parity.ui to the window", async () => {
    let answer: string | undefined

    const { hosts, lines, notified } = setUp({
      "@parity-app/extension-storybook": {
        async activate(parity) {
          parity.log.info("Found 12 stories")
          parity.log.error(new Error("No index"))
          answer = await parity.ui.notify("Storybook moved", { actions: ["Restart"] })
        }
      }
    })

    hosts.open(project)
    await settle()

    expect(lines.map(({ line }) => [line.level, line.text])).toEqual([
      ["info", "Found 12 stories"],
      ["error", "No index"]
    ])
    expect(lines[1]?.line.stack).toContain("No index")
    expect(notified).toEqual(["Storybook moved"])
    expect(answer).toBe("Restart")
    expect(hosts.list("shop").logs["@parity-app/extension-storybook"]).toHaveLength(2)
  })

  it("starts a host again after it crashes, and leaves it stopped after a few crashes in a row", async () => {
    const activate = vi.fn<() => void>()
    const { hosts, started, latest, lines } = setUp({ "@parity-app/extension-storybook": { activate } })

    hosts.open(project)
    await settle()

    for (let crash = 1; crash <= 3; crash++) {
      started.at(-1)?.crash()
      await settle()
    }

    expect(activate).toHaveBeenCalledTimes(3)
    expect(latest("@parity-app/extension-storybook")).toMatchObject({
      state: "crashed",
      reason: "It crashed 3 times in a row."
    })
    expect(lines.filter(({ line }) => line.text === "Storybook stopped by itself, with exit code 1")).toHaveLength(3)

    await expect(hosts.run("shop", "storybook.open")).rejects.toThrow("Storybook has stopped. Restart it to try again.")

    hosts.restart("shop", "@parity-app/extension-storybook")
    await settle()

    expect(activate).toHaveBeenCalledTimes(4)
    expect(latest("@parity-app/extension-storybook")?.state).toBe("running")
  })

  it("leaves one extension's crash to itself", async () => {
    const measured = vi.fn<() => void>()

    const { hosts, started, latest } = setUp(
      {
        "@parity-app/extension-storybook": { activate: () => undefined },
        "parity-route-timings": {
          activate: (parity) => void parity.commands.register("timings.measure", measured)
        }
      },
      { timing: { crashLimit: 1 } }
    )

    hosts.open(project)
    await hosts.run("shop", "timings.measure")
    started.find((each) => each.extension === "@parity-app/extension-storybook")?.crash()
    await settle()

    expect(latest("@parity-app/extension-storybook")?.state).toBe("crashed")
    expect(latest("parity-route-timings")?.state).toBe("running")
    await hosts.run("shop", "timings.measure")
    expect(measured).toHaveBeenCalledTimes(2)
  })

  it("keeps an extension's processes when its host crashes, and gives them back with their output", async () => {
    const seen: { state?: string; tail: string[] }[] = []
    const stopAll = vi.fn<ExtensionProcesses["stopAll"]>()
    const reattached = vi.fn<ExtensionProcesses["reattached"]>()

    const { hosts, started } = setUp(
      {
        "@parity-app/extension-storybook": {
          activate(parity) {
            const server = parity.processes.get("storybook")
            seen.push({ state: server?.info.state, tail: server?.output.tail() ?? [] })
          }
        }
      },
      {
        processes: processesMock({
          stopAll,
          reattached,
          snapshot: () => ({ list: [storybookServer], output: { storybook: ["Storybook ready"] }, ready: {} })
        })
      }
    )

    hosts.open(project)
    await settle()
    started.at(-1)?.crash()
    await settle()

    expect(seen).toEqual([
      { state: "running", tail: ["Storybook ready"] },
      { state: "running", tail: ["Storybook ready"] }
    ])
    expect(stopAll).not.toHaveBeenCalled()
    expect(reattached).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ projectId: "shop" }), "crash")
  })

  it("starts a process, hears its lines, and says it's ready once a line matches its output check", async () => {
    const markReady = vi.fn<ExtensionProcesses["markReady"]>()
    const heard: string[][] = []
    let listener: ProcessListener | undefined

    const { hosts } = setUp(
      {
        "@parity-app/extension-storybook": {
          activate(parity) {
            parity.commands.register("storybook.open", async () => {
              const server = await parity.processes.start({
                id: "storybook",
                name: "Storybook",
                lifetime: "server",
                run: { bin: "storybook" },
                ready: { output: "Local: (http://\\S+)" }
              })

              server.output.onLines((lines) => void heard.push(lines))
            })
          }
        }
      },
      {
        processes: processesMock({
          start: () => Promise.resolve({ ...storybookServer, state: "starting" }),
          markReady,
          watch(_caller, given) {
            listener = given

            return () => undefined
          }
        })
      }
    )

    hosts.open(project)
    await hosts.run("shop", "storybook.open")
    listener?.lines("storybook", ["Starting…", "Local: http://localhost:6006/"], 1)
    await settle()

    expect(heard).toEqual([["Starting…", "Local: http://localhost:6006/"]])
    expect(markReady).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ extension: "@parity-app/extension-storybook" }),
      "storybook",
      "Local: http://localhost:6006/"
    )

    // Once its run is ready, the line again says nothing; its next run is said ready again.
    listener?.changed([{ ...storybookServer, state: "running" }])
    listener?.lines("storybook", ["Local: http://localhost:6006/"], 1)
    listener?.changed([{ ...storybookServer, state: "starting", run: 2 }])
    listener?.lines("storybook", ["Local: http://localhost:6007/"], 2)
    await settle()

    expect(markReady.mock.calls.map(([, , match]) => match)).toEqual([
      "Local: http://localhost:6006/",
      "Local: http://localhost:6007/"
    ])
  })

  it("matches only the current run's output as it starts, and its check again after the host starts again", async () => {
    const markReady = vi.fn<ExtensionProcesses["markReady"]>()
    let listener: ProcessListener | undefined
    let second: ProcessInfo | undefined

    const { hosts, started } = setUp(
      {
        "@parity-app/extension-storybook": {
          activate(parity) {
            parity.commands.register("storybook.open", async () => {
              await parity.processes.start({
                id: "storybook",
                name: "Storybook",
                lifetime: "server",
                run: { bin: "storybook" },
                ready: { output: "Local: (http://\\S+)" }
              })
            })
          }
        }
      },
      {
        processes: processesMock({
          // A second run, while the host still holds the first run's lines.
          start() {
            second = { ...storybookServer, state: "starting", run: 2 }

            return Promise.resolve(second)
          },
          markReady,
          snapshot: (): ProcessSnapshot =>
            second
              ? { list: [second], output: {}, ready: { storybook: "Local: (http://\\S+)" } }
              : { list: [], output: { storybook: ["Local: http://localhost:6006/"] }, ready: {} },
          watch(_caller, given) {
            listener = given

            return () => undefined
          }
        })
      }
    )

    hosts.open(project)
    await settle()
    await hosts.run("shop", "storybook.open")
    await settle()

    expect(markReady).not.toHaveBeenCalled()

    // Started again after a crash, it matches the run's line with the check it got back.
    started.at(-1)?.crash()
    await settle()
    listener?.lines("storybook", ["Local: http://localhost:6008/"], 2)
    await settle()

    expect(markReady.mock.calls.map(([, , match]) => match)).toEqual(["Local: http://localhost:6008/"])
  })

  it("names an extension that fails to activate, with the reason", async () => {
    const { hosts, latest } = setUp({
      "@parity-app/extension-storybook": {
        activate() {
          throw new Error("No config")
        }
      }
    })

    hosts.open(project)
    await settle()

    expect(latest("@parity-app/extension-storybook")).toMatchObject({
      state: "crashed",
      reason: "Couldn't activate: No config"
    })
  })

  it("names a host that stops answering pings as stuck, and running again once it answers", async () => {
    vi.useFakeTimers()
    let answer: (() => void) | undefined
    let busy = false

    // A host whose pings go unanswered while it's busy, as one whose extension's code blocks it would.
    const start = () => {
      const [service, host] = memoryPorts()
      const channel = createChannel<HostMethods, HostServiceMethods>()
      channel.serve({
        activate: () => ({ api: [] }),
        run: () => ({}),
        tool: () => ({}),
        "api.call": () => ({}),
        "view.changed": () => undefined,
        ping: () => (busy ? new Promise<undefined>((resolve) => (answer = () => resolve(undefined))) : undefined),
        "settings.changed": () => undefined,
        "processes.changed": () => undefined,
        "processes.lines": () => undefined,
        "processes.ended": () => undefined,
        cancel: () => undefined,
        "selection.changed": () => undefined,
        stop: () => undefined
      })
      channel.connect(host)

      return {
        port: service,
        life: lifecycle({ onOutput: () => undefined, onEnd: () => undefined, kill: () => undefined })
      }
    }

    const { hosts, latest } = setUp(
      { "@parity-app/extension-storybook": { activate: () => undefined } },
      { start, timing: { pingEvery: 100, pingTimeout: 300 } }
    )

    hosts.open(project)
    await vi.advanceTimersByTimeAsync(10)
    expect(latest("@parity-app/extension-storybook")?.state).toBe("running")

    busy = true
    await vi.advanceTimersByTimeAsync(500)
    expect(latest("@parity-app/extension-storybook")).toMatchObject({
      state: "stuck",
      reason: "Not answering after 0.3 seconds"
    })

    busy = false
    answer?.()
    await vi.advanceTimersByTimeAsync(10)
    expect(latest("@parity-app/extension-storybook")?.state).toBe("running")
  })

  it("stops every host and its servers when the project closes", async () => {
    const deactivate = vi.fn<() => void>()
    const disposed = vi.fn<() => void>()
    const stopAll = vi.fn<() => void>()

    const { hosts } = setUp(
      {
        "@parity-app/extension-storybook": {
          activate: (parity) => void parity.subscriptions.push({ dispose: disposed }),
          deactivate
        }
      },
      { processes: processesMock({ stopAll }) }
    )

    hosts.open(project)
    await settle()
    await hosts.close("shop")

    expect(disposed).toHaveBeenCalledOnce()
    expect(deactivate).toHaveBeenCalledOnce()
    expect(stopAll).toHaveBeenCalledWith("shop", "@parity-app/extension-storybook")
    expect(hosts.list("shop").extensions).toEqual([])
  })

  it("renames a layer from a command as one change, labelled with the extension's name", async () => {
    const transact = vi.fn<ExtensionEdits["transact"]>(() => Promise.resolve())

    const { hosts } = setUp(
      {
        "parity-tidy": {
          activate(parity) {
            parity.commands.register("tidy.rename", async (target) => {
              if (target?.type === "layer") {
                await parity.edits.transact("Rename layer", [
                  { op: "set", design: target.design, node: target.node, path: ["name"], value: "Heading" }
                ])
              }
            })
          }
        }
      },
      { edits: { transact, files: () => Promise.resolve([]) } }
    )

    hosts.open(project)
    await hosts.run("shop", "tidy.rename", { type: "layer", design: "app.par#home", node: "title" })

    expect(transact).toHaveBeenCalledWith("shop", "parity-tidy", "Tidy: Rename layer", [
      { op: "set", design: "app.par#home", node: "title", path: ["name"], value: "Heading" }
    ])
  })

  it("refuses design changes from an extension without the edits permission", async () => {
    const transact = vi.fn<ExtensionEdits["transact"]>(() => Promise.resolve())

    const { hosts } = setUp(
      {
        "parity-route-timings": {
          activate(parity) {
            parity.commands.register("timings.measure", () =>
              parity.edits.transact("Badge", [{ op: "remove", design: "app.par#home", node: "title" }])
            )
          }
        }
      },
      { edits: { transact, files: () => Promise.resolve([]) } }
    )

    hosts.open(project)

    await expect(hosts.run("shop", "timings.measure")).rejects.toThrow("Route timings can't change designs")
    expect(transact).not.toHaveBeenCalled()
  })

  it("writes files through the service, and refuses a .par whatever the permission names", async () => {
    const files = vi.fn<ExtensionEdits["files"]>(() => Promise.resolve(["src/Button.stories.tsx"]))
    let written: string[] = []

    const { hosts } = setUp(
      {
        "parity-tidy": {
          activate(parity) {
            parity.commands.register("tidy.rename", async () => {
              written = await parity.files.edit("Add story", [
                { kind: "create", path: "src/Button.stories.tsx", content: "export default {}" }
              ])
              await parity.files.edit("Rename", [{ kind: "patch", path: "app.par", find: "Title", replace: "Heading" }])
            })
          }
        }
      },
      { edits: { transact: () => Promise.resolve(), files } }
    )

    hosts.open(project)

    await expect(hosts.run("shop", "tidy.rename")).rejects.toThrow(
      "Tidy can't write app.par: extensions change designs with parity.edits, never .par files"
    )
    expect(written).toEqual(["src/Button.stories.tsx"])
    expect(files).toHaveBeenCalledOnce()
    expect(files).toHaveBeenCalledWith("shop", "parity-tidy", "Tidy: Add story", [
      { kind: "create", path: "src/Button.stories.tsx", content: "export default {}" }
    ])
  })

  it("gives activate each setting from its own scope, the rest at their defaults, and refuses an undeclared key", async () => {
    let given: Parity | undefined
    const { hosts } = setUp({ "@parity-app/extension-storybook": { activate: (parity) => void (given = parity) } })

    hosts.setAppSettings({ storybook: { openIn: "parity", configDir: "ignored" } })
    hosts.open(project)
    await settle()

    expect(given?.settings.get("storybook.openIn")).toBe("parity")
    expect(given?.settings.get("storybook.configDir")).toBe(".storybook")
    expect(() => given?.settings.get("storybook.port")).toThrow("isn't a setting the manifest declares")
  })

  it("tells the running code each setting that changes, from Settings or the project's file", async () => {
    const heard: string[] = []

    const { hosts } = setUp({
      "@parity-app/extension-storybook": {
        activate(parity) {
          parity.settings.onChange("storybook.openIn", (value) => heard.push(`openIn ${value}`))
          parity.settings.onChange("storybook.configDir", (value) => heard.push(`configDir ${value}`))
        }
      }
    })

    hosts.open(project)
    await settle()
    hosts.setAppSettings({ storybook: { openIn: "parity" } })
    hosts.setProjectSettings("shop", { storybook: { configDir: "docs/.storybook" } })
    // Values that don't change aren't sent again.
    hosts.setAppSettings({ storybook: { openIn: "parity" } })
    await settle()

    expect(heard).toEqual(["openIn parity", "configDir docs/.storybook"])
  })

  it("sends a project setting's update to the window, and refuses an app setting's", async () => {
    let given: Parity | undefined

    const { hosts, updated } = setUp({
      "@parity-app/extension-storybook": { activate: (parity) => void (given = parity) }
    })

    hosts.open(project)
    await settle()
    await given?.settings.update("storybook.configDir", "docs/.storybook")
    await given?.settings.update("storybook.configDir", undefined)

    expect(updated).toEqual([
      { extension: "storybook", key: "configDir", value: "docs/.storybook" },
      { extension: "storybook", key: "configDir" }
    ])
    await expect(given?.settings.update("storybook.openIn", "parity")).rejects.toThrow("only Settings changes it")
    expect(updated).toHaveLength(2)
  })

  it("lists a value that doesn't fit with a note, how long activating took, and the manifest's permissions", async () => {
    const { hosts, latest } = setUp({ "@parity-app/extension-storybook": { activate: () => undefined } })

    hosts.setAppSettings({ storybook: { openIn: "tab" } })
    hosts.open(project)
    await settle()

    const listed = latest("@parity-app/extension-storybook")
    expect(listed?.settingProblems).toEqual([
      `Open stories in is set to "tab", which it can't take, so it's at its default.`
    ])
    expect(listed?.activatedIn).toBeGreaterThanOrEqual(0)
    expect(listed).toMatchObject({ prefix: "storybook", permissions: {}, activates: ["onDetect"] })
  })
})

describe("selection, navigation and commands (PAR-1092)", () => {
  const route = { owner: "tanstack-router", type: "route", key: "/settings" }
  const design = { owner: "design", type: "design", key: "pricing" }

  /** Hosts whose window records what it's asked, and answers `pageUrl`. */
  function withWindow(modules: Record<string, ExtensionModule>) {
    const asked: { method: string; params: unknown }[] = []

    const set = setUp(modules, {
      window: {
        changed: () => undefined,
        logged: () => undefined,
        updateSetting: () => Promise.resolve(),
        reveal: () => undefined,
        async ui(_projectId, _extension, method, params) {
          asked.push({ method, params })

          return method === "navigate" ? { url: "http://localhost:5173/settings" } : undefined
        }
      }
    })

    return { ...set, asked }
  }

  it("gives what's selected, from the start and as it changes", async () => {
    let given: Parity | undefined
    const seen: unknown[] = []

    const { hosts } = setUp({
      "@parity-app/extension-storybook": {
        activate(parity) {
          given = parity
          parity.selection.onChange((refs) => seen.push(refs))
        }
      }
    })

    hosts.open(project)
    hosts.selectionChanged("shop", [design])
    await settle()

    expect(given?.selection.get()).toEqual([design])

    hosts.selectionChanged("shop", [route])
    await settle()

    expect(given?.selection.get()).toEqual([route])
    expect(seen.at(-1)).toEqual([route])
  })

  it("asks the window to select, highlight and navigate, and gives a route's page URL", async () => {
    let url: string | undefined

    const { hosts, asked } = withWindow({
      "@parity-app/extension-storybook": {
        async activate(parity) {
          await parity.selection.set([route])
          await parity.selection.highlight([design])
          await parity.navigate.reveal(route)
          await parity.navigate.setState("pricing", "Empty")
          await parity.navigate.openSettings()
          url = await parity.navigate.pageUrl(route)
        }
      }
    })

    hosts.open(project)
    await settle(30)

    expect(asked).toEqual([
      { method: "selection.set", params: { refs: [route] } },
      { method: "selection.highlight", params: { refs: [design] } },
      { method: "navigate", params: { kind: "reveal", ref: route } },
      { method: "navigate", params: { kind: "setState", design: "pricing", state: "Empty" } },
      { method: "navigate", params: { kind: "openSettings", id: "@parity-app/extension-storybook" } },
      { method: "navigate", params: { kind: "pageUrl", ref: route } }
    ])
    expect(url).toBe("http://localhost:5173/settings")
  })

  it("runs Parity's own commands in the window and extensions' in their hosts", async () => {
    const measured = vi.fn<() => void>()

    const { hosts, asked } = withWindow({
      "@parity-app/extension-storybook": {
        async activate(parity) {
          await parity.commands.execute("zoomToSelection")
          await parity.commands.execute("timings.measure")
        }
      },
      "parity-route-timings": {
        activate: (parity) => void parity.commands.register("timings.measure", measured)
      }
    })

    hosts.open(project)
    await settle(40)

    expect(asked).toEqual([{ method: "commands.execute", params: { command: "zoomToSelection" } }])
    expect(measured).toHaveBeenCalledOnce()
  })

  it("refuses a node that isn't one", async () => {
    let refused: unknown

    const { hosts } = withWindow({
      "@parity-app/extension-storybook": {
        async activate(parity) {
          // SAFETY: an extension's code can send anything; the service checks it.
          await parity.selection.set([{ owner: "", type: "route", key: "/" }] as never).catch((error) => {
            refused = error
          })
        }
      }
    })

    hosts.open(project)
    await settle(20)

    expect(refused).toBeInstanceOf(Error)
  })
})
