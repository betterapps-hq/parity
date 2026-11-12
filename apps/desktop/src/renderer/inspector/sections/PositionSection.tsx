import { placementEdit } from "@parity-app/editor"
import { PanelSection } from "../../chrome/PanelSection.tsx"
import { Field, IconSegments } from "../controls/field-row.tsx"
import { InsetBox, placements } from "../controls/pin-box.tsx"
import type { Position, Stage } from "../controls/position-writes.ts"
import { sideRules } from "../controls/sides-writes.ts"
import { lengthOf, sideOf } from "../style-values.ts"
import { mixedOf, rowState, type SectionProps } from "./section-edits.ts"

/** The placements `NodeStyle` holds: in its layout, or absolute. Fixed, Sticky and Relative come with PAR-924. */
const held = placements.filter((option) => option.value === "static" || option.value === "absolute")

const options = held.map((option) => ({ ...option, icon: <option.Icon /> }))

/** An inset as `NodeStyle` holds it: a length or a token, unpinned when unset. It has no percentage yet. */
const insetRules = { ...sideRules.inset, percent: false }

/** Where nothing's measured, as for several layers: a pinned side's distance starts from 0. */
const unmeasured: Stage = { parent: { width: 0, height: 0 }, size: { width: 0, height: 0 }, inFlow: { x: 0, y: 0 } }

/**
 * Position, on the approved inset box (PAR-186): Placement, In layout or Absolute, and for an absolute layer the box,
 * each side pinned at its inset or unpinned, clicked to pin it at its distance from the parent's edge, with Fill to
 * pin every side at 0. Centering and Scale need what `NodeStyle` can't hold yet, so they aren't offered.
 */
export function PositionSection({ editor, edit }: SectionProps) {
  const { style } = editor.selection
  const { unit } = editor
  const mixed = mixedOf(editor)
  const absolute = style.position === "absolute"

  const position: Position = {
    placement: absolute ? "absolute" : "static",
    insets: [sideOf(style.top, unit), sideOf(style.right, unit), sideOf(style.bottom, unit), sideOf(style.left, unit)]
  }

  return (
    <PanelSection title="Position">
      <div className="flex flex-col gap-3">
        <Field label="Placement" {...rowState(editor, "placement")}>
          <IconSegments
            label="Placement"
            value={mixed("position") ? undefined : position.placement}
            options={options}
            onChange={(next) =>
              edit(
                "placement",
                placementEdit(next === "absolute"),
                next === "absolute" ? "Position absolutely" : "Put back in the layout"
              )
            }
          />
        </Field>
        {absolute && (
          <InsetBox
            position={position}
            placement="absolute"
            stage={editor.place?.() ?? unmeasured}
            centers={false}
            scales={false}
            rules={insetRules}
            set={({ insets: [top, right, bottom, left] }) =>
              edit(
                "insets",
                {
                  top: lengthOf(top, unit),
                  right: lengthOf(right, unit),
                  bottom: lengthOf(bottom, unit),
                  left: lengthOf(left, unit)
                },
                "Change insets"
              )
            }
          />
        )}
      </div>
    </PanelSection>
  )
}
