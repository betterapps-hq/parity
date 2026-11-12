import { DropdownMenuCheckboxItem } from "@buildkitgg/shadcn-baseui-kit"
import type { NodeStyle } from "@parity-app/core"
import { layoutTypeEdit, type StyleValues } from "@parity-app/editor"
import { PanelSection } from "../../chrome/PanelSection.tsx"
import type { Draft } from "../controls/data.ts"
import { useTokens } from "../controls/field-parts.tsx"
import { Field, IconSegments, TitleMenu } from "../controls/field-row.tsx"
import { GapField, LayoutBox, layoutTypes, MenuItemText, TrackCount } from "../controls/layout-controls.tsx"
import type { Side } from "../controls/sides-writes.ts"
import { lengthOf, lengthPx, sideOf } from "../style-values.ts"
import { mixedOf, rowState, type SectionProps } from "./section-edits.ts"

type Justify = NonNullable<NodeStyle["justify"]>

const spreads = new Set<Justify>(["between", "around", "evenly"])
const places = ["start", "center", "end"] as const

/** A justify that packs the children at a place, rather than spreading them out. */
const placeOf = (justify: Justify | undefined) => places.find((place) => place === justify)

/**
 * The layout as the alignment box draws it, in its forms: an Auto gap for children spread out (`justify-between`,
 * `around` or `evenly`), and, in a grid, where each child sits in its cell, which `justify` and `align` place.
 */
function boxView(style: NodeStyle, unit: number): Draft {
  const grid = style.display === "grid"
  const spread = style.justify !== undefined && spreads.has(style.justify)
  const align = style.align === "stretch" ? undefined : style.align

  return {
    direction: style.direction,
    wrap: style.wrap,
    justify: placeOf(style.justify),
    align: style.align,
    gap: spread ? "auto" : sideOf(style.gap, unit),
    distribute: style.justify === "around" || style.justify === "evenly" ? style.justify : undefined,
    columns: grid ? [] : undefined,
    itemsX: grid ? placeOf(style.justify) : undefined,
    itemsY: grid ? align : undefined
  }
}

/** The box's change as the style's alignment holds it. A baseline isn't held yet, so it changes nothing. */
function alignmentOf(change: Partial<Draft>): Pick<StyleValues, "align" | "justify"> {
  const values: Pick<StyleValues, "align" | "justify"> = {}

  if ("justify" in change) {
    values.justify = change.justify
  }

  if ("itemsX" in change) {
    values.justify = placeOf(change.itemsX === "stretch" ? undefined : change.itemsX)
  }

  if ("itemsY" in change) {
    values.align = change.itemsY
  }

  if ("align" in change && change.align !== "baseline" && change.align !== "last baseline") {
    values.align = change.align
  }

  return values
}

/** How a spread layout spreads its children, as Auto's menu names it, from what the style holds. */
const spreadOf = (distribute: Draft["distribute"]): Justify => distribute ?? "between"

/**
 * Layout, on the approved controls (PAR-186): the alignment box, with Type and Gap beside it, and a grid's columns and
 * rows under them. Type is Figma's four, Vertical, Horizontal, Wrap and Grid; More wraps a vertical layout into columns.
 * Gap's Auto spreads the children out. What `NodeStyle` can't hold yet (reversing, where wrapped lines sit, lining up
 * baselines, a grid's track sizes) isn't offered: PAR-928 adds them.
 */
