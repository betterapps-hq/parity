import type { ContainerSpec, DesignNode, NodePatch, NodeStyle, StateSpec } from "./document.ts"
import { uniqueId } from "./modes.ts"
import { boardArgs, layeredPatch, optionPatches, type PatchLayer, variantChoices } from "./render.ts"

/** Where a node sits in a design's tree. */
export interface NodeLocation {
  node: DesignNode
  /** Ancestors from the root down to the parent; empty for the root. */
  ancestors: DesignNode[]
  /** The component slot the node is in, when its parent is a component. */
  slot?: string
  index: number
}

/** The nodes directly inside a node, with the slot each is in (undefined for a layout's children). */
export function childEntries(node: DesignNode): { slot?: string; nodes: DesignNode[] }[] {
  if (node.type === "layout") return [{ nodes: node.children }]
  if (node.type === "component") return Object.entries(node.slots ?? {}).map(([slot, nodes]) => ({ slot, nodes }))
  return []
}

export function childNodes(node: DesignNode): DesignNode[] {
  return childEntries(node).flatMap((entry) => entry.nodes)
}

export function locateNode(root: DesignNode, id: string): NodeLocation | undefined {
  const search = (
    node: DesignNode,
    ancestors: DesignNode[],
    slot: string | undefined,
    index: number
  ): NodeLocation | undefined => {
    if (node.id === id) return { node, ancestors, slot, index }
    for (const entry of childEntries(node)) {
      for (const [childIndex, child] of entry.nodes.entries()) {
        const found: NodeLocation | undefined = search(child, [...ancestors, node], entry.slot, childIndex)
        if (found) return found
      }
    }
    return undefined
  }
  return search(root, [], undefined, 0)
}

export function findNode(root: DesignNode, id: string): DesignNode | undefined {
  return locateNode(root, id)?.node
}

export function nodeIds(root: DesignNode): Set<string> {
  const ids = new Set<string>()
  const visit = (node: DesignNode) => {
    ids.add(node.id)
    for (const child of childNodes(node)) visit(child)
  }
  visit(root)
  return ids
}

/**
 * What a node is called in the layers tree: its name, else what it is. An instance is called after its design when
 * `designName` knows it, and by the design's id otherwise.
 */
export function nodeLabel(node: DesignNode, designName?: (id: string) => string | undefined): string {
  if (node.name) return node.name
  if (node.type === "component") return node.component
  if (node.type === "instance") return designName?.(node.design) ?? node.design
  if (node.type === "text") return node.text.length > 40 ? `${node.text.slice(0, 40)}…` : node.text
  if (node.type === "image") return node.alt || "Image"
  return node.style?.direction === "row" ? "Row" : "Column"
}

/**
 * Replaces the node with `id` by what `update` returns; `undefined` removes it. Returns the same root when nothing
 * changed, so callers can skip saving.
 */
export function mapNode(
  root: DesignNode,
  id: string,
  update: (node: DesignNode) => DesignNode | undefined
): DesignNode {
  if (root.id === id) {
    const next = update(root)
    if (!next) throw new Error("The root of a design can't be removed")
    return next
  }
  const visit = (node: DesignNode): DesignNode | undefined => {
    if (node.id === id) return update(node)
    if (node.type === "layout") {
      const children = mapChildren(node.children, visit)
      return children === node.children ? node : { ...node, children }
    }
    if (node.type === "component" && node.slots) {
      let changed = false
      const slots: Record<string, DesignNode[]> = {}
      for (const [slot, nodes] of Object.entries(node.slots)) {
        slots[slot] = mapChildren(nodes, visit)
        changed ||= slots[slot] !== nodes
      }
      return changed ? { ...node, slots } : node
    }
    return node
  }
  return visit(root)!
}

