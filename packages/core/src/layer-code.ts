import type { DesignNode, Length, NodeStyle, Padding, StyleKey } from "./document.ts"
import { iconStyleModules } from "./icon-names.ts"
import type { LibraryInfo } from "./project.ts"

/** The direction of the layout a node sits in; unset outside a layout and inside a component's slots. */
type Direction = "row" | "column"

/** What the code needs to know of a component: the name its module exports it by, and the module. */
export interface CodeComponent {
  /** Its export, `Button`, `Dialog.Root` inside a namespace, or `default`. */
  export?: string
  /** The module the project's code imports it from: `@/components/ui/button`, or a library's package. */
  import?: string
}

export interface LayerCodeOptions {
  /** A component of the project's by its id. One it doesn't know is written by its id's last part, with no import. */
  component?: (id: string) => CodeComponent | undefined
  /** The direction of the layout the layer sits in, which decides what filling and fixed sizes come to. */
  parent?: Direction
  /** A component design's name by its id, which its copies are written as. */
  designName?: (id: string) => string | undefined
}

/** A token the layer or what's inside it uses, with the style keys that use it, in the order they're first met. */
export interface LayerToken {
  name: string
  keys: StyleKey[]
}

/** The code Parity would write for a layer: its JSX, its own Tailwind classes, the imports and the tokens. */
export interface LayerCode {
  /** The layer and what's inside it as JSX, two spaces to a level. */
  jsx: string
  /** The layer's own classes, as its `className` holds them; empty when it has none. */
  classes: string
  /** One `import` line per module, in the order the JSX first uses them. */
  imports: string[]
  tokens: LayerToken[]
}

/**
 * The JSX and Tailwind classes a developer would write for a layer, from the design alone (PAR-166): a layout is a
 * `div`, text its tag, an image an `img`, a component the project's own, with its props, and a component design's copy
 * its design's name, with its values. Each carries the classes that draw what `render.ts` draws, in Tailwind v4's
 * names: spacing steps as `p-4`, tokens by their utility (`bg-primary`, `rounded-lg`, `text-sm`) or, where no utility
 * names one, as a variable (`w-(--sidebar-width)`). Hidden layers inside it are left out; the layer itself is written\n * even when hidden, since it was asked for. Writes nothing.
 */
export function layerCode(node: DesignNode, options: LayerCodeOptions = {}): LayerCode {
  const imports = new Map<string, Set<string>>()
  const defaults = new Map<string, string>()
  const write = (shown: DesignNode, parent: Direction | undefined, depth: number, lines: string[], root = false) => {
    if (shown.hidden && !root) return
    const indent = "  ".repeat(depth)
    const style = shown.style ?? {}
    const classes = nodeClasses(shown, parent)
    const attributes: string[] = []
    if (shown.type === "image") attributes.push(attribute("src", shown.src), attribute("alt", shown.alt ?? ""))
    let tag: string
    let children: { nodes: DesignNode[]; parent: Direction | undefined } | undefined
    let text: string | undefined
    switch (shown.type) {
      case "layout":
        tag = "div"
        children = { nodes: shown.children, parent: style.direction ?? "column" }
        break
      case "text":
        tag = shown.tag ?? "p"
        text = shown.text
        break
      case "image":
        tag = "img"
        break
      case "component": {
        const component = options.component?.(shown.component)
        tag = componentTag(shown.component, component)
        if (component?.import) {
          if (component.export === "default") defaults.set(component.import, tag)
          else {
            const names = imports.get(component.import) ?? new Set()
            names.add(tag.split(".")[0]!)
            imports.set(component.import, names)
          }
        }
        const slots = shown.slots ?? {}
        for (const [name, value] of Object.entries(shown.props ?? {})) {
          // Text given as `children` is written between the tags, as a developer writes it.
          if (name === "children" && typeof value === "string" && !slots.children?.length) text = value
          else attributes.push(attribute(name, value))
        }
        for (const [slot, nodes] of Object.entries(slots)) {
          if (slot === "children") continue
          // A slot other than children is a prop holding elements, written on one line.
          const inner: string[] = []
          for (const child of nodes) write(child, undefined, 0, inner)
          if (inner.length === 0) continue
          const elements = inner.map((line) => line.trim()).join(" ")
          const one = nodes.filter((child) => !child.hidden).length === 1
          attributes.push(`${slot}={${one ? elements : `<>${elements}</>`}}`)
        }
        children = { nodes: slots.children ?? [], parent: undefined }
        break
      }
      case "instance":
        tag = pascalCase(options.designName?.(shown.design) ?? shown.design)
        for (const [name, value] of Object.entries(shown.args ?? {})) attributes.push(attribute(name, value))
        break
    }
    if (classes) attributes.push(attribute("className", classes))
    const open = openingTag(indent, tag, attributes)
    const shownChildren = children?.nodes.filter((child) => !child.hidden) ?? []
    if (text !== undefined) {
      const content = jsxText(text)
      const oneLine = `${open}>${content}</${tag}>`
      if (!oneLine.includes("\n") && oneLine.length <= maxLine) lines.push(oneLine)
      else lines.push(`${open}>`, ...content.split("\n").map((line) => `${indent}  ${line}`), `${indent}</${tag}>`)
    } else if (shownChildren.length === 0) lines.push(open.endsWith("\n" + indent) ? `${open}/>` : `${open} />`)
    else {
      lines.push(`${open}>`)
      for (const child of shownChildren) write(child, children?.parent, depth + 1, lines)
      lines.push(`${indent}</${tag}>`)
    }
  }
  const lines: string[] = []
  write(node, options.parent, 0, lines, true)
  const importLines = [
    ...[...defaults].map(([from, name]) => `import ${name} from "${from}"`),
    ...[...imports].map(([from, names]) => `import { ${[...names].join(", ")} } from "${from}"`)
  ]
  return {
    jsx: lines.join("\n"),
    classes: nodeClasses(node, options.parent),
    imports: importLines,
    tokens: layerTokens(node)
  }
}

