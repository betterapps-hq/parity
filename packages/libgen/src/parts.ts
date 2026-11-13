import type { FoundComponent } from "@parity-app/code"
import {
  type ComponentSample,
  type DecoratorElement,
  isMadeValue,
  type LibraryEdits,
  type ParentSignal,
  type SampleChild
} from "@parity-app/core"
import type { ExampleItem, ExampleUse } from "./examples.ts"
import type { RenderCall, RenderedChild } from "./hosts.ts"
import { isFunction, isObject, isText, type Load } from "./live.ts"
import { type Drawn, notVisual, type PartChains, partChains } from "./parts-chains.ts"
import {
  isElementChild,
  namespaceOf,
  openTrial,
  type PartTrial,
  type SampleElementChild,
  type SampleProps,
  type SampleValue
} from "./parts-trial.ts"

export type { Load } from "./live.ts"

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
  /** Its parents need the other parts their samples hold around them (a table's header beside the body a row is in). */
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

/**
 * What the passes know so far, handed from one to the next. A pass updates the value it's given and returns it: the
 * trial's samples and the relations' samples share objects, so each pass sees what the one before it left.
 */
export interface Relating {
  /** What's known of each part so far. */
  relations: Map<string, PartRelation>
  /** Parts whose sample has example props they render without, with the props they had before. */
  loose: Map<string, SampleProps>
  /** Parts drawn from a list the library keeps that render with an item of it, and what the package puts inside them. */
  drawn: Drawn
  /** Parts declared in the types but not there when the module runs. */
  missing: string[]
}

export interface RelatePartsOptions {
  load: Load
  /** What the library's components are imported from. */
  specifier: string
  components: FoundComponent[]
  /** The providers the library's decorators wrap every frame in, outermost first, so parts are tried inside them. */
  providers?: DecoratorElement[]
  /** Hand edits, tried as they're written: their parents and samples replace what would be inferred. */
  edits?: LibraryEdits["components"]
  /** How the library's own examples use each component, the strongest signal after a hand edit. */
  examples?: Map<string, ExampleUse>
  /** The package's components that render each one in its own code (`SelectContent` for `SelectScrollUpButton`). */
  renderedBy?: Map<string, string[]>
  /** The props those components pass when they render each one, for a part that needs what its owner gives it. */
  calls?: Map<string, RenderCall[]>
  /** An item of the lists the library keeps, from its examples, for parts their owner draws from such a list. */
  listItem?: ExampleItem
  /**
   * Why parts failed in the running app, from `parity lib check --record`: an error there names a parent the server
   * can't see a part needs, inside a closed menu or a portal (`NavigationMenuContent` must be used within
   * `NavigationMenuItem`).
   */
  appErrors?: Record<string, string>
}

/**
 * Works out how a library's parts fit together, by rendering each with React's server renderer from the project, so
 * nothing needs a browser. A part that throws alone usually names what it needs ("`AccordionItem` must be used within
 * `Accordion`"), which is the strongest signal after a namespace export (`Accordion.Item` belongs in `Accordion.Root`).
 * Otherwise a shared name prefix (`AccordionItem` under `Accordion`) or a plural (`Tab` under `Tabs`) is tried. Each
 * chain is rendered again, so a suggestion that doesn't render is reported as such rather than trusted.
 *
 * It runs in passes, each over every part: placing each part in name order, then trying again those that still fail,
 * taking off parents' example props their parts can't render with, following the app's errors, completing chains,
 * and fitting samples' children.
 */
