import {
  type CssDeclaration,
  declarations,
  type Direction,
  isHug,
  type LayerKind,
  type NodeStyle,
  type StyleContext
} from "@parity-app/style-schema"
import { z } from "zod"
import type { FrameViewport } from "./adapters.ts"
import { screenHeightForWidth } from "./devices.ts"
import {
  type ComponentNode,
  type ContainerSpec,
  type DesignNode,
  designStates,
  type FrameSize,
  type InstanceNode,
  isAccessibilityProp,
  type NodePatch,
  type ParamSpec,
  type PatchUnset,
  type PropValues,
  type StateSpec,
  type VideoNode
} from "./document.ts"
import type { ResolvedMode } from "./modes.ts"
import { isComposite } from "./values/evaluate.ts"

/**
 * A design resolved for one state in one viewport: what a renderer adapter mounts. Framework-neutral: elements are
 * plain DOM, each with the CSS declarations a frame draws it from as rules (`frameRules`), and components are the
 * project's own, by id.
 */
export type RenderNode = RenderElement | { kind: "text"; text: string } | RenderComponent

/** A plain DOM element, and the CSS it's drawn with. */
export interface RenderElement {
  kind: "element"
  nodeId: string
  tag: string
  /**
   * The layer's style as CSS declarations, one for each property in the order they're written. A frame draws them as
   * a rule for the node, not as an inline style, so a rule can also hold what an inline style can't, such as a state.
   */
  declarations: CssDeclaration[]
  /**
   * The classes of the project's styling framework that draw the declarations instead, where its own compiler wrote
   * every one of them (`withClasses`). A frame gives the element these and no rule.
   */
  classes?: string[]
  children: RenderNode[]
  /** HTML attributes beyond the style, like an image's `src` and `alt`. */
  attributes?: ElementAttributes
}

/** One of the project's own components, by id, with its props and what fills its slots. */
export interface RenderComponent {
  kind: "component"
  nodeId: string
  component: string
  props: PropValues
  slots: Record<string, RenderNode[]>
}

/** CSS properties by their camel-cased names, as the inline style a component's `style` prop takes. */
export interface InlineStyle {
  [property: string]: string
}

/** HTML attributes by name. */
export interface ElementAttributes {
  [name: string]: string
}

/**
 * Marks the element of a layout that draws nothing inside it, in this state and viewport, so the canvas can give it a
 * size of its own there, which no other empty element, such as a component's divider, gets. Its value lists the axes,
 * `width` and `height`, that the design gives no length of its own: along those the canvas gives it a least size, and
 * along the others it keeps the design's, so an empty layout used as an 8px spacer stays 8px. Filling and growing
 * aren't lengths, since in a grid, or with no space to share, they leave an empty layout at nothing. On an instance,
 * the instance's own length counts too. Only what's resolved for a frame carries it.
 */
export const emptyLayoutAttribute = "data-canvas-empty-layout"

type Axis = "width" | "height"

/**
 * A resolved tree without `emptyLayoutAttribute`, so its empty layouts draw as the project's code draws them: a frame
 * that isn't edited, such as a screenshot or an export, gives them no size or outline of their own (PAR-888). The tree
 * given is left as it is.
 */
export function withoutEmptyLayoutMarks(tree: readonly RenderNode[]): RenderNode[] {
  return tree.map((node): RenderNode => {
    if (node.kind === "component") {
      const slots = Object.entries(node.slots).map(([slot, children]) => [slot, withoutEmptyLayoutMarks(children)])

      return { ...node, slots: Object.fromEntries(slots) }
    }

    if (node.kind !== "element") {
      return node
    }

    const { attributes, ...rest } = node
    const unmarked: RenderNode = { ...rest, children: withoutEmptyLayoutMarks(node.children) }
    const kept = Object.entries(attributes ?? {}).filter(([name]) => name !== emptyLayoutAttribute)

    if (kept.length > 0) {
      unmarked.attributes = Object.fromEntries(kept)
    }

    return unmarked
  })
}

/** The axes a style gives no fixed length or least length. */
function unsizedAxes(style: NodeStyle): Axis[] {
  return (["width", "height"] as const).filter((axis) => {
    const size = style[axis]
    const least = axis === "width" ? style.minWidth : style.minHeight

    return (size === undefined || "size" in size) && least === undefined
  })
}

