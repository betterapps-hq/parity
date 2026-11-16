import { ArrowUtil, type CanvasSvgDef, DrawUtil, GeoUtil } from "./tldraw-names.ts"

/*
 * tldraw's own arrow, draw and geo shapes, which the canvas never makes, without the hatched fill each adds to the
 * canvas's SVG defs. tldraw draws that fill as an image for every power of two up to the farthest zoom in over the
 * farthest out, and the canvas's 1% to 800% makes that 1,024 times: a canvas over 8,000 pixels square for each theme,
 * painted and encoded as a PNG on the page's thread whenever a canvas mounts. That kept the page busy for about a second
 * each time a project opened (PAR-179). A shape filled with the pattern, which only these three draw, would show no fill.
 */

class Arrows extends ArrowUtil {
  override getCanvasSvgDefs(): CanvasSvgDef[] {
    return []
  }
}

class Drawings extends DrawUtil {
  override getCanvasSvgDefs(): CanvasSvgDef[] {
    return []
  }
}

class Geos extends GeoUtil {
  override getCanvasSvgDefs(): CanvasSvgDef[] {
    return []
  }
}

/** Given to tldraw with the canvas's own shapes, these take the place of its defaults of the same type. */
export const withoutPatternFills = [Arrows, Drawings, Geos]
