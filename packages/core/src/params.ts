import { z } from "zod"
import type {
  ContainerSpec,
  DesignNode,
  NodeBinding,
  NodePatch,
  ParamSpec,
  PropValues,
  VariantOption
} from "./document.ts"
import { walkNodes } from "./document.ts"
import { findNode, mapNode, removeParam, tidyPatch } from "./edit.ts"
import { CodedError } from "./errors.ts"
import { isInnerPath, locateInner } from "./instances.ts"
import { propNameProblem } from "./prop-binding.ts"
import type { ComponentLibrary } from "./render.ts"
import { finiteNumber } from "./schema.ts"

/*
 * Declaring a component design's params directly, as an agent does when it builds a component without extracting it
 * (PAR-901): adding one, renaming it, changing its default or options, and deleting it, with the nodes that bind it and
 * the instances that pass it kept in step.
 */

/** Which fields a node's `bind` can drive, and the param types each takes. A prop takes any param, a variant's id too. */
const bindableTypes = {
  text: ["text", "value"],
  visible: ["boolean", "value"]
} as const satisfies Record<"text" | "visible", readonly ParamSpec["type"][]>

function invalid(message: string, field: string): CodedError {
  return new CodedError(message, { code: "invalid_input", field })
}

function refuseUnlessComponent(container: ContainerSpec): void {
  if (container.kind !== "component") {
    throw invalid(`${container.name} isn't a component, so it has no params. Make it a component first.`, "design")
  }
}

function findParam(container: ContainerSpec, name: string, field = "name"): ParamSpec {
  const param = container.params?.[name]

  if (!param) {
    const names = Object.keys(container.params ?? {})
    throw invalid(`${container.name} has no param "${name}". Params: ${names.join(", ") || "none"}`, field)
  }

  return param
}

/** What a default of each type of param has to be. */
const defaultKinds = {
  text: { schema: z.string(), what: "a string" },
  number: { schema: finiteNumber, what: "a number" },
  boolean: { schema: z.boolean(), what: "true or false" }
}

/** A param's default, as `.par` files hold it: whatever the param's type allows. */
type ParamValue = ParamSpec["default"]

/** Why `value` can't be a default for a param of `type`, or undefined when it can. */
function defaultProblem(param: ParamSpec): string | undefined {
  const value = param.default

  if (value === undefined || param.type === "value") {
    return undefined
  }

  if (param.type === "variant") {
    return param.options?.some((option) => option.id === value)
      ? undefined
      : `a variant's default is one of its options' ids: ${param.options?.map((option) => option.id).join(", ")}`
  }

  const expected = defaultKinds[param.type]

  return expected.schema.safeParse(value).success ? undefined : `a ${param.type} param's default is ${expected.what}`
}

function checkParam(param: ParamSpec): void {
  if (param.type === "variant" && !param.options?.length) {
    throw invalid("A variant needs at least one option", "options")
  }

  if (param.type !== "variant" && param.options) {
    throw invalid("Only a variant has options", "options")
  }

  const ids = new Set<string>()

  for (const option of param.options ?? []) {
    if (ids.has(option.id)) {
      throw invalid(`Two options have the id "${option.id}"`, "options")
    }

    ids.add(option.id)
  }

  const problem = defaultProblem(param)

  if (problem) {
    throw invalid(`The default doesn't fit: ${problem}`, "default")
  }
}

/** Adds a param to a component design. Its name has to be one code could use, and no other prop or slot's. */
export function addParam(container: ContainerSpec, name: string, param: ParamSpec): ContainerSpec {
  refuseUnlessComponent(container)
  const problem = propNameProblem(container, name)

  if (problem) {
    throw invalid(problem, "name")
  }

  checkParam(param)

  return { ...container, params: { ...container.params, [name]: param } }
}

/** What `updateParam` changes. A param's type stays; delete it and add it again to change that. */
export interface ParamChange {
  default?: unknown
  description?: string | null
  /** A variant's whole list of options, in order. Instances that picked one left out show the default. */
  options?: VariantOption[]
}

/** A design with a param changed, and the ids of the options that change dropped. */
export interface UpdatedParam {
  container: ContainerSpec
  dropped: string[]
}

/**
 * Changes a param's default, description or options. Returns the design and the ids of any options it dropped, so the
 * instances that picked them can go back to the default.
 */