/** Every component a resolved tree draws, by id, outermost first, as often as it's drawn. */
export function renderedComponents(tree: readonly RenderNode[]): string[] {
  return tree.flatMap((node) => {
    if (node.kind === "component") {
      return [node.component, ...Object.values(node.slots).flatMap(renderedComponents)]
    }

    return node.kind === "element" ? renderedComponents(node.children) : []
  })
}

/** Component designs by id, for expanding instances. */
export type ComponentLibrary = ReadonlyMap<string, ContainerSpec>

/** What a design's own board renders: its root, inside the components it needs around it. */
export function boardRoot(design: ContainerSpec): DesignNode {
  return (design.context ?? []).reduceRight<DesignNode>(contextWrapper, design.root)
}

/** One of the components a design's board draws around it, as a node holding what's inside it. */
function contextWrapper(
  inner: DesignNode,
  wrapper: NonNullable<ContainerSpec["context"]>[number],
  index: number
): ComponentNode {
  const id = `context-${index}`
  const slots = { children: [inner] }

  return wrapper.props
    ? { type: "component", id, component: wrapper.component, props: wrapper.props, slots }
    : { type: "component", id, component: wrapper.component, slots }
}

/**
 * Whether a screen fits its content: its root layout hugs its content's width, so each mode's frame is as wide as what
 * it draws, in a window as wide as the mode's viewport, as Storybook draws a story at its own size in a full-width
 * window. The width each mode's frame is drawn at is kept in `frames`, as the canvas measures it. A frame has a size of
 * its own and hugs its content there instead (the editor's `hugsContent`), in a window as wide as itself.
 */
export function fitsContent(design: ContainerSpec): boolean {
  return (design.kind ?? "screen") === "screen" && design.root.type === "layout" && isHug(design.root.style?.width)
}

/**
 * The size a design's frame is drawn at in a mode: the design's own size for the mode's viewport if it has one, else
 * as wide as the viewport and as tall as its content (no height). A frame has one size of its own, whatever the mode.
 * A screen that fits its content (`fitsContent`) is drawn as wide as it was measured in that mode, and never fixes its
 * height.
 */
export function frameSize(design: ContainerSpec, mode: Pick<ResolvedMode, "viewport" | "width">): DrawnFrameSize {
  if (fitsContent(design)) {
    return { width: design.frames?.[mode.viewport]?.width ?? mode.width }
  }

  const size = design.kind === "frame" ? design.size : design.frames?.[mode.viewport]
  const drawn: DrawnFrameSize = { width: size?.width ?? mode.width }

  if (size?.height !== undefined) {
    drawn.height = size.height
  }

  return drawn
}

/** The size a frame is drawn at: always a width, and a height only when the frame doesn't grow with its content. */
export interface DrawnFrameSize extends FrameSize {
  width: number
}

/**
 * The browser window a frame stands for, which viewport units, media queries and the project's own code measure: as wide
 * as the frame, and as tall as the frame's fixed height, else its viewport's screen, else the device nearest its width.
 * A frame that grows with its content is still drawn whole; this is only how tall its window is.
 */
export function frameViewport(size: DrawnFrameSize, mode: Pick<ResolvedMode, "options">): FrameViewport {
  const screen = mode.options.find(({ variable }) => variable.kind === "viewport")?.option.height

  return { width: size.width, height: size.height ?? screen ?? screenHeightForWidth(size.width) }
}

/**
 * A design's frame in a mode, as every renderer draws it: the live frame on the canvas, its bitmap zoomed out, and the
 * offscreen frames that agents measure, screenshot and check, and that the editor exports and audits. Two heights are
 * kept apart. `height` is the frame's own: when it's set the frame is that tall and clips what's below, and without it
 * the frame grows with its content. `viewport` is the browser window the frame stands for (see `frameViewport`), which
 * always has a height, whether or not the frame grows past it.
 */
export interface FrameGeometry {
  width: number
  /** A fixed frame height, which clips; otherwise the frame is as tall as its content. */
  height?: number
  viewport: FrameViewport
}

