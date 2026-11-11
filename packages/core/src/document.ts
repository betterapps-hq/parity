import { z } from "zod"
import { modeSettings } from "./modes.ts"
import { nodeFill } from "./paint.ts"
import { fileObject, finiteNumber, parserFor, plainObject } from "./schema.ts"
import { slotNameProblem } from "./slot-names.ts"

// A project file is checked by the schemas below, leaves first. Rules that span fields are refinements on the object
// that holds those fields, each reported at the field at fault.

const position = fileObject({ x: finiteNumber, y: finiteNumber })

export const canvasObjectKinds = ["table", "operation", "route"] as const

export type CanvasObjectKind = (typeof canvasObjectKinds)[number]

const canvasObjectSpec = fileObject({
  kind: z.enum(canvasObjectKinds),
  /** A table as `schema.table`, an operation by its id, a route by its URL pattern. */
  ref: z.string(),
  position
})

/**
 * Something from a lens's model placed on the canvas. Only where it sits is saved: the table, operation or route itself
 * is read from the project each time, by `ref`, its own key in that model. One whose model is gone stays, shown as
 * missing, until the person removes it.
 */
export type CanvasObjectSpec = z.infer<typeof canvasObjectSpec>

/** The canvas objects, each table, operation and route at most once. */
const canvasObjects = z.array(canvasObjectSpec).superRefine((objects, context) => {
  const placed = new Set<string>()

  for (const [index, { kind, ref }] of objects.entries()) {
    const key = JSON.stringify([kind, ref])

    if (placed.has(key)) {
      problem(context, [index], `the ${kind} "${ref}" is already on the canvas`)
    }

    placed.add(key)
  }
})

export const linkEndKinds = ["screen", "component", ...canvasObjectKinds] as const

export type LinkEndKind = (typeof linkEndKinds)[number]

const linkEnd = fileObject({ kind: z.enum(linkEndKinds), ref: z.string() })

/** One end of a link: a canvas object by its kind and ref, or a screen or component design by its id. */
export type LinkEnd = z.infer<typeof linkEnd>

const linkType = z.enum(["shows", "calls", "reads", "writes"])

export type LinkType = z.infer<typeof linkType>

/** Each type of link, and the kinds it may join, from and to. */
export const linkTypes = {
  /** A screen shown at a route's URL. */
  shows: { from: ["screen"], to: ["route"] },
  /** A screen, route or component that calls an operation. */
  calls: { from: ["screen", "route", "component"], to: ["operation"] },
  /** An operation that reads a table. */
  reads: { from: ["operation"], to: ["table"] },
  /** An operation that writes to a table. */
  writes: { from: ["operation"], to: ["table"] }
} as const satisfies Record<LinkType, { from: readonly LinkEndKind[]; to: readonly LinkEndKind[] }>

/** Whether a link of this type may join these two kinds. */
export function linkAllowed(type: LinkType, from: LinkEndKind, to: LinkEndKind): boolean {
  const allowed: { from: readonly LinkEndKind[]; to: readonly LinkEndKind[] } = linkTypes[type]

  return allowed.from.includes(from) && allowed.to.includes(to)
}

const linkSpec = fileObject({ id: z.string(), type: linkType, from: linkEnd, to: linkEnd }).superRefine(
  (link, context) => {
    if (linkAllowed(link.type, link.from.kind, link.to.kind)) {
      return
    }

    const { from, to } = linkTypes[link.type]
    const joined = `${from.join(" or ")} to ${to.join(" or ")}, not ${link.from.kind} to ${link.to.kind}`
    problem(context, [], `a ${link.type} link goes from ${joined}`)
  }
)

/** A typed link between two ends, such as a screen that shows a route or an operation that reads a table. */
export type LinkSpec = z.infer<typeof linkSpec>

/** The links the person drew, each id once. */
const linkSpecs = z.array(linkSpec).superRefine((links, context) => {
  const ids = new Set<string>()

  for (const [index, { id }] of links.entries()) {
    if (ids.has(id)) {
      problem(context, [index, "id"], `duplicate link id "${id}"`)
    }

    ids.add(id)
  }
})

const lensSources = fileObject({
  data: z.string().optional(),
  api: z.string().optional(),
  routes: z.string().optional()
})

