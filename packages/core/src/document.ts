import { type ModeSettings, parseModeSettings } from "./modes.ts"
import {
  expectArray,
  expectBoolean,
  expectKnownKeys,
  expectNumber,
  expectObject,
  expectOneOf,
  expectString,
  compact,
  optional
} from "./validate.ts"

/**
 * A project file (`.par`): every design (screens and components), free text notes, and the project's modes. One file
 * per project keeps a design system in one place, like a Figma file.
 */
export interface CanvasDocument {
  version: 3
  containers: ContainerSpec[]
  /** The project's modes. Unset means the defaults. */
  modes?: ModeSettings
  /** Text placed on the canvas itself, outside any design: annotations, flow labels, explanations. */
  notes?: NoteSpec[]
  /** Where the person corrected which exports are components. Unset while detection gets them right. */
  detection?: DetectionCorrections
}

/** One of the app's exports, by its file relative to the project root and its export name (`default` for a default). */
export interface ComponentRef {
  path: string
  export: string
}

/** Exports the person put on the component list, and components they took off it, which detection then respects. */
export interface DetectionCorrections {
  include?: ComponentRef[]
  exclude?: ComponentRef[]
}

/**
 * The corrections after putting an export on the component list (`include`) or taking one off it (`exclude`). Doing the
 * opposite of an earlier correction removes it, so detection decides again. Unset when nothing is left to correct.
 */
export function correctDetection(
  corrections: DetectionCorrections | undefined,
  change: "include" | "exclude",
  ref: ComponentRef
): DetectionCorrections | undefined {
  const same = (other: ComponentRef) => other.path === ref.path && other.export === ref.export
  const opposite = change === "include" ? "exclude" : "include"
  const next: DetectionCorrections = { ...corrections }
  if (next[opposite]?.some(same)) next[opposite] = next[opposite].filter((other) => !same(other))
  else if (!next[change]?.some(same)) next[change] = [...(next[change] ?? []), ref]
  for (const kind of ["include", "exclude"] as const) if (next[kind]?.length === 0) delete next[kind]
  return next.include || next.exclude ? next : undefined
}

export interface NoteSpec {
  id: string
  text: string
  position: { x: number; y: number }
  /** Wraps at this width; unset notes grow with their text. */
  width?: number
}

/** A screen is a whole page or view; a component is a reusable piece that screens place as instances. */
export type ContainerKind = "screen" | "component"

/**
 * One design, like a Storybook CSF file. `root` is the design itself. States are authored and patch nodes (content,
 * props, visibility). Modes are project-wide (see `ModeSettings`); every design can be rendered in any of them, and
 * `view` records which ones this design shows next to its primary frame.
 */
export interface ContainerSpec {
  id: string
  name: string
  /** Defaults to `screen`. */
  kind?: ContainerKind
  position: { x: number; y: number }
  root: DesignNode
  states: StateSpec[]
  view?: ContainerViewSettings
  /** A component's inputs. Instances pass values for them; nodes inside bind to them. */
  params?: Record<string, ParamSpec>
  /**
   * Components this design sits inside when shown on its own board, outermost first, like a Storybook decorator: a
   * table row needs a table around it to render properly.
   */
  context?: { component: string; props?: Record<string, unknown> }[]
  /**
   * Frame sizes in CSS pixels, keyed by viewport option id. Without one, a frame is as wide as its mode's viewport and
   * as tall as its content.
   */
  frames?: Record<string, FrameSize>
}

export interface FrameSize {
  width?: number
  height?: number
}

/** One input of a component design. Its default is what the component shows on its own board. */
export interface ParamSpec {
  type: (typeof paramTypes)[number]
  /** A variant's default is the id of one of its options; unset means the first. */
  default?: unknown
  description?: string
  /** A variant's choices: size small, medium or large. Each option patches the design, the way a state does. */
  options?: VariantOption[]
}

