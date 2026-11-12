import { execute, type FrameRequest } from "@parity-app/agent"
import {
  type ContainerSpec,
  defaultModeSettings,
  frameGeometry,
  type ModeSettings,
  parseInput,
  resolveModes
} from "@parity-app/core"
import { describe, expect, it } from "vite-plus/test"
import type { RenderJob } from "./protocol.ts"
import {
  bitmapName,
  deviceBox,
  devicePixels,
  drawnComponents,
  frameBox,
  frameHeight,
  frameKeys,
  type JobFrame,
  type JobGuest,
  previewName,
  renderJob,
  renderJobMode
} from "./render-job.ts"
import { serviceChecks, storedJobs } from "./service-checks.ts"

/** A 1280px screen 1234px tall, whose height is the mode's own rather than the nearest device's 800. */
const modes: ModeSettings = {
  version: 1,
  variables: [
    {
      id: "viewport",
      name: "Viewport",
      kind: "viewport",
      options: [{ id: "desktop", name: "Desktop", width: 1280, height: 1234 }]
    }
  ],
  modes: [{ id: "desktop", name: "Desktop", values: { viewport: "desktop" } }]
}

const mode = resolveModes(modes)[0]!

function design(height?: number): ContainerSpec {
  const container: ContainerSpec = {
    id: "page",
    name: "Page",
    position: { x: 0, y: 0 },
    root: { type: "layout", id: "root", children: [] },
    states: [{ id: "default", name: "Default" }]
  }

  if (height !== undefined) {
    container.frames = { desktop: { height } }
  }

  return container
}

/** The frame an agent's call asks the offscreen window for, as `Measure` sends it. */
async function agentRequest(container: ContainerSpec): Promise<FrameRequest> {
  const requests: FrameRequest[] = []

  const result = await execute(
    { label: "Measure", code: `await Measure("page")` },
    {
      tab: "tab",
      components: [],
      tokens: [],
      theme: [],
      modes,
      libraryDesigns: [],
      tokenOverrides: [],
      documents: [{ path: "app.par", document: { version: 3, containers: [container] } }],
      mainDocument: "app.par",
      props: {},
      selection: {},
      bounds: {}
    },
    {
      presence: () => undefined,
      render: async (request) => {
        requests.push(request)

        return { width: request.mode.width, height: 100, nodes: [], overflowsX: false, unknownComponents: [] }
      }
    }
  )

  expect(result.ok).toBe(true)

  return requests[0]!
}

describe("renderJobMode", () => {
  it("draws a frame that grows in the live frame's window, for bitmaps and agents alike", async () => {
    const container = design()
    // What the live frame on the canvas is given.
    const live = frameGeometry(container, mode)
    expect(live).toEqual({ width: 1280, viewport: { width: 1280, height: 1234 } })
    // A bitmap's job, and an agent's.
    const bitmap = renderJobMode(mode, live)
    const request = await agentRequest(container)
    expect(request.viewport).toEqual(live.viewport)

    const agent = renderJobMode(request.mode, {
      width: request.mode.width,
      height: request.height,
      viewport: request.viewport
    })

    for (const job of [bitmap, agent]) {
      expect(job.width).toBe(1280)
      expect(job.height).toBeUndefined()
      expect(job.viewport).toEqual({ width: 1280, height: 1234 })
    }
  })

  it("keeps a fixed frame height, which clips, apart from the window", async () => {
    const container = design(600)
    const job = renderJobMode(mode, frameGeometry(container, mode))
    expect(job).toMatchObject({ width: 1280, height: 600, viewport: { width: 1280, height: 600 } })
    const request = await agentRequest(container)
    expect(request).toMatchObject({ height: 600, viewport: { width: 1280, height: 600 } })
  })

  it("marks a phone's or a tablet's mode as touch, so its offscreen frame takes thin scrollbars (PAR-900)", () => {
    const [desktop, , tablet, mobile] = resolveModes(defaultModeSettings)
    const touch = [desktop!, tablet!, mobile!].map((each) => renderJobMode(each, frameGeometry(design(), each)).touch)
    expect(touch).toEqual([undefined, true, true])
  })
})

describe("drawnComponents", () => {
  const served = {
    Button: { path: "src/button.tsx", export: "Button" },
    Card: { path: "src/card.tsx", export: "Card", library: undefined },
    Unused: { path: "src/unused.tsx", export: "Unused" }
  }

  const tree = [
    {
      kind: "component",
      nodeId: "a",
      component: "Card",
      props: { icon: { kind: "component", nodeId: "i", component: "Icon", props: {}, slots: {} } },
      slots: { children: [{ kind: "component", nodeId: "b", component: "Button", props: {}, slots: {} }] }
    },
    { kind: "text", text: "Card" }
  ]

  it("lists the components a tree draws, wherever they're nested, by where they come from", () => {
    expect(drawnComponents(tree, served)).toEqual([
      ["Button", "src/button.tsx#Button"],
      ["Card", "src/card.tsx#Card"],
      ["Icon", null]
    ])
  })

  it("is the same whether a component was served or given since, and follows one given from another file", () => {
    const { Button: _button, ...withoutButton } = served
    const given = { Button: { path: "src/button.tsx", export: "Button" } }
    expect(drawnComponents(tree, withoutButton, given)).toEqual(drawnComponents(tree, served))
    expect(drawnComponents(tree, served, { Card: { path: "src/cards.tsx", export: "Card" } })[1]).toEqual([
      "Card",
      "src/cards.tsx#Card"
    ])
  })

  it("names the version of a component whose code changed since its guest loaded (PAR-165)", () => {
    expect(drawnComponents(tree, served, { Card: { path: "src/card.tsx", export: "Card", version: 42 } })[1]).toEqual([
      "Card",
      "src/card.tsx#Card@42"
    ])
  })
})