/** The adapter or standard each lens reads, by its id, where the person chose it. */
export type LensSources = z.infer<typeof lensSources>

export type Lens = keyof LensSources

const componentRef = fileObject({ path: z.string(), export: z.string() })

/** One of the app's exports, by its file relative to the project root and its export name (`default` for a default). */
export type ComponentRef = z.infer<typeof componentRef>

// An earlier version could take components off the list as `exclude`; a file that did still opens, without it.
export const detectionCorrections = fileObject({
  include: z.array(componentRef).optional(),
  exclude: z.unknown().optional()
}).transform(({ exclude: _dropped, ...corrections }) => corrections)

/**
 * Exports the person put on the component list, which detection then keeps there. A component detected wrongly is a bug
 * in detection to fix, so there's no taking one off the list by hand (PAR-531).
 */
export type DetectionCorrections = z.infer<typeof detectionCorrections>

/** The corrections after putting an export on the component list, each once. */
export function includeComponent(
  corrections: DetectionCorrections | undefined,
  ref: ComponentRef
): DetectionCorrections {
  const listed = corrections?.include ?? []

  if (listed.some((other) => other.path === ref.path && other.export === ref.export)) {
    return { include: listed }
  }

  return { include: [...listed, ref] }
}

/** Text on the canvas outside any design, as a project file or the clipboard holds it. */
export const noteSpec = fileObject({
  id: z.string(),
  text: z.string(),
  position,
  /** Wraps at this width; unset notes grow with their text. */
  width: finiteNumber.optional()
})

export type NoteSpec = z.infer<typeof noteSpec>

/** A reference's picture, which loads from its source until `expiresAt`, when the source's links stop working. */
const referenceImage = fileObject({
  url: z.string().min(1),
  width: z.int().positive().optional(),
  height: z.int().positive().optional(),
  /** Milliseconds since the epoch. */
  expiresAt: finiteNumber.optional()
})

/**
 * A screen from a real app on the canvas, placed beside a design to look at (PAR-840). It isn't a design: it has no
 * layers, and code and exports leave it out. It keeps what the search gave, so it can name and link its source.
 */
export const referenceSpec = fileObject({
  id: z.string(),
  /** The connector that found it, as `mobbin`. */
  connector: z.string().min(1),
  /** The source's own id for the screen. */
  sourceId: z.string().min(1),
  /** The app it's from. */
  app: z.string(),
  platform: z.enum(["ios", "web"]).optional(),
  /** Its page at the source. */
  link: z.string().min(1),
  image: referenceImage,
  position,
  /** The description that found it. */
  query: z.string().optional(),
  /** Why it's here, in a person's or an agent's words. */
  note: z.string().optional(),
  /** The agent that placed it. Unset when the person did. */
  by: z.string().optional(),
  /**
   * The design it was found for, by id, in the same file (PAR-889). Unset when nothing was selected, and agents then
   * read it as for the design it sits nearest.
   */
  design: z.string().optional()
})

export type ReferenceSpec = z.infer<typeof referenceSpec>

/** Steps of the spacing scale (`4` is `calc(var(--spacing) * 4)`), or the name of a length token. */
const length = z.union([finiteNumber, z.string()])

export type Length = z.infer<typeof length>

/** Whether a length, or a field's value, is a name (a length token's, or `"fill"` and `"hug"`) rather than steps. */
export function isNamedLength(value: number | string | undefined): value is string {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- a length is steps (number) or a name (string), with no tag to tell them apart
  return typeof value === "string"
}

/** A fixed length, or `"fill"` the parent, or `"hug"` the content: both are among Length's strings. */
export type Size = Length

// The lists come first, so a list of another length, or something that is neither a list nor a length, says what
// padding takes.
const sides = "expected a length, [vertical, horizontal] or [top, right, bottom, left]"
const padding = z.union([z.tuple([length, length], sides), z.tuple([length, length, length, length], sides), length])

/** All sides, `[vertical, horizontal]`, or `[top, right, bottom, left]`. */
export type Padding = z.infer<typeof padding>

const alignment = z.enum(["start", "center", "end", "stretch"])

