/* oxlint-disable anti-slop/no-shape-in-symbol-names -- tldraw names these after its shapes; the canvas imports them under its own names from here. */
export {
  ArrowShapeUtil as ArrowUtil,
  createShapeId as createCanvasId,
  defaultShapeUtils as defaultUtils,
  DrawShapeUtil as DrawUtil,
  GeoShapeUtil as GeoUtil,
  ShapeIndicatorOverlayUtil as IndicatorOverlayUtil,
  ShapeUtil as CanvasUtil
} from "tldraw"

export type {
  TLAnyShapeUtilConstructor as AnyUtilConstructor,
  TLShape as CanvasRecord,
  TLShapeId as CanvasId,
  TLShapeUtilCanvasSvgDef as CanvasSvgDef
} from "tldraw"