/** Past this many characters, an element's attributes go one to a line. */
const maxLine = 80

function openingTag(indent: string, tag: string, attributes: string[]): string {
  const flat = `${indent}<${tag}${attributes.map((entry) => ` ${entry}`).join("")}`
  if (flat.length + 3 <= maxLine || attributes.length === 0) return flat
  return `${indent}<${tag}\n${attributes.map((entry) => `${indent}  ${entry}`).join("\n")}\n${indent}`
}

/**
 * The line that imports a component, as the project's code would write it: `import { Button } from "@/components/ui/button"`,
 * the namespace for an export inside one, or a default import named by its id. Unset without a module to import it from.
 */
export function importLine(id: string, component: CodeComponent): string | undefined {
  if (!component.import) return undefined
  const name = componentTag(id, component)
  if (component.export === "default") return `import ${name} from "${component.import}"`
  return `import { ${name.split(".")[0]} } from "${component.import}"`
}

/** How a component is written: its export, or its id's last part when it has no named one. */
function componentTag(id: string, component: CodeComponent | undefined): string {
  if (component?.export && component.export !== "default") return component.export
  return pascalCase(id.split("/").at(-1) ?? id)
}

function pascalCase(name: string): string {
  const words = name.split(/[^A-Za-z0-9]+/).filter(Boolean)
  const joined = words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join("")
  return /^[A-Z]/.test(joined) ? joined : `C${joined}`
}