export const nodeStyle = fileObject({
  // Layout (layouts only).
  /** Auto layout (flex, the default) or a grid. */
  display: z.enum(["flex", "grid"]).optional(),
  direction: z.enum(["row", "column"]).optional(),
  /** A grid's columns, all the same width; or rows, all the same height. */
  columns: finiteNumber.optional(),
  rows: finiteNumber.optional(),
  gap: length.optional(),
  /** In a grid or wrapping layout, the gap between rows when it differs from `gap`. */
  rowGap: length.optional(),
  /** All sides, `[vertical, horizontal]`, or `[top, right, bottom, left]`. */
  padding: padding.optional(),
  /** Space outside the node, in the same forms as padding. */
  margin: padding.optional(),
  /** Children on the cross axis. */
  align: alignment.optional(),
  /** Children on the main axis. */
  justify: z.enum(["start", "center", "end", "between", "around", "evenly"]).optional(),
  wrap: z.boolean().optional(),

  // Size, within the parent's layout.
  width: length.optional(),
  height: length.optional(),
  minWidth: length.optional(),
  maxWidth: length.optional(),
  minHeight: length.optional(),
  maxHeight: length.optional(),
  /** Grid cells the node spans, in a grid. */
  colSpan: finiteNumber.optional(),
  rowSpan: finiteNumber.optional(),
  /** Fill along the parent's direction. Same as `fill` for the parent's main axis. */
  grow: z.boolean().optional(),
  /** Where this node sits on its parent's cross axis, overriding the parent's `align`. */
  self: alignment.optional(),

  // Position: taken out of the layout and placed against the parent's edges.
  position: z.enum(["absolute"]).optional(),
  top: length.optional(),
  right: length.optional(),
  bottom: length.optional(),
  left: length.optional(),

  // Appearance.
  /** One color token, or a stack of paints, top first: colors, gradients and images (PAR-931). */
  background: nodeFill.optional(),
  foreground: z.string().optional(),
  /** Border color. */
  border: z.string().optional(),
  /** Border width in pixels, as in Tailwind: 0, 1, 2, 4 or 8. */
  borderWidth: finiteNumber.optional(),
  borderStyle: z.enum(["solid", "dashed", "dotted"]).optional(),
  radius: z.string().optional(),
  shadow: z.string().optional(),
  /** Percent, 0 to 100. */
  opacity: finiteNumber.optional(),
  overflow: z.enum(["visible", "hidden", "scroll"]).optional(),

  // Type. Set on a layout, it applies to the text inside.
  font: z.string().optional(),
  size: z.string().optional(),
  weight: finiteNumber.optional(),
  leading: z.string().optional(),
  tracking: z.string().optional(),
  textAlign: z.enum(["start", "center", "end", "justify"]).optional(),
  transform: z.enum(["uppercase", "lowercase", "capitalize"]).optional(),
  decoration: z.enum(["underline", "line-through"]).optional(),
  italic: z.boolean().optional(),
  /** Lines of text before it's cut off with an ellipsis. */
  lines: finiteNumber.optional()
})

/**
 * Visual properties, locked to the project's tokens: lengths are steps of the spacing scale (multiples of `--spacing`)
 * or name a length token, and colors, radii, shadows and type values name one of the project's CSS custom properties
 * (without `--`). Layout is Figma's auto layout, a flex box, or a grid; children size themselves to fill, hug, or a
 * fixed length.
 */
export type NodeStyle = z.infer<typeof nodeStyle>

const styleKey = nodeStyle.keyof()

export type StyleKey = z.infer<typeof styleKey>

/** Every style key, in the order panels show them. */
export const styleKeys = styleKey.options

export const patchUnset = fileObject({ props: z.array(z.string()).optional(), style: z.array(styleKey).optional() })

/** Props and style keys a patch takes away. A key a patch sets isn't also taken away by it. */
export type PatchUnset = z.infer<typeof patchUnset>

const nodePatch = fileObject({
  hidden: z.boolean().optional(),
  text: z.string().optional(),
  props: plainObject.optional(),
  style: nodeStyle.optional(),
  /** What the patch takes away from what's under it, so a state can turn off a prop or style the design sets. */
  unset: patchUnset.optional()
})

export type NodePatch = z.infer<typeof nodePatch>