/** How a design's frame is drawn in a mode: its size and the window it stands for. */
export function frameGeometry(
  design: ContainerSpec,
  mode: Pick<ResolvedMode, "viewport" | "width" | "options">
): FrameGeometry {
  const size = frameSize(design, mode)
  // A screen that fits its content is drawn in the mode's whole window, however narrow its frame is.
  const window = fitsContent(design) ? { width: mode.width } : size

  return { ...size, viewport: frameViewport(window, mode) }
}

/** Every design that instances can place, by id. */
export function componentLibrary(designs: Iterable<ContainerSpec>): ComponentLibrary {
  return new Map([...designs].map((design) => [design.id, design]))
}

/**
 * Every design a project's instances can place: its libraries' component designs (from their `.lib.par` canvases),
 * then its own, which come last so one with a library design's id wins. The canvas and agents' renders both build
 * their library with this, so an instance resolves the same way in each.
 */
export function projectComponentLibrary(
  libraryDesigns: Iterable<ContainerSpec>,
  own: Iterable<ContainerSpec>
): ComponentLibrary {
  return componentLibrary([...libraryDesigns, ...own])
}

/** The part of an instance node that names the design it places. */
const placement = z.object({ type: z.literal("instance"), design: z.string() })

/** Designs are replaced rather than changed, so what a design places is worked out once per design. */
const placedBy = new WeakMap<ContainerSpec, readonly string[]>()

/** The ids of the designs a design's instances place, anywhere in it: its tree, its states and its params. */
export function placedDesigns(design: ContainerSpec): readonly string[] {
  let placed = placedBy.get(design)

  if (!placed) {
    const found = new Set<string>()

    // Every value anywhere in the design, whichever field holds it, so an instance in a field this code doesn't know
    // of yet, such as one a state adds, is found too. The replacer sees each value before the ones inside it.
    JSON.stringify(design, (_key, value) => {
      const node = placement.safeParse(value)

      if (node.success) {
        found.add(node.data.design)
      }

      return value
    })

    placed = [...found]
    placedBy.set(design, placed)
  }

  return placed
}

/**
 * The part of a library one design's instances reach, directly or through the designs they place: all it needs to be
 * resolved. Given what it returned for the design last time, it returns that same library while none of those designs
 * has changed, so a board on the canvas can tell that an edit to another design doesn't touch it.
 */
export function reachableLibrary(
  design: ContainerSpec,
  library: ComponentLibrary,
  previous?: ComponentLibrary
): ComponentLibrary {
  const reached = new Map<string, ContainerSpec>()

  const visit = (current: ContainerSpec) => {
    for (const id of placedDesigns(current)) {
      const placed = library.get(id)

      if (!placed || reached.has(id)) {
        continue
      }

      reached.set(id, placed)
      visit(placed)
    }
  }

  visit(design)
  const same = previous?.size === reached.size && [...reached].every(([id, placed]) => previous.get(id) === placed)

  return same ? previous : reached
}

interface Scope extends EvalScope {
  /** Ids inside an instance are prefixed with the instance's, so every rendered node stays unique. */
  prefix: string
  /** Component designs being expanded, to stop a component from containing itself. */
  stack: string[]
  /**
   * Inside an instance's component: what the instance fills a slot with, drawn as the design around it draws its own
   * layers, so they keep their ids there. Undefined when the instance leaves the slot to its placeholder.
   */
  fills?: (slot: string, parent: Direction) => RenderNode[] | undefined
}

/**
 * Patches keyed by node id, or by `instance/inner` for nodes inside an instance. A design is shown through a list of
 * them, later ones winning: its variants, then its state. Inside an instance: the component's variants and state, then
 * what the instance overrides, then whatever reaches in from outside.
 */
export type PatchLayer = Record<string, NodePatch> | undefined

/** Which params of a design are variants, and the option of each to show. */
export interface VariantView {
  params?: Record<string, ParamSpec>
  /** Option ids by param. Missing or unknown ones show the param's default, else its first option. */
  choices?: PropValues
}

/**
 * Applies the variants', the state's and the viewport's responsive patches, as `nodePatch` orders them, maps tokens to
 * CSS, and expands instances of component designs with their args bound.
 */