export async function relateParts({
  load,
  specifier,
  components,
  providers = [],
  edits = {},
  examples = new Map(),
  renderedBy = new Map(),
  calls = new Map(),
  listItem,
  appErrors = {}
}: RelatePartsOptions): Promise<PartsReport> {
  const trial = await openTrial({ load, specifier, components, providers, edits, examples })

  if ("note" in trial) {
    return { relations: new Map(), tried: false, note: trial.note }
  }

  const chains = partChains(trial, { edits, renderedBy })
  let relating: Relating = { relations: new Map(), loose: new Map(), drawn: new Map(), missing: [] }

  relating = placeParts(relating, trial, chains, { components, edits, calls, listItem })
  relating = retryFailing(relating, trial)
  relating = dropLooseProps(relating, trial)
  relating = followAppErrors(relating, trial, chains, appErrors)
  relating = completeChains(relating)
  relating = takeSpelledOutChildren(relating, trial)
  relating = fillParents(relating, trial)
  relating = fitChildren(relating, trial)
  relating = textAsProp(relating, trial)
  relating = dropChildlessParents(relating)

  return reportOf(relating)
}

export interface PlaceInputs {
  components: FoundComponent[]
  edits: LibraryEdits["components"]
  calls: Map<string, RenderCall[]>
  listItem: ExampleItem | undefined
}

/**
 * Places each part, in the order found: its parents, then a sample that makes it draw there. A part's sample can keep
 * props the parts inside it need, and a part drawn from a list marks what goes in it, so what one part learns is there
 * for the parts after it.
 */
export function placeParts(
  relating: Relating,
  trial: PartTrial,
  chains: PartChains,
  { components, edits, calls, listItem }: PlaceInputs
): Relating {
  const { relations, missing } = relating

  for (const component of components) {
    const relation: PartRelation = {}
    const short = component.name.slice(component.name.lastIndexOf(".") + 1)

    if (notVisual.test(short)) {
      relation.visual = false
    }

    // Declared in its types but not there when it runs (MUI's `BadgeRoot`): nothing to place.
    const found = trial.value(component.name)

    if (!isFunction(found) && !isObject(found)) {
      relations.set(component.name, { visual: false })
      missing.push(component.name)
      continue
    }

    const alone = trial.attempt([], component.name)

    if (alone) {
      relation.alone = alone
    }

    const chain = chains.chainOf(component.name, relating.drawn)

    if (chain && chain.chain.length > 0) {
      relation.parents = chain.chain

      if (chain.from) {
        relation.parentsFrom = chain.from
      }

      if (trial.withParts.has(component.name)) {
        relation.parentParts = true
      }

      if (chain.from === "example" && !trial.attempt(chain.chain, component.name)) {
        const optional = chains.optionalOf(component.name, chain.chain)

        if (optional.length > 0) {
          relation.optionalParents = optional
        }
      }
    }

    const edit = edits?.[component.name]

    if (edit && edit.visual === false) {
      relation.visual = false
    }

    const editedChildren = edit ? edit.sample?.children : undefined
    let inside = alone ? trial.attempt(relation.parents ?? [], component.name, editedChildren) : undefined

    if (editedChildren && !inside) {
      relation.sample = { children: editedChildren }
    }

    // A single element child, for parts that clone theirs (`asChild`, Children.only).
    if (
      inside &&
      /Children\.only|single React element|valid child|element child|should be an element|accepts ref/i.test(inside)
    ) {
      const children: SampleChild[] = [{ component: "span", children: ["Text"] }]

      if (!trial.attempt(relation.parents ?? [], component.name, children)) {
        relation.sample = { children }
        inside = undefined
      }
    }

    if (Object.keys(component.samples).length > 0 && !inside) {
      relation.sample = { ...relation.sample, props: component.samples }
    }

    inside = sampleFromExample(component, relation, inside, editedChildren, relating, trial)
    inside = sampleFromOwners(component, relation, inside, trial, calls)
    inside = sampleFromList(component, relation, inside, relating, trial, calls, listItem)

    // The values the package makes that it was tried with go where it's inserted too.
    const madeHere = trial.madeProps.get(component.name)

    if (madeHere) {
      relation.sample = { ...relation.sample, props: { ...madeHere, ...relation.sample?.props } }
    }

    if (inside) {
      relation.inside = inside
    }

    relations.set(component.name, relation)
  }

  return relating
}

