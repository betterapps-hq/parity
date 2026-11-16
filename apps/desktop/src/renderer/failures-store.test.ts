import { describe, expect, it } from "vite-plus/test"
import { consoleLog, tally } from "./console-store.ts"
import { reportFrameFailures } from "./failures-store.ts"

// docs/editor.md, Failing components (PAR-165): a frame's failing layers are errors in its project's console for as
// long as they fail, one per layer, with each frame they fail in, why and how to fix it.

const tabsList = { nodeId: "tabs", component: "TabsList", error: "`TabsList` must be used within `Tabs`" }

describe("failing layers in the console", () => {
  it("are one error per layer across frames, kept through Clear, and gone once the layer draws", () => {
    const [desktop, mobile] = [{}, {}]
    reportFrameFailures("shop", "app.par#team", desktop, { state: "default", mode: "desktop" }, [tabsList])
    reportFrameFailures("shop", "app.par#team", mobile, { state: "default", mode: "mobile" }, [tabsList])
    const log = consoleLog("shop")
    expect(log.get()).toEqual([
      expect.objectContaining({
        level: "error",
        design: "app.par#team",
        text: tabsList.error,
        frames: [
          { state: "default", mode: "desktop" },
          { state: "default", mode: "mobile" }
        ],
        failure: {
          nodeId: "tabs",
          component: "TabsList",
          reason: "It needs a parent.",
          fix: "Place it inside a Tabs layer."
        }
      })
    ])
    expect(tally(log.get(), "app.par#team").errors).toBe(1)

    log.clear()
    expect(log.get()).toHaveLength(1)

    reportFrameFailures("shop", "app.par#team", desktop, { state: "default", mode: "desktop" }, [])
    expect(log.get()[0]!.frames).toEqual([{ state: "default", mode: "mobile" }])
    reportFrameFailures("shop", "app.par#team", mobile, { state: "default", mode: "mobile" }, [])
    expect(log.get()).toEqual([])
  })
})