export function resolveDesign(
  root: DesignNode,
  state: StateSpec | undefined,
  viewportId: string,
  library: ComponentLibrary = new Map(),
  variants: VariantView = {}
): RenderNode[] {
  return resolveTree(root, viewportId, library, {
    ...boardScope(variants.params, variants.choices, state),
    prefix: "",
    stack: []
  })
}

/**
 * What a design is evaluated in: the state it shows, the option of each variant by param (as `view.variants` has
 * them), the viewport whose responsive patches apply, and the component designs its instances place. A state left out
 * is the base, variants left out are the ones the design's board shows, and a viewport left out applies no responsive
 * patches.
 */
export interface EvalContext {
  state?: StateSpec
  variants?: PropValues
  viewport?: string
  library?: ComponentLibrary
}

/** The patches a scope's nodes are shown through, and the values their bound params take. */
export interface EvalScope {
  /** Later layers win. On a board: the chosen variant options in param order, then the state. */
  layers: PatchLayer[]
  /** On a board: each param's default, then the variant options shown, as `boardArgs` gives them. */
  args?: PropValues
}

/** The layers and args a design's own nodes are evaluated with in a context. */
export function scopeOf(container: ContainerSpec, context: EvalContext = {}): EvalScope {
  return boardScope(container.params, context.variants ?? container.view?.variants, context.state)
}

function boardScope(
  params: Record<string, ParamSpec> | undefined,
  chosen: PropValues | undefined,
  state: StateSpec | undefined
): EvalScope {
  const choices = variantChoices(params, chosen)

  return { layers: [...optionPatches(params, choices), state?.overrides], args: boardArgs(params, choices) }
}

/**
 * Everything patched over one node in a scope, as the code it stands for would draw it (PAR-902). A viewport's
 * responsive patch is a breakpoint, CSS that applies whatever the app's state is, so its style wins over every layer's
 * patch for the node, and its `hidden: true` hides the node whatever a layer shows. Text, props and `hidden: false` are
 * the app's to change, so they sit under the layers: a state, variant or instance can still change the words or hide
 * what the viewport shows. Layers are keyed by the node's own id, since an instance's scope keys them by the paths
 * below it.
 */
export function nodePatch(layers: readonly PatchLayer[], node: DesignNode, viewport?: string): NodePatch {
  const responsive = viewport === undefined ? undefined : node.responsive?.[viewport]

  if (!responsive) {
    return layeredPatch(layers, node.id)
  }

  const { under, over } = splitResponsive(responsive)

  return mergePatches(layeredPatch(layers, node.id, under), over)
}

/**
 * A responsive patch in two parts: what the app's state can change (text, props, and showing a node the design hides),
 * and what the breakpoint decides over it (style, and hiding a node).
 */
interface ResponsiveParts {
  /** Applied under the layers, which can change it. */
  under: NodePatch
  /** Applied over the layers, whatever they say. */
  over: NodePatch
}

function splitResponsive(patch: NodePatch): ResponsiveParts {
  const under: NodePatch = {}
  const over: NodePatch = {}

  if (patch.hidden === false) {
    under.hidden = false
  } else if (patch.hidden === true) {
    over.hidden = true
  }

  if (patch.text !== undefined) {
    under.text = patch.text
  }

  if (patch.props) {
    under.props = patch.props
  }

  if (patch.unset?.props) {
    under.unset = { props: patch.unset.props }
  }

  if (patch.style) {
    over.style = patch.style
  }

  if (patch.unset?.style) {
    over.unset = { style: patch.unset.style }
  }

  return { under, over }
}

/**
 * One node as it's drawn in a scope: its own values, then the params it binds from `args`, then everything patched
 * over it, as `nodePatch` orders the variant options, the state and its responsive patch. Every node goes through this
 * step, on a board, inside an instance and in `resolveDesign`.
 */
export function drawnNode(node: DesignNode, scope: EvalScope, viewport?: string): DesignNode {
  return applyPatch(node, nodePatch(scope.layers, node, viewport), scope.args)
}

/**
 * A node with a patch applied, and with the params it's bound to filled in from `args`, as it renders. A patch's text
 * and props win over bound values. The bindings themselves stay on the node.
 */