/**
 * The examples' own use, with real text, items and values (`config={chartConfig}`), when it renders where the part
 * goes, including for one that fails without it. Returns why the part still fails inside its parents, if it does.
 */
function sampleFromExample(
  component: FoundComponent,
  relation: PartRelation,
  inside: string | undefined,
  editedChildren: SampleChild[] | undefined,
  relating: Relating,
  trial: PartTrial
): string | undefined {
  const { samples } = trial
  const use = trial.examples.get(component.name)
  let shown = use?.sample

  if (!shown || !(shown.props || shown.children) || editedChildren) {
    return inside
  }

  const before = samples.get(component.name)
  samples.set(component.name, { ...before, ...shown.props })
  let failed = trial.attempt(relation.parents ?? [], component.name, shown.children)

  // With the props only that use set, which it may need (MUI's `Slide` its `in`).
  if (failed && inside && use?.rare) {
    samples.set(component.name, { ...before, ...shown.props, ...use?.rare })
    failed = trial.attempt(relation.parents ?? [], component.name, shown.children)

    if (!failed) {
      shown = { ...shown, props: { ...shown.props, ...use?.rare } }
    }
  }

  // Props it needed stay for trying the parts inside it; others are checked against its parts afterwards.
  if (failed || !inside) {
    samples.set(component.name, before ?? {})
  }

  if (failed) {
    return inside
  }

  relation.sample = { props: { ...component.samples, ...shown.props } }

  if (shown.children) {
    relation.sample.children = shown.children
  }

  if (Object.keys(relation.sample.props!).length === 0) {
    delete relation.sample.props
  }

  relation.sampleFrom = "example"

  if (!inside && shown.props) {
    relating.loose.set(component.name, component.samples)
  }

  return undefined
}

/**
 * Still failing: the props the package's own component passes when it renders this one (`ChartContainer` giving
 * `ChartStyle` its `config`), its own props taken from its sample.
 */
function sampleFromOwners(
  component: FoundComponent,
  relation: PartRelation,
  inside: string | undefined,
  trial: PartTrial,
  calls: Map<string, RenderCall[]>
): string | undefined {
  const { samples } = trial

  for (const call of inside ? (calls.get(component.name) ?? []) : []) {
    if (!trial.names.includes(call.owner)) {
      continue
    }

    const owner = { ...samples.get(call.owner), ...trial.examples.get(call.owner)?.sample?.props }
    const props: SampleProps = { ...component.samples }
    const worked: string[] = []

    for (const [key, passed] of Object.entries(call.props)) {
      let value: SampleValue

      if ("forward" in passed) {
        value = owner[passed.forward]
      } else if ("value" in passed) {
        value = passed.value
      }

      if (value !== undefined) {
        props[key] = value
      } else if (!(key in props)) {
        worked.push(key)
      }
    }

    const before = samples.get(component.name)
    // A value the owner works out (a calendar's `day` for its `TableCell`) may be one the examples make: each is tried.
    const tries = [undefined, ...(worked.length > 0 ? trial.madeCalls : [])]
    let failed: string | undefined

    for (const made of tries) {
      if (made) {
        props[worked[0]!] = made
      }

      samples.set(component.name, props)
      failed = trial.attempt(relation.parents ?? [], component.name)

      if (!failed) {
        break
      }
    }

    if (failed) {
      samples.set(component.name, before ?? {})
    } else {
      relation.sample = { ...relation.sample, props }

      return undefined
    }
  }

  return inside
}

/**
 * A part the package draws from a list it keeps (`<Toast toast={toast}>` for each toast) shows an item of it, with the
 * parts the package puts inside it, so it's placed as a whole toast rather than an empty one. With an item it may need
 * what its owner had around it (the toast manager's provider), which its error names; so may the parts inside it.
 */
