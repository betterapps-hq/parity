import { describe, expect, it } from "vite-plus/test"
import { auditResult, canvasHeightResult, renderResult } from "./render-results.ts"

const frame = {
  width: 390,
  height: 120,
  nodes: [{ id: "root", x: 0, y: 0, width: 390, height: 120 }],
  overflowsX: false,
  unknownComponents: []
}

describe("the render page's answers", () => {
  it("pass on as the page gave them", () => {
    expect(renderResult(frame)).toEqual(frame)
    expect(auditResult({ issues: [] })).toEqual({ issues: [] })
    expect(canvasHeightResult(undefined)).toBeUndefined()
  })

  it("are refused when project code changed what they hold", () => {
    expect(() => renderResult({ ...frame, nodes: [{ id: "root" }] })).toThrow("/nodes/0/x: expected a number")
    expect(() => auditResult({ issues: [{ rule: "color-contrast", impact: "fatal" }] })).toThrow("/issues/0/impact")
    expect(() => canvasHeightResult("tall")).toThrow("/: expected a number")
  })
})
