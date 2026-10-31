import { screenHeightForWidth } from "./devices.ts"
import type {
  ContainerSpec,
  DesignNode,
  InstanceNode,
  Length,
  NodePatch,
  NodeStyle,
  Padding,
  ParamSpec,
  Size,
  StateSpec
} from "./document.ts"
import type { ResolvedMode } from "./modes.ts"

/**
 * A design resolved for one state in one viewport: what a renderer adapter mounts. Framework-neutral: elements are
 * plain DOM with inline styles, and components are the project's own, by id.
 */
export type RenderNode =
  | {
      kind: "element"
      nodeId: string
      tag: string
      style: Record<string, string>
      children: RenderNode[]
      /** HTML attributes beyond the style, like an image's `src` and `alt`. */
      attributes?: Record<string, string>
    }
  | { kind: "text"; text: string }
  | {
      kind: "component"
      nodeId: string
      component: string
      props: Record<string, unknown>
      slots: Record<string, RenderNode[]>
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

/** The axes a style gives no fixed length or least length. */
function unsizedAxes(style: NodeStyle): Axis[] {
  return (["width", "height"] as const).filter((axis) => {
    const size = style[axis]
    const least = axis === "width" ? style.minWidth : style.minHeight
    return (size === undefined || size === "hug" || size === "fill") && least === undefined
  })
}

/** Component designs by id, for expanding instances. */
export type ComponentLibrary = ReadonlyMap<string, ContainerSpec>

/** What a design's own board renders: its root, inside the components it needs around it. */
export function boardRoot(design: ContainerSpec): DesignNode {
  return (design.context ?? []).reduceRight<DesignNode>(
    (inner, wrapper, index) => ({
      type: "component",
      id: `context-${index}`,
      component: wrapper.component,
      ...(wrapper.props ? { props: wrapper.props } : {}),
      slots: { children: [inner] }
    }),
    design.root
  )
}

/**
 * The size a design's frame is drawn at in a mode: the design's own size for the mode's viewport if it has one, else
 * as wide as the viewport and as tall as its content (no height).
 */
export function frameSize(
  design: ContainerSpec,
  mode: { viewport: string; width: number }
): { width: number; height?: number } {
  const size = design.frames?.[mode.viewport]
  return { width: size?.width ?? mode.width, ...(size?.height === undefined ? {} : { height: size.height }) }
}

/**
 * The browser window a frame stands for, which viewport units, media queries and the project's own code measure: as wide
 * as the frame, and as tall as the frame's fixed height, else its viewport's screen, else the device nearest its width.
 * A frame that grows with its content is still drawn whole; this is only how tall its window is.
 */
export function frameViewport(
  size: { width: number; height?: number },
  mode: Pick<ResolvedMode, "options">
): { width: number; height: number } {
  const screen = mode.options.find(({ variable }) => variable.kind === "viewport")?.option.height
  return { width: size.width, height: size.height ?? screen ?? screenHeightForWidth(size.width) }
}

/** Every design that instances can place, by id. */
export function componentLibrary(designs: Iterable<ContainerSpec>): ComponentLibrary {
  return new Map([...designs].map((design) => [design.id, design]))
}

/** Designs are replaced rather than changed, so what a design places is worked out once per design. */
const placedBy = new WeakMap<ContainerSpec, readonly string[]>()

/** The ids of the designs a design's instances place, anywhere in it: its tree, its states and its params. */
export function placedDesigns(design: ContainerSpec): readonly string[] {
  let placed = placedBy.get(design)
  if (!placed) {
    const found = new Set<string>()
    const visit = (value: unknown): void => {
      if (Array.isArray(value)) for (const item of value) visit(item)
      else if (typeof value === "object" && value !== null) {
        const node = value as Partial<InstanceNode>
        if (node.type === "instance" && typeof node.design === "string") found.add(node.design)
        for (const item of Object.values(value)) visit(item)
      }
    }
    visit(design)
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
      if (!placed || reached.has(id)) continue
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
  choices?: Record<string, unknown>
}

/**
 * Applies the viewport's responsive patches, then the variants' and the state's, maps tokens to CSS, and expands
 * instances of component designs with their args bound.
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
  variants?: Record<string, unknown>
  viewport?: string
  library?: ComponentLibrary
}

/** The patches a scope's nodes are shown through, and the values their bound params take. */
export interface EvalScope {
  /** Later layers win. On a board: the chosen variant options in param order, then the state. */
  layers: PatchLayer[]
  /** On a board: each param's default, then the variant options shown, as `boardArgs` gives them. */
  args?: Record<string, unknown>
}

/** The layers and args a design's own nodes are evaluated with in a context. */
export function scopeOf(container: ContainerSpec, context: EvalContext = {}): EvalScope {
  return boardScope(container.params, context.variants ?? container.view?.variants, context.state)
}

function boardScope(
  params: Record<string, ParamSpec> | undefined,
  chosen: Record<string, unknown> | undefined,
  state: StateSpec | undefined
): EvalScope {
  const choices = variantChoices(params, chosen)
  return { layers: [...optionPatches(params, choices), state?.overrides], args: boardArgs(params, choices) }
}

/**
 * Everything patched over one node in a scope: its responsive patch for the viewport, under every layer's patch for
 * it. Layers are keyed by the node's own id, since an instance's scope keys them by the paths below it.
 */
export function nodePatch(layers: readonly PatchLayer[], node: DesignNode, viewport?: string): NodePatch {
  return layeredPatch(layers, node.id, viewport === undefined ? undefined : node.responsive?.[viewport])
}

/**
 * One node as it's drawn in a scope: its own values, then the params it binds from `args`, then its responsive
 * patch, the variant options and the state, later ones winning. Every node goes through this step, on a board, inside
 * an instance and in `resolveDesign`.
 */
export function drawnNode(node: DesignNode, scope: EvalScope, viewport?: string): DesignNode {
  return applyPatch(node, nodePatch(scope.layers, node, viewport), scope.args)
}

/**
 * A node with a patch applied, and with the params it's bound to filled in from `args`, as it renders. A patch's text,
 * props and visibility win over bound values. The bindings themselves stay on the node.
 */
export function applyPatch(node: DesignNode, patch: NodePatch, args?: Record<string, unknown>): DesignNode {
  const bound = (param: string | undefined) =>
    param !== undefined && args && Object.hasOwn(args, param) ? { value: args[param] } : undefined
  const next = { ...node } as DesignNode
  const visible = bound(node.bind?.visible)
  const hidden = patch.hidden ?? (visible ? !visible.value : node.hidden)
  if (hidden !== node.hidden) {
    if (hidden) next.hidden = true
    else delete next.hidden
  }
  if (patch.style && Object.keys(patch.style).length > 0) next.style = { ...node.style, ...patch.style }
  if (next.type === "text") {
    const text = bound(next.bind?.text)
    if (patch.text !== undefined) next.text = patch.text
    else if (text) next.text = String(text.value)
  }
  if (next.type === "component") {
    const props: Record<string, unknown> = { ...next.props }
    for (const [prop, param] of Object.entries(next.bind?.props ?? {})) {
      const value = bound(param)
      if (value) props[prop] = value.value
    }
    Object.assign(props, patch.props)
    if (Object.keys(props).length > 0) next.props = props
  }
  if (next.type === "instance" && patch.props && Object.keys(patch.props).length > 0) {
    next.args = { ...next.args, ...patch.props }
  }
  return next
}

/**
 * What a component's board gives its params: each one's default, and the variant options it shows, so the board shows
 * what an instance that sets none of them shows. A param without a default leaves the design's own value.
 */
export function boardArgs(
  params: Record<string, ParamSpec> | undefined,
  choices: Record<string, string>
): Record<string, unknown> | undefined {
  const args = { ...paramDefaults(params), ...choices }
  return Object.keys(args).length > 0 ? args : undefined
}

/** Each param's default, by name, for the params that have one. */
export function paramDefaults(params: Record<string, ParamSpec> | undefined): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(params ?? {}).flatMap(([name, param]) =>
      param.default === undefined ? [] : [[name, param.default]]
    )
  )
}

