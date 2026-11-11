// Where a frame's nodes reach past what holds them: the frame's edges, an ancestor that clips, or a parent that doesn't
// clip, which they spill out of. A node the layout doesn't place, such as a badge positioned over a card's corner, is
// meant to reach past its parent and isn't reported for it (PAR-886).
import type { FrameBox, MeasuredNode, Overflow, Squeeze } from "./types.ts"

/** How far past an edge a box may reach before it counts, for subpixel layout: half a CSS pixel. */
export const overflowTolerance = 0.5

/**
 * How far past its parent a node may spill before it counts: a pixel, more than for the frame and clipping, since text
 * set in a box its own width measures a fraction wider than the box.
 */
export const spillTolerance = 1

const edges = ["left", "right", "top", "bottom"] as const

/** How far `inner` reaches past each edge of `outer`, beyond the tolerance; nothing when it stays inside. */
export function overflowPast(inner: FrameBox, outer: FrameBox, tolerance = overflowTolerance): Overflow | undefined {
  const past: Overflow = {}

  const amounts = {
    left: outer.x - inner.x,
    right: inner.x + inner.width - (outer.x + outer.width),
    top: outer.y - inner.y,
    bottom: inner.y + inner.height - (outer.y + outer.height)
  }

  for (const edge of edges) {
    if (amounts[edge] > tolerance) {
      past[edge] = round(amounts[edge])
    }
  }

  return Object.keys(past).length > 0 ? past : undefined
}

export interface LayoutFinding {
  /**
   * `clipped`: an ancestor that clips hides part of it. `frame-overflow`: it reaches past the frame's edge.
   * `parent-overflow`: it spills out of its parent, which doesn't clip, inside the frame.
   */
  kind: "clipped" | "frame-overflow" | "parent-overflow"
  node: string
  box: FrameBox
  /** The ancestor that clips it, the parent it spills out of, or the frame, which has no node. */
  container: { node?: string; box: FrameBox }
  overflow: Overflow
}

/**
 * The nodes a frame cuts off, that stick out of it, or that spill out of their parent. A frame is as tall as its
 * content unless it has a fixed height, so only a fixed height has a bottom edge. A node spills out of its parent when
 * it's in the layout's flow (it isn't `outOfFlow`) and it reaches past the parent's box with nothing cutting it off. A node
 * that overflows only as far as an ancestor already reported, past the same edges of the same container, is left out:
 * the ancestor is the one to fix.
 */
export function layoutFindings(
  nodes: readonly MeasuredNode[],
  frame: { width: number; height: number; fixedHeight: boolean },
  tolerance = overflowTolerance
): LayoutFinding[] {
  const frameBox = { x: 0, y: 0, width: frame.width, height: frame.height }
  const reach = frame.fixedHeight ? frameBox : { ...frameBox, height: Number.POSITIVE_INFINITY }
  const found = new Map<string, LayoutFinding>()
  const byId = new Map(nodes.map((node) => [node.id, node]))

  for (const node of nodes) {
    if (node.width <= 0 || node.height <= 0) {
      continue
    }

    const box = { x: node.x, y: node.y, width: node.width, height: node.height }

    if (node.clip) {
      const { node: by, ...clipBox } = node.clip
      const overflow = overflowPast(box, clipBox, tolerance)

      if (overflow) {
        found.set(node.id, {
          kind: "clipped",
          node: node.id,
          box,
          container: by ? { node: by, box: clipBox } : { box: clipBox },
          overflow
        })
        continue
      }
    }

    const overflow = overflowPast(box, reach, tolerance)

    if (overflow) {
      found.set(node.id, { kind: "frame-overflow", node: node.id, box, container: { box: frameBox }, overflow })
      continue
    }

    const parent = node.parent === undefined ? undefined : byId.get(node.parent)

    if (!parent || node.outOfFlow || parent.width <= 0 || parent.height <= 0) {
      continue
    }

    const parentBox = { x: parent.x, y: parent.y, width: parent.width, height: parent.height }
    const spill = overflowPast(box, parentBox, Math.max(tolerance, spillTolerance))

    if (spill) {
      found.set(node.id, {
        kind: "parent-overflow",
        node: node.id,
        box,
        container: { node: parent.id, box: parentBox },
        overflow: spill
      })
    }
  }

  const parents = new Map(nodes.map((node) => [node.id, node.parent]))

  const covered = (finding: LayoutFinding) => {
    const seen = new Set<string>()

    for (let id = parents.get(finding.node); id && !seen.has(id); id = parents.get(id)) {
      seen.add(id)
      const outer = found.get(id)

      if (!outer || outer.kind !== finding.kind || outer.container.node !== finding.container.node) {
        continue
      }

      if (edges.every((edge) => (finding.overflow[edge] ?? 0) <= (outer.overflow[edge] ?? 0) + tolerance)) {
        return true
      }
    }

    return false
  }

  return [...found.values()].filter((finding) => !covered(finding))
}

const edgeWords = { left: "on the left", right: "on the right", top: "at the top", bottom: "at the bottom" }

/** The amounts past each edge, in words: "24px on the right and 8px at the bottom". */
export function describeOverflow(overflow: Overflow): string {
  const parts = edges.flatMap((edge) =>
    overflow[edge] === undefined ? [] : [`${overflow[edge]}px ${edgeWords[edge]}`]
  )

  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : (parts[0] ?? "")
}

/**
 * A layout finding in a sentence, for the node it's about. `name` gives a node's label, for naming the ancestor that
 * clips.
 */
export function describeLayoutFinding(finding: LayoutFinding, name: (id: string) => string | undefined): string {
  const amounts = describeOverflow(finding.overflow)

  if (finding.kind === "clipped") {
    const by = finding.container.node
    const clipper = by ? `${name(by) ?? by} (${by})` : "an element outside the design's layers"

    return `${amounts} cut off by ${clipper}, which clips its overflow`
  }

  if (finding.kind === "parent-overflow") {
    const parent = finding.container.node!

    return `${amounts} spills out of ${name(parent) ?? parent} (${parent}), which doesn't clip it`
  }

  const { x, y, width, height } = finding.box

  return `at x ${x}, y ${y} and ${width} × ${height}px, it sticks out of the ${finding.container.box.width}px frame by ${amounts}`
}

/** A squeezed node in a sentence: how wide it's drawn against its width, and the element its component draws, if any. */
export function describeSqueeze(squeeze: Squeeze): string {
  const what = squeeze.element ? `its ${squeeze.element} element is drawn` : "drawn"
  const short = round(squeeze.wants - squeeze.width)

  return `${what} ${squeeze.width}px wide, ${short}px narrower than its ${squeeze.wants}px width, squeezed by what's beside it`
}

function round(value: number): number {
  return Math.round(value * 10) / 10
}
