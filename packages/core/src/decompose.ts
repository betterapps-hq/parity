import type { ContainerSpec, DesignNode, InstanceNode, NodeBinding, ParamSpec } from "./document.ts"
import { childEntries, locateNode, mapNode, nodeIds, withFreshIds } from "./edit.ts"
import { boardRoot, type ComponentLibrary, type RenderNode, resolveDesign } from "./render.ts"

/** A part of a design that appears more than once with the same structure: a candidate component. */
export interface RepeatCandidate {
  /** The root id of each occurrence, in document order. */
  nodes: string[]
  /** Nodes in one occurrence. */
  size: number
  /** A starting name; agents and people usually find a better one. */
  name: string
  /** What differs between occurrences, which becomes the component's params. */
  params: { name: string; type: ParamSpec["type"]; values: unknown[] }[]
}

/** One value that can differ between occurrences: a text, a prop, or whether a node shows. */
interface Slot {
  /** Path from the occurrence root, as child indexes (slot name included for components). */
  path: string
  field: "text" | "visible" | `props.${string}`
  node: DesignNode
}

/**
 * Finds parts of a design repeated with identical structure (layout, components, styles, responsive changes) but
 * possibly different content. Larger parts win: a repeated row isn't also reported as its repeated cells.
 */
export function findRepeats(root: DesignNode, minimumSize = 3): RepeatCandidate[] {
  const groups = new Map<string, DesignNode[]>()
  const visit = (node: DesignNode) => {
    const size = nodeIds(node).size
    if (size >= minimumSize && node.id !== root.id) {
      const signature = shape(node)
      groups.set(signature, [...(groups.get(signature) ?? []), node])
    }
    for (const entry of childEntries(node)) entry.nodes.forEach(visit)
  }
  visit(root)

  const candidates = [...groups.values()]
    .filter((nodes) => nodes.length > 1)
    .map((nodes) => ({ nodes, size: nodeIds(nodes[0]!).size }))
    .sort((a, b) => b.size * b.nodes.length - a.size * a.nodes.length)
  const covered = new Set<string>()
  const result: RepeatCandidate[] = []
  for (const { nodes, size } of candidates) {
    if (nodes.some((node) => covered.has(node.id))) continue
    // Occurrences mustn't contain each other.
    if (nodes.some((node) => nodes.some((other) => other !== node && nodeIds(node).has(other.id)))) continue
    for (const node of nodes) for (const id of nodeIds(node)) covered.add(id)
    result.push({
      nodes: nodes.map((node) => node.id),
      size,
      name: suggestName(nodes[0]!),
      params: paramsFor(nodes).map(({ name, type, values }) => ({ name, type, values }))
    })
  }
  return result
}

export interface ExtractOptions {
  /** The new component design's id and name. */
  id: string
  name: string
  position: { x: number; y: number }
  /** Every viewport the project has, to check the extraction renders the same in all of them. */
  viewports: string[]
  library: ComponentLibrary
  /** Better names for the params found, by the name they were given (`text2` to `email`). */
  paramNames?: Record<string, string>
}

export interface Extraction {
  component: ContainerSpec
  design: ContainerSpec
}

/**
 * Turns one or more occurrences of the same structure into a component design, and replaces each occurrence with an
 * instance carrying its own content as args. Refuses if the result would render differently in any state or viewport
 * as the board shows it: with the variant options the board shows and the defaults of the params the design binds.
 */
