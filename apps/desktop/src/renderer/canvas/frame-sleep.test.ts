import { describe, expect, it } from "vite-plus/test"
import { boardDormant } from "./frame-sleep.ts"

const at = { hidden: false, drawn: true, far: false, selected: false }

describe("boardDormant", () => {
  it("leaves a shown tab's boards awake up close", () => {
    expect(boardDormant(at)).toBe(false)
  })

  it("puts a shown tab's boards to sleep zoomed far out, except the selected one", () => {
    expect(boardDormant({ ...at, far: true })).toBe(true)
    expect(boardDormant({ ...at, far: true, selected: true })).toBe(false)
  })

  it("puts every board of a hidden tab to sleep, the selected one too, at any zoom", () => {
    expect(boardDormant({ ...at, hidden: true })).toBe(true)
    expect(boardDormant({ ...at, hidden: true, selected: true })).toBe(true)
    expect(boardDormant({ ...at, hidden: true, far: true, selected: true })).toBe(true)
  })

  it("keeps a hidden tab's board awake until it's been drawn, so its frames have a size to keep", () => {
    expect(boardDormant({ ...at, hidden: true, drawn: false })).toBe(false)
  })
})
