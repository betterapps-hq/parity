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
