import { findRepeats, type RepeatCandidate } from "@parity-app/core"
import { useSyncExternalStore } from "react"
import type { ContainerEntry } from "../design-store.ts"

// The repeated parts found in each screen, by its key, so Search actions can find them as the inspector's button does
// (PAR-180). They're cleared when the screen's Repeated parts section closes, as its own state was.

const found = new Map<string, RepeatCandidate[]>()
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((listener) => listener())

/** Finds the parts that repeat in a screen, for its Repeated parts section to list. */
export function findRepeatedParts(entry: ContainerEntry): void {
  found.set(entry.key, findRepeats(entry.container.root))
  notify()
}

/** Forgets a screen's repeated parts, so its section offers Find repeated parts again. */
export function clearRepeatedParts(key: string): void {
  if (found.delete(key)) notify()
}

/** The repeated parts found in a screen, or undefined until they're looked for. */
export function useRepeatedParts(key: string): RepeatCandidate[] | undefined {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => found.get(key)
  )
}