/** Patches keyed by node id, or by `instance/inner` for a node inside an instance. */
const nodePatches = z.record(z.string(), nodePatch)

const nodeBinding = fileObject({
  text: z.string().optional(),
  props: z.record(z.string(), z.string()).optional(),
  visible: z.string().optional()
})

export type NodeBinding = z.infer<typeof nodeBinding>

// What every node has. Each type of node extends it: spreading its shape instead loses the node tree's type, which
// TypeScript can only infer through the getters for children and slots.
const nodeBase = fileObject({
  id: z.string(),
  name: z.string().optional(),
  hidden: z.boolean().optional(),
  /**
   * Kept from being selected or moved on the canvas, with everything inside it, as in Figma; it's still selected from
   * Layers. It's the same in every state and screen size, so no patch sets it.
   */
  locked: z.boolean().optional(),
  style: nodeStyle.optional(),
  /**
   * Patches applied in one viewport, keyed by the viewport option id from the project's modes. Layout changes per
   * viewport live here, not in copies.
   */
  responsive: nodePatches.optional(),
  /**
   * Inside a component design: which of this node's values come from the component's params, so each instance can
   * show its own. `text` and `props` name a param; `visible` names a boolean param that shows or hides the node.
   */
  bind: nodeBinding.optional()
})

const layoutNode = nodeBase.extend({
  type: z.literal("layout"),
  /**
   * In a component design: the slot this layout is, `children` for the default one or a name such as `actions`. Each
   * instance can fill it with layers of its own; until one does, its children show as placeholder content.
   */
  slot: z.string().optional(),
  get children(): z.ZodArray<typeof designNode> {
    return z.array(designNode)
  }
})

/** A flex container. Layout is design-native, so every mode resolves it exactly, without media queries. */
export type LayoutNode = z.infer<typeof layoutNode>

const componentNode = nodeBase.extend({
  type: z.literal("component"),
  component: z.string(),
  props: plainObject.optional(),
  /** Child nodes by slot. `children` is the default slot; other names become node-valued props. */
  get slots(): z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodArray<typeof designNode>>> {
    return z.record(z.string(), z.array(designNode)).optional()
  }
})

/** An instance of one of the project's own components. */
export type ComponentNode = z.infer<typeof componentNode>

/** A component's props or an instance's args, by name, as a design file holds them. */
export type PropValues = NonNullable<ComponentNode["props"]>

/** The elements a text node can be. */
export const textTags = ["p", "span", "h1", "h2", "h3", "h4", "strong"] as const

const textNode = nodeBase.extend({
  type: z.literal("text"),
  text: z.string(),
  tag: z.enum(textTags).optional()
})

export type TextNode = z.infer<typeof textNode>

const instanceNode = nodeBase.extend({
  type: z.literal("instance"),
  /** The component design's id. */
  design: z.string(),
  args: plainObject.optional(),
  /** Which of the component's states this copy shows. */
  state: z.string().optional(),
  /**
   * What this copy changes inside the component, keyed by the inner node's id, or `nested/inner` for a node inside a
   * nested instance. The copy stays linked: everything it doesn't change follows the component.
   */
  overrides: nodePatches.optional(),
  /**
   * What this copy fills the component's slots with, by slot name: layers of the design it sits in, shown in place of
   * the slot's placeholder. A slot it doesn't fill, or fills with nothing, shows the placeholder.
   */
  get slots(): z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodArray<typeof designNode>>> {
    return z.record(z.string(), z.array(designNode)).optional()
  }
})

/** A placed copy of one of the project's component designs, with values for its params. */
export type InstanceNode = z.infer<typeof instanceNode>

export const imageFits = ["cover", "contain", "fill"] as const

/** Who made a stock image and where it came from, as an image node or a dragged image holds it. */
export const imageCredit = fileObject({
  name: z.string(),
  url: z.string(),
  /** The library it came from. */
  source: z.string().optional()
})

export type ImageCredit = z.infer<typeof imageCredit>

/** What a project keeps about one of its image files: what it shows, and who made it. */
export const imageDetails = fileObject({
  alt: z.string().optional(),
  credit: imageCredit.optional()
})

export type ImageDetails = z.infer<typeof imageDetails>

