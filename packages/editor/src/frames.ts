import {
  type ComponentLibrary,
  type ContainerSpec,
  detachInstance,
  type FrameSize,
  generateId,
  isHug,
  lengthSteps,
  type ModeSettings,
  type ResolvedMode,
  resolveModes,
  screenHeightForWidth,
  uniqueId,
  walkNodes
} from "@parity-app/core"
import { newDesign } from "./create.ts"
import type { Point } from "./drop-slot.ts"
import { layersName } from "./new-screen.ts"

/**
 * Frames on the canvas (PAR-545): drawing one with the frame tool, placing one at a mode's size, text on the empty
 * canvas, frames that hug what's in them, and what a component leaves behind in becoming one. Each takes designs as
 * data and returns them changed, for the app to apply as one undo step.
 */

/** "Frame 1", "Frame 2" and so on: one past the highest number already given to a design `base` and a number. */
export function nextFrameName(names: Iterable<string>, base = "Frame"): string {
  const pattern = new RegExp(`^${base} (\\d+)$`)
  let highest = 0

  for (const name of names) {
    highest = Math.max(highest, Number(pattern.exec(name)?.[1] ?? 0))
  }

  return `${base} ${highest + 1}`
}

/** The size a click with the frame tool makes, without a drag, as Figma's is. */
export const clickedFrameSize = { width: 100, height: 100 } as const

/**
 * A frame drawn with the frame tool or placed at one of the modes' sizes: empty, named after the frames before it
 * ("Frame 3"), with its top left `at`, at its own `size`. Its id comes from its name, clear of `taken`.
 */
export function drawnFrame(
  taken: readonly { id: string; name: string }[],
  at: { x: number; y: number },
  size: { width: number; height: number }
): ContainerSpec {
  const name = nextFrameName(taken.map((design) => design.name))

  const frame = newDesign(
    "frame",
    [],
    { x: Math.round(at.x), y: Math.round(at.y) },
    {
      size: { width: Math.round(size.width), height: Math.round(size.height) }
    }
  )

  return {
    ...frame,
    id: uniqueId(
      name,
      taken.map((design) => design.id)
    ),
    name
  }
}

