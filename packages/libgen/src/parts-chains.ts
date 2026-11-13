import type { LibraryEdits, ParentSignal } from "@parity-app/core"
import { exampleLevels, familyOf } from "./examples.ts"
import type { PartTrial } from "./parts-trial.ts"

/** Names of components that hold a context rather than draw anything. */
export const notVisual = /(?:Context|Consumer|Provider)$/
const maxDepth = 5

/** The parents a part goes inside, outermost first, and what said so. */
export interface Chain {
  chain: string[]
  from?: ParentSignal
}

/** Parts drawn from a list the library keeps, each with the parts the package puts inside it. */
export type Drawn = Map<string, Set<string>>

/**
 * Finds where parts go. Each is worked out once, and the parts a chain is grown through are worked out on the way, so
 * what one part learns (its chain, whether it fails alone, how often its examples show each parent) is kept for the
 * others and for the passes after.
 */
export interface PartChains {
  /** A part's parents: a hand edit's, else the examples', else those its errors name, else where the package renders it. */
  chainOf(name: string, drawn: Drawn): Chain | null
  /** The chain the part's examples show, grown while it still fails. */
  exampleChain(name: string): string[] | undefined
  /** The levels of an example chain that some examples leave out and the part renders without. */
  optionalOf(name: string, chain: string[]): string[]
}

export interface ChainInputs {
  /** Hand edits: their parents are used as written. */
  edits: LibraryEdits["components"]
  /** The package's components that render each one in its own code (`SelectContent` for `SelectScrollUpButton`). */
  renderedBy: Map<string, string[]>
}

export function partChains(trial: PartTrial, { edits, renderedBy }: ChainInputs): PartChains {
  const { names, examples, withParts, attempt } = trial
  const aloneErrors = new Map<string, string | undefined>()

  const failsAlone = (name: string) => {
    if (!aloneErrors.has(name)) {
      aloneErrors.set(name, attempt([], name))
    }

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

    if (levels.length === 0) {
      return undefined
    }

    shares.set(name, new Map(levels.map((level) => [level.parent, level.share])))
    const chain = levels.map((level) => level.parent)

    // Not grown when it renders with the other parts the examples hold around it, which `chainOf` tries next: what's
    // above can render nothing on the server (a closed `Popover`), so anything would seem to draw inside it.
    if (heldChain(name, chain)) {
      return chain
    }

    while (chain.length < maxDepth * 2 && attempt(chain, name)) {
      const up = levelsOf(chain[0]!, false, chain)

      if (up.length === 0) {
        break
      }

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

    return [chain, usual].find(
      (each) => each.length > 0 && !attempt(each, name, undefined, true) && trial.adds(each, name)
    )
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

      if (share === undefined || share >= 0.9) {
        continue
      }

      const without = chain.filter((other) => other !== parent && !optional.includes(other))

      if (!attempt(without, name)) {
        optional.push(parent)
      }
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
        if (familyIn(parent) === familyIn(name) && !parent.endsWith("Portal")) {
          continue
        }

        const without = chain.filter((other) => other !== parent)

        if (without.length > 0 && !attempt(without, name)) {
          chain = without
          dropped = true
        }
      }
    }

    return chain
  }

  const chains = new Map<string, Chain | null>()

  const chainOf = (name: string, depth: number, drawn: Drawn): Chain | null => {
    if (chains.has(name)) {
      return chains.get(name)!
    }

    const edit = edits?.[name]

    if (edit && edit.parents) {
      return save(name, { chain: edit.parents, from: "edit" })
    }

    chains.set(name, null) // a cycle ends here
    const shown = exampleChain(name)

    if (shown && !attempt(shown, name)) {
      return save(name, { chain: prune(shown, name), from: "example" })
    }

    // Or with the other parts the examples hold around it.
    const held = shown && attempt(shown, name) ? heldChain(name, shown) : undefined

    if (held) {
      withParts.add(name)

      return save(name, { chain: held, from: "example" })
    }

    // Or without another family's level it can't render in on the server (Chakra's generic `Portal`).
    const pruned = shown && prune(shown, name)

    if (pruned && pruned.length > 0 && !attempt(pruned, name)) {
      return save(name, { chain: pruned, from: "example" })
    }

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
    const grown = shown ? grow(name, depth, shown, "example", drawn) : undefined

    if (grown && !grown.error) {
      return save(name, { chain: prune(grown.chain, name), from: grown.from ?? "example" })
    }

    const fromErrors = grow(name, depth, [], undefined, drawn)
    // A part drawn from a list (a toast) renders with its sample item, so errors can put anything in it; only what the
    // package puts inside it goes there.
    const stray = fromErrors.chain.some((parent) => drawn.has(parent) && !drawn.get(parent)?.has(name))

    if (!fromErrors.error && fromErrors.chain.length > 0 && !stray) {
      return save(name, { chain: fromErrors.chain, from: fromErrors.from ?? "prefix" })
    }

    // Last, a part no example places renders where the package's own code renders it (`SelectScrollUpButton` in
    // `SelectContent`). It comes after the errors, as a kit's Content often renders its own Portal and Overlay.
    if (!shown && failsAlone(name)) {
      for (const owner of renderedBy.get(name) ?? []) {
        if (!names.includes(owner) || owner === name) {
          continue
        }

        const chain = [...(chainOf(owner, depth + 1, drawn)?.chain ?? []).filter((parent) => parent !== name), owner]

        if (!attempt(chain, name)) {
          return save(name, { chain, from: "source" })
        }
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

  const grow = (name: string, depth: number, start: string[], startFrom: ParentSignal | undefined, drawn: Drawn) => {
    let chain = start
    let from = startFrom
    let error = attempt(chain, name)

    for (let step = 0; error && step < maxDepth && depth < maxDepth; step++) {
      const mentioned = trial.named(error, name, chain)
      let next: string | undefined
      let signal: ParentSignal | undefined

      if (mentioned) {
        ;[next, signal] = [mentioned, "error"]
      } else if (chain.length === 0 && !standsAlone(name)) {
        ;[next, signal] = guessParent(name, names)
      }

      if (!next) {
        break
      }

      from ??= signal
      const above = chainOf(next, depth + 1, drawn)?.chain ?? []
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

      if (parent && signal === "namespace") {
        return { chain: [parent], from: signal, error }
      }
    }

    return { chain, from, error }
  }

  const save = (name: string, result: Chain | null) => {
    // A parent's own chain can lead back to the part (`Toast.Content` in `Toast.Root`); a part is never its own parent.
    const chain = result?.chain.filter((parent) => parent !== name)
    const saved = result && chain && chain.length > 0 ? { ...result, chain } : null
    chains.set(name, saved)

    return saved
  }

  return { chainOf: (name, drawn) => chainOf(name, 0, drawn), exampleChain, optionalOf }
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

    if (member === "Root" || member === "Provider") {
      return [undefined, undefined]
    }

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
  if (prefix) {
    return [names.includes(`${prefix}s`) && `${prefix}s` !== name ? `${prefix}s` : prefix, "prefix"]
  }

  if (names.includes(`${name}s`)) {
    return [`${name}s`, "prefix"]
  }

  return [undefined, undefined]
}