const imageNode = nodeBase.extend({
  type: z.literal("image"),
  /** A URL, or a path the project's dev server serves, like `/images/photo.jpg`. */
  src: z.string(),
  alt: z.string().optional(),
  /** How it fills its box: cropped to cover it (the default), shown whole, or stretched. */
  fit: z.enum(imageFits).optional(),
  /** Who made it and where it came from, for photos that ask to be credited. */
  credit: imageCredit.optional()
})

/** A picture: a file in the project, or a photo from a stock library saved into it. */
export type ImageNode = z.infer<typeof imageNode>

const videoNode = nodeBase.extend({
  type: z.literal("video"),
  /** A URL, or a path the project's dev server serves, like `/videos/waves.mp4`. */
  src: z.string(),
  /** What it shows, for screen readers, as its `aria-label`. */
  alt: z.string().optional(),
  /** How it fills its box: cropped to cover it (the default), shown whole, or stretched. */
  fit: z.enum(imageFits).optional(),
  /**
   * Shows the browser's controls and waits to be played. Without them it plays by itself, without sound, round and
   * round, as a video behind a page's heading does.
   */
  controls: z.boolean().optional(),
  /** Who made it and where it came from, for stock footage that asks to be credited. */
  credit: imageCredit.optional()
})

/** A video: a file in the project, or stock footage saved into it (PAR-841). */
export type VideoNode = z.infer<typeof videoNode>

const designNode = z.discriminatedUnion("type", [
  layoutNode,
  componentNode,
  textNode,
  instanceNode,
  imageNode,
  videoNode
])

export type DesignNode = z.infer<typeof designNode>

/** A node tree as a design or an insertion holds it, each node with an id of its own. */
export const nodeTree = designNode.superRefine((root, context) => {
  const ids = new Set<string>()

  const visit = (node: DesignNode, path: PropertyKey[]): void => {
    if (ids.has(node.id)) {
      problem(context, [...path, "id"], `duplicate node id "${node.id}"`)
    }

    ids.add(node.id)

    if (node.type === "layout") {
      for (const [index, child] of node.children.entries()) {
        visit(child, [...path, "children", index])
      }
    } else if (node.type === "component" || node.type === "instance") {
      for (const [slot, children] of Object.entries(node.slots ?? {})) {
        for (const [index, child] of children.entries()) {
          visit(child, [...path, "slots", slot, index])
        }
      }
    }
  }

  visit(root, [])
})

/** Calls `visit` for every node in a tree, depth first, including nodes in slots. */
export function walkNodes(node: DesignNode, visit: (node: DesignNode, depth: number) => void, depth = 0): void {
  visit(node, depth)
  let children: DesignNode[] = []

  if (node.type === "layout") {
    children = node.children
  } else if (node.type === "component" || node.type === "instance") {
    children = Object.values(node.slots ?? {}).flat()
  }

  for (const child of children) {
    walkNodes(child, visit, depth + 1)
  }
}

export const containerKinds = ["screen", "component", "frame"] as const

/**
 * What a design is. A screen is a whole page or view; a component is a reusable piece that screens place as instances.
 * A frame is the light kind, for sketching on the canvas: a layout drawn once, at its own `size`, in the project's
 * primary mode, with one state, no params, no modes beside it, and no code written from it. Only a top-level design is
 * a frame; one placed inside another design becomes a layout there.
 */
export type ContainerKind = (typeof containerKinds)[number]

const frameSize = fileObject({ width: finiteNumber.optional(), height: finiteNumber.optional() })

export type FrameSize = z.infer<typeof frameSize>

const variantOption = fileObject({
  id: z.string(),
  name: z.string(),
  /**
   * Patches keyed by node id, or by `instance/inner` for a node inside an instance. They apply over the design and
   * under its states.
   */
  overrides: nodePatches.optional()
})

/** One choice of a variant param, like "Large" for size. */
export type VariantOption = z.infer<typeof variantOption>

export const paramTypes = ["text", "boolean", "number", "value", "variant"] as const

