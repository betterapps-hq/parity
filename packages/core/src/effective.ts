import type { ContainerSpec, DesignNode, InstanceNode, NodePatch } from "./document.ts"
import { childEntries, locateNode, type NodeLocation } from "./edit.ts"
import { applyPatch, type EvalContext, type EvalScope, instanceScope, nodePatch, scopeOf } from "./render.ts"

/**
 * A layer found by its path, the way the canvas names it: a design's own node by its id, or a node inside an instance
 * by the instance's id, then the node's id in the component, with nested instances' ids between (`card/title`,
 * `card/avatar/initials`).
 */
export interface EffectiveLocation {
  /** The design the node belongs to: the one evaluated, or the innermost component around the node. */
  design: ContainerSpec
  /** The node as that design has it, and where it sits there. */
  node: DesignNode
  location: NodeLocation
  /** The instances from the design's own one down to the one directly around the node; empty for its own nodes. */
  chain: InstanceNode[]
  /** The layers and args the node is evaluated with. */
  scope: EvalScope
  /** Everything patched over the node: its responsive patch, then every layer's. */
  patch: NodePatch
  /** The node as it's drawn. */
  shown: DesignNode
}

/** Finds a layer by its path and evaluates it in a context: `effectiveNode`, with where it was found. */
export function locateEffective(
  container: ContainerSpec,
  path: string,
  context: EvalContext = {}
): EffectiveLocation | undefined {
  const library = context.library ?? new Map<string, ContainerSpec>()
  let scope = scopeOf(container, context)
  let design = container
  const chain: InstanceNode[] = []
  const segments = path.split("/")
  for (const [index, segment] of segments.entries()) {
    const location = locateNode(design.root, segment)
    if (!location) return undefined
    const node = location.node
    const patch = nodePatch(scope.layers, node, context.viewport)
    if (index === segments.length - 1) {
      return { design, node, location, chain, scope, patch, shown: applyPatch(node, patch, scope.args) }
    }
    const component = node.type === "instance" ? library.get(node.design) : undefined
    if (node.type !== "instance" || !component || containsItself(chain, component)) return undefined
    scope = instanceScope(node, component, patch, scope.layers)
    design = component
    chain.push(node)
  }
  return undefined
}

/**
 * Whether a component is already being expanded by one of these instances, as `resolveDesign` judges it: the design
 * being evaluated isn't on the list, so a design that places itself shows one copy, whose own copy stops.
 */
function containsItself(chain: readonly InstanceNode[], component: ContainerSpec): boolean {
  return chain.some((instance) => instance.design === component.id)
}

/**
 * A layer as it's drawn in a context: one of the design's own nodes, or one inside an instance by its path, with its
 * responsive patch, the variant options, the state and, inside instances, what each instance changes applied, and
 * the params it binds filled in. Undefined when the path doesn't lead to a node.
 */
export function effectiveNode(container: ContainerSpec, id: string, context: EvalContext = {}): DesignNode | undefined {
  return locateEffective(container, id, context)?.shown
}

/** A layer as it's drawn, with what's drawn inside it. */
export interface EffectiveTree {
  /** The layer's path: its id in the design, or `instance/inner` inside an instance. */
  path: string
  /**
   * The node as it's drawn (see `effectiveNode`). A layout's children and a component's slots are still the design's
   * own; `children` has them as drawn.
   */
  node: DesignNode
  /** The component slot the layer is in, when its parent is a component. */
  slot?: string
  /**
   * What's drawn inside it: a layout's children, a component's slots in order, or an instance's component root. That
   * root's path is `instance/rootId`, though the canvas draws it under the instance's own id.
   */
  children: EffectiveTree[]
}

/**
 * A layer and everything inside it as it's drawn in a context, down through instances. Hidden layers are kept, marked
 * hidden, with what's inside them, so a caller can tell what the canvas leaves out from what isn't there. An instance
 * of a missing component, or of one around it, has no children.
 */
export function effectiveTree(
  container: ContainerSpec,
  id: string,
  context: EvalContext = {}
): EffectiveTree | undefined {
  const found = locateEffective(container, id, context)
  if (!found) return undefined
  const library = context.library ?? new Map<string, ContainerSpec>()
  const build = (
    node: DesignNode,
    path: string,
    scope: EvalScope,
    chain: readonly InstanceNode[],
    patch: NodePatch,
    slot?: string
  ): EffectiveTree => {
    const prefix = path.slice(0, path.length - node.id.length)
    const inside = (child: DesignNode, childSlot?: string) => {
      const childPatch = nodePatch(scope.layers, child, context.viewport)
      return build(child, `${prefix}${child.id}`, scope, chain, childPatch, childSlot)
    }
    let children: EffectiveTree[] = []
    if (node.type === "instance") {
      const component = library.get(node.design)
      if (component && !containsItself(chain, component)) {
        const inner = instanceScope(node, component, patch, scope.layers)
        const root = component.root
        const rootPatch = nodePatch(inner.layers, root, context.viewport)
        children = [build(root, `${path}/${root.id}`, inner, [...chain, node], rootPatch)]
      }
    } else {
      children = childEntries(node).flatMap((entry) => entry.nodes.map((child) => inside(child, entry.slot)))
    }
    return {
      path,
      node: applyPatch(node, patch, scope.args),
      ...(slot === undefined ? {} : { slot }),
      children
    }
  }
  return build(found.node, id, found.scope, found.chain, found.patch, found.location.slot)
}