/** The option each variant param shows: the chosen one when it exists, else the param's default, else its first. */
export function variantChoices(
  params: Record<string, ParamSpec> | undefined,
  chosen: Record<string, unknown> = {}
): Record<string, string> {
  const choices: Record<string, string> = {}
  for (const [name, param] of Object.entries(params ?? {})) {
    const options = param.type === "variant" ? (param.options ?? []) : []
    if (options.length === 0) continue
    const pick = [chosen[name], param.default].find((value) => options.some((option) => option.id === value))
    choices[name] = typeof pick === "string" ? pick : options[0]!.id
  }
  return choices
}

/** The patches of the chosen variant options, in param order. */
export function optionPatches(
  params: Record<string, ParamSpec> | undefined,
  choices: Record<string, string>
): PatchLayer[] {
  return Object.entries(choices).map(
    ([name, option]) => params?.[name]?.options?.find((candidate) => candidate.id === option)?.overrides
  )
}

/** The patches a layer has for nodes inside one instance, keyed by their path below it. */
export function withinInstance(layer: PatchLayer, instanceId: string): PatchLayer {
  if (!layer) return undefined
  const prefix = `${instanceId}/`
  const inside = Object.entries(layer).filter(([key]) => key.startsWith(prefix))
  if (inside.length === 0) return undefined
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
): { args: Record<string, unknown>; layers: PatchLayer[] } {
  const defaults = paramDefaults(component.params)
  const given = { ...node.args, ...patch.props }
  const choices = variantChoices(component.params, given)
  const componentState = component.states.find((candidate) => candidate.id === node.state) ?? component.states[0]
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
    if (shown.hidden) return []
    const style = shown.style ?? {}

    switch (shown.type) {
      case "layout": {
        const children = shown.children.flatMap((child) => resolve(child, style.direction ?? "column"))
        return [
          {
            kind: "element",
            nodeId: id(node),
            tag: "div",
            style: layoutCss(style, parent),
            // The canvas gives an empty layout a size to see, select and drop into (see `emptyLayoutAttribute`).
            ...(children.length === 0 ? { attributes: { [emptyLayoutAttribute]: unsizedAxes(style).join(" ") } } : {}),
            children
          }
        ]
      }
      case "text":
        return [
          {
            kind: "element",
            nodeId: id(node),
            tag: shown.tag ?? "p",
            style: textCss(style, parent),
            children: [{ kind: "text", text: shown.text }]
          }
        ]
      case "image":
        return [
          {
            kind: "element",
            nodeId: id(node),
            tag: "img",
            style: { display: "block", objectFit: shown.fit ?? "cover", ...componentCss(style, parent) },
            attributes: { src: shown.src, alt: shown.alt ?? "" },
            children: []
          }
        ]
      case "component": {
        const props: Record<string, unknown> = { ...shown.props }
        // A component's own styles come from its props; what the design sets on it lands on its root as inline styles.
        const box = componentCss(style, parent)
        if (Object.keys(box).length > 0) props.style = { ...(props.style as object | undefined), ...box }
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
        const inner = resolveTree(component.root, viewportId, library, {
          ...expanded,
          prefix: id(node),
          stack: [...scope.stack, shown.design]
        })
        const [first] = inner
        if (first && first.kind !== "text") {
          // The instance's place in its layout (width, grow) applies to the component's root, which takes its id.
          const box = componentCss(style, parent)
          first.nodeId = id(node)
          if (first.kind === "element") {
            first.style = { ...first.style, ...box }
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
          } else if (Object.keys(box).length > 0)
            first.props = { ...first.props, style: { ...(first.props.style as object | undefined), ...box } }
        }
        return inner
      }
    }
  }
  return resolve(root)
}

