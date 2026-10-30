/**
 * What a component accepts, inferred from its source: each prop's kind of value, the options a variant offers, and
 * its default. Panels and agents use it to offer valid values instead of free text.
 */
export interface ComponentInfo {
  name: string
  /** Module path, relative to the project root. */
  path: string
  /**
   * What the project's code imports it from: a library's package name, or for its own component, its file through the
   * tsconfig alias, as `@/components/ui/button`. Unset when only a relative path reaches it.
   */
  import?: string
  props: ComponentProp[]
  /**
   * Whether its props declare `style`, which is where the canvas puts the sizes and other styles a design gives it. False
   * when they don't, so those do nothing; unset when it isn't known, as for props typed `any`.
   */
  takesStyle?: boolean
}

export interface ComponentProp {
  name: string
  kind: PropKind
  /** The values an `enum` prop takes, in the order the source lists them. */
  options?: (string | number | boolean)[]
  /** The value used when the prop isn't set, when the source says. */
  default?: string | number | boolean | null
  required?: boolean
  /**
   * Where the prop comes from: a `variant` of the component's styles (cva), the component's `own` props, or what it
   * passes through to its element: `html` attributes, `aria` attributes and `event` handlers.
   */
  group: PropGroup
  /** The type as the source writes it, shortened. */
  type?: string
  description?: string
}

export type PropKind = "string" | "number" | "boolean" | "enum" | "node" | "function" | "object" | "unknown"
export type PropGroup = "variant" | "own" | "html" | "aria" | "event"

/** The props a person sets on the canvas: variants and own props first, then the element's attributes. */
export function editableProps(info: ComponentInfo | undefined): ComponentProp[] {
  return (info?.props ?? []).filter((prop) => prop.kind !== "function")
}

/** A component layer as the Props panel reads it: the props it's given, and the layers in its slots. */
export interface PropsHolder {
  props?: Record<string, unknown>
  slots?: Record<string, readonly unknown[]>
}

/**
 * How a node prop's field edits it: `layers` when its slot holds layers, which the canvas passes in place of a value;
 * `text` for text or no value; `value` for anything else (a number, `null`), edited as a typed value.
 */
export function nodePropInput(value: unknown, inSlot: boolean): "layers" | "text" | "value" {
  if (inSlot) return "layers"
  return typeof value === "string" || value === undefined ? "text" : "value"
}

/** What the Props panel lists for a component layer. */
export interface PropsPanel {
  /** Variants and own props, always listed. */
  main: ComponentProp[]
  /** Other props the layer has: set ones, and node props other than `children` whose slot holds layers. */
  extra: string[]
  /** Props that can still be added. */
  addable: ComponentProp[]
  /** Node props whose layers are in a slot of their name, which the canvas passes as the prop. */
  inSlot: Set<string>
}

/**
 * What the Props panel lists for a component layer. Every node prop shows as `children` does: text set as its value,
 * or "set in layers" once its slot holds layers (a Fluent Button's `icon`, a Card's `header`). Text in `children` is the
 * layer's label, so it isn't listed, and a prop held in a slot can't be added again.
 */
export function propsPanel(info: ComponentInfo | undefined, node: PropsHolder): PropsPanel {
  const values = node.props ?? {}
  const props = info?.props ?? []
  const inSlot = new Set(
    props.filter((prop) => prop.kind === "node" && (node.slots?.[prop.name]?.length ?? 0) > 0).map((prop) => prop.name)
  )
  const isLabel = (name: string) => name === "children" && typeof values.children === "string"
  const main = props.filter(
    (prop) => (prop.group === "variant" || prop.group === "own") && prop.kind !== "function" && !isLabel(prop.name)
  )
  const shown = new Set(main.map((prop) => prop.name))
  // A library's children in layers stay in the Layers panel alone, as they always have.
  const slotted = [...inSlot].filter((name) => name !== "children")
  const extra = [...new Set([...Object.keys(values), ...slotted])].filter((name) => !shown.has(name) && !isLabel(name))
  const addable = props.filter(
    (prop) =>
      !shown.has(prop.name) && !Object.hasOwn(values, prop.name) && !inSlot.has(prop.name) && prop.kind !== "function"
  )
  return { main, extra, addable, inSlot }
}