export function applyPatch(node: DesignNode, patch: NodePatch, args?: PropValues): DesignNode {
  const bound = (param: string | undefined) =>
    param !== undefined && args && Object.hasOwn(args, param) ? { value: args[param] } : undefined

  const next: DesignNode = { ...node }
  const hidden = patch.hidden ?? node.hidden

  if (hidden !== node.hidden) {
    if (hidden) {
      next.hidden = true
    } else {
      delete next.hidden
    }
  }

  if ((patch.style && Object.keys(patch.style).length > 0) || patch.unset?.style?.length) {
    const style = { ...without(node.style, patch.unset?.style), ...patch.style }

    if (Object.keys(style).length > 0) {
      next.style = style
    } else {
      delete next.style
    }
  }

  if (next.type === "text") {
    const text = bound(next.bind?.text)

    if (patch.text !== undefined) {
      next.text = patch.text
    } else if (text) {
      next.text = String(text.value)
    }
  }

  if (next.type === "component" || next.type === "layout" || next.type === "text") {
    const props: PropValues = { ...next.props }

    for (const [prop, param] of Object.entries(next.bind?.props ?? {})) {
      const value = bound(param)

      if (value) {
        props[prop] = value.value
      }
    }

    for (const prop of patch.unset?.props ?? []) {
      delete props[prop]
    }

    Object.assign(props, patch.props)

    if (Object.keys(props).length > 0) {
      // SAFETY: a layout's or text's props are checked when its file loads, and `accessibilityAttributes` writes only
      // the accessibility attributes among what a patch or a param gives it.
      next.props = props as typeof next.props
    } else {
      delete next.props
    }
  }

  if (
    next.type === "instance" &&
    ((patch.props && Object.keys(patch.props).length > 0) || patch.unset?.props?.length)
  ) {
    const args = { ...without(next.args, patch.unset?.props), ...patch.props }

    if (Object.keys(args).length > 0) {
      next.args = args
    } else {
      delete next.args
    }
  }

  return next
}

/**
 * A layout's or text's props as the attributes its element carries, by their HTML names and as text, as React writes
 * `aria-hidden={true}`. Only accessibility attributes (`isAccessibilityProp`): a patch's or a param's other props
 * are left off.
 */
export function accessibilityAttributes(props: PropValues | undefined): ElementAttributes {
  const attributes: ElementAttributes = {}

  for (const [name, value] of Object.entries(props ?? {})) {
    const written = attributeValue.safeParse(value)

    if (isAccessibilityProp(name) && written.success) {
      attributes[name] = String(written.data)
    }
  }

  return attributes
}

/** What an attribute can be written from: text, a number or a boolean. */
const attributeValue = z.union([z.string(), z.number(), z.boolean()])

/** `{ attributes }` when there are any, so an element without them has none. */
function withAttributes(attributes: ElementAttributes): { attributes?: ElementAttributes } {
  return Object.keys(attributes).length > 0 ? { attributes } : {}
}

/** `values` without `keys`. */
export function without<T extends object>(values: T | undefined, keys: readonly string[] | undefined): T {
  // SAFETY: callers take away only keys that `T` leaves optional (style properties, props, args), and the empty copy
  // made for `undefined` is a `T` with none of them set.
  const next = { ...values } as T

  for (const key of keys ?? []) {
    Reflect.deleteProperty(next, key)
  }

  return next
}

/**
 * What a component's board gives its params: each one's default, and the variant options it shows, so the board shows
 * what an instance that sets none of them shows. A param without a default leaves the design's own value.
 */
export function boardArgs(
  params: Record<string, ParamSpec> | undefined,
  choices: VariantChoices
): PropValues | undefined {
  const args = { ...paramDefaults(params), ...choices }

  return Object.keys(args).length > 0 ? args : undefined
}

/** Each param's default, by name, for the params that have one. */
export function paramDefaults(params: Record<string, ParamSpec> | undefined): PropValues {
  return Object.fromEntries(
    Object.entries(params ?? {}).flatMap(([name, param]) =>
      param.default === undefined ? [] : [[name, param.default]]
    )
  )
}