const paramSpec = fileObject({
  type: z.enum(paramTypes),
  /** A variant's default is the id of one of its options; unset means the first. */
  default: z.unknown().optional(),
  description: z.string().optional(),
  /** A variant's choices: size small, medium or large. Each option patches the design, the way a state does. */
  options: z.array(variantOption).optional()
}).superRefine((param, context) => {
  const ids = new Set<string>()

  for (const [index, { id }] of (param.options ?? []).entries()) {
    if (ids.has(id)) {
      problem(context, ["options", index, "id"], `duplicate option id "${id}"`)
    }

    ids.add(id)
  }

  if (param.type === "variant" && !param.options?.length) {
    problem(context, ["options"], "a variant needs options")
  }

  if (param.type !== "variant" && param.options) {
    problem(context, ["options"], "only variants have options")
  }
})

/** One input of a component design. Its default is what the component shows on its own board. */
export type ParamSpec = z.infer<typeof paramSpec>

const containerViewSettings = fileObject({
  /** The mode of the main frame. Defaults to the project's primary mode. */
  mode: z.string().optional(),
  /** Other modes shown beside the main frame. */
  modes: z.array(z.string()).optional(),
  /** The state the canvas shows. Defaults to the first. */
  state: z.string().optional(),
  /** Show every state, one row each, instead of only the active one. */
  allStates: z.boolean().optional(),
  /** The option the board shows for each variant param, by option id. Unset ones show their default. */
  variants: z.record(z.string(), z.string()).optional()
})

/** How a design is shown on the canvas. None of it changes the design itself. */
export type ContainerViewSettings = z.infer<typeof containerViewSettings>

const stateSpec = fileObject({
  id: z.string(),
  name: z.string(),
  /**
   * Patches keyed by node id, or by `instance/inner` for a node inside an instance. A state wins over a viewport's
   * responsive patch and over the design's variants.
   */
  overrides: nodePatches.optional()
})

export type StateSpec = z.infer<typeof stateSpec>

/** One design, as a project file or the clipboard holds it (see `ContainerSpec`). */
export const containerSpec = fileObject({
  id: z.string(),
  name: z.string(),
  /** Defaults to `screen`. */
  kind: z.enum(containerKinds).optional(),
  position,
  /** Kept from being selected or moved on the canvas, with every layer in it; it's still selected from Layers. */
  locked: z.boolean().optional(),
  root: nodeTree,
  states: z.array(stateSpec).min(1, "expected at least one state"),
  view: containerViewSettings.optional(),
  /** A component's inputs. Instances pass values for them; nodes inside bind to them. */
  params: z.record(z.string(), paramSpec).optional(),
  /**
   * Components this design sits inside when shown on its own board, outermost first, like a Storybook decorator: a
   * table row needs a table around it to render properly.
   */
  context: z.array(fileObject({ component: z.string(), props: plainObject.optional() })).optional(),
  /**
   * A screen's or component's frame sizes in CSS pixels, keyed by viewport option id. Without one, a frame is as wide
   * as its mode's viewport and as tall as its content.
   */
  frames: z.record(z.string(), frameSize).optional(),
  /**
   * A frame's own size in CSS pixels, whatever the project's viewports are. Without a width it's as wide as the primary
   * mode's viewport, and without a height as tall as its content. Only a frame has one.
   */
  size: frameSize.optional()
}).superRefine((container, context) => {
  const ids = new Set<string>()
  const slots = new Set<string>()
  walkNodes(container.root, (node) => {
    ids.add(node.id)

    if (node.type !== "layout" || node.slot === undefined) {
      return
    }

    const unusable = slotNameProblem(node.slot)

    if (unusable) {
      problem(context, ["root"], `layer "${node.id}" is a slot whose name ${unusable}`)
    } else if (slots.has(node.slot)) {
      problem(context, ["root"], `two layers are the slot "${node.slot}"`)
    }

    slots.add(node.slot)
  })

  for (const [index, state] of container.states.entries()) {
    checkPatchKeys(state.overrides, ids, context, ["states", index, "overrides"])
  }

  if (container.kind === "frame") {
    checkFrame(container, context)
  } else if (container.size !== undefined) {
    problem(context, ["size"], `only a frame has a size of its own; size a ${container.kind ?? "screen"} in frames`)
  }

  for (const [name, param] of Object.entries(container.params ?? {})) {
    for (const [index, option] of (param.options ?? []).entries()) {
      checkPatchKeys(option.overrides, ids, context, ["params", name, "options", index, "overrides"])
    }
  }
})

