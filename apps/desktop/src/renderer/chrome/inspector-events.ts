import type { DesignNode, NodeChange, NodeStyle } from "@parity-app/core"
import { type StyleRow, type StyleSelection, styleRows } from "@parity-app/editor"
import type { ChangePreview } from "../canvas/change-preview.ts"
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
  /**
   * Whether the layers changed, when the caller knows: values that differ across the layers read `mixed` before and
   * after an edit that changed each of them.
   */
  changed?: boolean
}

/** Records a change, unless it left the value as it was. */
export function recordInspectorChange({
  field,
  design,
  layers,
  state,
  from,
  to,
  gesture,
  changed
}: InspectorChange): void {
  const before = valueText(from)
  const after = valueText(to)
  if (!(changed ?? before !== after)) return
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

/**
 * Makes a change to a layer, as part of a gesture's one undo step when given. It's recorded against `shown`, the layer
 * as it was shown before, unless that's `false`, as for a preview.
 */
export type LayerChange = (label: string, value: NodeChange, gesture?: string, shown?: DesignNode | false) => void

/** Records each field a layer's change sets, as `inspector.changed`, with what the layer showed before (PAR-640). */
export function recordLayerChange(
  design: string,
  layers: string[],
  state: string,
  node: DesignNode,
  change: NodeChange,
  gesture: string | undefined
): void {
  for (const { field, from, to } of changedFields(node, change)) {
    recordInspectorChange({ field, design, layers, state, from, to, ...(gesture ? { gesture } : {}) })
  }
}

/**
 * A component prop shown by being made before it's changed, as a number prop is while it's scrubbed or typed (see
 * `ChangePreview`). Previews aren't recorded, and nor is one taken back. The change made is, once, from the layer as it
 * showed before the first preview.
 */
export class PreviewedProp {
  private before: DesignNode | undefined

  constructor(private readonly preview: Pick<ChangePreview, "show" | "commit" | "cancel">) {}

  /** Shows `value` on the layer, which `node` is as it's shown now. */
  show(node: DesignNode, change: LayerChange, label: string, value: NodeChange): void {
    this.before ??= node
    this.preview.show((gesture) => change(label, value, gesture, false))
  }

  /** Makes the change, in place of what's previewed. */
  commit(node: DesignNode, change: LayerChange, label: string, value: NodeChange, gesture?: string): void {
    const shown = this.before ?? node
    this.before = undefined
    this.preview.commit((made) => change(label, value, made, shown), gesture)
  }

  /** Takes the preview back, recording nothing. */
  cancel(): void {
    this.before = undefined
    this.preview.cancel()
  }
}
