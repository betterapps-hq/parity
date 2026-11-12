import {
  type ContainerSpec,
  type DesignNode,
  designStates,
  type InstanceNode,
  type NodeBinding,
  type ParamSpec,
  type PropValues
} from "./document.ts"
import { childEntries, locateNode, mapNode, nodeIds, withFreshIds } from "./edit.ts"
import { boardRoot, type ComponentLibrary, type RenderNode, resolveDesign, variantChoices } from "./render.ts"

/** A value a component node's prop holds, and so a value a param can take. */
type PropValue = PropValues[string]

/** The kinds of value that count as content, which can differ between occurrences, rather than structure. */
type ContentKind = "string" | "number" | "boolean"

/** A part of a design that appears more than once with the same structure: a candidate component. */
export interface RepeatCandidate {
  /** The root id of each occurrence, in document order. */
  nodes: string[]
  /** Nodes in one occurrence. */
  size: number
  /** A starting name; agents and people usually find a better one. */
  name: string
  /** What differs between occurrences, which becomes the component's params. */
  params: { name: string; type: ParamSpec["type"]; values: PropValue[] }[]
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
      const signature = structure(node)
      groups.set(signature, [...(groups.get(signature) ?? []), node])
    }

    for (const entry of childEntries(node)) {
      entry.nodes.forEach(visit)
    }
  }

  visit(root)

  const candidates = [...groups.values()]
    .flatMap((nodes) => (nodes.length > 1 ? [{ nodes, size: nodeIds(nodes[0]!).size }] : []))
    .sort((a, b) => b.size * b.nodes.length - a.size * a.nodes.length)

  const covered = new Set<string>()
  const result: RepeatCandidate[] = []

  for (const { nodes, size } of candidates) {
    if (nodes.some((node) => covered.has(node.id))) {
      continue
    }

    // Occurrences mustn't contain each other.
    if (nodes.some((node) => nodes.some((other) => other !== node && nodeIds(node).has(other.id)))) {
      continue
    }

    for (const node of nodes) {
      for (const id of nodeIds(node)) {
        covered.add(id)
      }
    }

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
 * instance carrying its own content as args. Refuses if the result would render differently in any state, viewport or
 * variant option, as the board shows it with that option: with the defaults of the params the design binds.
 */
export function extractComponent(design: ContainerSpec, occurrences: string[], options: ExtractOptions): Extraction {
  if (occurrences.length === 0) {
    throw new Error("Nothing to extract")
  }

  const nodes = occurrences.map((id) => {
    const location = locateNode(design.root, id)

    if (!location) {
      throw new Error(`No node "${id}" in ${design.name}`)
    }

    if (location.ancestors.length === 0) {
      throw new Error("A design's root can't become a component of itself")
    }

    return location.node
  })

  const signature = structure(nodes[0]!)

  for (const node of nodes) {
    if (structure(node) !== signature) {
      throw new Error(`"${node.id}" isn't structured like "${nodes[0]!.id}", so they can't share a component`)
    }
  }

  for (const node of nodes) {
    const inside = new Set(nodeIds(node))

    for (const state of designStates(design)) {
      for (const [id, patch] of Object.entries(state.overrides ?? {})) {
        if (!inside.has(id)) {
          continue
        }

        if (id !== node.id || patch.props !== undefined || patch.unset?.props || patch.text !== undefined) {
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

  if (duplicate) {
    throw new Error(`Two params would both be called "${duplicate}"`)
  }

  const template = bindTemplate(nodes[0]!, params)
  const context = contextOf(locateNode(design.root, nodes[0]!.id)!.ancestors, nodes[0]!)

  // The project file keeps a design's keys in this order, with `context` after `kind` when there is one.
  const heading: Pick<ContainerSpec, "id" | "name" | "kind" | "context"> = {
    id: options.id,
    name: options.name,
    kind: "component"
  }

  if (context.length > 0) {
    heading.context = context
  }

  const component: ContainerSpec = {
    ...heading,
    position: options.position,
    root: { ...template, name: options.name },
    params: Object.fromEntries(params.map((param) => [param.name, { type: param.type, default: param.values[0] }]))
  }

  let root = design.root

  for (const [index, node] of nodes.entries()) {
    const args = Object.fromEntries(params.map((param) => [param.name, param.values[index]]))
    const instance: InstanceNode = { type: "instance", id: node.id, design: options.id }

    if (node.name) {
      instance.name = node.name
    }

    if (Object.keys(args).length > 0) {
      instance.args = args
    }

    if (node.hidden) {
      instance.hidden = true
    }

    root = mapNode(root, node.id, () => instance)
  }

  const extracted: ContainerSpec = { ...design, root }

  const library = new Map(options.library).set(component.id, component)

  for (const { choices, option } of variantViews(design)) {
    const variants = { params: design.params, choices }

    for (const state of designStates(design)) {
      for (const viewport of options.viewports) {
        const before = resolveDesign(boardRoot(design), state, viewport, options.library, variants)
        const after = resolveDesign(boardRoot(extracted), state, viewport, library, variants)

        if (!sameRender(before, after)) {
          const where = [state.name, viewport, ...(option ? [option] : [])].join(", ")
          throw new Error(`Extracting would change how ${design.name} looks (${where}), so it wasn't done`)
        }
      }
    }
  }

  return { component, design: extracted }
}

/**
 * The variant choices a design is checked in: the ones its board shows, then each other option of each variant param
 * with the rest as the board shows them, named by that option. One option at a time, not every combination: an option
 * that changes nothing inside the part on its own changes nothing beside another that doesn't either.
 */
function variantViews(design: ContainerSpec): { choices: Record<string, string>; option?: string }[] {
  const shown = variantChoices(design.params, design.view?.variants)
  const views: { choices: Record<string, string>; option?: string }[] = [{ choices: shown }]

  for (const [name, param] of Object.entries(design.params ?? {})) {
    if (param.type !== "variant") {
      continue
    }

    for (const option of param.options ?? []) {
      if (option.id !== shown[name]) {
        views.push({ choices: { ...shown, [name]: option.id }, option: option.name })
      }
    }
  }

  return views
}

/**
 * The components a part needs around it on its own board: its nearest component ancestors from the same family, so a
 * TableRow gets its Table and TableBody, but not the Card the table happens to sit in.
 */
function contextOf(ancestors: DesignNode[], node: DesignNode): NonNullable<ContainerSpec["context"]> {
  if (node.type !== "component") {
    return []
  }

  const family = /^[A-Z][a-z0-9]*/.exec(node.component)?.[0]
  const context: NonNullable<ContainerSpec["context"]> = []

  for (const ancestor of [...ancestors].reverse()) {
    if (ancestor.type !== "component" || !family || !ancestor.component.startsWith(family)) {
      break
    }

    context.unshift(
      ancestor.props ? { component: ancestor.component, props: ancestor.props } : { component: ancestor.component }
    )
  }

  return context
}

/** Whether two resolved designs render the same, ignoring node ids. */
export function sameRender(a: RenderNode[], b: RenderNode[]): boolean {
  return withoutNodeIds(a) === withoutNodeIds(b)
}

/**
 * A render as JSON without its node ids and with each object's keys sorted, so renders that differ only in ids and key
 * order read the same. A list of keys given to `JSON.stringify` keeps only those keys and writes them in the list's
 * order, so a first pass collects every key the render has.
 */
function withoutNodeIds(render: RenderNode[]): string {
  const keys = new Set<string>()

  JSON.stringify(render, (key, value) => {
    keys.add(key)

    return value
  })

  keys.delete("nodeId")

  return JSON.stringify(
    render,
    [...keys].sort((a, b) => a.localeCompare(b))
  )
}

/** Structure without content, as JSON: two parts with the same structure can share a component. */
function structure(node: DesignNode): string {
  // What it holds is structure wherever it holds it, the layers an instance fills its slots with included: `slotsOf`
  // reads the same lists, so two parts with one structure have their values in the same places.
  const inside = childEntries(node).map(({ slot, nodes }) => [slot ?? null, nodes.map(structure)])
  const base = { type: node.type, style: node.style ?? null, responsive: node.responsive ?? null, inside }

  switch (node.type) {
    case "layout":
      return JSON.stringify(base)
    case "text":
      return JSON.stringify({ ...base, tag: node.tag ?? null })
    case "image":
      return JSON.stringify({ ...base, fit: node.fit ?? null })
    case "video":
      return JSON.stringify({ ...base, fit: node.fit ?? null, controls: node.controls ?? null })
    case "instance":
      return JSON.stringify({
        ...base,
        design: node.design,
        args: Object.keys(node.args ?? {}).sort()
      })
    case "component":
      return JSON.stringify({
        ...base,
        component: node.component,
        props: Object.fromEntries(
          Object.entries(node.props ?? {})
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, value]) => [key, contentKind(value) ?? value])
        )
      })
  }
}

/** Which kind of content a value is, or `undefined` for one that's structure: an object, a list or `null`. */
function contentKind(value: PropValue): ContentKind | undefined {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- props hold JSON, whose kinds of value are what `typeof` tells apart
  const kind = typeof value

  return kind === "string" || kind === "number" || kind === "boolean" ? kind : undefined
}

function slotsOf(node: DesignNode, path = ""): Slot[] {
  const slots: Slot[] = [{ path, field: "visible", node }]

  if (node.type === "text") {
    slots.push({ path, field: "text", node })
  }

  if (node.type === "component") {
    for (const [prop, value] of Object.entries(node.props ?? {})) {
      if (contentKind(value)) {
        slots.push({ path, field: `props.${prop}`, node })
      }
    }
  }

  for (const entry of childEntries(node)) {
    for (const [index, child] of entry.nodes.entries()) {
      slots.push(...slotsOf(child, `${path}/${entry.slot ?? ""}${index}`))
    }
  }

  return slots
}

function valueAt(slot: Slot): PropValue {
  if (slot.field === "visible") {
    return !slot.node.hidden
  }

  if (slot.field === "text") {
    return slot.node.type === "text" ? slot.node.text : undefined
  }

  return slot.node.type === "component" ? slot.node.props?.[slot.field.slice(6)] : undefined
}

interface Param {
  name: string
  type: ParamSpec["type"]
  values: PropValue[]
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

    if (values.every((value) => value === values[0])) {
      continue
    }

    // The root's visibility stays on each instance.
    if (slot.field === "visible" && slot.path === "") {
      continue
    }

    const same = params.find((param) => JSON.stringify(param.values) === JSON.stringify(values))

    if (same) {
      same.targets.push({ path: slot.path, field: slot.field })
    } else {
      params.push({
        name: paramName(slot, taken),
        type: typeOf(values[0]),
        values,
        targets: [{ path: slot.path, field: slot.field }]
      })
    }
  }

  return params
}

/** For a part used once: its texts and labels become params, so the component can be reused with other content. */
function contentParams(node: DesignNode): Param[] {
  const taken = new Set<string>()

  return slotsOf(node)
    .filter((slot) => slot.field === "text" || slot.field === "props.children")
    .filter((slot) => contentKind(valueAt(slot)) === "string")
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
      for (const [childIndex, child] of entry.nodes.entries()) {
        index(child, `${path}/${entry.slot ?? ""}${childIndex}`)
      }
    }
  }

  index(template, "")

  for (const param of params) {
    for (const { path, field } of param.targets) {
      const target = byPath.get(path)

      if (!target) {
        continue
      }

      const bind: NodeBinding = { ...target.bind }

      if (field === "text") {
        bind.text = param.name
      } else if (field === "visible") {
        bind.visible = param.name
        delete target.hidden
      } else {
        bind.props = { ...bind.props, [field.slice(6)]: param.name }
      }

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

  if (slot.field === "visible") {
    name = `show${capitalize(base)}`
  } else if (prop && prop !== "children") {
    name = `${base}${capitalize(prop)}`
  }

  if (taken.has(name)) {
    let counter = 2

    while (taken.has(`${name}${counter}`)) {
      counter++
    }

    name = `${name}${counter}`
  }

  taken.add(name)

  return name
}

function suggestName(node: DesignNode): string {
  if (node.name) {
    return node.name
  }

  if (node.type === "component") {
    return `${node.component} item`
  }

  return "Group"
}

function typeOf(value: PropValue): ParamSpec["type"] {
  const kind = contentKind(value)

  if (kind === "string") {
    return "text"
  }

  return kind ?? "value"
}

/** What a node is called when it has no name of its own. */
function kindName(node: DesignNode): string {
  if (node.type === "component") {
    return node.component
  }

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
