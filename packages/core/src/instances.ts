import type { ContainerSpec, DesignNode, InstanceNode, NodePatch, StateSpec } from "./document.ts"
import {
  childEntries,
  editNode,
  type EditTarget,
  editsDesign,
  findNode,
  generateId,
  mapNode,
  mapPatches,
  type NodeChange,
  type NodeLocation,
  nodeIds,
  type PatchField,
  patchSize,
  patchWith,
  patchWithout,
  targetPatches,
  tidyPatch,
  withTargetPatches
} from "./edit.ts"
import { effectiveNode, locateEffective } from "./effective.ts"
import {
  applyPatch,
  type ComponentLibrary,
  instanceScope,
  layeredPatch,
  mergePatches,
  type PatchLayer,
  variantChoices,
  withinInstance
} from "./render.ts"

/**
 * A node inside an instance, found by its path: the instance's id, then the node's id in the component, with nested
 * instances' ids between, the way the canvas names rendered nodes (`card/title`, `card/avatar/initials`).
 */
export interface InnerNode {
  /** The instance in the design that the path starts at. */
  instance: InstanceNode
  /** The node's path below that instance: its key in the instance's overrides. */
  key: string
  /** The instances from that one down to the one directly around the node. */
  chain: InstanceNode[]
  /** The component design the node belongs to: the innermost one. */
  component: ContainerSpec
  /** The node as its component design has it, and where it sits there. */
  node: DesignNode
  location: NodeLocation
  /** The node as this copy shows it: every patch over it applied, and its bound params filled in. */
  shown: DesignNode
}

/** Whether a selected node id points inside an instance rather than at one of the design's own nodes. */
export function isInnerPath(id: string): boolean {
  return id.includes("/")
}

/**
 * A layer as a design's board shows it in a state: one of the design's own nodes with the variant options the board
 * shows, the state's changes and the params it binds, or a node inside an instance as that copy shows it there. What
 * the text editor opens on. It's `effectiveNode` with no viewport.
 */
export function layerOnBoard(
  container: ContainerSpec,
  id: string,
  library: ComponentLibrary,
  state?: StateSpec
): DesignNode | undefined {
  return effectiveNode(container, id, { library, state })
}

/**
 * Finds a node inside one of a design's instances. `state` and `variants` are what the design shows; without them it's
 * the base state with every variant at its default. `viewport` applies its responsive patches; without it, none.
 */
export function locateInner(
  container: ContainerSpec,
  path: string,
  library: ComponentLibrary,
  view: { state?: StateSpec; variants?: Record<string, unknown>; viewport?: string } = {}
): InnerNode | undefined {
  if (!isInnerPath(path)) return undefined
  const found = locateEffective(container, path, { ...view, variants: view.variants ?? {}, library })
  const instance = found?.chain[0]
  if (!found || !instance) return undefined
  return {
    instance,
    key: path.slice(path.indexOf("/") + 1),
    chain: found.chain,
    component: found.design,
    node: found.node,
    location: found.location,
    shown: found.shown
  }
}

/** The path of the instance directly around a node inside an instance: `card` for `card/title`. */
function holderPath(path: string): string {
  return path.slice(0, path.lastIndexOf("/"))
}

/**
 * The part of a change to a node that its component binds to params, as values for those params: a bound text, prop
 * or visibility is changed by giving the instance around it a value, so the copy keeps following its param.
 */
function boundArgs(node: DesignNode, change: NodeChange): { args?: Record<string, unknown>; rest: NodeChange } {
  const bind = node.bind
  if (!bind) return { rest: change }
  const args: Record<string, unknown> = {}
  const rest: NodeChange = { ...change }
  if (Object.hasOwn(change, "text") && bind.text) {
    args[bind.text] = change.text
    delete rest.text
  }
  if (Object.hasOwn(change, "hidden") && bind.visible) {
    args[bind.visible] = change.hidden === undefined ? undefined : !change.hidden
    delete rest.hidden
  }
  if (change.props && bind.props) {
    const props = { ...change.props }
    for (const [prop, param] of Object.entries(bind.props)) {
      if (!Object.hasOwn(props, prop)) continue
      args[param] = props[prop]
      delete props[prop]
    }
    if (Object.keys(props).length > 0) rest.props = props
    else delete rest.props
  }
  return Object.keys(args).length > 0 ? { args, rest } : { rest }
}

function isEmptyChange(change: NodeChange): boolean {
  return Object.keys(change).length === 0
}

