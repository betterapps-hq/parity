import type { RenderNode } from "@parity-app/core"
import { describe, expect, it } from "vite-plus/test"
import { ChangeBaselines, type FrameId } from "./baselines.ts"
import type { FrameTrace } from "./trace.ts"

const trace = (seed: string): FrameTrace => ({
  files: { "src/badge.tsx": seed.repeat(16) },
  digest: seed.repeat(40)
})

const frame: FrameId = { project: "shop", design: "pricing", state: "default", mode: "desktop" }

describe("ChangeBaselines (PAR-997)", () => {
  it("counts from the first trace taken, and is unchanged again once the files are back as they were", () => {
    const baselines = new ChangeBaselines()
    expect(baselines.compare(frame, [], trace("a")).status).toEqual({ state: "unchanged" })
    expect(baselines.compare(frame, [], trace("b")).status).toEqual({ state: "changed", files: ["src/badge.tsx"] })
    expect(baselines.compare(frame, [], trace("a")).status).toEqual({ state: "unchanged" })
  })

  it("can't say for a frame not traced, and takes no baseline from it", () => {
    const baselines = new ChangeBaselines()
    expect(baselines.compare(frame, [], undefined).status).toEqual({ state: "unknown" })
    expect(baselines.compare(frame, [], trace("b")).status).toEqual({ state: "unchanged" })
  })

  it("keeps each frame's own baseline, and starts a project's again once it's forgotten", () => {
    const baselines = new ChangeBaselines()
    const other = { ...frame, mode: "phone" }
    baselines.compare(frame, [], trace("a"))
    baselines.compare(other, [], trace("b"))
    expect(baselines.compare(other, [], trace("b")).status).toEqual({ state: "unchanged" })

    baselines.forget("shop")
    expect(baselines.compare(frame, [], trace("c")).status).toEqual({ state: "unchanged" })
  })
})

describe("ChangeBaselines from the last commit (PAR-1074)", () => {
  const read: FrameTrace = {
    files: { "src/badge.tsx": "a".repeat(16), "src/index.css": "b".repeat(16) },
    digest: "c".repeat(40),
    components: { badge: ["src/badge.tsx"] }
  }

  it("is changed by the frame's own files that differ from the commit, and only those", () => {
    const baselines = new ChangeBaselines()
    const committed = new Set(["src/badge.tsx", "src/unrelated.tsx"])
    expect(baselines.compare(frame, [], read, committed).status).toEqual({ state: "changed", files: ["src/badge.tsx"] })
  })

  it("is unchanged when the frame's files are all as committed, even on the first look", () => {
    const baselines = new ChangeBaselines()
    expect(baselines.compare(frame, [], read, new Set(["src/unrelated.tsx"])).status).toEqual({ state: "unchanged" })
  })

  it("marks the node whose component reads the changed file, and not the others", () => {
    const tree = [
      { kind: "component", nodeId: "badge", component: "badge", props: {}, slots: { children: [] } },
      { kind: "component", nodeId: "button", component: "button", props: {}, slots: { children: [] } }
    ] satisfies RenderNode[]

    const change = new ChangeBaselines().compare(frame, tree, read, new Set(["src/badge.tsx"]))
    expect(change.nodes).toEqual({ badge: { state: "changed", files: ["src/badge.tsx"] } })
  })

  it("can't say for a frame not traced", () => {
    expect(new ChangeBaselines().compare(frame, [], undefined, new Set()).status).toEqual({ state: "unknown" })
  })
})
