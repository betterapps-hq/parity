import { describe, expect, it } from "vite-plus/test"
import { withoutPatternFills } from "./tldraw-fills.ts"
import { type AnyUtilConstructor, type CanvasSvgDef, defaultUtils } from "./tldraw-names.ts"

/** What a shape util adds to the canvas's SVG defs. None of these read the editor, so no editor is made. */
function canvasDefs(util: AnyUtilConstructor): CanvasSvgDef[] {
  return util.prototype.getCanvasSvgDefs.call(undefined)
}

describe("tldraw's shapes without pattern fills", () => {
  it("adds nothing to the canvas's defs for any of tldraw's shapes", () => {
    const stockUtils = defaultUtils.map(
      (util) => withoutPatternFills.find((replacement) => replacement.type === util.type) ?? util
    )

    expect(stockUtils.filter((util) => canvasDefs(util).length > 0).map((util) => util.type)).toEqual([])
  })

  it("replaces only shapes whose defs add the fill, keeping their types", () => {
    for (const util of withoutPatternFills) {
      const original = defaultUtils.find((candidate) => candidate.type === util.type)
      expect(original && canvasDefs(original).length).toBeGreaterThan(0)
    }
  })
})