/** One choice of a variant param, like "Large" for size. */
export interface VariantOption {
  id: string
  name: string
  /**
   * Patches keyed by node id, or by `instance/inner` for a node inside an instance. They apply over the design and
   * under its states.
   */
  overrides?: Record<string, NodePatch>
}

/** How a design is shown on the canvas. None of it changes the design itself. */
export interface ContainerViewSettings {
  /** The mode of the main frame. Defaults to the project's primary mode. */
  mode?: string
  /** Other modes shown beside the main frame. */
  modes?: string[]
  /** The state the canvas shows. Defaults to the first. */
  state?: string
  /** Show every state, one row each, instead of only the active one. */
  allStates?: boolean
  /** The option the board shows for each variant param, by option id. Unset ones show their default. */
  variants?: Record<string, string>
}

export interface StateSpec {
  id: string
  name: string
  /**
   * Patches keyed by node id, or by `instance/inner` for a node inside an instance. A state wins over a viewport's
   * responsive patch and over the design's variants.
   */
  overrides?: Record<string, NodePatch>
}

export type DesignNode = LayoutNode | ComponentNode | TextNode | InstanceNode | ImageNode

interface NodeBase {
  id: string
  name?: string
  hidden?: boolean
  style?: NodeStyle
  /**
   * Patches applied in one viewport, keyed by the viewport option id from the project's modes. Layout changes per
   * viewport live here, not in copies.
   */
  responsive?: Record<string, NodePatch>
  /**
   * Inside a component design: which of this node's values come from the component's params, so each instance can
   * show its own. `text` and `props` name a param; `visible` names a boolean param that shows or hides the node.
   */
  bind?: NodeBinding
}

export interface NodeBinding {
  text?: string
  props?: Record<string, string>
  visible?: string
}

/** A flex container. Layout is design-native, so every mode resolves it exactly, without media queries. */
export interface LayoutNode extends NodeBase {
  type: "layout"
  children: DesignNode[]
}

/** An instance of one of the project's own components. */
export interface ComponentNode extends NodeBase {
  type: "component"
  component: string
  props?: Record<string, unknown>
  /** Child nodes by slot. `children` is the default slot; other names become node-valued props. */
  slots?: Record<string, DesignNode[]>
}

/** A placed copy of one of the project's component designs, with values for its params. */
export interface InstanceNode extends NodeBase {
  type: "instance"
  /** The component design's id. */
  design: string
  args?: Record<string, unknown>
  /** Which of the component's states this copy shows. */
  state?: string
  /**
   * What this copy changes inside the component, keyed by the inner node's id, or `nested/inner` for a node inside a
   * nested instance. The copy stays linked: everything it doesn't change follows the component.
   */
  overrides?: Record<string, NodePatch>
}

export interface TextNode extends NodeBase {
  type: "text"
  text: string
  tag?: (typeof textTags)[number]
}

/** A picture: a file in the project, or a photo from a stock library saved into it. */
export interface ImageNode extends NodeBase {
  type: "image"
  /** A URL, or a path the project's dev server serves, like `/images/photo.jpg`. */
  src: string
  alt?: string
  /** How it fills its box: cropped to cover it (the default), shown whole, or stretched. */
  fit?: (typeof imageFits)[number]
  /** Who made it and where it came from, for photos that ask to be credited. */
  credit?: ImageCredit
}

export interface ImageCredit {
  name: string
  url: string
  /** The library it came from. */
  source?: string
}

/**
 * Visual properties, locked to the project's tokens: lengths are steps of the spacing scale (multiples of `--spacing`)
 * or name a length token, and colors, radii, shadows and type values name one of the project's CSS custom properties
 * (without `--`). Layout is Figma's auto layout, a flex box, or a grid; children size themselves to fill, hug, or a
 * fixed length.
 */