/** Changes a node of the design, or one inside an instance, by its path. */
function editAt(
  container: ContainerSpec,
  target: string | EditTarget,
  path: string,
  change: NodeChange,
  library: ComponentLibrary
): ContainerSpec {
  return path.includes("/")
    ? editInner(container, target, path, change, library)
    : editNode(container, target, path, change)
}

/**
 * Writes a change to a node inside an instance. In the base state it's the instance's own override: only this copy
 * changes, and it stays linked to the component for everything else. In another state, or a variant option, it's that
 * state's or option's patch for the node's path. A text, prop or visibility the component binds to a param sets the
 * param's value on the instance around the node instead.
 */
export function editInner(
  container: ContainerSpec,
  target: string | EditTarget,
  path: string,
  change: NodeChange,
  library: ComponentLibrary
): ContainerSpec {
  const inner = locateInner(container, path, library)
  if (!inner) throw new Error(`No layer "${path}" in ${container.name}`)
  const { args, rest } = boundArgs(inner.node, change)
  let next = args ? editAt(container, target, holderPath(path), { props: args }, library) : container
  if (isEmptyChange(rest)) return next

  if (editsDesign(next, target)) {
    const without = setOverride(next, inner.instance.id, inner.key, undefined)
    const under = locateInner(without, path, library)!.shown
    const instance = findNode(next.root, inner.instance.id) as InstanceNode
    return setOverrides(next, instance.id, patchWith(instance.overrides, inner.key, under, rest))
  }
  const under = locateInner(next, path, library)!.shown
  next = withTargetPatches(next, target, patchWith(targetPatches(next, target), path, under, rest))
  return next
}

/**
 * Undoes a change to a node inside an instance: one field, or everything changed about it in the state or variant
 * being edited, including the param values its bound fields took.
 */
export function resetInner(
  container: ContainerSpec,
  target: string | EditTarget,
  path: string,
  library: ComponentLibrary,
  field?: PatchField
): ContainerSpec {
  const inner = locateInner(container, path, library)
  if (!inner) return container
  const bound = boundParams(inner.node, field)
  let next =
    bound.length > 0
      ? editAt(
          container,
          target,
          holderPath(path),
          { props: Object.fromEntries(bound.map((param) => [param, undefined])) },
          library
        )
      : container
  if (editsDesign(next, target)) {
    const instance = findNode(next.root, inner.instance.id) as InstanceNode
    const overrides = patchWithout(instance.overrides, inner.key, field)
    return overrides === instance.overrides ? next : setOverrides(next, instance.id, overrides)
  }
  const patches = targetPatches(next, target)
  const without = patchWithout(patches, path, field)
  if (without !== patches) next = withTargetPatches(next, target, without)
  return next
}

/** The params a node's field is bound to; every bound param when no field is given. */
function boundParams(node: DesignNode, field: PatchField | undefined): string[] {
  const bind = node.bind
  if (!bind) return []
  if (!field)
    return [bind.text, bind.visible, ...Object.values(bind.props ?? {})].filter((param) => param !== undefined)
  if (field.kind === "text") return bind.text ? [bind.text] : []
  if (field.kind === "hidden") return bind.visible ? [bind.visible] : []
  if (field.kind === "props") return bind.props?.[field.key] ? [bind.props[field.key]!] : []
  return []
}

/**
 * What the state or variant being edited changes about a node inside an instance, as a patch: its own patch, plus
 * the fields whose bound params it gives values other than their defaults. The inspector marks these and offers to
 * reset them.
 */
export function innerChanges(
  container: ContainerSpec,
  target: string | EditTarget,
  path: string,
  library: ComponentLibrary
): NodePatch {
  const inner = locateInner(container, path, library)
  if (!inner) return {}
  const design = editsDesign(container, target)
  const own = design ? inner.instance.overrides?.[inner.key] : targetPatches(container, target)?.[path]
  // The values given to the params of the instance directly around the node.
  const holder = holderPath(path)
  const outer = inner.chain.length > 1 ? inner.instance.overrides?.[holder.slice(holder.indexOf("/") + 1)] : undefined
  let given: Record<string, unknown> | undefined
  if (design) given = inner.chain.length > 1 ? outer?.props : inner.instance.args
  else given = targetPatches(container, target)?.[holder]?.props
  const bind = inner.node.bind
  const changes: NodePatch = { ...own }
  // A value the copy gives a param counts when it differs from the param's default, as in Figma.
  const params = inner.component.params ?? {}
  const has = (param: string | undefined) =>
    param !== undefined &&
    !!given &&
    Object.hasOwn(given, param) &&
    JSON.stringify(given[param]) !== JSON.stringify(params[param]?.default)
  if (has(bind?.text)) changes.text = String(given![bind!.text!])
  if (has(bind?.visible)) changes.hidden = !given![bind!.visible!]
  for (const [prop, param] of Object.entries(bind?.props ?? {})) {
    if (has(param)) changes.props = { ...changes.props, [prop]: given![param] }
  }
  return changes
}

