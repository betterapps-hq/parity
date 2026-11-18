// @vitest-environment happy-dom
import { CanvasLayerContext, type CanvasLayerContextValue } from "@parity-app/canvas-layer"
import type { Camera, Colors, Palette, Rect } from "@parity-app/extension/internal"
import { act, createElement, Profiler, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"
import { Follow } from "./follow.ts"
import { Faces, Following, Marquees, Pointers, Selections } from "./layers.tsx"
import { People } from "./people.ts"
import type { PersonPresence } from "./protocol.ts"

/*
 * How many times the room's canvas layers render for each presence message and each frame of a pan (PAR-1325;
 * docs/editor.md, "A live room"), with three people in the room, each with a layer selected. The counts are budgets: a
 * change that makes the layers render more often fails here. Frames the layers ask for to move a pointer between the
 * positions sent are held, so only what the message or the pan causes counts.
 */

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

const palette = (n: number): Palette => ({ n, name: `P${n}`, stops: ["a", "b", "c"], color: "c", ink: "i" })

const colors: Colors = {
  claim: () => palette(0),
  release: () => undefined,
  assign: () => undefined,
  palette,
  tuned: 12
}

/** A layer's camera, boxes and colors, with a camera the test moves. */
function fakeLayer() {
  let view: Rect = { x: 0, y: 0, width: 1440, height: 900 }
  let zoom = 1
  const viewed = new Set<() => void>()

  const layer: CanvasLayerContextValue = {
    view: () => ({ zoom, view }),
    onView(listener) {
      viewed.add(listener)

      return { dispose: () => viewed.delete(listener) }
    },
    box: () => ({
      kind: "drawn",
      box: { x: 100, y: 100, width: 200, height: 40 },
      radius: 4,
      size: { width: 200, height: 40 }
    }),
    onBoxChange: () => ({ dispose: () => undefined }),
    colors: { ...colors, agents: colors },
    color: () => palette(0),
    onColors: () => ({ dispose: () => undefined }),
    frame: () => () => undefined
  }

  return {
    layer,
    /** Moves the camera by `dx` page units, as one frame of a pan, and tells the layers. */
    pan(dx: number) {
      view = { ...view, x: view.x + dx }

      for (const listener of viewed) {
        listener()
      }
    },
    zoomTo(next: number) {
      zoom = next

      for (const listener of viewed) {
        listener()
      }
    }
  }
}

const camera: Camera = {
  get: () => ({ x: 0, y: 0, width: 1440, height: 900 }),
  onChange: () => ({ dispose: () => undefined }),
  show: () => Promise.resolve(),
  follow: () => ({ update: () => undefined, onEnd: () => ({ dispose: () => undefined }), dispose: () => undefined })
}

const layerNames = ["selections", "marquees", "pointers", "faces", "following"] as const

type LayerName = (typeof layerNames)[number]

let root: Root
let host: HTMLElement
const renders = new Map<LayerName, number>()

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  // Frames that move a pointer between positions are held: only what a message or a pan causes counts.
  vi.stubGlobal("requestAnimationFrame", () => 0)
  vi.stubGlobal("cancelAnimationFrame", () => undefined)
  host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
  renders.clear()
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

function presenceOf(name: string, index: number, step: number): PersonPresence {
  return {
    name,
    pointer: { at: { x: 200 + index * 300 + step, y: 300 + step }, over: true, t: step * 33 },
    selection: [{ owner: "design", type: "layer", key: `app.par#screen-${index}/n${index + 1}` }],
    viewing: { design: `app.par#screen-${index}` }
  }
}

/** The room's five layers, each in a profiler counting its renders, with three people in the room. */
function mountRoom() {
  let clock = 0
  const people = new People(palette, () => clock)
  const follow = new Follow(camera)
  const fake = fakeLayer()
  const names = ["Ada", "Grace", "Linus"]

  names.forEach((name, index) => people.presence(`peer-${index}`, presenceOf(name, index, 0)))

  const counted = (name: LayerName, child: ReactNode) =>
    createElement(
      Profiler,
      {
        id: name,
        onRender: () => {
          renders.set(name, (renders.get(name) ?? 0) + 1)
        }
      },
      child
    )

  act(() => {
    root.render(
      createElement(
        CanvasLayerContext.Provider,
        { value: fake.layer },
        counted("selections", createElement(Selections, { people })),
        counted("marquees", createElement(Marquees, { people })),
        counted("pointers", createElement(Pointers, { people })),
        counted(
          "faces",
          createElement(Faces, { people, you: { peer: "me", self: () => ({ name: "Me" }) }, follow, camera })
        ),
        counted("following", createElement(Following, { people, follow }))
      )
    )
  })

  renders.clear()

  return {
    /** One presence message from the first person, their pointer moved. */
    presence(step: number) {
      clock += 33
      act(() => people.presence("peer-0", presenceOf(names[0]!, 0, step)))
    },
    pan: (dx: number) => act(() => fake.pan(dx)),
    zoomTo: (zoom: number) => act(() => fake.zoomTo(zoom))
  }
}

/**
 * Runs `run` `times` over, returning each layer that rendered more often than its budget, per message or frame, with
 * how often it did, so a failure says which layer and by how much.
 */
function overBudget(times: number, run: (step: number) => void, budgets: Record<LayerName, number>): string[] {
  renders.clear()

  for (let step = 1; step <= times; step += 1) {
    run(step)
  }

  return layerNames.flatMap((name) => {
    const each = (renders.get(name) ?? 0) / times

    return each > budgets[name] ? [`${name}: ${each.toFixed(2)}, over ${budgets[name]}`] : []
  })
}

/*
 * On 2026-11-18: a presence message rendered every layer that reads who's here once, a pointer move included, and the
 * avatar stack once more in one message of 30; a frame of a pan or a zoom rendered each page layer once, though they
 * read the camera only for its zoom.
 */
describe("the room's canvas layers", () => {
  it("render within budget for each presence message", () => {
    const room = mountRoom()
    const budgets = { selections: 1, marquees: 1, pointers: 1, faces: 1.1, following: 1 }

    expect(overBudget(30, (step) => room.presence(step), budgets)).toEqual([])
    // The pointer that moved was drawn again each time, so the profilers count.
    expect(renders.get("pointers")).toBe(30)
  })

  it("render within budget for each frame of a pan", () => {
    const room = mountRoom()
    const budgets = { selections: 1, marquees: 1, pointers: 1, faces: 0, following: 0 }

    expect(overBudget(30, () => room.pan(5), budgets)).toEqual([])
  })

  it("render within budget for each step of a zoom", () => {
    const room = mountRoom()
    const budgets = { selections: 1, marquees: 1, pointers: 1, faces: 0, following: 0 }

    expect(overBudget(10, (step) => room.zoomTo(1 + step / 10), budgets)).toEqual([])
  })
})