export function updateParam(container: ContainerSpec, name: string, change: ParamChange): UpdatedParam {
  const param = findParam(container, name)

  if (change.options && param.type !== "variant") {
    throw invalid("Only a variant has options", "options")
  }

  const next: ParamSpec = { ...param }

  if (change.options) {
    next.options = change.options
  }

  if (change.description === null) {
    delete next.description
  } else if (change.description !== undefined) {
    next.description = change.description
  }

  if (change.default === null) {
    delete next.default
  } else if (change.default !== undefined) {
    next.default = change.default
  }

  const kept = new Set(next.options?.map((option) => option.id))
  const dropped = (param.options ?? []).map((option) => option.id).filter((id) => !kept.has(id))

  // A variant whose default option went shows its first option.
  if (next.type === "variant" && change.default === undefined && dropped.includes(String(next.default))) {
    delete next.default
  }

  checkParam(next)
  let updated: ContainerSpec = { ...container, params: { ...container.params, [name]: next } }
  const shown = updated.view?.variants?.[name]

  if (shown !== undefined && dropped.includes(shown)) {
    updated = withoutShownVariant(updated, name)
  }

  return { container: updated, dropped }
}

/** Renames a param, keeping its place among the others, and the nodes that bind it and the option the board shows. */
export function renameParam(container: ContainerSpec, from: string, to: string): ContainerSpec {
  findParam(container, from)

  if (from === to) {
    return container
  }

  const problem = propNameProblem(container, to)

  if (problem) {
    throw invalid(problem, "name")
  }

  const params = Object.fromEntries(
    Object.entries(container.params!).map(([name, param]) => [name === from ? to : name, param])
  )

  const root = mapBindings(container.root, (bind) => renameInBinding(bind, from, to))
  const next: ContainerSpec = { ...container, root, params }
  const shown = container.view?.variants?.[from]

  if (shown === undefined) {
    return next
  }

  const variants = Object.fromEntries(
    Object.entries(container.view!.variants!).map(([param, option]) => [param === from ? to : param, option])
  )

  return { ...next, view: { ...container.view, variants } }
}

/**
 * Deletes a param. Each node that bound it gets the param's default as its own value, so the board looks the same, and
 * stops binding it. A variant's options and what they changed go with it.
 */
export function deleteParam(container: ContainerSpec, name: string): ContainerSpec {
  const param = findParam(container, name)
  const root = mapBoundNodes(container.root, (node) => unbindAll(node, name, param.default))

  return removeParam({ ...container, root }, name)
}

/** A change to one node's `bind`: a param's name binds the field, `null` unbinds it. */
export interface BindingChange {
  text?: string | null
  visible?: string | null
  props?: Record<string, string | null>
}

/**
 * Binds or unbinds a node's text, visibility or props. An unbound field keeps what the param showed by default, so the
 * board looks the same.
 */
export function bindNode(container: ContainerSpec, nodeId: string, change: BindingChange): ContainerSpec {
  refuseUnlessComponent(container)

  if (!findNode(container.root, nodeId)) {
    throw invalid(`No node "${nodeId}" in ${container.name}`, "path")
  }

  const root = mapNode(container.root, nodeId, (node) => {
    let next: DesignNode = node
    const bind: NodeBinding = { ...node.bind }

    for (const field of ["text", "visible"] as const) {
      const value = change[field]

      if (value === undefined) {
        continue
      }

      if (value === null) {
        const was = bind[field]
        delete bind[field]
        next = was === undefined ? next : withOwnValue(next, { field }, container.params?.[was]?.default)
      } else {
        bind[field] = value
      }
    }

    const props = { ...bind.props }

    for (const [prop, value] of Object.entries(change.props ?? {})) {
      if (value === null) {
        const was = props[prop]
        delete props[prop]
        next = was === undefined ? next : withOwnValue(next, { prop }, container.params?.[was]?.default)
      } else {
        props[prop] = value
      }
    }

    if (Object.keys(props).length > 0) {
      bind.props = props
    } else {
      delete bind.props
    }

    const result: DesignNode = { ...next, bind }

    if (Object.keys(bind).length === 0) {
      delete result.bind
    }

    return result
  })

  const updated = { ...container, root }
  const problem = bindingProblem(updated, findNode(root, nodeId)!)

  if (problem) {
    throw invalid(problem.message, "change/bind")
  }

  return updated
}