function sampleFromList(
  component: FoundComponent,
  relation: PartRelation,
  inside: string | undefined,
  relating: Relating,
  trial: PartTrial,
  calls: Map<string, RenderCall[]>,
  listItem: ExampleItem | undefined
): string | undefined {
  const { samples } = trial

  const drawn = listItem
    ? (calls.get(component.name) ?? []).find((call) => Object.values(call.props).some((passed) => "item" in passed))
    : undefined

  const inDrawn = (relation.parents ?? []).some((parent) => relating.drawn.has(parent))

  if (!drawn && !(inside && inDrawn)) {
    return inside
  }

  const before = samples.get(component.name)
  const props: SampleProps = { ...before }

  for (const [key, passed] of Object.entries(drawn?.props ?? {})) {
    if ("item" in passed) {
      props[key] = { id: "1", ...listItem }
    }
  }

  samples.set(component.name, props)
  const parents = [...(relation.parents ?? [])]
  let failed = trial.attempt(parents, component.name)

  for (let tries = 0; failed && tries < 2; tries++) {
    const needed = trial.named(failed, component.name, parents)

    if (!needed) {
      break
    }

    const next = trial.attempt([needed, ...parents], component.name)

    if (next === failed) {
      break
    }

    parents.unshift(needed)
    failed = next
  }

  if (failed) {
    samples.set(component.name, before ?? {})

    return inside
  }

  if (parents.length > (relation.parents?.length ?? 0)) {
    relation.parents = parents
    relation.parentsFrom = "error"
    delete relation.optionalParents
  }

  if (drawn) {
    // The package's own nesting beats children put together from the parts' parents.
    const own = exportedChildren(drawn.children ?? [], trial.names)
    relating.drawn.set(component.name, new Set(componentsIn(own)))
    const children = own.length > 0 ? own : (relation.sample?.children ?? [])
    relation.sample = children.length > 0 ? { props, children } : { props }
  }

  return undefined
}

/**
 * Parts are placed in name order, so one may have failed before a parent took the props it needs from its examples
 * (Chakra's `Combobox.Indicator` before `Combobox.Item`'s `item`): those that still fail are tried once more.
 */
export function retryFailing(relating: Relating, trial: PartTrial): Relating {
  for (const [name, relation] of relating.relations) {
    if (!relation.inside || !relation.parents) {
      continue
    }

    if (!trial.attempt(relation.parents, name, relation.sample?.children)) {
      delete relation.inside
    }
  }

  return relating
}

/**
 * A parent is inserted with its sample's props. A part that fails inside parents given theirs takes away the examples'
 * props a parent didn't need (`CodeBlock.Root`'s `code`, which its parts can't render with).
 */
export function dropLooseProps(relating: Relating, trial: PartTrial): Relating {
  const { relations, loose } = relating
  const { samples } = trial

  const asInserted = (chain: string[], name: string, children?: SampleChild[]) => {
    const saved = chain.map((parent) => [parent, samples.get(parent)] as const)

    for (const parent of chain) {
      if (loose.has(parent)) {
        samples.set(parent, { ...samples.get(parent), ...relations.get(parent)?.sample?.props })
      }
    }

    const error = trial.attempt(chain, name, children)

    for (const [parent, sample] of saved) {
      samples.set(parent, sample ?? {})
    }

    return error
  }

  for (const [name, relation] of relations) {
    if (!relation.parents || relation.inside || relation.visual === false) {
      continue
    }

    if (!relation.parents.some((parent) => loose.has(parent))) {
      continue
    }

    if (!asInserted(relation.parents, name, relation.sample?.children)) {
      continue
    }

    const cleared: [string, SampleProps, SampleProps][] = []

    for (const parent of relation.parents) {
      const generated = loose.get(parent)
      const sample = relations.get(parent)?.sample

      if (!generated || !sample) {
        continue
      }

      loose.delete(parent)

      // The values the package makes stay (a date picker's dates), which its parts need in the app if not here.
      const made = Object.entries(sample.props ?? {}).filter(
        ([, value]) => isMadeValue(value) || (Array.isArray(value) && value.some(isMadeValue))
      )

      const kept = { ...generated, ...Object.fromEntries(made) }

      if (made.length > 0) {
        cleared.push([parent, generated, kept])
      }

      if (Object.keys(kept).length > 0) {
        sample.props = kept
      } else {
        delete sample.props
      }
    }

    // Unless the part still fails inside parents given them, when they go too.
    if (cleared.length > 0) {
      const saved = cleared.map(([parent]) => [parent, samples.get(parent)] as const)

      for (const [parent, , kept] of cleared) {
        samples.set(parent, kept)
      }

      const fails = trial.attempt(relation.parents, name, relation.sample?.children)

      for (const [parent, sample] of saved) {
        samples.set(parent, sample ?? {})
      }

      if (fails) {
        for (const [parent, generated] of cleared) {
          const sample = relations.get(parent)!.sample!

          if (Object.keys(generated).length > 0) {
            sample.props = generated
          } else {
            delete sample.props
          }
        }
      }
    }

    for (const parent of relation.parents) {
      const sample = relations.get(parent)?.sample

      if (sample && !sample.props && !sample.children) {
        delete relations.get(parent)!.sample
      }
    }
  }

  return relating
}

