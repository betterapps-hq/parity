/*
 * What every Next.js builder's guest module ends with, once its bundler's runtime has given it the guest module: the
 * guest, made from what the guest module's `guestParts()` imports, with the guest app's stylesheets.
 */

/** The guest app's stylesheets, as a guest module passes them on. */
export interface GuestStylesheets {
  /** The project's global stylesheets, compiled. */
  styles: string[]
  /** Packages' global stylesheets, compiled. */
  packageStyles: string[]
}

/**
 * The end of a guest module's source, for a module that has the guest module as `guestModule`. It makes the guest
 * with the app's global stylesheets. What the bundler's runtime links into the page for the modules it imports (CSS
 * modules, fonts) reaches frames as everything a project's code adds to the page does, without styling the page.
 */
export function guestExportSource(stylesheets: GuestStylesheets): string {
  const json = (value: string | readonly string[]) => JSON.stringify(value)

  return `const { init, libraryCss, createGuest } = await guestModule.guestParts()
const text = (url) => fetch(url).then((response) => (response.ok ? response.text() : ""), () => "")
const joined = (urls) => Promise.all(urls.map(text)).then((texts) => texts.filter(Boolean).join("\\n"))
const [css, packageCss] = await Promise.all([
  joined(${json(stylesheets.styles)}),
  joined(${json(stylesheets.packageStyles)})
])

export default createGuest({
  ...init,
  // Tokens libraries only create at run time come first, so the project's own declarations still win.
  css: [libraryCss, css].filter(Boolean).join("\\n"),
  packageCss
})
`
}