function mapChildren(nodes: DesignNode[], visit: (node: DesignNode) => DesignNode | undefined): DesignNode[] {
  let changed = false
  const next: DesignNode[] = []
  for (const node of nodes) {
    const mapped = visit(node)
    changed ||= mapped !== node
    if (mapped) next.push(mapped)
  }
  return changed ? next : nodes
}

/** Inserts `node` into a layout, or into a component's slot (`children` unless named). */
export function insertNode(
  root: DesignNode,
  parentId: string,
  node: DesignNode,
  options: { index?: number; slot?: string } = {}
): DesignNode {
  const taken = nodeIds(root)
  for (const id of nodeIds(node)) {
    if (taken.has(id)) throw new Error(`A node with id "${id}" already exists in this design`)
  }
  const at = (list: DesignNode[]) => {
    const index = Math.max(0, Math.min(options.index ?? list.length, list.length))
    return [...list.slice(0, index), node, ...list.slice(index)]
  }
  let found = false
  const next = mapNode(root, parentId, (parent) => {
    found = true
    if (parent.type === "layout") return { ...parent, children: at(parent.children) }
    if (parent.type === "component") {
      const slot = options.slot ?? "children"
      return { ...parent, slots: { ...parent.slots, [slot]: at(parent.slots?.[slot] ?? []) } }
    }
    throw new Error(`"${parentId}" is a text node and can't contain other nodes`)
  })
  if (!found) throw new Error(`No node "${parentId}" in this design`)
  return next
}

export function removeNode(root: DesignNode, id: string): DesignNode {
  if (!locateNode(root, id)) throw new Error(`No node "${id}" in this design`)
  return mapNode(root, id, () => undefined)
}

/** Moves a node under a new parent (or within its own), keeping its id and everything inside it. */
export function moveNode(
  root: DesignNode,
  id: string,
  parentId: string,
  options: { index?: number; slot?: string } = {}
): DesignNode {
  const location = locateNode(root, id)
  if (!location) throw new Error(`No node "${id}" in this design`)
  if (location.ancestors.length === 0) throw new Error("The root of a design can't be moved")
  if (findNode(location.node, parentId)) throw new Error("A node can't be moved inside itself")
  const parent = location.ancestors.at(-1)!
  let index = options.index
  // Removing the node first shifts later siblings in the same list up by one.
  if (index !== undefined && parent.id === parentId && location.slot === options.slot && location.index < index) index--
  return insertNode(removeNode(root, id), parentId, location.node, { index, slot: options.slot })
}

const idAlphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"

/** A short random id that isn't in `taken`, for nodes and designs created in the editor or by agents. */
export function generateId(taken: ReadonlySet<string>, length = 5): string {
  for (;;) {
    let id = idAlphabet[Math.floor(Math.random() * 52)]!
    while (id.length < length) id += idAlphabet[Math.floor(Math.random() * idAlphabet.length)]
    if (!taken.has(id)) return id
  }
}

/** Gives `node` and everything in it fresh ids, so a copy can sit next to its original. */
export function withFreshIds(node: DesignNode, taken: Set<string>): DesignNode {
  const id = generateId(taken)
  taken.add(id)
  if (node.type === "layout") return { ...node, id, children: node.children.map((child) => withFreshIds(child, taken)) }
  if (node.type === "component" && node.slots) {
    const slots: Record<string, DesignNode[]> = {}
    for (const [slot, nodes] of Object.entries(node.slots))
      slots[slot] = nodes.map((child) => withFreshIds(child, taken))
    return { ...node, id, slots }
  }
  return { ...node, id }
}

// States ---------------------------------------------------------------------------------------------------------------

/** The first state is the base: the design as it is, with nothing overridden. Editing it edits the design itself. */
export function isBaseState(container: ContainerSpec, stateId: string): boolean {
  return container.states[0]?.id === stateId
}

export function findState(container: ContainerSpec, stateId: string): StateSpec {
  const state = container.states.find((candidate) => candidate.id === stateId)
  if (!state) throw new Error(`No state "${stateId}" in ${container.name}`)
  return state
}