/** `over` applied on top of `under`. */
export function mergePatches(under: NodePatch | undefined, over: NodePatch | undefined): NodePatch {
  if (!over) return under ?? {}
  return {
    hidden: over.hidden ?? under?.hidden,
    text: over.text ?? under?.text,
    props: { ...under?.props, ...over.props },
    style: { ...under?.style, ...over.style }
  }
}

/** A step of the spacing scale (a multiple of the project's spacing unit), or a length token. */
export function spacing(value: Length): string {
  if (typeof value === "string") return token(value)
  return value === 0 ? "0" : `calc(var(--spacing) * ${value})`
}

/** A reference to one of the project's custom properties. */
export function token(name: string): string {
  return `var(--${name})`
}

type Direction = "row" | "column"

const flexAlign = { start: "flex-start", center: "center", end: "flex-end", stretch: "stretch" } as const
const flexJustify = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  between: "space-between",
  around: "space-around",
  evenly: "space-evenly"
} as const

function layoutCss(style: NodeStyle, parent: Direction | undefined): Record<string, string> {
  const grid = style.display === "grid"
  const css: Record<string, string> = {
    display: grid ? "grid" : "flex",
    position: "relative",
    minWidth: "0",
    ...surfaceCss(style),
    ...spacingCss(style),
    ...boxCss(style, parent)
  }
  if (grid) {
    css.gridTemplateColumns = `repeat(${style.columns ?? 2}, minmax(0, 1fr))`
    if (style.rows !== undefined) css.gridTemplateRows = `repeat(${style.rows}, minmax(0, 1fr))`
  } else {
    css.flexDirection = style.direction ?? "column"
    if (style.wrap) css.flexWrap = "wrap"
  }
  if (style.gap !== undefined) css.gap = spacing(style.gap)
  if (style.rowGap !== undefined) css.rowGap = spacing(style.rowGap)
  if (style.align) css.alignItems = flexAlign[style.align]
  if (style.justify) {
    // A grid places items within their cells along the row; distributing space is for the tracks themselves.
    const distributes = style.justify === "between" || style.justify === "around" || style.justify === "evenly"
    if (grid && !distributes) css.justifyItems = flexAlign[style.justify as "start" | "center" | "end"]
    else css.justifyContent = flexJustify[style.justify]
  }
  return css
}