/** A JSX attribute: a string in quotes, `true` as the bare name, anything else as an expression. */
function attribute(name: string, value: unknown): string {
  if (value === true) return name
  if (typeof value === "string" && !/["\n\\{}]/.test(value)) return `${name}="${value}"`
  return `${name}={${JSON.stringify(value) ?? "undefined"}}`
}

/** Text as JSX writes it: as it is, unless it holds a character JSX reads, when it's a string expression. */
function jsxText(text: string): string {
  return /[{}<>]/.test(text) ? `{${JSON.stringify(text)}}` : text
}

/** A layer's own Tailwind classes, as `render.ts` draws its type of layer, each once. */
function nodeClasses(node: DesignNode, parent: Direction | undefined): string {
  return [...new Set(classList(node, parent))].join(" ")
}

function classList(node: DesignNode, parent: Direction | undefined): string[] {
  const style = node.style ?? {}
  switch (node.type) {
    case "layout": {
      const absolute = node.children.some((child) => !child.hidden && child.style?.position === "absolute")
      return [
        ...layoutClasses(style),
        ...(absolute && style.position !== "absolute" ? ["relative"] : []),
        ...surfaceClasses(style),
        ...spacingClasses(style),
        ...boxClasses(style, parent, false)
      ]
    }
    case "text":
      return [
        ...surfaceClasses(style),
        ...spacingClasses(style),
        ...boxClasses(style, parent, true),
        ...linesClasses(style)
      ]
    case "image":
      return [
        "block",
        `object-${node.fit ?? "cover"}`,
        ...surfaceClasses(style),
        ...spacingClasses(style),
        ...boxClasses(style, parent, false)
      ]
    default:
      return [...surfaceClasses(style), ...spacingClasses(style), ...boxClasses(style, parent, false)]
  }
}

const itemsClass = { start: "items-start", center: "items-center", end: "items-end", stretch: "items-stretch" }
const selfClass = { start: "self-start", center: "self-center", end: "self-end", stretch: "self-stretch" }

function layoutClasses(style: NodeStyle): string[] {
  const grid = style.display === "grid"
  const classes = [grid ? "grid" : "flex"]
  if (grid) {
    classes.push(`grid-cols-${style.columns ?? 2}`)
    if (style.rows !== undefined) classes.push(`grid-rows-${style.rows}`)
  } else {
    // Parity's layouts stack by default; a flex box's own default is a row.
    if ((style.direction ?? "column") === "column") classes.push("flex-col")
    if (style.wrap) classes.push("flex-wrap")
  }
  if (style.gap !== undefined) classes.push(lengthClass("gap", style.gap))
  if (style.rowGap !== undefined) classes.push(lengthClass("gap-y", style.rowGap))
  if (style.align) classes.push(itemsClass[style.align])
  if (style.justify) {
    // A grid places items within their cells along the row; distributing space is for the tracks themselves.
    const distributes = style.justify === "between" || style.justify === "around" || style.justify === "evenly"
    classes.push(grid && !distributes ? `justify-items-${style.justify}` : `justify-${style.justify}`)
  }
  return classes
}

function spacingClasses(style: NodeStyle): string[] {
  return [
    ...(style.padding === undefined ? [] : sidesClasses("p", style.padding)),
    ...(style.margin === undefined ? [] : sidesClasses("m", style.margin))
  ]
}

/** Padding or margin as few classes as say it: `p-4`, `px-4 py-2`, or a side each. */
function sidesClasses(prefix: "p" | "m", value: Padding): string[] {
  let sides: readonly Length[] = [value as Length]
  if (Array.isArray(value)) sides = value.length === 2 ? [value[0], value[1], value[0], value[1]] : value
  const [top, right = top, bottom = top, left = right] = sides as [Length, ...Length[]]
  if (top === bottom && right === left) {
    if (top === right) return [lengthClass(prefix, top)]
    return [lengthClass(`${prefix}x`, right), lengthClass(`${prefix}y`, top)]
  }
  return [
    lengthClass(`${prefix}t`, top),
    lengthClass(`${prefix}r`, right),
    lengthClass(`${prefix}b`, bottom),
    lengthClass(`${prefix}l`, left)
  ]
}

function surfaceClasses(style: NodeStyle): string[] {
  const classes: string[] = []
  if (style.background) classes.push(colorClass("bg", style.background))
  if (style.border !== undefined || style.borderWidth !== undefined) {
    const width = style.borderWidth ?? 1
    classes.push(width === 1 ? "border" : `border-${width}`)
    if (style.borderStyle && style.borderStyle !== "solid") classes.push(`border-${style.borderStyle}`)
    if (style.border) classes.push(colorClass("border", style.border))
  }
  if (style.radius) classes.push(namedClass("rounded", "radius", style.radius))
  if (style.shadow) classes.push(namedClass("shadow", "shadow", style.shadow))
  if (style.overflow) classes.push(`overflow-${style.overflow === "scroll" ? "auto" : style.overflow}`)
  return classes
}

const weights: Readonly<Record<number, string>> = {
  100: "thin",
  200: "extralight",
  300: "light",
  400: "normal",
  500: "medium",
  600: "semibold",
  700: "bold",
  800: "extrabold",
  900: "black"
}

/** Size and place in the parent's layout, opacity, and type, as `boxCss` in `render.ts`. */
function boxClasses(style: NodeStyle, parent: Direction | undefined, text: boolean): string[] {
  const classes: string[] = []
  const fill = (axis: "w" | "h") => {
    if (parent === undefined) classes.push(`${axis}-full`)
    else if ((axis === "w") === (parent === "row")) classes.push("flex-1", `min-${axis}-0`)
    else classes.push("self-stretch")
  }
  if (style.grow) fill(parent === "column" ? "h" : "w")
  for (const [axis, size] of [
    ["w", style.width],
    ["h", style.height]
  ] as const) {
    if (size === undefined) continue
    if (size === "hug") classes.push(text && axis === "w" ? "w-max" : `${axis}-fit`)
    else if (size === "fill") fill(axis)
    else {
      classes.push(lengthClass(axis, size))
      if (parent !== undefined && (axis === "w") === (parent === "row")) classes.push("shrink-0")
    }
  }
  if (style.minWidth !== undefined) classes.push(lengthClass("min-w", style.minWidth))
  if (style.maxWidth !== undefined) classes.push(lengthClass("max-w", style.maxWidth))
  if (style.minHeight !== undefined) classes.push(lengthClass("min-h", style.minHeight))
  if (style.maxHeight !== undefined) classes.push(lengthClass("max-h", style.maxHeight))
  if (style.self) classes.push(selfClass[style.self])
  if (style.colSpan !== undefined) classes.push(`col-span-${style.colSpan}`)
  if (style.rowSpan !== undefined) classes.push(`row-span-${style.rowSpan}`)
  if (style.position === "absolute") {
    classes.push("absolute")
    for (const side of ["top", "right", "bottom", "left"] as const) {
      const value = style[side]
      if (value !== undefined) classes.push(lengthClass(side, value))
    }
  }
  if (style.opacity !== undefined) classes.push(`opacity-${style.opacity}`)
  if (style.foreground) classes.push(colorClass("text", style.foreground))
  if (style.font) classes.push(namedClass("font", "font", style.font, "family-name"))
  if (style.size) classes.push(namedClass("text", "text", style.size, "length"))
  if (style.leading) classes.push(namedClass("leading", "leading", style.leading))
  if (style.weight !== undefined) {
    const named = weights[style.weight]
    classes.push(named ? `font-${named}` : `font-[${style.weight}]`)
  }
  if (style.tracking) classes.push(namedClass("tracking", "tracking", style.tracking))
  if (style.textAlign) classes.push(`text-${style.textAlign}`)
  if (style.transform) classes.push(style.transform)
  if (style.decoration) classes.push(style.decoration)
  if (style.italic) classes.push("italic")
  return classes
}

function linesClasses(style: NodeStyle): string[] {
  if (style.lines === 1) return ["truncate"]
  if (style.lines !== undefined && style.lines > 1) return [`line-clamp-${style.lines}`]
  return []
}

/**
 * A length as a utility: a step of the spacing scale as its number (`p-4`, `-mt-2`), a `--spacing-*` token by its
 * name (`p-gutter`), a `--container-*` one on a width (`max-w-md`), and any other token as its variable.
 */
function lengthClass(prefix: string, value: Length): string {
  if (typeof value === "number") return value < 0 ? `-${prefix}-${-value}` : `${prefix}-${value}`
  if (value.startsWith("spacing-")) return `${prefix}-${value.slice("spacing-".length)}`
  if (value.startsWith("container-") && /^(?:min-|max-)?w$/.test(prefix)) {
    return `${prefix}-${value.slice("container-".length)}`
  }
  return `${prefix}-(--${value})`
}

/** A color token as a utility: `bg-primary` for `--primary` or `--color-primary`. */
function colorClass(prefix: string, name: string): string {
  return `${prefix}-${name.startsWith("color-") ? name.slice("color-".length) : name}`
}

/**
 * A token in a theme namespace as its utility (`radius-lg` is `rounded-lg`, `text-sm` stays `text-sm`); any other
 * token as its variable, with the type Tailwind needs to tell what it is where a prefix does more than one thing.
 */
function namedClass(prefix: string, namespace: string, name: string, type?: string): string {
  if (name.startsWith(`${namespace}-`)) return `${prefix}-${name.slice(namespace.length + 1)}`
  return `${prefix}-(${type ? `${type}:` : ""}--${name})`
}

/** Style keys whose value names a token whenever it's a string. */
const tokenKeys = new Set<StyleKey>([
  "background",
  "foreground",
  "border",
  "radius",
  "shadow",
  "font",
  "size",
  "leading",
  "tracking"
])

/** Style keys whose value is a length, which names a token when it's a string other than `fill` or `hug`. */
const lengthKeys = new Set<StyleKey>([
  "gap",
  "rowGap",
  "padding",
  "margin",
  "width",
  "height",
  "minWidth",
  "maxWidth",
  "minHeight",
  "maxHeight",
  "top",
  "right",
  "bottom",
  "left"
])

/** Every token the layer and what's shown inside it use, each with the style keys that use it, even when it's hidden. */
export function layerTokens(node: DesignNode): LayerToken[] {
  const found = new Map<string, Set<StyleKey>>()
  const add = (name: string, key: StyleKey) => found.set(name, (found.get(name) ?? new Set()).add(key))
  const visit = (shown: DesignNode, root = false) => {
    if (shown.hidden && !root) return
    for (const [key, value] of Object.entries(shown.style ?? {}) as [StyleKey, unknown][]) {
      if (tokenKeys.has(key) && typeof value === "string") add(value, key)
      else if (lengthKeys.has(key)) {
        for (const length of Array.isArray(value) ? value : [value]) {
          if (typeof length === "string" && length !== "fill" && length !== "hug") add(length, key)
        }
      }
    }
    if (shown.type === "layout") for (const child of shown.children) visit(child)
    if (shown.type === "component")
      for (const nodes of Object.values(shown.slots ?? {})) for (const child of nodes) visit(child)
  }
  visit(node, true)
  return [...found].map(([name, keys]) => ({ name, keys: [...keys] }))
}

/**
 * An icon set's icon as code: `lucide/Hexagon` is `Hexagon` from the set's module, and `heroicons/16/solid/CogIcon`
 * `CogIcon` from the module that style is kept in. Unset for an id no icon set in `libraries` has.
 */
export function iconComponent(id: string, libraries: readonly LibraryInfo[]): CodeComponent | undefined {
  const [set, ...rest] = id.split("/")
  const library = libraries.find((entry) => entry.id === set && entry.kind === "icons")
  const name = rest.at(-1)
  if (!library || !name) return undefined
  const key = rest.slice(0, -1).join("/")
  if (!key) return { export: name, import: library.icons?.import ?? library.importName }
  const module = iconStyleModules(library.icons, library.importName).find((entry) => entry.key === key)
  return { export: name, import: module?.import ?? `${library.importName}/${key}` }
}

/**
 * A length the browser left as arithmetic, worked out in pixels: `calc(calc(0.625 * 16px) * 0.8)` is `8px`. Unset for
 * anything else, such as a value with other units or a function that isn't `calc`.
 */
export function calcPixels(value: string): string | undefined {
  if (!value.includes("calc(")) return undefined
  const tokens = value.replaceAll("calc(", "(").match(/\d*\.?\d+(?:e[+-]?\d+)?(?:px)?|[()+\-*/]|\S+/gi) ?? []
  let at = 0
  type Amount = { n: number; px: boolean }
  const primary = (): Amount => {
    const token = tokens[at++]
    if (token === "(") {
      const inner = sum()
      if (tokens[at++] !== ")") throw new Error("unclosed")
      return inner
    }
    if (token === "-") {
      const negated = primary()
      return { n: -negated.n, px: negated.px }
    }
    const match = token && /^(\d*\.?\d+(?:e[+-]?\d+)?)(px)?$/i.exec(token)
    if (!match) throw new Error("not a number")
    return { n: Number(match[1]), px: !!match[2] }
  }
  const product = (): Amount => {
    let left = primary()
    while (tokens[at] === "*" || tokens[at] === "/") {
      const op = tokens[at++]
      const right = primary()
      if (op === "*" && !(left.px && right.px)) left = { n: left.n * right.n, px: left.px || right.px }
      else if (op === "/" && !right.px && right.n !== 0) left = { n: left.n / right.n, px: left.px }
      else throw new Error("not a length")
    }
    return left
  }
  const sum = (): Amount => {
    let left = product()
    while (tokens[at] === "+" || tokens[at] === "-") {
      const op = tokens[at++]
      const right = product()
      if (left.px !== right.px) throw new Error("mixed units")
      left = { n: op === "+" ? left.n + right.n : left.n - right.n, px: left.px }
    }
    return left
  }
  try {
    const result = sum()
    if (at !== tokens.length || !result.px) return undefined
    return `${Math.round(result.n * 100) / 100}px`
  } catch {
    return undefined
  }
}