/** The parent an error in the app names goes in the part's chain, inside that parent's own. */
export function followAppErrors(
  relating: Relating,
  trial: PartTrial,
  chains: PartChains,
  appErrors: Record<string, string>
): Relating {
  const { relations } = relating

  for (const [name, error] of Object.entries(appErrors)) {
    const relation = relations.get(name)

    if (!relation || relation.visual === false) {
      continue
    }

    // One that hands its text label to an input (Mantine's `ComboboxSearch`, in a dropdown the server never opens).
    if (/void element|self-closing tag/.test(error)) {
      if (!relation.sample?.children) {
        relation.sample = { ...relation.sample, children: [] }
      }

      continue
    }

    // A hand edit's parents are used as written.
    if (relation.parentsFrom === "edit") {
      continue
    }

    const parents = relation.parents ?? []
    const needed = trial.named(error, name, parents, false)

    // An error that names nothing still says the chain is wrong: the examples' own goes in its place, when it's
    // another (Chakra's `TreeView.BranchContent`, in a `TreeView.Branch` rather than the `TreeView.Item` an error on the
    // server led to).
    if (!needed) {
      const shown = chains.exampleChain(name)

      if (shown && shown.join() !== parents.join() && !trial.attempt(shown, name, relation.sample?.children)) {
        relation.parents = shown
        relation.parentsFrom = "app"
        delete relation.optionalParents
      }

      continue
    }

    // One of its own family goes inside that parent's own chain; another's (Base UI's `Menu.Portal` for a
    // `ContextMenu.Positioner`) goes inside the chain it has.
    const outer = (relations.get(needed)?.parents ?? []).filter((parent) => parent !== name)
    relation.parents =
      namespaceOf(needed) === namespaceOf(name) ? [...new Set([...outer, needed, ...parents])] : [...parents, needed]
    relation.parentsFrom = "app"
  }

  return relating
}

/**
 * Starts each chain whose outermost parent needs parents of its own outside them (`SubmenuTrigger` in a `MenuSection`,
 * which goes in a `Menu`), as inserting the parent alone would, with the levels optional there optional here too.
 * Parents guessed round in a circle (a part among its parent's parents) are left as they are.
 */
export function completeChains(relating: Relating): Relating {
  const { relations } = relating

  for (const [name, relation] of relations) {
    for (let round = 0; round < 4 && relation.parents?.length; round++) {
      const outer = relations.get(relation.parents[0]!)

      if (outer?.parents?.includes(name)) {
        break
      }

      const added = (outer?.parents ?? []).filter((parent) => !relation.parents!.includes(parent))

      if (added.length === 0) {
        break
      }

      relation.parents = [...added, ...relation.parents]
      const optional = (outer?.optionalParents ?? []).filter((parent) => added.includes(parent))

      if (optional.length > 0) {
        relation.optionalParents = [...new Set([...(relation.optionalParents ?? []), ...optional])]
      }
    }
  }

  return relating
}