const guest: JobGuest = {
  projectId: "D:/shop",
  guestUrl: "http://localhost:5001",
  theme: [{ name: "--x", value: "1" }]
}

const drawsText: JobFrame = {
  tree: [{ nodeId: "a", type: "text", text: "Sign in" }],
  mode,
  frame: { width: 320, height: 200, viewport: { width: 320, height: 200 } },
  scale: 0.25
}

const token = { name: "--x", theme: "light", value: "2" }

describe("renderJob", () => {
  it("leaves out what a frame doesn't have: given components, previewed tokens, and colors when not auditing", () => {
    const job = renderJob(guest, { ...drawsText, tokens: [], colorTokens: ["--x"] })
    expect(Object.keys(job)).toEqual(["projectId", "guestUrl", "theme", "tree", "mode", "scale"])

    const audited = renderJob(
      { ...guest, components: { Card: { path: "src/card.tsx", export: "Card" } } },
      { ...drawsText, tokens: [token], audit: true, colorTokens: ["--x"], inlinePortals: true }
    )

    expect(audited).toMatchObject({ audit: true, colorTokens: ["--x"], inlinePortals: true, previews: [token] })
    expect(audited.components).toEqual({ Card: { path: "src/card.tsx", export: "Card" } })
  })

  it("draws empty layouts as the code does unless the job stands in for a canvas frame (PAR-888)", () => {
    const empty = { kind: "element", nodeId: "gap", tag: "div", declarations: [], children: [] }
    const tree = [{ ...empty, attributes: { "data-canvas-empty-layout": "width height" } }]
    expect(renderJob(guest, { ...drawsText, tree }).tree).toEqual([empty])
    expect(renderJob(guest, { ...drawsText, tree, canvas: true }).tree).toEqual(tree)
  })

  it("passes the service's check whole, so each process draws the job it was given", () => {
    const job = renderJob(
      { ...guest, components: { Card: { path: "src/card.tsx", export: "Card" } } },
      {
        ...drawsText,
        tokens: [token],
        audit: true,
        colorTokens: ["--x"],
        inlinePortals: true,
        // What the frame writes to the console is the design's (PAR-147).
        design: { key: "app.par#pricing", state: "default", mode: "desktop" }
      }
    )

    // A phone's frame takes thin scrollbars (PAR-900).
    job.mode.touch = true
    expect(serviceChecks["frames.capture"]({ job }).job).toEqual(job)
    expect(parseInput(storedJobs, JSON.stringify([job]))).toEqual([job])
    expect(
      serviceChecks["previews.make"]({ preview: { component: "Card", job }, priority: "idle" }).preview.job
    ).toEqual(job)
  })
})