export interface NodeStyle {
  // Layout (layouts only).
  /** Auto layout (flex, the default) or a grid. */
  display?: "flex" | "grid"
  direction?: "row" | "column"
  /** A grid's columns, all the same width; or rows, all the same height. */
  columns?: number
  rows?: number
  gap?: Length
  /** In a grid or wrapping layout, the gap between rows when it differs from `gap`. */
  rowGap?: Length
  /** All sides, `[vertical, horizontal]`, or `[top, right, bottom, left]`. */
  padding?: Padding
  /** Space outside the node, in the same forms as padding. */
  margin?: Padding
  /** Children on the cross axis. */
  align?: (typeof alignments)[number]
  /** Children on the main axis. */
  justify?: (typeof justifications)[number]
  wrap?: boolean

  // Size, within the parent's layout.
  width?: Size
  height?: Size
  minWidth?: Length
  maxWidth?: Length
  minHeight?: Length
  maxHeight?: Length
  /** Grid cells the node spans, in a grid. */
  colSpan?: number
  rowSpan?: number
  /** Fill along the parent's direction. Same as `fill` for the parent's main axis. */
  grow?: boolean
  /** Where this node sits on its parent's cross axis, overriding the parent's `align`. */
  self?: (typeof alignments)[number]

  // Position: taken out of the layout and placed against the parent's edges.
  position?: "absolute"
  top?: Length
  right?: Length
  bottom?: Length
  left?: Length

  // Appearance.
  background?: string
  foreground?: string
  /** Border color. */
  border?: string
  /** Border width in pixels, as in Tailwind: 0, 1, 2, 4 or 8. */
  borderWidth?: number
  borderStyle?: "solid" | "dashed" | "dotted"
  radius?: string
  shadow?: string
  /** Percent, 0 to 100. */
  opacity?: number
  overflow?: "visible" | "hidden" | "scroll"

  // Type. Set on a layout, it applies to the text inside.
  font?: string
  size?: string
  weight?: number
  leading?: string
  tracking?: string
  textAlign?: "start" | "center" | "end" | "justify"
  transform?: "uppercase" | "lowercase" | "capitalize"
  decoration?: "underline" | "line-through"
  italic?: boolean
  /** Lines of text before it's cut off with an ellipsis. */
  lines?: number
}

/** Steps of the spacing scale (`4` is `calc(var(--spacing) * 4)`), or the name of a length token. */
export type Length = number | string

/** A fixed length, or fill the parent, or hug the content. */
export type Size = Length | "fill" | "hug"

export type Padding = Length | [Length, Length] | [Length, Length, Length, Length]

export interface NodePatch {
  hidden?: boolean
  text?: string
  props?: Record<string, unknown>
  style?: NodeStyle
}

const textTags = ["p", "span", "h1", "h2", "h3", "h4", "strong"] as const
export const imageFits = ["cover", "contain", "fill"] as const
export const paramTypes = ["text", "boolean", "number", "value", "variant"] as const
const alignments = ["start", "center", "end", "stretch"] as const
const justifications = ["start", "center", "end", "between", "around", "evenly"] as const
/** Every style key, in the order panels show them. */
export const styleKeys = [
  "display",
  "direction",
  "columns",
  "rows",
  "gap",
  "rowGap",
  "padding",
  "margin",
  "align",
  "justify",
  "wrap",
  "width",
  "height",
  "minWidth",
  "maxWidth",
  "minHeight",
  "maxHeight",
  "colSpan",
  "rowSpan",
  "grow",
  "self",
  "position",
  "top",
  "right",
  "bottom",
  "left",
  "background",
  "foreground",
  "border",
  "borderWidth",
  "borderStyle",
  "radius",
  "shadow",
  "opacity",
  "overflow",
  "font",
  "size",
  "weight",
  "leading",
  "tracking",
  "textAlign",
  "transform",
  "decoration",
  "italic",
  "lines"
] as const satisfies readonly (keyof NodeStyle)[]

/** Calls `visit` for every node in a tree, depth first, including nodes in slots. */
export function walkNodes(node: DesignNode, visit: (node: DesignNode, depth: number) => void, depth = 0): void {
  visit(node, depth)
  const children =
    node.type === "layout" ? node.children : node.type === "component" ? Object.values(node.slots ?? {}).flat() : []
  for (const child of children) walkNodes(child, visit, depth + 1)
}

