import { AsyncLocalStorage } from "node:async_hooks"
import { memoryPorts } from "@parity-app/channel"
import {
  defineExtension,
  type ExtensionModule,
  type JsonValue,
  type NodeRef,
  type Parity,
  type SettingContribution,
  type SettingValue
} from "@parity-app/extension"
import {
  CapabilityMissingError,
  defineWindowModule,
  type HalfState,
  HalfUnavailableError,
  type InternalParity,
  type WindowModule,
  type WindowParity
} from "@parity-app/extension/internal"
import { readExtension } from "@parity-app/extension/manifest"
import { type ChildEnd, lifecycle } from "@parity-app/processes"
import { describe, expect, it } from "vite-plus/test"
import { z } from "zod"
import type { TracedCall } from "./debug.ts"
import type { ExtensionEventName } from "./events.ts"
import {
  type WindowTestWindowApi,
  windowTestModule,
  windowTestNode,
  windowTestPackage
} from "./fixtures/window-test.ts"
import { serveExtensionHost } from "./host.ts"
import { type ExtensionHosts, type ExtensionStatus, extensionHosts, type OpenedProject } from "./hosts.ts"
import type { LogLine } from "./protocol.ts"
import {
  type WindowExtension,
  type WindowModules,
  type WindowModulesOptions,
  windowExtensions,
  windowModules
} from "./window-modules.ts"
import { extensionsSnapshot } from "./window-snapshot.ts"

/** Carries an agent's call through the Node half's code in these tests. */
const calls = new AsyncLocalStorage<number | undefined>()

/** An event's attributes, as a test reads them. */
const asRecord = z.record(z.string(), z.json().optional())

/** What a module reads as `parity.canvas`, which later phases give and which needs the `canvas` capability. */
const canvasOf = (parity: WindowParity | undefined) =>
  parity && "canvas" in parity && parity.canvas instanceof Object ? parity.canvas : undefined

/** A Node half's `Parity` with its window module's link, as an internal extension with one gets. */
function isInternal(parity: Parity): parity is InternalParity {
  return "window" in parity
}

/** Lets promises already resolved run their callbacks. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

/** The window test extension as the service sends it, with what a test changes. */
function extension(change: Partial<WindowExtension> = {}): WindowExtension {
  return {
    id: "@parity-app/extension-window-test",
    version: "0.0.0",
    displayName: "Window test",
    prefix: "wtest",
    internal: true,
    window: true,
    node: true,
    activates: ["onSetting:wtest.on"],
    capabilities: [],
    extensionDependencies: [],
    commands: ["wtest.fail", "wtest.confirm", "wtest.nested"],
    settings: { "wtest.on": true },
    declaredSettings: { "wtest.on": { type: "boolean", scope: "app", title: "On" } },
    host: "running",
    ...change
  }
}

/**
 * A tab's window modules with stand-ins for the editor and the Node halves, recording what happens. `more` adds or
 * replaces options, as `debug`.
 */
