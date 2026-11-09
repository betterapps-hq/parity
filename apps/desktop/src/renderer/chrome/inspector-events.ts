import {
  type ContainerSpec,
  type DesignNode,
  findNode,
  mapNode,
  type NodeChange,
  type NodeStyle,
  type PatchField
} from "@parity-app/core"
import { kindName, type StyleRow, type StyleSelection, styleRows } from "@parity-app/editor"
import type { ChangePreview } from "../canvas/change-preview.ts"
import type { DesignStore } from "../design-store.ts"
import { track } from "../report-error.ts"
import type { TokenStore } from "../tokens-store.ts"

/**
 * `inspector.changed` (PAR-640): what an inspector field changed, on which layers, from what to what. Values go as
 * JSON, so a padding or a colour reads as it's stored.
 */
export interface InspectorChange {
  field: string
  /** The design, by key; none for a token, which the whole project shares. */
  design?: string
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

  if (!(changed ?? before !== after)) {
    return
  }

  track("inspector.changed", {
    field,
    ...(design ? { design } : {}),
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
  if (value === mixed) {
    return "mixed"
  }

  return value === undefined ? "null" : JSON.stringify(value)
}

/** A style row's values as the selected layers share them, or `mixed` when they differ. */
export function rowValues(selection: StyleSelection | undefined, row: StyleRow): unknown {
  if (!selection) {
    return undefined
  }

  const keys: readonly (keyof NodeStyle)[] = styleRows[row]

  if (keys.some((key) => selection.mixed.includes(key))) {
    return mixed
  }

  return Object.fromEntries(
    keys.flatMap((key) => (selection.style[key] === undefined ? [] : [[key, selection.style[key]]]))
  )
}

/**
 * Whether a style row changed on any of the layers, value by value, so an edit to layers whose values differ counts
 * though they read `mixed` before and after, and one that sets the value a field already had doesn't.
 */
export function rowChanged(before: StyleSelection, after: StyleSelection | undefined, row: StyleRow): boolean {
  const keys: readonly (keyof NodeStyle)[] = styleRows[row]

  const values = (selection: StyleSelection | undefined) =>
    JSON.stringify(selection?.layers.map((layer) => [layer.id, keys.map((key) => styleOf(layer.node)?.[key] ?? null)]))

  return values(before) !== values(after)
}

const styleOf = (node: DesignNode) => (node as DesignNode & { style?: NodeStyle }).style

/**
 * Each field a layer's change sets, with what the layer showed there before: `text`, `hidden`, `props.*`, `style.*`.
 * An instance's props are its arguments, which is where a change to them goes.
 */
export function changedFields(node: DesignNode, change: NodeChange): { field: string; from: unknown; to: unknown }[] {
  const fields: { field: PatchField; to: unknown }[] = []

  if ("text" in change) {
    fields.push({ field: { kind: "text" }, to: change.text })
  }

  if ("hidden" in change) {
    fields.push({ field: { kind: "hidden" }, to: change.hidden })
  }

  for (const [key, to] of Object.entries(change.props ?? {})) {
    fields.push({ field: { kind: "props", key }, to })
  }

  for (const [key, to] of Object.entries(change.style ?? {})) {
    fields.push({ field: { kind: "style", key }, to })
  }

  return fields.map(({ field, to }) => ({ field: fieldName(field), from: fieldValue(node, field), to }))
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

/** What a change to a design records: its field, the layers it's on, and how to read the field's value off the design. */
export interface DesignField {
  field: string
  /** The layers it changes; none for a field of the design itself, such as its name, states or params. */
  layers?: readonly string[]
  state?: string
  read: (container: ContainerSpec) => unknown
}

/**
 * Changes a design through the store as one undo step and records it as `inspector.changed` (PAR-713), with the field
 * as the design reads before and after. Reading it back from the store, a change that left it as it was, or that the
 * store didn't make, records nothing; one that throws records nothing either.
 */
export function updateAndRecord(
  store: Pick<DesignStore, "getEntry" | "updateContainer">,
  key: string,
  label: string,
  update: (container: ContainerSpec) => ContainerSpec,
  { field, layers = [], state, read }: DesignField
): void {
  const before = store.getEntry(key)?.container
  store.updateContainer(key, label, update)
  const after = store.getEntry(key)?.container

  if (!before || !after || before === after) {
    return
  }

  recordInspectorChange({
    field,
    design: key,
    layers,
    ...(state ? { state } : {}),
    from: read(before),
    to: read(after)
  })
}

/**
 * Renames a design, or one of its layers given `layer`, as one undo step, and records it as `inspector.changed` with
 * `field: name` wherever it's renamed: the inspector, Layers or a board's title (PAR-728). A layer left with no name
 * goes back to its label; a design can't be.
 */
export function renameAndRecord(
  store: Pick<DesignStore, "getEntry" | "updateContainer">,
  key: string,
  name: string | undefined,
  layer?: string
): void {
  if (layer !== undefined) {
    updateAndRecord(store, key, "Rename layer", (current) => renameLayer(current, layer, name), {
      field: "name",
      layers: [layer],
      read: (current) => findNode(current.root, layer)?.name
    })

    return
  }

  const entry = store.getEntry(key)

  if (!entry || !name) {
    return
  }

  updateAndRecord(store, key, `Rename ${kindName(entry.container.kind)}`, (current) => ({ ...current, name }), {
    field: "name",
    read: (current) => current.name
  })
}

function renameLayer(container: ContainerSpec, nodeId: string, name: string | undefined): ContainerSpec {
  const root = mapNode(container.root, nodeId, (node) => {
    const next = { ...node }

    if (name) {
      next.name = name
    } else {
      delete next.name
    }

    return next
  })

  return { ...container, root }
}

/** A layer field's name as `inspector.changed` sends it: `text`, `hidden`, `props.*` or `style.*`. */
export function fieldName(field: PatchField): string {
  return field.kind === "props" || field.kind === "style" ? `${field.kind}.${field.key}` : field.kind
}

/** What a layer shows in a field, as `changedFields` reads it: an instance's props are its arguments. */
export function fieldValue(node: DesignNode | undefined, field: PatchField): unknown {
  if (!node) {
    return undefined
  }

  const shown = node as DesignNode & { text?: string; props?: Record<string, unknown>; style?: NodeStyle }

  if (field.kind === "text") {
    return shown.text
  }

  if (field.kind === "hidden") {
    return shown.hidden ?? false
  }

  const { key } = field as Extract<PatchField, { key: string }>

  if (field.kind === "style") {
    return shown.style?.[key as keyof NodeStyle]
  }

  return (node.type === "instance" ? node.args : shown.props)?.[key]
}

/** A component design's param as `inspector.changed` sends it: a variant's options by id and name, not what they change. */
export function paramValue(container: ContainerSpec, name: string): unknown {
  const param = container.params?.[name]

  if (!param?.options) {
    return param
  }

  return { ...param, options: param.options.map(({ id, name: option }) => ({ id, name: option })) }
}

/** A design's states as `inspector.changed` sends them: each one's id and name, not what it changes. */
export function statesValue(container: ContainerSpec): unknown {
  return container.states.map(({ id, name }) => ({ id, name }))
}

/**
 * Changes a token's values, by theme, as one undoable step, and records it as `inspector.changed` (PAR-713): the
 * themes it sets, with what the token had in each before and after.
 */
export function applyToken(
  store: Pick<TokenStore, "get" | "set">,
  name: string,
  changes: Record<string, string>
): void {
  const themes = Object.keys(changes)

  const values = () => {
    const token = store.get().find((candidate) => candidate.name === name)

    return Object.fromEntries(themes.map((theme) => [theme, token?.values[theme] ?? null]))
  }

  const from = values()
  store.set(themes.map((theme) => ({ name, theme, value: changes[theme]! })))
  recordInspectorChange({ field: `token.${name}`, layers: [], from, to: values() })
}
