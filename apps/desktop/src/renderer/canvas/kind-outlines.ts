/* oxlint-disable anti-slop/no-shape-in-symbol-names -- tldraw's indicator overlay names its props and helpers after its shapes. */
import { canvasOutlines, type OutlineTarget, type Selection } from "@parity-app/editor"
import { type Atom, type Editor, strokeShapeIndicators } from "tldraw"
import { type CanvasId, IndicatorOverlayUtil } from "./tldraw-names.ts"

/** What the canvas outlines from, by editor (see `KindOutlines`): the selection, and the layer hovered, if one is. */
export interface OutlineSource {
  selection: Atom<Selection>
  hoveredLayer: Atom<OutlineTarget | undefined>
  /** The id a board, note or reference is drawn under, by its key. */
  canvasIdOf(key: string): CanvasId
  /** A target's own color. */
  colorOf(target: OutlineTarget): string
}

export const outlineSources = new WeakMap<Editor, OutlineSource>()

/** How see-through a hovered thing's outline is, beside a selected one's. */
const hoveredAlpha = 0.5

/** The box round several designs, which is no one kind's: the color of muted text. */
export const neutralSelection = "var(--muted-foreground)"

/**
 * Outlines boards, notes and references as `canvasOutlines` says (PAR-1118): each in its own kind's color, a hovered one
 * see-through. A board isn't outlined for what's selected or hovered inside it, which draws its own outline: a layer's
 * in the canvas's overlay, a preview's as its ring. tldraw's own indicators take one color for everything, which
 * outlined a board in its layer's or preview's color.
 */
export class KindOutlines extends IndicatorOverlayUtil {
  static override type = IndicatorOverlayUtil.type

  /** Each outlined shape's color and whether it's hovered, from the last `getOverlays`. */
  private shown = new Map<CanvasId, { color: string; hovered: boolean }>()

  override getOverlays() {
    // tldraw's own pass says when outlines show at all: not while dragging, say, or picking a style.
    const overlays = super.getOverlays()
    const source = outlineSources.get(this.editor)

    if (!source) {
      return overlays
    }

    const hovered = source.hoveredLayer.get() ?? this.targetOf(this.editor.getHoveredShapeId())
    const showing = overlays.length > 0 || this.editor.isInAny("select.idle", "select.editing_shape")
    this.shown = new Map()

    for (const { target, hovered: isHovered } of showing ? canvasOutlines(source.selection.get(), hovered) : []) {
      const key = keyOf(target)
      const id = key === undefined ? undefined : source.canvasIdOf(key)

      if (id && this.editor.getShape(id)) {
        this.shown.set(id, { color: drawableColor(source.colorOf(target)), hovered: isHovered })
      }
    }

    // Several notes or references selected by a box are selected in tldraw alone: the selection holds one at a time.
    for (const id of showing ? this.editor.getSelectedShapeIds() : []) {
      const target = this.targetOf(id)

      if (target && target.kind !== "design") {
        this.shown.set(id, { color: drawableColor(source.colorOf(target)), hovered: false })
      }
    }

    const hintingShapeIds = overlays[0]?.props.hintingShapeIds ?? []

    if (this.shown.size === 0 && hintingShapeIds.length === 0) {
      return []
    }

    return [
      {
        id: IndicatorOverlayUtil.type,
        type: IndicatorOverlayUtil.type,
        props: { idsToDisplay: [...this.shown.keys()], hintingShapeIds }
      }
    ]
  }

  override render(ctx: CanvasRenderingContext2D, overlays: ReturnType<IndicatorOverlayUtil["getOverlays"]>) {
    const overlay = overlays[0]

    if (!overlay) {
      return
    }

    const zoom = this.editor.getZoomLevel()
    ctx.lineCap = "round"
    ctx.lineJoin = "round"
    ctx.lineWidth = this.options.lineWidth / zoom

    for (const id of overlay.props.idsToDisplay) {
      const outline = this.shown.get(id)

      if (outline) {
        ctx.globalAlpha = outline.hovered ? hoveredAlpha : 1
        ctx.strokeStyle = outline.color
        strokeShapeIndicators(this.editor, ctx, [id])
      }
    }

    ctx.globalAlpha = 1

    if (overlay.props.hintingShapeIds.length > 0) {
      ctx.strokeStyle = this.editor.getCurrentTheme().colors[this.editor.getColorMode()].selectionStroke
      ctx.lineWidth = this.options.hintedLineWidth / zoom
      strokeShapeIndicators(this.editor, ctx, overlay.props.hintingShapeIds)
    }
  }

  /** What a hovered shape is, as an outline's target. */
  private targetOf(id: CanvasId | null): OutlineTarget | undefined {
    const shape = id ? this.editor.getShape(id) : undefined

    switch (shape?.type) {
      case "canvas-container":
        return { kind: "design", design: shape.props.key }
      case "canvas-note":
        return { kind: "note", note: shape.props.key }
      case "canvas-reference":
        return { kind: "reference", reference: shape.props.key }
      default:
        return undefined
    }
  }
}

/** The key of what tldraw draws an outline's target as: a board, a note or a reference. */
function keyOf(target: OutlineTarget): string | undefined {
  switch (target.kind) {
    case "design":
      return target.design
    case "note":
      return target.note
    case "reference":
      return target.reference
    default:
      return undefined
  }
}

const drawable = new Map<string, string>()

/** A color a canvas can draw with: the kinds' colors are custom properties, which only CSS resolves. */
export function drawableColor(color: string): string {
  let value = drawable.get(color)

  if (value === undefined) {
    const property = /^var\((--[\w-]+)\)$/.exec(color)?.[1]
    value = (property && getComputedStyle(document.documentElement).getPropertyValue(property).trim()) || color
    drawable.set(color, value)
  }

  return value
}