function tab(
  modules: Record<string, WindowModule> = {},
  failureLimit?: number,
  more: Partial<WindowModulesOptions> = {}
) {
  const events: { name: ExtensionEventName; attributes: Record<string, JsonValue | undefined> }[] = []
  const halves: string[] = []
  const logs: string[] = []
  const updates: string[] = []
  const executed: { command: string; call?: number }[] = []
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
      execute: (command, _target, call) => {
        executed.push(call === undefined ? { command } : { command, call })

        return Promise.resolve()
      }
    },
    halves: {
      start: (id, trigger) => void halves.push(`start ${id} ${trigger}`),
      call: (id, method) => Promise.resolve(`${method} answered by ${id}`),
      state: (id, state) => void halves.push(`${id} ${state}`)
    },
    updateSetting: (prefix, key, value) => {
      updates.push(value === undefined ? `${prefix} ${key} cleared` : `${prefix} ${key} = ${JSON.stringify(value)}`)

      return Promise.resolve()
    },
    log: (_id, level, text) => void logs.push(`${level}: ${text}`),
    record: (name, attributes) => void events.push({ name, attributes: asRecord.parse(attributes) }),
    report: (_error, given) => void tags.push(given),
    stopped: (stoppedExtension) => void stopped.push(stoppedExtension.displayName),
    surfaces: { canvas: { capability: "canvas", make: () => ({ layer: () => undefined }) } },
    failureLimit: failureLimit ?? 5,
    ...more
  })

  const named = (name: ExtensionEventName) => events.flatMap((event) => (event.name === name ? [event.attributes] : []))

  const select = () => {
    for (const listener of selection) {
      listener([])
    }
  }

  return { runtime, events, named, halves, logs, stopped, tags, parities, select, selection, updates, executed }
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

  it("says when every activation started so far has settled, so the tab can open its document after", async () => {
    const { runtime } = tab()

    runtime.update([extension()])
    expect(runtime.states()).toEqual({ "@parity-app/extension-window-test": "loading" })
    await runtime.activating()
    expect(runtime.states()).toEqual({ "@parity-app/extension-window-test": "active" })
  })

  it("activates an onStartup module in every tab, each with its own parity", async () => {
    const first = tab()
    const second = tab()
    const startup = extension({ activates: ["onStartup"], settings: {}, declaredSettings: {} })

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

  it("logs failures from a run that's been replaced without stopping the run after it", async () => {
    const { promise: gate, resolve: release } = Promise.withResolvers<void>()

    const slow = defineWindowModule({
      activateWindow(parity) {
        parity.subscriptions.push(
          parity.commands.register("wtest.fail", async () => {
            await gate
            throw new Error("Failing late")
          })
        )

        return {}
      }
    })

    const { runtime, named } = tab({ "@parity-app/extension-window-test": slow })

    runtime.update([extension()])
    await settle()
    const pending = Array.from({ length: 5 }, async () => runtime.run("wtest.fail"))
    runtime.update([extension({ settings: { "wtest.on": false } })])
    await settle()
    runtime.update([extension()])
    await settle()
    release()

    for (const command of pending) {
      await expect(command).rejects.toThrow("Failing late")
    }

    await settle()

    expect(Object.values(runtime.states())).toEqual(["active"])
    expect(named("extension.callFailed").map((event) => event.stopped)).toEqual([false, false, false, false, false])
    expect(named("extension.stoppedInTab")).toEqual([])
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

  it("keeps what each extension does in the tab, with its latest failures, for extensions.json", async () => {
    let time = 1000

    const { runtime } = tab({}, 10, {
      now: () => time,
      surfaces: {
        canvas: {
          capability: "canvas",
          make: () => ({}),
          describe: () => ({ layers: ["wtest.dots"], previews: 1, holds: 0 })
        },
        sync: {
          make: () => ({}),
          describe: () => ({ room: { state: "attached", lineage: "l-1", writesFiles: false, pending: true } })
        }
      }
    })

    // Before its window module starts, it isn't in the snapshot.
    runtime.update([extension({ settings: { "wtest.on": false }, host: "starting" })])
    expect(extensionsSnapshot([runtime])).toEqual({ tabs: [] })

    runtime.update([extension({ host: "starting" })])
    await settle()

    for (let failure = 1; failure <= 7; failure++) {
      time += 1
      await expect(runtime.run("wtest.fail")).rejects.toThrow("Failing on purpose")
    }

    const { tabs } = extensionsSnapshot([runtime])

    expect(tabs).toEqual([
      {
        tab: "tab-1",
        extensions: [
          {
            id: "@parity-app/extension-window-test",
            version: "0.0.0",
            displayName: "Window test",
            halves: { window: "active", node: "starting" },
            capabilities: [],
            layers: ["wtest.dots"],
            previews: 1,
            holds: 0,
            failures: [1003, 1004, 1005, 1006, 1007].map((at) => ({
              api: "command:wtest.fail",
              message: "Failing on purpose",
              at
            })),
            room: { state: "attached", lineage: "l-1", writesFiles: false, pending: true }
          }
        ]
      }
    ])
  })

  it("adds the room's peers as its own events last said, and lists a module stopped in the tab as stopped", async () => {
    const own: string[] = []

    const { runtime, parities } = tab({}, 5, {
      recordOwn: (_extension, event) => void own.push(event),
      surfaces: {
        sync: {
          make: () => ({}),
          describe: () => ({ room: { state: "attached", lineage: "l-1", writesFiles: true, pending: false } })
        }
      }
    })

    runtime.update([extension()])
    await settle()
    parities
      .get("@parity-app/extension-window-test")
      ?.telemetry.record("room.joined", { host: true, peers: 2, waitMs: 5 })

    expect(own).toEqual(["room.joined"])
    expect(runtime.facts().extensions[0]?.room).toMatchObject({ peers: 2 })

    runtime.stop("@parity-app/extension-window-test")
    await settle()

    expect(runtime.states()).toEqual({ "@parity-app/extension-window-test": "inactive" })
    expect(extensionsSnapshot([runtime]).tabs[0]?.extensions[0]?.halves.window).toBe("stopped")

    // It stays off in the tab, as one stopped for its failures does.
    runtime.update([extension()])
    await settle()

    expect(runtime.states()).toEqual({ "@parity-app/extension-window-test": "inactive" })
  })

  it("times each call into a module for the meter, its listeners' and commands' alike", async () => {
    const timed: string[] = []
    let clock = 0

    const listening = defineWindowModule({
      activateWindow(parity) {
        parity.subscriptions.push(
          parity.selection.onChange(() => {
            clock += 20
          })
        )

        return {}
      }
    })

    const { runtime, select } = tab({ "@parity-app/extension-window-test": listening }, 5, {
      clock: () => clock,
      meter: { called: (id, api, ms) => void timed.push(`${id} ${api} ${ms}`) }
    })

    runtime.update([extension()])
    await settle()
    select()

    expect(timed).toEqual([
      "@parity-app/extension-window-test activateWindow 0",
      "@parity-app/extension-window-test selection.onChange 20"
    ])
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

  it("tells a module its Node half's state while it activates, so activateWindow can wait for it", async () => {
    const waiting = defineWindowModule({
      activateWindow: (parity) =>
        new Promise<object>((resolve) => {
          const subscription = parity.host.onStateChange((state) => {
            if (state === "ready") {
              subscription.dispose()
              resolve({})
            }
          })
        })
    })

    const { runtime } = tab({ "@parity-app/extension-window-test": waiting })

    runtime.update([extension({ host: "waiting" })])
    await settle()
    runtime.update([extension({ host: "running" })])
    await settle()

    expect(Object.values(runtime.states())).toEqual(["active"])
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

  it("says a module it builds on is gone before that one's slow teardown, never after it's back", async () => {
    const heard: string[] = []
    const slow = Promise.withResolvers<void>()

    const watcher = defineWindowModule({
      activateWindow(parity) {
        const other = parity.extensions.get<WindowTestWindowApi>("@parity-app/extension-window-test")
        parity.subscriptions.push(
          other.onAvailable(() => heard.push("available")),
          other.onGone(() => heard.push("gone"))
        )

        return {}
      }
    })

    const dependency = defineWindowModule({
      activateWindow: () => ({ window: { greet: (name: string) => `Hello, ${name}` } }),
      deactivateWindow: () => slow.promise
    })

    const { runtime } = tab({ watcher, "@parity-app/extension-window-test": dependency })

    const watching = extension({
      id: "watcher",
      activates: ["onStartup"],
      node: false,
      extensionDependencies: ["@parity-app/extension-window-test"]
    })

    runtime.update([watching, extension()])
    await settle()
    // Off, then on again while its `deactivateWindow` is still running.
    runtime.update([watching, extension({ settings: { "wtest.on": false } })])
    runtime.update([watching, extension()])
    await settle()
    slow.resolve()
    await settle()

    expect(heard).toEqual(["available", "gone", "available"])
  })

  it("reads its settings, hears them change, keeps a project one's change as the Node half would, and refuses an app setting's", async () => {
    const heard: SettingValue[] = []

    const reading = defineWindowModule({
      activateWindow(parity) {
        parity.subscriptions.push(parity.settings.onChange("wtest.mode", (value) => heard.push(value)))

        return {}
      }
    })

    const { runtime, parities, updates } = tab({ "@parity-app/extension-window-test": reading })

    const declared = {
      "wtest.on": { type: "boolean", scope: "app", title: "On" },
      "wtest.mode": { type: "string", scope: "project", title: "Mode", enum: ["a", "b", "c"] }
    } satisfies Record<string, SettingContribution>

    runtime.update([extension({ settings: { "wtest.on": true, "wtest.mode": "a" }, declaredSettings: declared })])
    await settle()
    runtime.update([extension({ settings: { "wtest.on": true, "wtest.mode": "b" }, declaredSettings: declared })])
    const settings = parities.get("@parity-app/extension-window-test")?.settings

    expect(settings?.get("wtest.mode")).toBe("b")
    expect(heard).toEqual(["b"])
    expect(() => settings?.get("wtest.other")).toThrow("isn't a setting")
    await expect(settings?.update("wtest.on", false)).rejects.toThrow("only Settings changes it")
    await expect(settings?.update("wtest.mode", "z")).rejects.toThrow(`wtest.mode can't be set to "z"`)
    await expect(settings?.update("wtest.mode", 3)).rejects.toThrow("can't be set to 3")

    // A `.par` keeps it under the prefix, by its key without the prefix.
    await settings?.update("wtest.mode", "c")
    await settings?.update("wtest.mode", undefined)
    expect(updates).toEqual(['wtest mode = "c"', "wtest mode cleared"])
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

  it("tears down an overtaken activation that throws, without failing the one after it", async () => {
    const first = Promise.withResolvers<void>()
    let runs = 0

    const throwing = defineWindowModule({
      async activateWindow(parity) {
        runs += 1
        const run = runs
        parity.subscriptions.push(parity.commands.register("wtest.fail", () => `run ${run}`))

        if (run === 1) {
          await first.promise
          throw new Error("Gave up")
        }

        return {}
      }
    })

    const { runtime, named } = tab({ "@parity-app/extension-window-test": throwing })

    runtime.update([extension()])
    await settle()
    runtime.update([extension({ settings: { "wtest.on": false } })])
    runtime.update([extension()])
    first.resolve()
    await settle()
    await settle()

    expect(named("extension.activateFailed")).toEqual([])
    expect(Object.values(runtime.states())).toEqual(["active"])
    await expect(runtime.run("wtest.fail")).resolves.toEqual({ handled: true, result: "run 2" })
  })

  it("sends another extension's command to the service with the agent's call its own command runs on", async () => {
    const calling = defineWindowModule({
      activateWindow(parity) {
        parity.subscriptions.push(parity.commands.register("wtest.fail", () => parity.commands.execute("room.open")))

        return {}
      }
    })

    const { runtime, executed } = tab({ "@parity-app/extension-window-test": calling })

    runtime.update([extension()])
    await settle()
    await runtime.run("wtest.fail", undefined, 7)
    await runtime.run("wtest.fail")

    // The service then runs `room.open` in its own extension's turn, going on with the agent's call.
    expect(executed).toEqual([{ command: "room.open", call: 7 }, { command: "room.open" }])
  })

  it("tears down a module turned off while it activates at once, and stops what it listens to", async () => {
    let disposed = false
    let heard = 0

    const stuck = defineWindowModule({
      activateWindow(parity) {
        parity.subscriptions.push(
          parity.selection.onChange(() => {
            heard += 1
          }),
          { dispose: () => void (disposed = true) }
        )

        // Never settles, as one waiting on its Node half might.
        return new Promise<object>(() => undefined)
      }
    })

    const { runtime, select } = tab({ "@parity-app/extension-window-test": stuck })

    runtime.update([extension()])
    await settle()
    runtime.update([extension({ settings: { "wtest.on": false } })])
    await settle()
    select()

    expect(disposed).toBe(true)
    expect(heard).toBe(0)
    expect(Object.values(runtime.states())).toEqual(["inactive"])

    // Closing the tab doesn't wait on it either.
    await runtime.dispose()
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

    // The first was torn down as it was turned off, so the second starts at once, with a command of its own.
    expect(runs).toBe(2)
    await expect(runtime.run("wtest.fail")).resolves.toEqual({ handled: true, result: "run 2" })

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
  function setUp(node: ExtensionModule = windowTestNode) {
    const ends: ((ending: ChildEnd) => void)[] = []
    const events: { name: ExtensionEventName; attributes: Record<string, JsonValue | undefined> }[] = []
    /** The tab's window modules, once they're made below, which the service's stand-in window reaches. */
    const link = new Map<"runtime", WindowModules>()
    let latest: ExtensionStatus[] = []
    const lines: LogLine[] = []

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
          load: () => Promise.resolve(Object.assign(Object.create(null), { default: node })),
          exit: () => end({ code: 0 }),
          // Carries an agent's call through the extension's code, as the host script does with Node's own.
          calls: { run: (call, task) => calls.run(call, task), current: () => calls.getStore() }
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
        logged: (_projectId, _extension, line) => void lines.push(line),
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

    return { hosts, runtime, parities, ends, events, ready, lines, latest: () => latest }
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

  it("tells a Node half its window module's state while it activates, so activate can wait for it", async () => {
    const waiting = defineExtension({
      activate(parity) {
        if (!isInternal(parity)) {
          throw new Error("No window module")
        }

        const { window } = parity

        return new Promise<{ ping(): string }>((resolve) => {
          const subscription = window.onStateChange((state) => {
            if (state === "ready") {
              subscription.dispose()
              resolve({ ping: () => "pong" })
            }
          })
        })
      }
    })

    const { parities, ready } = setUp(waiting)

    await ready()
    await expect(parities.get(id)?.host.api<{ ping(): string }>().ping()).resolves.toBe("pong")
  })

  it("records a Node half's call refused while its window module isn't ready, from the Node half", async () => {
    const refused: string[] = []

    const early = defineExtension({
      async activate(parity) {
        if (!isInternal(parity)) {
          throw new Error("No window module")
        }

        // Before its window module is ready, each call is refused at once.
        for (let call = 0; call < 12; call++) {
          await parity.window
            .api<{ status(): string }>()
            .status()
            .catch((error: Error) => void refused.push(error instanceof HalfUnavailableError ? error.state : "other"))
        }

        return {}
      }
    })

    const { events, ready } = setUp(early)

    await ready()

    expect(refused).toHaveLength(12)
    // The first in a minute, then one in ten.
    expect(
      events.filter((event) => event.name === "extension.halfUnavailable").map((event) => event.attributes)
    ).toEqual([
      { extension: id, from: "node", method: "status", state: refused[0] },
      { extension: id, from: "node", method: "status", state: refused[10] }
    ])
  })

  it("marks its Node half's log lines as the Node half's, since its window module writes to the same log", async () => {
    const logging = defineExtension({
      activate(parity) {
        parity.log.info("Hello from Node")

        return { ping: () => "pong" }
      }
    })

    const { ready, lines } = setUp(logging)

    await ready()
    expect(lines).toContainEqual(expect.objectContaining({ level: "info", text: "Hello from Node", half: "node" }))
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

  it("keeps an agent's window command the agent's in what the window module asks of its Node half", async () => {
    const { hosts, ready } = setUp()

    await ready()

    // The window module's command asks its Node half to ask the person, which nobody can answer during an agent's call.
    await expect(hosts.runForAgent("shop", { name: "wtest.confirm" }, "Claude")).rejects.toThrow(
      "There's nobody to ask: Claude is running Window test"
    )
  })

  it("keeps an agent's Node command the agent's when its window module asks back of the Node half", async () => {
    const { hosts, ready } = setUp()

    await ready()

    await expect(hosts.runForAgent("shop", { name: "wtest.askBack" }, "Claude")).rejects.toThrow(
      "There's nobody to ask: Claude is running Window test"
    )
  })

  it("runs a command from inside an agent's window command without waiting behind it", async () => {
    const { hosts, ready } = setUp()

    await ready()

    // The window module's command asks its Node half, which runs the Node half's own command, for the same agent.
    const nested = hosts.runForAgent("shop", { name: "wtest.nested" }, "Claude")
    const late = new Promise((resolve) => setTimeout(() => resolve("stuck"), 2000))

    await expect(Promise.race([nested, late])).resolves.toBe("from the Node half")
  })

  it("keeps each of two agents' overlapping window commands its own agent's", async () => {
    const { hosts, ready } = setUp()

    await ready()

    const [first, second] = await Promise.allSettled([
      hosts.runForAgent("shop", { name: "wtest.confirm" }, "Claude"),
      hosts.runForAgent("shop", { name: "wtest.confirm" }, "Codex")
    ])

    expect(first).toMatchObject({
      status: "rejected",
      reason: { message: expect.stringContaining("Claude is running") }
    })
    expect(second).toMatchObject({
      status: "rejected",
      reason: { message: expect.stringContaining("Codex is running") }
    })
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

describe("PARITY_EXTENSIONS_DEBUG in a tab", () => {
  const id = "@parity-app/extension-window-test"

  /** A clock that moves 2 ms each time it's read, so every traced call's time is known. */
  const ticking = () => {
    let time = 0

    return () => (time += 2)
  }

  it("traces nothing unless the extension is debugged", async () => {
    const { runtime, logs, select } = tab({}, undefined, { debug: () => false, clock: ticking() })

    runtime.update([extension()])
    await settle()
    select()
    await runtime.run("wtest.confirm")

    expect(logs.filter((line) => line.startsWith("debug:"))).toEqual([])
  })

  it("logs each call core makes into the module, and each it makes back, with how long it took", async () => {
    const traced: TracedCall[] = []

    const { runtime, logs, select } = tab({}, undefined, {
      debug: (debugged) => debugged.prefix === "wtest",
      clock: ticking(),
      traced: (extensionId, call) => {
        expect(extensionId).toBe(id)

        traced.push(call)
      }
    })

    runtime.update([extension()])
    await settle()
    select()
    await runtime.run("wtest.confirm")
    await expect(runtime.run("wtest.fail")).rejects.toThrow("Failing on purpose")
    await runtime.callFromNode(id, "status", [])
    runtime.update([extension({ settings: { "wtest.on": false } })])
    await settle()

    expect(logs.filter((line) => line.startsWith("debug:"))).toEqual([
      "debug: in activateWindow 2.0 ms",
      "debug: in selection.onChange 2.0 ms",
      // The command waits on its Node half, so the call back ends first and the command's time holds it.
      "debug: out host.confirm 2.0 ms",
      "debug: in command:wtest.confirm 6.0 ms",
      "debug: in command:wtest.fail 2.0 ms, failed",
      "debug: in node.status 2.0 ms",
      "debug: in deactivateWindow 2.0 ms"
    ])
    expect(traced).toContainEqual({ direction: "in", api: "command:wtest.fail", durationMs: 2, outcome: "error" })
    expect(traced).toHaveLength(7)
  })

  it("traces the module's calls to the editor and its settings", async () => {
    const { runtime, logs, parities } = tab({}, undefined, {
      debug: () => true,
      clock: ticking()
    })

    runtime.update([
      extension({
        settings: { "wtest.on": true, "wtest.size": 1 },
        declaredSettings: {
          "wtest.on": { type: "boolean", scope: "app", title: "On" },
          "wtest.size": { type: "number", scope: "project", title: "Size" }
        }
      })
    ])
    await settle()

    const parity = parities.get(id)
    await parity?.selection.set([])
    await parity?.navigate.openSettings()
    await parity?.settings.update("wtest.size", 2)
    await parity?.commands.execute("parity.save")

    expect(logs.filter((line) => line.startsWith("debug: out"))).toEqual([
      "debug: out selection.set 2.0 ms",
      "debug: out navigate.openSettings 2.0 ms",
      "debug: out settings.update:wtest.size 2.0 ms",
      "debug: out commands.execute:parity.save 2.0 ms"
    ])
  })
})