export function extractComponent(design: ContainerSpec, occurrences: string[], options: ExtractOptions): Extraction {
  if (occurrences.length === 0) throw new Error("Nothing to extract")
  const nodes = occurrences.map((id) => {
    const location = locateNode(design.root, id)
    if (!location) throw new Error(`No node "${id}" in ${design.name}`)
    if (location.ancestors.length === 0) throw new Error("A design's root can't become a component of itself")
    return location.node
  })
  const signature = shape(nodes[0]!)
  for (const node of nodes) {
    if (shape(node) !== signature)
      throw new Error(`"${node.id}" isn't structured like "${nodes[0]!.id}", so they can't share a component`)
  }
  for (const node of nodes) {
    const inside = new Set(nodeIds(node))
    for (const state of design.states) {
      for (const [id, patch] of Object.entries(state.overrides ?? {})) {
        if (!inside.has(id)) continue
        if (id !== node.id || patch.props !== undefined || patch.text !== undefined) {
          throw new Error(
            `The ${state.name} state changes "${id}" inside the part being extracted. Move that change into a state of the component, then extract.`
          )
        }
      }
    }
  }

  const params = (nodes.length > 1 ? paramsFor(nodes) : contentParams(nodes[0]!)).map((param) => ({
    ...param,
    name: options.paramNames?.[param.name] ?? param.name
  }))
  const names = params.map((param) => param.name)
  const duplicate = names.find((name, index) => names.indexOf(name) !== index)
  if (duplicate) throw new Error(`Two params would both be called "${duplicate}"`)
  const template = bindTemplate(nodes[0]!, params)
  const context = contextOf(locateNode(design.root, nodes[0]!.id)!.ancestors, nodes[0]!)
  const component: ContainerSpec = {
    id: options.id,
    name: options.name,
    kind: "component",
    ...(context.length > 0 ? { context } : {}),
    position: options.position,
    root: { ...template, name: options.name },
    states: [{ id: "default", name: "Default" }],
    params: Object.fromEntries(params.map((param) => [param.name, { type: param.type, default: param.values[0] }]))
  }

  let root = design.root
  for (const [index, node] of nodes.entries()) {
    const args = Object.fromEntries(params.map((param) => [param.name, param.values[index]]))
    const instance: InstanceNode = { type: "instance", id: node.id, design: options.id }
    if (node.name) instance.name = node.name
    if (Object.keys(args).length > 0) instance.args = args
    if (node.hidden) instance.hidden = true
    root = mapNode(root, node.id, () => instance)
  }
  const extracted: ContainerSpec = { ...design, root }

  const library = new Map(options.library).set(component.id, component)
  const variants = { params: design.params, choices: design.view?.variants }
  for (const state of design.states) {
    for (const viewport of options.viewports) {
      const before = resolveDesign(boardRoot(design), state, viewport, options.library, variants)
      const after = resolveDesign(boardRoot(extracted), state, viewport, library, variants)
      if (!sameRender(before, after)) {
        throw new Error(
          `Extracting would change how ${design.name} looks (${state.name}, ${viewport}), so it wasn't done`
        )
      }
    }
  }
  return { component, design: extracted }
}

/**
 * The components a part needs around it on its own board: its nearest component ancestors from the same family, so a
 * TableRow gets its Table and TableBody, but not the Card the table happens to sit in.
 */
function contextOf(
  ancestors: DesignNode[],
  node: DesignNode
): { component: string; props?: Record<string, unknown> }[] {
  if (node.type !== "component") return []
  const family = /^[A-Z][a-z0-9]*/.exec(node.component)?.[0]
  const context: { component: string; props?: Record<string, unknown> }[] = []
  for (const ancestor of [...ancestors].reverse()) {
    if (ancestor.type !== "component" || !family || !ancestor.component.startsWith(family)) break
    context.unshift(
      ancestor.props ? { component: ancestor.component, props: ancestor.props } : { component: ancestor.component }
    )
  }
  return context
}

/** Whether two resolved designs render the same, ignoring node ids. */
export function sameRender(a: RenderNode[], b: RenderNode[]): boolean {
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b))
}

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize)
  if (!value || typeof value !== "object") return value
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== "nodeId")
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => [key, normalize(entry)])
  )
}

/** Structure without content: two parts with the same shape can share a component. */
function shape(node: DesignNode): string {
  const describe = (current: DesignNode): unknown => {
    const base = { type: current.type, style: current.style ?? null, responsive: current.responsive ?? null }
    switch (current.type) {
      case "layout":
        return { ...base, children: current.children.map(describe) }
      case "text":
        return { ...base, tag: current.tag ?? null }
      case "image":
        return { ...base, fit: current.fit ?? null }
      case "instance":
        return {
          ...base,
          design: current.design,
          state: current.state ?? null,
          args: Object.keys(current.args ?? {}).sort()
        }
      case "component":
        return {
          ...base,
          component: current.component,
          props: Object.fromEntries(
            Object.entries(current.props ?? {})
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([key, value]) => [key, isContent(value) ? typeof value : value])
          ),
          slots: Object.fromEntries(
            Object.entries(current.slots ?? {}).map(([slot, nodes]) => [slot, nodes.map(describe)])
          )
        }
    }
  }
  return JSON.stringify(describe(node))
}

/** Values that count as content, which can differ between occurrences, rather than structure. */
function isContent(value: unknown): boolean {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
}

