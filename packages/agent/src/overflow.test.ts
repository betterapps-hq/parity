import { describe, expect, it } from "vite-plus/test"
import { describeLayoutFinding, describeOverflow, describeSqueeze, layoutFindings, overflowPast } from "./overflow.ts"
import type { MeasuredNode } from "./types.ts"

const phone = { width: 375, height: 800, fixedHeight: false }

describe("overflowPast", () => {
  it("gives how far a box reaches past each edge, beyond half a pixel", () => {
    const outer = { x: 0, y: 0, width: 100, height: 100 }
    expect(overflowPast({ x: -10, y: 20, width: 130, height: 90 }, outer)).toEqual({ left: 10, right: 20, bottom: 10 })
    expect(overflowPast({ x: 0, y: 0, width: 100.4, height: 100 }, outer)).toBeUndefined()
    expect(overflowPast({ x: 0, y: 0, width: 100.6, height: 100 }, outer)).toEqual({ right: 0.6 })
  })
})

describe("layoutFindings", () => {
  it("finds a node narrower than the frame whose position takes its right edge past it", () => {
    const nodes: MeasuredNode[] = [
      { id: "page", x: 0, y: 0, width: 375, height: 400 },
      { id: "pay", parent: "page", x: 340, y: 20, width: 60, height: 32 }
    ]

    expect(layoutFindings(nodes, phone)).toEqual([
      {
        kind: "frame-overflow",
        node: "pay",
        box: { x: 340, y: 20, width: 60, height: 32 },
        container: { box: { x: 0, y: 0, width: 375, height: 800 } },
        overflow: { right: 25 }
      }
    ])
  })

  it("leaves out overflow within the tolerance", () => {
    const nodes: MeasuredNode[] = [{ id: "row", x: 0, y: 0, width: 375.5, height: 40 }]
    expect(layoutFindings(nodes, phone)).toEqual([])
    expect(layoutFindings([{ ...nodes[0]!, width: 375.6 }], phone).map((finding) => finding.overflow)).toEqual([
      { right: 0.6 }
    ])
  })

  it("leaves out a node out of the flow reaching past a parent that doesn't clip", () => {
    const nodes: MeasuredNode[] = [
      { id: "card", x: 20, y: 20, width: 200, height: 100 },
      { id: "badge", parent: "card", x: 200, y: 10, width: 30, height: 20, outOfFlow: true }
    ]

    expect(layoutFindings(nodes, phone)).toEqual([])
  })

  it("finds a node in the flow spilling out of a parent that doesn't clip, inside the frame (PAR-886)", () => {
    const card = { x: 20, y: 20, width: 200, height: 100 }
    const table = { x: 36, y: 36, width: 300, height: 60 }

    const nodes: MeasuredNode[] = [
      { id: "card", ...card },
      { id: "table", parent: "card", ...table },
      { id: "row", parent: "table", x: 36, y: 36, width: 300, height: 30 }
    ]

    expect(layoutFindings(nodes, phone)).toEqual([
      {
        kind: "parent-overflow",
        node: "table",
        box: table,
        container: { node: "card", box: card },
        overflow: { right: 116 }
      }
    ])
  })

  it("allows a pixel of spill, for text set in a box its own width", () => {
    const nodes: MeasuredNode[] = [
      { id: "day", x: 10, y: 10, width: 60, height: 20 },
      { id: "label", parent: "day", x: 9.3, y: 10, width: 61.4, height: 20 }
    ]

    expect(layoutFindings(nodes, phone)).toEqual([])
    expect(layoutFindings([nodes[0]!, { ...nodes[1]!, x: 8.9, width: 62.2 }], phone)[0]?.overflow).toEqual({
      left: 1.1,
      right: 1.1
    })
  })

  it("finds a spill inside an ancestor that clips but doesn't cut it, and only a cut when one does", () => {
    const page = { x: 0, y: 0, width: 375, height: 400 }
    const label = { x: 10, y: 10, width: 80, height: 20 }

    const nodes: MeasuredNode[] = [
      { id: "page", ...page },
      { id: "label", parent: "page", ...label },
      { id: "text", parent: "label", x: 10, y: 10, width: 120, height: 20 },
      {
        id: "long",
        parent: "label",
        x: 10,
        y: 10,
        width: 420,
        height: 20,
        clipped: true,
        clip: { node: "page", ...page }
      }
    ]

    expect(layoutFindings(nodes, phone).map(({ kind, node, container }) => [kind, node, container.node])).toEqual([
      ["parent-overflow", "text", "label"],
      ["clipped", "long", "page"]
    ])
  })

  it("names the nearest ancestor that clips, at each level of nested clipping", () => {
    const card = { x: 20, y: 20, width: 300, height: 200 }
    const list = { x: 40, y: 40, width: 300, height: 100 }

    const nodes: MeasuredNode[] = [
      { id: "card", ...card },
      { id: "list", parent: "card", ...list, clipped: true, clip: { node: "card", ...card } },
      {
        id: "item",
        parent: "list",
        x: 40,
        y: 120,
        width: 200,
        height: 40,
        clipped: true,
        clip: { node: "list", ...list }
      }
    ]

    expect(layoutFindings(nodes, phone)).toEqual([
      { kind: "clipped", node: "list", box: list, container: { node: "card", box: card }, overflow: { right: 20 } },
      {
        kind: "clipped",
        node: "item",
        box: { x: 40, y: 120, width: 200, height: 40 },
        container: { node: "list", box: list },
        overflow: { bottom: 20 }
      }
    ])
  })

  it("names an ancestor outside the design's layers by its box alone", () => {
    const clip = { x: 0, y: 0, width: 100, height: 50 }
    const nodes: MeasuredNode[] = [{ id: "title", x: 0, y: 0, width: 140, height: 20, clipped: true, clip }]
    expect(layoutFindings(nodes, phone)[0]?.container).toEqual({ box: clip })
  })

  it("reports the outermost node to fix, not its children that go no further", () => {
    const nodes: MeasuredNode[] = [
      { id: "row", x: 0, y: 0, width: 415, height: 40 },
      { id: "left", parent: "row", x: 0, y: 0, width: 200, height: 40 },
      { id: "right", parent: "row", x: 215, y: 0, width: 200, height: 40 },
      { id: "icon", parent: "right", x: 395, y: 0, width: 20, height: 20 },
      // Positioned further out than the row reaches, so it's its own problem.
      { id: "tip", parent: "right", x: 400, y: 0, width: 40, height: 20 }
    ]

    expect(layoutFindings(nodes, phone).map(({ node, overflow }) => ({ node, overflow }))).toEqual([
      { node: "row", overflow: { right: 40 } },
      { node: "tip", overflow: { right: 65 } }
    ])
  })

  it("has a bottom edge only for a frame with a fixed height", () => {
    const nodes: MeasuredNode[] = [{ id: "footer", x: 0, y: 780, width: 375, height: 60 }]
    expect(layoutFindings(nodes, phone)).toEqual([])
    expect(layoutFindings(nodes, { ...phone, fixedHeight: true })[0]?.overflow).toEqual({ bottom: 40 })
  })

  it("checks a node against the frame when what clips it doesn't cut it beyond the tolerance", () => {
    const nodes: MeasuredNode[] = [
      { id: "wide", x: 0, y: 0, width: 400, height: 20, clipped: true, clip: { x: 0, y: 0, width: 399.8, height: 20 } }
    ]

    expect(layoutFindings(nodes, phone).map((finding) => finding.kind)).toEqual(["frame-overflow"])
  })

  it("leaves out days past the edge of a row that scrolls, judging the part in view (PAR-904)", () => {
    const days = { x: 16, y: 100, width: 343, height: 56 }
    const inDays = (x: number, width: number) => ({ x: Math.min(Math.max(x, 16), 359), y: 100, width, height: 56 })

    const nodes: MeasuredNode[] = [
      { id: "page", x: 0, y: 0, width: 375, height: 400 },
      { id: "days", parent: "page", ...days },
      { id: "wed", parent: "days", x: 288, y: 100, width: 64, height: 56 },
      // Partly past the row's right edge, and wholly past it: what's past is scrolled to.
      { id: "thu", parent: "days", x: 352, y: 100, width: 64, height: 56, inView: inDays(352, 7) },
      { id: "fri", parent: "days", x: 424, y: 100, width: 64, height: 56, inView: inDays(424, 0) }
    ]

    expect(layoutFindings(nodes, phone)).toEqual([])
  })

  it("still finds a row that scrolls sticking out of the frame, and what a hidden overflow cuts off (PAR-904)", () => {
    const days = { x: 16, y: 100, width: 420, height: 56 }

    const nodes: MeasuredNode[] = [
      { id: "days", ...days },
      { id: "sun", parent: "days", x: 400, y: 100, width: 64, height: 56, inView: { ...days, x: 400, width: 36 } },
      {
        id: "label",
        parent: "sun",
        x: 400,
        y: 100,
        width: 64,
        height: 80,
        inView: { x: 400, y: 100, width: 36, height: 80 },
        clipped: true,
        clip: { x: 400, y: 100, width: 64, height: 56 }
      }
    ]

    expect(layoutFindings(nodes, phone).map(({ kind, node, overflow }) => ({ kind, node, overflow }))).toEqual([
      { kind: "frame-overflow", node: "days", overflow: { right: 61 } },
      { kind: "clipped", node: "label", overflow: { bottom: 24 } }
    ])
  })

  it("leaves out nodes drawn at no size", () => {
    expect(layoutFindings([{ id: "input", x: 500, y: 0, width: 0, height: 0 }], phone)).toEqual([])
  })
})

