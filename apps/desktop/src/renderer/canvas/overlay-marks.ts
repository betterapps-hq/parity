import type { ContainerKind } from "@parity-app/core"
import { distancesBetween, type Edge, type Point } from "@parity-app/editor"
import type { Tool } from "../selection.ts"
import type { Box } from "./frame-geometry.ts"
import { designColor, kindColors } from "./kinds.tsx"
import type { DragView } from "./layer-drag.ts"
import type { SpacingMeasure } from "./layer-measure.ts"
import { formatPx, type Redline } from "./Redline.tsx"
import type { SpacingTarget } from "./spacing-edit.ts"

/**
 * What the canvas's overlay draws, built from boxes (PAR-986). `CanvasOverlay.tsx`'s `readScene` reads the boxes from the
 * page and what's selected from the stores, and `overlayMarks` here turns them into outlines, labels, handles and
 * redlines, from plain data, so what's drawn where is tested without a browser.
 */

/** A frame of a design on the overlay: which one, its box, and how many screen pixels make one of the design's there. */
export interface FrameBox {
  mode: string
  state: string
  box: Box
  scale: number
}

/** A selected layer, and its box in each frame of its design that draws it, the picked frame first. */
export interface SceneLayer {
  id: string
  /** What its label says when it's the only layer selected. */
  name: string
  color: string
  /** Inside an instance, where everything is the component's: it takes no handles. */
  inner: boolean
  boxes: (FrameBox & { picked: boolean })[]
}

/** Everything the overlay draws from: what's selected, hovered and going on, with boxes in the overlay's pixels. */
export interface OverlayScene {
  tool: Tool
  /** The selected design, with each frame it's drawn in, and the one its selection was picked in. */
  design?: { key: string; kind: ContainerKind | undefined; locked: boolean; frames: FrameBox[]; picked?: FrameBox }
  /** The selected layer, when one is; with several, the last one picked. */
  node?: string
  /** The selected layers, which have no outline where they were while they're dragged. */
  layers: SceneLayer[]
  /** Whether a selected layer is locked, which keeps its outline but takes away its handles (PAR-192). */
  locked: boolean
  drag?: DragView
  /** The selected component design's slots, in the picked frame. */
  slots: { id: string; name: string; box: Box }[]
  hover?: SceneHover
  /** Whether Alt is held, for redlines. */
  alt: boolean
  /** A layer snapping as it's moved or resized: its distances to what it lines up with, from point to point. */
  snaps: { from: Point; to: Point; length: number }[]
  /** Pixels in a step of the spacing scale. */
  unit: number
  /** A single selected layout's padding and gaps, as the picked frame draws them. */
  spacing?: { target: SpacingTarget; measure: SpacingMeasure }
  /** Frames on screen, for View > Layout grid; nothing while it's off. */
  grid?: (FrameBox & { key: string })[]
}

/** The hovered layer, when it isn't the selected one, in the frame under the pointer or the one its selection is in. */
export interface SceneHover {
  box: Box
  color: string
  scale: number
  /** Whether it's in the frame the selection was picked in, so Alt measures from the selected layer's box there. */
  inPicked: boolean
  /** With Alt, the selected layer as the hovered frame draws it, when that's another frame of the same design. */
  from?: Box
  /** With Alt, the hovered layer's parent, which it measures to when nothing's selected. */
  parent?: Box
}

/** Resize handles around a selected layer, or around each frame of a selected design. */
export interface Handles {
  kind: "node" | "frame"
  key: string
  box: Box
  color: string
  edges: Edge[]
  /** What the handles say they do, for a frame's (see `ResizeHandles`). */
  label?: string
  design: string
  mode: string
  state: string
  node?: string
  /** Several layers resized together by handles on the box around them all (PAR-169). */
  nodes?: string[]
}

