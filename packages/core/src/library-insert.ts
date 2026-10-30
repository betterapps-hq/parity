import type { DesignNode } from "./document.ts"
import { generateId } from "./edit.ts"
import {
  type ComponentSample,
  isMadeValue,
  isSampleElement,
  isSampleRender,
  type LibraryComponent,
  renderSlotOf,
  type SampleChild,
  type SampleRender
} from "./library.ts"
import type { ComponentSource } from "./project.ts"
import type { ComponentInfo } from "./props.ts"

/** Nodes whose `children` is the name `componentNode` gave them, rather than text someone set. */
const named = new WeakSet<DesignNode>()

/**
 * A new node for a component, ready to show something: required props get their default or first option, and a
 * component that takes children gets its own name as text, so it isn't an empty box.
 */
export function componentNode(
  component: string,
  info: ComponentInfo | undefined,
  taken: Set<string>,
  given: Record<string, unknown> = {}
): DesignNode {
  const props: Record<string, unknown> = { ...given }
  for (const prop of info?.props ?? []) {
    if (prop.name in props) continue
    if (!prop.required || prop.default !== undefined || prop.name === "children") continue
    if (prop.kind === "enum") props[prop.name] = prop.options?.[0]
    else if (prop.kind === "boolean") props[prop.name] = false
    else if (prop.kind === "number") props[prop.name] = 0
    else if (prop.kind === "string") props[prop.name] = prop.name
  }
  const labelled = info?.props.some((prop) => prop.name === "children" && prop.kind === "node")
  if (labelled) props.children = component.split("/").at(-1) ?? component
  const node: DesignNode = {
    type: "component",
    id: generateId(taken),
    component,
    ...(Object.keys(props).length > 0 ? { props } : {})
  }
  if (labelled) named.add(node)
  return node
}

/**
 * A library component as its library file says it's used: with its sample (a collection's items, an Accordion's
 * item), and, for a part, inside the parents it needs that aren't around the drop target already. An
 * `AccordionTrigger` dropped into an empty layout comes inside an Accordion and an AccordionItem; dropped into an
 * AccordionItem, it comes alone.
 */
export function withLibraryContext(
  node: DesignNode,
  sources: Record<string, ComponentSource>,
  around: string[],
  taken: Set<string>
): DesignNode {
  if (node.type !== "component") return node
  const source = sources[node.component]
  if (!source) return node
  const id = () => {
    const next = generateId(taken)
    taken.add(next)
    return next
  }
  const build = (child: Exclude<SampleChild, SampleRender>): DesignNode => {
    if (typeof child === "string") return { type: "text", id: id(), text: child }
    // An HTML element in a sample stands for any single element a part clones: text is one.
    if (!child.component.includes("/")) {
      const text = child.children?.find((item): item is string => typeof item === "string") ?? "Text"
      return { type: "text", id: id(), text }
    }
    // A child its sample spells out (with props or children) is as written; only a bare one takes its own sample's
    // props, so one `Cell` example's `colSpan` doesn't reach every cell of a table.
    return component(child.component, child.props, child.children, !child.props && !child.children)
  }
  const nodes = (children: SampleChild[]) => children.flatMap((child) => (isSampleRender(child) ? [] : [build(child)]))
  /**
   * Props and children as a node holds them. A render function (`renderInput`, function children) is a `$render:`
   * slot of the nodes it returns, `$renderWith:` when what it's called with is spread onto them, so its nodes can be
   * edited like any others.
   */
  const held = (props: Record<string, unknown>, children: SampleChild[] = []) => {
    const plain: Record<string, unknown> = {}
    const slots: Record<string, DesignNode[]> = {}
    const renderSlot = (prop: string, render: SampleRender) => {
      const pass = render.pass ? `?pass=${render.pass.join(",")}` : ""
      slots[`${render.spread ? "$renderWith" : "$render"}:${prop}${pass}`] = nodes(render.$render)
    }
    for (const [key, value] of Object.entries(props)) {
      if (isSampleRender(value)) renderSlot(key, value)
      // Elements as a prop's value go in a slot of that name, which the canvas passes as the prop.
      else if (isSampleElement(value)) slots[key] = nodes(value.$element)
      else plain[key] = value
    }
    const render = children.find(isSampleRender)
    if (render) renderSlot("children", render)
    const rest = nodes(children)
    if (rest.length > 0) slots.children = rest
    return { props: plain, slots }
  }
  const component = (
    name: string,
    props?: Record<string, unknown>,
    children?: SampleChild[],
    defaults = true
  ): DesignNode => {
    const { props: merged, slots } = held({ ...(defaults ? sources[name]?.sample?.props : {}), ...props }, children)
    return {
      type: "component",
      id: id(),
      component: name,
      ...(Object.keys(merged).length > 0 ? { props: merged } : {}),
      ...(Object.keys(slots).length > 0 ? { slots } : {})
    }
  }
  let placed: DesignNode = node
  const sample = source.sample
  if (sample) {
    // Text the sample gives as a prop (Chakra's `Highlight`) stands in for the label a new node is named with, though
    // not for one set on purpose, even one that reads the same.
    const given = { ...node.props }
    if (sample.props && "children" in sample.props && named.has(node)) delete given.children
    const { props, slots } = held({ ...sample.props, ...given }, sample.children)
    // Children the sample spells out stand in for the text label, and none (`[]`, an input's) leave it out.
    if (sample.children) delete props.children
    const { props: _label, ...rest } = node
    placed = {
      ...rest,
      ...(Object.keys(props).length > 0 ? { props } : {}),
      ...(Object.keys(slots).length > 0 ? { slots: { ...node.slots, ...slots } } : {})
    }
  }
  const parents = source.parents ?? []
  const nearest = parents.findLastIndex((parent) => around.includes(parent))
  // An optional level (`DropdownMenuGroup`) comes only with a missing parent outside it, when the structure is new.
  const optional = new Set(source.optionalParents ?? [])
  const missing = parents.slice(nearest + 1)
  const added = missing.filter(
    (parent, index) => !optional.has(parent) || missing.slice(0, index).some((outer) => !optional.has(outer))
  )
  const calling = added.some((parent) => renderSlotOf(sources[parent]?.sample))
  if (source.parentParts && added.length > 0 && !calling) return inOuterSample(added, placed)
  for (const parent of added.reverse()) {
    const wrapper = component(parent)
    // A parent that calls its children, or a render prop (`TreeView.Node`'s `render`), gets the part in that render
    // slot, as its sample's own are.
    const calls = renderSlotOf(sources[parent]?.sample)
    const slot = calls
      ? `$render:${calls.prop}${calls.render.pass ? `?pass=${calls.render.pass.join(",")}` : ""}`
      : "children"
    const kept = Object.fromEntries(
      Object.entries(wrapper.type === "component" ? (wrapper.slots ?? {}) : {}).filter(
        ([name]) => !calls || !name.startsWith(`$render:${calls.prop}`)
      )
    )
    placed = wrapper.type === "component" ? { ...wrapper, slots: { ...(calls ? kept : {}), [slot]: [placed] } } : placed
  }
  return placed

  /**
   * A part that needs what's around it (a table's header beside the body a row is in) goes into the outermost
   * parent's whole sample, each level in place of the first like it there and the part in place of the first like it
   * at the bottom, so the row it's in keeps its other cells. A level the sample doesn't hold comes alone.
   */
  function inOuterSample(chain: string[], part: DesignNode): DesignNode {
    const inside = (level: number, given: SampleChild[] | undefined): DesignNode[] => {
      let name = ""
      if (level < chain.length) name = chain[level]!
      else if (part.type === "component") name = part.component
      const items = (given ?? []).filter((item): item is Exclude<SampleChild, SampleRender> => !isSampleRender(item))
      const at = items.findIndex((item) => typeof item === "object" && item.component === name)
      const found = at === -1 ? undefined : (items[at] as Exclude<SampleChild, string | SampleRender>)
      let here = part
      if (level < chain.length) {
        // A bare level takes its own sample, as any bare child does.
        const written = found && (found.props || found.children)
        const wrapper = component(name, found?.props, undefined, !written)
        const children = inside(level + 1, written ? found.children : sources[name]?.sample?.children)
        here = wrapper.type === "component" ? { ...wrapper, slots: { ...wrapper.slots, children } } : wrapper
      }
      return at === -1 ? [here] : items.map((item, index) => (index === at ? here : build(item)))
    }
    const outer = component(chain[0]!)
    const children = inside(1, sources[chain[0]!]?.sample?.children)
    return outer.type === "component" ? { ...outer, slots: { ...outer.slots, children } } : outer
  }
}