describe("describing findings", () => {
  const names = new Map([["list", "Results"]])
  const name = (id: string) => names.get(id)

  it("puts the amounts past each edge in words", () => {
    expect(describeOverflow({ right: 24 })).toBe("24px on the right")
    expect(describeOverflow({ left: 4, right: 24, bottom: 8 })).toBe(
      "4px on the left, 24px on the right and 8px at the bottom"
    )
  })

  it("says where a node that sticks out of the frame is, and by how much", () => {
    const [finding] = layoutFindings([{ id: "pay", x: 340, y: 20, width: 60, height: 32 }], phone)
    expect(describeLayoutFinding(finding!, name)).toBe(
      "at x 340, y 20 and 60 × 32px, it sticks out of the 375px frame by 25px on the right"
    )
  })

  it("names the parent a node spills out of", () => {
    const nodes: MeasuredNode[] = [
      { id: "list", x: 0, y: 0, width: 100, height: 100 },
      { id: "item", parent: "list", x: 0, y: 90, width: 100, height: 30 }
    ]

    expect(describeLayoutFinding(layoutFindings(nodes, phone)[0]!, name)).toBe(
      "20px at the bottom spills out of Results (list), which doesn't clip it"
    )
  })

  it("says how much narrower than its width a squeezed node is drawn, and the element inside it", () => {
    expect(describeSqueeze({ width: 112, wants: 256 })).toBe(
      "drawn 112px wide, 144px narrower than its 256px width, squeezed by what's beside it"
    )
    expect(describeSqueeze({ width: 112.4, wants: 256, element: "sidebar-gap" })).toBe(
      "its sidebar-gap element is drawn 112.4px wide, 143.6px narrower than its 256px width, squeezed by what's beside it"
    )
  })

  it("names the ancestor that clips", () => {
    const list = { x: 0, y: 0, width: 100, height: 100 }

    const [finding] = layoutFindings(
      [{ id: "item", x: 0, y: 90, width: 100, height: 30, clip: { node: "list", ...list } }],
      phone
    )

    expect(describeLayoutFinding(finding!, name)).toBe(
      "20px at the bottom cut off by Results (list), which clips its overflow"
    )
  })
})