export function changeCount(state: StateSpec): number {
  return Object.values(state.overrides ?? {}).reduce((total, patch) => total + patchSize(patch), 0)
}

export function patchSize(patch: NodePatch): number {
  return (
    (patch.hidden === undefined ? 0 : 1) +
    (patch.text === undefined ? 0 : 1) +
    Object.keys(patch.props ?? {}).length +
    Object.keys(patch.style ?? {}).length
  )
}

/**
 * A node as the board shows it: the variants' patches, then the state's, applied (viewport patches aside). `variants`
 * are the design's chosen options; leave them out for a design without variants. `args` fill in the params the node
 * binds, as `boardArgs` gives them.
 */
export function nodeInState(
  node: DesignNode,
  state: StateSpec | undefined,
  variants: readonly PatchLayer[] = [],
  args?: Record<string, unknown>
): DesignNode {
  const patch = layeredPatch([...variants, state?.overrides], node.id)
  return applyPatch(node, patch, args)
}

/** The patches of the variant options a design's board shows. */
export function shownVariants(container: ContainerSpec): PatchLayer[] {
  return optionPatches(container.params, variantChoices(container.params, container.view?.variants))
}

/**
 * One of a design's own nodes as its board shows it in a state: with the variant options the board shows, the state's
 * changes, and the defaults of the params it binds. This is what the board draws, so it's what the inspector, the text
 * editor and Hide start from.
 */
export function nodeOnBoard(container: ContainerSpec, node: DesignNode, state: StateSpec | undefined): DesignNode {
  const choices = variantChoices(container.params, container.view?.variants)
  return nodeInState(node, state, optionPatches(container.params, choices), boardArgs(container.params, choices))
}

/**
 * A node with a patch applied, and with the params it's bound to filled in from `args`, as it renders. Bindings are
 * dropped where `args` sets them, since the node then shows the value rather than following the param.
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
 * A change to one node. A key present with the value `undefined` clears it: in the base state that removes the value
 * from the design; in another state it removes the override, so the node goes back to its base value.
 */
export interface NodeChange {
  hidden?: boolean
  text?: string
  props?: Record<string, unknown>
  style?: { [K in keyof NodeStyle]?: NodeStyle[K] | undefined }
}

/**
 * Where an edit lands: a state; and in the base state, a variant option the board shows other than the default, which
 * then takes the edit instead of the design. A state other than the base always takes it itself.
 */
export interface EditTarget {
  state: string
  variant?: { param: string; option: string }
}

export function toEditTarget(target: string | EditTarget): EditTarget {
  return typeof target === "string" ? { state: target } : target
}

/**
 * Where edits go on a design's board in a state: the first variant showing an option other than its default, else
 * the state.
 */
export function boardTarget(container: ContainerSpec, stateId: string): EditTarget {
  const shown = variantChoices(container.params, container.view?.variants)
  const defaults = variantChoices(container.params)
  const param = Object.keys(shown).find((name) => shown[name] !== defaults[name])
  return param ? { state: stateId, variant: { param, option: shown[param]! } } : { state: stateId }
}

/** Whether an edit to `target` changes the design itself, rather than a state's or a variant's patches. */
export function editsDesign(container: ContainerSpec, target: string | EditTarget): boolean {
  const { state, variant } = toEditTarget(target)
  return isBaseState(container, state) && !variant
}

/** The patches an edit target writes: its state's, or its variant option's. Undefined for the design itself. */
export function targetPatches(container: ContainerSpec, target: string | EditTarget): PatchLayer {
  const { state, variant } = toEditTarget(target)
  if (!isBaseState(container, state)) return findState(container, state).overrides
  if (!variant) return undefined
  return findOption(container, variant.param, variant.option).overrides
}

