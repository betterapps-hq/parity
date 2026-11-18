import type { Disposable, JsonValue } from "@parity-app/extension"
import {
  type BoxResult,
  type CameraView,
  defineWindowModule,
  type FollowEnd,
  type AgentStep,
  type Gesture,
  type Palette,
  type Self,
  type WindowModule,
  type Viewing,
  type WindowParity
} from "@parity-app/extension/internal"
import { z } from "zod"
import type { ExtensionEventName } from "../events.ts"
import { windowAgents } from "../window-agents.ts"
import {
  type CanvasTarget,
  type CoreCanvas,
  type CoreColors,
  type CorePreviewItem,
  type CorePreviewOptions,
  type LayerRequest,
  windowCanvas
} from "../window-canvas.ts"
import { type SurfaceName, type WindowExtension, type WindowSurface, windowModules } from "../window-modules.ts"
import { type Pointer, windowPresence } from "../window-presence.ts"
import { type SurfaceTestApi, surfaceTestId, surfaceTestModule } from "./window-surface-test.ts"

/*
 * A project tab for window modules' tests, never shipped in the app: the surface test extension running over stand-in
 * canvas services, colors and an editor, recording what's asked of them and what's recorded.
 */

const asRecord = z.record(z.string(), z.json().optional())

/** A call that does nothing and resolves at once, for what these tests don't drive. */
export const done = () => Promise.resolve()

/** Lets promises already resolved run their callbacks. */
export const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

/** A list of colors as `createColors` hands them out: the lowest free number, kept while any owner claims it. */
export function colors(name: string): CoreColors & { owners(key: string): string[] } {
  const held = new Map<string, { n: number; owners: Set<string> }>()
  const assigned = new Map<string, number>()

  const palette = (n: number): Palette => ({
    n,
    name: `${name} ${n}`,
    stops: ["#000", "#111", "#222"],
    color: "#111",
    ink: "#fff"
  })

  const free = () => {
    const taken = new Set([...assigned.values(), ...[...held.values()].map((each) => each.n)])
    let n = 0

    while (taken.has(n)) {
      n += 1
    }

    return n
  }

  return {
    tuned: 12,
    palette,
    claim(key, owner = "core") {
      const entry = held.get(key) ?? { n: assigned.get(key) ?? free(), owners: new Set() }
      entry.owners.add(owner)
      held.set(key, entry)

      return palette(entry.n)
    },
    release(key, owner = "core") {
      const entry = held.get(key)
      entry?.owners.delete(owner)

      if (entry?.owners.size === 0) {
        held.delete(key)
      }
    },
    releaseAll(owner) {
      for (const entry of held.values()) {
        entry.owners.delete(owner)
      }

      for (const [key, entry] of held) {
        if (entry.owners.size === 0) {
          held.delete(key)
        }
      }
    },
    assign: (key, n) => void assigned.set(key, n),
    owners: (key) => [...(held.get(key)?.owners ?? [])]
  }
}

/** A core preview the stand-in made: what it shows, how it ended, and its write landing. */
interface Shown {
  items: CorePreviewItem[]
  options: CorePreviewOptions
  how: string[]
  /** Its covering write lands, ending a preview that's settling. */
  land(): void
}