export function parseCanvasDocument(value: unknown): CanvasDocument {
  const document = expectObject(value, "")
  if (document.version !== 3) throw new TypeError("/version: expected 3")
  expectKnownKeys(document, ["version", "containers", "notes", "modes", "detection"], "")
  return compact({
    version: 3 as const,
    containers: expectArray(document.containers, "/containers").map((item, index) =>
      parseContainer(item, `/containers/${index}`)
    ),
    modes: optional(document.modes, (value) => parseModeSettings(value)),
    notes: optional(document.notes, (value) =>
      expectArray(value, "/notes").map((item, index) => parseNote(item, `/notes/${index}`))
    ),
    detection: optional(document.detection, (value) => parseDetection(value, "/detection"))
  })
}

function parseDetection(value: unknown, path: string): DetectionCorrections {
  const detection = expectObject(value, path)
  expectKnownKeys(detection, ["include", "exclude"], path)
  const refs = (list: unknown, at: string) =>
    expectArray(list, at).map((item, index) => {
      const ref = expectObject(item, `${at}/${index}`)
      expectKnownKeys(ref, ["path", "export"], `${at}/${index}`)
      return {
        path: expectString(ref.path, `${at}/${index}/path`),
        export: expectString(ref.export, `${at}/${index}/export`)
      }
    })
  return compact({
    include: optional(detection.include, (list) => refs(list, `${path}/include`)),
    exclude: optional(detection.exclude, (list) => refs(list, `${path}/exclude`))
  })
}

function parseNote(value: unknown, path: string): NoteSpec {
  const note = expectObject(value, path)
  expectKnownKeys(note, ["id", "text", "position", "width"], path)
  const position = expectObject(note.position, `${path}/position`)
  return compact({
    id: expectString(note.id, `${path}/id`),
    text: expectString(note.text, `${path}/text`),
    position: { x: expectNumber(position.x, `${path}/position/x`), y: expectNumber(position.y, `${path}/position/y`) },
    width: optional(note.width, (v) => expectNumber(v, `${path}/width`))
  })
}

