import { defaultShapeUtils, type TLAnyShapeUtilConstructor } from "tldraw"
import { describe, expect, it } from "vite-plus/test"
import { withoutPatternFills } from "./tldraw-fills.ts"

/** What a shape util adds to the canvas's SVG defs. None of these read the editor, so no editor is made. */
function canvasDefs(util: TLAnyShapeUtilConstructor): unknown[] {
  return util.prototype.getCanvasSvgDefs.call(undefined) as unknown[]
}

describe("tldraw's shapes without pattern fills", () => {
  it("adds nothing to the canvas's defs for any of tldraw's shapes", () => {
    const shapes = defaultShapeUtils.map(
      (util) => withoutPatternFills.find((replacement) => replacement.type === util.type) ?? util
    )

    expect(shapes.filter((util) => canvasDefs(util).length > 0).map((util) => util.type)).toEqual([])
  })

  it("replaces only shapes whose defs add the fill, keeping their types", () => {
    for (const util of withoutPatternFills) {
      const original = defaultShapeUtils.find((candidate) => candidate.type === util.type)
      expect(original && canvasDefs(original).length).toBeGreaterThan(0)
    }
  })
})
