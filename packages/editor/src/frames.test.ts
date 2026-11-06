import {
  type ContainerSpec,
  componentLibrary,
  defaultModeSettings,
  findNode,
  parseCanvasDocument,
  resolveModes
} from "@parity-app/core"
import { describe, expect, it } from "vite-plus/test"
import {
  detachInstancesOf,
  draggedBox,
  drawnFrame,
  fittedFrame,
  frameOfText,
  framePresets,
  frameRootShown,
  frameRootStored,
  hugsContent,
  instanceCount,
  nextFrameName,
  snapToEdges,
  textFrameRenamed,
  withFrameSize
} from "./frames.ts"

/** The file checks a design as it reads it, so a frame these make is one the project file takes. */
function parses(design: ContainerSpec): void {
  expect(() => parseCanvasDocument({ version: 3, containers: [design] })).not.toThrow()
}

describe("drawing a frame", () => {
  it("names it after the frames before it", () => {
    expect(nextFrameName([])).toBe("Frame 1")
    expect(nextFrameName(["Frame 1", "Pricing", "Frame 7", "Frame seven"])).toBe("Frame 8")
  })

  it("makes an empty frame at the size dragged out, with its id clear of the others", () => {
    const taken = [{ id: "frame-1", name: "Frame 1" }]
    const frame = drawnFrame(taken, { x: 10.4, y: -20.6 }, { width: 719.6, height: 440.2 })
    expect(frame).toMatchObject({ kind: "frame", name: "Frame 2", position: { x: 10, y: -21 } })
    expect(frame.size).toEqual({ width: 720, height: 440 })
    expect(frame.id).not.toBe("frame-1")
    parses(frame)
  })

  it("takes the box between two corners, whichever way the drag went", () => {
    expect(draggedBox({ x: 100, y: 80 }, { x: 20, y: 10 })).toEqual({ x: 20, y: 10, width: 80, height: 70 })
    expect(draggedBox({ x: 5, y: 5 }, { x: 5, y: 5 })).toEqual({ x: 5, y: 5, width: 1, height: 1 })
  })

  it("snaps a corner to the nearest edge in reach on each axis, and says where", () => {
    const boxes = [{ minX: 0, minY: 0, maxX: 1280, maxY: 900 }]
    expect(snapToEdges({ x: 1284, y: 3 }, boxes, 6)).toEqual({ point: { x: 1280, y: 0 }, guides: { x: 1280, y: 0 } })
    expect(snapToEdges({ x: 1300, y: 450 }, boxes, 6)).toEqual({ point: { x: 1300, y: 450 }, guides: {} })
  })
})

describe("the frame tool's sizes", () => {
  it("lists each viewport the modes use once, naming the modes that use it", () => {
    const presets = framePresets(defaultModeSettings)
    const names = presets.map((preset) => preset.name)
    expect(new Set(names).size).toBe(names.length)
    const modes = resolveModes(defaultModeSettings)
    expect(presets.flatMap((preset) => preset.modes).sort()).toEqual(modes.map((mode) => mode.name).sort())
    for (const preset of presets) expect(preset.height).toBeGreaterThan(0)
  })

  it("resizes a frame, which stops hugging its content", () => {
    const { design } = frameOfText("Hello", [], { x: 0, y: 0 })
    const resized = withFrameSize(design, { width: 390, height: 844 })
    expect(resized.size).toEqual({ width: 390, height: 844 })
    expect(hugsContent(resized)).toBe(false)
    parses(resized)
  })
})

