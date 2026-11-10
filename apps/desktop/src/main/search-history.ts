import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import { type RecentSearch, recentSearch, remember } from "@parity-app/connectors"
import { z } from "zod"

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

const historyFile = z.object({ searches: z.array(z.unknown()) })

/**
 * Recent searches in a file in the app's data, beside its other preferences, never in a project, so they aren't shared
 * or committed. A file that can't be read starts the list again, and a search that doesn't read is left out, since a
 * recent search is a convenience, not something to keep at any cost. Each write replaces the file whole.
 */
export function localHistory(file: string): SearchHistory {
  let kept: Promise<RecentSearch[]> | undefined
  // One change at a time, so two searches ending together both stay.
  let writing: Promise<unknown> = Promise.resolve()

  const read = async (): Promise<RecentSearch[]> => {
    try {
      const parsed = historyFile.safeParse(JSON.parse(await readFile(file, "utf8")))

      return parsed.success ? parsed.data.searches.flatMap((each) => recentSearch.safeParse(each).data ?? []) : []
    } catch {
      return []
    }
  }

  const list = () => (kept ??= read())

  return {
    list,
    add(search) {
      const added = writing.then(async () => {
        const searches = remember(await list(), search)
        kept = Promise.resolve(searches)
        await mkdir(dirname(file), { recursive: true })
        await writeFile(`${file}.tmp`, JSON.stringify({ searches }))
        await rename(`${file}.tmp`, file)

        return searches
      })

      writing = added.catch(() => undefined)

      return added
    }
  }
}
