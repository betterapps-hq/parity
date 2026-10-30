import type { IconEntry } from "./entries.ts"

/** An icon with every word it can be found by, ready to search. */
interface Indexed {
  entry: IconEntry
  /** Its name's words, as in `arrow`, `big`, `down` for `ArrowBigDown`. */
  words: string[]
  /** Its name's words run together, for a query typed without spaces. */
  compact: string
  /** Words from the other names it's exported under. */
  aliases: string[]
  /** Words from its tags, each with the place of the first tag it's in: sets list the tags that say most first. */
  tags: Map<string, number>
}

/** A set's icons in one style, indexed for `searchIcons`. */
export interface IconIndex {
  icons: Indexed[]
  /** Every word of the icons' names and tags once, so a typo is measured against each word once, not once per icon. */
  vocabulary: Set<string>
}

const boundary = /(?<=[a-z])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])|(?<=[A-Za-z])(?=\d)|(?<=\d)(?=[A-Za-z])|[^A-Za-z0-9]+/

/** The words in a name or a query: `ArrowDown01Icon` is arrow, down, 01, icon; `sign-out` is sign, out. */
export function words(text: string): string[] {
  return text
    .split(boundary)
    .filter(Boolean)
    .map((word) => word.toLowerCase())
}

/** Words in more than `share` of the lists, such as Tabler's `icon` or Lucide's `lucide`, which find nothing. */
function common(lists: string[][], share: number): Set<string> {
  const counts = new Map<string, number>()
  for (const list of lists) for (const word of new Set(list)) counts.set(word, (counts.get(word) ?? 0) + 1)
  return new Set([...counts].filter(([, count]) => count > lists.length * share).map(([word]) => word))
}

/**
 * Indexes icons by their names, the other names their package exports them under, and the tags the set publishes,
 * which are keyed by label (the name without a style or size), or by another of the icon's names when the project's
 * version calls it something else.
 */
export function iconIndex(
  entries: readonly IconEntry[],
  aliases: Readonly<Record<string, readonly string[]>> = {},
  tags: Readonly<Record<string, readonly string[]>> = {}
): IconIndex {
  const names = entries.map((entry) => words(entry.label))
  const others = entries.map((entry) => (aliases[entry.name] ?? []).flatMap(words))
  const noise = common(names, 0.5)
  const aliasNoise = common(others, 0.25)
  const vocabulary = new Set<string>()
  return {
    vocabulary,
    icons: entries.map((entry, index) => {
      const own = names[index]!.filter((word) => !noise.has(word))
      const known = new Set(own)
      const tagged = [entry.label, entry.name, ...(aliases[entry.name] ?? [])].map((name) => tags[name]).find(Boolean)
      const places = new Map<string, number>()
      tagged?.forEach((tag, place) => {
        for (const word of words(tag)) if (!places.has(word)) places.set(word, place)
      })
      for (const word of [...own, ...places.keys()]) vocabulary.add(word)
      return {
        entry,
        words: own,
        compact: own.join(""),
        aliases: [
          ...new Set(others[index]!.filter((word) => !noise.has(word) && !aliasNoise.has(word) && !known.has(word)))
        ],
        tags: places
      }
    })
  }
}

/** Edits between two words, a swap of neighbours counting as one, or `limit + 1` once there are more than `limit`. */
export function editDistance(a: string, b: string, limit: number): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1
  let before: number[] = []
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let i = 1; i <= a.length; i++) {
    const current = [i]
    let best = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let value = Math.min(previous[j]! + 1, current[j - 1]! + 1, previous[j - 1]! + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) value = Math.min(value, before[j - 2]! + 1)
      current[j] = value
      best = Math.min(best, value)
    }
    if (best > limit) return limit + 1
    before = previous
    previous = current
  }
  return previous[b.length]!
}

/**
 * How well one word of the query finds an icon: 0 when it doesn't. A name's first word says what the icon is (the
 * arrow in `ArrowDown`) and outranks the rest. Its later words, its other names and its tags say what it shows and
 * count about the same, a set's first tags a little more than its last, and a word its name and tags both say a
 * little more again. The start of a word counts for less than a whole one. `near` has the set's words a typo away from
 * this one, with how many edits away, when typos are forgiven.
 */
