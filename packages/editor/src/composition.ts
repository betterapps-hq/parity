import {
  type ComponentInfo,
  type ComponentRenderStatus,
  type ComponentSource,
  type DesignNode,
  describeRenderStatus,
  isSampleElement,
  isSampleRender,
  type ParentSignal,
  renderProblem,
  renderSlotKey,
  renderSlotOf,
  withLibraryContext
} from "@parity-app/core"
import { nodeForItem } from "./insert.ts"

/**
 * What a component needs around it and holds inside it, for agents to read before they insert it (PAR-454). It's read
 * from the same library metadata the Assets panel inserts with, and its example is the tree the Components panel draws.
 */
export interface ComponentComposition {
  component: string
  /**
   * `provider` when it draws nothing of its own and only gives the parts inside it their context (`SidebarProvider`);
   * `wrapper` when it draws and other parts need it around them (`Sidebar`); `component` otherwise.
   */
  role: "provider" | "wrapper" | "component"
  parents: CompositionParents
  /** The parts that need it as their nearest parent, by component id. */
  holds: string[]
  /** Where it takes other layers: its children, props whose value is elements, and render functions. */
  slots: CompositionSlot[]
  example: CompositionExample
}

/**
 * The components it has to go inside: `listed` by its library, outermost first; `none`, when its library lists none or
 * it has drawn on its own; `unknown`, when nothing says, or it fails to draw for want of a provider no library names.
 */
export type CompositionParents =
  | { status: "listed"; chain: CompositionParent[]; from?: ParentSignal }
  | { status: "none" }
  | { status: "unknown"; reason: string }

export interface CompositionParent {
  component: string
  /** Left out when the parents outside it are already there, as `DropdownMenuGroup` is. */
  optional?: true
}

export interface CompositionSlot {
  /** The prop it fills: `children`, or one such as `icon` or `render`. */
  name: string
  /** The key a component node's `slots` holds its layers under, as `children` or `$render:children`. */
  key: string
  /** `children`, a prop whose value is `element`s, or a `render` function the layers are what it returns. */
  kind: "children" | "element" | "render"
}

/**
 * The smallest composition that draws it: the component with its parents and sample, as inserting it into an empty
 * layout places it. `Insert` takes `node` as it is. `drawn` when the component has drawn on the canvas without errors,
 * `failing` with why when it hasn't, and `untried` when it hasn't been drawn yet.
 */
export interface CompositionExample {
  node: DesignNode
  status: "drawn" | "failing" | "untried"
  reason?: string
}

/** What a composition is read from: the project's component sources and props, and how each has drawn so far. */
export interface CompositionContext {
  sources: Record<string, ComponentSource>
  props: Record<string, ComponentInfo>
  renderStatus?: Record<string, ComponentRenderStatus>
}

/** A component's composition: its role, the parents it needs, the parts it holds, its slots and a working example. */
export function componentComposition(component: string, context: CompositionContext): ComponentComposition {
  const source = context.sources[component]
  const status = context.renderStatus?.[component]

  const holds = Object.entries(context.sources)
    .filter(([, other]) => other.parents?.at(-1) === component)
    .map(([id]) => id)
    .sort()

  let role: ComponentComposition["role"] = "component"

  if (source?.visual === false) {
    role = "provider"
  } else if (holds.length > 0) {
    role = "wrapper"
  }

  return {
    component,
    role,
    parents: parentsOf(source, status),
    holds,
    slots: slotsOf(source, context.props[component]),
    example: {
      node: componentExample(component, context.props[component], context.sources),
      ...exampleStatus(status)
    }
  }
}

/**
 * What inserting a component into an empty layout places: its sample, inside the parents a part needs. Its layers are
 * numbered in order rather than given fresh ids, so the same component gives the same tree every time.
 */
export function componentExample(
  component: string,
  info: ComponentInfo | undefined,
  sources: Record<string, ComponentSource>
): DesignNode {
  const taken = new Set<string>()
  const part = nodeForItem({ kind: "component", component }, info, taken)

  return numbered(withLibraryContext(part, sources, [], taken), { next: 1 })
}

function parentsOf(source: ComponentSource | undefined, status: ComponentRenderStatus | undefined): CompositionParents {
  if (source?.parents?.length) {
    const optional = new Set(source.optionalParents ?? [])

    return {
      status: "listed",
      chain: source.parents.map((component) => ({
        component,
        ...(optional.has(component) ? { optional: true as const } : {})
      })),
      ...(source.parentsFrom ? { from: source.parentsFrom } : {})
    }
  }

  if (status && "error" in status && renderProblem(status.error) === "provider") {
    return { status: "unknown", reason: describeRenderStatus(status) }
  }

  if (source?.library || (status && "drawn" in status)) {
    return { status: "none" }
  }

  return {
    status: "unknown",
    reason: "The project's own components don't say what they need around them, and it hasn't drawn yet."
  }
}

function slotsOf(source: ComponentSource | undefined, info: ComponentInfo | undefined): CompositionSlot[] {
  const slots = new Map<string, CompositionSlot>()

  for (const prop of info?.props ?? []) {
    if (prop.kind !== "node") {
      continue
    }

    slots.set(prop.name, { name: prop.name, key: prop.name, kind: prop.name === "children" ? "children" : "element" })
  }

  const sample = source?.sample

  for (const [name, value] of Object.entries(sample?.props ?? {})) {
    if (isSampleElement(value)) {
      slots.set(name, { name, key: name, kind: "element" })
    }
  }

  const render = renderSlotOf(sample)

  if (render) {
    slots.set(render.prop, { name: render.prop, key: renderSlotKey(render.prop, render.render), kind: "render" })
  }

  // A library part whose sample holds children takes them, though its props haven't been read yet.
  if (!slots.has("children") && sample?.children?.some((child) => !isSampleRender(child))) {
    slots.set("children", { name: "children", key: "children", kind: "children" })
  }

  return [...slots.values()].sort((a, b) => Number(b.name === "children") - Number(a.name === "children"))
}

function exampleStatus(status: ComponentRenderStatus | undefined): Omit<CompositionExample, "node"> {
  if (!status) {
    return { status: "untried" }
  }

  if ("drawn" in status) {
    return { status: "drawn" }
  }

  return { status: "failing", reason: describeRenderStatus(status) }
}

/** A node with its layers' ids replaced by `p1`, `p2` and on, in the order they're met. */
function numbered(node: DesignNode, count: { next: number }): DesignNode {
  const id = `p${count.next++}`

  if (node.type === "layout") {
    return { ...node, id, children: node.children.map((child) => numbered(child, count)) }
  }

  if (node.type === "component" && node.slots) {
    const slots = Object.entries(node.slots).map(
      ([slot, children]) => [slot, children.map((child) => numbered(child, count))] as const
    )

    return { ...node, id, slots: Object.fromEntries(slots) }
  }

  return { ...node, id }
}
