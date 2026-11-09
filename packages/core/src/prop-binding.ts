import { z } from "zod"
import type { ContainerSpec, DesignNode, ParamSpec } from "./document.ts"
import { locateNode, mapNode } from "./edit.ts"
import { slotName, slotNameProblem } from "./slot-names.ts"
import { designSlots } from "./slots.ts"

/*
 * A component design's value props, made by hand rather than by Extract component, and the layer fields that use them:
 * a layer's text shows a text prop, and its visibility follows a toggle. A prop no field uses is still the component's,
 * in its code and on each instance.
 */

/** The kinds of value prop Props' Add makes. */
export const valuePropTypes = ["text", "number", "boolean"] as const

export type ValuePropType = (typeof valuePropTypes)[number]

/** The default a new prop of each kind starts with. */
const startingValues = { text: "Text", number: 0, boolean: false } satisfies Record<ValuePropType, ParamSpec["default"]>

/** The layer fields a prop can drive, and the kind of prop each takes. */
export type BindableField = "text" | "visible"

const fieldTypes = { text: "text", visible: "boolean" } as const satisfies Record<BindableField, ValuePropType>

/**
 * Why a component design can't take a new prop called `name`, or undefined when it can: a prop is a prop in code, so its
 * name is one code could use, and no other prop or slot has it.
 */
export function propNameProblem(container: ContainerSpec, name: string): string | undefined {
  const unusable = slotNameProblem(name)

  if (unusable) {
    return `A prop's name ${unusable}.`
  }

  if (container.params?.[name] || designSlots(container).some((slot) => slot.name === name)) {
    return `There's already a prop called ${name}.`
  }

  return undefined
}

/** A name no prop or slot has, from `preferred`, numbered as needed. */
export function freePropName(container: ContainerSpec, preferred: string): string {
  const base = slotName(preferred) || "prop"

  if (!propNameProblem(container, base)) {
    return base
  }

  let counter = 2

  while (propNameProblem(container, `${base}${counter}`)) {
    counter++
  }

  return `${base}${counter}`
}

/** Adds a value prop to a component design, with a default for its kind. Throws when the name can't be used. */
export function addValueProp(container: ContainerSpec, name: string, type: ValuePropType): ContainerSpec {
  if (container.kind !== "component") {
    throw new Error("Only a component design has props")
  }

  const problem = propNameProblem(container, name)

  if (problem) {
    throw new Error(problem)
  }

  return { ...container, params: { ...container.params, [name]: { type, default: startingValues[type] } } }
}

/** The component's props a layer's field can use: its text props for text, its toggles for visibility. */
export function bindableProps(container: ContainerSpec, field: BindableField): string[] {
  return Object.entries(container.params ?? {})
    .filter(([, param]) => param.type === fieldTypes[field])
    .map(([name]) => name)
}

/**
 * Makes a layer's field use one of the component's props, or, with `param` undefined, go back to a value of its own:
 * the one the prop showed by default, so the layer looks the same.
 */
export function bindField(
  container: ContainerSpec,
  nodeId: string,
  field: BindableField,
  param: string | undefined
): ContainerSpec {
  if (container.kind !== "component") {
    throw new Error("Only a component design's layers use props")
  }

  const node = locateNode(container.root, nodeId)?.node

  if (!node) {
    throw new Error(`No node "${nodeId}" in this design`)
  }

  if (field === "text" && node.type !== "text") {
    throw new Error("Only a text layer's text can use a prop")
  }

  if (param !== undefined && container.params?.[param]?.type !== fieldTypes[field]) {
    throw new Error(`${container.name} has no ${fieldTypes[field]} prop called ${param}`)
  }

  const root = mapNode(container.root, nodeId, (current) => {
    const next: DesignNode = { ...current, bind: { ...current.bind } }
    const was = current.bind?.[field]

    if (param === undefined) {
      delete next.bind![field]
      const shown = was === undefined ? undefined : container.params?.[was]?.default

      const text = z.string().safeParse(shown)
      const toggle = z.boolean().safeParse(shown)

      if (field === "text" && next.type === "text" && text.success) {
        next.text = text.data
      }

      if (field === "visible" && toggle.success) {
        if (toggle.data) {
          delete next.hidden
        } else {
          next.hidden = true
        }
      }
    } else {
      next.bind![field] = param
    }

    if (Object.keys(next.bind!).length === 0) {
      delete next.bind
    }

    return next
  })

  return { ...container, root }
}

/** A component design with a prop added, and the prop's name. */
interface AddedProp {
  container: ContainerSpec
  name: string
}

/**
 * Adds a prop from a layer's field and makes the field use it: named after the layer, with what the field shows now as
 * its default, so nothing changes until an instance sets it. Returns the design and the prop's name.
 */
export function propFromField(container: ContainerSpec, nodeId: string, field: BindableField): AddedProp {
  const node = locateNode(container.root, nodeId)?.node

  if (!node) {
    throw new Error(`No node "${nodeId}" in this design`)
  }

  const label = node.name ?? (node.type === "text" ? node.text : "")
  const name = freePropName(container, field === "visible" ? `show ${label}` : label)
  const type = fieldTypes[field]
  const added = addValueProp(container, name, type)
  const value = field === "text" && node.type === "text" ? node.text : !node.hidden

  const withDefault: ContainerSpec = {
    ...added,
    params: { ...added.params, [name]: { type, default: value } }
  }

  return { container: bindField(withDefault, nodeId, field, name), name }
}
