import type { ConnectorInfo, Found, Searched } from "@parity-app/connectors"
import { useSyncExternalStore } from "react"

/*
 * Which library the browser is open on, if any (PAR-839). The browser is one dialog for every library, mounted once in
 * the window, so whatever opens it says where to search and what picking does: the Media tab adds pictures to the
 * project, and Find references will place screens beside a design.
 */

/** What picking results does, as whatever opened the browser says. */
export interface PickAction {
  /** The button that takes what's picked, for this many: "Add 3 to project". */
  label: (count: number) => string
  /** Whether a result can be picked here: a photo can go into the project, and a screen can't. */
  accepts: (found: Found) => boolean
  /** Takes what's picked, in the order it was picked. The browser closes first. */
  take: (picked: readonly Found[]) => void
}

export interface BrowserOpening {
  /** The library to search. */
  library: ConnectorInfo
  /** A search to run as it opens, as one that found nothing in the Media tab carries over. */
  search?: Searched
  pick: PickAction
}

let opening: BrowserOpening | undefined
const listeners = new Set<() => void>()

function set(next: BrowserOpening | undefined): void {
  opening = next

  for (const listener of listeners) {
    listener()
  }
}

/** Opens the browser on a library. */
export function openLibraryBrowser(next: BrowserOpening): void {
  set(next)
}

/** Closes the browser, keeping nothing it showed. */
export function closeLibraryBrowser(): void {
  set(undefined)
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)

  return () => listeners.delete(listener)
}

/** Where the browser is open, following each opening and close. */
export function useLibraryBrowser(): BrowserOpening | undefined {
  return useSyncExternalStore(subscribe, () => opening)
}