/** Replaces an edit target's patches. */
export function withTargetPatches(
  container: ContainerSpec,
  target: string | EditTarget,
  patches: PatchLayer
): ContainerSpec {
  const { state: stateId, variant } = toEditTarget(target)
  const overrides = patches && Object.keys(patches).length > 0 ? patches : undefined
  if (!isBaseState(container, stateId)) return replaceState(container, { ...findState(container, stateId), overrides })
  if (!variant) throw new Error("The design itself has no patches")
  findOption(container, variant.param, variant.option)
  const param = container.params![variant.param]!
  const options = param.options!.map((option) => {
    if (option.id !== variant.option) return option
    const next = { id: option.id, name: option.name }
    return overrides ? { ...next, overrides } : next
  })
  return { ...container, params: { ...container.params, [variant.param]: { ...param, options } } }
}

function findOption(container: ContainerSpec, param: string, option: string) {
  const found = container.params?.[param]?.options?.find((candidate) => candidate.id === option)
  if (!found) throw new Error(`No option "${option}" for ${param} in ${container.name}`)
  return found
}

/**
 * Writes a change to a node: into the design in the base state; otherwise into the patches of the state, or of the
 * variant option, being edited.
 */
export function editNode(
  container: ContainerSpec,
  target: string | EditTarget,
  nodeId: string,
  change: NodeChange
): ContainerSpec {
  const base = findNode(container.root, nodeId)
  if (!base) throw new Error(`No node "${nodeId}" in ${container.name}`)
  if (editsDesign(container, target)) {
    const root = mapNode(container.root, nodeId, (node) => applyChange(node, change))
    return withBoundDefaults({ ...container, root }, base, change)
  }
  // A state's or variant's patch is kept against the node as the board shows it, with the params it binds filled in.
  const under = applyPatch(
    base,
    {},
    boardArgs(container.params, variantChoices(container.params, container.view?.variants))
  )
  return withTargetPatches(container, target, patchWith(targetPatches(container, target), nodeId, under, change))
}

/**
 * Hides nodes in a state, or shows them again when they're all hidden there. Each is read as the board shows it in
 * that state, with its variants, the state's changes and the params it binds, so a layer a state hides counts as
 * hidden there however the design has it.
 */
export function toggleHidden(container: ContainerSpec, stateId: string, ids: readonly string[]): ContainerSpec {
  const state = findState(container, stateId)
  const hidden = (id: string) => {
    const node = findNode(container.root, id)
    return node ? (nodeOnBoard(container, node, state).hidden ?? false) : false
  }
  const hide = !ids.every(hidden)
  return ids.reduce((next, id) => editNode(next, boardTarget(next, stateId), id, { hidden: hide }), container)
}

/**
 * A component's board shows each param's default where a node binds it, so a change to a bound text, prop or
 * visibility in the design changes that default too, and the instances that don't set the param follow it. A param
 * without a default already follows the node's own value; variants are picked, not typed, so they're left alone.
 */
function withBoundDefaults(container: ContainerSpec, node: DesignNode, change: NodeChange): ContainerSpec {
  const bind = node.bind
  const params = container.params
  if (!bind || !params) return container
  const values: [param: string, value: unknown][] = []
  if (Object.hasOwn(change, "text") && bind.text && change.text !== undefined) values.push([bind.text, change.text])
  if (Object.hasOwn(change, "hidden") && bind.visible) values.push([bind.visible, !change.hidden])
  for (const [prop, param] of Object.entries(bind.props ?? {})) {
    if (change.props && Object.hasOwn(change.props, prop)) values.push([param, change.props[prop]])
  }
  let next = params
  for (const [name, value] of values) {
    const param = next[name]
    if (!param || param.type === "variant" || param.default === undefined || sameValue(param.default, value)) continue
    const updated = { ...param }
    if (value === undefined) delete updated.default
    else updated.default = value
    next = { ...next, [name]: updated }
  }
  return next === params ? container : { ...container, params: next }
}

/**
 * Applies a change to one node's patch among `patches`, keyed by `key`. `under` is the node as it shows without this
 * patch: values equal to its own aren't kept, and a patch left empty goes.
 */
