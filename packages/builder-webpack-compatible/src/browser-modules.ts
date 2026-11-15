/*
 * The ES modules the builder's server writes for the page, beside the bundle it serves. The canvas imports a guest by
 * URL and a changed component at `/<path>?t=<stamp>` (`BuilderSession`), as it does from Vite; these are what it gets
 * there. The bundle itself is classic scripts, whose chunk loading and hot updates webpack and Rspack have shipped for
 * years, loaded once per page.
 */

/** The files the guest's bundle is written as, beside each other in its output folder. */
export const guestFiles = {
  runtime: "runtime.js",
  main: "main.js",
  /** The project's global stylesheets, compiled: read for tokens. */
  styles: "styles.css",
  /** Packages' global stylesheets, compiled. */
  packageStyles: "package-styles.css",
  /**
   * What the guest's modules import themselves, such as a component's own stylesheet: the CSS of every chunk but the
   * global stylesheets', the components' chunks included, which the builder gathers into one file after each build.
   */
  componentStyles: "component-styles.css"
} as const

/**
 * The guest module: it loads the bundle into the page, if it hasn't been, and makes the guest from what its entry
 * registered under `key`, from its modules and CSS as the latest build wrote them, the CSS fetched as text. Each address of it makes a guest of its
 * own, so the canvas loading it with a new `?styles=` gets the stylesheets as they are now, over the same bundle.
 */
export function guestModuleSource(key: string): string {
  const name = JSON.stringify(key)

  return `const load = (file) => new Promise((resolve, reject) => {
  const script = document.createElement("script")
  script.src = new URL(file, import.meta.url).href
  script.crossOrigin = "anonymous"
  script.onload = () => resolve()
  script.onerror = () => reject(new Error(\`\${script.src} didn't load\`))
  document.head.append(script)
})
// One bundle per page, whichever guest address loads it first.
globalThis.__parityBundles ??= {}
globalThis.__parityBundles[${name}] ??= load(${JSON.stringify(guestFiles.runtime)}).then(() => load(${JSON.stringify(guestFiles.main)})).then(() => globalThis[${name}])
await globalThis.__parityBundles[${name}]
const { init, libraryCss, createGuest } = await globalThis.__parityGuests[${name}].parts()
const text = (file) => fetch(new URL(file, import.meta.url)).then((response) => (response.ok ? response.text() : ""))
const [css, packageCss, componentCss] = await Promise.all([${[guestFiles.styles, guestFiles.packageStyles, guestFiles.componentStyles].map((file) => `text(${JSON.stringify(file)})`).join(", ")}])
export default createGuest({
  ...init,
  // Tokens libraries only create at run time come first, so the project's own declarations still win.
  css: [libraryCss, css].filter(Boolean).join("\\n"),
  packageCss: [packageCss, componentCss].filter(Boolean).join("\\n")
})
`
}

/**
 * A changed component's module: it has the page apply the hot update the latest build wrote, then gives the component
 * module's exports afresh, by the names it exports.
 */
export function componentModuleSource(key: string, path: string, names: readonly string[]): string {
  const exported = [...new Set(names)]

  const lines = exported.map((name, index) =>
    name === "default"
      ? `export default module.default`
      : `const export${index} = module[${JSON.stringify(name)}]\nexport { export${index} as ${JSON.stringify(name)} }`
  )

  return [
    `const module = await globalThis.__parityGuests[${JSON.stringify(key)}].load(${JSON.stringify(path)})`,
    ...lines,
    ""
  ].join("\n")
}
