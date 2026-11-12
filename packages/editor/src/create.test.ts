import { parseCanvasDocument } from "@parity-app/core"
import { describe, expect, it } from "vite-plus/test"
import { newDesign } from "./create.ts"

describe("a new design", () => {
  it("starts a screen as a padded page with its name as a heading", () => {
    const screen = newDesign("screen", ["home"], { x: 2000, y: 0 }, { viewport: "desktop" })
    expect(screen).toMatchObject({
      id: "untitled-screen",
      name: "Untitled screen",
      kind: "screen",
      position: { x: 2000, y: 0 },
      root: {
        type: "layout",
        name: "Page",
        style: {
          padding: [{ step: 10 }, { step: 12 }],
          gap: { step: 6 },
          fills: [{ type: "solid", color: { token: "background" } }],
          color: { token: "foreground" }
        },
        children: [
          {
            type: "text",
            tag: "h1",
            text: "Untitled screen",
            style: { fontSize: { token: "text-2xl" }, fontWeight: 600 }
          }
        ]
      },
      states: [{ id: "default", name: "Default" }]
    })
    expect(screen).not.toHaveProperty("frames")
  })

  it("starts a component small, on a narrower frame in the first viewport", () => {
    const component = newDesign("component", [], { x: 0, y: 0 }, { viewport: "desktop" })
    expect(component).toMatchObject({
      id: "untitled-component",
      name: "Untitled component",
      kind: "component",
      root: {
        type: "layout",
        name: "Root",
        style: { padding: { step: 4 }, gap: { step: 2 } },
        children: [{ type: "text", text: "Component" }]
      },
      frames: { desktop: { width: 480 } }
    })
    expect(newDesign("component", [], { x: 0, y: 0 })).not.toHaveProperty("frames")
  })

  it("starts a frame as an empty layout at its own size, with one state and nothing else", () => {
    const frame = newDesign("frame", [], { x: 0, y: 0 }, { viewport: "desktop", size: { width: 400, height: 300 } })
    expect(frame).toEqual({
      id: "untitled-frame",
      name: "Untitled frame",
      kind: "frame",
      position: { x: 0, y: 0 },
      root: {
        type: "layout",
        id: frame.root.id,
        style: {
          padding: { step: 6 },
          gap: { step: 4 },
          fills: [{ type: "solid", color: { token: "background" } }],
          color: { token: "foreground" }
        },
        children: []
      },
      size: { width: 400, height: 300 }
    })
    expect(parseCanvasDocument({ version: 4, containers: [frame] }).containers[0]).toEqual(frame)
    expect(newDesign("frame", [], { x: 0, y: 0 })).not.toHaveProperty("size")
  })

  it("takes an id no design has, and gives its layers different ids", () => {
    const screen = newDesign("screen", ["untitled-screen", "untitled-screen-2"], { x: 0, y: 0 })
    expect(screen.id).toBe("untitled-screen-3")
    const heading = screen.root.type === "layout" ? screen.root.children[0] : undefined
    expect(heading?.id).not.toBe(screen.root.id)
  })
})