describe("text on the empty canvas", () => {
  it("is a text layer in a padded frame that hugs it, named after its text", () => {
    const { design, node } = frameOfText("Plans for every team", ["plans-for-every-team"], { x: 12, y: 34 })
    expect(design).toMatchObject({ kind: "frame", name: "Plans for every team", position: { x: 12, y: 34 } })
    expect(design.id).not.toBe("plans-for-every-team")
    expect(design.root).toMatchObject({ type: "layout", style: { padding: 2, width: "hug" } })
    expect(findNode(design.root, node)).toMatchObject({ type: "text", text: "Plans for every team" })
    expect(hugsContent(design)).toBe(true)
    parses(design)
  })

  it("follows its text until it's renamed", () => {
    const { design, node } = frameOfText("Text", [], { x: 0, y: 0 })
    expect(textFrameRenamed(design, node, "Text", "Hello there").name).toBe("Hello there")
    const renamed = { ...design, name: "Greeting" }
    expect(textFrameRenamed(renamed, node, "Text", "Hello there").name).toBe("Greeting")
    expect(textFrameRenamed(design, node, "Text", "  ").name).toBe("Text")
    expect(textFrameRenamed(design, "another", "Text", "Hello there").name).toBe("Text")
  })

  it("takes the width its root is drawn at, and nothing when it's already that wide", () => {
    const { design } = frameOfText("Hi", [], { x: 0, y: 0 })
    const fitted = fittedFrame(design, 41.6)
    expect(fitted?.size).toEqual({ width: 42 })
    expect(fittedFrame(fitted!, 42.2)).toBeUndefined()
    expect(fittedFrame(withFrameSize(design, { width: 200 }), 42)).toBeUndefined()
  })
})

describe("a frame's size in the inspector", () => {
  const frame = drawnFrame([], { x: 0, y: 0 }, { width: 640, height: 400 })

  it("shows as its root's width and height, in steps", () => {
    expect(frameRootShown(frame, 4).root.style).toMatchObject({ width: 160, height: 100 })
  })

  it("puts a fixed width or height back as the frame's size, and anything else as its default", () => {
    const edit = (style: Record<string, unknown>) => {
      const shown = frameRootShown(frame, 4)
      return frameRootStored({ ...shown, root: { ...shown.root, style: { ...shown.root.style, ...style } } }, 4)
    }
    const wider = edit({ width: 200 })
    expect(wider.size).toEqual({ width: 800, height: 400 })
    expect(wider.root.style).not.toHaveProperty("width")
    expect(edit({ height: "hug" }).size).toEqual({ width: 640 })
    expect(edit({ width: "fill", height: "hug" }).size).toBeUndefined()
    expect(edit({ width: "hug" })).toMatchObject({ size: { width: 640 }, root: { style: { width: "hug" } } })
    parses(wider)
  })
})

describe("instances of a component that becomes a frame", () => {
  const badge: ContainerSpec = {
    id: "badge",
    name: "Badge",
    kind: "component",
    position: { x: 0, y: 0 },
    params: { label: { type: "text", default: "New" } },
    root: {
      type: "layout",
      id: "badge-root",
      children: [{ type: "text", id: "badge-label", text: "New", bind: { text: "label" } }]
    },
    states: [{ id: "default", name: "Default" }]
  }
  const home: ContainerSpec = {
    id: "home",
    name: "Home",
    position: { x: 0, y: 0 },
    root: {
      type: "layout",
      id: "page",
      children: [
        { type: "instance", id: "first", design: "badge", args: { label: "Sale" } },
        { type: "layout", id: "row", children: [{ type: "instance", id: "second", design: "badge" }] }
      ]
    },
    states: [{ id: "default", name: "Default" }]
  }

  it("counts them, wherever they are", () => {
    expect(instanceCount(home, "badge")).toBe(2)
    expect(instanceCount(home, "card")).toBe(0)
  })

  it("makes each plain layers, showing what it showed", () => {
    const detached = detachInstancesOf(home, "badge", componentLibrary([badge]))
    expect(instanceCount(detached, "badge")).toBe(0)
    expect(findNode(detached.root, "first")).toMatchObject({ type: "layout" })
    const texts: string[] = []
    const visit = (node: ContainerSpec["root"]) => {
      if (node.type === "text") texts.push(node.text)
      if (node.type === "layout") node.children.forEach(visit)
    }
    visit(detached.root)
    expect(texts).toEqual(["Sale", "New"])
  })
})