export function patchWith(
  patches: PatchLayer,
  key: string,
  under: DesignNode,
  change: NodeChange
): Record<string, NodePatch> | undefined {
  const patch: NodePatch = { ...patches?.[key] }
  if (Object.hasOwn(change, "hidden")) {
    patch.hidden = change.hidden === undefined || change.hidden === (under.hidden ?? false) ? undefined : change.hidden
  }
  if (Object.hasOwn(change, "text")) {
    patch.text =
      change.text === undefined || (under.type === "text" && change.text === under.text) ? undefined : change.text
  }
  if (change.props) {
    const baseProps =
      under.type === "component" ? (under.props ?? {}) : under.type === "instance" ? (under.args ?? {}) : {}
    patch.props = mergeValues(patch.props, change.props, baseProps)
  }
  if (change.style) patch.style = mergeValues(patch.style as Values, change.style, (under.style ?? {}) as Values)
  const next = { ...patches, [key]: tidyPatch(patch) }
  if (patchSize(next[key]!) === 0) delete next[key]
  return Object.keys(next).length > 0 ? next : undefined
}

/** A field of a node's patch: whether it's hidden, its text, or one prop or style value. */
export type PatchField = { kind: "hidden" | "text" } | { kind: "props" | "style"; key: string }

/** Drops a node's patch among `patches`, or one field of it. */
export function patchWithout(patches: PatchLayer, key: string, field?: PatchField): PatchLayer {
  const existing = patches?.[key]
  if (!existing) return patches
  const next = { ...patches }
  if (!field) delete next[key]
  else {
    const patch: NodePatch = { ...existing }
    if (field.kind === "props" || field.kind === "style") {
      const values = { ...patch[field.kind] } as Values
      delete values[field.key]
      patch[field.kind] = values as never
    } else delete patch[field.kind]
    next[key] = tidyPatch(patch)
    if (patchSize(next[key]!) === 0) delete next[key]
  }
  return Object.keys(next).length > 0 ? next : undefined
}

/** Drops every override a state (or variant option) has for a node, or one field of it. */
export function resetOverride(
  container: ContainerSpec,
  target: string | EditTarget,
  nodeId: string,
  field?: PatchField
): ContainerSpec {
  if (editsDesign(container, target)) return container
  const patches = targetPatches(container, target)
  const next = patchWithout(patches, nodeId, field)
  return next === patches ? container : withTargetPatches(container, target, next)
}

function applyChange(node: DesignNode, change: NodeChange): DesignNode {
  const next = { ...node } as DesignNode & Record<string, unknown>
  if (Object.hasOwn(change, "hidden")) {
    if (change.hidden) next.hidden = true
    else delete next.hidden
  }
  if (Object.hasOwn(change, "text") && next.type === "text" && change.text !== undefined) next.text = change.text
  if (change.props && next.type === "component") next.props = mergeValues(next.props, change.props, {})
  if (change.props && next.type === "instance") next.args = mergeValues(next.args, change.props, {})
  if (change.style) next.style = mergeValues(next.style as Values, change.style, {})
  if (next.type === "component" && next.props === undefined) delete next.props
  if (next.type === "instance" && next.args === undefined) delete next.args
  if (next.style === undefined) delete next.style
  return next
}

type Values = Record<string, unknown>

/** Applies `change` over `current`; undefined clears a key, and a value equal to `base` isn't kept as an override. */
function mergeValues<T extends object>(current: T | undefined, change: object, base: Values): T | undefined {
  const next: Values = { ...current }
  for (const [key, value] of Object.entries(change)) {
    if (value === undefined || (Object.hasOwn(base, key) && sameValue(base[key], value))) delete next[key]
    else next[key] = value
  }
  return Object.keys(next).length > 0 ? (next as T) : undefined
}

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