function parseContainer(value: unknown, path: string): ContainerSpec {
  const container = expectObject(value, path)
  expectKnownKeys(
    container,
    ["id", "name", "kind", "position", "root", "states", "view", "params", "context", "frames"],
    path
  )
  const position = expectObject(container.position, `${path}/position`)
  const view = optional(container.view, (v) => {
    const settings = expectObject(v, `${path}/view`)
    expectKnownKeys(settings, ["mode", "modes", "state", "allStates", "variants"], `${path}/view`)
    return compact({
      mode: optional(settings.mode, (mode) => expectString(mode, `${path}/view/mode`)),
      modes: optional(settings.modes, (list) =>
        expectArray(list, `${path}/view/modes`).map((mode, index) => expectString(mode, `${path}/view/modes/${index}`))
      ),
      state: optional(settings.state, (state) => expectString(state, `${path}/view/state`)),
      allStates: optional(settings.allStates, (all) => expectBoolean(all, `${path}/view/allStates`)),
      variants: optional(settings.variants, (choices) => {
        const variants: Record<string, string> = {}
        for (const [param, option] of Object.entries(expectObject(choices, `${path}/view/variants`))) {
          variants[param] = expectString(option, `${path}/view/variants/${param}`)
        }
        return variants
      })
    })
  })

  const ids = new Set<string>()
  const root = parseNode(container.root, `${path}/root`, ids)
  const states = expectArray(container.states, `${path}/states`).map((item, index) => {
    const at = `${path}/states/${index}`
    const state = expectObject(item, at)
    expectKnownKeys(state, ["id", "name", "overrides"], at)
    return {
      id: expectString(state.id, `${at}/id`),
      name: expectString(state.name, `${at}/name`),
      overrides: optional(state.overrides, (v) => parsePatches(v, `${at}/overrides`, ids))
    }
  })
  if (states.length === 0) throw new TypeError(`${path}/states: expected at least one state`)

  return compact({
    id: expectString(container.id, `${path}/id`),
    name: expectString(container.name, `${path}/name`),
    kind: optional(container.kind, (v) => expectOneOf(v, ["screen", "component"] as const, `${path}/kind`)),
    context: optional(container.context, (v) =>
      expectArray(v, `${path}/context`).map((item, index) => {
        const at = `${path}/context/${index}`
        const wrapper = expectObject(item, at)
        expectKnownKeys(wrapper, ["component", "props"], at)
        return compact({
          component: expectString(wrapper.component, `${at}/component`),
          props: optional(wrapper.props, (p) => expectObject(p, `${at}/props`))
        })
      })
    ),
    params: optional(container.params, (v) => {
      const params: Record<string, ParamSpec> = {}
      for (const [name, entry] of Object.entries(expectObject(v, `${path}/params`))) {
        const at = `${path}/params/${name}`
        const param = expectObject(entry, at)
        expectKnownKeys(param, ["type", "default", "description", "options"], at)
        const type = expectOneOf(param.type, paramTypes, `${at}/type`)
        const options = optional(param.options, (list) => {
          const seen = new Set<string>()
          return expectArray(list, `${at}/options`).map((item, index) => {
            const where = `${at}/options/${index}`
            const option = expectObject(item, where)
            expectKnownKeys(option, ["id", "name", "overrides"], where)
            const id = expectString(option.id, `${where}/id`)
            if (seen.has(id)) throw new TypeError(`${where}/id: duplicate option id "${id}"`)
            seen.add(id)
            return compact({
              id,
              name: expectString(option.name, `${where}/name`),
              overrides: optional(option.overrides, (v) => parsePatches(v, `${where}/overrides`, ids))
            })
          })
        })
        if (type === "variant" && !options?.length) throw new TypeError(`${at}/options: a variant needs options`)
        if (type !== "variant" && options) throw new TypeError(`${at}/options: only variants have options`)
        params[name] = compact({
          type,
          default: param.default,
          description: optional(param.description, (d) => expectString(d, `${at}/description`)),
          options
        })
      }
      return params
    }),
    frames: optional(container.frames, (v) => {
      const frames: Record<string, FrameSize> = {}
      for (const [viewport, entry] of Object.entries(expectObject(v, `${path}/frames`))) {
        const at = `${path}/frames/${viewport}`
        const size = expectObject(entry, at)
        expectKnownKeys(size, ["width", "height"], at)
        frames[viewport] = compact({
          width: optional(size.width, (w) => expectNumber(w, `${at}/width`)),
          height: optional(size.height, (h) => expectNumber(h, `${at}/height`))
        })
      }
      return frames
    }),
    position: { x: expectNumber(position.x, `${path}/position/x`), y: expectNumber(position.y, `${path}/position/y`) },
    root,
    states,
    view
  })
}

/** Validates one node tree on its own, as agents insert them. */
export function parseDesignNode(value: unknown, path = ""): DesignNode {
  return parseNode(value, path, new Set())
}

/** Validates a state's or viewport's patch on its own. */
export function parseNodePatch(value: unknown, path = ""): NodePatch {
  return parsePatch(value, path)
}

