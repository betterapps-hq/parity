import { z } from "zod"
import type { ContainerSpec, DesignNode, ParamSpec } from "./document.ts"
import { locateNode, mapNode } from "./edit.ts"
import { slotName, slotNameProblem } from "./slot-names.ts"
import { designSlots } from "./slots.ts"

/*
 * A component design's value props, made by hand rather than by Extract component, and the text layers that show them.
 * A prop no layer uses is still the component's, in its code and on each instance.
 */

/** The kinds of value prop Props' Add makes. */
export const valuePropTypes = ["text", "number", "boolean"] as const

export type ValuePropType = (typeof valuePropTypes)[number]

/** The default a new prop of each kind starts with. */
const startingValues = { text: "Text", number: 0, boolean: false } satisfies Record<ValuePropType, ParamSpec["default"]>

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

/** The component's text props, the ones a text layer's text can use. */
export function textProps(container: ContainerSpec): string[] {
  return Object.entries(container.params ?? {})
    .filter(([, param]) => param.type === "text")
    .map(([name]) => name)
}

/**
 * Makes a text layer's text use one of the component's text props, or, with `param` undefined, go back to text of its
 * own: the text the prop showed by default, so the layer looks the same.
 */
export function bindText(container: ContainerSpec, nodeId: string, param: string | undefined): ContainerSpec {
  if (container.kind !== "component") {
    throw new Error("Only a component design's layers use props")
  }

  const node = locateNode(container.root, nodeId)?.node

  if (!node) {
    throw new Error(`No node "${nodeId}" in this design`)
  }

  if (node.type !== "text") {
    throw new Error("Only a text layer's text can use a prop")
  }

  if (param !== undefined && container.params?.[param]?.type !== "text") {
    throw new Error(`${container.name} has no text prop called ${param}`)
  }

  const root = mapNode(container.root, nodeId, (current) => {
    const next: DesignNode = { ...current, bind: { ...current.bind } }
    const was = current.bind?.text

    if (param === undefined) {
      delete next.bind!.text
      const text = z.string().safeParse(was === undefined ? undefined : container.params?.[was]?.default)

      if (next.type === "text" && text.success) {
        next.text = text.data
      }
    } else {
      next.bind!.text = param
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
 * Adds a text prop from a text layer's text and makes the text use it: named after the layer, with its text now as the
 * prop's default, so nothing changes until an instance sets it. Returns the design and the prop's name.
 */
export function propFromText(container: ContainerSpec, nodeId: string): AddedProp {
  const node = locateNode(container.root, nodeId)?.node

  if (!node) {
    throw new Error(`No node "${nodeId}" in this design`)
  }

  if (node.type !== "text") {
    throw new Error("Only a text layer's text can use a prop")
  }

  const name = freePropName(container, node.name ?? node.text)
  const added = addValueProp(container, name, "text")

  const withDefault: ContainerSpec = {
    ...added,
    params: { ...added.params, [name]: { type: "text", default: node.text } }
  }

  return { container: bindText(withDefault, nodeId, name), name }
}
