import type { Disposable, JsonValue } from "@parity-app/extension"
import {
  type BoxResult,
  type CameraView,
  CapabilityMissingError,
  defineWindowModule,
  type FollowEnd,
  type Palette,
  type WindowModule,
  type WindowParity
} from "@parity-app/extension/internal"
import { readExtension } from "@parity-app/extension/manifest"
import { describe, expect, it } from "vite-plus/test"
import { z } from "zod"
import type { ExtensionEventName } from "./events.ts"
import {
  type SurfaceTestApi,
  surfaceTestId,
  surfaceTestModule,
  surfaceTestPackage
} from "./fixtures/window-surface-test.ts"
import {
  type CanvasTarget,
  type CoreCanvas,
  type CoreColors,
  type CorePreviewItem,
  type CorePreviewOptions,
  type LayerRequest,
  targetOf,
  windowCanvas
} from "./window-canvas.ts"
import { type WindowExtension, windowModules } from "./window-modules.ts"

const asRecord = z.record(z.string(), z.json().optional())

/** A call that does nothing and resolves at once, for what these tests don't drive. */
const done = () => Promise.resolve()

/** Lets promises already resolved run their callbacks. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

/** A list of colors as `createColors` hands them out: the lowest free number, kept while any owner claims it. */
function colors(name: string): CoreColors & { owners(key: string): string[] } {
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

/** A tab's canvas services, recording what's asked of them. */
function services() {
  const log: string[] = []
  const layers: LayerRequest[] = []
  const cameraListeners = new Set<(view: CameraView) => void>()
  const boxListeners = new Set<(box: BoxResult) => void>()
  const canvasListeners = new Set<() => void>()
  const followEnds = new Set<(why: FollowEnd) => void>()
  const previews: { items: CorePreviewItem[]; options: CorePreviewOptions; how: string[] }[] = []
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
      const shown = { items, options, how }
      previews.push(shown)

      return {
        update: (next) => void (shown.items = next),
        settleOnWrite: () => void shown.how.push("settle"),
        cancel: () => void shown.how.push("cancel"),
        [Symbol.dispose]: () => void shown.how.push("dispose")
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

/** The surface test extension as the service sends it, with what a test changes. */
function extension(change: Partial<WindowExtension> = {}): WindowExtension {
  return {
    id: surfaceTestId,
    version: "0.0.0",
    displayName: "Surface test",
    prefix: "stest",
    internal: true,
    window: true,
    node: false,
    activates: ["onStartup"],
    capabilities: ["canvas", "camera", "hold"],
    extensionDependencies: [],
    commands: [],
    settings: {},
    settingScopes: {},
    host: "crashed",
    ...change
  }
}

/** A tab running `module` (the surface test's unless given) over stand-in canvas services. */
async function tab(module: WindowModule = surfaceTestModule, change: Partial<WindowExtension> = {}) {
  const canvas = services()
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
    surfaces: canvas.port
  })

  const ext = extension(change)
  runtime.update([ext])
  await settle()

  const named = (name: ExtensionEventName) => events.flatMap((event) => (event.name === name ? [event.attributes] : []))

  return {
    ...canvas,
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
function driven() {
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

describe("the surface test extension", () => {
  it("is a built-in internal extension with only a window module, declaring what it draws with", () => {
    const read = readExtension(surfaceTestPackage, { builtIn: true })

    expect(read.manifest.capabilities).toEqual(["canvas", "camera", "hold"])
    expect(read.main).toBeUndefined()
  })
})

describe("parity.canvas.layer", () => {
  it("draws each layer in its order and space, and takes them away when the module stops in the tab", async () => {
    const { layers, stop } = await tab()

    expect(layers.map(({ id, extension: owner, options, children }) => ({ id, owner, options, children }))).toEqual([
      {
        id: "stest.shading",
        owner: surfaceTestId,
        options: { id: "stest.shading", space: "page", order: "underDesigns" },
        children: { draws: "shading" }
      },
      {
        id: "stest.people",
        owner: surfaceTestId,
        options: { id: "stest.people", space: "screen", order: "edge", placement: "topRight" },
        children: { draws: "people" }
      }
    ])

    await stop()

    expect(layers).toEqual([])
  })

  it("refuses a second layer with an id already drawn in the tab, and frees the id once it's taken away", async () => {
    const { parity, layers } = await tab()
    const drawn = parity().canvas.layer({ id: "stest.extra", space: "page", order: "overSelection" }, "extra")

    expect(() => parity().canvas.layer({ id: "stest.extra", space: "page", order: "overDesigns" }, "again")).toThrow(
      "A layer called stest.extra is drawn in this tab already"
    )

    drawn.dispose()
    parity().canvas.layer({ id: "stest.extra", space: "page", order: "overDesigns" }, "again")

    expect(layers.map((layer) => layer.options.order)).toEqual(["underDesigns", "edge", "overDesigns"])
  })

  it("counts a layer's render that throws as the extension's failure, naming the layer", async () => {
    const { layers, named } = await tab()

    layers[0]?.failed(new Error("Couldn't draw"))

    expect(named("extension.callFailed")).toMatchObject([
      { extension: surfaceTestId, api: "layer:stest.shading", failures: 1, message: "Couldn't draw" }
    ])
  })

  it("gives the layer's hooks the camera with its zoom, boxes by ref, and colors without claiming them", async () => {
    const { layers, moveCamera, people } = await tab()
    const reads = layers[0]!.reads
    const heard: number[] = []
    reads.onView(() => heard.push(reads.view().view.width))
    moveCamera({ x: 0, y: 0, width: 500, height: 400 })

    expect(reads.view()).toEqual({ zoom: 2, view: { x: 0, y: 0, width: 500, height: 400 } })
    expect(heard).toEqual([500])
    expect(reads.box({ owner: "design", type: "design", key: "card" })).toMatchObject({ kind: "drawn" })
    expect(reads.color("peer-2", "people").n).toBe(1)
    expect(people.owners("peer-2")).toEqual([])
  })
})

describe("parity.canvas boxes and points", () => {
  it("measures designs and layers by NodeRef, and converts points", async () => {
    const { parity } = await tab()
    const { canvas } = parity()

    expect(canvas.box({ owner: "design", type: "design", key: "card" })).toMatchObject({ kind: "drawn" })
    expect(canvas.box({ owner: "design", type: "frame", key: "list/row-1" })).toEqual({ kind: "missing" })
    expect(canvas.hit({ x: 1, y: 1 })).toEqual({ design: "card" })
    expect(canvas.pageToScreen({ x: 3, y: 4 })).toEqual({ x: 6, y: 8 })
    expect(canvas.screenToPage({ x: 6, y: 8 })).toEqual({ x: 3, y: 4 })
  })

  it("maps a layer's ref to its design and node, and refuses what isn't on the canvas", () => {
    expect(targetOf({ owner: "design", type: "design", key: "card" })).toEqual({ design: "card" })
    expect(targetOf({ owner: "design", type: "text", key: "card/title" })).toEqual({ design: "card", node: "title" })
    expect(() => targetOf({ owner: "@parity-app/extension-tanstack-router", type: "route", key: "/" })).toThrow(
      "isn't on the canvas"
    )
  })

  it("counts a box listener that throws as the extension's failure", async () => {
    const { parity, changeBox, named } = await tab()
    parity().canvas.onBoxChange({ owner: "design", type: "design", key: "card" }, () => {
      throw new Error("Bad box")
    })
    changeBox({ kind: "missing" })

    expect(named("extension.callFailed")).toMatchObject([{ api: "canvas.onBoxChange", message: "Bad box" }])
  })
})

describe("parity.camera", () => {
  it("follows as the extension, telling it when following ends", async () => {
    const test = driven()
    const { log } = await tab(test.module)
    const ends: FollowEnd[] = []
    const following = test.api.follow()
    following.onEnd((why) => ends.push(why))
    following.update({ x: 10, y: 10, width: 900, height: 700 })
    following.dispose()

    expect(log).toEqual([`follow 800 by ${surfaceTestId}`, "follow to 900", "follow ended"])
    expect(ends).toEqual(["disposed"])
  })

  it("ends its following when it stops in the tab, without calling into it as it goes", async () => {
    const test = driven()
    const { log, stop } = await tab(test.module)
    const ends: FollowEnd[] = []
    test.api.follow().onEnd((why) => ends.push(why))
    await stop()

    expect(log).toEqual([`follow 800 by ${surfaceTestId}`, "follow ended"])
    expect(ends).toEqual([])
  })

  it("keeps listening across the canvas mounting again, and reads an empty view while it's gone", async () => {
    const { parity, remount, moveCamera, canvas } = await tab()
    const camera = parity().camera
    const heard: number[] = []
    camera.onChange((view) => heard.push(view.width))

    remount()

    expect(camera.get()).toEqual({ x: 0, y: 0, width: 0, height: 0 })
    expect(() => camera.follow({ x: 0, y: 0, width: 1, height: 1 })).toThrow("hasn't mounted yet")
    await expect(camera.show({ x: 0, y: 0, width: 1, height: 1 })).rejects.toThrow("hasn't mounted yet")

    remount(canvas)
    moveCamera({ x: 0, y: 0, width: 640, height: 480 })

    expect(heard).toEqual([1000, 640])
  })

  it("is the same camera as parity.canvas.camera", async () => {
    const { parity, log } = await tab()
    await parity().canvas.camera.show({ x: 0, y: 0, width: 300, height: 200 })

    expect(log).toEqual(["show 300"])
  })
})

describe("capabilities", () => {
  it("refuses what the manifest doesn't name, recording each once, while colors need none", async () => {
    const { parity, named } = await tab(surfaceTestModule, { capabilities: ["canvas"] })

    // It activated: drawing layers and claiming colors needs only `canvas`.
    expect(() => parity().camera).toThrow(CapabilityMissingError)
    expect(() => parity().canvas.camera).toThrow('needs the "camera" capability')
    expect(() => parity().canvas.camera).toThrow(CapabilityMissingError)
    expect(() => parity().canvas.hold("card", { x: 0, y: 0 })).toThrow('needs the "hold" capability')
    expect(parity().colors.claim("peer-9").n).toBe(1)
    expect(named("extension.capabilityMissing")).toEqual([
      { extension: surfaceTestId, capability: "camera", api: "parity.camera" },
      { extension: surfaceTestId, capability: "camera", api: "parity.canvas.camera" },
      { extension: surfaceTestId, capability: "hold", api: "parity.canvas.hold" }
    ])
  })

  it("refuses the canvas itself without the canvas capability", async () => {
    const { parity, logs } = await tab(defineWindowModule({ activateWindow: () => ({}) }), { capabilities: [] })

    expect(() => parity().canvas).toThrow('needs the "canvas" capability')
    expect(logs).toEqual([])
  })
})

describe("parity.colors", () => {
  it("counts claims per extension, gives each back once released as often, and all of them when it stops", async () => {
    const test = driven()
    const { parity, people, agents, stop } = await tab(test.module)
    const { colors } = parity()

    expect(test.api.claimed.n).toBe(0)
    colors.claim("peer-1")
    colors.release("peer-1")

    expect(people.owners("peer-1")).toEqual([`${surfaceTestId}\ntab-1`])

    colors.release("peer-1")

    expect(people.owners("peer-1")).toEqual([])

    colors.claim("peer-2")
    colors.agents.claim("peer-2:claude#1")
    await stop()

    expect(people.owners("peer-2")).toEqual([])
    expect(agents.owners("peer-2:claude#1")).toEqual([])
  })

  it("lets the room assign numbers, and gives palettes and the hand-tuned count of each list", async () => {
    const { parity } = await tab()
    const { colors } = parity()
    colors.assign("peer-7", 5)

    expect(colors.claim("peer-7").n).toBe(5)
    expect(colors.palette(3).name).toBe("Person 3")
    expect(colors.agents.palette(3).name).toBe("Agent 3")
    expect(colors.tuned).toBe(12)
  })
})

describe("parity.canvas.preview", () => {
  it("shows a drag by NodeRef in the person's claimed color, giving the color back as it settles", async () => {
    const test = driven()
    const { previews, people } = await tab(test.module)
    const shown = test.api.previewBoard("card", "peer-3")

    expect(previews[0]?.items).toEqual([{ target: { design: "card" }, at: { x: 40, y: 40 } }])
    expect(previews[0]?.options).toMatchObject({ color: { n: 1 }, extension: surfaceTestId })
    expect(people.owners("peer-3")).toEqual([`${surfaceTestId}\ntab-1`])

    shown.update([{ ref: { owner: "design", type: "text", key: "card/title" }, at: { x: 5, y: 5 } }])
    shown.settleOnWrite()
    shown.dispose()

    expect(previews[0]?.items).toEqual([{ target: { design: "card", node: "title" }, at: { x: 5, y: 5 } }])
    expect(previews[0]?.how).toEqual(["settle"])
    expect(people.owners("peer-3")).toEqual([])
  })

  it("maps where layers would land, and disposes of previews still open when the module stops", async () => {
    const { parity, previews, stop } = await tab()
    parity().canvas.preview([], {
      color: "peer-4",
      label: "Mia",
      drop: { parent: { owner: "design", type: "design", key: "card" }, index: 2, mode: "dark" }
    })
    await stop()

    expect(previews[0]?.options).toMatchObject({
      label: "Mia",
      drop: { parent: { design: "card" }, index: 2, mode: "dark" }
    })
    expect(previews[0]?.how).toEqual(["dispose"])
  })
})

describe("parity.canvas.hold", () => {
  it("holds a board as the extension, and lets go when it's released or the module stops", async () => {
    const test = driven()
    const { log, stop } = await tab(test.module)

    test.api.hold("card").dispose()
    test.api.hold("list")
    await stop()

    expect(log).toEqual([
      `hold card at 10 by ${surfaceTestId}`,
      "let go of card",
      `hold list at 10 by ${surfaceTestId}`,
      "let go of list"
    ])
  })
})