/** The option each variant param shows: the chosen one when it exists, else the param's default, else its first. */
export function variantChoices(params: Record<string, ParamSpec> | undefined, chosen: PropValues = {}): VariantChoices {
  const choices: VariantChoices = {}

  for (const [name, param] of Object.entries(params ?? {})) {
    const options = param.type === "variant" ? (param.options ?? []) : []
    const option = (id: PropValues[string]) => options.find((candidate) => candidate.id === id)
    const pick = option(chosen[name]) ?? option(param.default) ?? options[0]

    if (pick) {
      choices[name] = pick.id
    }
  }

  return choices
}

/** The option id each variant param shows, by param. */
export interface VariantChoices {
  [param: string]: string
}

/** The patches of the chosen variant options, in param order. */
export function optionPatches(params: Record<string, ParamSpec> | undefined, choices: VariantChoices): PatchLayer[] {
  return Object.entries(choices).map(
    ([name, option]) => params?.[name]?.options?.find((candidate) => candidate.id === option)?.overrides
  )
}

/** The patches a layer has for nodes inside one instance, keyed by their path below it. */
export function withinInstance(layer: PatchLayer, instanceId: string): PatchLayer {
  if (!layer) {
    return undefined
  }

  const prefix = `${instanceId}/`
  const inside = Object.entries(layer).filter(([key]) => key.startsWith(prefix))

  if (inside.length === 0) {
    return undefined
  }

  return Object.fromEntries(inside.map(([key, patch]) => [key.slice(prefix.length), patch]))
}

/** Every layer's patch for one node, merged in order over `under`. */
export function layeredPatch(layers: readonly PatchLayer[], id: string, under?: NodePatch): NodePatch {
  return layers.reduce<NodePatch>((merged, layer) => mergePatches(merged, layer?.[id]), under ?? {})
}

/**
 * What an instance passes into its component, and the layers the component's nodes are shown through. `patch` is
 * everything over the instance node itself; `layers` are the ones the instance sits in.
 */
export function instanceScope(
  node: InstanceNode,
  component: ContainerSpec,
  patch: NodePatch,
  layers: readonly PatchLayer[]
): Required<EvalScope> {
  const defaults = paramDefaults(component.params)
  // A param the patch takes away goes back to its default.
  const given = { ...without(node.args, patch.unset?.props), ...patch.props }
  const choices = variantChoices(component.params, given)
  // An instance shows its component's base state: other states only stress-test the component on its own board.
  const componentState = designStates(component)[0]

  return {
    args: { ...defaults, ...given, ...choices },
    layers: [
      ...optionPatches(component.params, choices),
      componentState?.overrides,
      node.overrides,
      ...layers.map((layer) => withinInstance(layer, node.id))
    ]
  }
}

