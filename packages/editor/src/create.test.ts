import { describe, expect, it } from "vite-plus/test"
import { newDesign } from "./create.ts"

describe("a new design", () => {
  it("starts a screen as a padded page with its name as a heading", () => {
    const screen = newDesign("screen", ["home"], { x: 2000, y: 0 }, "desktop")
    expect(screen).toMatchObject({
      id: "untitled-screen",
      name: "Untitled screen",
      kind: "screen",
      position: { x: 2000, y: 0 },
      root: {
        type: "layout",
        name: "Page",
        style: { padding: [10, 12], gap: 6, background: "background", foreground: "foreground" },
        children: [{ type: "text", tag: "h1", text: "Untitled screen", style: { size: "text-2xl", weight: 600 } }]
      },
      states: [{ id: "default", name: "Default" }]
    })
    expect(screen).not.toHaveProperty("frames")
  })

  it("starts a component small, on a narrower frame in the first viewport", () => {
    const component = newDesign("component", [], { x: 0, y: 0 }, "desktop")
    expect(component).toMatchObject({
      id: "untitled-component",
      name: "Untitled component",
      kind: "component",
      root: {
        type: "layout",
        name: "Root",
        style: { padding: 4, gap: 2 },
        children: [{ type: "text", text: "Component" }]
      },
      frames: { desktop: { width: 480 } }
    })
    expect(newDesign("component", [], { x: 0, y: 0 })).not.toHaveProperty("frames")
  })

  it("takes an id no design has, and gives its layers different ids", () => {
    const screen = newDesign("screen", ["untitled-screen", "untitled-screen-2"], { x: 0, y: 0 })
    expect(screen.id).toBe("untitled-screen-3")
    const heading = screen.root.type === "layout" ? screen.root.children[0] : undefined
    expect(heading?.id).not.toBe(screen.root.id)
  })
})