/**
 * A part with no children of its own takes those a parent's sample spells out for it (a table's `Row` its `Cell`s),
 * when it renders with them, rather than a text label its collection can't hold.
 */
export function takeSpelledOutChildren(relating: Relating, trial: PartTrial): Relating {
  const { relations } = relating

  for (const [name, relation] of relations) {
    if (relation.sample?.children || !relation.parents?.length || relation.visual === false) {
      continue
    }

    for (const parent of [...relation.parents].reverse()) {
      const children = spelledOut(relations.get(parent)?.sample?.children ?? [], name)

      if (!children) {
        continue
      }

      // Or inside the outermost parent's whole sample, where what they need is (the table's columns for a row's cells).
      let parts: boolean | undefined = false

      if (trial.attempt(relation.parents, name, children)) {
        parts = trial.attempt(relation.parents, name, children, true) ? undefined : true
      }

      if (parts !== undefined) {
        relation.sample = { ...relation.sample, children }

        if (parts) {
          relation.parentParts = true
        }

        delete relation.inside
      }

      break
    }
  }

  return relating
}

/**
 * A parent's sample children are its parts, so a collection or a family is placed with something in it: up to three
 * of the parts whose nearest parent it is, each with its own sample spelled out.
 */
export function fillParents(relating: Relating, trial: PartTrial): Relating {
  const { relations } = relating
  const partsOf = new Map<string, string[]>()

  for (const [name, relation] of relations) {
    const parent = relation.parents?.at(-1)

    if (!parent || relation.inside || relation.visual === false) {
      continue
    }

    partsOf.set(parent, [...(partsOf.get(parent) ?? []), name])
  }

  // Deepest first, so a family's root is given parts that already hold theirs.
  const depth = (name: string) => relations.get(name)?.parents?.length ?? 0

  for (const [parent, parts] of [...partsOf].sort(([a], [b]) => depth(b) - depth(a))) {
    const relation = relations.get(parent)

    if (!relation || relation.inside || (relation.sampleFrom === "example" && relation.sample?.children)) {
      continue
    }

    // A drawn part already holds what the package puts inside it.
    if (relating.drawn.has(parent)) {
      continue
    }

    // Each with its own sample, spelled out, as a child a sample spells out doesn't take its own.
    const children: SampleChild[] = parts.slice(0, 3).map((part) => {
      const child: SampleElementChild = { component: part }
      const sample = relations.get(part)?.sample

      if (sample?.props) {
        child.props = sample.props
      }

      if (sample?.children) {
        child.children = sample.children
      }

      return child
    })

    if (!trial.attempt(relation.parents ?? [], parent, children)) {
      relation.sample = { ...relation.sample, children }
    }
  }

  return relating
}

/**
 * A part that passes its children to an `<input>` (Mantine's `Cascader`) can't take the text label the canvas gives a
 * part with children, so its sample says it has none. One that calls its children (Base UI's `Field.Validity`) is
 * given a function of them that draws text.
 */
export function fitChildren(relating: Relating, trial: PartTrial): Relating {
  for (const [name, relation] of relating.relations) {
    if (relation.visual === false || relation.sample?.children) {
      continue
    }

    const parents = relation.parents ?? []
    const failed = trial.attempt(parents, name, ["Text"])

    if (failed && /void element|self-closing tag/.test(failed) && !trial.attempt(parents, name, [])) {
      relation.sample = { ...relation.sample, children: [] }
    }

    const bare = failed && trial.attempt(parents, name)

    if (bare && /children is not a function/.test(bare) && !trial.attempt(parents, name, [{ $render: ["Text"] }])) {
      relation.sample = { ...relation.sample, children: [{ $render: ["Text"] }] }
      delete relation.inside
    }
  }

  return relating
}