function parseNode(value: unknown, path: string, ids: Set<string>): DesignNode {
  const node = expectObject(value, path)
  const type = expectOneOf(node.type, ["layout", "component", "text", "instance", "image"] as const, `${path}/type`)
  const id = expectString(node.id, `${path}/id`)
  if (ids.has(id)) throw new TypeError(`${path}/id: duplicate node id "${id}"`)
  ids.add(id)
  const base = compact({
    id,
    name: optional(node.name, (v) => expectString(v, `${path}/name`)),
    hidden: optional(node.hidden, (v) => expectBoolean(v, `${path}/hidden`)),
    style: optional(node.style, (v) => parseStyle(v, `${path}/style`)),
    responsive: optional(node.responsive, (v) => parsePatches(v, `${path}/responsive`)),
    bind: optional(node.bind, (v) => parseBinding(v, `${path}/bind`))
  })
  const common = ["type", "id", "name", "hidden", "style", "responsive", "bind"]
  switch (type) {
    case "layout":
      expectKnownKeys(node, [...common, "children"], path)
      return {
        ...base,
        type,
        children: expectArray(node.children, `${path}/children`).map((child, index) =>
          parseNode(child, `${path}/children/${index}`, ids)
        )
      }
    case "component": {
      expectKnownKeys(node, [...common, "component", "props", "slots"], path)
      const slots = optional(node.slots, (v) => {
        const result: Record<string, DesignNode[]> = {}
        for (const [slot, children] of Object.entries(expectObject(v, `${path}/slots`))) {
          result[slot] = expectArray(children, `${path}/slots/${slot}`).map((child, index) =>
            parseNode(child, `${path}/slots/${slot}/${index}`, ids)
          )
        }
        return result
      })
      return {
        ...base,
        type,
        component: expectString(node.component, `${path}/component`),
        props: optional(node.props, (v) => expectObject(v, `${path}/props`)),
        slots
      }
    }
    case "instance":
      expectKnownKeys(node, [...common, "design", "args", "state", "overrides"], path)
      return compact({
        ...base,
        type,
        design: expectString(node.design, `${path}/design`),
        args: optional(node.args, (v) => expectObject(v, `${path}/args`)),
        state: optional(node.state, (v) => expectString(v, `${path}/state`)),
        overrides: optional(node.overrides, (v) => parsePatches(v, `${path}/overrides`))
      })
    case "text":
      expectKnownKeys(node, [...common, "text", "tag"], path)
      return {
        ...base,
        type,
        text: expectString(node.text, `${path}/text`),
        tag: optional(node.tag, (v) => expectOneOf(v, textTags, `${path}/tag`))
      }
    case "image":
      expectKnownKeys(node, [...common, "src", "alt", "fit", "credit"], path)
      return compact({
        ...base,
        type,
        src: expectString(node.src, `${path}/src`),
        alt: optional(node.alt, (v) => expectString(v, `${path}/alt`)),
        fit: optional(node.fit, (v) => expectOneOf(v, imageFits, `${path}/fit`)),
        credit: optional(node.credit, (v) => {
          const credit = expectObject(v, `${path}/credit`)
          expectKnownKeys(credit, ["name", "url", "source"], `${path}/credit`)
          return compact({
            name: expectString(credit.name, `${path}/credit/name`),
            url: expectString(credit.url, `${path}/credit/url`),
            source: optional(credit.source, (s) => expectString(s, `${path}/credit/source`))
          })
        })
      })
  }
}

function parseBinding(value: unknown, path: string): NodeBinding {
  const binding = expectObject(value, path)
  expectKnownKeys(binding, ["text", "props", "visible"], path)
  return compact({
    text: optional(binding.text, (v) => expectString(v, `${path}/text`)),
    visible: optional(binding.visible, (v) => expectString(v, `${path}/visible`)),
    props: optional(binding.props, (v) => {
      const props: Record<string, string> = {}
      for (const [prop, param] of Object.entries(expectObject(v, `${path}/props`))) {
        props[prop] = expectString(param, `${path}/props/${prop}`)
      }
      return props
    })
  })
}

/**
 * Patches keyed by node id. With `ids`, each key must name a node of the design, or start with one: `instance/inner`
 * reaches inside an instance, which can't be checked without the component.
 */
function parsePatches(value: unknown, path: string, ids?: Set<string>): Record<string, NodePatch> {
  const patches: Record<string, NodePatch> = {}
  for (const [key, entry] of Object.entries(expectObject(value, path))) {
    if (ids && !ids.has(key.split("/")[0]!)) throw new TypeError(`${path}/${key}: no node has this id`)
    patches[key] = parsePatch(entry, `${path}/${key}`)
  }
  return patches
}