/** How many values this copy changes inside its component. */
export function overrideCount(instance: InstanceNode): number {
  return Object.values(instance.overrides ?? {}).reduce((total, patch) => total + patchSize(patch), 0)
}

function setOverrides(container: ContainerSpec, instanceId: string, overrides: PatchLayer): ContainerSpec {
  return {
    ...container,
    root: mapNode(container.root, instanceId, (node) => {
      if (node.type !== "instance") throw new Error(`"${instanceId}" isn't an instance`)
      const next: InstanceNode = { ...node }
      if (overrides && Object.keys(overrides).length > 0) next.overrides = overrides
      else delete next.overrides
      return next
    })
  }
}

function setOverride(container: ContainerSpec, instanceId: string, key: string, patch: NodePatch | undefined) {
  const instance = findNode(container.root, instanceId)
  if (instance?.type !== "instance") throw new Error(`"${instanceId}" isn't an instance`)
  const overrides = { ...instance.overrides }
  if (patch) overrides[key] = patch
  else delete overrides[key]
  return setOverrides(container, instanceId, overrides)
}

/** Drops everything an instance changes inside its component, so it shows the component as it is again. */
export function resetInstance(container: ContainerSpec, instanceId: string): ContainerSpec {
  return setOverrides(container, instanceId, undefined)
}

/**
 * Makes an instance's overrides the component's own, so every instance shows them, and drops them from the instance.
 * `keys` limits it to some inner nodes. Returns both designs.
 */
export function pushOverrides(
  container: ContainerSpec,
  instanceId: string,
  component: ContainerSpec,
  keys?: readonly string[]
): { container: ContainerSpec; component: ContainerSpec } {
  const instance = findNode(container.root, instanceId)
  if (instance?.type !== "instance") throw new Error(`"${instanceId}" isn't an instance`)
  if (instance.design !== component.id) throw new Error(`"${instanceId}" isn't an instance of ${component.name}`)
  const pushed = Object.entries(instance.overrides ?? {}).filter(([key]) => !keys || keys.includes(key))
  let main = component
  for (const [key, patch] of pushed) {
    const [first, ...rest] = key.split("/")
    if (!findNode(main.root, first!)) continue
    if (rest.length === 0) {
      main = editNode(main, main.states[0]!.id, first!, patchChange(patch))
      continue
    }
    // A node inside a nested instance: the nested instance takes it as its own override.
    const nested = findNode(main.root, first!) as InstanceNode
    const inside = rest.join("/")
    const merged = tidyPatch(mergePatches(nested.overrides?.[inside], patch))
    main = setOverride(main, first!, inside, merged)
  }
  const left = Object.fromEntries(
    Object.entries(instance.overrides ?? {}).filter(([key]) => !pushed.some(([done]) => done === key))
  )
  return { container: setOverrides(container, instanceId, left), component: main }
}

function patchChange(patch: NodePatch): NodeChange {
  const change: NodeChange = {}
  if (patch.hidden !== undefined) change.hidden = patch.hidden
  if (patch.text !== undefined) change.text = patch.text
  if (patch.props) change.props = patch.props
  if (patch.style) change.style = patch.style
  return change
}

/** Merges layers of patches into one, later layers winning per field. */
function flatten(layers: readonly PatchLayer[]): Record<string, NodePatch> | undefined {
  const keys = new Set(layers.flatMap((layer) => Object.keys(layer ?? {})))
  if (keys.size === 0) return undefined
  return Object.fromEntries([...keys].map((key) => [key, tidyPatch(layeredPatch(layers, key))]))
}

/**
 * Replaces an instance with a copy of what it shows, no longer linked to the component: its variants, state,
 * overrides and param values are baked in, and every node gets a fresh id except the root, which keeps the
 * instance's. Nested instances stay instances. Patches the design's states make inside the instance follow the nodes
 * to their new ids.
 */
