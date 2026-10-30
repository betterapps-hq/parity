/**
 * What the `/` picker and the Components panel offer to insert, and how a search ranks it (PAR-178): the project's own
 * component designs and components before libraries', names before descriptions, internal parts, providers and app
 * plumbing left out until they're searched for by name, and a component found in two places listed once with both.
 */

/** Where something to insert comes from, in the order the picker ranks them. */
export type InsertOrigin = "basic" | "design" | "kit" | "app" | "page" | "library-design" | "library"

const originRank: Record<InsertOrigin, number> = {
  basic: 0,
  design: 1,
  kit: 2,
  app: 3,
  page: 4,
  "library-design": 5,
  library: 6
}

/**
 * Why a component is left out until it's searched for by name: a part its library renders inside its own components
 * (DialogOverlay, ProgressIndicator) or a portal, a provider (ThemeProvider, TooltipProvider), or the app's own plumbing
 * (App, an error boundary).
 */
export type HiddenReason = "internal" | "provider" | "plumbing"

/** What's known about a component when deciding whether it's hidden: as `ComponentSource` has it. */
export interface HidingFacts {
  /** Its library lists it as a part it renders inside its own components. */
  internal?: boolean
}

/** Names of the app's own root and routing components, placed once by the app, never in a design. */
const plumbingNames = new Set(["app", "router", "routes"])

/** Why a component is hidden until searched for by name, from its name (`nova/Dialog` reads as Dialog) and its facts. */
export function hiddenReason(name: string, facts: HidingFacts = {}): HiddenReason | undefined {
  const own = name.split("/").at(-1) ?? name
  // A namespaced part is named by its last piece: Radix's `Tooltip.Provider` is a provider.
  const last = own.split(".").at(-1) ?? own
  if (facts.internal || last.endsWith("Portal")) return "internal"
  if (/Providers?$/.test(last)) return "provider"
  if (plumbingNames.has(own.toLowerCase()) || last.endsWith("Boundary")) return "plumbing"
  return undefined
}

