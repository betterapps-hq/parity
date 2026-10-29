import type { FoundComponent } from "@parity/code"
import {
  type ComponentSample,
  type DecoratorElement,
  isSampleElement,
  isSampleRender,
  type LibraryEdits,
  type ParentSignal,
  type SampleChild,
  type SampleElement,
  type SampleRender
} from "@parity/core"
import { type ExampleUse, exampleLevels, familyOf } from "./examples.ts"
import type { RenderCall, RenderedChild } from "./hosts.ts"

export type Load = (specifier: string) => Promise<Record<string, unknown>>

/** What trying a component taught: where it goes, what it needs, and whether it then draws. */
export interface PartRelation {
  /** The components it goes inside, outermost first. */
  parents?: string[]
  parentsFrom?: ParentSignal
  /** Parents the examples usually show but it renders without (`DropdownMenuGroup`), left out when the rest are there. */
  optionalParents?: string[]
  /** Props and children it needs to draw, kept only when they made it render. */
  sample?: ComponentSample
  visual?: false
  /** Why it failed alone, when it did. */
  alone?: string
  /** Why it still fails inside its parents with its sample, when it does. */
  inside?: string
  /** Set when its sample is the library's own example. */
  sampleFrom?: "example"
  /** Its parents need the other parts their samples hold around it (a table's header beside the body a row is in). */
  parentParts?: true
}

export interface PartsReport {
  relations: Map<string, PartRelation>
  /** Whether rendering could be tried at all: it needs React and react-dom from the project. */
  tried: boolean
  note?: string
  /** Parts drawn from a list the library keeps that render with an item of it, and the parts placed inside them. */
  drawn?: string[]
}

const notVisual = /(?:Context|Consumer|Provider)$/
const maxDepth = 5

/**
 * Works out how a library's parts fit together, by rendering each with React's server renderer from the project, so
 * nothing needs a browser. A part that throws alone usually names what it needs ("`AccordionItem` must be used within
 * `Accordion`"), which is the strongest signal after a namespace export (`Accordion.Item` belongs in `Accordion.Root`).
 * Otherwise a shared name prefix (`AccordionItem` under `Accordion`) or a plural (`Tab` under `Tabs`) is tried. Each
 * chain is rendered again, so a suggestion that doesn't render is reported as such rather than trusted.
 */
