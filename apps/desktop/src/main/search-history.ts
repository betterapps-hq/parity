import { type RecentSearch, recentSearch, remember } from "@parity-app/connectors"
import { readItems, writeJson } from "./json-file.ts"

/**
 * Where the person's recent searches are kept (PAR-829). The hub adds each search the person runs in the window, and
 * the window lists them. This copy keeps them on this computer; once Parity's service keeps them on the person's
 * account, main passes the hub one that asks the service instead, and nothing else changes.
 */
export interface SearchHistory {
  /** The recent searches, newest first. */
  list(): Promise<RecentSearch[]>
  /** Adds a search the person ran, and gives the list as it is now. */
  add(search: RecentSearch): Promise<RecentSearch[]>
}

/**
 * Recent searches in a file in the app's data, beside its other preferences, never in a project, so they aren't shared
 * or committed. Each change reads the file again first, so two copies of Parity sharing it keep each other's. A file
 * that can't be read starts the list again, and a search that doesn't read is left out, since a recent search is a
 * convenience, not something to keep at any cost.
 */
export function localHistory(file: string): SearchHistory {
  // One change at a time in this copy, so two searches ending together both stay.
  let writing: Promise<unknown> = Promise.resolve()

  const list = () => readItems(file, "searches", recentSearch)

  return {
    list,
    add(search) {
      const added = writing.then(async () => {
        const searches = remember(await list(), search)
        await writeJson(file, { searches })

        return searches
      })

      writing = added.catch(() => undefined)

      return added
    }
  }
}