function wordScore(word: string, icon: Indexed, near?: Map<string, number>): number {
  let best = 0
  let named = false
  icon.words.forEach((own, index) => {
    if (own === word) {
      best = Math.max(best, index === 0 ? 12 : 7)
      named = true
    } else if (own.startsWith(word)) best = Math.max(best, (index === 0 ? 4 : 3) + (3 * word.length) / own.length)
  })
  for (const alias of icon.aliases) {
    if (alias === word) best = Math.max(best, 7)
    else if (alias.startsWith(word)) best = Math.max(best, 4)
  }
  const place = icon.tags.get(word)
  if (place !== undefined) best = Math.max(best, 6.25 + 1.5 / (1 + place / 2)) + (named ? 1 : 0)
  else if (word.length >= 2) for (const tag of icon.tags.keys()) if (tag.startsWith(word)) best = Math.max(best, 3)
  // `arrowdown`, typed without a space.
  if (word.length >= 3 && icon.compact.startsWith(word)) best = Math.max(best, 6)
  if (best) return best
  if (word.length >= 3 && icon.compact.includes(word)) return 2
  if (!near?.size) return 0
  for (const own of icon.words) {
    const edits = near.get(own)
    if (edits !== undefined) best = Math.max(best, 4 - edits)
  }
  for (const tag of icon.tags.keys()) {
    const edits = near.get(tag)
    if (edits !== undefined) best = Math.max(best, 3 - edits)
  }
  return best
}

/** The set's words a typo away from one of the query's: one edit for five letters or more, two for eight or more. */
function typosOf(index: IconIndex, word: string): Map<string, number> {
  let allowed = 0
  if (word.length >= 8) allowed = 2
  else if (word.length >= 5) allowed = 1
  const near = new Map<string, number>()
  if (!allowed) return near
  for (const known of index.vocabulary) {
    const edits = editDistance(word, known, allowed)
    if (edits > 0 && edits <= allowed) near.set(known, edits)
  }
  return near
}

/** A row of the Icons panel: fewer results than this, and the search reaches further. */
const enough = 6

interface Ranked {
  icon: Indexed
  score: number
}

/** Icons every word finds, and icons only some words find, each scored, with typos forgiven when `typos` is set. */
function rank(index: IconIndex, typed: string[], typos: boolean): { full: Ranked[]; partial: Ranked[] } {
  const compact = typed.join("")
  const near = typos ? typed.map((word) => typosOf(index, word)) : []
  const full: Ranked[] = []
  const partial: Ranked[] = []
  for (const icon of index.icons) {
    let score = 0
    let matched = 0
    for (const [place, word] of typed.entries()) {
      const points = wordScore(word, icon, near[place])
      if (points) matched++
      score += points
    }
    if (!matched) continue
    if (icon.compact === compact) score += 15
    // Fewer words is a plainer icon, likelier to be the one meant.
    const ranked = { icon, score: score - 0.5 * icon.words.length }
    if (matched === typed.length) full.push(ranked)
    else partial.push(ranked)
  }
  return { full, partial }
}

function best(a: Ranked, b: Ranked): number {
  return (
    b.score - a.score ||
    a.icon.entry.label.length - b.icon.entry.label.length ||
    a.icon.entry.label.localeCompare(b.icon.entry.label, "en", { numeric: true })
  )
}

/**
 * The icons a query finds, best first. Each word of the query finds an icon, in any order, by a word of its name, an
 * alias or a tag, whole or by its start. An icon named exactly what was typed comes first, then ones the query
 * describes best; among equals, shorter names first. When that finds less than a row, small typos are forgiven, and
 * icons that only some of the words find follow.
 */
export function searchIcons(index: IconIndex, query: string): IconEntry[] {
  const typed = words(query)
  if (typed.length === 0) return index.icons.map((icon) => icon.entry)
  let found = rank(index, typed, false)
  if (found.full.length < enough && typed.some((word) => word.length >= 5)) found = rank(index, typed, true)
  const results = found.full.sort(best)
  if (results.length < enough) results.push(...found.partial.sort(best))
  return results.map(({ icon }) => icon.entry)
}