export function LayoutSection({ editor, edit }: SectionProps) {
  const { style } = editor.selection
  const { unit } = editor
  const mixed = mixedOf(editor)
  const spacing = useTokens("spacing").tokens
  const grid = style.display === "grid"
  const direction = style.direction ?? "column"
  const row = !grid && direction === "row"
  const wraps = !grid && (style.wrap ?? false)
  const spread = style.justify !== undefined && spreads.has(style.justify)
  let mode: (typeof layoutTypes)[number]["value"] = grid ? "grid" : direction

  if (row && wraps) {
    mode = "wrap"
  }

  const view = boxView(style, unit)

  const setGap = (gap: Side, distribute?: Draft["distribute"]) => {
    if (gap === "auto") {
      edit("alignment", { justify: spreadOf(distribute) }, "Space out children")

      return
    }

    // A gap of its own packs children that were spread out.
    if (spread) {
      edit("alignment", { justify: "start" }, "Pack children")
    }

    edit("gap", { gap: lengthOf(gap, unit) }, "Change gap")
  }

  const toMode = (next: typeof mode) => {
    if (next === "grid") {
      edit("layoutType", layoutTypeEdit("grid"), "Use a grid")
    } else {
      edit(
        "layoutType",
        { display: undefined, direction: next === "column" ? "column" : "row", wrap: next === "wrap" || undefined },
        next === "wrap" ? "Wrap" : "Change direction"
      )
    }
  }

  // A layout's rows unset are as many as its children need, in its columns.
  const only = editor.selection.layers.length === 1 ? editor.selection.layers[0]!.node : undefined
  const children = only?.type === "layout" ? only.children.length : undefined
  const madeRows = children === undefined ? 1 : Math.max(1, Math.ceil(children / (style.columns ?? 2)))

  return (
    <PanelSection
      title="Layout"
      action={
        direction === "column" &&
        !grid && (
          <TitleMenu label="More layout options">
            <DropdownMenuCheckboxItem
              checked={wraps}
              onCheckedChange={(wrap) => edit("layoutType", { wrap: wrap || undefined }, "Wrap into columns")}
            >
              <MenuItemText
                name="Wrap into columns"
                detail="Children run into a new column when they run out of room"
              />
            </DropdownMenuCheckboxItem>
          </TitleMenu>
        )
      }
    >
      <div className="flex flex-col gap-2.5">
        <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3">
          <Field half label={grid ? "In cells" : "Alignment"} {...rowState(editor, "alignment")}>
            <LayoutBox
              draft={view}
              set={(change) => {
                const values = alignmentOf(change)

                if (Object.keys(values).length > 0) {
                  edit("alignment", values, "Change alignment")
                }
              }}
              onSpread={(on, also = {}) =>
                edit(
                  "alignment",
                  {
                    ...alignmentOf(also),
                    justify: on ? spreadOf(view.distribute) : (placeOf(also.justify) ?? "start")
                  },
                  on ? "Space out children" : "Pack children"
                )
              }
            />
          </Field>
          <div className="flex min-w-0 flex-col gap-2.5">
            <Field half label="Type" {...rowState(editor, "layoutType")}>
              <IconSegments
                label="Type"
                value={mixed("display") || mixed("direction") || mixed("wrap") ? undefined : mode}
                options={layoutTypes}
                onChange={toMode}
              />
            </Field>
            <Field half label="Gap" {...rowState(editor, "gap")}>
              <div className="flex flex-col gap-1">
                <GapField
                  label={gapName(grid, row, wraps)}
                  across={grid || row}
                  value={view.gap}
                  // Auto spreads a flex layout's children; a grid's tracks share the room themselves.
                  takesAuto={!grid}
                  distribute={view.distribute}
                  onChange={setGap}
                  onFixed={() => edit("alignment", { justify: "start" }, "Pack children")}
                />
                {(grid || wraps) && (
                  <GapField
                    label={grid || row ? "Gap between rows" : "Gap between columns"}
                    across={!(grid || row)}
                    value={sideOf(style.rowGap, unit)}
                    // Unset, the rows are as far apart as the columns.
                    placeholder={String(lengthPx(style.gap, unit, spacing) ?? 0)}
                    onChange={(rowGap) => edit("gap", { rowGap: lengthOf(rowGap, unit) }, "Change row gap")}
                  />
                )}
              </div>
            </Field>
          </div>
        </div>
        {grid && (
          <div className="mt-2 flex flex-col gap-2.5">
            <Field label="Columns" {...rowState(editor, "tracks")}>
              <TrackCount
                one="column"
                // A grid without columns set has two.
                count={style.columns ?? 2}
                word={false}
                takesWord={false}
                onCount={(columns) => edit("tracks", { columns }, "Change columns")}
                onWord={() => undefined}
              />
            </Field>
            <Field label="Rows" {...rowState(editor, "tracks")}>
              <TrackCount
                one="row"
                count={style.rows ?? madeRows}
                word={style.rows === undefined}
                onCount={(rows) => edit("tracks", { rows }, "Change rows")}
                onWord={() => edit("tracks", { rows: undefined }, "Make rows auto")}
              />
            </Field>
          </div>
        )}
      </div>
    </PanelSection>
  )
}

/** The first gap's name: just Gap, until there's a second, between rows or columns. */
function gapName(grid: boolean, row: boolean, wraps: boolean) {
  if (!grid && !wraps) {
    return "Gap"
  }

  return grid || row ? "Gap between columns" : "Gap between rows"
}