/** A tab's canvas services, recording what's asked of them. */
export function services() {
  const log: string[] = []
  const layers: LayerRequest[] = []
  const cameraListeners = new Set<(view: CameraView) => void>()
  const boxListeners = new Set<(box: BoxResult) => void>()
  const canvasListeners = new Set<() => void>()
  const followEnds = new Set<(why: FollowEnd) => void>()
  const previews: Shown[] = []

  let view: CameraView = { x: 0, y: 0, width: 1000, height: 800 }

  const listening = <T>(set: Set<T>, listener: T): Disposable => {
    set.add(listener)

    return { dispose: () => void set.delete(listener) }
  }

  const canvas: CoreCanvas = {
    zoom: () => 2,
    camera: {
      get: () => view,
      onChange: (listener) => listening(cameraListeners, listener),
      show: (shown) => {
        log.push(`show ${shown.width}`)

        return Promise.resolve()
      },
      follow(followed, options) {
        log.push(`follow ${followed.width} by ${options?.owner}`)
        let active = true

        return {
          get active() {
            return active
          },
          update: (next) => void log.push(`follow to ${next.width}`),
          onEnd: (listener) => listening(followEnds, listener),
          dispose() {
            if (active) {
              active = false
              log.push("follow ended")
              followEnds.forEach((listener) => listener("disposed"))
            }
          }
        }
      }
    },
    measure: {
      box: (target: CanvasTarget) =>
        target.design === "card"
          ? { kind: "drawn", box: { x: 1, y: 2, width: 3, height: 4 }, radius: 0, size: { width: 3, height: 4 } }
          : { kind: "missing" },
      onBoxChange: (_target, listener) => listening(boxListeners, listener),
      hit: () => ({ design: "card" }),
      pageToScreen: (at) => ({ x: at.x * 2, y: at.y * 2 }),
      screenToPage: (at) => ({ x: at.x / 2, y: at.y / 2 })
    }
  }

  let mounted: CoreCanvas | undefined = canvas
  const people = colors("Person")
  const agents = colors("Agent")

  const port = windowCanvas({
    canvas: () => mounted,
    onCanvas(listener) {
      canvasListeners.add(listener)

      return () => canvasListeners.delete(listener)
    },
    addLayer(layer) {
      layers.push(layer)

      return () => layers.splice(layers.indexOf(layer), 1)
    },
    preview(items, options) {
      const how: string[] = []
      const ends = new Set<() => void>()
      let settling = false
      let ended = false

      const end = (why: string) => {
        if (ended) {
          return
        }

        ended = true
        how.push(why)
        ends.forEach((listener) => listener())
      }

      const shown = {
        items,
        options,
        how,
        land: () => {
          if (settling) {
            end("landed")
          }
        }
      }

      previews.push(shown)

      return {
        update: (next) => void (shown.items = next),
        settleOnWrite: () => {
          if (!ended && !settling) {
            settling = true
            how.push("settle")
          }
        },
        cancel: () => end("cancel"),
        onEnd: (listener) => listening(ends, listener),
        [Symbol.dispose]: () => end("dispose")
      }
    },
    hold(design, at, extension) {
      log.push(`hold ${design} at ${at.x} by ${extension}`)

      return {
        update: () => undefined,
        release: () => void log.push(`let go of ${design}`),
        [Symbol.dispose]: () => void log.push(`let go of ${design}`)
      }
    },
    colors: { people, agents }
  })

  return {
    port,
    log,
    layers,
    previews,
    people,
    agents,
    moveCamera: (next: CameraView) => {
      view = next
      cameraListeners.forEach((listener) => listener(next))
    },
    changeBox: (box: BoxResult) => {
      boxListeners.forEach((listener) => listener(box))
    },
    /** The canvas goes, as its tab reopens the project, and comes back if `back` is given. */
    remount: (back?: CoreCanvas) => {
      cameraListeners.clear()
      boxListeners.clear()
      mounted = undefined
      canvasListeners.forEach((listener) => listener())

      if (back) {
        mounted = back
        canvasListeners.forEach((listener) => listener())
      }
    },
    canvas
  }
}

/** This person on the canvas, as the window would tell of them: raise each event by hand, and run frames by hand. */
export function personStandIn() {
  const pointers = new Set<(pointer: Pointer) => void>()
  const gestures = new Set<(gesture: Gesture) => void>()
  const viewings = new Set<(viewing: Viewing) => void>()
  const selves = new Set<() => void>()
  let self: Self = { name: "Mia" }
  const frames = new Set<() => void>()
  const flushed: string[] = []

  const listening =
    <T>(set: Set<T>) =>
    (listener: T) => {
      set.add(listener)

      return () => void set.delete(listener)
    }

  const surface = windowPresence({
    self: () => ({ ...self }),
    onSelfChange: listening(selves),
    onPointer: listening(pointers),
    onGesture: listening(gestures),
    onViewing: listening(viewings),
    frame: (callback) => {
      frames.add(callback)

      return () => void frames.delete(callback)
    },
    flushChanges: () => void flushed.push("flushed")
  })

  return {
    surface,
    flushed,
    /** Whether anything listens to the window's pointer now. */
    listening: () => pointers.size > 0,
    point: (pointer: Pointer) => pointers.forEach((listener) => listener(pointer)),
    gesture: (gesture: Gesture) => gestures.forEach((listener) => listener(gesture)),
    view: (viewing: Viewing) => viewings.forEach((listener) => listener(viewing)),
    /** Signs in, out or switches accounts: who's signed in becomes `next`, and the window says it may have changed. */
    signIn: (next: Self) => {
      self = next
      selves.forEach((listener) => listener())
    },
    frame: () => {
      const now = [...frames]
      frames.clear()
      now.forEach((callback) => callback())
    }
  }
}

