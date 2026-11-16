import { memoryPorts } from "@parity-app/channel"
import type { JsonValue, NodeRef, SettingValue } from "@parity-app/extension"
import {
  CapabilityMissingError,
  defineWindowModule,
  type HalfState,
  HalfUnavailableError,
  type WindowModule,
  type WindowParity
} from "@parity-app/extension/internal"
import { readExtension } from "@parity-app/extension/manifest"
import { type ChildEnd, lifecycle } from "@parity-app/processes"
import { describe, expect, it } from "vite-plus/test"
import { z } from "zod"
import type { ExtensionEventName } from "./events.ts"
import {
  type WindowTestWindowApi,
  windowTestModule,
  windowTestNode,
  windowTestPackage
} from "./fixtures/window-test.ts"
import { serveExtensionHost } from "./host.ts"
import { type ExtensionHosts, type ExtensionStatus, extensionHosts, type OpenedProject } from "./hosts.ts"
import { type WindowExtension, type WindowModules, windowExtensions, windowModules } from "./window-modules.ts"

/** An event's attributes, as a test reads them. */
const asRecord = z.record(z.string(), z.json().optional())

/** What a module reads as `parity.canvas`, which later phases give and which needs the `canvas` capability. */
const canvasOf = (parity: WindowParity | undefined) =>
  parity && "canvas" in parity && parity.canvas instanceof Object ? parity.canvas : undefined

/** Lets promises already resolved run their callbacks. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

/** The window test extension as the service sends it, with what a test changes. */
function extension(change: Partial<WindowExtension> = {}): WindowExtension {
  return {
    id: "@parity-app/extension-window-test",
    version: "0.0.0",
    displayName: "Window test",
    internal: true,
    window: true,
    node: true,
    activates: ["onSetting:wtest.on"],
    capabilities: [],
    extensionDependencies: [],
    commands: ["wtest.fail"],
    settings: { "wtest.on": true },
    settingScopes: { "wtest.on": "app" },
    host: "running",
    ...change
  }
}

/** A tab's window modules with stand-ins for the editor and the Node halves, recording what happens. */
function tab(modules: Record<string, WindowModule> = {}, failureLimit?: number) {
  const events: { name: ExtensionEventName; attributes: Record<string, JsonValue | undefined> }[] = []
  const halves: string[] = []
  const logs: string[] = []
  const stopped: string[] = []
  const tags: Record<string, string>[] = []
  const selection = new Set<(refs: NodeRef[]) => void>()
  const parities = new Map<string, WindowParity>()

  const runtime: WindowModules = windowModules({
    tab: "tab-1",
    project: { root: "/shop", name: "Shop" },
    load: (id) => {
      const module = modules[id] ?? windowTestModule

      // Each test's module keeps the parity it was given, so the test can call through it.
      return Promise.resolve({
        activateWindow: (parity: WindowParity) => {
          parities.set(id, parity)

          return module.activateWindow(parity)
        },
        deactivateWindow: () => module.deactivateWindow?.()
      })
    },
    editor: {
      selection: {
        get: () => [],
        set: () => Promise.resolve(),
        highlight: () => Promise.resolve(),
        onChange(listener) {
          selection.add(listener)

          return () => selection.delete(listener)
        }
      },
      navigate: {
        reveal: () => Promise.resolve(),
        zoomTo: () => Promise.resolve(),
        openDesign: () => Promise.resolve(),
        setMode: () => Promise.resolve(),
        setState: () => Promise.resolve(),
        showTab: () => Promise.resolve(),
        openSettings: () => Promise.resolve(),
        pageUrl: () => Promise.resolve(undefined)
      },
      execute: () => Promise.resolve()
    },
    halves: {
      start: (id, trigger) => void halves.push(`start ${id} ${trigger}`),
      call: (id, method) => Promise.resolve(`${method} answered by ${id}`),
      state: (id, state) => void halves.push(`${id} ${state}`)
    },
    updateSetting: () => Promise.resolve(),
    log: (_id, level, text) => void logs.push(`${level}: ${text}`),
    record: (name, attributes) => void events.push({ name, attributes: asRecord.parse(attributes) }),
    report: (_error, given) => void tags.push(given),
    stopped: (stoppedExtension) => void stopped.push(stoppedExtension.displayName),
    surfaces: { canvas: { capability: "canvas", make: () => ({ layer: () => undefined }) } },
    failureLimit: failureLimit ?? 5
  })

  const named = (name: ExtensionEventName) => events.flatMap((event) => (event.name === name ? [event.attributes] : []))

  const select = () => {
    for (const listener of selection) {
      listener([])
    }
  }

  return { runtime, events, named, halves, logs, stopped, tags, parities, select, selection }
}

