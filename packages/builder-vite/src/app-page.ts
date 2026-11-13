import type * as Vite from "vite"

/**
 * What the app's own page runs first when it draws a page on the canvas (PAR-1076): the mode its frame draws in, which
 * the frame names itself with (`parity:` and the mode as JSON), so the app's URL stays its own. It puts the mode's
 * classes and attributes on `<html>`, as a design's frame has them on its body, and answers `prefers-color-scheme` with
 * the mode's scheme, so an app that follows the system's theme, as shadcn's theme provider does, follows the mode's.
 * Opened anywhere else, it does nothing.
 */
export const appPageModeScript = `(() => {
  if (!window.name.startsWith("parity:")) return
  let mode
  try {
    mode = JSON.parse(window.name.slice(7))
  } catch {
    return
  }
  const root = document.documentElement
  for (const name of mode.classes ?? []) root.classList.add(name)
  for (const [name, value] of Object.entries(mode.attributes ?? {})) root.setAttribute(name, value)
  if (mode.scheme !== "dark" && mode.scheme !== "light") return
  root.style.colorScheme = mode.scheme
  const matchMedia = window.matchMedia.bind(window)
  window.matchMedia = (query) => {
    const asked = /prefers-color-scheme:\\s*(dark|light)/.exec(query)
    if (!asked) return matchMedia(query)
    const list = new EventTarget()
    return Object.assign(list, {
      matches: asked[1] === mode.scheme,
      media: query,
      onchange: null,
      addListener() {},
      removeListener() {}
    })
  }
})()`

/**
 * Puts `appPageModeScript` first in the app's own page, served by the guest's development server alone, before any of
 * the app's own scripts run.
 */
export function appPageModes(): Vite.Plugin {
  return {
    name: "canvas:app-page-modes",
    apply: "serve",
    transformIndexHtml: () => [{ tag: "script", children: appPageModeScript, injectTo: "head-prepend" }]
  }
}
