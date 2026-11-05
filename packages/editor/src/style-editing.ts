import {
  boardTarget,
  changesField,
  type ComponentLibrary,
  type ContainerSpec,
  type DesignNode,
  editInner,
  editNode,
  type EditTarget,
  editsDesign,
  innerChanges,
  isInnerPath,
  type Length,
  locateInner,
  locateNode,
  type NodeStyle,
  type Padding,
  resetInner,
  resetOverride,
  type Size,
  type StateSpec,
  styleKeys,
  targetPatches
} from "@parity-app/core"
import { boardReader } from "./shown.ts"
import { type TextSizing, textSizingKeys, withTextSizing } from "./text-editing.ts"

/**
 * Editing the style of the selected layers, as the inspector's style rows do: where an edit goes, what the layers share
 * and what differs, the layout they sit in, and each row's edit and reset across them. The app draws the rows, measures
 * layers and previews edits; these take the design and the selection and return what to show and what to change.
 */

/** Style properties to set; `undefined` clears one. */
export type StyleValues = Partial<{ [K in keyof NodeStyle]: NodeStyle[K] | undefined }>

/** The layout a layer sits in, when it sits in one. */
export interface ParentLayout {
  direction: "row" | "column"
  grid: boolean
}

/** What an edit worked out per layer knows about the layer besides its style. */
export interface EditedLayer {
  /** Whether the edit changes the design itself, rather than a state's, a variant's or a copy's changes to it. */
  base: boolean
  /** The layer's own rendered length, in spacing steps, rounded by `round` (the nearest step when left out). */
  measure: (axis: "width" | "height", round?: (steps: number) => number) => number | undefined
  /** What kind of layer it is, so an edit for one kind (text's Resizing) leaves the others in a mixed selection alone. */
  type: DesignNode["type"]
  /** Whether it sits in a column, where `grow` fills its height. Several layers can each sit in a different one. */
  column: boolean
}

/** Properties to set, or how to work them out from each selected layer's own style, as `Mixed+8` does. */
export type StyleEdit<K extends keyof NodeStyle = keyof NodeStyle> =
  | Pick<StyleValues, K>
  | ((style: NodeStyle, layer: EditedLayer) => Pick<StyleValues, K>)

/** An edit's values for one layer, from its style as shown in the state being edited. */
export function styleValues(edit: StyleEdit, style: NodeStyle, layer: EditedLayer): StyleValues {
  return typeof edit === "function" ? edit(style, layer) : edit
}

/**
 * The style properties each of the inspector's rows shows, marks as changed or mixed, resets, and writes. A row's edit
 * can only write the keys listed here, so resetting a row takes back everything its edits wrote.
 */
export const styleRows = {
  layoutType: ["display", "direction", "wrap", "columns"],
  tracks: ["columns", "rows"],
  alignment: ["align", "justify"],
  gap: ["gap", "rowGap"],
  padding: ["padding"],
  margin: ["margin"],
  // `grow` is the older way to fill along the parent's direction, so it belongs to the size along it (`rowKeys`).
  width: ["width", "grow"],
  height: ["height", "grow"],
  min: ["minWidth", "minHeight"],
  max: ["maxWidth", "maxHeight"],
  self: ["self"],
  span: ["colSpan", "rowSpan"],
  placement: ["position", "top", "right", "bottom", "left"],
  insets: ["top", "right", "bottom", "left"],
  fill: ["background"],
  radius: ["radius"],
  shadow: ["shadow"],
  opacity: ["opacity"],
  overflow: ["overflow"],
  stroke: ["border", "borderWidth", "borderStyle"],
  strokeColor: ["border"],
  strokeWidth: ["borderWidth"],
  strokeStyle: ["borderStyle"],
  textColor: ["foreground"],
  font: ["font"],
  textSize: ["size"],
  weight: ["weight"],
  lineHeight: ["leading"],
  letterSpacing: ["tracking"],
  textAlign: ["textAlign"],
  resizing: textSizingKeys,
  decoration: ["italic", "decoration"],
  case: ["transform"],
  lines: ["lines"]
} as const satisfies Record<string, readonly (keyof NodeStyle)[]>

export type StyleRow = keyof typeof styleRows