export function detachInstance(container: ContainerSpec, instanceId: string, library: ComponentLibrary): ContainerSpec {
  const instance = findNode(container.root, instanceId)
  if (instance?.type !== "instance") throw new Error(`"${instanceId}" isn't an instance`)
  const component = library.get(instance.design)
  if (!component) throw new Error(`No component design "${instance.design}"`)
  const { layers, args } = instanceScope(instance, component, {}, [])
  const taken = nodeIds(container.root)
  const ids = new Map<string, string>()

  const bake = (node: DesignNode, root: boolean): DesignNode => {
    const id = root ? instance.id : generateId(taken)
    taken.add(id)
    ids.set(node.id, id)
    const next = { ...applyPatch(node, layeredPatch(layers, node.id), args), id } as DesignNode & { bind?: unknown }
    delete next.bind
    if (next.type === "instance") {
      const overrides = flatten([next.overrides, ...layers.map((layer) => withinInstance(layer, node.id))])
      if (overrides) next.overrides = overrides
      else delete next.overrides
    }
    if (next.type === "layout") next.children = next.children.map((child) => bake(child, false))
    if (next.type === "component" && next.slots) {
      next.slots = Object.fromEntries(
        childEntries(next).map((entry) => [entry.slot!, entry.nodes.map((child) => bake(child, false))])
      )
    }
    return next
  }

  const baked = bake(component.root, true)
  const responsive = { ...baked.responsive }
  for (const [viewport, patch] of Object.entries(instance.responsive ?? {})) {
    responsive[viewport] = tidyPatch(mergePatches(responsive[viewport], { ...patch, props: undefined }))
  }
  const root: DesignNode = {
    ...baked,
    name: instance.name ?? baked.name ?? component.name,
    ...(instance.hidden || baked.hidden ? { hidden: true } : {}),
    ...(instance.style || baked.style ? { style: { ...baked.style, ...instance.style } } : {}),
    ...(Object.keys(responsive).length > 0 ? { responsive } : {})
  }
  const replaced = { ...container, root: mapNode(container.root, instanceId, () => root) }
  return mapPatches(replaced, (key) => {
    const [first, second, ...rest] = key.split("/")
    if (first !== instanceId || second === undefined) return key
    const renamed = ids.get(second)
    return renamed === undefined ? undefined : [renamed, ...rest].join("/")
  })
}

/**
 * Points an instance at another component design. It keeps the param values the new component has params for, its
 * state if the new component has one with the same id, and the overrides for nodes the new component has too, by id
 * or by layer name; the rest are dropped, here and in the design's states and variants.
 */
export function swapInstance(
  container: ContainerSpec,
  instanceId: string,
  design: string,
  library: ComponentLibrary
): ContainerSpec {
  const instance = findNode(container.root, instanceId)
  if (instance?.type !== "instance") throw new Error(`"${instanceId}" isn't an instance`)
  const before = library.get(instance.design)
  const after = library.get(design)
  if (!after) throw new Error(`No component design "${design}"`)
  if (after.id === container.id) throw new Error(`${container.name} can't contain itself`)
  const counterpart = (id: string): string | undefined => {
    if (findNode(after.root, id)) return id
    const name = before && findNode(before.root, id)?.name
    if (!name) return undefined
    let found: string | undefined
    const visit = (node: DesignNode) => {
      if (!found && node.name === name) found = node.id
      for (const entry of childEntries(node)) entry.nodes.forEach(visit)
    }
    visit(after.root)
    return found
  }
  const renameKey = (key: string) => {
    const [first, ...rest] = key.split("/")
    const renamed = counterpart(first!)
    return renamed === undefined ? undefined : [renamed, ...rest].join("/")
  }

  const choices = variantChoices(after.params)
  const args = Object.fromEntries(
    Object.entries(instance.args ?? {}).filter(([name, value]) => {
      const param = after.params?.[name]
      if (!param) return false
      return param.type !== "variant" || param.options?.some((option) => option.id === value) || !choices[name]
    })
  )
  const overrides: Record<string, NodePatch> = {}
  for (const [key, patch] of Object.entries(instance.overrides ?? {})) {
    const renamed = renameKey(key)
    if (renamed !== undefined) overrides[renamed] = patch
  }
  const swapped: InstanceNode = { ...instance, design: after.id }
  delete swapped.args
  delete swapped.state
  delete swapped.overrides
  delete swapped.name
  if (instance.name && instance.name !== before?.name) swapped.name = instance.name
  if (Object.keys(args).length > 0) swapped.args = args
  if (instance.state && after.states.slice(1).some((state) => state.id === instance.state)) {
    swapped.state = instance.state
  }
  if (Object.keys(overrides).length > 0) swapped.overrides = overrides

  const next = { ...container, root: mapNode(container.root, instanceId, () => swapped) }
  return mapPatches(next, (key) => {
    const [first, ...rest] = key.split("/")
    if (first !== instanceId || rest.length === 0) return key
    const renamed = renameKey(rest.join("/"))
    return renamed === undefined ? undefined : `${instanceId}/${renamed}`
  })
}
