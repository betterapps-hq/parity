import type { NodeStyle } from "@parity-app/core"
import { layoutTypeEdit, type StyleValues } from "@parity-app/editor"
import type { Draft, Track } from "../controls/data.ts"
import { LayoutSection as ApprovedLayout } from "../controls/layout-controls.tsx"
import type { Side } from "../controls/sides-writes.ts"
import { lengthOf, sideOf } from "../style-values.ts"
import type { SectionProps } from "./section-edits.ts"

type Justify = NonNullable<NodeStyle["justify"]>

const spreads = new Set<Justify>(["between", "around", "evenly"])
const places = ["start", "center", "end"] as const

/** A justify that packs the children at a place, rather than spreading them out. */
const placeOf = (justify: Justify | undefined) => places.find((place) => place === justify)

/** A grid's tracks as `NodeStyle` holds them: a count of equal columns, and of rows that hug their children. */
const tracks = (count: number, track: Track): Track[] => Array.from({ length: count }, () => track)

/**
 * The layout as the approved section draws it: an Auto gap for children spread out (`justify-between`, `around` or
 * `evenly`), and, in a grid, its columns and rows, and where each child sits in its cell, which `justify` and `align`
 * place. A grid without columns set has two.
 */
function layoutView(style: NodeStyle, unit: number): Draft {
  const grid = style.display === "grid"
  const spread = style.justify !== undefined && spreads.has(style.justify)
  const align = style.align === "stretch" ? undefined : style.align

  return {
    direction: style.direction,
    wrap: style.wrap,
    justify: placeOf(style.justify),
    align: style.align,
    gap: spread ? "auto" : sideOf(style.gap, unit),
    rowGap: sideOf(style.rowGap, unit),
    distribute: style.justify === "around" || style.justify === "evenly" ? style.justify : undefined,
    columns: grid ? tracks(style.columns ?? 2, { kind: "fr", value: 1 }) : undefined,
    rows: grid ? tracks(style.rows ?? 0, { kind: "auto" }) : undefined,
    itemsX: grid ? placeOf(style.justify) : undefined,
    itemsY: grid ? align : undefined
  }
}

/** The change as the style's alignment holds it. A baseline isn't held yet, so it changes nothing. */
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
        { display: undefined, direction: change.direction ?? "column", wrap: change.wrap },
        change.wrap ? "Wrap" : "Change direction"
      )
    } else if ("columns" in change && change.columns !== undefined && !grid) {
      edit("layoutType", layoutTypeEdit("grid"), "Use a grid")
    } else if (Array.isArray(change.columns) && change.columns.length !== (style.columns ?? 2)) {
      edit("tracks", { columns: change.columns.length }, "Change columns")
    } else if ("direction" in change || "wrap" in change) {
      const next = { direction: change.direction ?? style.direction, wrap: "wrap" in change ? change.wrap : style.wrap }

      if (next.direction !== style.direction || next.wrap !== style.wrap) {
        edit(
          "layoutType",
          { display: undefined, ...next },
          next.wrap && !style.wrap ? "Wrap into columns" : "Change direction"
        )
      }
    }

    if (grid && change.rows !== undefined && change.rows.length !== draft.rows?.length) {
      const rows = change.rows.length

      edit("tracks", { rows: rows === 0 ? undefined : rows }, rows === 0 ? "Make rows auto" : "Change rows")
    }
  }

  const setGap = (change: Partial<Draft>) => {
    const spread = draft.gap === "auto"

    if (change.gap === "auto" && (!spread || "distribute" in change)) {
      edit("alignment", { justify: change.distribute ?? draft.distribute ?? "between" }, "Space out children")
    } else if ("gap" in change && change.gap !== "auto" && !sameSide(change.gap, draft.gap)) {
      // A gap of its own packs children that were spread out.
      if (spread) {
        edit("alignment", { justify: placeOf(change.justify) ?? "start" }, "Pack children")
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
      delete alignment.justify
    }

    if (Object.keys(alignment).length > 0) {
      edit("alignment", alignment, "Change alignment")
    }
  }

  // A grid's rows unset are as many as its children need, in its columns.
  const only = editor.selection.layers.length === 1 ? editor.selection.layers[0]!.node : undefined
  const children = only?.type === "layout" ? only.children.length : undefined
  const rowsMade = children === undefined ? undefined : Math.max(1, Math.ceil(children / (style.columns ?? 2)))

  return <ApprovedLayout draft={draft} set={set} rowsMade={rowsMade} />
}
