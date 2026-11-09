import { type CodeEditorChoice, jsonText } from "@parity-app/core"
import { defaultExportSizes, type ExportSize } from "@parity-app/editor"
import { useSyncExternalStore } from "react"
import { z } from "zod"
import { recordInterface } from "../interface-events.ts"

const storageKey = "parity.preferences"

/**
 * How the app looks and behaves, set from the File and View menus. Shared by every tab, and remembered between runs.
 * A saved value that doesn't read, as from an older version, falls back to its default without resetting the rest.
 */
const savedPreferences = z.object({
  /** The app's own theme. Designs show whichever theme their mode picks. */
  theme: z.enum(["light", "dark", "system"]).catch("dark"),
  /** Designs lock to the edges and centers of the designs around them while dragged. */
  snapping: z.boolean().catch(true),
  /** How many pixels each CSS pixel becomes in exported images. */
  exportScale: z.union([z.literal(1), z.literal(2), z.literal(3)]).catch(2),
  /** The sizes the Export section writes each layer at: PNGs or JPGs, at 1x to 3x (PAR-185). */
  exportSizes: z
    .array(z.object({ format: z.enum(["png", "jpg"]), scale: z.union([z.literal(1), z.literal(2), z.literal(3)]) }))
    .min(1)
    .catch([...defaultExportSizes]) satisfies z.ZodType<ExportSize[]>,
  /** How the Components tab shows components: names only, a list with a picture each, or a grid (PAR-208). */
  componentsView: z.enum(["names", "list", "grid"]).catch("list"),
  /** Column grids over every frame, sized for its viewport. */
  layoutGrid: z.boolean().catch(false),
  /** Each change saves itself a moment after it's made, instead of waiting for Save. */
  autosave: z.boolean().catch(false),
  /** Frame rate, memory and CPU in the status bar, for spotting what slows the app down. */
  performanceStats: z.boolean().catch(false),
  /** The editor View code opens a component's file in: one, the first installed, or the system's default app. */
  codeEditor: z
    .enum(["vscode", "cursor", "windsurf", "zed", "auto", "system"])
    .catch("auto") satisfies z.ZodType<CodeEditorChoice>
})

export type Preferences = z.infer<typeof savedPreferences>

export type ThemePreference = Preferences["theme"]

/** The preferences saved as `text`, each one that's missing or doesn't read at its default. */
export function readPreferences(text: string | null): Preferences {
  return jsonText(savedPreferences)
    .catch(() => savedPreferences.parse({}))
    .parse(text ?? "{}")
}

let preferences = load()
const listeners = new Set<() => void>()

function load(): Preferences {
  try {
    return readPreferences(localStorage.getItem(storageKey))
  } catch {
    // Storage can be unavailable; the defaults then apply.
    return readPreferences(null)
  }
}

export function getPreferences(): Preferences {
  return preferences
}

export function setPreferences(change: Partial<Preferences>): void {
  for (const [setting, value] of Object.entries(change)) {
    if (value === undefined || JSON.stringify(value) === JSON.stringify(preferences[setting as keyof Preferences])) {
      continue
    }

    recordInterface("setting.changed", { setting, value: typeof value === "object" ? JSON.stringify(value) : value })
  }

  preferences = { ...preferences, ...change }

  try {
    localStorage.setItem(storageKey, JSON.stringify(preferences))
  } catch {
    // Storage can be unavailable; the preference then just isn't remembered.
  }

  for (const listener of listeners) {
    listener()
  }
}

export function subscribePreferences(listener: () => void): () => void {
  listeners.add(listener)

  return () => listeners.delete(listener)
}

export function usePreferences(): Preferences {
  return useSyncExternalStore(subscribePreferences, () => preferences)
}