/** What's wrong with the binds in `node` and the nodes inside it, the first found, or undefined when nothing is. */
export function bindingProblem(
  container: ContainerSpec,
  node: DesignNode
): { node: string; message: string } | undefined {
  let found: { node: string; message: string } | undefined

  walkNodes(node, (each) => {
    if (found || !each.bind) {
      return
    }

    const say = (message: string) => {
      found = { node: each.id, message: `${each.name ?? each.id}: ${message}` }
    }

    if (container.kind !== "component") {
      return say(`only a component's layers bind to params, and ${container.name} is a ${container.kind ?? "screen"}`)
    }

    if (each.bind.text !== undefined && each.type !== "text") {
      return say("only a text layer's text binds to a param; bind a component's text through bind.props")
    }

    for (const field of ["text", "visible"] as const) {
      const name = each.bind[field]

      if (name === undefined) {
        continue
      }

      const param = container.params?.[name]
      const types: readonly string[] = bindableTypes[field]

      if (!param) {
        return say(`bind.${field} names "${name}", which isn't one of ${container.name}'s params`)
      }

      if (!types.includes(param.type)) {
        return say(`bind.${field} takes a ${types.join(" or ")} param, and "${name}" is a ${param.type}`)
      }
    }

    if (each.bind.props && Object.keys(each.bind.props).length > 0 && each.type !== "component") {
      return say("only a code component's props bind to params")
    }

    for (const [prop, name] of Object.entries(each.bind.props ?? {})) {
      if (!container.params?.[name]) {
        return say(`bind.props.${prop} names "${name}", which isn't one of ${container.name}'s params`)
      }
    }
  })

  return found
}

/** How the args instances pass change with a component's param. */
export type ArgChange =
  | { rename: string; to: string }
  | { drop: string }
  /** Instances that picked one of these options of a variant show its default instead. */
  | { param: string; options: readonly string[] }

/**
 * The args every instance of `component` in a design passes, changed to follow its params: in the instance itself, its
 * responsive patches, and the states', variant options' and other instances' patches that set them.
 */
export function changeArgs(
  container: ContainerSpec,
  component: string,
  change: ArgChange,
  library: ComponentLibrary
): ContainerSpec {
  const targets = (key: string) => {
    const node = isInnerPath(key) ? locateInner(container, key, library)?.node : findNode(container.root, key)

    return node?.type === "instance" && node.design === component
  }

  const editLayer = (layer: Record<string, NodePatch> | undefined, prefix = "") => {
    if (!layer) {
      return layer
    }

    let changed = false
    const next: Record<string, NodePatch> = {}

    for (const [key, patch] of Object.entries(layer)) {
      const edited = targets(prefix + key) ? changePatch(patch, change) : patch
      changed ||= edited !== patch

      if (edited) {
        next[key] = edited
      }
    }

    return changed ? next : layer
  }

  const instances: string[] = []
  walkNodes(container.root, (node) => {
    if (node.type === "instance") {
      instances.push(node.id)
    }
  })

  let root = container.root

  for (const id of instances) {
    root = mapNode(root, id, (node) => {
      if (node.type !== "instance") {
        return node
      }

      const next = { ...node }

      if (node.design === component) {
        const args = changeValues(node.args, change)

        if (args) {
          next.args = args
        } else {
          delete next.args
        }

        if (node.responsive) {
          next.responsive = Object.fromEntries(
            Object.entries(node.responsive).map(([viewport, patch]) => [viewport, changePatch(patch, change) ?? {}])
          )
        }
      }

      const overrides = editLayer(node.overrides, `${node.id}/`)

      if (overrides && Object.keys(overrides).length > 0) {
        next.overrides = overrides
      } else {
        delete next.overrides
      }

      return next
    })
  }

  const states = container.states?.map((state) => {
    const overrides = editLayer(state.overrides)

    return overrides === state.overrides ? state : withOverrides(state, overrides)
  })

  const params = container.params
    ? Object.fromEntries(
        Object.entries(container.params).map(([name, param]) => [
          name,
          param.options
            ? {
                ...param,
                options: param.options.map((option) => {
                  const overrides = editLayer(option.overrides)

                  return overrides === option.overrides ? option : withOverrides(option, overrides)
                })
              }
            : param
        ])
      )
    : undefined

  const next: ContainerSpec = { ...container, root }

  if (states) {
    next.states = states
  }

  if (params) {
    next.params = params
  }

  return next
}