/** A box on the canvas, as tldraw gives a design's bounds. */
export interface CanvasBox {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/** Where a point snapped to, and the edges it snapped to on each axis that did. */
export interface EdgeSnap {
  point: Point
  guides: Partial<Point>
}

/**
 * A point the frame tool drags to, snapped to the nearest edge of the designs around it on each axis, within `reach`
 * canvas pixels, with the edges it snapped to for guides. Without one in reach, an axis is where the pointer is.
 */
export function snapToEdges(point: Point, boxes: readonly CanvasBox[], reach: number): EdgeSnap {
  const nearest = (value: number, edges: number[]) => {
    let best: number | undefined

    for (const edge of edges) {
      if (Math.abs(value - edge) <= reach && (best === undefined || Math.abs(value - edge) < Math.abs(value - best))) {
        best = edge
      }
    }

    return best
  }

  const x = nearest(
    point.x,
    boxes.flatMap((box) => [box.minX, box.maxX])
  )

  const y = nearest(
    point.y,
    boxes.flatMap((box) => [box.minY, box.maxY])
  )

  const guides: Partial<Point> = {}

  if (x !== undefined) {
    guides.x = x
  }

  if (y !== undefined) {
    guides.y = y
  }

  return { point: { x: x ?? point.x, y: y ?? point.y }, guides }
}

/** A box by its top left, width and height, in canvas pixels. */
export interface CanvasRect {
  x: number
  y: number
  width: number
  height: number
}

/** The box dragged out from one corner to the other, whichever way the drag went, in whole pixels. */
export function draggedBox(from: Point, to: Point): CanvasRect {
  const x = Math.round(Math.min(from.x, to.x))
  const y = Math.round(Math.min(from.y, to.y))

  return {
    x,
    y,
    width: Math.max(1, Math.round(Math.max(from.x, to.x)) - x),
    height: Math.max(1, Math.round(Math.max(from.y, to.y)) - y)
  }
}

/** Whether a frame is as wide as what's in it: its root layout hugs its content, so its size follows the root's. */
export function hugsContent(design: ContainerSpec): boolean {
  return design.kind === "frame" && design.root.type === "layout" && isHug(design.root.style?.width)
}

/**
 * A frame that hugs its content (see `hugsContent`), at the width its root is drawn at, in whole pixels. The canvas
 * measures the root as it's drawn, so the frame's own size, which its bitmap, agents and exports go by, stays the size
 * it shows at. Undefined when it's already that wide, or doesn't hug.
 */
export function fittedFrame(design: ContainerSpec, drawnWidth: number): ContainerSpec | undefined {
  if (!hugsContent(design)) {
    return undefined
  }

  const width = Math.max(1, Math.round(drawnWidth))

  if (design.size?.width === width && design.size.height === undefined) {
    return undefined
  }

  return { ...design, size: { width } }
}

/**
 * A frame at a new size, from its handles, the frame tool's sizes or the inspector. A width of its own means it stops
 * hugging its content, so its root fills it again. A screen or a component is left as it is: their sizes are each
 * viewport's (see `withFrame`).
 */
export function withFrameSize(design: ContainerSpec, size: FrameSize): ContainerSpec {
  if (design.kind !== "frame") {
    return design
  }

  const next: ContainerSpec = { ...design }

  if (size.width === undefined && size.height === undefined) {
    delete next.size
  } else {
    next.size = size
  }

  if (size.width !== undefined && hugsContent(design) && design.root.type === "layout") {
    const style = { ...design.root.style }
    delete style.width
    next.root = { ...design.root, style }
  }

  return next
}

/**
 * A frame is its root layout, so the inspector shows the frame's own size as its root's width and height, in steps of
 * the spacing scale (`unit` pixels a step): a fixed side as a fixed length, and a side it doesn't fix as the root has
 * it. Selecting a frame edits this; `frameRootStored` puts an edit back. Anything but a frame is left as it is.
 */
export function frameRootShown(design: ContainerSpec, unit: number): ContainerSpec {
  if (design.kind !== "frame" || design.root.type !== "layout") {
    return design
  }

  const style = { ...design.root.style }
  const { width, height } = design.size ?? {}

  if (width !== undefined && !isHug(style.width)) {
    style.width = { step: width / unit }
  }

  if (height !== undefined) {
    style.height = { step: height / unit }
  }

  return { ...design, root: { ...design.root, style } }
}

/**
 * A frame's root as `frameRootShown` showed it, edited, put back: a fixed width or height becomes the frame's own size
 * in pixels, hugging stays on the root, and a side that fills or isn't set goes back to the frame's default, as wide as
 * the primary mode and as tall as its content.
 */
export function frameRootStored(design: ContainerSpec, unit: number): ContainerSpec {
  if (design.kind !== "frame" || design.root.type !== "layout") {
    return design
  }

  const style = { ...design.root.style }
  const size: FrameSize = {}

  const width = lengthSteps(style.width)
  const height = lengthSteps(style.height)

  if (width !== undefined) {
    size.width = Math.round(width * unit)
  } else if (isHug(style.width) && design.size?.width !== undefined) {
    size.width = design.size.width
  }

  if (height !== undefined) {
    size.height = Math.round(height * unit)
  }

  if (!isHug(style.width)) {
    delete style.width
  }

  delete style.height
  const { style: _, ...bare } = design.root
  const next: ContainerSpec = { ...design, root: Object.keys(style).length > 0 ? { ...bare, style } : bare }

  if (size.width === undefined && size.height === undefined) {
    delete next.size
  } else {
    next.size = size
  }

  return next
}

/** A new frame, and the id of the layer in it to edit. */
export interface NewFrame {
  design: ContainerSpec
  node: string
}

/**
 * Text on the empty canvas: a text layer in a frame that hugs it, with 2 steps of padding so the frame's fill doesn't
 * clip its letters, and its top left `at`. It's named after its text (see `textFrameRenamed`). Returns the frame and the
 * text layer's id, to edit it in place.
 */
export function frameOfText(text: string, taken: Iterable<string>, at: Point): NewFrame {
  const ids = new Set<string>()
  const rootId = generateId(ids)
  ids.add(rootId)
  const node = generateId(ids)
  const name = layersName([{ type: "text", id: node, text }])

  return {
    design: {
      id: uniqueId(name, taken),
      name,
      kind: "frame",
      position: { x: Math.round(at.x), y: Math.round(at.y) },
      root: {
        type: "layout",
        id: rootId,
        style: {
          padding: { step: 2 },
          width: { size: "hug" },
          fills: [{ type: "solid", color: { token: "background" } }],
          color: { token: "foreground" }
        },
        children: [{ type: "text", id: node, text }]
      }
    },
    node
  }
}

/**
 * A frame named after the text it holds keeps following its text until it's renamed: when the frame holds only the
 * text layer `node` and its name is what `before` was called, it takes the name of `after`. Any other design, or a
 * frame named otherwise, is left as it is.
 */
export function textFrameRenamed(design: ContainerSpec, node: string, before: string, after: string): ContainerSpec {
  const children = design.root.type === "layout" ? design.root.children : []

  if (design.kind !== "frame" || children.length !== 1 || children[0]!.id !== node) {
    return design
  }

  const was = layersName([{ type: "text", id: "text", text: before }])
  const name = layersName([{ type: "text", id: "text", text: after }])

  return design.name === was && name !== was && after.trim() ? { ...design, name } : design
}

/** A size the frame tool offers: one of the viewports the project's modes use, and the modes that use it. */
export interface FramePreset {
  /** The first mode using the viewport, for its icon. */
  mode: ResolvedMode
  /** The viewport's name, or the mode's when its viewport has none. */
  name: string
  width: number
  height: number
  /** The names of the modes that use it, in the modes' order. */
  modes: string[]
}

/**
 * The frame tool's sizes: each viewport the modes use, once, in the modes' order. A viewport that gives only a width
 * takes the height of the device nearest that width, as boards estimate a frame they haven't drawn.
 */
export function framePresets(settings: ModeSettings): FramePreset[] {
  const presets: FramePreset[] = []

  for (const mode of resolveModes(settings)) {
    const option = mode.options.find(({ variable }) => variable.kind === "viewport")?.option
    const name = option?.name ?? mode.name
    const found = presets.find((preset) => preset.name === name && preset.width === mode.width)

    if (found) {
      found.modes.push(mode.name)
    } else {
      presets.push({
        mode,
        name,
        width: mode.width,
        height: option?.height ?? screenHeightForWidth(mode.width),
        modes: [mode.name]
      })
    }
  }

  return presets
}

/** How many instances of the component `id` a design places, anywhere in it. */
export function instanceCount(design: ContainerSpec, id: string): number {
  let count = 0
  walkNodes(design.root, (node) => {
    if (node.type === "instance" && node.design === id) {
      count += 1
    }
  })

  return count
}

/**
 * A design with every instance of the component `id` made plain layers, as Detach instance makes each one, since a
 * frame isn't a component and nothing can place it. `library` has the component, as it is before it changes.
 */
export function detachInstancesOf(design: ContainerSpec, id: string, library: ComponentLibrary): ContainerSpec {
  const instances: string[] = []
  walkNodes(design.root, (node) => {
    if (node.type === "instance" && node.design === id) {
      instances.push(node.id)
    }
  })

  return instances.reduce((current, instance) => detachInstance(current, instance, library), design)
}