function resolveTree(root: DesignNode, viewportId: string, library: ComponentLibrary, scope: Scope): RenderNode[] {
  const id = (node: DesignNode) => (scope.prefix ? `${scope.prefix}/${node.id}` : node.id)

  /** `parent` is the direction of the layout a node sits in; unset at the root and inside components' slots. */
  const resolve = (node: DesignNode, parent?: Direction): RenderNode[] => {
    // The same step as `drawnNode`, keeping the patch, which an instance passes into its component.
    const patch = nodePatch(scope.layers, node, viewportId)
    const shown = applyPatch(node, patch, scope.args)

    if (shown.hidden) {
      return []
    }

    const style = shown.style ?? {}

    switch (shown.type) {
      // A route draws nothing of its own here: its component draws in the app's own page (PAR-1076).
      case "route":
        return shown.children.flatMap((child) => resolve(child, parent))
      case "layout": {
        const direction = style.flexDirection ?? "column"
        const filled = shown.slot === undefined ? undefined : scope.fills?.(shown.slot, direction)
        const children = filled ?? shown.children.flatMap((child) => resolve(child, direction))

        const element: RenderElement = {
          kind: "element",
          nodeId: id(node),
          tag: "div",
          // A child placed against the layout's edges is placed in the layout, as its code would be written.
          declarations: cssOf(style, "layout", parent, { anchors: children.some(isAbsolute) }),
          children,
          ...withAttributes(accessibilityAttributes(shown.props))
        }

        if (children.length > 0) {
          return [element]
        }

        // The canvas gives an empty layout a size to see, select and drop into (see `emptyLayoutAttribute`).
        return [
          { ...element, attributes: { ...element.attributes, [emptyLayoutAttribute]: unsizedAxes(style).join(" ") } }
        ]
      }

      case "text":
        return [
          {
            kind: "element",
            nodeId: id(node),
            tag: shown.tag ?? "p",
            declarations: cssOf(style, "text", parent, { inline: inlineTags.has(shown.tag ?? "p") }),
            children: [{ kind: "text", text: shown.text }],
            ...withAttributes(accessibilityAttributes(shown.props))
          }
        ]
      case "image":
        return [
          {
            kind: "element",
            nodeId: id(node),
            tag: "img",
            declarations: mediaCss(shown.fit, cssOf(style, shown.type, parent)),
            attributes: { src: shown.src, alt: shown.alt ?? "" },
            children: []
          }
        ]
      case "video":
        return [
          {
            kind: "element",
            nodeId: id(node),
            tag: "video",
            declarations: mediaCss(shown.fit, cssOf(style, shown.type, parent)),
            attributes: videoAttributes(shown),
            children: []
          }
        ]
      case "component": {
        const props = { ...shown.props }
        // A component's own styles come from its props; what the design sets on it lands on its root as inline styles.
        const box = inlineStyle(style, shown.type, parent)

        if (Object.keys(box).length > 0) {
          props.style = withInlineStyle(props.style, box)
        }

        const slots: Record<string, RenderNode[]> = {}

        for (const [slot, children] of Object.entries(shown.slots ?? {})) {
          slots[slot] = children.flatMap((child) => resolve(child))
        }

        return [{ kind: "component", nodeId: id(node), component: shown.component, props, slots }]
      }

      case "instance": {
        const component = library.get(shown.design)

        if (!component || scope.stack.includes(shown.design)) {
          const problem = component ? `${shown.design} contains itself` : `No component design "${shown.design}"`

          return [{ kind: "component", nodeId: id(node), component: problem, props: {}, slots: {} }]
        }

        const expanded = instanceScope(shown, component, patch, scope.layers)
        const filling = shown.slots

        const inner = resolveTree(component.root, viewportId, library, {
          ...expanded,
          prefix: id(node),
          stack: [...scope.stack, shown.design],
          fills: (slot, direction) =>
            filling?.[slot]?.length ? filling[slot].flatMap((child) => resolve(child, direction)) : undefined
        })

        const [first] = inner

        if (first && first.kind !== "text") {
          // The instance's place in its layout (width, grow) applies to the component's root, which takes its id.
          first.nodeId = id(node)

          if (first.kind === "element") {
            first.declarations = over(first.declarations, cssOf(style, shown.type, parent))
            // An empty root is unsized along an axis the instance sizes only as the instance sizes it, so a length the
            // instance gives it counts, and so does hugging over its component's fixed one; on another axis, as its
            // component sizes it.
            const unsized = first.attributes?.[emptyLayoutAttribute]

            if (unsized !== undefined) {
              const own = unsizedAxes(style)

              const axes = (["width", "height"] as const).filter((axis) => {
                const least = axis === "width" ? style.minWidth : style.minHeight

                return style[axis] !== undefined || least !== undefined
                  ? own.includes(axis)
                  : unsized.split(" ").includes(axis)
              })

              first.attributes = { ...first.attributes, [emptyLayoutAttribute]: axes.join(" ") }
            }
          } else {
            const box = inlineStyle(style, shown.type, parent)

            if (Object.keys(box).length > 0) {
              first.props = { ...first.props, style: withInlineStyle(first.props.style, box) }
            }
          }
        }

        return inner
      }
    }
  }

  return resolve(root)
}

/** Text tags drawn inline, which take a width or alignment only once drawn as a block. */
const inlineTags: ReadonlySet<string> = new Set(["span", "strong"])

