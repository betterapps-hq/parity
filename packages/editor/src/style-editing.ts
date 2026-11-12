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
  nodeLabel,
  type NodeStyle,
  type Padding,
  type Paint,
  resetInner,
  resetOverride,
  type Size,
  type StateSpec,
  styleKeys,
  targetPatches
} from "@parity-app/core"
import { editingState } from "./edit-frame.ts"
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
  return edit instanceof Function ? edit(style, layer) : edit
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
  layerOrder: ["zIndex"],
  fill: ["background"],
  radius: ["radius"],
  // The Shadow list holds the drop shadows that follow the shape too, which are the layer's `filter`.
  shadow: ["shadow", "filter"],
  filters: ["filter", "backdropFilter"],
  transform: ["transform"],
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
  case: ["textTransform"],
  lines: ["lines"]
} as const satisfies Record<string, readonly (keyof NodeStyle)[]>

/**
 * The Fill row's edit for a stack of paints, top first: nothing when it's empty, and one color token as the plain name
 * a single `background` has always held, so a file with one color reads as it did before stacks (PAR-931).
 */
export function fillEdit(paints: readonly Paint[]): Pick<StyleValues, "background"> {
  const [only] = paints

  if (!only) {
    return { background: undefined }
  }

  if (paints.length === 1 && only.kind === "solid" && only.alpha === undefined && !only.hidden) {
    return { background: only.color }
  }

  return { background: [...paints] }
}

export type StyleRow = keyof typeof styleRows

/** The keys a row edits. */
export type RowKey<R extends StyleRow> = (typeof styleRows)[R][number]

/**
 * A row's keys for a layer in `parent`: Width and Height each take `grow` only along the parent's direction, where it
 * fills, which is the width when there's no parent.
 */
