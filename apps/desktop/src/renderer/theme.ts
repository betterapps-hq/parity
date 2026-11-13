import { getPreferences, subscribePreferences } from "./chrome/preferences.ts"
import { createStore, useStore } from "./store.ts"

export type ResolvedTheme = "light" | "dark"

const systemDark = window.matchMedia("(prefers-color-scheme: dark)")

/** Not a `windowStore`: it follows the preferences, which put it back themselves. */
const resolved = createStore(resolve)

function resolve(): ResolvedTheme {
  const { theme } = getPreferences()

  if (theme !== "system") {
    return theme
  }

  return systemDark.matches ? "dark" : "light"
}

function apply(): void {
  const next = resolve()
  document.documentElement.classList.toggle("dark", next === "dark")
  resolved.set(next)
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

    if (theme === last) {
      return
    }

    last = theme
    apply()
    void window.canvasHost.setTheme(theme)
  })
  systemDark.addEventListener("change", apply)
}

export function getResolvedTheme(): ResolvedTheme {
  return resolved.get()
}

/** Calls `listener` whenever the app's light or dark theme changes, until the function it gives is called. */
export const subscribeResolvedTheme = resolved.subscribe

export function useResolvedTheme(): ResolvedTheme {
  return useStore(resolved)
}