/** A layer's style as the CSS declarations its element is drawn from. */
function cssOf(
  style: NodeStyle,
  kind: LayerKind,
  parent: Direction | undefined,
  context: Pick<StyleContext, "inline" | "anchors"> = {}
): CssDeclaration[] {
  return declarations(style, { ...context, kind, parent }).map(({ property, value }) => ({ property, value }))
}

/** Whether a drawn node is placed against its parent's edges: an element by its rule, a component by its style. */
function isAbsolute(node: RenderNode): boolean {
  if (node.kind === "element") {
    return node.declarations.some(({ property, value }) => property === "position" && value === "absolute")
  }

  const style = node.kind === "component" ? node.props.style : undefined

  return isComposite(style) && "position" in style && style.position === "absolute"
}

/** `upper` laid over `under`: a property both declare takes the upper value, where the lower one wrote it. */
function over(under: readonly CssDeclaration[], upper: readonly CssDeclaration[]): CssDeclaration[] {
  const css = new Map(under.map((declaration) => [declaration.property, declaration]))

  for (const declaration of upper) {
    css.set(declaration.property, declaration)
  }

  return [...css.values()]
}

/** What an image or a video draws before its style: a block that covers its box, or fits it as `fit` says. */
function mediaCss(fit: string | undefined, own: readonly CssDeclaration[]): CssDeclaration[] {
  return over(
    [
      { property: "display", value: "block" },
      { property: "object-fit", value: fit ?? "cover" }
    ],
    own
  )
}

/**
 * A layer's style as the inline style a component takes in its `style` prop, since its DOM is its own and no rule of
 * the frame's is sure to reach it: its declarations, each property camel-cased as the DOM's `style` names it
 * (`align-self` as `alignSelf`, `-webkit-line-clamp` as `WebkitLineClamp`).
 */
function inlineStyle(style: NodeStyle, kind: LayerKind, parent: Direction | undefined): InlineStyle {
  const css: InlineStyle = {}

  for (const { property, value } of declarations(style, { kind, parent })) {
    css[property.replaceAll(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase())] = value
  }

  return css
}

/** A component's `style` prop, whatever the props give it, with the design's inline styles over it. */
function withInlineStyle(style: PropValues[string], box: InlineStyle): InlineStyle {
  return Object.assign({}, style, box)
}

/** `over` applied on top of `under`. */
export function mergePatches(under: NodePatch | undefined, over: NodePatch | undefined): NodePatch {
  if (!over) {
    return under ?? {}
  }

  // What the upper patch takes away goes from the lower one's values, and what it sets is no longer taken away.
  const props = mergeUnset(under?.unset?.props, over.unset?.props, Object.keys(over.props ?? {}))
  const style = mergeUnset(under?.unset?.style, over.unset?.style, Object.keys(over.style ?? {}))

  const merged: NodePatch = {
    hidden: over.hidden ?? under?.hidden,
    text: over.text ?? under?.text,
    props: { ...without(under?.props, over.unset?.props), ...over.props },
    style: { ...without(under?.style, over.unset?.style), ...over.style }
  }

  if (props || style) {
    const unset: PatchUnset = {}

    if (props) {
      unset.props = props
    }

    if (style) {
      unset.style = style
    }

    merged.unset = unset
  }

  return merged
}

/** The keys two patches take away, one over the other, less those the upper one sets. */
function mergeUnset<K extends string>(
  under: readonly K[] | undefined,
  over: readonly K[] | undefined,
  set: readonly string[]
): K[] | undefined {
  const keys = [...new Set([...(under ?? []), ...(over ?? [])])].filter((key) => !set.includes(key))

  return keys.length > 0 ? keys : undefined
}

/**
 * A video's attributes, by their HTML names as the project's code would write them: one with controls waits to be
 * played; one without plays by itself, without sound (which a browser needs before it plays one by itself), round and
 * round, in its place rather than full screen on a phone.
 */
export function videoAttributes(video: Pick<VideoNode, "src" | "alt" | "controls">): ElementAttributes {
  const attributes: ElementAttributes = { src: video.src }

  if (video.alt) {
    attributes["aria-label"] = video.alt
  }

  return video.controls
    ? { ...attributes, controls: "", playsinline: "" }
    : { ...attributes, autoplay: "", muted: "", loop: "", playsinline: "" }
}