function textCss(style: NodeStyle, parent: Direction | undefined): Record<string, string> {
  const css: Record<string, string> = {
    margin: "0",
    ...surfaceCss(style),
    ...spacingCss(style),
    ...boxCss(style, parent)
  }
  // Hugging text is Figma's auto width: as wide as its line, never wrapped by its parent, only by a maximum width.
  if (style.width === "hug") css.width = "max-content"
  if (style.lines === 1) {
    Object.assign(css, { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" })
  } else if (style.lines !== undefined && style.lines > 1) {
    Object.assign(css, {
      display: "-webkit-box",
      WebkitBoxOrient: "vertical",
      WebkitLineClamp: String(style.lines),
      overflow: "hidden"
    })
  }
  return css
}

/** Everything a design can set on a component: its surface, spacing, place in the layout and type. */
function componentCss(style: NodeStyle, parent: Direction | undefined): Record<string, string> {
  return { ...surfaceCss(style), ...spacingCss(style), ...boxCss(style, parent) }
}

/** Padding and margin, each on all sides, per axis, or per side. */
function spacingCss(style: NodeStyle): Record<string, string> {
  const css: Record<string, string> = {}
  if (style.padding !== undefined) css.padding = sidesCss(style.padding)
  if (style.margin !== undefined) css.margin = sidesCss(style.margin)
  return css
}

function sidesCss(value: Padding): string {
  return (Array.isArray(value) ? value : [value]).map(spacing).join(" ")
}
/** Fill, border, corners, shadow and clipping: what layouts and text draw themselves. */
function surfaceCss(style: NodeStyle): Record<string, string> {
  const css: Record<string, string> = {}
  if (style.background) css.background = token(style.background)
  if (style.border !== undefined || style.borderWidth !== undefined) {
    css.borderWidth = `${style.borderWidth ?? 1}px`
    css.borderStyle = style.borderStyle ?? "solid"
    css.borderColor = style.border ? token(style.border) : "var(--border, currentColor)"
  }
  if (style.radius) css.borderRadius = token(style.radius)
  if (style.shadow) css.boxShadow = token(style.shadow)
  if (style.overflow) css.overflow = style.overflow === "scroll" ? "auto" : style.overflow
  return css
}

/**
 * What applies to any node, including a component's root: its size and place in the parent's layout, opacity, and
 * type, which the text inside inherits.
 */
function boxCss(style: NodeStyle, parent: Direction | undefined): Record<string, string> {
  const css: Record<string, string> = {}
  if (style.grow) fill(css, parent === "column" ? "height" : "width", parent ?? "row")
  sizeCss(css, "width", style.width, parent)
  sizeCss(css, "height", style.height, parent)
  if (style.minWidth !== undefined) css.minWidth = spacing(style.minWidth)
  if (style.maxWidth !== undefined) css.maxWidth = spacing(style.maxWidth)
  if (style.minHeight !== undefined) css.minHeight = spacing(style.minHeight)
  if (style.maxHeight !== undefined) css.maxHeight = spacing(style.maxHeight)
  if (style.self) css.alignSelf = flexAlign[style.self]
  if (style.colSpan !== undefined) css.gridColumn = `span ${style.colSpan} / span ${style.colSpan}`
  if (style.rowSpan !== undefined) css.gridRow = `span ${style.rowSpan} / span ${style.rowSpan}`
  if (style.position === "absolute") {
    css.position = "absolute"
    for (const side of ["top", "right", "bottom", "left"] as const) {
      if (style[side] !== undefined) css[side] = spacing(style[side])
    }
  }
  if (style.opacity !== undefined) css.opacity = String(style.opacity / 100)
  if (style.foreground) css.color = token(style.foreground)
  if (style.font) css.fontFamily = token(style.font)
  if (style.size) {
    css.fontSize = token(style.size)
    css.lineHeight = `var(--${style.size}--line-height, 1.5)`
  }
  if (style.leading) css.lineHeight = token(style.leading)
  if (style.weight !== undefined) css.fontWeight = String(style.weight)
  if (style.tracking) css.letterSpacing = token(style.tracking)
  if (style.textAlign) css.textAlign = style.textAlign
  if (style.transform) css.textTransform = style.transform
  if (style.decoration) css.textDecorationLine = style.decoration
  if (style.italic) css.fontStyle = "italic"
  return css
}

/**
 * Figma's sizing in flex terms. Filling the parent's main axis grows into the free space; filling the cross axis
 * stretches. A fixed length doesn't shrink along the main axis. Outside a layout, fill is the whole parent.
 */
function sizeCss(
  css: Record<string, string>,
  axis: "width" | "height",
  size: Size | undefined,
  parent: Direction | undefined
) {
  if (size === undefined) return
  const main = parent !== undefined && (axis === "width") === (parent === "row")
  if (size === "hug") css[axis] = "fit-content"
  else if (size === "fill") fill(css, axis, parent)
  else {
    css[axis] = spacing(size)
    if (main) css.flexShrink = "0"
  }
}

function fill(css: Record<string, string>, axis: "width" | "height", parent: Direction | undefined) {
  const min = axis === "width" ? "minWidth" : "minHeight"
  if (parent === undefined) css[axis] = "100%"
  else if ((axis === "width") === (parent === "row")) {
    css.flex = "1 1 0%"
    css[min] = "0"
  } else css.alignSelf = "stretch"
}