export function tidyPatch(patch: NodePatch): NodePatch {
  const next: NodePatch = {}
  if (patch.hidden !== undefined) next.hidden = patch.hidden
  if (patch.text !== undefined) next.text = patch.text
  if (patch.props && Object.keys(patch.props).length > 0) next.props = patch.props
  if (patch.style && Object.keys(patch.style).length > 0) next.style = patch.style
  return next
}

function replaceState(container: ContainerSpec, state: StateSpec): ContainerSpec {
  const next: StateSpec = { id: state.id, name: state.name }
  if (state.overrides) next.overrides = state.overrides
  return { ...container, states: container.states.map((candidate) => (candidate.id === state.id ? next : candidate)) }
}

export function addState(container: ContainerSpec, name: string): { container: ContainerSpec; id: string } {
  const id = uniqueId(
    name,
    container.states.map((state) => state.id)
  )
  return { container: { ...container, states: [...container.states, { id, name }] }, id }
}

export function renameState(container: ContainerSpec, stateId: string, name: string): ContainerSpec {
  const state = findState(container, stateId)
  return replaceState(container, { ...state, name })
}

export function duplicateState(container: ContainerSpec, stateId: string): { container: ContainerSpec; id: string } {
  const state = findState(container, stateId)
  const name = `${state.name} copy`
  const id = uniqueId(
    name,
    container.states.map((candidate) => candidate.id)
  )
  const copy: StateSpec = isBaseState(container, stateId) ? { id, name } : { ...structuredClone(state), id, name }
  const index = container.states.indexOf(state)
  const states = [...container.states.slice(0, index + 1), copy, ...container.states.slice(index + 1)]
  return { container: { ...container, states }, id }
}

export function removeState(container: ContainerSpec, stateId: string): ContainerSpec {
  if (isBaseState(container, stateId)) throw new Error("The base state can't be deleted")
  findState(container, stateId)
  const states = container.states.filter((state) => state.id !== stateId)
  const view = container.view?.state === stateId ? { ...container.view, state: states[0]!.id } : container.view
  return { ...container, states, ...(view ? { view } : {}) }
}

/** Moves a state to a new position. The base state stays first. */
export function moveState(container: ContainerSpec, stateId: string, index: number): ContainerSpec {
  if (isBaseState(container, stateId)) throw new Error("The base state stays first")
  const state = findState(container, stateId)
  const rest = container.states.filter((candidate) => candidate !== state)
  const at = Math.max(1, Math.min(index, rest.length))
  return { ...container, states: [...rest.slice(0, at), state, ...rest.slice(at)] }
}

/** Removes a node from the design and from every state and variant that patches it, or anything inside it. */
export function deleteNode(container: ContainerSpec, nodeId: string): ContainerSpec {
  const location = locateNode(container.root, nodeId)
  if (!location) throw new Error(`No node "${nodeId}" in ${container.name}`)
  return dropPatches({ ...container, root: removeNode(container.root, nodeId) }, nodeIds(location.node))
}

/**
 * Removes the patches for some nodes from every state and variant option, including patches that reach inside them
 * when they're instances.
 */
export function dropPatches(container: ContainerSpec, removed: ReadonlySet<string>): ContainerSpec {
  return mapPatches(container, (key) => (removed.has(key.split("/")[0]!) ? undefined : key))
}

/**
 * Renames or drops the keys of every state's and variant option's patches: `rename` returns the new key, or
 * undefined to drop the patch. Returns the same design when nothing changed.
 */
