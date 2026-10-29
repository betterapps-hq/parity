import { useSyncExternalStore } from "react"
import { getPreferences, subscribePreferences } from "./chrome/preferences.ts"

export type ResolvedTheme = "light" | "dark"

const systemDark = window.matchMedia("(prefers-color-scheme: dark)")
const listeners = new Set<() => void>()
let resolved = resolve()

function resolve(): ResolvedTheme {
  const { theme } = getPreferences()
  if (theme !== "system") return theme
  return systemDark.matches ? "dark" : "light"
}

function apply(): void {
  resolved = resolve()
  document.documentElement.classList.toggle("dark", resolved === "dark")
  for (const listener of listeners) listener()
}

/**
 * Keeps the app's chrome in the theme from File > Preferences: light, dark, or the system's, following it as it
 * changes. Designs aren't affected; their modes choose their theme. The window's own title bar buttons follow too.
 */
export function startTheme(): void {
  apply()
  void window.canvasHost.setTheme(getPreferences().theme)
  let last = getPreferences().theme
  subscribePreferences(() => {
    const { theme } = getPreferences()
    if (theme === last) return
    last = theme
    apply()
    void window.canvasHost.setTheme(theme)
  })
  systemDark.addEventListener("change", apply)
}

export function getResolvedTheme(): ResolvedTheme {
  return resolved
}

export function useResolvedTheme(): ResolvedTheme {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => resolved
  )
}
