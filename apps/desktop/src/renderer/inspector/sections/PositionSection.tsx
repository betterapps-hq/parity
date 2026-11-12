import { placementEdit } from "@parity-app/editor"
import { PositionSection as ApprovedPosition } from "../controls/pin-box.tsx"
import type { Position, Stage } from "../controls/position-writes.ts"
import { lengthOf, sideOf } from "../style-values.ts"
import { layerOrderSide, stackingName, zIndexOf } from "./layer-order.ts"
import type { SectionProps } from "./section-edits.ts"

/** Where nothing's measured, as for several layers: a pinned side's distance starts from 0. */
const unmeasured: Stage = { parent: { width: 0, height: 0 }, size: { width: 0, height: 0 }, inFlow: { x: 0, y: 0 } }

/**
 * Position, the approved section (PAR-186) as Storybook has it: Placement beside Layer order, Auto while unset, then the
 * inset box for a layer out of the layout, each side pinned at its inset or unpinned, clicked to pin it at its distance
 * from the parent's edge. It edits the layers' `NodeStyle`, which holds In layout, Absolute and a layer order (PAR-925);
 * Fixed, Sticky and Relative, centering and Scale are disabled until it holds them (PAR-924).
 */
export function PositionSection({ editor, edit }: SectionProps) {
  const { style } = editor.selection
  const { unit } = editor
  const absolute = style.position === "absolute"

  const position: Position = {
    placement: absolute ? "absolute" : "static",
    insets: [sideOf(style.top, unit), sideOf(style.right, unit), sideOf(style.bottom, unit), sideOf(style.left, unit)]
  }

  const set = (next: Position) => {
    const [top, right, bottom, left] = next.insets

    const insets = {
      top: lengthOf(top, unit),
      right: lengthOf(right, unit),
      bottom: lengthOf(bottom, unit),
      left: lengthOf(left, unit)
    }

    if (next.placement === "static") {
      edit("placement", placementEdit(false), "Put back in the layout")
    } else if (next.placement === "absolute" && !absolute) {
      edit("placement", { position: "absolute", ...insets }, "Position absolutely")
    } else if (next.placement === "absolute") {
      edit("insets", insets, "Change insets")
    }
  }

  return (
    <ApprovedPosition
      position={position}
      set={set}
      layerOrder={layerOrderSide(style.zIndex)}
      onLayerOrder={(side) => edit("layerOrder", { zIndex: zIndexOf(side) }, "Change layer order")}
      context={stackingName(editor.selection.stacking)}
      stage={editor.place?.() ?? unmeasured}
    />
  )
}