export function mapPatches(container: ContainerSpec, rename: (key: string) => string | undefined): ContainerSpec {
  let changed = false
  const remap = (patches: PatchLayer): PatchLayer => {
    if (!patches) return patches
    const next: Record<string, NodePatch> = {}
    for (const [key, patch] of Object.entries(patches)) {
      const renamed = rename(key)
      if (renamed !== key) changed = true
      if (renamed !== undefined) next[renamed] = patch
    }
    return Object.keys(next).length > 0 ? next : undefined
  }
  const states = container.states.map((state) => {
    const overrides = remap(state.overrides)
    if (overrides === state.overrides) return state
    const next: StateSpec = { id: state.id, name: state.name }
    if (overrides) next.overrides = overrides
    return next
  })
  const params = container.params && { ...container.params }
  for (const [name, param] of Object.entries(params ?? {})) {
    if (!param.options) continue
    params![name] = {
      ...param,
      options: param.options.map((option) => {
        const overrides = remap(option.overrides)
        if (overrides === option.overrides) return option
        const next = { id: option.id, name: option.name }
        return overrides ? { ...next, overrides } : next
      })
    }
  }
  if (!changed) return container
  return { ...container, states, ...(params ? { params } : {}) }
}

// Several nodes at once ------------------------------------------------------------------------------------------------

/**
 * The nodes among `ids` that aren't inside another of them, in tree order: what a selection of several layers acts
 * on. Selecting a layer and something inside it moves or copies the outer one, with the inner one in it.
 */
export function topmostNodes(root: DesignNode, ids: Iterable<string>): DesignNode[] {
  const wanted = new Set(ids)
  const found: DesignNode[] = []
  const visit = (node: DesignNode) => {
    if (wanted.has(node.id)) {
      found.push(node)
      return
    }
    for (const child of childNodes(node)) visit(child)
  }
  visit(root)
  return found
}

/**
 * Moves nodes, in tree order, to sit together under a parent. `index` counts the parent's children as they are now,
 * so a drop between two of them lands there however many of the moved nodes came from before it.
 */
export function moveNodes(
  root: DesignNode,
  ids: Iterable<string>,
  parentId: string,
  options: { index?: number; slot?: string } = {}
): DesignNode {
  const nodes = topmostNodes(root, ids).filter((node) => node.id !== root.id)
  for (const node of nodes) {
    if (findNode(node, parentId)) throw new Error("A node can't be moved inside itself")
  }
  const parent = findNode(root, parentId)
  if (!parent) throw new Error(`No node "${parentId}" in this design`)
  let index = options.index
  if (index !== undefined) {
    const siblings =
      parent.type === "layout"
        ? parent.children
        : parent.type === "component"
          ? (parent.slots?.[options.slot ?? "children"] ?? [])
          : []
    const moving = new Set(nodes.map((node) => node.id))
    index = siblings.slice(0, index).filter((node) => !moving.has(node.id)).length
  }
  let next = root
  for (const node of nodes) next = removeNode(next, node.id)
  for (const [offset, node] of nodes.entries()) {
    next = insertNode(next, parentId, node, {
      index: index === undefined ? undefined : index + offset,
      slot: options.slot
    })
  }
  return next
}

/**
 * Wraps layers that sit side by side in one layout (or slot) in a new layout, where the first of them was, keeping
 * their order: Figma's "add auto layout" on a selection.
 */
export function wrapNodes(
  container: ContainerSpec,
  ids: Iterable<string>,
  layout: { id: string; name?: string; style?: NodeStyle }
): ContainerSpec {
  const nodes = topmostNodes(container.root, ids)
  const first = nodes[0] && locateNode(container.root, nodes[0].id)
  const parent = first?.ancestors.at(-1)
  if (!first || !parent) throw new Error("Pick layers inside a design to wrap them")
  for (const node of nodes) {
    const location = locateNode(container.root, node.id)
    if (location?.ancestors.at(-1)?.id !== parent.id || location.slot !== first.slot) {
      throw new Error("Only layers in the same layout can be wrapped together")
    }
  }
  let root = container.root
  for (const node of nodes) root = removeNode(root, node.id)
  const wrapper: DesignNode = { type: "layout", ...layout, children: nodes }
  return { ...container, root: insertNode(root, parent.id, wrapper, { index: first.index, slot: first.slot }) }
}

