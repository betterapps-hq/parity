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
