import { describe, expect, it } from "vitest"
import { describeCheck, failures, score } from "./check.ts"

describe("failures", () => {
  it("reads the library's components a design's problems name, first reason each", () => {
    const failed = failures(
      [
        { problem: "Rendering failed:\naria/Cell: Cell count must match column count\nnova/Button: no" },
        { problem: "aria/Cell: later\naria/DatePicker.Trigger: reading 'calendar'" },
        { problem: `"aria/Toast" isn't one of the project's components` }
      ],
      "aria"
    )
    expect(Object.fromEntries(failed)).toEqual({
      Cell: "Cell count must match column count",
      "DatePicker.Trigger": "reading 'calendar'",
      Toast: "isn't one of the project's components"
    })
  })
})

describe("score", () => {
  const list = {
    Table: {},
    Row: { parents: ["Table"] },
    Cell: { parents: ["Table", "Row"] },
    Toast: { sample: {} },
    Loose: {}
  }

  it("counts a placed part once it and its parents render inside", () => {
    const report = score(
      "aria",
      "desktop-light",
      5,
      new Map([
        ["Row", "a"],
        ["Cell", "b"],
        ["Toast", "c"],
        ["Loose", "d"]
      ]),
      new Map([["Row", "still"]]),
      list
    )
    expect(report.placed).toEqual(["Row", "Cell", "Toast"])
    expect(report.hits).toEqual(["Toast"])
    expect(report.misses).toEqual({ Row: "still", Cell: "inside Row, which fails" })
    expect(report.score).toBe(33)
    expect(describeCheck({ ...report, floor: 50 })).toContain("Not placed: Loose")
    expect(describeCheck({ ...report, floor: 50 })).toContain("Below aria's floor.")
  })
})