export async function relateParts(
  load: Load,
  specifier: string,
  components: FoundComponent[],
  /** The providers the library's decorators wrap every frame in, outermost first, so parts are tried inside them. */
  providers: DecoratorElement[] = [],
  /** Hand edits, tried as they're written: their parents and samples replace what would be inferred. */
  edits: LibraryEdits["components"] = {},
  /** How the library's own examples use each component, the strongest signal after a hand edit. */
  examples: Map<string, ExampleUse> = new Map(),
  /** The package's components that render each one in its own code (`SelectContent` for `SelectScrollUpButton`). */
  renderedBy: Map<string, string[]> = new Map(),
  /** The props those components pass when they render each one, for a part that needs what its owner gives it. */
  calls: Map<string, RenderCall[]> = new Map(),
  /** An item of the lists the library keeps, from its examples, for parts their owner draws from such a list. */
  listItem?: Record<string, unknown>
): Promise<PartsReport> {
  let React: Record<string, unknown>
  let server: Record<string, unknown>
  let module: Record<string, unknown>
  try {
    React = await load("react")
    server = await load("react-dom/server")
    module = await load(specifier)
  } catch (error) {
    return { relations: new Map(), tried: false, note: `Parts weren't tried: ${message(error)}` }
  }
  const createElement = (React.createElement ?? (React.default as Record<string, unknown>)?.createElement) as (
    type: unknown,
    props?: Record<string, unknown> | null,
    ...children: unknown[]
  ) => unknown
  const renderToStaticMarkup = (server.renderToStaticMarkup ??
    (server.default as Record<string, unknown>)?.renderToStaticMarkup) as (element: unknown) => string
  if (typeof createElement !== "function" || typeof renderToStaticMarkup !== "function") {
    return { relations: new Map(), tried: false, note: "Parts weren't tried: React's server renderer wasn't found." }
  }

  const byName = new Map(components.map((component) => [component.name, component]))
  // Providers a frame gets from the decorators are never a part's parents. Each is used if it renders with no props;
  // one that needs a frame (an Emotion cache, a theme object) is left to the frame.
  const wrappers: { type: unknown; props: unknown }[] = []
  for (const provider of providers) {
    byName.delete(provider.component)
    try {
      let found: unknown = await load(provider.import)
      for (const part of provider.component.split(".")) found = (found as Record<string, unknown>)?.[part]
      if (found) wrappers.push({ type: found, props: await trialValue(load, provider.props ?? {}) })
    } catch {
      // Not loadable outside a frame.
    }
  }
  const value = (name: string): unknown => {
    const component = byName.get(name)
    let found: unknown = module
    for (const part of (component?.export ?? name).split(".")) found = (found as Record<string, unknown>)?.[part]
    return found
  }
  const samples = new Map<string, Record<string, unknown>>()
  for (const component of components) {
    const edit = edits?.[component.name]
    samples.set(component.name, { ...component.samples, ...(edit ? edit.sample?.props : {}) })
  }

  const cloneElement = (React.cloneElement ?? (React.default as Record<string, unknown>)?.cloneElement) as (
    element: unknown,
    props: Record<string, unknown>
  ) => unknown
  /** A render function as the part calls it: its children, with what it's called with spread on when asked. */
  const live = (render: SampleRender) => (argument: unknown) => {
    const elements = render.$render.map((item) => build(item))
    if (elements.length === 1 && render.pass) {
      return cloneElement(elements[0], Object.fromEntries(render.pass.map((prop) => [prop, argument])))
    }
    if (render.spread && elements.length === 1 && typeof argument === "object" && argument !== null) {
      return cloneElement(elements[0], argument as Record<string, unknown>)
    }
    return elements.length === 1 ? elements[0] : elements
  }
  const element = (value: SampleElement) => {
    const elements = value.$element.map((item) => build(item))
    return elements.length === 1 ? elements[0] : elements
  }
  const liveProps = (props: Record<string, unknown> | undefined) =>
    Object.fromEntries(
      Object.entries(props ?? {}).map(([key, item]) => [
        key,
        isSampleRender(item) ? live(item) : isSampleElement(item) ? element(item) : item
      ])
    )
  /**
   * A sample child's element. The part being tried takes its sample's props; a child a sample spells out (with props or
   * children) is as written, as the app inserts it, and only a bare one takes its own sample's.
   */
  const build = (child: SampleChild, own = false): unknown => {
    if (typeof child === "string") return child
    if (isSampleRender(child)) return live(child)
    const type = /^[a-z]/.test(child.component) ? child.component : value(child.component)
    const bare = !child.props && !child.children
    return createElement(
      type,
      liveProps({ ...(own || bare ? samples.get(child.component) : {}), ...child.props }),
      ...(child.children ?? []).map((inner) => build(inner))
    )
  }
  /** Parts whose parents need the other parts their examples hold around them. */
  const withParts = new Set<string>()
  /**
   * The part inside the first parent's whole example, each level in place of the first like it there and the part in
   * place of the first like it at the bottom (a cell in a table's first row, beside that row's other cells and the
   * table's header), as the app inserts a part marked `parentParts`. A level the example doesn't hold comes alone.
   */
  const inExample = (chain: string[], name: string, part: unknown): unknown => {
    const inside = (level: number, given: SampleChild[] | undefined): unknown[] => {
      const target = level < chain.length ? chain[level]! : name
      const items = given ?? []
      const at = items.findIndex((item) => typeof item === "object" && "component" in item && item.component === target)
      const found = at === -1 ? undefined : (items[at] as Exclude<SampleChild, string | SampleRender>)
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
  /** Renders a part inside a chain of parents; the error it throws, or undefined when it draws. */
  const attempt = (chain: string[], name: string, children?: SampleChild[], parts = withParts.has(name)) =>
    render(placed(chain, name, build({ component: name, ...(children ? { children } : {}) }, true), parts))
  /** A part's element inside a chain of parents. */
  const placed = (chain: string[], name: string, part: unknown, parts: boolean) => {
    const calling = chain.some((parent) => examples.get(parent)?.sample?.children?.some(isSampleRender))
    if (parts && chain.length > 0 && !calling) return inExample(chain, name, part)
    let element = part
    for (const parent of [...chain].reverse()) {
      // A parent whose examples call their children (`{(date) => <CalendarCell date={date} />}`) is given the part
      // that way, with what it's called with going where the example's did.
      const calls = examples.get(parent)?.sample?.children?.find(isSampleRender)
      const inner = element
      const child = calls
        ? (argument: unknown) =>
            calls.pass ? cloneElement(inner, Object.fromEntries(calls.pass.map((prop) => [prop, argument]))) : inner
        : element
      element = createElement(value(parent), liveProps(samples.get(parent)), child)
    }
    return element
  }
  /** What an element renders on the server, or undefined when it throws. */
  const markup = (element: unknown): string | undefined => {
    const quiet = [console.error, console.warn]
    console.error = () => {}
    console.warn = () => {}
    try {
      return renderToStaticMarkup(element).replace(/_R_\w+_/g, "")
    } catch {
      return undefined
    } finally {
      ;[console.error, console.warn] = quiet
    }
  }
  const render = (element: unknown, wrapped = true): string | undefined => {
    if (wrapped) {
      for (const provider of [...usable].reverse()) {
        element = createElement(provider.type, provider.props as Record<string, unknown>, element)
      }
    }
    const quiet = [console.error, console.warn]
    console.error = () => {}
    console.warn = () => {}
    try {
      // React Aria draws a collection's parts outside one as placeholders for its collection to read (`<item>`,
      // `<tablebody>`), not the parts.
      if (/^<(?:item|tablebody|tableheader|column|cell|loader|separator)[\s>]/.test(renderToStaticMarkup(element)))
        return "Renders only as a placeholder outside a collection."
      return undefined
    } catch (error) {
      return message(error)
    } finally {
      ;[console.error, console.warn] = quiet
    }
  }
  const usable = wrappers.filter(
    (provider) =>
      render(createElement(provider.type, provider.props as Record<string, unknown>, "x"), false) === undefined
  )

  const names = [...byName.keys()]
  const named = (error: string, self: string, chain: string[]): string | undefined => {
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
      if (target && target !== self && !chain.includes(target)) return target
      // A part that must be used within itself needs the provider it exports beside it (`MessageScrollerProvider`).
      const provider = `${self}Provider`
      if (target === self && !chain.includes(provider) && value(provider)) return provider
    }
    // Radix names its internal parts (`DialogTitle` must be used within `Dialog`): the namespace's Content is the
    // usual answer, and the render after it says whether it was right.
    // A Root is what the others go in, so it never goes in its own Content.
    const content = namespaceOf(self) && !self.endsWith(".Root") && `${namespaceOf(self)}.Content`
    return content && names.includes(content) && content !== self && !chain.includes(content) ? content : undefined
  }

  const relations = new Map<string, PartRelation>()
  /** Parts whose sample has example props they render without, with the props they had before. */
  const loose = new Map<string, Record<string, unknown>>()
  const aloneErrors = new Map<string, string | undefined>()
  const failsAlone = (name: string) => {
    if (!aloneErrors.has(name)) aloneErrors.set(name, attempt([], name))
    return aloneErrors.get(name) !== undefined
  }
  /** How many of each part's placed example uses have each parent, for marking the levels some leave out. */
  const shares = new Map<string, Map<string, number>>()
  const levelsOf = (name: string, sameFamily: boolean, taken: string[], share?: number) =>
    (exampleLevels(examples, name, sameFamily, share) ?? []).filter(
      (level) => names.includes(level.parent) && level.parent !== name && !taken.includes(level.parent)
    )
  /**
   * The chain the examples show: every parent most of its uses are inside, at any depth, in their usual order. One
   * that draws alone takes only its own family's, since examples put everything in forms. Examples split across a
   * demo's own components show only the inner levels, so while the part still fails, the top one's own are added.
   */
  const exampleChain = (name: string): string[] | undefined => {
    const levels = levelsOf(name, !failsAlone(name), [])
    if (levels.length === 0) return undefined
    shares.set(name, new Map(levels.map((level) => [level.parent, level.share])))
    const chain = levels.map((level) => level.parent)
    // Not grown when it renders with the other parts the examples hold around it, which `chainOf` tries next: what's
    // above can render nothing on the server (a closed `Popover`), so anything would seem to draw inside it.
    if (heldChain(name, chain)) return chain
    while (chain.length < maxDepth * 2 && attempt(chain, name)) {
      const up = levelsOf(chain[0]!, false, chain)
      if (up.length === 0) break
      chain.unshift(...up.map((level) => level.parent))
    }
    return chain
  }
  /**
   * The chain, or the chain without the levels some examples leave out, that a part renders in with the other parts
   * the examples hold around it (a table's header beside the body a row is in).
   */
  const heldChain = (name: string, chain: string[]): string[] | undefined => {
    const usual = chain.filter((parent) => (shares.get(name)?.get(parent) ?? 1) >= 0.9)
    // Only where the part adds something: parents that render nothing on the server (a closed menu) hold anything.
    const adds = (each: string[]) =>
      markup(placed(each, name, build({ component: name }, true), true)) !== markup(placed(each, name, null, true))
    return [chain, usual].find((each) => each.length > 0 && !attempt(each, name, undefined, true) && adds(each))
  }
  /**
   * The levels some examples leave out (fewer than nine in ten have them) that the part still renders without, taken
   * away one at a time so each is tried without the others too.
   */
  const optionalOf = (name: string, chain: string[]): string[] => {
    const shown = shares.get(name)
    const optional: string[] = []
    for (const parent of [...chain].reverse()) {
      const share = shown?.get(parent)
      if (share === undefined || share >= 0.9) continue
      const without = chain.filter((other) => other !== parent && !optional.includes(other))
      if (!attempt(without, name)) optional.push(parent)
    }
    return optional
  }
  /** A part's family, as the examples place it (`Table` for React Aria's `Row`). */
  const familyIn = (name: string) => examples.get(name)?.family ?? familyOf(name)
  /** Drops parents from other families that a part renders without: where an example put it, not what it needs. */
  const prune = (chain: string[], name: string): string[] => {
    // Again until nothing more goes, as one can need another of its family to go first (a Dialog's Root its Portal).
    for (let dropped = true; dropped;) {
      dropped = false
      for (const parent of chain) {
        // A portal goes too when the part renders without it: it only moves content out of the frame, and throws
        // there for some libraries though it passes on the server, where portals don't run.
        if (familyIn(parent) === familyIn(name) && !parent.endsWith("Portal")) continue
        const without = chain.filter((other) => other !== parent)
        if (without.length > 0 && !attempt(without, name)) {
          chain = without
          dropped = true
        }
      }
    }
    return chain
  }
  const chains = new Map<string, { chain: string[]; from?: ParentSignal } | null>()
  const chainOf = (name: string, depth: number): { chain: string[]; from?: ParentSignal } | null => {
    if (chains.has(name)) return chains.get(name)!
    const edit = edits?.[name]
    if (edit && edit.parents) return save(name, { chain: edit.parents, from: "edit" })
    chains.set(name, null) // a cycle ends here
    const shown = exampleChain(name)
    if (shown && !attempt(shown, name)) return save(name, { chain: prune(shown, name), from: "example" })
    // Or with the other parts the examples hold around it.
    const held = shown && attempt(shown, name) ? heldChain(name, shown) : undefined
    if (held) {
      withParts.add(name)
      return save(name, { chain: held, from: "example" })
    }
    // Or without another family's level it can't render in on the server (Chakra's generic `Portal`).
    const pruned = shown && prune(shown, name)
    if (pruned && pruned.length > 0 && !attempt(pruned, name)) return save(name, { chain: pruned, from: "example" })
    // Or with the levels fewer than half its examples show, which it may need all the same.
    if (shown) {
      for (const share of [1 / 3, 1 / 5]) {
        const wider = levelsOf(name, !failsAlone(name), [], share).map((level) => level.parent)
        if (wider.length > shown.length && !attempt(wider, name)) {
          return save(name, { chain: prune(wider, name), from: "example" })
        }
      }
    }
    // An example chain that still fails is grown from the errors; when that fails too, the errors alone are tried, so
    // the examples never leave a part worse off than without them.
    const grown = shown ? grow(name, depth, shown, "example") : undefined
    if (grown && !grown.error) return save(name, { chain: prune(grown.chain, name), from: grown.from ?? "example" })
    const fromErrors = grow(name, depth, [], undefined)
    // A part drawn from a list (a toast) renders with its sample item, so errors can put anything in it; only what the
    // package puts inside it goes there.
    const stray = fromErrors.chain.some((parent) => drawnParts.has(parent) && !drawnInside.get(parent)?.has(name))
    if (!fromErrors.error && fromErrors.chain.length > 0 && !stray) {
      return save(name, { chain: fromErrors.chain, from: fromErrors.from ?? "prefix" })
    }
    // Last, a part no example places renders where the package's own code renders it (`SelectScrollUpButton` in
    // `SelectContent`). It comes after the errors, as a kit's Content often renders its own Portal and Overlay.
    if (!shown && failsAlone(name)) {
      for (const owner of renderedBy.get(name) ?? []) {
        if (!names.includes(owner) || owner === name) continue
        const chain = [...(chainOf(owner, depth + 1)?.chain ?? []).filter((parent) => parent !== name), owner]
        if (!attempt(chain, name)) return save(name, { chain, from: "source" })
      }
    }
    // When both fail, the errors' chain is kept, as without examples: a sample tried later may still make it render.
    const result = !grown || fromErrors.chain.length > 0 ? fromErrors : grown
    // One that still fails keeps only its own family's parents: another family's is where an example put it, not
    // what it needs, and a hand edit starts from less.
    const chain = result.error ? result.chain.filter((parent) => familyIn(parent) === familyIn(name)) : result.chain
    return save(name, chain.length > 0 ? { chain, from: result.from ?? "prefix" } : null)
  }
  /**
   * The examples mostly use it with nothing of the library's around it (Chakra's `InputGroup`, around an `Input`), so its
   * name doesn't say where it goes.
   */
  const standsAlone = (name: string) => {
    const use = examples.get(name)
    return !!use && use.count >= 2 && use.topLevel * 2 >= use.count
  }
  const grow = (name: string, depth: number, start: string[], startFrom: ParentSignal | undefined) => {
    let chain = start
    let from = startFrom
    let error = attempt(chain, name)
    for (let step = 0; error && step < maxDepth && depth < maxDepth; step++) {
      const mentioned = named(error, name, chain)
      let next: string | undefined
      let signal: ParentSignal | undefined
      if (mentioned) [next, signal] = [mentioned, "error"]
      else if (chain.length === 0 && !standsAlone(name)) [next, signal] = guessParent(name, names)
      if (!next) break
      from ??= signal
      const above = chainOf(next, depth + 1)?.chain ?? []
      // What a part still lacks is the context nearest it, so the newly named parent goes innermost, inside the
      // parents already found, and its own parents go outside them.
      const rest = chain.filter((parent) => !above.includes(parent) && parent !== next)
      const inner = [...new Set([...above, ...rest, next])]
      // Unless it's the family's root the error asks for, which goes outside what's there (`DropdownMenu` around an
      // example's `DropdownMenuSub`): both are tried, and the one that renders, or gets further, is kept.
      const outer = [...new Set([...above, next, ...rest])]
      // And the named parent without its own parents, which can bring a context the part can't use
      // (`CodeBlock.AdapterProvider` with no adapter).
      const bare = [...new Set([...rest, next])]
      // And the named parent with levels fewer than half its own examples show (`Slider.Control` above a `Thumb`).
      const rare = levelsOf(next, false, [name], 0.2).map((level) => level.parent)
      const wide = [...new Set([...rare, ...rest, next])]
      const tried = [
        inner,
        ...(rest.length > 0 ? [outer] : []),
        ...(above.length > 0 ? [bare] : []),
        ...(rare.some((level) => !inner.includes(level)) ? [wide] : [])
      ].map((candidate) => ({ candidate, error: attempt(candidate, name) }))
      // The first that renders, else the first that gets further, else the innermost.
      const pick =
        tried.find((option) => !option.error) ??
        (tried[0]!.error === error ? tried.find((option) => option.error !== error) : undefined) ??
        tried[0]!
      chain = pick.candidate
      error = pick.error
    }
    // A part that draws alone still belongs in its family when its name or namespace says so.
    if (chain.length === 0) {
      const [parent, signal] = guessParent(name, names)
      if (parent && signal === "namespace") return { chain: [parent], from: signal, error }
    }
    return { chain, from, error }
  }
  const save = (name: string, result: { chain: string[]; from?: ParentSignal } | null) => {
    // A parent's own chain can lead back to the part (`Toast.Content` in `Toast.Root`); a part is never its own parent.
    const chain = result?.chain.filter((parent) => parent !== name)
    const saved = result && chain && chain.length > 0 ? { ...result, chain } : null
    chains.set(name, saved)
    return saved
  }

  const missing: string[] = []
  /** Parts drawn from a list the library keeps that render with an item of it. */
  const drawnParts = new Set<string>()
  /** What the package puts inside each of them. */
  const drawnInside = new Map<string, Set<string>>()
  for (const component of components) {
    const relation: PartRelation = {}
    const short = component.name.slice(component.name.lastIndexOf(".") + 1)
    if (notVisual.test(short)) relation.visual = false
    // Declared in its types but not there when it runs (MUI's `BadgeRoot`): nothing to place.
    const found = value(component.name)
    if (typeof found !== "function" && (typeof found !== "object" || found === null)) {
      relations.set(component.name, { visual: false })
      missing.push(component.name)
      continue
    }
    const alone = attempt([], component.name)
    if (alone) relation.alone = alone
    const chain = chainOf(component.name, 0)
    if (chain && chain.chain.length > 0) {
      relation.parents = chain.chain
      if (chain.from) relation.parentsFrom = chain.from
      if (withParts.has(component.name)) relation.parentParts = true
      if (chain.from === "example" && !attempt(chain.chain, component.name)) {
        const optional = optionalOf(component.name, chain.chain)
        if (optional.length > 0) relation.optionalParents = optional
      }
    }
    const edit = edits?.[component.name]
    if (edit && edit.visual === false) relation.visual = false
    const editedChildren = edit ? edit.sample?.children : undefined
    let inside = alone ? attempt(relation.parents ?? [], component.name, editedChildren) : undefined
    if (editedChildren && !inside) relation.sample = { children: editedChildren }
    // A single element child, for parts that clone theirs (`asChild`, Children.only).
    if (
      inside &&
      /Children\.only|single React element|valid child|element child|should be an element|accepts ref/i.test(inside)
    ) {
      const children: SampleChild[] = [{ component: "span", children: ["Text"] }]
      if (!attempt(relation.parents ?? [], component.name, children)) {
        relation.sample = { children }
        inside = undefined
      }
    }
    if (Object.keys(component.samples).length > 0 && !inside) {
      relation.sample = { ...relation.sample, props: component.samples }
    }
    // The examples' own use, with real text, items and values (`config={chartConfig}`), when it renders where the part
    // goes, including for one that fails without it.
    const use = examples.get(component.name)
    let shown = use?.sample
    if (shown && (shown.props || shown.children) && !editedChildren) {
      const before = samples.get(component.name)
      samples.set(component.name, { ...before, ...shown.props })
      let failed = attempt(relation.parents ?? [], component.name, shown.children)
      // With the props only that use set, which it may need (MUI's `Slide` its `in`).
      if (failed && inside && use?.rare) {
        samples.set(component.name, { ...before, ...shown.props, ...use?.rare })
        failed = attempt(relation.parents ?? [], component.name, shown.children)
        if (!failed) shown = { ...shown, props: { ...shown.props, ...use?.rare } }
      }
      // Props it needed stay for trying the parts inside it; others are checked against its parts afterwards.
      if (failed || !inside) samples.set(component.name, before ?? {})
      if (!failed) {
        relation.sample = {
          props: { ...component.samples, ...shown.props },
          ...(shown.children ? { children: shown.children } : {})
        }
        if (Object.keys(relation.sample.props!).length === 0) delete relation.sample.props
        relation.sampleFrom = "example"
        if (!inside && shown.props) loose.set(component.name, component.samples)
        inside = undefined
      }
    }
    // Still failing: the props the package's own component passes when it renders this one (`ChartContainer` giving
    // `ChartStyle` its `config`), its own props taken from its sample.
    for (const call of inside ? (calls.get(component.name) ?? []) : []) {
      if (!names.includes(call.owner)) continue
      const owner = { ...samples.get(call.owner), ...examples.get(call.owner)?.sample?.props }
      const props: Record<string, unknown> = { ...component.samples }
      for (const [key, passed] of Object.entries(call.props)) {
        const value = "forward" in passed ? owner[passed.forward] : "value" in passed ? passed.value : undefined
        if (value !== undefined) props[key] = value
      }
      const before = samples.get(component.name)
      samples.set(component.name, props)
      const failed = attempt(relation.parents ?? [], component.name)
      if (failed) samples.set(component.name, before ?? {})
      else {
        relation.sample = { ...relation.sample, props }
        inside = undefined
        break
      }
    }
    // A part the package draws from a list it keeps (`<Toast toast={toast}>` for each toast) shows an item of it, with
    // the parts the package puts inside it, so it's placed as a whole toast rather than an empty one. With an item it
    // may need what its owner had around it (the toast manager's provider), which its error names; so may the parts
    // inside it.
    const drawn = listItem
      ? (calls.get(component.name) ?? []).find((call) => Object.values(call.props).some((passed) => "item" in passed))
      : undefined
    const inDrawn = (relation.parents ?? []).some((parent) => drawnParts.has(parent))
    if (drawn || (inside && inDrawn)) {
      const before = samples.get(component.name)
      const props: Record<string, unknown> = { ...before }
      for (const [key, passed] of Object.entries(drawn?.props ?? {})) {
        if ("item" in passed) props[key] = { id: "1", ...listItem }
      }
      samples.set(component.name, props)
      let parents = relation.parents ?? []
      let failed = attempt(parents, component.name)
      for (let tries = 0; failed && tries < 2; tries++) {
        const needed = named(failed, component.name, parents)
        if (!needed) break
        const next = attempt([needed, ...parents], component.name)
        if (next === failed) break
        parents = [needed, ...parents]
        failed = next
      }
      if (failed) samples.set(component.name, before ?? {})
      else {
        if (parents.length > (relation.parents?.length ?? 0)) {
          relation.parents = parents
          relation.parentsFrom = "error"
          delete relation.optionalParents
        }
        if (drawn) {
          drawnParts.add(component.name)
          // The package's own nesting beats children put together from the parts' parents.
          const own = exportedChildren(drawn.children ?? [], names)
          drawnInside.set(component.name, new Set(componentsIn(own)))
          const children = own.length > 0 ? own : (relation.sample?.children ?? [])
          relation.sample = { props, ...(children.length > 0 ? { children } : {}) }
        }
        inside = undefined
      }
    }
    if (inside) relation.inside = inside
    relations.set(component.name, relation)
  }
  // Parts are tried in name order, so one may have failed before a parent took the props it needs from its examples
  // (Chakra's `Combobox.Indicator` before `Combobox.Item`'s `item`): those that still fail are tried once more.
  for (const [name, relation] of relations) {
    if (!relation.inside || !relation.parents) continue
    if (!attempt(relation.parents, name, relation.sample?.children)) delete relation.inside
  }

  // A parent is inserted with its sample's props. A part that fails inside parents given theirs takes away the
  // examples' props a parent didn't need (`CodeBlock.Root`'s `code`, which its parts can't render with).
  const asInserted = (chain: string[], name: string, children?: SampleChild[]) => {
    const saved = chain.map((parent) => [parent, samples.get(parent)] as const)
    for (const parent of chain) {
      if (loose.has(parent)) samples.set(parent, { ...samples.get(parent), ...relations.get(parent)?.sample?.props })
    }
    const error = attempt(chain, name, children)
    for (const [parent, sample] of saved) samples.set(parent, sample ?? {})
    return error
  }
  for (const [name, relation] of relations) {
    if (!relation.parents || relation.inside || relation.visual === false) continue
    if (!relation.parents.some((parent) => loose.has(parent))) continue
    if (!asInserted(relation.parents, name, relation.sample?.children)) continue
    for (const parent of relation.parents) {
      const generated = loose.get(parent)
      const sample = relations.get(parent)?.sample
      if (!generated || !sample) continue
      loose.delete(parent)
      if (Object.keys(generated).length > 0) sample.props = generated
      else delete sample.props
      if (!sample.props && !sample.children) delete relations.get(parent)!.sample
    }
  }

  // A parent's sample children are its parts, so a collection or a family is placed with something in it.
  const partsOf = new Map<string, string[]>()
  for (const [name, relation] of relations) {
    const parent = relation.parents?.at(-1)
    if (!parent || relation.inside || relation.visual === false) continue
    partsOf.set(parent, [...(partsOf.get(parent) ?? []), name])
  }
  // Deepest first, so a family's root is given parts that already hold theirs.
  const depth = (name: string) => relations.get(name)?.parents?.length ?? 0
  for (const [parent, parts] of [...partsOf].sort(([a], [b]) => depth(b) - depth(a))) {
    const relation = relations.get(parent)
    if (!relation || relation.inside || (relation.sampleFrom === "example" && relation.sample?.children)) continue
    // A drawn part already holds what the package puts inside it.
    if (drawnParts.has(parent)) continue
    // Each with its own sample, spelled out, as a child a sample spells out doesn't take its own.
    const children: SampleChild[] = parts.slice(0, 3).map((part) => ({
      component: part,
      ...(relations.get(part)?.sample?.props ? { props: relations.get(part)!.sample!.props } : {}),
      ...(relations.get(part)?.sample?.children ? { children: relations.get(part)!.sample!.children } : {})
    }))
    if (!attempt(relation.parents ?? [], parent, children)) relation.sample = { ...relation.sample, children }
  }
  // The parts inside a drawn part's sample, so they're placed as part of it.
  const drawnTree = new Set([...drawnParts, ...[...drawnInside.values()].flatMap((inside) => [...inside])])
  return {
    relations,
    tried: true,
    ...(drawnTree.size > 0 ? { drawn: [...drawnTree] } : {}),
    ...(missing.length > 0
      ? {
          note: `Declared but not exported when it runs, so left out: ${missing.slice(0, 10).join(", ")}${missing.length > 10 ? ` and ${missing.length - 10} more` : ""}.`
        }
      : {})
  }
}

/**
 * The parent a name suggests: its namespace's `Root` (`Accordion.Item`), the longest other component its name starts
 * with (`AccordionItem` under `Accordion`), that one's plural when there is one (`TabPanels` under `Tabs`), or its own
 * plural (`Tab` under `Tabs`).
 */
export function guessParent(name: string, names: string[]): [string, ParentSignal] | [undefined, undefined] {
  const dot = name.lastIndexOf(".")
  if (dot !== -1) {
    const namespace = name.slice(0, dot)
    const member = name.slice(dot + 1)
    if (member === "Root" || member === "Provider") return [undefined, undefined]
    const root = [`${namespace}.Root`, `${namespace}.Provider`, namespace].find((candidate) =>
      names.includes(candidate)
    )
    return root ? [root, "namespace"] : [undefined, undefined]
  }
  const prefix = names
    .filter(
      (other) =>
        other !== name && !other.includes(".") && name.startsWith(other) && /^[A-Z]/.test(name.slice(other.length))
    )
    .filter((other) => !notVisual.test(other))
    .sort((a, b) => b.length - a.length)[0]
  // A collection's other parts go in the collection, not its item (`TabPanels` in `Tabs`, not `Tab`).
  if (prefix) return [names.includes(`${prefix}s`) && `${prefix}s` !== name ? `${prefix}s` : prefix, "prefix"]
  if (names.includes(`${name}s`)) return [`${name}s`, "prefix"]
  return [undefined, undefined]
}

/**
 * A name an error mentions, as one of the library's components. A namespaced part only goes inside its own namespace,
 * where an internal name maps by its last words (`MenuContent` and `PopperContent` to `ContextMenu.Content`,
 * `MenuSub` to `ContextMenu.Sub`). Other parts match exactly, or with the dots left out (`Menu.SubmenuRoot`).
 */
function resolveName(mention: string, self: string, names: string[]): string | undefined {
  const namespace = namespaceOf(self)
  if (namespace) {
    if (mention.startsWith(`${namespace}.`)) return names.includes(mention) ? mention : undefined
    // The namespace's own name, or the end of it (`Dialog` inside `AlertDialog`), is its Root.
    const short = namespace.slice(namespace.lastIndexOf(".") + 1)
    if (short.endsWith(mention) && names.includes(`${namespace}.Root`)) return `${namespace}.Root`
    const words = mention.replaceAll(".", "").split(/(?=[A-Z])/)
    for (let start = 0; start < words.length; start++) {
      const candidate = `${namespace}.${words.slice(start).join("")}`
      if (names.includes(candidate)) return candidate
    }
    return undefined
  }
  if (names.includes(mention)) return mention
  const flat = mention.replaceAll(".", "")
  const exact = names.find((name) => name.replaceAll(".", "") === flat)
  if (exact) return exact
  // A styled kit names its parts after the primitive's (`Menu.Group` for shadcn's `ContextMenuGroup`): map it into the
  // part's own family, the longest component its name starts with. `Root` is the family itself.
  const family = names
    .filter((name) => name !== self && self.startsWith(name) && /^[A-Z]/.test(self.slice(name.length)))
    .sort((a, b) => b.length - a.length)[0]
  if (!family) return undefined
  const words = mention
    .split(".")
    .at(-1)!
    .split(/(?=[A-Z])/)
  if (words.join("") === "Root") return family
  for (let start = 0; start < words.length; start++) {
    const candidate = `${family}${words.slice(start).join("")}`
    if (candidate !== self && names.includes(candidate)) return candidate
  }
  return undefined
}

function namespaceOf(name: string): string | undefined {
  const dot = name.lastIndexOf(".")
  return dot === -1 ? undefined : name.slice(0, dot)
}

function message(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).split("\n")[0]!.slice(0, 300)
}

