import { createChannel, memoryPorts } from "@parity-app/channel"
import type { ExtensionModule, JsonValue, Parity } from "@parity-app/extension-api"
import { type ChildEnd, lifecycle } from "@parity-app/processes"
import { afterEach, describe, expect, it, vi } from "vite-plus/test"
import { serveExtensionHost } from "./host.ts"
import {
  type ExtensionHostsOptions,
  type ExtensionStateStore,
  type ExtensionStatus,
  extensionHosts,
  type InstalledExtension,
  type OpenedProject
} from "./hosts.ts"
import { readExtension } from "./manifest.ts"
import type { HostMethods, HostServiceMethods, LogLine } from "./protocol.ts"

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
      statusItems: [{ id: "storybook.stories", title: "Storybook", command: "storybook.open" }]
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
  const started: Started[] = []
  const state = memoryState()

  const installed = (found: typeof storybook): InstalledExtension<OpenedProject> => ({
    package: found,
    main: found.id,
    detect: () => (found.id in modules ? { detected: { configDir: ".storybook" } } : undefined)
  })

  const hosts = extensionHosts<OpenedProject>({
    extensions: [installed(storybook), installed(timings)],
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
      changed: (_projectId, extensions) => changes.push(extensions),
      logged: (_projectId, extension, line) => lines.push({ extension, line }),
      async ui(_projectId, _extension, method, params) {
        if (method === "ui.notify" && "message" in params) {
          notified.push(params.message)

          return { action: "Restart" }
        }

        return undefined
      }
    },
    servers: {
      serve: () => Promise.resolve({ url: "" }),
      adopt: vi.fn<() => void>(),
      stop: vi.fn<() => void>(),
      stopAll: vi.fn<() => void>(),
      routed: () => Promise.resolve([])
    },
    ...options
  })

  const latest = (id: string) => changes.at(-1)?.find((extension) => extension.id === id)

  return { hosts, changes, lines, notified, started, state, latest }
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
        activate: () => undefined,
        run: () => undefined,
        ping: () => (busy ? new Promise<undefined>((resolve) => (answer = () => resolve(undefined))) : undefined),
        cancel: () => undefined,
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
      {
        servers: {
          serve: () => Promise.resolve({ url: "" }),
          adopt: vi.fn<() => void>(),
          stop: vi.fn<() => void>(),
          stopAll,
          routed: () => Promise.resolve([])
        }
      }
    )

    hosts.open(project)
    await settle()
    await hosts.close("shop")

    expect(disposed).toHaveBeenCalledOnce()
    expect(deactivate).toHaveBeenCalledOnce()
    expect(stopAll).toHaveBeenCalledWith("shop", "@parity-app/extension-storybook")
    expect(hosts.list("shop").extensions).toEqual([])
  })
})
