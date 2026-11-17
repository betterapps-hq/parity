import { CapabilityMissingError, defineWindowModule, type FollowEnd } from "@parity-app/extension/internal"
import { readExtension } from "@parity-app/extension/manifest"
import { describe, expect, it } from "vite-plus/test"
import { surfaceTestId, surfaceTestModule, surfaceTestPackage } from "./fixtures/window-surface-test.ts"
import { driven, settle, surfaceExtension, tab } from "./fixtures/window-tab.ts"
import { targetOf } from "./window-canvas.ts"

describe("the surface test extension", () => {
  it("is a built-in internal extension with only a window module, declaring what it draws with", () => {
    const read = readExtension(surfaceTestPackage, { builtIn: true })

    expect(read.manifest.capabilities).toEqual(["canvas", "camera", "hold", "presence", "agents"])
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

  it("closes at once a layer, preview or claim made after the module stopped, as a late activation can", async () => {
    let resume: (() => void) | undefined
    let drew = false
    const resumed = new Promise<void>((resolve) => (resume = resolve))

    const late = defineWindowModule({
      async activateWindow(parity) {
        const { canvas, colors } = parity
        await resumed
        canvas.layer({ id: "late.layer", space: "page", order: "overDesigns" }, "late")
        canvas.preview([{ ref: { owner: "design", type: "design", key: "card" }, at: { x: 1, y: 1 } }], {
          color: "peer-9"
        })
        colors.claim("peer-8")
        drew = true

        return {}
      }
    })

    const { layers, previews, people, stop } = await tab(late)
    await stop()
    resume?.()
    await settle()

    expect(drew).toBe(true)
    expect(layers.map((layer) => layer.id)).not.toContain("late.layer")
    expect(previews.map((each) => each.how)).toEqual([["dispose"]])
    expect(people.owners("peer-9")).toEqual([])
    expect(people.owners("peer-8")).toEqual([])
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

  it("keeps a slash in a design's key when it's told which keys are designs'", () => {
    const isDesign = (key: string) => key === "main/sign-in"

    expect(targetOf({ owner: "design", type: "text", key: "main/sign-in/title" }, isDesign)).toEqual({
      design: "main/sign-in",
      node: "title"
    })
    expect(targetOf({ owner: "design", type: "text", key: "card/title" }, isDesign)).toEqual({
      design: "card",
      node: "title"
    })
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
    const { parity, named } = await tab(surfaceTestModule, { capabilities: ["canvas", "presence", "agents"] })

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

  it("leaves a run started since holding its claims when an old run claims late", async () => {
    const { parity, people, runtime, stop } = await tab()
    const old = parity().colors
    await stop()
    runtime.update([surfaceExtension()])
    await settle()
    parity().colors.claim("peer-3")
    old.claim("peer-3")

    expect(people.owners("peer-3")).toEqual([
      `${surfaceTestId}
tab-1`
    ])
  })

  it("leaves a run started since holding its claims when an old run first reads colors late", async () => {
    let resume: (() => void) | undefined
    let runs = 0
    const resumed = new Promise<void>((resolve) => (resume = resolve))

    const late = defineWindowModule({
      async activateWindow(parity) {
        runs += 1

        if (runs === 1) {
          await resumed
          void parity.colors.tuned
        } else {
          parity.colors.claim("peer-4")
        }

        return {}
      }
    })

    const { people, runtime, stop } = await tab(late)
    await stop()
    runtime.update([surfaceExtension()])
    await settle()
    resume?.()
    await settle()

    expect(people.owners("peer-4")).toEqual([
      `${surfaceTestId}
tab-1`
    ])
  })

  it("lets the room assign numbers, and gives palettes and the hand-tuned count of each list", async () => {
    const { parity, layers } = await tab()
    const { colors } = parity()
    let told = 0
    layers[0]!.reads.onColors(() => (told += 1))
    colors.assign("peer-7", 5)

    expect(told).toBe(1)

    expect(colors.claim("peer-7").n).toBe(5)
    expect(colors.palette(3).name).toBe("Person 3")
    expect(colors.agents.palette(3).name).toBe("Agent 3")
    expect(colors.tuned).toBe(12)
  })
})

describe("parity.canvas.preview", () => {
  it("shows a drag by NodeRef in the person's claimed color, giving the color back once it has settled", async () => {
    const test = driven()
    const { previews, people } = await tab(test.module)
    const shown = test.api.previewBoard("card", "peer-3")

    expect(previews[0]?.items).toEqual([{ target: { design: "card" }, at: { x: 40, y: 40 } }])
    expect(previews[0]?.options).toMatchObject({ color: { n: 1 }, extension: surfaceTestId })
    expect(people.owners("peer-3")).toEqual([`${surfaceTestId}\ntab-1`])

    shown.update([{ ref: { owner: "design", type: "text", key: "card/title" }, at: { x: 5, y: 5 } }])
    shown.settleOnWrite()
    shown.update([{ ref: { owner: "design", type: "design", key: "card" }, at: { x: 9, y: 9 } }])

    expect(previews[0]?.items).toEqual([{ target: { design: "card", node: "title" }, at: { x: 5, y: 5 } }])
    expect(people.owners("peer-3")).toEqual([`${surfaceTestId}\ntab-1`])

    previews[0]?.land()

    expect(previews[0]?.how).toEqual(["settle", "landed"])
    expect(people.owners("peer-3")).toEqual([])
  })

  it("closes a preview still settling when it's disposed or the module stops, giving its color back", async () => {
    const test = driven()
    const { previews, people, stop } = await tab(test.module)
    const disposed = test.api.previewBoard("card", "peer-5")
    test.api.previewBoard("menu", "peer-6").settleOnWrite()
    disposed.settleOnWrite()
    disposed.dispose()

    expect(previews[0]?.how).toEqual(["settle", "dispose"])
    expect(people.owners("peer-5")).toEqual([])
    expect(people.owners("peer-6")).toEqual([`${surfaceTestId}\ntab-1`])

    await stop()

    expect(previews[1]?.how).toEqual(["settle", "dispose"])
    expect(people.owners("peer-6")).toEqual([])
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

describe("what an extension has open on the canvas, for extensions.json", () => {
  it("lists its layers and counts its open previews and holds, as they open and close", async () => {
    const test = driven()
    const { runtime, previews } = await tab(test.module)

    const opened = () => {
      const [facts] = runtime.facts().extensions

      return facts && { layers: facts.layers, previews: facts.previews, holds: facts.holds }
    }

    const shown = test.api.previewBoard("card", "peer-3")
    test.api.previewBoard("menu", "peer-4")
    const held = test.api.hold("card")

    expect(opened()).toEqual({ layers: ["stest.shading", "stest.people"], previews: 2, holds: 1 })

    shown.settleOnWrite()
    previews[0]?.land()
    held.dispose()

    expect(opened()).toEqual({ layers: ["stest.shading", "stest.people"], previews: 1, holds: 0 })
  })
})
