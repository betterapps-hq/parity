import { describe, expect, it } from "vite-plus/test"
import { subjectOf, subjectProblem } from "./commits.ts"

describe("subjectOf", () => {
  it("takes the first line that isn't blank or a comment", () => {
    expect(subjectOf("\n# Please enter the commit message\nfix(core): snap to the grid\n\nBody\n")).toBe(
      "fix(core): snap to the grid"
    )
  })
})

describe("subjectProblem", () => {
  it("accepts a conventional subject, with or without a scope", () => {
    expect(subjectProblem("fix(desktop): draw the icons larger", true)).toBeUndefined()
    expect(subjectProblem("docs: record the npm scope", true)).toBeUndefined()
    expect(subjectProblem("feat(core)!: drop the old layer format", true)).toBeUndefined()
  })

  it("asks for a conventional type", () => {
    expect(subjectProblem("Draw the icons larger", false)).toMatch(/conventional type/)
    expect(subjectProblem("feature(desktop): draw the icons larger", false)).toMatch(/conventional type/)
  })

  it("refuses work in progress", () => {
    expect(subjectProblem("wip: private internals", false)).toMatch(/work in progress/)
    expect(subjectProblem("feat(core): WIP snapping", false)).toMatch(/work in progress/)
  })

  it("refuses a subject over 100 characters, or one ending in a full stop", () => {
    expect(subjectProblem(`feat(core): ${"a".repeat(89)}`, false)).toMatch(/101 characters/)
    expect(subjectProblem("fix(core): snap to the grid.", false)).toMatch(/full stop/)
  })

  it("lets a fixup be committed but not pushed", () => {
    expect(subjectProblem("fixup! fix(core): snap to the grid", false)).toBeUndefined()
    expect(subjectProblem("fixup! fix(core): snap to the grid", true)).toMatch(/autosquash/)
  })

  it("leaves the merge and revert commits git writes", () => {
    expect(subjectProblem("Merge branch 'main' into snapping", true)).toBeUndefined()
    expect(subjectProblem('Revert "fix(core): snap to the grid"', true)).toBeUndefined()
  })
})
