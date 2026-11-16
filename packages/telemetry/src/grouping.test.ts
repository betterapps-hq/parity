import { describe, expect, it } from "vite-plus/test"
import { withGrouping } from "./grouping.ts"

describe("withGrouping", () => {
  it("keeps UnknownVizError in one issue whichever caller reached it", () => {
    const fromBitmaps = withGrouping({ exception: { values: [{ type: "Error", value: "UnknownVizError" }] } })
    const fromExport = withGrouping({ message: "error.caught: UnknownVizError" })

    expect(fromBitmaps.fingerprint).toEqual(["unknown-viz-error"])
    expect(fromExport.fingerprint).toEqual(fromBitmaps.fingerprint)
  })

  it("leaves other errors to Sentry's grouping by stack", () => {
    const event = { exception: { values: [{ type: "TypeError", value: "Cannot read properties of undefined" }] } }
    expect(withGrouping(event)).toBe(event)
  })

  it("keeps a fingerprint the event already has", () => {
    const event = { message: "UnknownVizError", fingerprint: ["chosen"] }
    expect(withGrouping(event).fingerprint).toEqual(["chosen"])
  })
})