function parsePatch(value: unknown, path: string): NodePatch {
  const patch = expectObject(value, path)
  expectKnownKeys(patch, ["hidden", "text", "props", "style"], path)
  return compact({
    hidden: optional(patch.hidden, (v) => expectBoolean(v, `${path}/hidden`)),
    text: optional(patch.text, (v) => expectString(v, `${path}/text`)),
    props: optional(patch.props, (v) => expectObject(v, `${path}/props`)),
    style: optional(patch.style, (v) => parseStyle(v, `${path}/style`))
  })
}

function parseStyle(value: unknown, path: string): NodeStyle {
  const style = expectObject(value, path)
  const at = (key: string) => `${path}/${key}`
  const token = (key: string) => optional(style[key], (v) => expectString(v, at(key)))
  const number = (key: string) => optional(style[key], (v) => expectNumber(v, at(key)))
  const flag = (key: string) => optional(style[key], (v) => expectBoolean(v, at(key)))
  const lengthAt = (v: unknown, where: string): Length => (typeof v === "number" ? v : expectString(v, where))
  const length = (key: string) => optional(style[key], (v) => lengthAt(v, at(key)))
  const size = (key: string) => optional(style[key], (v): Size => lengthAt(v, at(key)))
  const sides = (key: string) =>
    optional(style[key], (v): Padding => {
      if (!Array.isArray(v)) return lengthAt(v, at(key))
      if (v.length !== 2 && v.length !== 4) {
        throw new TypeError(`${at(key)}: expected a length, [vertical, horizontal] or [top, right, bottom, left]`)
      }
      return v.map((side, index) => lengthAt(side, `${at(key)}/${index}`)) as Padding
    })
  expectKnownKeys(style, styleKeys, path)
  return compact({
    display: optional(style.display, (v) => expectOneOf(v, ["flex", "grid"] as const, at("display"))),
    direction: optional(style.direction, (v) => expectOneOf(v, ["row", "column"] as const, at("direction"))),
    columns: number("columns"),
    rows: number("rows"),
    gap: length("gap"),
    rowGap: length("rowGap"),
    padding: sides("padding"),
    margin: sides("margin"),
    align: optional(style.align, (v) => expectOneOf(v, alignments, at("align"))),
    justify: optional(style.justify, (v) => expectOneOf(v, justifications, at("justify"))),
    wrap: flag("wrap"),
    width: size("width"),
    height: size("height"),
    minWidth: length("minWidth"),
    maxWidth: length("maxWidth"),
    minHeight: length("minHeight"),
    maxHeight: length("maxHeight"),
    colSpan: number("colSpan"),
    rowSpan: number("rowSpan"),
    grow: flag("grow"),
    self: optional(style.self, (v) => expectOneOf(v, alignments, at("self"))),
    position: optional(style.position, (v) => expectOneOf(v, ["absolute"] as const, at("position"))),
    top: length("top"),
    right: length("right"),
    bottom: length("bottom"),
    left: length("left"),
    background: token("background"),
    foreground: token("foreground"),
    border: token("border"),
    borderWidth: number("borderWidth"),
    borderStyle: optional(style.borderStyle, (v) =>
      expectOneOf(v, ["solid", "dashed", "dotted"] as const, at("borderStyle"))
    ),
    radius: token("radius"),
    shadow: token("shadow"),
    opacity: number("opacity"),
    overflow: optional(style.overflow, (v) => expectOneOf(v, ["visible", "hidden", "scroll"] as const, at("overflow"))),
    font: token("font"),
    size: token("size"),
    weight: number("weight"),
    leading: token("leading"),
    tracking: token("tracking"),
    textAlign: optional(style.textAlign, (v) =>
      expectOneOf(v, ["start", "center", "end", "justify"] as const, at("textAlign"))
    ),
    transform: optional(style.transform, (v) =>
      expectOneOf(v, ["uppercase", "lowercase", "capitalize"] as const, at("transform"))
    ),
    decoration: optional(style.decoration, (v) =>
      expectOneOf(v, ["underline", "line-through"] as const, at("decoration"))
    ),
    italic: flag("italic"),
    lines: number("lines")
  })
}
