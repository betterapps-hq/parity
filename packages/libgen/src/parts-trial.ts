import type { FoundComponent } from "@parity-app/code"
import {
  type ComponentSample,
  type DecoratorElement,
  evaluateValue,
  exportOf,
  isMadeValue,
  isSampleElement,
  isSampleRender,
  type LibraryEdits,
  renderSlotOf,
  type SampleChild,
  type SampleElement,
  type SampleRender,
  type ValueHost,
  valueImports
} from "@parity-app/core"
import type { ExampleUse } from "./examples.ts"
import {
  exported,
  isFunction,
  isObject,
  isRecord,
  isText,
  type Live,
  live,
  type LiveObject,
  type Load
} from "./live.ts"

/** A sample's props, as core reads them. */
export type SampleProps = NonNullable<ComponentSample["props"]>

/** A sample prop's value, as core reads it. */
export type SampleValue = SampleProps[string]

/** A part placed inside a sample, with its own props and children. */
export type SampleElementChild = Exclude<SampleChild, string | SampleRender>

/** Whether a sample's child is a part placed inside it, rather than text or a render function. */
export function isElementChild(child: SampleChild): child is SampleElementChild {
  return !isText(child) && "component" in child
}

/**
 * Where a library's parts are tried: React's server renderer from the project, the library's module, and each part's
 * props as they're tried now. It renders a part inside a chain of parents and says what went wrong, so working out
 * where parts go needs no browser.
 */
export interface PartTrial {
  /** The library's components, less the providers its decorators wrap every frame in, which are never parents. */
  readonly names: string[]
  /** How the library's own examples use each component. */
  readonly examples: Map<string, ExampleUse>
  /** Each part's props as it's tried now. The passes change them as they learn what a part needs. */
  readonly samples: Map<string, SampleProps>
  /** The values the package makes in its examples (`collection={createTreeCollection(...)}`), by the part they're for. */
  readonly madeProps: Map<string, SampleProps>
  /** Each distinct call the examples make, to try as a value an owner works out. */
  readonly madeCalls: SampleValue[]
  /** Parts whose parents need the other parts their examples hold around them. */
  readonly withParts: Set<string>
  /** A component as the module exports it. */
  readonly value: (name: string) => Live
  /** Renders a part inside a chain of parents; the error it throws, or undefined when it draws. */
  readonly attempt: (chain: string[], name: string, children?: SampleChild[], parts?: boolean) => string | undefined
  /** Whether the part adds anything to what its parents draw with the other parts their examples hold around it. */
  readonly adds: (chain: string[], name: string) => boolean
  /** The parent an error names for a part, as one of the library's components, that isn't in its chain yet. */
  readonly named: (error: string, self: string, chain: string[], guess?: boolean) => string | undefined
}

export interface TrialInputs {
  load: Load
  /** What the library's components are imported from. */
  specifier: string
  components: FoundComponent[]
  /** The providers the library's decorators wrap every frame in, outermost first, so parts are tried inside them. */
  providers: DecoratorElement[]
  /** Hand edits, whose samples replace what would be inferred. */
  edits: LibraryEdits["components"]
  examples: Map<string, ExampleUse>
}