/**
 * Replaces a layout by its children, where it was: the opposite of wrapping. The layout's own style and its overrides
 * in every state go with it.
 */
export function unwrapNode(container: ContainerSpec, id: string): ContainerSpec {
  const location = locateNode(container.root, id)
  if (!location) throw new Error(`No node "${id}" in ${container.name}`)
  const parent = location.ancestors.at(-1)
  if (!parent) throw new Error("The root of a design can't be unwrapped")
  if (location.node.type !== "layout") throw new Error("Only layouts can be unwrapped")
  let root = removeNode(container.root, id)
  for (const [offset, child] of location.node.children.entries()) {
    root = insertNode(root, parent.id, child, { index: location.index + offset, slot: location.slot })
  }
  return dropPatches({ ...container, root }, new Set([id]))
}

// Variants -------------------------------------------------------------------------------------------------------------

/** Adds a variant param to a component design, with one option per name. The first option is the default. */
export function addVariant(container: ContainerSpec, name: string, options: readonly string[]): ContainerSpec {
  if (container.params?.[name]) throw new Error(`${container.name} already has a param "${name}"`)
  if (options.length === 0) throw new Error("A variant needs at least one option")
  const ids: string[] = []
  const list = options.map((option) => {
    const id = uniqueId(option, ids)
    ids.push(id)
    return { id, name: option }
  })
  return { ...container, params: { ...container.params, [name]: { type: "variant", options: list } } }
}

/** Adds an option to a variant, last. */
export function addVariantOption(
  container: ContainerSpec,
  param: string,
  name: string
): { container: ContainerSpec; id: string } {
  const spec = variantParam(container, param)
  const id = uniqueId(
    name,
    spec.options.map((option) => option.id)
  )
  const options = [...spec.options, { id, name }]
  return { container: { ...container, params: { ...container.params, [param]: { ...spec, options } } }, id }
}

export function renameVariantOption(container: ContainerSpec, param: string, option: string, name: string) {
  const spec = variantParam(container, param)
  const options = spec.options.map((candidate) => (candidate.id === option ? { ...candidate, name } : candidate))
  return { ...container, params: { ...container.params, [param]: { ...spec, options } } }
}

/**
 * Removes an option and its patches. Instances that picked it show the variant's default instead; a board showing it
 * goes back to the default too.
 */
export function removeVariantOption(container: ContainerSpec, param: string, option: string): ContainerSpec {
  const spec = variantParam(container, param)
  if (spec.options.length === 1) throw new Error("A variant needs at least one option")
  const next = { ...spec, options: spec.options.filter((candidate) => candidate.id !== option) }
  if (next.default === option) delete next.default
  return withoutViewChoice({ ...container, params: { ...container.params, [param]: next } }, param, option)
}

/** Removes a param. Nodes bound to it show their own values again. */
export function removeParam(container: ContainerSpec, name: string): ContainerSpec {
  if (!container.params?.[name]) return container
  const params = { ...container.params }
  delete params[name]
  const next: ContainerSpec = { ...container, params }
  if (Object.keys(params).length === 0) delete next.params
  return withoutViewChoice(next, name)
}

function withoutViewChoice(container: ContainerSpec, param: string, option?: string): ContainerSpec {
  const choice = container.view?.variants?.[param]
  if (choice === undefined || (option !== undefined && choice !== option)) return container
  const variants = { ...container.view!.variants }
  delete variants[param]
  const view = { ...container.view }
  if (Object.keys(variants).length > 0) view.variants = variants
  else delete view.variants
  const next: ContainerSpec = { ...container, view }
  if (Object.keys(view).length === 0) delete next.view
  return next
}

function variantParam(container: ContainerSpec, param: string) {
  const spec = container.params?.[param]
  if (spec?.type !== "variant" || !spec.options) throw new Error(`${container.name} has no variant "${param}"`)
  return spec as typeof spec & { options: NonNullable<typeof spec.options> }
}
