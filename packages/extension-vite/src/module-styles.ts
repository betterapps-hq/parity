import type * as Vite from "vite"

/** The guest's collector of the stylesheets the project's modules import (`GuestInit.moduleStyles`). */
export const moduleStylesId = "virtual:canvas/module-styles"

/** How Vite's served stylesheet module imports the client functions that add it to the page and take it away. */
const clientStyleImport =
  /(\bimport\s*\{\s*updateStyle as __vite__updateStyle,\s*removeStyle as __vite__removeStyle\s*\}\s*from\s*)(["'])[^"'\n]*\/@vite\/client\2/

/**
 * Keeps the stylesheets the project's modules import out of Parity's page (PAR-1181). Vite serves an imported
 * stylesheet as a module that adds a `<style>` to the page's head with its client's `updateStyle`, and the canvas imports
 * the guest into Parity's own window, so a module that imports the app's stylesheet, as Copacker's root route does,
 * restyled Parity's panels. Each such module calls the guest's collector instead, which the canvas draws frames with.
 * `globalStylesheets` gives the files the guest already imports as text, which the collector leaves out.
 */
export function moduleStyles(globalStylesheets: () => string[]): Vite.Plugin[] {
  const resolved = `\0${moduleStylesId}`

  return [
    {
      name: "canvas:module-styles",
      enforce: "pre",
      resolveId: (id) => (id === moduleStylesId ? resolved : undefined),
      load: (id) => (id === resolved ? moduleStylesSource(globalStylesheets()) : undefined)
    },
    {
      // After Vite's own CSS plugin, which writes the module that calls `updateStyle`.
      name: "canvas:module-styles-imports",
      enforce: "post",
      apply: "serve",
      transform(code) {
        const collected = collectedStyleModule(code)

        return collected === undefined ? undefined : { code: collected, map: null }
      }
    }
  ]
}

/** A served stylesheet module's code with `updateStyle` and `removeStyle` from the guest's collector, if it has them. */
export function collectedStyleModule(code: string): string | undefined {
  if (!code.includes("__vite__updateStyle")) {
    return undefined
  }

  const collected = code.replace(clientStyleImport, `$1${JSON.stringify(moduleStylesId)}`)

  return collected === code ? undefined : collected
}

/**
 * The collector's source: `updateStyle` and `removeStyle` as Vite's client has them, keeping each stylesheet's CSS by its
 * module id instead of in the page, and `moduleStyles`, what the guest gives the canvas. `globalStylesheets` are absolute
 * paths with forward slashes, as Vite's ids are, compared without case, since Windows paths don't have one.
 */
export function moduleStylesSource(globalStylesheets: readonly string[]): string {
  return `const global = new Set(${JSON.stringify(globalStylesheets.map((path) => path.toLowerCase()))})
const sheets = new Map()
const listeners = new Set()

function changed() {
  for (const listener of listeners) {
    listener()
  }
}

export function updateStyle(id, css) {
  if (global.has(id.split("?")[0].toLowerCase()) || sheets.get(id) === css) {
    return
  }

  sheets.set(id, css)
  changed()
}

export function removeStyle(id) {
  if (sheets.delete(id)) {
    changed()
  }
}

export const moduleStyles = {
  sheets: () => [...sheets.values()],
  subscribe(listener) {
    listeners.add(listener)

    return () => listeners.delete(listener)
  }
}
`
}
