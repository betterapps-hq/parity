import { z } from "zod"
import { findKind, queryLimit } from "./connector.ts"

/*
 * Recent searches: what the person searched in the window, so they can run one again. Where they're kept is the app's
 * business (on this computer now, on the person's account once Parity's service keeps them), so this only says what
 * one is and how a new one joins the list.
 */

/** A search the person ran in the window. Agents' searches aren't kept. */
export const recentSearch = z.strictObject({
  connector: z.string().min(1),
  kind: findKind,
  query: z.string().trim().min(1).max(queryLimit),
  /** The value of every filter it ran with, defaults included, so it can say what it was narrowed by. */
  filters: z.record(z.string(), z.string()),
  /** When it was last run, in milliseconds since the epoch. */
  at: z.number()
})

export type RecentSearch = z.infer<typeof recentSearch>

/** How many recent searches each connector keeps. */
export const recentLimit = 5

/**
 * The recent searches with one more first. Running the same words on the same connector again moves that search up
 * with the filters it last had, and each connector keeps only its latest few.
 */
export function remember(
  recent: readonly RecentSearch[],
  search: RecentSearch,
  limit: number = recentLimit
): RecentSearch[] {
  const same = (each: RecentSearch) =>
    each.connector === search.connector &&
    each.kind === search.kind &&
    each.query.toLowerCase() === search.query.toLowerCase()

  const kept = new Map<string, number>()

  return [search, ...recent.filter((each) => !same(each))].filter((each) => {
    const count = (kept.get(each.connector) ?? 0) + 1
    kept.set(each.connector, count)

    return count <= limit
  })
}