/**
 * A decorator's value outside a frame, for trying parts on the server: imports and calls are made, a mode's value is
 * its default, and the frame's own nodes are left undefined, as there's no frame. Direction and language take the
 * frame's defaults.
 */
async function trialValue(load: Load, value: unknown): Promise<unknown> {
  if (Array.isArray(value)) return Promise.all(value.map((item) => trialValue(load, item)))
  if (typeof value !== "object" || value === null) return value
  const record = value as Record<string, unknown>
  if (typeof record.$import === "string")
    return exported(await load(record.$import), String(record.export ?? "default"))
  if (typeof record.$call === "object" && record.$call !== null) {
    const call = record.$call as { import: string; export?: string }
    const fn = exported(await load(call.import), call.export ?? "default")
    const args = (await trialValue(load, record.args ?? [])) as unknown[]
    return typeof fn === "function" ? (fn as (...args: unknown[]) => unknown)(...args) : undefined
  }
  if (typeof record.$global === "string") return trialValue(load, record.default)
  if (typeof record.$frame === "string")
    return record.$frame === "dir" ? "ltr" : record.$frame === "lang" ? "en-US" : undefined
  if ("$function" in record) {
    const result = await trialValue(load, record.$function)
    return () => result
  }
  const resolved: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(record)) resolved[key] = await trialValue(load, item)
  return resolved
}

function exported(module: Record<string, unknown>, name: string): unknown {
  let found: unknown = module
  for (const part of name.split(".")) found = (found as Record<string, unknown>)?.[part]
  return found ?? (name === "default" ? module : undefined)
}

/** The parts the package puts inside another, as sample children, keeping only those it exports. */
function exportedChildren(children: RenderedChild[], names: string[]): SampleChild[] {
  return children.flatMap((child): SampleChild[] => {
    const inner = exportedChildren(child.children ?? [], names)
    if (!names.includes(child.component)) return inner
    return [{ component: child.component, ...(inner.length > 0 ? { children: inner } : {}) }]
  })
}

/** Every component a sample's children name, at any depth. */
function componentsIn(children: SampleChild[]): string[] {
  return children.flatMap((child) =>
    typeof child === "object" && "component" in child ? [child.component, ...componentsIn(child.children ?? [])] : []
  )
}