/** What the overlay draws. */
export interface OverlayMarks {
  outlines: { key: string; box: Box; color: string; dashed: boolean; thick: boolean }[]
  /** The selection's name over it and its size under it; several layers are counted rather than named. */
  label?: { box: Box; name: string; size: string; color: string; counted?: boolean }
  redlines: Redline[]
  handles: Handles[]
  drag?: DragView
  /** The selected layout's padding and gap handles (PAR-169). */
  spacingHandles?: { target: SpacingTarget; measure: SpacingMeasure }
  /** Column grids over frames, from View > Layout grid. */
  columns?: { key: string; box: Box }[]
  /** A selected frame's size, under it, as a layer's is: a frame's name is its title above it. */
  frameSize?: { box: Box; size: string }
  /** A selected component design's slots (PAR-83), each outlined and named, so it's clear where instances put layers. */
  slots?: { key: string; box: Box; name: string }[]
}

export const noMarks: OverlayMarks = { outlines: [], redlines: [], handles: [] }
const nodeEdges: Edge[] = ["n", "e", "s", "w", "ne", "se", "sw", "nw"]
const frameEdges: Edge[] = ["e", "s", "se"]

/** What the overlay draws for a scene. */
export function overlayMarks(scene: OverlayScene): OverlayMarks {
  const { design, layers, drag, tool, locked } = scene
  const marks: OverlayMarks = { outlines: [], redlines: [], handles: [] }
  const picked = design?.picked
  const resizes = tool === "select" && !drag && !locked
  const pickedBoxes: Box[] = []
  let selectedBox: Box | undefined

  for (const layer of layers) {
    for (const { mode, state, box, scale, picked: isPicked } of layer.boxes) {
      marks.outlines.push({
        key: `sel:${layer.id}:${mode}:${state}`,
        box,
        color: layer.color,
        dashed: !isPicked,
        thick: isPicked
      })

      if (!isPicked) {
        continue
      }

      pickedBoxes.push(box)

      if (layer.id !== scene.node) {
        continue
      }

      selectedBox = box

      if (layers.length > 1) {
        continue
      }

      marks.label = { box, name: layer.name, size: sizeOf(box, scale), color: layer.color }

      // A locked layer, selected from Layers, isn't resized on the canvas (PAR-192).
      if (design && resizes && !layer.inner) {
        marks.handles.push({
          kind: "node",
          key: "node",
          box,
          color: layer.color,
          edges: nodeEdges,
          design: design.key,
          mode,
          state,
          node: layer.id
        })
      }
    }
  }

  // Several layers: one box around them all, with their count and its size.
  if (design && picked && layers.length > 1 && pickedBoxes.length > 0) {
    const box = around(pickedBoxes)
    marks.outlines.push({ key: "union", box, color: kindColors.layer, dashed: false, thick: false })

    // Resized together by handles on that box, unless one is inside an instance, which keeps the component's size.
    if (resizes && !layers.some((layer) => layer.inner)) {
      marks.handles.push({
        kind: "node",
        key: "union",
        box,
        color: kindColors.layer,
        edges: nodeEdges,
        design: design.key,
        mode: picked.mode,
        state: picked.state,
        nodes: layers.map((layer) => layer.id)
      })
    }

    marks.label = {
      box,
      name: `${layers.length} layers`,
      size: sizeOf(box, picked.scale),
      color: kindColors.layer,
      counted: true
    }
  }

  if (drag) {
    marks.drag = drag
  }

  const frame = design?.frames[0]

  if (design?.kind === "frame" && !scene.node && frame) {
    marks.frameSize = { box: frame.box, size: sizeOf(frame.box, frame.scale) }
  }

  if (picked && !drag && scene.slots.length > 0) {
    marks.slots = scene.slots.map(({ id, name, box }) => ({ key: `slot:${id}`, box, name }))
  }

  if (design && !scene.node && tool === "select" && !design.locked) {
    for (const { mode, state, box } of design.frames) {
      marks.handles.push({
        kind: "frame",
        key: `frame:${mode}:${state}`,
        box,
        color: designColor(design.kind),
        edges: frameEdges,
        label: design.kind === "frame" ? "Drag to resize the frame" : undefined,
        design: design.key,
        mode,
        state
      })
    }
  }

  const { hover, unit } = scene

  if (hover) {
    marks.outlines.push({ key: "hover", box: hover.box, color: hover.color, dashed: false, thick: false })
    // Measured from the selected layer as the hovered frame draws it.
    const from = hover.inPicked ? selectedBox : hover.from

    if (scene.alt && from) {
      marks.redlines = redlines(from, hover.box, hover.scale, unit)
    } else if (scene.alt && !selectedBox && hover.parent) {
      // Nothing selected to measure from: Alt shows the hovered layer's distances to the edges of its parent.
      marks.redlines = redlines(hover.box, hover.parent, hover.scale, unit)
    }
  }

  // A layer snapping as it's moved or resized shows its distances to what it lines up with.
  if (scene.snaps.length > 0) {
    marks.redlines = scene.snaps.flatMap(({ from, to, length }) =>
      Math.hypot(to.x - from.x, to.y - from.y) < 0.5 ? [] : [redline(from, to, length, unit)]
    )
  }

  // A selected layout's padding and gaps take handles, except inside an instance, where they're the component's.
  const single = layers.length === 1 ? layers[0] : undefined

  if (scene.spacing && single && !single.inner && resizes) {
    marks.spacingHandles = scene.spacing
  }

  if (scene.grid) {
    marks.columns = scene.grid.flatMap(layoutColumns)
  }

  return marks
}