/** This copy's agents, as the window would tell of them, and other copies' steps the development room passes on. */
export function agentsStandIn() {
  const listeners = new Set<(steps: AgentStep[]) => void>()
  const passed = new Set<(steps: AgentStep[], from: string) => void>()
  const recorded: { name: string; attributes: unknown }[] = []
  const timers = new Map<number, () => void>()
  let next = 0
  let time = 0

  const surface = windowAgents({
    onSteps(listener) {
      listeners.add(listener)

      return () => void listeners.delete(listener)
    },
    onPassedOn(listener) {
      passed.add(listener)

      return () => void passed.delete(listener)
    },
    exists: (ref) => !ref.key.startsWith("gone"),
    record: (name, attributes) => void recorded.push({ name, attributes }),
    timers: {
      set(callback) {
        next += 1
        timers.set(next, callback)

        return next
      },
      clear: (handle) => void timers.delete(handle)
    },
    now: () => time
  })

  return {
    surface,
    recorded,
    step: (steps: AgentStep[]) => listeners.forEach((listener) => listener(steps)),
    /** Steps another copy sent, reaching the window without an extension passing them in. */
    passOn: (steps: AgentStep[], from: string) => passed.forEach((listener) => listener(steps, from)),
    /** A minute passes, and its timers go off. */
    minute: () => {
      time += 60_000
      const due = [...timers.values()]
      timers.clear()
      due.forEach((callback) => callback())
    }
  }
}

/** The surface test extension as the service sends it, with what a test changes. */
export function surfaceExtension(change: Partial<WindowExtension> = {}): WindowExtension {
  return {
    id: surfaceTestId,
    version: "0.0.0",
    displayName: "Surface test",
    prefix: "stest",
    internal: true,
    window: true,
    node: false,
    activates: ["onStartup"],
    capabilities: ["canvas", "camera", "hold", "presence", "agents"],
    extensionDependencies: [],
    commands: [],
    settings: {},
    declaredSettings: {},
    host: "crashed",
    ...change
  }
}

/** A tab running `module` (the surface test's unless given) over stand-in canvas services, and any `more` surfaces. */
export async function tab(
  module: WindowModule = surfaceTestModule,
  change: Partial<WindowExtension> = {},
  more: Partial<Record<SurfaceName, WindowSurface>> = {}
) {
  const canvas = services()
  const people = personStandIn()
  const agents = agentsStandIn()
  const events: { name: ExtensionEventName; attributes: Record<string, JsonValue | undefined> }[] = []
  const logs: string[] = []
  let parity: WindowParity | undefined

  const runtime = windowModules({
    tab: "tab-1",
    project: { root: "/shop", name: "Shop" },
    load: () =>
      Promise.resolve({
        activateWindow: (given: WindowParity) => {
          parity = given

          return module.activateWindow(given)
        }
      }),
    editor: {
      selection: { get: () => [], set: done, highlight: done, onChange: () => () => undefined },
      navigate: {
        reveal: done,
        zoomTo: done,
        openDesign: done,
        setMode: done,
        setState: done,
        showTab: done,
        openSettings: done,
        pageUrl: async () => undefined
      },
      execute: done
    },
    halves: { start: () => undefined, call: async () => undefined, state: () => undefined },
    updateSetting: done,
    log: (_id, level, text) => void logs.push(`${level}: ${text}`),
    record: (name, attributes) => void events.push({ name, attributes: asRecord.parse(attributes) }),
    surfaces: { ...canvas.port, presence: people.surface, agents: agents.surface, ...more }
  })

  const ext = surfaceExtension(change)
  runtime.update([ext])
  await settle()

  const named = (name: ExtensionEventName) => events.flatMap((event) => (event.name === name ? [event.attributes] : []))

  return {
    ...canvas,
    person: people,
    agentSteps: agents,
    runtime,
    logs,
    named,
    parity: () => {
      if (!parity) {
        throw new Error("It never activated")
      }

      return parity
    },
    /** Turns the extension off in this tab. */
    stop: async () => {
      runtime.update([])
      await settle()
    }
  }
}

/** The surface test, keeping what it returned for the test to drive. */
export function driven() {
  let offered: SurfaceTestApi | undefined

  const module = defineWindowModule<SurfaceTestApi>({
    async activateWindow(parity) {
      const activated = await surfaceTestModule.activateWindow(parity)
      offered = activated.window

      return activated
    }
  })

  return {
    module,
    get api() {
      if (!offered) {
        throw new Error("It never activated")
      }

      return offered
    }
  }
}
