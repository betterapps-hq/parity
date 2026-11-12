import type { FrameChange, FrameId } from "@parity-app/change-detection"
import { afterEach, describe, expect, it, vi } from "vite-plus/test"
import type { RenderJob } from "../../shared/protocol.ts"
import { preloadAnswers } from "../service.ts"
import { askChange, designChange, recordChange } from "./frame-changes.ts"

// SAFETY: the functions under test only pass the job on, to the stubbed service.
const job = {} as RenderJob

const frame = (design: string, mode: string): FrameId => ({ project: "shop", design, state: "default", mode })

const changed = (...files: string[]): FrameChange => ({ status: { state: "changed", files } })
const unchanged: FrameChange = { status: { state: "unchanged" } }

/** Answers `frames.changes` with `answer` for the frames asked, counting the requests. */
function service(answer: (frames: { id: FrameId }[]) => Promise<{ changes: FrameChange[] }>) {
  // oxlint-disable-next-line anti-slop/no-unknown-parameters, anti-slop/no-unknown-returns -- it stands in for the service across IPC, whose messages preloadAnswers leaves unparsed
  const request = vi.fn<(method: string, params: unknown) => Promise<unknown>>((_method, params) =>
    // SAFETY: the one method asked is frames.changes, whose frames are JSON of the frames asked about.
    answer(JSON.parse((params as { frames: string }).frames) as { id: FrameId }[])
  )

  vi.stubGlobal("window", { canvasHost: { ask: preloadAnswers(request) } })

  return request
}

afterEach(() => vi.unstubAllGlobals())

describe("frame changes (PAR-997)", () => {
  it("asks once for the frames that ask in the same task, and gives each its own answer", async () => {
    const request = service((frames) =>
      Promise.resolve({ changes: frames.map(({ id }) => (id.mode === "phone" ? changed("src/badge.tsx") : unchanged)) })
    )

    const [desktop, phone] = await Promise.all([
      askChange(frame("pricing", "desktop"), job),
      askChange(frame("pricing", "phone"), job)
    ])

    expect(desktop).toEqual(unchanged)
    expect(phone).toEqual(changed("src/badge.tsx"))
    expect(request).toHaveBeenCalledTimes(1)
  })

  it("answers unknown when the service couldn't say", async () => {
    service(() => Promise.reject(new Error("closed")))
    expect(await askChange(frame("pricing", "desktop"), job)).toEqual({ status: { state: "unknown" } })
  })

  it("adds a design's frames up: changed while one is, unchanged once it's back, unknown with none", () => {
    expect(designChange("shop", "checkout")).toEqual({ state: "unknown" })

    recordChange(frame("checkout", "desktop"), unchanged)
    recordChange(frame("checkout", "phone"), changed("src/badge.tsx"))
    expect(designChange("shop", "checkout")).toEqual({ state: "changed", files: ["src/badge.tsx"] })

    recordChange(frame("checkout", "phone"), unchanged)
    expect(designChange("shop", "checkout")).toEqual({ state: "unchanged" })

    recordChange(frame("checkout", "desktop"), undefined)
    recordChange(frame("checkout", "phone"), undefined)
    expect(designChange("shop", "checkout")).toEqual({ state: "unknown" })
  })
})
