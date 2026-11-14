import type * as Vite from "vite"

/**
 * What the app's own page runs first when it draws a page on the canvas (PAR-1076): the mode its frame draws in, which
 * the frame names itself with (`parity:` and the mode as JSON), so the app's URL stays its own. It puts the mode's
 * classes and attributes on `<html>`, as a design's frame has them on its body, and answers `prefers-color-scheme` with
 * the mode's scheme, so an app that follows the system's theme, as shadcn's theme provider does, follows the mode's.
 * It also tells the canvas how tall the page is, posting `{ parity: "page-height", height }` to the frame's parent
 * whenever the document's height changes while the frame is still as tall as its screen, so the frame draws the whole
 * page, with no scrollbar once it's grown. Opened anywhere else, it does nothing.
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
  let told = 0
  const screen = window.innerHeight
  const tell = () => {
    // Measured only at the screen's height: once the frame grows to the page, whatever is sized to the window grows
    // with it, so a page with a section as tall as the window would grow without end.
    if (window.innerHeight !== screen) return
    const height = Math.ceil(root.scrollHeight)
    if (height === told) return
    told = height
    window.parent.postMessage({ parity: "page-height", height }, "*")
  }
  const sizes = new ResizeObserver(tell)
  sizes.observe(root)
  document.addEventListener("DOMContentLoaded", () => {
    sizes.observe(document.body)
    for (const child of document.body.children) sizes.observe(child)
  })
  window.addEventListener("load", tell)
  // Grown to the page, the frame shows all of it, and what's sized to the window still runs past by as much as the
  // frame grew, so it isn't given a scrollbar.
  window.addEventListener("resize", () => {
    root.style.scrollbarWidth = window.innerHeight > screen ? "none" : ""
  })
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