export function rowKeys(row: StyleRow, parent: ParentLayout | undefined): readonly (keyof NodeStyle)[] {
  if (row !== "width" && row !== "height") {
    return styleRows[row]
  }

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
  /** What their layer order orders them within, when they share one: unknown inside an instance. */
  stacking: StackingContext | undefined
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

/**
 * The layer a layer's order (z-index) orders it within: the nearest around it that's a stacking context, because it
 * has a layer order or is see-through, as the render draws them, or else the design's root.
 */
export interface StackingContext {
  id: string
  name: string
  because: "root" | "layerOrder" | "opacity"
}

/** The stacking context of a layer with these layers around it, outermost first, each read as the board shows it. */
function stackingContext(
  ancestors: readonly DesignNode[],
  shown: (node: DesignNode) => DesignNode
): StackingContext | undefined {
  const of = (node: DesignNode, because: StackingContext["because"]) => ({
    id: node.id,
    name: nodeLabel(node),
    because
  })

  for (const around of [...ancestors].reverse()) {
    const { zIndex, opacity } = shown(around).style ?? {}

    if (zIndex !== undefined) {
      return of(around, "layerOrder")
    }

    if (opacity !== undefined && opacity < 100) {
      return of(around, "opacity")
    }
  }

  return ancestors[0] && of(ancestors[0], "root")
}

/** A layer's rendered length in spacing steps, by its id, rounded by `round`. */
export type LayerMeasure = (
  id: string,
  axis: "width" | "height",
  round: (steps: number) => number
) => number | undefined

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
  const contexts: (StackingContext | undefined)[] = []

  for (const id of ids) {
    if (isInnerPath(id)) {
      const inner = library && locateInner(container, id, library, view)

      if (!inner) {
        continue
      }

      const around = inner.location.ancestors.at(-1)
      const path = around && `${id.slice(0, id.lastIndexOf("/"))}/${around.id}`
      const parent = path ? (locateInner(container, path, library, view)?.shown ?? around) : undefined
      layers.push({ id, node: inner.shown, parent: layoutOf(parent), base: false })
      parentIds.push(path)
      contexts.push(undefined)
    } else {
      const location = locateNode(container.root, id)

      if (!location) {
        continue
      }

      const around = location.ancestors.at(-1)
      layers.push({ id, node: shown(location.node), parent: layoutOf(around && shown(around)), base: designBase })
      parentIds.push(around?.id)
      contexts.push(stackingContext(location.ancestors, shown))
    }
  }

  if (layers.length === 0) {
    return undefined
  }

  const { common, mixed } = sharedStyle(layers.map((layer) => layer.node))
  const parent = new Set(parentIds).size === 1 ? layers[0]!.parent : undefined
  const [stacking] = contexts
  const sameStacking = contexts.every((each) => each?.id === stacking?.id && each?.because === stacking?.because)

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
    stacking: sameStacking ? stacking : undefined,
    changed: (row) => changes.some((patch) => keysOf(row).some((key) => changesField(patch, { kind: "style", key }))),
    differs: (row) => keysOf(row).some((key) => mixed.includes(key)),
    edit: (_row, edit, measure) => {
      const values = layers.map((layer) =>
        // SAFETY: an edit of a row's keys is an edit of style keys; `StyleEdit` takes the keys only to check callers.
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
  if (node?.type !== "layout") {
    return undefined
  }

  const style = node.style ?? {}

  return { direction: style.direction ?? "column", grid: style.display === "grid" }
}

/** The style values several nodes share, and the properties set differently on some of them. */
export interface SharedStyle {
  common: NodeStyle
  mixed: (keyof NodeStyle)[]
}

/** The style values every node shares, and the properties set differently on some of them. */
export function sharedStyle(nodes: readonly DesignNode[]): SharedStyle {
  const common: NodeStyle = {}
  const mixed: (keyof NodeStyle)[] = []
  const first = nodes[0]?.style ?? {}

  for (const name of styleKeys) {
    const values = nodes.map((node) => JSON.stringify(node.style?.[name]))

    if (values.every((value) => value === values[0])) {
      copyStyleKey(first, common, name)
    } else {
      mixed.push(name)
    }
  }

  return { common, mixed }
}

/** Copies one style property, when it's set. */
function copyStyleKey<K extends keyof NodeStyle>(from: NodeStyle, to: NodeStyle, key: K): void {
  if (from[key] !== undefined) {
    to[key] = from[key]
  }
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
  if (mode === "grid") {
    return (style) => ({ display: "grid", columns: style.columns ?? 2 })
  }

  return { display: undefined, direction: mode }
}

type SideValues = [Length, Length, Length, Length]

/** Padding or margin as four sides, whichever form it's written in. */
export function sidesOf(value: Padding | undefined): SideValues | undefined {
  if (value === undefined) {
    return undefined
  }

  if (!Array.isArray(value)) {
    return [value, value, value, value]
  }

  if (value.length === 2) {
    return [value[0], value[1], value[0], value[1]]
  }

  return value
}

/** The shortest form of four sides. */
export function tidySides([top, right, bottom, left]: SideValues): Padding {
  if (top === bottom && right === left) {
    return top === right ? top : [top, right]
  }

  return [top, right, bottom, left]
}

/** A length field's view of a layer's style: the length it shows, and the style a typed length writes. */
export interface LengthField<K extends keyof NodeStyle> {
  read: (style: NodeStyle) => Length | undefined
  write: (value: Length | undefined, style: NodeStyle) => Pick<StyleValues, K>
}

/** Some sides of padding or margin (0 is top, then clockwise), read from the first of them, in each layer's own. */
export function sidesField<N extends "padding" | "margin">(name: N, indices: readonly number[]): LengthField<N> {
  return {
    read: (style) => sidesOf(style[name])?.[indices[0]!],
    write: (value, style) => {
      const [top, right, bottom, left] = sidesOf(style[name]) ?? [0, 0, 0, 0]
      const next: SideValues = [top, right, bottom, left]

      for (const index of indices) {
        next[index] = value ?? 0
      }

      // SAFETY: the one key set is `name`, which is N, and padding and margin both take the sides' Padding.
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
  return (style) => sizeValues(axis, value, grows(style, axis, parent))
}

/** A size along `axis`, and `grow` taken away when it filled along it: the keys of the axis' row. */
function sizeValues<A extends "width" | "height">(
  axis: A,
  value: Size | undefined,
  clearsGrow: boolean
): Pick<StyleValues, RowKey<A>> {
  const values = clearsGrow ? { [axis]: value, grow: undefined } : { [axis]: value }

  // SAFETY: the keys set are `axis`, which is A, and `grow`, which the width and the height rows both hold.
  return values as Pick<StyleValues, RowKey<A>>
}

/**
 * A size's length field: it reads a fixed size, and a typed length makes the size fixed; clearing it puts a fixed size
 * back to auto and leaves fill or hug.
 */
export function sizeField<A extends "width" | "height">(
  axis: A,
  parent: ParentLayout | undefined
): LengthField<RowKey<A>> {
  return {
    read: (style) => fixedSize(shownSize(style, axis, parent)),
    write: (value, style) => {
      const size = shownSize(style, axis, parent)

      return sizeValues(axis, value ?? (fixedSize(size) === undefined ? size : undefined), grows(style, axis, parent))
    }
  }
}

/** Takes a layer out of the layout at its insets, 0 where unset, or puts it back and drops them. */
export function placementEdit(absolute: boolean): StyleEdit<RowKey<"placement">> {
  if (absolute) {
    return (style) => ({ position: "absolute", top: style.top ?? 0, left: style.left ?? 0 })
  }

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