describe("a job's names", () => {
  const job = renderJob(guest, drawsText)
  const drawing = { id: 1 }

  const names = (named: RenderJob) => ({
    memory: frameKeys(named, drawing),
    bitmap: bitmapName(named, {}),
    preview: JSON.stringify(previewName(named))
  })

  it("leave out a field the job gains, in the job or its mode, until this module names it", () => {
    // SAFETY: a job with more fields than `RenderJob` names is still one; the extra fields are what's being tested.
    const grown = { ...job, opacity: 0.5, mode: { ...job.mode, safeArea: 20 } } as RenderJob
    expect(names(grown)).toEqual(names(job))
  })

  it("leave out where the guest is on disk, so a project opened again at a new address finds what it kept", () => {
    const moved = { ...job, guestUrl: "http://localhost:5002" }
    expect(bitmapName(moved, {})).toBe(bitmapName(job, {}))
    expect(previewName(moved)).toEqual(previewName(job))
    // In memory the address is the guest's, which a new address replaces.
    expect(frameKeys(moved, drawing).drawn).not.toBe(frameKeys(job, drawing).drawn)
  })

  it("leave out a frame's check, which changes nothing drawn", () => {
    const audited = { ...job, audit: true, colorTokens: ["--x"] }
    expect(names(audited)).toEqual(names(job))
  })

  it("leave out the design drawn, which is only for the console, so two designs drawing alike share a bitmap", () => {
    const pricing = { ...job, design: { key: "app.par#pricing", state: "default", mode: "desktop" } }
    expect(names(pricing)).toEqual(names(job))
  })

  it("change with what's drawn: the tree, the mode, the size and the scale", () => {
    const changes: RenderJob[] = [
      { ...job, tree: [{ nodeId: "a", type: "text", text: "Sign up" }] },
      { ...job, mode: { ...job.mode, classNames: ["dark"] } },
      { ...job, mode: { ...job.mode, width: 321 } },
      { ...job, mode: { ...job.mode, viewport: { width: 320, height: 640 } } },
      { ...job, mode: { ...job.mode, touch: true } },
      { ...job, scale: 0.5 }
    ]

    for (const changed of changes) {
      const [before, after] = [names(job), names(changed)]
      expect(after.memory.key).not.toBe(before.memory.key)
      expect(after.bitmap).not.toBe(before.bitmap)
      expect(after.preview).not.toBe(before.preview)
    }
  })

  it("keep each theme's preview apart, so switching back finds the one made", () => {
    const dark = { ...job, mode: { ...job.mode, classNames: ["dark"] } }
    expect(previewName(dark)).not.toEqual(previewName(job))
    expect(previewName({ ...dark, mode: { ...dark.mode, classNames: [] } })).toEqual(previewName(job))
  })

  it("name the tokens previewed on a bitmap and in memory, but not on a preview, which never draws them", () => {
    const previewing = { ...job, previews: [token] }
    expect(bitmapName(previewing, {})).not.toBe(bitmapName(job, {}))
    expect(frameKeys(previewing, drawing).key).not.toBe(frameKeys(job, drawing).key)
    // The live frame lays tokens over itself, so what it draws is the same.
    expect(frameKeys(previewing, drawing).drawn).toBe(frameKeys(job, drawing).drawn)
    expect(previewName(previewing)).toEqual(previewName(job))
  })

  it("name the guest in memory, which the disk names have in the code the stores add", () => {
    expect(frameKeys(job, { id: 2 }).drawn).not.toBe(frameKeys(job, drawing).drawn)
  })

  it("name in memory the code of the components a frame draws, so a change to one redraws only its frames", () => {
    const drawsCard = { ...job, tree: [{ kind: "component", nodeId: "a", component: "Card", props: {}, slots: {} }] }
    const card = { path: "src/card.tsx", export: "Card" }
    const drawn = (named: RenderJob) => frameKeys(named, drawing).drawn
    // Given since the guest loaded, moved, or with its code changed on disk (PAR-165).
    expect(drawn({ ...drawsCard, components: { Card: card } })).not.toBe(drawn(drawsCard))
    expect(drawn({ ...drawsCard, components: { Card: { ...card, version: 2 } } })).not.toBe(
      drawn({ ...drawsCard, components: { Card: { ...card, version: 1 } } })
    )
    // A component the frame doesn't draw leaves it as it is.
    expect(drawn({ ...drawsCard, components: { Badge: { path: "src/badge.tsx", export: "Badge", version: 3 } } })).toBe(
      drawn(drawsCard)
    )
  })

  it("name a bitmap by where the components it draws come from, however they reached the guest", () => {
    const card = { path: "src/card.tsx", export: "Card" }
    const drawsCard = { ...job, tree: [{ kind: "component", nodeId: "a", component: "Card", props: {}, slots: {} }] }
    // A guest given Card by the type checker, and one served it from the start, draw the same bitmap.
    expect(bitmapName({ ...drawsCard, components: { Card: card } }, {})).toBe(bitmapName(drawsCard, { Card: card }))
    expect(bitmapName(drawsCard, { Card: { path: "src/cards.tsx", export: "Card" } })).not.toBe(
      bitmapName(drawsCard, { Card: card })
    )
  })

  it("name a bitmap as before PAR-575, so the bitmaps kept already are found", () => {
    // The job as the service read it, less the address and the components, then where each component comes from.
    const checked = parseInput(storedJobs, JSON.stringify([renderJob(guest, { ...drawsText, tokens: [token] })]))[0]!
    const { guestUrl: _address, components: _given, ...drawn } = checked
    expect(bitmapName(checked, {})).toBe(`${JSON.stringify(drawn)}\0${JSON.stringify([])}`)
  })
})

describe("the scale", () => {
  it("sizes the window in whole device pixels, at least one", () => {
    expect(devicePixels(1280, 0.25)).toBe(320)
    expect(devicePixels(1281, 0.25)).toBe(321)
    expect(devicePixels(0, 2)).toBe(1)
  })

  it("crops to the device pixels that cover a box", () => {
    expect(deviceBox({ x: 10.5, y: 3.2, width: 100.1, height: 0 }, 2)).toEqual({ x: 21, y: 6, width: 201, height: 1 })
  })

  it("measures back in the frame's CSS pixels, to a tenth", () => {
    const box = { left: 110, top: 53, width: 33, height: 10 }
    expect(frameBox(box, { left: 10, top: 3 }, 0.25)).toEqual({ x: 400, y: 200, width: 132, height: 40 })
    expect(frameBox({ left: 1, top: 1, width: 1, height: 1 }, { left: 0, top: 0 }, 3)).toEqual({
      x: 0.3,
      y: 0.3,
      width: 0.3,
      height: 0.3
    })
    expect(frameHeight(50.1, 0.25)).toBe(201)
  })
})
