import { execute, type FrameRequest } from "@parity-app/agent"
import { type ContainerSpec, frameGeometry, type ModeSettings, resolveModes } from "@parity-app/core"
import { describe, expect, it } from "vite-plus/test"
import { renderJobMode } from "./render-job.ts"

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
  return {
    id: "page",
    name: "Page",
    position: { x: 0, y: 0 },
    root: { type: "layout", id: "root", children: [] },
    states: [{ id: "default", name: "Default" }],
    ...(height === undefined ? {} : { frames: { desktop: { height } } })
  }
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
      ...(request.height === undefined ? {} : { height: request.height }),
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
})
