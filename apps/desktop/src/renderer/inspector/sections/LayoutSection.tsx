import type { NodeStyle } from "@parity-app/core"
import { layoutTypeEdit, type StyleValues } from "@parity-app/editor"
import type { Draft, Track } from "../controls/data.ts"
import { LayoutSection as ApprovedLayout } from "../controls/layout-controls.tsx"
import type { Side } from "../controls/sides-writes.ts"
import { lengthOf, sideOf } from "../style-values.ts"
import { tracksOfCount } from "../track-values.ts"
import type { SectionProps } from "./section-edits.ts"

type Justify = NonNullable<NodeStyle["justifyContent"]>

const spreads = new Set<Justify>(["space-between", "space-around", "space-evenly"])
const places = ["start", "center", "end"] as const

/** A justify that packs the children at a place, rather than spreading them out. */
const placeOf = (justify: Justify | undefined) => places.find((place) => place === justify)

/** A grid's tracks as the section draws them: as many equal columns, and rows that hug their children, as it has. */
const tracks = (count: number, track: Track): Track[] => Array.from({ length: count }, () => track)

/**
 * The layout as the approved section draws it: an Auto gap for children spread out (`justify-between`, `around` or
 * `evenly`), and, in a grid, its columns and rows, and where each child sits in its cell, which `justifyContent` and
 * `alignItems` place. A grid without columns set has two.
 */
function layoutView(style: NodeStyle, unit: number): Draft {
  const grid = style.display === "grid"
  const justify = style.justifyContent
  const spread = justify !== undefined && spreads.has(justify)
  const align = style.alignItems === "stretch" ? undefined : style.alignItems
  let distribute: Draft["distribute"]

  if (justify === "space-around") {
    distribute = "around"
  } else if (justify === "space-evenly") {
    distribute = "evenly"
  }

  return {
    direction: style.flexDirection,
    wrap: style.flexWrap === "wrap" || undefined,
    justify: placeOf(justify),
    align: style.alignItems,
    gap: spread ? "auto" : sideOf(style.gap, unit),
    rowGap: sideOf(style.rowGap, unit),
    distribute,
    columns: grid ? tracks(style.gridTemplateColumns?.length ?? 2, { kind: "fr", value: 1 }) : undefined,
    rows: grid ? tracks(style.gridTemplateRows?.length ?? 0, { kind: "auto" }) : undefined,
    itemsX: grid ? placeOf(justify) : undefined,
    itemsY: grid ? align : undefined
  }
}

/** The change as the style's alignment holds it. A baseline isn't held yet, so it changes nothing. */
function alignmentOf(change: Partial<Draft>): Pick<StyleValues, "alignItems" | "justifyContent"> {
  const values: Pick<StyleValues, "alignItems" | "justifyContent"> = {}

  if ("justify" in change) {
    values.justifyContent = change.justify
  }

  if ("itemsX" in change) {
    values.justifyContent = placeOf(change.itemsX === "stretch" ? undefined : change.itemsX)
  }

  if ("itemsY" in change) {
    values.alignItems = change.itemsY
  }

  if ("align" in change && change.align !== "baseline" && change.align !== "last baseline") {
    values.alignItems = change.align
  }

  return values
}

const sameSide = (a: Side | undefined, b: Side | undefined) => JSON.stringify(a) === JSON.stringify(b)

/**
 * Layout, the approved section (PAR-186) as Storybook has it: the alignment box, with Type and Gap beside it, and a
 * grid's columns and rows under them. It edits the layers' `NodeStyle`, which holds a direction, wrapping, a grid's
 * column and row counts, the gaps, and where children sit. Reversing, where wrapped lines sit, lining up baselines,
 * filling gaps and a grid's track sizes aren't saved until it holds them (PAR-928).
 */
export function LayoutSection({ editor, edit }: SectionProps) {
  const { style } = editor.selection
  const { unit } = editor
  const grid = style.display === "grid"
  const draft = layoutView(style, unit)

  const setLayout = (change: Partial<Draft>) => {
    if ("columns" in change && change.columns === undefined && grid) {
      edit(
        "layoutType",
        { display: undefined, flexDirection: change.direction ?? "column", flexWrap: change.wrap ? "wrap" : undefined },
        change.wrap ? "Wrap" : "Change direction"
      )
    } else if ("columns" in change && change.columns !== undefined && !grid) {
      edit("layoutType", layoutTypeEdit("grid"), "Use a grid")
    } else if (Array.isArray(change.columns) && change.columns.length !== (style.gridTemplateColumns?.length ?? 2)) {
      const columns = change.columns.length

      edit(
        "tracks",
        (layer) => ({ gridTemplateColumns: tracksOfCount(columns, layer.gridTemplateColumns) }),
        "Change columns"
      )
    } else if ("direction" in change || "wrap" in change) {
      const wrapped = draft.wrap === true
      const next = {
        direction: change.direction ?? style.flexDirection,
        wrap: "wrap" in change ? change.wrap : wrapped
      }

      if (next.direction !== style.flexDirection || Boolean(next.wrap) !== wrapped) {
        edit(
          "layoutType",
          { display: undefined, flexDirection: next.direction, flexWrap: next.wrap ? "wrap" : undefined },
          next.wrap && !wrapped ? "Wrap into columns" : "Change direction"
        )
      }
    }

    if (grid && change.rows !== undefined && change.rows.length !== draft.rows?.length) {
      const rows = change.rows.length

      edit(
        "tracks",
        (layer) => ({ gridTemplateRows: tracksOfCount(rows, layer.gridTemplateRows) }),
        rows === 0 ? "Make rows auto" : "Change rows"
      )
    }
  }

  const setGap = (change: Partial<Draft>) => {
    const spread = draft.gap === "auto"

    if (change.gap === "auto" && (!spread || "distribute" in change)) {
      edit(
        "alignment",
        { justifyContent: `space-${change.distribute ?? draft.distribute ?? "between"}` },
        "Space out children"
      )
    } else if ("gap" in change && change.gap !== "auto" && !sameSide(change.gap, draft.gap)) {
      // A gap of its own packs children that were spread out.
      if (spread) {
        edit("alignment", { justifyContent: placeOf(change.justify) ?? "start" }, "Pack children")
      }

      edit("gap", { gap: lengthOf(change.gap, unit) }, "Change gap")
    }

    if ("rowGap" in change && !sameSide(change.rowGap, draft.rowGap)) {
      edit("gap", { rowGap: lengthOf(change.rowGap, unit) }, "Change row gap")
    }
  }

  const set = (change: Partial<Draft>) => {
    setLayout(change)
    setGap(change)

    // Spacing children out or packing them sets the justify itself.
    const alignment = alignmentOf(change)

    if ("gap" in change && (change.gap === "auto" || draft.gap === "auto")) {
      delete alignment.justifyContent
    }

    if (Object.keys(alignment).length > 0) {
      edit("alignment", alignment, "Change alignment")
    }
  }

  // A grid's rows unset are as many as its children need, in its columns.
  const only = editor.selection.layers.length === 1 ? editor.selection.layers[0]!.node : undefined
  const children = only?.type === "layout" ? only.children.length : undefined
  const rowsMade =
    children === undefined ? undefined : Math.max(1, Math.ceil(children / (style.gridTemplateColumns?.length ?? 2)))

  return <ApprovedLayout draft={draft} set={set} rowsMade={rowsMade} />
}