/** The keys a row edits. */
export type RowKey<R extends StyleRow> = (typeof styleRows)[R][number]

/**
 * A row's keys for a layer in `parent`: Width and Height each take `grow` only along the parent's direction, where it
 * fills, which is the width when there's no parent.
 */
export function rowKeys(row: StyleRow, parent: ParentLayout | undefined): readonly (keyof NodeStyle)[] {
  if (row !== "width" && row !== "height") return styleRows[row]
  return growsAlong(row, parent) ? styleRows[row] : [row]
}

function growsAlong(axis: "width" | "height", parent: ParentLayout | undefined): boolean {
  return (axis === "width") === (parent?.direction !== "column")
}

/** One selected layer as the board being edited shows it. */
export interface SelectedLayer {
  /** Its id, or its path inside an instance (`card/title`). */
  id: string
  /** As it's shown, with the state's, the variant's and the copy's changes applied. */
  node: DesignNode
  /** The layout it sits in, as shown. */
  parent: ParentLayout | undefined
  /** Whether an edit changes the design itself: never inside an instance, whose edits are that copy's. */
  base: boolean
}

/** The selected layers' style in the state being edited, with each row's edit and reset. */
export interface StyleSelection {
  /** The state edits go to. */
  state: StateSpec
  /** Where edits go: the state, and the variant option the board shows. */
  target: EditTarget
  /** The selected layers that still exist, in the order selected. */
  layers: SelectedLayer[]
  /** The style values every layer shares. */
  style: NodeStyle
  /** The properties set differently on some of the layers. */
  mixed: (keyof NodeStyle)[]
  /** The layout they all sit in, when they share one. */
  parent: ParentLayout | undefined
  /** Whether the state or variant being edited changes any of the row's keys on any of the layers. */
  changed: (row: StyleRow) => boolean
  /** Whether any of the row's keys differ across the layers. */
  differs: (row: StyleRow) => boolean
  /**
   * A row's edit of every layer, worked out once from each layer's own style as shown now and written to the design
   * it's given in the state being edited. `measure` gives a layer's rendered length in spacing steps, which the app
   * measures; edits that need it get nothing without it.
   */
  edit: <R extends StyleRow>(
    row: R,
    edit: StyleEdit<RowKey<R>>,
    measure?: LayerMeasure
  ) => (container: ContainerSpec) => ContainerSpec
  /** Takes back what the state or variant being edited changes about a row's keys, on every layer. */
  reset: (row: StyleRow) => (container: ContainerSpec) => ContainerSpec
}

/** A layer's rendered length in spacing steps, by its id, rounded by `round`. */
export type LayerMeasure = (
  id: string,
  axis: "width" | "height",
  round: (steps: number) => number
) => number | undefined

/** The state edits go to: the one the layers were picked in, else the one the design shows. */
export function editingState(container: ContainerSpec, picked: string | undefined): StateSpec {
  return (
    container.states.find((state) => state.id === picked) ??
    container.states.find((state) => state.id === container.view?.state) ??
    container.states[0]!
  )
}

/**
 * The selected layers' style, edited in the state they were picked in (`picked`) and the variant the board shows.
 * Layers inside instances, by path, need the `library` of components their instances place. Undefined when none of
 * the layers exists.
 */