describe("window modules in a project tab", () => {
  it("activates a module while its setting is on, starting its Node half, and deactivates it when it goes off", async () => {
    const { runtime, named, halves } = tab()
    const id = "@parity-app/extension-window-test"

    runtime.update([extension({ settings: { "wtest.on": false } })])
    await settle()

    expect(runtime.states()).toEqual({ [id]: "inactive" })

    runtime.update([extension()])
    await settle()

    expect(runtime.states()).toEqual({ [id]: "active" })
    expect(halves).toEqual([`start ${id} onSetting:wtest.on`, `${id} starting`, `${id} ready`])
    expect(named("extension.activated")).toMatchObject([
      { extension: id, half: "window", internal: true, trigger: "onSetting:wtest.on", capabilities: [] }
    ])

    runtime.update([extension({ settings: { "wtest.on": false } })])
    await settle()

    expect(runtime.states()).toEqual({ [id]: "inactive" })
    expect(named("extension.deactivated")).toMatchObject([{ extension: id, half: "window", why: "setting" }])
    expect(halves.at(-1)).toBe(`${id} stopped`)
  })

  it("activates an onStartup module in every tab, each with its own parity", async () => {
    const first = tab()
    const second = tab()
    const startup = extension({ activates: ["onStartup"], settings: {}, settingScopes: {} })

    first.runtime.update([startup])
    second.runtime.update([startup])
    await settle()

    expect(Object.values(first.runtime.states())).toEqual(["active"])
    expect(Object.values(second.runtime.states())).toEqual(["active"])
    expect(first.parities.get(startup.id) === second.parities.get(startup.id)).toBe(false)
    expect(first.parities.get(startup.id)?.tab).toBe("tab-1")
  })

  it("leaves out extensions that aren't internal or have no window module", async () => {
    const { runtime } = tab()

    runtime.update([extension({ internal: false }), extension({ id: "other", window: false })])
    await settle()

    expect(runtime.states()).toEqual({})
  })

  it("stops a module in the tab after five failures, telling the person, and runs nothing of it after", async () => {
    const { runtime, named, stopped, tags, logs } = tab()

    runtime.update([extension()])
    await settle()

    for (let failure = 1; failure <= 5; failure++) {
      await expect(runtime.run("wtest.fail")).rejects.toThrow("Failing on purpose")
    }

    await settle()

    expect(Object.values(runtime.states())).toEqual(["inactive"])
    expect(named("extension.callFailed").map((event) => [event.api, event.failures, event.stopped])).toEqual([
      ["command:wtest.fail", 1, false],
      ["command:wtest.fail", 2, false],
      ["command:wtest.fail", 3, false],
      ["command:wtest.fail", 4, false],
      ["command:wtest.fail", 5, true]
    ])
    expect(named("extension.stoppedInTab")).toMatchObject([{ failures: 5, message: "Failing on purpose" }])
    expect(named("extension.deactivated")).toMatchObject([{ why: "crashed" }])
    expect(stopped).toEqual(["Window test"])
    expect(tags[0]).toEqual({ extension: "@parity-app/extension-window-test", extension_half: "window", tab: "tab-1" })
    expect(logs[0]).toBe("error: command:wtest.fail failed: Failing on purpose")
    await expect(runtime.run("wtest.fail")).resolves.toEqual({ handled: false })

    // It stays stopped in this tab, whatever the service sends.
    runtime.update([extension()])
    await settle()

    expect(Object.values(runtime.states())).toEqual(["inactive"])
  })

  it("counts a listener that throws without stopping what told it", async () => {
    const throwing = defineWindowModule({
      activateWindow(parity) {
        parity.subscriptions.push(
          parity.selection.onChange(() => {
            throw new Error("Bad listener")
          })
        )

        return {}
      }
    })

    const { runtime, named, select } = tab({ "@parity-app/extension-window-test": throwing }, 2)

    runtime.update([extension()])
    await settle()
    select()

    expect(named("extension.callFailed")).toMatchObject([{ api: "selection.onChange", failures: 1, stopped: false }])

    select()
    await settle()

    expect(Object.values(runtime.states())).toEqual(["inactive"])
  })

  it("rejects a call to a Node half that isn't ready with HalfUnavailableError, and calls one that is", async () => {
    const { runtime, parities, named } = tab()
    const id = "@parity-app/extension-window-test"

    runtime.update([extension({ host: "starting" })])
    await settle()
    const host = parities.get(id)?.host
    const states: HalfState[] = []
    host?.onStateChange((state) => states.push(state))

    expect(host?.state).toBe("starting")
    await expect(host?.api<{ ping(): string }>().ping()).rejects.toBeInstanceOf(HalfUnavailableError)
    expect(named("extension.halfUnavailable")).toEqual([
      { extension: id, from: "window", method: "ping", state: "starting" }
    ])

    runtime.update([extension({ host: "running" })])

    await expect(host?.api<{ ping(): string }>().ping()).resolves.toBe(`ping answered by ${id}`)

    runtime.update([extension({ host: "starting" })])

    expect(states).toEqual(["ready", "restarting"])
  })

  it("gives a module without a Node half a stopped host, and keeps it running", async () => {
    const { runtime, parities, halves } = tab()
    const id = "@parity-app/extension-window-test"

    runtime.update([extension({ node: false, host: "waiting" })])
    await settle()

    expect(parities.get(id)?.host.state).toBe("stopped")
    expect(runtime.states()).toEqual({ [id]: "active" })
    expect(halves.some((half) => half.startsWith("start"))).toBe(false)
  })

  it("deactivates the module when its Node half stops for good", async () => {
    const { runtime, named } = tab()

    runtime.update([extension()])
    await settle()
    runtime.update([extension({ host: "crashed" })])
    await settle()

    expect(Object.values(runtime.states())).toEqual(["inactive"])
    expect(named("extension.deactivated")).toMatchObject([{ why: "crashed" }])

    // Restarted, it comes back.
    runtime.update([extension({ host: "starting" })])
    await settle()

    expect(Object.values(runtime.states())).toEqual(["active"])
  })

  it("answers its Node half through what it returned as node, and refuses while it isn't active", async () => {
    const { runtime, select } = tab()
    const id = "@parity-app/extension-window-test"

    await expect(runtime.callFromNode(id, "status", [])).rejects.toBeInstanceOf(HalfUnavailableError)

    runtime.update([extension()])
    await settle()
    select()

    await expect(runtime.callFromNode(id, "status", [])).resolves.toEqual({ tab: "tab-1", selections: 1 })
    await expect(runtime.callFromNode(id, "missing", [])).rejects.toThrow("has no missing")
  })

  it("refuses what needs a capability its manifest doesn't name, recording it once", async () => {
    const { runtime, parities, named } = tab()
    const id = "@parity-app/extension-window-test"

    runtime.update([extension()])
    await settle()
    const parity = parities.get(id)

    expect(() => canvasOf(parity)).toThrow(CapabilityMissingError)
    expect(() => canvasOf(parity)).toThrow('needs the "canvas" capability')
    expect(named("extension.capabilityMissing")).toEqual([
      { extension: id, capability: "canvas", api: "parity.canvas" }
    ])

    runtime.update([extension({ id: "other", capabilities: ["canvas"] })])
    await settle()

    expect(canvasOf(parities.get("other"))).toHaveProperty("layer")
  })

  it("gives a module the window module it builds on as that one comes and goes", async () => {
    const heard: string[] = []

    const watcher = defineWindowModule({
      activateWindow(parity) {
        const other = parity.extensions.get<WindowTestWindowApi>("@parity-app/extension-window-test")
        heard.push(`at first ${other.api?.greet("Mia") ?? "nothing"}`)
        parity.subscriptions.push(
          other.onAvailable((api) => heard.push(api.greet("Ana"))),
          other.onGone(() => heard.push("gone"))
        )

        return {}
      }
    })

    const { runtime, parities } = tab({ watcher })

    const watching = extension({
      id: "watcher",
      activates: ["onStartup"],
      node: false,
      extensionDependencies: ["@parity-app/extension-window-test"]
    })

    runtime.update([watching, extension({ settings: { "wtest.on": false } })])
    await settle()
    runtime.update([watching, extension()])
    await settle()
    runtime.update([watching, extension({ settings: { "wtest.on": false } })])
    await settle()

    expect(heard).toEqual(["at first nothing", "Hello, Ana", "gone"])
    expect(() => parities.get("watcher")?.extensions.get("not-named")).toThrow("isn't in the manifest's")
  })

  it("reads its settings, hears them change, and refuses to change an app setting", async () => {
    const heard: SettingValue[] = []

    const reading = defineWindowModule({
      activateWindow(parity) {
        parity.subscriptions.push(parity.settings.onChange("wtest.mode", (value) => heard.push(value)))

        return {}
      }
    })

    const { runtime, parities } = tab({ "@parity-app/extension-window-test": reading })
    const scopes = { "wtest.on": "app", "wtest.mode": "project" } as const

    runtime.update([extension({ settings: { "wtest.on": true, "wtest.mode": "a" }, settingScopes: scopes })])
    await settle()
    runtime.update([extension({ settings: { "wtest.on": true, "wtest.mode": "b" }, settingScopes: scopes })])
    const settings = parities.get("@parity-app/extension-window-test")?.settings

    expect(settings?.get("wtest.mode")).toBe("b")
    expect(heard).toEqual(["b"])
    expect(() => settings?.get("wtest.other")).toThrow("isn't a setting")
    await expect(settings?.update("wtest.on", false)).rejects.toThrow("only Settings changes it")
  })

  it("disposes of a module's subscriptions newest first, then deactivates it, as its tab closes", async () => {
    const order: string[] = []

    const tidy = defineWindowModule({
      activateWindow(parity) {
        parity.subscriptions.push({ dispose: () => order.push("first") }, { dispose: () => order.push("second") })

        return {}
      },
      deactivateWindow: () => void order.push("deactivated")
    })

    const { runtime, named } = tab({ "@parity-app/extension-window-test": tidy })

    runtime.update([extension()])
    await settle()
    await runtime.dispose()

    expect(order).toEqual(["second", "first", "deactivated"])
    expect(named("extension.deactivated")).toMatchObject([{ why: "tabClosed" }])
  })

  it("records a module that fails to load or activate, and leaves it off in the tab", async () => {
    const failing = defineWindowModule({
      activateWindow: () => {
        throw new Error("No room")
      }
    })

    const { runtime, named, stopped } = tab({ "@parity-app/extension-window-test": failing })

    runtime.update([extension()])
    await settle()

    expect(named("extension.activateFailed")).toMatchObject([{ half: "window", phase: "activate", message: "No room" }])
    expect(stopped).toEqual(["Window test"])
    expect(Object.values(runtime.states())).toEqual(["inactive"])
  })

  it("lets a slow activation that's been overtaken finish without undoing the one after it", async () => {
    const first = Promise.withResolvers<void>()
    let runs = 0

    const slow = defineWindowModule({
      async activateWindow(parity) {
        runs += 1
        const run = runs
        parity.subscriptions.push(parity.commands.register("wtest.fail", () => `run ${run}`))

        if (run === 1) {
          await first.promise
        }

        return {}
      }
    })

    const { runtime } = tab({ "@parity-app/extension-window-test": slow })

    runtime.update([extension()])
    await settle()
    runtime.update([extension({ settings: { "wtest.on": false } })])
    runtime.update([extension()])
    await settle()

    // The second waits for the first, still activating, to finish and tear itself down.
    expect(runs).toBe(1)

    first.resolve()
    await settle()
    await settle()

    expect(runs).toBe(2)
    expect(Object.values(runtime.states())).toEqual(["active"])
    await expect(runtime.run("wtest.fail")).resolves.toEqual({ handled: true, result: "run 2" })
  })
})

