import type { DesignNode, NodeChange, NodeStyle } from "@parity-app/core"
import { type StyleRow, type StyleSelection, styleRows } from "@parity-app/editor"
import { track } from "../report-error.ts"

/**
 * `inspector.changed` (PAR-640): what an inspector field changed, on which layers, from what to what. Values go as
 * JSON, so a padding or a colour reads as it's stored.
 */
export interface InspectorChange {
  field: string
  design: string
  layers: readonly string[]
  state?: string
  from: unknown
  to: unknown
  gesture?: string
}

/** Records a change, unless it left the value as it was. */
export function recordInspectorChange({ field, design, layers, state, from, to, gesture }: InspectorChange): void {
  const before = valueText(from)
  const after = valueText(to)
  if (before === after) return
  track("inspector.changed", {
    field,
    design,
    layers: [...layers],
    ...(state ? { state } : {}),
    from: before,
    to: after,
    gesture: gesture !== undefined
  })
}

/** Stands for a value that differs across the layers. */
export const mixed = Symbol("mixed")

/** A value as `inspector.changed` sends it: JSON, `null` for none, or `mixed`. */
export function valueText(value: unknown): string {
  if (value === mixed) return "mixed"
  return value === undefined ? "null" : JSON.stringify(value)
}

/** A style row's values as the selected layers share them, or `mixed` when they differ. */
export function rowValues(selection: StyleSelection | undefined, row: StyleRow): unknown {
  if (!selection) return undefined
  const keys: readonly (keyof NodeStyle)[] = styleRows[row]
  if (keys.some((key) => selection.mixed.includes(key))) return mixed
  return Object.fromEntries(
    keys.flatMap((key) => (selection.style[key] === undefined ? [] : [[key, selection.style[key]]]))
  )
}

/** Each field a layer's change sets, with what the layer showed there before: `text`, `hidden`, `props.*`, `style.*`. */
export function changedFields(node: DesignNode, change: NodeChange): { field: string; from: unknown; to: unknown }[] {
  const shown = node as DesignNode & { text?: string; props?: Record<string, unknown>; style?: NodeStyle }
  const fields: { field: string; from: unknown; to: unknown }[] = []
  if ("text" in change) fields.push({ field: "text", from: shown.text, to: change.text })
  if ("hidden" in change) fields.push({ field: "hidden", from: shown.hidden ?? false, to: change.hidden })
  for (const [name, to] of Object.entries(change.props ?? {})) {
    fields.push({ field: `props.${name}`, from: shown.props?.[name], to })
  }
  for (const [name, to] of Object.entries(change.style ?? {})) {
    fields.push({ field: `style.${name}`, from: shown.style?.[name as keyof NodeStyle], to })
  }
  return fields
}