/** A patch with the args in its props changed, or undefined when nothing's left of it. */
function changePatch(patch: NodePatch, change: ArgChange): NodePatch | undefined {
  const next: NodePatch = { ...patch }
  const props = changeValues(patch.props, change)

  if (props) {
    next.props = props
  } else {
    delete next.props
  }

  if (patch.unset?.props) {
    const unset = patch.unset.props.flatMap((name) => {
      if ("rename" in change) {
        return [name === change.rename ? change.to : name]
      }

      return "drop" in change && name === change.drop ? [] : [name]
    })

    next.unset = { ...patch.unset, props: unset }
  }

  const tidy = tidyPatch(next)

  return Object.keys(tidy).length > 0 ? tidy : undefined
}

function changeValues(values: PropValues | undefined, change: ArgChange): PropValues | undefined {
  if (!values) {
    return values
  }

  const next: PropValues = {}

  for (const [name, value] of Object.entries(values)) {
    if ("rename" in change) {
      next[name === change.rename ? change.to : name] = value
    } else if ("drop" in change) {
      if (name !== change.drop) {
        next[name] = value
      }
    } else if (name !== change.param || !change.options.includes(String(value))) {
      next[name] = value
    }
  }

  return Object.keys(next).length > 0 ? next : undefined
}

function renameInBinding(bind: NodeBinding, from: string, to: string): NodeBinding {
  const next: NodeBinding = { ...bind }

  if (next.text === from) {
    next.text = to
  }

  if (next.visible === from) {
    next.visible = to
  }

  if (next.props) {
    next.props = Object.fromEntries(
      Object.entries(next.props).map(([prop, param]) => [prop, param === from ? to : param])
    )
  }

  return next
}

function mapBindings(root: DesignNode, update: (bind: NodeBinding) => NodeBinding): DesignNode {
  return mapBoundNodes(root, (node) => ({ ...node, bind: update(node.bind!) }))
}

function mapBoundNodes(root: DesignNode, update: (node: DesignNode) => DesignNode): DesignNode {
  const bound: string[] = []
  walkNodes(root, (node) => {
    if (node.bind) {
      bound.push(node.id)
    }
  })

  return bound.reduce((current, id) => mapNode(current, id, update), root)
}

/** A node no longer binding `param` anywhere, keeping `value` as its own where it did. */
function unbindAll(node: DesignNode, param: string, value: ParamValue): DesignNode {
  let next = node
  const bind: NodeBinding = { ...node.bind }

  for (const field of ["text", "visible"] as const) {
    if (bind[field] === param) {
      delete bind[field]
      next = withOwnValue(next, { field }, value)
    }
  }

  if (bind.props) {
    const props = { ...bind.props }

    for (const [prop, name] of Object.entries(props)) {
      if (name === param) {
        delete props[prop]
        next = withOwnValue(next, { prop }, value)
      }
    }

    if (Object.keys(props).length > 0) {
      bind.props = props
    } else {
      delete bind.props
    }
  }

  const result: DesignNode = { ...next, bind }

  if (Object.keys(bind).length === 0) {
    delete result.bind
  }

  return result
}

/** A node showing `value` itself where a param used to give it: its text, its visibility or a prop. */
function withOwnValue(
  node: DesignNode,
  where: { field: "text" | "visible" } | { prop: string },
  value: ParamValue
): DesignNode {
  if (value === undefined) {
    return node
  }

  if ("prop" in where) {
    // SAFETY: a param's default is a value a prop can take, as the param stood for this prop until now.
    return node.type === "component"
      ? { ...node, props: { ...node.props, [where.prop]: value as PropValues[string] } }
      : node
  }

  const text = z.string().safeParse(value)
  const toggle = z.boolean().safeParse(value)

  if (where.field === "text" && node.type === "text" && text.success) {
    return { ...node, text: text.data }
  }

  if (where.field === "visible" && toggle.success) {
    const next = { ...node }

    if (toggle.data) {
      delete next.hidden
    } else {
      next.hidden = true
    }

    return next
  }

  return node
}

function withoutShownVariant(container: ContainerSpec, param: string): ContainerSpec {
  const variants = { ...container.view!.variants }
  delete variants[param]
  const view = { ...container.view }

  if (Object.keys(variants).length > 0) {
    view.variants = variants
  } else {
    delete view.variants
  }

  const next: ContainerSpec = { ...container, view }

  if (Object.keys(view).length === 0) {
    delete next.view
  }

  return next
}

/** A state or variant option with these patches, or with none when they're empty. */
function withOverrides<T extends { overrides?: Record<string, NodePatch> }>(
  holder: T,
  overrides: Record<string, NodePatch> | undefined
): T {
  const next = { ...holder, overrides }

  if (!overrides || Object.keys(overrides).length === 0) {
    delete next.overrides
  }

  return next
}