function slotsOf(node: DesignNode, path = ""): Slot[] {
  const slots: Slot[] = [{ path, field: "visible", node }]
  if (node.type === "text") slots.push({ path, field: "text", node })
  if (node.type === "component") {
    for (const [prop, value] of Object.entries(node.props ?? {})) {
      if (isContent(value)) slots.push({ path, field: `props.${prop}`, node })
    }
  }
  for (const entry of childEntries(node)) {
    for (const [index, child] of entry.nodes.entries())
      slots.push(...slotsOf(child, `${path}/${entry.slot ?? ""}${index}`))
  }
  return slots
}

function valueAt(slot: Slot): unknown {
  if (slot.field === "visible") return !slot.node.hidden
  if (slot.field === "text") return slot.node.type === "text" ? slot.node.text : undefined
  return slot.node.type === "component" ? slot.node.props?.[slot.field.slice(6)] : undefined
}

interface Param {
  name: string
  type: ParamSpec["type"]
  values: unknown[]
  /** Where the param's value goes; one param can fill several places that always match (an email shown twice). */
  targets: { path: string; field: Slot["field"] }[]
}

/** The values that differ between occurrences, named after what they are. */
function paramsFor(nodes: DesignNode[]): Param[] {
  const per = nodes.map((node) => slotsOf(node))
  const taken = new Set<string>()
  const params: Param[] = []
  for (const [index, slot] of per[0]!.entries()) {
    const values = per.map((slots) => valueAt(slots[index]!))
    if (values.every((value) => value === values[0])) continue
    // The root's visibility stays on each instance.
    if (slot.field === "visible" && slot.path === "") continue
    const same = params.find((param) => JSON.stringify(param.values) === JSON.stringify(values))
    if (same) same.targets.push({ path: slot.path, field: slot.field })
    else
      params.push({
        name: paramName(slot, taken),
        type: typeOf(values[0]),
        values,
        targets: [{ path: slot.path, field: slot.field }]
      })
  }
  return params
}

/** For a part used once: its texts and labels become params, so the component can be reused with other content. */
function contentParams(node: DesignNode): Param[] {
  const taken = new Set<string>()
  return slotsOf(node)
    .filter((slot) => slot.field === "text" || slot.field === "props.children")
    .filter((slot) => typeof valueAt(slot) === "string")
    .map((slot) => ({
      name: paramName(slot, taken),
      type: "text" as const,
      values: [valueAt(slot)],
      targets: [{ path: slot.path, field: slot.field }]
    }))
}

function bindTemplate(node: DesignNode, params: Param[]): DesignNode {
  const template = withFreshIds(structuredClone(node), new Set())
  const byPath = new Map<string, DesignNode>()
  const index = (current: DesignNode, path: string) => {
    byPath.set(path, current)
    for (const entry of childEntries(current)) {
      for (const [childIndex, child] of entry.nodes.entries()) index(child, `${path}/${entry.slot ?? ""}${childIndex}`)
    }
  }
  index(template, "")
  for (const param of params) {
    for (const { path, field } of param.targets) {
      const target = byPath.get(path)
      if (!target) continue
      const bind: NodeBinding = { ...target.bind }
      if (field === "text") bind.text = param.name
      else if (field === "visible") {
        bind.visible = param.name
        delete target.hidden
      } else bind.props = { ...bind.props, [field.slice(6)]: param.name }
      target.bind = bind
    }
  }
  delete template.hidden
  return template
}

function paramName(slot: Slot, taken: Set<string>): string {
  const base = camel(slot.node.name ?? kindName(slot.node))
  const prop = slot.field.startsWith("props.") ? slot.field.slice(6) : undefined
  let name = base
  if (slot.field === "visible") name = `show${capitalize(base)}`
  else if (prop && prop !== "children") name = `${base}${capitalize(prop)}`
  if (taken.has(name)) {
    let counter = 2
    while (taken.has(`${name}${counter}`)) counter++
    name = `${name}${counter}`
  }
  taken.add(name)
  return name
}

function suggestName(node: DesignNode): string {
  if (node.name) return node.name
  if (node.type === "component") return `${node.component} item`
  return "Group"
}

function typeOf(value: unknown): ParamSpec["type"] {
  if (typeof value === "string") return "text"
  if (typeof value === "boolean") return "boolean"
  if (typeof value === "number") return "number"
  return "value"
}

/** What a node is called when it has no name of its own. */
function kindName(node: DesignNode): string {
  if (node.type === "component") return node.component
  return node.type === "text" ? "text" : "item"
}

function camel(text: string): string {
  const words = text.split(/[^a-zA-Z0-9]+/).filter(Boolean)
  return (
    words.map((word, index) => (index === 0 ? word[0]!.toLowerCase() + word.slice(1) : capitalize(word))).join("") ||
    "value"
  )
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}