/**
 * One whose children must be plain text (Chakra's `Highlight`) can't hold a text layer, which the canvas draws as an
 * element: its text goes in its `children` prop, in its own sample and in the samples of the parts it's drawn in.
 */
export function textAsProp(relating: Relating, trial: PartTrial): Relating {
  const { relations } = relating
  const textOnly = new Set<string>()

  for (const [name, relation] of relations) {
    const texts = relation.sample?.children

    if (!texts?.length || !texts.every(isText)) {
      continue
    }

    const parents = relation.parents ?? []

    if (!trial.attempt(parents, name, [{ component: "p", children: texts }]) || trial.attempt(parents, name, texts)) {
      continue
    }

    const { children: _, ...sample } = relation.sample!
    relation.sample = { ...sample, props: { ...sample.props, children: texts.join("") } }
    textOnly.add(name)
  }

  const asText = (children: SampleChild[]): SampleChild[] =>
    children.map((child) => {
      if (!isElementChild(child) || !child.children) {
        return child
      }

      const { children: inner, ...node } = child

      if (textOnly.has(child.component) && inner.length > 0 && inner.every(isText)) {
        return { ...node, props: { ...node.props, children: inner.join("") } }
      }

      return { ...node, children: asText(inner) }
    })

  if (textOnly.size > 0) {
    for (const relation of relations.values()) {
      if (relation.sample?.children) {
        relation.sample = { ...relation.sample, children: asText(relation.sample.children) }
      }
    }
  }

  return relating
}

/**
 * Nothing goes inside a part that takes no children (Mantine's `TreeSelectOption`, guessed into a `TreeSelect` by its
 * name, which draws its options itself), unless a hand edit put it there.
 */
export function dropChildlessParents(relating: Relating): Relating {
  const { relations } = relating

  for (const relation of relations.values()) {
    const nearest = relation.parents?.at(-1)

    if (nearest && relations.get(nearest)?.sample?.children?.length === 0 && relation.parentsFrom !== "edit") {
      delete relation.parents
      delete relation.optionalParents
      delete relation.parentsFrom
    }
  }

  return relating
}

/** What the passes found, with the parts placed as part of a drawn one and the parts left out. */
function reportOf({ relations, drawn, missing }: Relating): PartsReport {
  // The parts inside a drawn part's sample, so they're placed as part of it.
  const drawnTree = new Set([...drawn.keys(), ...[...drawn.values()].flatMap((inside) => [...inside])])

  const report: PartsReport = { relations, tried: true }

  if (drawnTree.size > 0) {
    report.drawn = [...drawnTree]
  }

  if (missing.length > 0) {
    const more = missing.length > 10 ? ` and ${missing.length - 10} more` : ""
    report.note = `Declared but not exported when it runs, so left out: ${missing.slice(0, 10).join(", ")}${more}.`
  }

  return report
}

/** The children a sample spells out for the first `name` in it that has any, at any depth (a table's `Row` its `Cell`s). */
export function spelledOut(children: SampleChild[], name: string): SampleChild[] | undefined {
  for (const child of children) {
    if (!isElementChild(child)) {
      continue
    }

    if (child.component === name && child.children?.length) {
      return child.children
    }

    const inner = spelledOut(child.children ?? [], name)

    if (inner) {
      return inner
    }
  }

  return undefined
}

/** The parts the package puts inside another, as sample children, keeping only those it exports. */
function exportedChildren(children: RenderedChild[], names: string[]): SampleChild[] {
  return children.flatMap((child): SampleChild[] => {
    const inner = exportedChildren(child.children ?? [], names)

    if (!names.includes(child.component)) {
      return inner
    }

    return [inner.length > 0 ? { component: child.component, children: inner } : { component: child.component }]
  })
}

/** Every component a sample's children name, at any depth. */
function componentsIn(children: SampleChild[]): string[] {
  return children.flatMap((child) =>
    isElementChild(child) ? [child.component, ...componentsIn(child.children ?? [])] : []
  )
}