/**
 * A library file's component as the canvas inserts it, but for where it's declared: its import, its parents and sample
 * by component id (`nova/AccordionItem`), and `imported` naming the package the way the project depends on it.
 */
export function librarySource(
  library: string,
  name: string,
  component: LibraryComponent,
  path: string,
  imported: (specifier: string) => string = (specifier) => specifier
): Omit<ComponentSource, "declaration"> {
  return {
    path,
    export: name,
    library,
    ...(component.group ? { group: component.group } : {}),
    ...(component.parents ? { parents: component.parents.map((parent) => `${library}/${parent}`) } : {}),
    ...(component.internal ? { internal: true as const } : {}),
    ...(component.visual === false ? { visual: false as const } : {}),
    ...(component.optionalParents
      ? { optionalParents: component.optionalParents.map((parent) => `${library}/${parent}`) }
      : {}),
    ...(component.parentParts ? { parentParts: true as const } : {}),
    ...(component.sample ? { sample: sampleIds(component.sample, library, imported) } : {})
  }
}

/**
 * A sample with its children's components named by id, as `nova/AccordionItem`; HTML elements keep their tag. A value the
 * package makes (`{ $call: { import: "@chakra-ui/react", ... } }`) imports it by the name the project depends on.
 */
export function sampleIds(
  sample: ComponentSample,
  library: string,
  imported: (specifier: string) => string = (specifier) => specifier
): ComponentSample {
  const child = (node: SampleChild): SampleChild => {
    if (typeof node === "string") return node
    if (isSampleRender(node)) return { ...node, $render: node.$render.map(child) }
    return {
      ...node,
      component: /^[a-z]/.test(node.component) ? node.component : `${library}/${node.component}`,
      ...(node.props ? { props: propIds(node.props) } : {}),
      ...(node.children ? { children: node.children.map(child) } : {})
    }
  }
  // A render function in a prop (`renderInput`) names components too.
  const propId = (item: unknown): unknown => {
    if (isSampleRender(item)) return { ...item, $render: item.$render.map(child) }
    if (isSampleElement(item)) return { $element: item.$element.map(child) }
    return isMadeValue(item) ? { ...item, $call: { ...item.$call, import: imported(item.$call.import) } } : item
  }
  const propIds = (props: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(props).map(([key, item]) => [key, propId(item)]))
  return {
    ...sample,
    ...(sample.props ? { props: propIds(sample.props) } : {}),
    ...(sample.children ? { children: sample.children.map(child) } : {})
  }
}