/** A box on the overlay as its size in the design's pixels, at `scale` screen pixels to one of them. */
function sizeOf(box: Box, scale: number): string {
  return `${formatPx(box.w / scale)} × ${formatPx(box.h / scale)}`
}

/** The box around `boxes`. */
function around(boxes: readonly Box[]): Box {
  const left = Math.min(...boxes.map((box) => box.x))
  const top = Math.min(...boxes.map((box) => box.y))
  const right = Math.max(...boxes.map((box) => box.x + box.w))
  const bottom = Math.max(...boxes.map((box) => box.y + box.h))

  return { x: left, y: top, w: right - left, h: bottom - top }
}

/**
 * A frame's column grid, sized for its width the way most design systems lay pages out: 4 columns on phones, 8 on
 * tablets, 12 on wider screens, with margins and gutters growing to match.
 */
function layoutColumns({ key, box, scale }: FrameBox & { key: string }): { key: string; box: Box }[] {
  const width = box.w / scale
  let grid = { count: 12, margin: 32, gutter: 24 }

  if (width < 600) {
    grid = { count: 4, margin: 16, gutter: 16 }
  } else if (width < 1024) {
    grid = { count: 8, margin: 24, gutter: 24 }
  }

  const column = (width - grid.margin * 2 - grid.gutter * (grid.count - 1)) / grid.count

  if (column <= 0) {
    return []
  }

  return Array.from({ length: grid.count }, (_, index) => ({
    key: `${key}:${index}`,
    box: { x: box.x + (grid.margin + index * (column + grid.gutter)) * scale, y: box.y, w: column * scale, h: box.h }
  }))
}

/**
 * Distances between the selected box and another, Figma style: to each edge of a box that contains it (padding),
 * otherwise the gaps between them on each axis. The boxes and lines are in the overlay's pixels, and each length in the
 * design's, at `scale` screen pixels to one of them.
 */
export function redlines(a: Box, b: Box, scale: number, unit: number): Redline[] {
  return distancesBetween(a, b).flatMap(({ from, to, length }) =>
    length < 0.5 ? [] : [redline(from, to, length / scale, unit)]
  )
}

/** A distance to draw, between points on the overlay, `length` pixels of the design long. */
function redline(from: Point, to: Point, length: number, unit: number): Redline {
  const px = Math.round(length * 10) / 10
  const steps = px / unit

  return { x1: from.x, y1: from.y, x2: to.x, y2: to.y, px, steps: Number.isInteger(steps * 2) ? steps : undefined }
}