/** A heading for the components a source hides, naming what's there: "Internal parts and providers". */
export function hiddenHeading(reasons: Iterable<HiddenReason>): string {
  const present = new Set(reasons)
  const names = (["internal", "provider", "plumbing"] as const)
    .filter((reason) => present.has(reason))
    .map((reason) => ({ internal: "internal parts", provider: "providers", plumbing: "app plumbing" })[reason])
  if (names.length === 0) return ""
  const text = names.length === 1 ? names[0]! : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`
}

/** One thing to insert from one place. */
export interface InsertOption {
  /** Unique in the list: a component's id, a design's, or a basic layer's. */
  key: string
  /** What it's called: `Badge`, `Member row`. */
  name: string
  origin: InsertOrigin
  /** Which source it's listed under, by id: `designs`, `project:kit`, a library's id. */
  source: string
  /** The source as people know it: `UI kit`, `Shadcn Nova`. */
  sourceName: string
  /** What else describes it, matched after names: the file, folder or route it's listed under. */
  description?: string
  hidden?: HiddenReason
}

/** One row of the picker: a name, with each place it's found. */
export interface InsertRow {
  /** The first option's key. */
  key: string
  name: string
  /** Where it's found, best first: inserting the row inserts the first. */
  options: InsertOption[]
}

/**
 * How well a search matches an option, lower being better: 0 its name exactly, 1 the start of its name, 2 the start of
 * a word in it, 3 anywhere in it, 4 some words in its name and the rest in its description or source, and 5 only its
 * description or source.
 */
export type MatchTier = 0 | 1 | 2 | 3 | 4 | 5

export interface Match {
  tier: MatchTier
  /** For a match word by word, how closely its words match the name, as a tier from 0 to 3: `badge` is Badge's name. */
  closeness: number
  /** How many of the search's words name its source, as `nova` in `nova badge`, so that source is picked first. */
  sourceWords: number
}

/** A name's words, lowercased: `AlertDialogTrigger` is alert, dialog and trigger; `Dialog.Root` is dialog and root. */
export function nameWords(name: string): string[] {
  return name
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z\d]+/)
    .filter(Boolean)
}

/** A search's words, lowercased, without punctuation. */
function queryWords(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z\d]+/)
    .filter(Boolean)
}

/** How a run of the search's words matches a name, or undefined: exactly, at its start, at a word's start, or within. */
function nameTier(words: string[], typed: string): 0 | 1 | 2 | 3 | undefined {
  const whole = words.join("")
  if (whole === typed) return 0
  if (whole.startsWith(typed)) return 1
  for (let index = 1; index < words.length; index++) {
    if (words.slice(index).join("").startsWith(typed)) return 2
  }
  return whole.includes(typed) ? 3 : undefined
}

/** How a search matches an option, or undefined when it doesn't. An empty search matches everything at tier 0. */
export function matchOption(option: InsertOption, query: string): Match | undefined {
  const typed = queryWords(query)
  if (typed.length === 0) return { tier: 0, closeness: 0, sourceWords: 0 }
  const name = nameWords(option.name)
  const source = nameWords(option.sourceName)
  const described = [...source, ...nameWords(option.description ?? "")]
  const sourceWords = typed.filter((word) => source.some((part) => part.startsWith(word))).length
  const whole = nameTier(name, typed.join(""))
  if (whole !== undefined) return { tier: whole, closeness: 0, sourceWords: 0 }
  // Word by word: each found in the name, or else in what describes it.
  let closeness = 3
  let inName = 0
  for (const word of typed) {
    const tier = nameTier(name, word)
    if (tier !== undefined) {
      inName++
      closeness = Math.min(closeness, tier)
    } else if (!described.some((part) => part.startsWith(word))) return undefined
  }
  return inName > 0 ? { tier: 4, closeness, sourceWords } : { tier: 5, closeness: 3, sourceWords }
}

/**
 * How a search matches an option it shows, or undefined: as `matchOption`, but a hidden option shows only when the
 * search has a word in its name, never for an empty search or one that only matches its description.
 */
export function searchOption(option: InsertOption, query: string): Match | undefined {
  const match = matchOption(option, query)
  if (!match || !option.hidden) return match
  return queryWords(query).length > 0 && match.tier <= 4 ? match : undefined
}

/** Basic layers and component designs are their own things; components with one name are one component. */
function mergeable(option: InsertOption): boolean {
  return option.origin !== "basic" && option.origin !== "design" && option.origin !== "library-design"
}

/**
 * The picker's rows for a search, best first. With no search: everything not hidden, the project's component designs
 * and own components first, then libraries', in the order given within each. With one: what matches, names before
 * descriptions, then by where it comes from; hidden ones it names come after the rest unless it names them in full.
 * Components with the same name from different sources are one row, the project's own first, unless the search names
 * the other's source.
 */
export function insertRows(options: readonly InsertOption[], query = ""): InsertRow[] {
  const found: { option: InsertOption; match: Match; index: number }[] = []
  options.forEach((option, index) => {
    const match = searchOption(option, query)
    if (match) found.push({ option, match, index })
  })
  // Merge by name across sources; a second component of one name in the same source stays a row of its own.
  const rows: (typeof found)[] = []
  const byName = new Map<string, (typeof found)[]>()
  for (const entry of found) {
    if (!mergeable(entry.option)) {
      rows.push([entry])
      continue
    }
    const { name } = entry.option
    const candidates = byName.get(name) ?? []
    const row = candidates.find((members) => members.every((member) => member.option.source !== entry.option.source))
    if (row) row.push(entry)
    else {
      const created = [entry]
      rows.push(created)
      byName.set(name, [...candidates, created])
    }
  }
  const order = (a: (typeof found)[number], b: (typeof found)[number]) =>
    b.match.sourceWords - a.match.sourceWords ||
    originRank[a.option.origin] - originRank[b.option.origin] ||
    a.index - b.index
  const ranked = rows.map((members) => {
    const sorted = [...members].sort(order)
    const best = members.reduce((a, b) =>
      (b.match.tier - a.match.tier || b.match.closeness - a.match.closeness) < 0 ? b : a
    )
    const { tier, closeness } = best.match
    // A hidden row a search names in full ranks with the rest; one it only partly names comes after them.
    const hidden = members.every((member) => member.option.hidden) && tier > 0
    return { members: sorted, tier, closeness, hidden }
  })
  ranked.sort(
    (a, b) =>
      Number(a.hidden) - Number(b.hidden) ||
      a.tier - b.tier ||
      a.closeness - b.closeness ||
      b.members[0]!.match.sourceWords - a.members[0]!.match.sourceWords ||
      originRank[a.members[0]!.option.origin] - originRank[b.members[0]!.option.origin] ||
      a.members[0]!.index - b.members[0]!.index
  )
  return ranked.map(({ members }) => ({
    key: members[0]!.option.key,
    name: members[0]!.option.name,
    options: members.map((member) => member.option)
  }))
}
