import type { ComponentNode, DesignNode, PropValues } from "./document.ts"
import { generateId } from "./edit.ts"
import {
  type ComponentSample,
  isSampleText,
  type LibraryComponent,
  type SampleChild,
  type SampleComponent,
  type SampleRender
} from "./library.ts"
import { type ComponentSource, openProps } from "./project.ts"
import type { ComponentInfo } from "./props.ts"
import { isSampleElement, isSampleRender, readRenderSlotKey, renderSlotKey, renderSlotOf } from "./values/evaluate.ts"

/** A component node's slots: the nodes in each, by slot name. */
type NodeSlots = NonNullable<ComponentNode["slots"]>

/** A sample's props, as its library file gives them. */
type SampleProps = NonNullable<ComponentSample["props"]>

/** One of a sample's props' values. */
type SampleValue = SampleProps[string]

/** Nodes whose `children` is the name `componentNode` gave them, rather than text someone set. */
const named = new WeakSet<DesignNode>()

/**
 * A new node for a component, ready to show something: required props get their default or first option, and a
 * component that takes children gets its own name as text, so it isn't an empty box, unless `given` has its own or the
 * component sets its own size (`fixedSize`), where the name would be cut off ("Avata").
 */
export function componentNode(
  component: string,
  info: Pick<ComponentInfo, "props" | "fixedSize"> | undefined,
  taken: Set<string>,
  given: PropValues = {}
): DesignNode {
  const props: PropValues = { ...given }

  for (const prop of info?.props ?? []) {
    if (prop.name in props) {
      continue
    }

    if (!prop.required || prop.default !== undefined || prop.name === "children") {
      continue
    }

    if (prop.kind === "enum") {
      props[prop.name] = prop.options?.[0]
    } else if (prop.kind === "boolean") {
      props[prop.name] = false
    } else if (prop.kind === "number") {
      props[prop.name] = 0
    } else if (prop.kind === "string") {
      props[prop.name] = prop.name
    }
  }

  const labelled =
    !("children" in given) &&
    !info?.fixedSize &&
    info?.props.some((prop) => prop.name === "children" && prop.kind === "node")

  if (labelled) {
    props.children = component.split("/").at(-1) ?? component
  }

  const node: ComponentNode = { type: "component", id: generateId(taken), component }

  if (Object.keys(props).length > 0) {
    node.props = props
  }

  if (labelled) {
    named.add(node)
  }

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
  if (node.type !== "component") {
    return node
  }

  const source = sources[node.component]

  if (!source) {
    return node
  }

  const id = () => {
    const next = generateId(taken)
    taken.add(next)

    return next
  }

  const build = (child: Exclude<SampleChild, SampleRender>): DesignNode => {
    if (isSampleText(child)) {
      return { type: "text", id: id(), text: child }
    }

    // An HTML element in a sample stands for any single element a part clones: text is one.
    if (!child.component.includes("/")) {
      const text = child.children?.find(isSampleText) ?? "Text"

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
  const held = (props: SampleProps, children: SampleChild[] = []) => {
    const plain: PropValues = {}
    const slots: NodeSlots = {}

    const renderSlot = (prop: string, render: SampleRender) => {
      slots[renderSlotKey(prop, render)] = nodes(render.$render)
    }

    for (const [key, value] of Object.entries(props)) {
      if (isSampleRender(value)) {
        renderSlot(key, value)
      }
      // Elements as a prop's value go in a slot of that name, which the canvas passes as the prop.
      else if (isSampleElement(value)) {
        slots[key] = nodes(value.$element)
      } else {
        plain[key] = value
      }
    }

    const render = children.find(isSampleRender)

    if (render) {
      renderSlot("children", render)
    }

    const rest = nodes(children)

    if (rest.length > 0) {
      slots.children = rest
    }

    return { props: plain, slots }
  }

  const component = (name: string, props?: SampleProps, children?: SampleChild[], defaults = true): ComponentNode => {
    const sampled = defaults ? sources[name]?.sample?.props : undefined
    const { props: merged, slots } = held({ ...sampled, ...props }, children)
    const made: ComponentNode = { type: "component", id: id(), component: name }

    if (Object.keys(merged).length > 0) {
      made.props = merged
    }

    if (Object.keys(slots).length > 0) {
      made.slots = slots
    }

    return made
  }

  let placed: DesignNode = node
  // A part without a sample of its own is labelled as its library's other samples use it, in place of its name.
  const sample = source.sample ?? (named.has(node) ? usedIn(node.component, sources) : undefined)

  if (sample) {
    // A library that shows how a part is used says what it holds: the text or parts its sample gives, as children or a
    // prop (Chakra's `Highlight`), or nothing, as a Separator or an icon's box holds. So the label a new node is named
    // with goes, though not text set on purpose, even text that reads the same.
    const given = { ...node.props }

    if (named.has(node)) {
      delete given.children
    }

    const { props, slots } = held({ ...sample.props, ...given }, sample.children)

    // Children the sample spells out stand in for the text label, and none (`[]`, an input's) leave it out.
    if (sample.children) {
      delete props.children
    }

    const { props: _label, ...rest } = node
    const sampled: ComponentNode = { ...rest }

    if (Object.keys(props).length > 0) {
      sampled.props = props
    }

    if (Object.keys(slots).length > 0) {
      sampled.slots = { ...node.slots, ...slots }
    }

    placed = sampled
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

  if (source.parentParts && added.length > 0 && !calling) {
    return inOuterSample(added, placed)
  }

  for (const parent of added.reverse()) {
    const wrapper = component(parent)
    // A parent that calls its children, or a render prop (`TreeView.Node`'s `render`), gets the part in that render
    // slot, as its sample's own are.
    const calls = renderSlotOf(sources[parent]?.sample)
    const slot = calls ? renderSlotKey(calls.prop, calls.render) : "children"

    // A parent that calls the part keeps its sample's other slots; the one its render function fills is the part's.
    const slots: NodeSlots = calls
      ? Object.fromEntries(
          Object.entries(wrapper.slots ?? {}).filter(([name]) => readRenderSlotKey(name)?.prop !== calls.prop)
        )
      : {}

    slots[slot] = [placed]
    placed = { ...wrapper, slots }
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

      if (level < chain.length) {
        name = chain[level]!
      } else if (part.type === "component") {
        name = part.component
      }

      const items = (given ?? []).filter((item): item is Exclude<SampleChild, SampleRender> => !isSampleRender(item))

      const isLevel = (item: Exclude<SampleChild, SampleRender>): item is SampleComponent =>
        !isSampleText(item) && item.component === name

      const at = items.findIndex(isLevel)
      const found = items.find(isLevel)
      let here = part

      if (level < chain.length) {
        // A bare level takes its own sample, as any bare child does.
        const written = found && (found.props || found.children)
        const wrapper = component(name, found?.props, undefined, !written)
        const children = inside(level + 1, written ? found.children : sources[name]?.sample?.children)
        here = { ...wrapper, slots: { ...wrapper.slots, children } }
      }

      return at === -1 ? [here] : items.map((item, index) => (index === at ? here : build(item)))
    }

    const outer = component(chain[0]!)
    const children = inside(1, sources[chain[0]!]?.sample?.children)

    return { ...outer, slots: { ...outer.slots, children } }
  }
}

/**
 * How a part with no sample of its own is used in its library's other samples: with the children the first use gives it,
 * or none when it's used without any (`<MarkerIcon />`) or with elements the sample can't show (an icon, `[]`).
 * Undefined when no sample uses it.
 */
function usedIn(component: string, sources: Record<string, ComponentSource>): ComponentSample | undefined {
  const find = (children: SampleChild[] | undefined): SampleComponent | undefined => {
    for (const child of children ?? []) {
      if (isSampleText(child)) {
        continue
      }

      if (isSampleRender(child)) {
        const found = find(child.$render)

        if (found) {
          return found
        }

        continue
      }

      if (child.component === component) {
        return child
      }

      const found = find(child.children) ?? find(elementProps(child.props))

      if (found) {
        return found
      }
    }

    return undefined
  }

  const library = sources[component]?.library

  for (const source of Object.values(sources)) {
    if (source.library !== library || !source.sample) {
      continue
    }

    const found = find(source.sample.children) ?? find(elementProps(source.sample.props))

    if (found) {
      return { children: found.children ?? [] }
    }
  }

  return undefined
}

/** The elements and render functions a sample gives as props' values, as children are. */
function elementProps(props: SampleProps | undefined): SampleChild[] {
  return Object.values(props ?? {}).flatMap((value): SampleChild[] => {
    if (isSampleRender(value)) {
      return [value]
    }

    return isSampleElement(value) ? value.$element : []
  })
}

/**
 * A library file's component as the canvas inserts it, with its parents and sample named by component id.
 * Discovery has already rewritten module imports for the name the project installed the package under.
 */
export function librarySource(
  library: string,
  name: string,
  component: LibraryComponent,
  path: string
): Omit<ComponentSource, "declaration"> {
  // The library file marks an optional prop with `?`.
  const declared = new Set(Object.keys(component.props ?? {}).map((prop) => prop.replace(/\?$/, "")))
  const open = openProps.filter((prop) => declared.has(prop))
  const source: Omit<ComponentSource, "declaration"> = { path, export: name, library }

  if (component.group) {
    source.group = component.group
  }

  if (component.parents) {
    source.parents = component.parents.map((parent) => `${library}/${parent}`)

    if (component.parentsFrom) {
      source.parentsFrom = component.parentsFrom
    }
  }

  if (component.internal) {
    source.internal = true
  }

  if (component.visual === false) {
    source.visual = false
  }

  if (component.optionalParents) {
    source.optionalParents = component.optionalParents.map((parent) => `${library}/${parent}`)
  }

  if (component.parentParts) {
    source.parentParts = true
  }

  if (component.sample) {
    source.sample = sampleIds(component.sample, library)
  }

  if (open.length > 0) {
    source.openProps = open
  }

  return source
}

/**
 * A sample with its children's components named by id, as `nova/AccordionItem`; HTML elements keep their tag.
 */
export function sampleIds(sample: ComponentSample, library: string): ComponentSample {
  const child = (node: SampleChild): SampleChild => {
    if (isSampleText(node)) {
      return node
    }

    if (isSampleRender(node)) {
      return { ...node, $render: node.$render.map(child) }
    }

    const renamed: SampleComponent = {
      ...node,
      component: /^[a-z]/.test(node.component) ? node.component : `${library}/${node.component}`
    }

    if (node.props) {
      renamed.props = propIds(node.props)
    }

    if (node.children) {
      renamed.children = node.children.map(child)
    }

    return renamed
  }

  // A render function in a prop (`renderInput`) names components too.
  const propId = (item: SampleValue): SampleValue => {
    if (isSampleRender(item)) {
      return { ...item, $render: item.$render.map(child) }
    }

    if (isSampleElement(item)) {
      return { $element: item.$element.map(child) }
    }

    return item
  }

  const propIds = (props: SampleProps): SampleProps =>
    Object.fromEntries(Object.entries(props).map(([key, item]) => [key, propId(item)]))

  const renamed: ComponentSample = { ...sample }

  if (sample.props) {
    renamed.props = propIds(sample.props)
  }

  if (sample.children) {
    renamed.children = sample.children.map(child)
  }

  return renamed
}
