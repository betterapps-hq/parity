import { useSyncExternalStore } from "react"

/** How the app looks and behaves, set from the File and View menus. Shared by every tab, and remembered between runs. */
export interface Preferences {
  /** The app's own theme. Designs show whichever theme their mode picks. */
  theme: ThemePreference
  /** Designs lock to the edges and centers of the designs around them while dragged. */
  snapping: boolean
  /** How many pixels each CSS pixel becomes in exported images. */
  exportScale: 1 | 2 | 3
  /** Column grids over every frame, sized for its viewport. */
  layoutGrid: boolean
  /** Each change saves itself a moment after it's made, instead of waiting for Save. */
  autosave: boolean
  /** Frame rate, memory and CPU in the status bar, for spotting what slows the app down. */
  performanceStats: boolean
}

export type ThemePreference = "light" | "dark" | "system"

const storageKey = "parity.preferences"
const defaults: Preferences = {
  theme: "dark",
  snapping: true,
  exportScale: 2,
  layoutGrid: false,
  autosave: false,
  performanceStats: false
}

let preferences = load()
const listeners = new Set<() => void>()

function load(): Preferences {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? "{}") as Partial<Preferences>
    return { ...defaults, ...saved }
  } catch {
    return defaults
  }
}

export function getPreferences(): Preferences {
  return preferences
}

export function setPreferences(change: Partial<Preferences>): void {
  preferences = { ...preferences, ...change }
  try {
    localStorage.setItem(storageKey, JSON.stringify(preferences))
  } catch {
    // Storage can be unavailable; the preference then just isn't remembered.
  }
  for (const listener of listeners) listener()
}

export function subscribePreferences(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function usePreferences(): Preferences {
  return useSyncExternalStore(subscribePreferences, () => preferences)
}
