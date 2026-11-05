// Where a frame's nodes reach past what holds them: the frame's edges, or an ancestor that clips. A node may overflow a
// parent that doesn't clip, such as a badge over a card's corner; that shows, so it's intended and isn't reported.
import type { FrameBox, MeasuredNode, Overflow } from "./types.ts"

/** How far past an edge a box may reach before it counts, for subpixel layout: half a CSS pixel. */
export const overflowTolerance = 0.5

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
  for (const edge of edges) if (amounts[edge] > tolerance) past[edge] = round(amounts[edge])
  return Object.keys(past).length > 0 ? past : undefined
}

export interface LayoutFinding {
  /** `clipped`: an ancestor that clips hides part of it. `frame-overflow`: it reaches past the frame's edge. */
  kind: "clipped" | "frame-overflow"
  node: string
  box: FrameBox
  /** The ancestor that clips it, or the frame, which has no node. */
  container: { node?: string; box: FrameBox }
  overflow: Overflow
}

/**
 * The nodes a frame cuts off or that stick out of it. A frame is as tall as its content unless it has a fixed height,
 * so only a fixed height has a bottom edge. A node that overflows only as far as an ancestor already reported, past the
 * same edges of the same container, is left out: the ancestor is the one to fix.
 */
export function layoutFindings(
  nodes: readonly MeasuredNode[],
  frame: { width: number; height: number; fixedHeight: boolean },
  tolerance = overflowTolerance
): LayoutFinding[] {
  const frameBox = { x: 0, y: 0, width: frame.width, height: frame.height }
  const reach = frame.fixedHeight ? frameBox : { ...frameBox, height: Number.POSITIVE_INFINITY }
  const found = new Map<string, LayoutFinding>()
  for (const node of nodes) {
    if (node.width <= 0 || node.height <= 0) continue
    const box = { x: node.x, y: node.y, width: node.width, height: node.height }
    if (node.clip) {
      const { node: by, ...clipBox } = node.clip
      const overflow = overflowPast(box, clipBox, tolerance)
      if (overflow) {
        found.set(node.id, {
          kind: "clipped",
          node: node.id,
          box,
          container: { ...(by ? { node: by } : {}), box: clipBox },
          overflow
        })
        continue
      }
    }
    const overflow = overflowPast(box, reach, tolerance)
    if (overflow)
      found.set(node.id, { kind: "frame-overflow", node: node.id, box, container: { box: frameBox }, overflow })
  }
  const parents = new Map(nodes.map((node) => [node.id, node.parent]))
  const covered = (finding: LayoutFinding) => {
    const seen = new Set<string>()
    for (let id = parents.get(finding.node); id && !seen.has(id); id = parents.get(id)) {
      seen.add(id)
      const outer = found.get(id)
      if (!outer || outer.kind !== finding.kind || outer.container.node !== finding.container.node) continue
      if (edges.every((edge) => (finding.overflow[edge] ?? 0) <= (outer.overflow[edge] ?? 0) + tolerance)) return true
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
  const { x, y, width, height } = finding.box
  return `at x ${x}, y ${y} and ${width} × ${height}px, it sticks out of the ${finding.container.box.width}px frame by ${amounts}`
}

function round(value: number): number {
  return Math.round(value * 10) / 10
}
