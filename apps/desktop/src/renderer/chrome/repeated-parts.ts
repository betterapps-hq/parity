import { findRepeats, type RepeatCandidate } from "@parity-app/core"
import { useSyncExternalStore } from "react"
import type { ContainerEntry } from "../design-store.ts"

// The repeated parts found in each screen, so Search actions can find them as the inspector's button does (PAR-180).
// They're kept by the project's folder and the screen's key, since every open project stays mounted and two copies of a
// project share their keys, and cleared when the screen's Repeated parts section closes, as its own state was.

const found = new Map<string, RepeatCandidate[]>()
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((listener) => listener())
const keyOf = (root: string, key: string) => `${root}\n${key}`

/** Finds the parts that repeat in a screen of the project at `root`, for its Repeated parts section to list. */
export function findRepeatedParts(root: string, entry: ContainerEntry): void {
  found.set(keyOf(root, entry.key), findRepeats(entry.container.root))
  notify()
}

/** Forgets a screen's repeated parts, so its section offers Find repeated parts again. */
export function clearRepeatedParts(root: string, key: string): void {
  if (found.delete(keyOf(root, key))) notify()
}

const holders = new Map<string, number>()

/**
 * Keeps a screen's repeated parts while its Repeated parts section shows, returning what lets them go. They're forgotten
 * once nothing's held them for a moment, so a section mounted again straight away, as React's StrictMode does, or as
 * Search actions opening the inspector does, keeps what was just found.
 */
export function holdRepeatedParts(root: string, key: string): () => void {
  const id = keyOf(root, key)
  holders.set(id, (holders.get(id) ?? 0) + 1)
  return () => {
    holders.set(id, (holders.get(id) ?? 1) - 1)
    setTimeout(() => {
      if ((holders.get(id) ?? 0) > 0) return
      holders.delete(id)
      if (found.delete(id)) notify()
    })
  }
}

/** The repeated parts found in a screen of the project at `root`, or undefined until they're looked for. */
export function useRepeatedParts(root: string, key: string): RepeatCandidate[] | undefined {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => found.get(keyOf(root, key))
  )
}
