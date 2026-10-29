import type { ComponentSample, DecoratorElement, LibraryEdits, ParentSignal, SampleChild } from "@parity/core"
import type { FoundComponent } from "./components.ts"
import { type ExampleUse, familyOf, nearestParent } from "./examples.ts"

export type Load = (specifier: string) => Promise<Record<string, unknown>>

/** What trying a component taught: where it goes, what it needs, and whether it then draws. */
export interface PartRelation {
  /** The components it goes inside, outermost first. */
  parents?: string[]
  parentsFrom?: ParentSignal
  /** Props and children it needs to draw, kept only when they made it render. */
  sample?: ComponentSample
  visual?: false
  /** Why it failed alone, when it did. */
  alone?: string
  /** Why it still fails inside its parents with its sample, when it does. */
  inside?: string
  /** Set when its sample is the library's own example. */
  sampleFrom?: "example"
}

export interface PartsReport {
  relations: Map<string, PartRelation>
  /** Whether rendering could be tried at all: it needs React and react-dom from the project. */
  tried: boolean
  note?: string
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
  examples: Map<string, ExampleUse> = new Map()
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
  const around: { type: unknown; props: unknown }[] = []
  for (const provider of providers) {
    byName.delete(provider.component)
    try {
      let found: unknown = await load(provider.import)
      for (const part of provider.component.split(".")) found = (found as Record<string, unknown>)?.[part]
      if (found) around.push({ type: found, props: await trialValue(load, provider.props ?? {}) })
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

  const build = (child: SampleChild): unknown => {
    if (typeof child === "string") return child
    const type = /^[a-z]/.test(child.component) ? child.component : value(child.component)
    return createElement(
      type,
      { ...samples.get(child.component), ...child.props },
      ...(child.children ?? []).map(build)
    )
  }
  /** Renders a part inside a chain of parents; the error it throws, or undefined when it draws. */
  const attempt = (chain: string[], name: string, children?: SampleChild[]): string | undefined => {
    let element = build({ component: name, ...(children ? { children } : {}) })
    for (const parent of [...chain].reverse()) element = createElement(value(parent), samples.get(parent), element)
    return render(element)
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
      renderToStaticMarkup(element)
      return undefined
    } catch (error) {
      return message(error)
    } finally {
      ;[console.error, console.warn] = quiet
    }
  }
  const usable = around.filter(
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
  const aloneErrors = new Map<string, string | undefined>()
  const failsAlone = (name: string) => {
    if (!aloneErrors.has(name)) aloneErrors.set(name, attempt([], name))
    return aloneErrors.get(name) !== undefined
  }
  /**
   * The chain the examples show: the component it's placed in most, then that one's, for as long as the part or the
   * top one still fails, then up through its own family for as long as the examples keep it inside one (`Menubar`
   * around `MenubarMenu`). One that draws alone takes a parent from its own family only, since examples put
   * everything in forms.
   */
  const exampleChain = (name: string): string[] | undefined => {
    const first = nearestParent(examples, name, !failsAlone(name))
    if (!first || !names.includes(first.parent)) return undefined
    const chain = [first.parent]
    const family = familyOf(name)
    for (let top = first.parent; chain.length < maxDepth; ) {
      const needed = failsAlone(top) || attempt(chain, name) !== undefined
      const up = nearestParent(examples, top, !needed)
      if (!up || chain.includes(up.parent) || up.parent === name || !names.includes(up.parent)) break
      if (!needed && familyOf(up.parent) !== family) break
      chain.unshift(up.parent)
      top = up.parent
    }
    return chain
  }
  /** Drops parents from other families that a part renders without: where an example put it, not what it needs. */
  const prune = (chain: string[], name: string): string[] => {
    for (const parent of [...chain]) {
      if (familyOf(parent) === familyOf(name)) continue
      const without = chain.filter((other) => other !== parent)
      if (without.length > 0 && !attempt(without, name)) chain = without
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
    // An example chain that still fails is grown from the errors; when that fails too, the errors alone are tried, so
    // the examples never leave a part worse off than without them.
    const grown = shown ? grow(name, depth, shown, "example") : undefined
    if (grown && !grown.error) return save(name, { chain: prune(grown.chain, name), from: grown.from ?? "example" })
    const fromErrors = grow(name, depth, [], undefined)
    // When both fail, the errors' chain is kept, as without examples: a sample tried later may still make it render.
    const result = !grown || fromErrors.chain.length > 0 ? fromErrors : grown
    // One that still fails keeps only its own family's parents: another family's is where an example put it, not
    // what it needs, and a hand edit starts from less.
    const chain = result.error ? result.chain.filter((parent) => familyOf(parent) === familyOf(name)) : result.chain
    return save(name, chain.length > 0 ? { chain, from: result.from ?? "prefix" } : null)
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
      else if (chain.length === 0) [next, signal] = guessParent(name, names)
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
      const innerError = attempt(inner, name)
      const outerError = rest.length > 0 && innerError ? attempt(outer, name) : innerError
      const better = !outerError || (outerError !== error && innerError === error)
      chain = better && rest.length > 0 ? outer : inner
      error = better && rest.length > 0 ? outerError : innerError
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

  for (const component of components) {
    const relation: PartRelation = {}
    const short = component.name.slice(component.name.lastIndexOf(".") + 1)
    if (notVisual.test(short)) relation.visual = false
    const alone = attempt([], component.name)
    if (alone) relation.alone = alone
    const chain = chainOf(component.name, 0)
    if (chain && chain.chain.length > 0) {
      relation.parents = chain.chain
      if (chain.from) relation.parentsFrom = chain.from
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
    if (inside) relation.inside = inside
    if (Object.keys(component.samples).length > 0 && !inside) {
      relation.sample = { ...relation.sample, props: component.samples }
    }
    // The examples' own use, with real text and items, when it renders where the part goes.
    const shown = examples.get(component.name)?.sample
    if (!inside && shown && (shown.props || shown.children) && !editedChildren) {
      const before = samples.get(component.name)
      samples.set(component.name, { ...before, ...shown.props })
      if (attempt(relation.parents ?? [], component.name, shown.children)) samples.set(component.name, before ?? {})
      else {
        relation.sample = { props: { ...component.samples, ...shown.props }, ...(shown.children ? { children: shown.children } : {}) }
        if (!relation.sample.props || Object.keys(relation.sample.props).length === 0) delete relation.sample.props
        relation.sampleFrom = "example"
      }
    }
    relations.set(component.name, relation)
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
    const children: SampleChild[] = parts.slice(0, 3).map((part) => ({
      component: part,
      ...(relations.get(part)?.sample?.children ? { children: relations.get(part)!.sample!.children } : {})
    }))
    if (!attempt(relation.parents ?? [], parent, children)) relation.sample = { ...relation.sample, children }
  }
  return { relations, tried: true }
}

/**
 * The parent a name suggests: its namespace's `Root` (`Accordion.Item`), the longest other component its name starts
 * with (`AccordionItem` under `Accordion`), or its plural (`Tab` under `Tabs`).
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
  if (prefix) return [prefix, "prefix"]
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