describe("an internal extension's two halves (the window test extension, in the real host code)", () => {
  const id = "@parity-app/extension-window-test"

  /** Its Node half in a host in memory, run by the real host code, and a tab's window modules, linked as the app links them. */
  function setUp() {
    const ends: ((ending: ChildEnd) => void)[] = []
    const events: { name: ExtensionEventName; attributes: Record<string, JsonValue | undefined> }[] = []
    /** The tab's window modules, once they're made below, which the service's stand-in window reaches. */
    const link = new Map<"runtime", WindowModules>()
    let latest: ExtensionStatus[] = []

    const found = readExtension(windowTestPackage, { builtIn: true })

    const hosts: ExtensionHosts<OpenedProject> = extensionHosts({
      extensions: [{ package: found, main: found.id, detect: () => ({}) }],
      start() {
        const [service, host] = memoryPorts()
        let end: (ending: ChildEnd) => void = () => undefined

        const life = lifecycle({
          onOutput: () => undefined,
          onEnd: (listener) => (end = listener),
          kill: () => end({ signal: "SIGTERM" })
        })

        serveExtensionHost({
          port: host,
          load: () => Promise.resolve(Object.assign(Object.create(null), { default: windowTestNode })),
          exit: () => end({ code: 0 })
        })
        ends.push((ending) => end(ending))

        return { port: service, life }
      },
      state: { read: () => ({ app: {}, project: {}, status: {} }), write: () => undefined },
      window: {
        updateSetting: () => Promise.resolve(),
        changed(_projectId, extensions) {
          latest = extensions
          link.get("runtime")?.update(windowExtensions(extensions))
        },
        logged: () => undefined,
        ui: () => Promise.reject(new Error("Not in this test")),
        reveal: () => undefined,
        callWindow: (_projectId, extension, method, args) =>
          link.get("runtime")?.callFromNode(extension, method, args) ?? Promise.reject(new Error("No tab")),
        runInWindow: (_projectId, command, target) =>
          link.get("runtime")?.run(command, target) ?? Promise.resolve({ handled: false })
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
      edits: { transact: () => Promise.resolve(), files: () => Promise.resolve([]) },
      record: (name, attributes) => void events.push({ name, attributes: asRecord.parse(attributes) })
    })

    const parities = new Map<string, WindowParity>()

    const runtime = windowModules({
      tab: "tab-1",
      project: { root: "/shop", name: "Shop" },
      // As the window's chunk loads it: `export default defineWindowModule(…)`.
      load: () =>
        Promise.resolve({
          default: defineWindowModule({
            activateWindow(parity: WindowParity) {
              parities.set(parity.extension.id, parity)

              return windowTestModule.activateWindow(parity)
            }
          })
        }),
      editor: {
        selection: {
          get: () => [],
          set: () => Promise.resolve(),
          highlight: () => Promise.resolve(),
          onChange: () => () => undefined
        },
        navigate: {
          reveal: () => Promise.resolve(),
          zoomTo: () => Promise.resolve(),
          openDesign: () => Promise.resolve(),
          setMode: () => Promise.resolve(),
          setState: () => Promise.resolve(),
          showTab: () => Promise.resolve(),
          openSettings: () => Promise.resolve(),
          pageUrl: () => Promise.resolve(undefined)
        },
        execute: () => Promise.resolve()
      },
      halves: {
        start: (extension, trigger) => hosts.startHalf("shop", extension, trigger),
        call: (extension, method, args) => hosts.callHalf("shop", extension, method, args),
        state: (extension, state) => hosts.windowState("shop", extension, state)
      },
      updateSetting: () => Promise.resolve(),
      log: () => undefined,
      record: (name, attributes) => void events.push({ name, attributes: asRecord.parse(attributes) })
    })

    link.set("runtime", runtime)
    hosts.setAppSettings({ wtest: { on: true } })
    hosts.open({ id: "shop", root: "/shop", name: "Shop" })

    /** Waits until the Node half is running and the window module active. */
    const ready = async () => {
      for (let tries = 0; tries < 50; tries++) {
        if (latest[0]?.state === "running" && runtime.states()[id] === "active") {
          return
        }

        await settle()
      }

      throw new Error("The halves never got ready")
    }

    return { hosts, runtime, parities, ends, events, ready, latest: () => latest }
  }

  it("never starts the Node half by itself, only with its window module", async () => {
    const { latest, ready, events } = setUp()

    expect(latest()[0]).toMatchObject({ internal: true, window: true, node: true, settings: { "wtest.on": true } })
    await ready()
    expect(
      events.filter((event) => event.name === "extension.activated").map((event) => event.attributes.half)
    ).toEqual(expect.arrayContaining(["window", "node"]))
    expect(
      events.find((event) => event.name === "extension.activated" && event.attributes.half === "node")?.attributes
        .trigger
    ).toBe("onSetting:wtest.on")
  })

  it("lets each half call the other", async () => {
    const { hosts, parities, ready } = setUp()

    await ready()

    // The window module calls its Node half.
    const window = parities.get(id)

    await expect(window?.host.api<{ ping(): string }>().ping()).resolves.toBe("pong")

    // The Node half calls its window module, through `parity.window`.
    await expect(hosts.callHalf("shop", id, "windowStatus", [])).resolves.toEqual({ tab: "tab-1", selections: 0 })
  })

  it("runs a command the window module registered in the tab, for its own module, the service and an agent", async () => {
    const { hosts, parities, ready } = setUp()

    await ready()

    // `wtest.fail` is the window module's, and fails on purpose: the Node half has no handler for it.
    await expect(parities.get(id)?.commands.execute("wtest.fail")).rejects.toThrow("Failing on purpose")
    await expect(hosts.run("shop", "wtest.fail")).rejects.toThrow("Failing on purpose")
    await expect(hosts.runForAgent("shop", { name: "wtest.fail" }, "Claude")).rejects.toThrow("Failing on purpose")
  })

  it("deactivates the window module once the Node half has crashed three times in a row", async () => {
    const { ends, ready, runtime, events } = setUp()

    await ready()

    for (let crash = 0; crash < 3; crash++) {
      ends.at(-1)?.({ code: 1 })
      await settle()
      await settle()
    }

    expect(runtime.states()[id]).toBe("inactive")
    expect(
      events.filter((event) => event.name === "extension.crashed").map((event) => event.attributes.restarting)
    ).toEqual([true, true, false])
    expect(
      events.find((event) => event.name === "extension.deactivated" && event.attributes.half === "window")?.attributes
    ).toMatchObject({ why: "crashed" })
  })
})