/**
 * One design, like a Storybook CSF file. `root` is the design itself. States are authored and patch nodes (content,
 * props, visibility). Modes are project-wide (see `ModeSettings`); every design can be rendered in any of them, and
 * `view` records which ones this design shows next to its primary frame.
 */
export type ContainerSpec = z.infer<typeof containerSpec>

/**
 * A design's patches keyed by its own nodes. A key names a node of the design, or starts with one: `instance/inner`
 * reaches inside an instance, which can't be checked without the component.
 */
function checkPatchKeys(
  patches: Record<string, NodePatch> | undefined,
  ids: ReadonlySet<string>,
  context: z.RefinementCtx,
  path: PropertyKey[]
): void {
  for (const key of Object.keys(patches ?? {})) {
    const [node] = key.split("/")

    if (!ids.has(node)) {
      problem(context, [...path, key], "no node has this id")
    }
  }
}

/**
 * What a frame may hold: a layout at its root and one state, drawn as its layers are, with no params, no view (it
 * shows only the primary mode and that state) and no sizes per viewport, since it has one of its own.
 */
function checkFrame(frame: ContainerSpec, context: z.RefinementCtx): void {
  if (frame.root.type !== "layout") {
    problem(context, ["root"], "a frame's root is a layout")
  }

  if (frame.states.length > 1) {
    problem(context, ["states"], "a frame has one state")
  }

  if (Object.keys(frame.states[0]?.overrides ?? {}).length > 0) {
    problem(context, ["states", 0, "overrides"], "a frame is drawn as its layers are")
  }

  if (frame.params !== undefined) {
    problem(context, ["params"], "a frame has no params")
  }

  if (frame.view !== undefined) {
    problem(context, ["view"], "a frame shows only the primary mode and its one state")
  }

  if (frame.frames !== undefined) {
    problem(context, ["frames"], "a frame's size is in size, not per viewport")
  }
}

/** A rule's problem with the value it checks, at `path` inside that value. */
function problem(context: z.RefinementCtx, path: PropertyKey[], message: string): void {
  context.addIssue({ code: "custom", message, path })
}

/** A project file's schema, which the project service also checks a saved document with (PAR-565). */
export const canvasDocument = fileObject({
  version: z.literal(3),
  containers: z.array(containerSpec),
  /** The project's modes. Unset means the defaults. */
  modes: modeSettings.optional(),
  /** Text placed on the canvas itself, outside any design: annotations, flow labels, explanations. */
  notes: z.array(noteSpec).optional(),
  /** Screens from real apps placed beside designs to look at, never part of them. */
  references: z.array(referenceSpec).optional(),
  /** Where the person corrected which exports are components. Unset while detection gets them right. */
  detection: detectionCorrections.optional(),
  /** Where the person put tables, operations and routes on the canvas. The models are read from the project. */
  objects: canvasObjects.optional(),
  /** Links the person drew by hand. Links found in code or traces are read each time and never saved. */
  links: linkSpecs.optional(),
  /** The source each lens reads, where the person switched from the one Parity picked. */
  sources: lensSources.optional(),
  /**
   * What the project knows about its image files that the files don't say, by each file's path from the root: what a
   * stock picture shows and who made it, kept as it's added to the project, so the Media tab can credit it before any
   * layer shows it.
   */
  images: z.record(z.string().min(1), imageDetails).optional()
})

/**
 * A project file (`.par`): every design (screens and components), free text notes, and the project's modes. One file
 * per project keeps a design system in one place, like a Figma file.
 */
export type CanvasDocument = z.infer<typeof canvasDocument>

/** Reads a project file, or throws `TypeError` with the first problem as `/json/pointer: message`. */
export const parseCanvasDocument = parserFor(canvasDocument)

/** Validates one node tree on its own, as agents insert them. `path` is where it sits, for the error's pointer. */
export const parseDesignNode = parserFor(nodeTree)

/** Validates a state's or viewport's patch on its own. `path` is where it sits, for the error's pointer. */
export const parseNodePatch = parserFor(nodePatch)