/** Loads React, its server renderer and the library, ready to try parts; or why they couldn't be. */
export async function openTrial({
  load,
  specifier,
  components,
  providers,
  edits,
  examples
}: TrialInputs): Promise<PartTrial | { note: string }> {
  let React: LiveObject
  let server: LiveObject
  let module: LiveObject

  try {
    React = await load("react")
    server = await load("react-dom/server")
    module = await load(specifier)
  } catch (error) {
    return { note: `Parts weren't tried: ${message(error)}` }
  }

  const createElement = exported(React, "createElement")
  const cloneElement = exported(React, "cloneElement")
  const renderToStaticMarkup = exported(server, "renderToStaticMarkup")

  if (!isFunction(createElement) || !isFunction(cloneElement) || !isFunction(renderToStaticMarkup)) {
    return { note: "Parts weren't tried: React's server renderer wasn't found." }
  }

  const byName = new Map(components.map((component) => [component.name, component]))

  const host = await trialHost(load, [
    ...valueImports(providers.map((provider) => provider.props)),
    ...valueImports(
      [...examples.values()].map((use) => use.sample),
      "sample"
    )
  ])

  // Providers a frame gets from the decorators are never a part's parents. Each is used if it renders with no props;
  // one that needs a frame (an Emotion cache, a theme object) is left to the frame.
  const wrappers: { type: Live; props: Live }[] = []

  for (const provider of providers) {
    byName.delete(provider.component)

    try {
      const found = live.parse(exportOf(await load(provider.import), provider.component))

      if (found) {
        wrappers.push({ type: found, props: live.parse(evaluateValue(provider.props ?? {}, host)) })
      }
    } catch {
      // Not loadable outside a frame.
    }
  }

  const value = (name: string): Live => live.parse(exportOf(module, byName.get(name)?.export ?? name))
  const samples = new Map<string, SampleProps>()

  for (const component of components) {
    const edit = edits?.[component.name]
    samples.set(component.name, edit ? { ...component.samples, ...edit.sample?.props } : { ...component.samples })
  }

  // Values the package makes in its examples (`collection={createTreeCollection(...)}`) are a part's from the start, as
  // the parts inside it, tried first in name order, can't draw without them.
  const madeProps = new Map<string, SampleProps>()

  for (const [name, use] of examples) {
    const props = Object.fromEntries(Object.entries(use.sample?.props ?? {}).filter(([, value]) => isMadeValue(value)))

    if (Object.keys(props).length === 0 || !samples.has(name)) {
      continue
    }

    madeProps.set(name, props)
    samples.set(name, { ...samples.get(name), ...props })
  }

  // Values the package makes (`createTreeCollection(...)`), called once each before parts are tried, as the canvas does.
  const made = new Map<SampleValue, Live>()
  const byCall = new Map<string, Live>()

  const callsIn = (value: SampleValue): SampleValue[] => {
    if (isMadeValue(value)) {
      return [value]
    }

    if (Array.isArray(value)) {
      return value.flatMap(callsIn)
    }

    return isObject(value) ? Object.values(value).flatMap(callsIn) : []
  }

  for (const use of examples.values()) {
    for (const call of callsIn(use.sample)) {
      const key = JSON.stringify(call)

      if (!byCall.has(key)) {
        try {
          byCall.set(key, live.parse(evaluateValue(call, host, "sample")))
        } catch {
          byCall.set(key, undefined)
        }
      }

      made.set(call, byCall.get(key))
    }
  }

  const madeCalls = [...new Map([...made.keys()].map((call) => [JSON.stringify(call), call])).values()]

  /** A render function as the part calls it: its children, with what it's called with spread on when asked. */
  const called = (render: SampleRender) => (argument: Live) => {
    const elements = render.$render.map((item) => build(item))

    if (elements.length === 1 && render.pass) {
      return cloneElement(elements[0], Object.fromEntries(render.pass.map((prop) => [prop, argument])))
    }

    if (render.spread && elements.length === 1 && isObject(argument)) {
      return cloneElement(elements[0], argument)
    }

    return elements.length === 1 ? elements[0] : elements
  }

  const element = (value: SampleElement) => {
    const elements = value.$element.map((item) => build(item))

    return elements.length === 1 ? elements[0] : elements
  }

  const liveValue = (item: SampleValue): Live => {
    if (isSampleRender(item)) {
      return called(item)
    }

    if (isSampleElement(item)) {
      return element(item)
    }

    if (isMadeValue(item)) {
      return made.get(item)
    }

    // In a list too (Fluent's `columns={[createTableColumn(...)]}`).
    return live.parse(
      Array.isArray(item) && item.some(isMadeValue)
        ? item.map((each) => (isMadeValue(each) ? made.get(each) : each))
        : item
    )
  }

  const liveProps = (props: SampleProps | undefined): LiveObject =>
    Object.fromEntries(Object.entries(props ?? {}).map(([key, item]) => [key, liveValue(item)]))

  /**
   * A sample child's element. The part being tried takes its sample's props; a child a sample spells out (with props or
   * children) is as written, as the app inserts it, and only a bare one takes its own sample's.
   */
  const build = (child: SampleChild, own = false): Live => {
    if (isText(child)) {
      return child
    }

    if (isSampleRender(child)) {
      return called(child)
    }

    const type = /^[a-z]/.test(child.component) ? child.component : value(child.component)
    const bare = !child.props && !child.children

    return createElement(
      type,
      liveProps(own || bare ? { ...samples.get(child.component), ...child.props } : { ...child.props }),
      ...(child.children ?? []).map((inner) => build(inner))
    )
  }

  const withParts = new Set<string>()

  /**
   * The part inside the first parent's whole example, each level in place of the first like it there and the part in
   * place of the first like it at the bottom (a cell in a table's first row, beside that row's other cells and the
   * table's header), as the app inserts a part marked `parentParts`. A level the example doesn't hold comes alone.
   */
  const inExample = (chain: string[], name: string, part: Live): Live => {
    const inside = (level: number, given: SampleChild[] | undefined): Live[] => {
      const target = level < chain.length ? chain[level]! : name
      const items = given ?? []
      const at = items.findIndex((item) => isElementChild(item) && item.component === target)
      const item = items[at]
      const found = item && isElementChild(item) ? item : undefined
      let here = part

      if (level < chain.length) {
        const written = found && (found.props || found.children)
        here = createElement(
          value(target),
          liveProps(written ? found.props : samples.get(target)),
          ...inside(level + 1, written ? found.children : examples.get(target)?.sample?.children)
        )
      }

      return at === -1 ? [here] : items.map((item, index) => (index === at ? here : build(item)))
    }

    return createElement(
      value(chain[0]!),
      liveProps(samples.get(chain[0]!)),
      ...inside(1, examples.get(chain[0]!)?.sample?.children)
    )
  }

  const attempt = (chain: string[], name: string, children?: SampleChild[], parts = withParts.has(name)) =>
    render(placed(chain, name, build(children ? { component: name, children } : { component: name }, true), parts))

  /** A part's element inside a chain of parents. */
  const placed = (chain: string[], name: string, part: Live, parts: boolean) => {
    const calling = chain.some((parent) => renderSlotOf(examples.get(parent)?.sample))

    if (parts && chain.length > 0 && !calling) {
      return inExample(chain, name, part)
    }

    let element = part

    for (const parent of [...chain].reverse()) {
      // A parent whose examples call their children (`{(date) => <CalendarCell date={date} />}`), or a render prop
      // (`render={({ node }) => ...}`), is given the part that way, with what it's called with going where the
      // example's did.
      const slot = renderSlotOf(examples.get(parent)?.sample)
      const inner = element

      // What it's called with is spread onto the element, and given to the props it names over that, as in the app.
      const render = slot
        ? (argument: Live) => {
            const spread = slot.render.spread && isRecord(argument) ? argument : {}
            const named = Object.fromEntries((slot.render.pass ?? []).map((prop) => [prop, argument]))

            return slot.render.pass || slot.render.spread ? cloneElement(inner, { ...spread, ...named }) : inner
          }
        : undefined

      const props = liveProps(samples.get(parent))
      element =
        slot && slot.prop !== "children"
          ? createElement(value(parent), { ...props, [slot.prop]: render })
          : createElement(value(parent), props, render ?? element)
    }

    return element
  }

  /** What an element renders on the server, or undefined when it throws. */
  const markup = (element: Live): string | undefined => {
    const quiet = [console.error, console.warn]
    console.error = () => undefined
    console.warn = () => undefined

    try {
      const html = renderToStaticMarkup(element)

      return isText(html) ? html.replace(/_R_\w+_/g, "") : undefined
    } catch {
      return undefined
    } finally {
      ;[console.error, console.warn] = quiet
    }
  }

  const render = (element: Live, wrapped = true): string | undefined => {
    if (wrapped) {
      for (const provider of [...usable].reverse()) {
        element = createElement(provider.type, provider.props, element)
      }
    }

    const quiet = [console.error, console.warn]
    console.error = () => undefined
    console.warn = () => undefined

    try {
      // React Aria draws a collection's parts outside one as placeholders for its collection to read (`<item>`,
      // `<tablebody>`), not the parts.
      const html = renderToStaticMarkup(element)

      if (
        isText(html) &&
        /^<(?:item|submenutrigger|tablebody|tableheader|column|cell|loader|separator)[\s>]/.test(html)
      ) {
        return "Renders only as a placeholder outside a collection."
      }

      return undefined
    } catch (error) {
      return message(error)
    } finally {
      ;[console.error, console.warn] = quiet
    }
  }

  const usable = wrappers.filter(
    (provider) => render(createElement(provider.type, provider.props, "x"), false) === undefined
  )

  const names = [...byName.keys()]

  // Only where the part adds something: parents that render nothing on the server (a closed menu) hold anything.
  const adds = (chain: string[], name: string) =>
    markup(placed(chain, name, build({ component: name }, true), true)) !== markup(placed(chain, name, null, true))

  const named = (error: string, self: string, chain: string[], guess = true): string | undefined => {
    // Names the error mentions, quoted ones first: `Accordion`, <Menu.SubmenuRoot>, "Combobox component". What comes
    // after "within" or "wrap" is what's needed; a name before it is usually the part's own internal name.
    const mentions = (text: string) => [
      ...[...text.matchAll(/[`<"']([A-Z][\w.]*)/g)].map((match) => match[1]!),
      ...[...text.matchAll(/\b([A-Z][\w.]*)/g)].map((match) => match[1]!)
    ]

    const needed = error
      .split(/\b(?:within|inside|outside|wrap|wrapped|placed in|used in)\b/i)
      .slice(1)
      .join(" ")

    const all = [...mentions(needed), ...mentions(error)]

    // Chakra names the provider a part's Root or Item renders (`AccordionItemProvider`), not the part itself.
    for (const mention of all.flatMap((name) => [name.replace(/(?:Props)?(?:Provider|Context)$/, ""), name])) {
      const target = resolveName(mention.replace(/\.$/, ""), self, names)

      if (target && target !== self && !chain.includes(target)) {
        return target
      }

      // A part that must be used within itself needs the provider it exports beside it (`MessageScrollerProvider`).
      const provider = `${self}Provider`

      if (target === self && !chain.includes(provider) && value(provider)) {
        return provider
      }
    }

    // Radix names its internal parts (`DialogTitle` must be used within `Dialog`): the namespace's Content is the
    // usual answer, and the render after it says whether it was right.
    // A Root is what the others go in, so it never goes in its own Content.
    if (!guess) {
      return undefined
    }

    const content = namespaceOf(self) && !self.endsWith(".Root") && `${namespaceOf(self)}.Content`

    return content && names.includes(content) && content !== self && !chain.includes(content) ? content : undefined
  }

  return { names, examples, samples, madeProps, madeCalls, withParts, value, attempt, adds, named }
}

/**
 * A name an error mentions, as one of the library's components. A namespaced part only goes inside its own namespace,
 * where an internal name maps by its last words (`MenuContent` and `PopperContent` to `ContextMenu.Content`,
 * `MenuSub` to `ContextMenu.Sub`). Other parts match exactly, or with the dots left out (`Menu.SubmenuRoot`).
 */
function resolveName(mention: string, self: string, names: string[]): string | undefined {
  const namespace = namespaceOf(self)

  if (namespace) {
    if (mention.startsWith(`${namespace}.`)) {
      return names.includes(mention) ? mention : undefined
    }

    // The namespace's own name, or the end of it (`Dialog` inside `AlertDialog`), is its Root.
    const short = namespace.slice(namespace.lastIndexOf(".") + 1)

    if (short.endsWith(mention) && names.includes(`${namespace}.Root`)) {
      return `${namespace}.Root`
    }

    const words = mention.replaceAll(".", "").split(/(?=[A-Z])/)

    for (let start = 0; start < words.length; start++) {
      const candidate = `${namespace}.${words.slice(start).join("")}`

      if (names.includes(candidate)) {
        return candidate
      }
    }

    // Or another family's, by its full name (Base UI's `<Menu.Portal>`, which a `ContextMenu` uses).
    return mention.includes(".") && names.includes(mention) ? mention : undefined
  }

  if (names.includes(mention)) {
    return mention
  }

  const flat = mention.replaceAll(".", "")
  const exact = names.find((name) => name.replaceAll(".", "") === flat)

  if (exact) {
    return exact
  }

  // A styled kit names its parts after the primitive's (`Menu.Group` for shadcn's `ContextMenuGroup`): map it into the
  // part's own family, the longest component its name starts with. `Root` is the family itself.
  const family = names
    .filter((name) => name !== self && self.startsWith(name) && /^[A-Z]/.test(self.slice(name.length)))
    .sort((a, b) => b.length - a.length)[0]

  if (!family) {
    return undefined
  }

  const words = mention
    .split(".")
    .at(-1)!
    .split(/(?=[A-Z])/)

  if (words.join("") === "Root") {
    return family
  }

  for (let start = 0; start < words.length; start++) {
    const candidate = `${family}${words.slice(start).join("")}`

    if (candidate !== self && names.includes(candidate)) {
      return candidate
    }
  }

  return undefined
}

/** The namespace a part is a member of (`Dialog` for `Dialog.Title`), if it's one. */
export function namespaceOf(name: string): string | undefined {
  const dot = name.lastIndexOf(".")

  return dot === -1 ? undefined : name.slice(0, dot)
}

function message(cause: unknown): string {
  return (cause instanceof Error ? cause.message : String(cause)).split("\n")[0]!.slice(0, 300)
}

/**
 * What values are worked out against outside a frame, for trying parts on the server: the modules they import, loaded
 * first, since evaluating is synchronous, a mode's value is its default, and the frame's own nodes are undefined, as
 * there's no frame. Direction and language take the frame's defaults. A module Node loads as CommonJS without a
 * `default` is its own default export.
 */
async function trialHost(load: Load, imports: string[]): Promise<ValueHost> {
  const modules = new Map<string, LiveObject>()

  for (const specifier of new Set(imports)) {
    try {
      modules.set(specifier, await load(specifier))
    } catch {
      // Not loadable outside a frame; a value that needs it isn't made.
    }
  }

  return {
    exported(specifier, path) {
      const module = modules.get(specifier)

      if (!module) {
        throw new Error(`${specifier} isn't loaded`)
      }

      return exportOf(module, path) ?? (path === "default" ? module : undefined)
    },
    global: () => undefined,
    frame: (part) => {
      if (part === "dir") {
        return "ltr"
      }

      return part === "lang" ? "en-US" : undefined
    },
    made: new Map()
  }
}