export function styleSelection(
  container: ContainerSpec,
  ids: readonly string[],
  picked: string | undefined,
  library?: ComponentLibrary
): StyleSelection | undefined {
  const state = editingState(container, picked)
  const target = boardTarget(container, state.id)
  const view = { state, variants: container.view?.variants }
  const shown = boardReader(container, { state })
  const designBase = editsDesign(container, target)

  const layers: SelectedLayer[] = []
  const parentIds: (string | undefined)[] = []
  for (const id of ids) {
    if (isInnerPath(id)) {
      const inner = library && locateInner(container, id, library, view)
      if (!inner) continue
      const around = inner.location.ancestors.at(-1)
      const path = around && `${id.slice(0, id.lastIndexOf("/"))}/${around.id}`
      const parent = path ? (locateInner(container, path, library, view)?.shown ?? around) : undefined
      layers.push({ id, node: inner.shown, parent: layoutOf(parent), base: false })
      parentIds.push(path)
    } else {
      const location = locateNode(container.root, id)
      if (!location) continue
      const around = location.ancestors.at(-1)
      layers.push({ id, node: shown(location.node), parent: layoutOf(around && shown(around)), base: designBase })
      parentIds.push(around?.id)
    }
  }
  if (layers.length === 0) return undefined

  const { common, mixed } = sharedStyle(layers.map((layer) => layer.node))
  const parent = new Set(parentIds).size === 1 ? layers[0]!.parent : undefined
  const changes = layers.map((layer) =>
    isInnerPath(layer.id)
      ? innerChanges(container, target, layer.id, library!)
      : targetPatches(container, target)?.[layer.id]
  )
  const keysOf = (row: StyleRow) => rowKeys(row, parent)

  return {
    state,
    target,
    layers,
    style: common,
    mixed,
    parent,
    changed: (row) => changes.some((patch) => keysOf(row).some((key) => changesField(patch, { kind: "style", key }))),
    differs: (row) => keysOf(row).some((key) => mixed.includes(key)),
    edit: (_row, edit, measure) => {
      const values = layers.map((layer) =>
        styleValues(edit as StyleEdit, layer.node.style ?? {}, {
          base: layer.base,
          measure: (axis, round = Math.round) => measure?.(layer.id, axis, round),
          type: layer.node.type,
          column: layer.parent?.direction === "column"
        })
      )
      return (current) =>
        layers.reduce((next, layer, index) => {
          const at = boardTarget(next, state.id)
          const change = { style: values[index]! }
          return isInnerPath(layer.id)
            ? editInner(next, at, layer.id, change, library!)
            : editNode(next, at, layer.id, change)
        }, current)
    },
    reset: (row) => (current) =>
      layers.reduce((next, layer) => {
        const at = boardTarget(next, state.id)
        return keysOf(row).reduce((reset, key) => {
          const field = { kind: "style", key } as const
          return isInnerPath(layer.id)
            ? resetInner(reset, at, layer.id, library!, field)
            : resetOverride(reset, at, layer.id, field)
        }, next)
      }, current)
  }
}

function layoutOf(node: DesignNode | undefined): ParentLayout | undefined {
  if (node?.type !== "layout") return undefined
  const style = node.style ?? {}
  return { direction: style.direction ?? "column", grid: style.display === "grid" }
}

/** The style values every node shares, and the properties set differently on some of them. */
export function sharedStyle(nodes: readonly DesignNode[]): { common: NodeStyle; mixed: (keyof NodeStyle)[] } {
  const common: Record<string, unknown> = {}
  const mixed: (keyof NodeStyle)[] = []
  for (const name of styleKeys) {
    const values = nodes.map((node) => JSON.stringify(node.style?.[name]))
    if (values.every((value) => value === values[0])) {
      if (nodes[0]?.style?.[name] !== undefined) common[name] = nodes[0].style[name]
    } else mixed.push(name)
  }
  return { common: common as NodeStyle, mixed }
}

/**
 * A number field's edit of a style: the field's `update` (typed, scrubbed, or `Mixed+8`) applied to each layer's own
 * value (`read`), written back into its style (`write`).
 */
export function fieldEdit<V, K extends keyof NodeStyle>(
  read: (style: NodeStyle) => V,
  write: (value: V, style: NodeStyle) => Pick<StyleValues, K>,
  update: (value: V) => V
): StyleEdit<K> {
  return (style) => write(update(read(style)), style)
}

/** Switches the layout to a column, a row or a grid. A new grid keeps the columns it had, or two. */
export function layoutTypeEdit(mode: "row" | "column" | "grid"): StyleEdit<RowKey<"layoutType">> {
  if (mode === "grid") return (style) => ({ display: "grid", columns: style.columns ?? 2 })
  return { display: undefined, direction: mode }
}

type SideValues = [Length, Length, Length, Length]

/** Padding or margin as four sides, whichever form it's written in. */
export function sidesOf(value: Padding | undefined): SideValues | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) return [value, value, value, value]
  if (value.length === 2) return [value[0], value[1], value[0], value[1]]
  return value
}

