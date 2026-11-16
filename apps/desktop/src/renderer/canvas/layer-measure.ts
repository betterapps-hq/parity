import { childEntries, type ContainerSpec, locateNode } from "@parity-app/core"
import {
  type DrawnSteps,
  EvenSpacing,
  type LayerResizeStart,
  type LayerSnapScene,
  type PaddingSide,
  type Rect,
  type SnapBox,
  type SpacingLayout
} from "@parity-app/editor"
import {
  type AreaSpace,
  type ElementGeometry,
  type FrameGeometry,
  type NodeGeometry,
  scaleSides,
  type Sides,
  toFrame
} from "./frame-geometry.ts"

/**
 * What a gesture on a layer starts from, worked out from its frame's geometry (see frame-geometry.ts) for
 * `@parity-app/editor`'s rules: resizing, dragging and nudging an absolutely placed layer, snapping, and a layout's
 * padding and gap handles. These take the geometry as plain boxes and read nothing themselves, so they're tested
 * without a browser.
 */

/** Where a layer's sides are drawn, in pixels, as half steps of `unit` pixels, which insets are written in. */
export function insetSteps(insets: Sides, unit: number): DrawnSteps {
  const steps = (px: number) => Math.round((px / unit) * 2) / 2

  return { left: steps(insets.left), right: steps(insets.right), top: steps(insets.top), bottom: steps(insets.bottom) }
}

/**
 * What resizing a layer starts from, as its frame draws it: its box, the box its parent lays it out in, which the
 * design's root has none of, and for one placed absolutely, where its sides are drawn, in steps of `unit` pixels.
 */
export function resizeBoxes(
  layer: NodeGeometry,
  absolute: boolean,
  unit: number
): Pick<LayerResizeStart, "rect" | "inner" | "drawn"> {
  const insets = absolute ? layer.insets : undefined

  return { rect: layer.box, inner: layer.parentContentBox, drawn: insets && insetSteps(insets, unit) }
}

/**
 * What a layer snaps to, in the frame's own pixels from its corner: its own box, the boxes of its siblings that are
 * drawn, and the box its insets count from, inside its border: its containing block, a transformed or contained
 * ancestor as well as a positioned one. That's the parent's own box when the parent is a layout, as layouts are always
 * positioned; only in a component's slot can it be another, whatever the component's elements make the containing
 * block, since that's where the layer's insets are written from. Snapped to that box's edge, a side's inset is 0.
 * Nothing when the layer isn't drawn or has no such box.
 */
export function snapScene(
  frame: FrameGeometry,
  container: ContainerSpec,
  layer: string
): { box: SnapBox; scene: LayerSnapScene } | undefined {
  const location = locateNode(container.root, layer)
  const parent = location?.ancestors.at(-1)
  const own = frame.node(layer)
  const around = own?.offsetBox

  if (!location || !parent || !own || !around) {
    return undefined
  }

  // Read once, so every box is taken to the frame's pixels by the same corner and scale.
  const drawn = { rect: frame.rect, scale: frame.scale }

  const siblings = (childEntries(parent).find((entry) => entry.slot === location.slot)?.nodes ?? [])
    .filter((node) => node.id !== layer)
    .flatMap((node) => {
      const box = frame.node(node.id)?.box

      return box && (box.right > box.left || box.bottom > box.top) ? [toFrame(drawn, box)] : []
    })

  // The siblings stay where they are through the gesture, so where they'd space the layer evenly is kept.
  return {
    box: toFrame(drawn, own.box),
    scene: { siblings, parent: toFrame(drawn, around), spacing: new EvenSpacing(siblings) }
  }
}

/** A selected layout measured for its handles. */
export interface SpacingMeasure {
  /** In the overlay's pixels. */
  layout: SpacingLayout
  /** What its padding and gap draw at, in its own pixels. */
  drawn: { padding: Record<PaddingSide, number>; gap: number }
  /** Screen pixels per layout pixel. */
  scale: number
}

/** How a layout runs its children, and what its gap draws at, in its own pixels. */
export interface SpacingFlow {
  direction: "row" | "column"
  /** Whether its children run along a single line. */
  oneLine: boolean
  gap: number
}

/**
 * A layout's measure from its geometry in its frame, its children that are drawn (each one's box on screen, and
 * whether it's in the flow rather than placed absolutely) and how it runs them. `space` takes screen pixels to the
 * overlay's.
 */
export function spacingMeasure(
  layout: ElementGeometry,
  children: readonly { box: Rect; flows: boolean }[],
  flow: SpacingFlow,
  space: AreaSpace
): SpacingMeasure {
  const { scale, padding } = layout
  const boxes = children.map((child) => ({ box: space.rect(child.box), flows: child.flows }))

  return {
    layout: {
      rect: space.rect(layout.borderBox),
      border: scaleSides(layout.border, scale),
      padding: scaleSides(padding, scale),
      children: boxes.flatMap((child) => (child.flows ? [child.box] : [])),
      // No handle covers a child, so a click on one selects it, those placed absolutely too.
      covered: boxes.map((child) => child.box),
      direction: flow.direction,
      oneLine: flow.oneLine
    },
    drawn: { padding, gap: flow.gap },
    scale
  }
}