/** The shortest form of four sides. */
export function tidySides([top, right, bottom, left]: SideValues): Padding {
  if (top === bottom && right === left) return top === right ? top : [top, right]
  return [top, right, bottom, left]
}

/** Some sides of padding or margin (0 is top, then clockwise), read from the first of them, in each layer's own. */
export function sidesField<N extends "padding" | "margin">(
  name: N,
  indices: readonly number[]
): {
  read: (style: NodeStyle) => Length | undefined
  write: (value: Length | undefined, style: NodeStyle) => Pick<StyleValues, N>
} {
  return {
    read: (style) => sidesOf(style[name])?.[indices[0]!],
    write: (value, style) => {
      const next = [...(sidesOf(style[name]) ?? [0, 0, 0, 0])] as SideValues
      for (const index of indices) next[index] = value ?? 0
      return { [name]: tidySides(next) } as Pick<StyleValues, N>
    }
  }
}

/** A layer's size along an axis as it shows: `grow` along the parent's direction shows, and is replaced, as fill. */
export function shownSize(
  style: NodeStyle,
  axis: "width" | "height",
  parent: ParentLayout | undefined
): Size | undefined {
  return grows(style, axis, parent) ? "fill" : style[axis]
}

function grows(style: NodeStyle, axis: "width" | "height", parent: ParentLayout | undefined): boolean {
  return style.grow === true && growsAlong(axis, parent)
}

/** A size's fixed length, or nothing when it's unset, fill or hug. */
export function fixedSize(size: Size | undefined): Length | undefined {
  return size === "fill" || size === "hug" ? undefined : size
}

/** Sets a size (fixed, fill, hug, or auto when undefined), replacing a `grow` that filled along it. */
export function sizeEdit<A extends "width" | "height">(
  axis: A,
  value: Size | undefined,
  parent: ParentLayout | undefined
): StyleEdit<RowKey<A>> {
  return (style) =>
    ({ [axis]: value, ...(grows(style, axis, parent) ? { grow: undefined } : {}) }) as Pick<StyleValues, RowKey<A>>
}

/**
 * A size's length field: it reads a fixed size, and a typed length makes the size fixed; clearing it puts a fixed size
 * back to auto and leaves fill or hug.
 */
export function sizeField<A extends "width" | "height">(
  axis: A,
  parent: ParentLayout | undefined
): {
  read: (style: NodeStyle) => Length | undefined
  write: (value: Length | undefined, style: NodeStyle) => Pick<StyleValues, RowKey<A>>
} {
  return {
    read: (style) => fixedSize(shownSize(style, axis, parent)),
    write: (value, style) => {
      const size = shownSize(style, axis, parent)
      return {
        [axis]: value ?? (fixedSize(size) === undefined ? size : undefined),
        ...(grows(style, axis, parent) ? { grow: undefined } : {})
      } as Pick<StyleValues, RowKey<A>>
    }
  }
}

/** Takes a layer out of the layout at its insets, 0 where unset, or puts it back and drops them. */
export function placementEdit(absolute: boolean): StyleEdit<RowKey<"placement">> {
  if (absolute) return (style) => ({ position: "absolute", top: style.top ?? 0, left: style.left ?? 0 })
  return { position: undefined, top: undefined, right: undefined, bottom: undefined, left: undefined }
}

/**
 * Puts the text layers of a selection in a sizing mode, each by its own parent and measured size, rounded up a step so
 * text fixed at it doesn't wrap again. Other layers are left alone.
 */
export function textSizingEdit(sizing: TextSizing): StyleEdit<RowKey<"resizing">> {
  return (style, layer) =>
    layer.type !== "text"
      ? {}
      : withTextSizing(
          style,
          sizing,
          { width: layer.measure("width", stepUp), height: layer.measure("height", stepUp) },
          { explicit: !layer.base, column: layer.column }
        )
}

/**
 * The whole step at or above a measured length. A thousandth of a step (0.004px at 4px) is measuring noise from the zoom
 * and the frame's scale: it's under the 1/64px browsers lay text out in, so a length truly past a step still rounds up.
 */
export function stepUp(steps: number): number {
  return Math.ceil(steps - 0.001)
}
