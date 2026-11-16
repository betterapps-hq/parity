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
  /** What the guest app's stylesheets start with: a stylesheet the runtime links that starts so is the guest's. */
  stylesheetBase: string
}

/**
 * The end of a guest module's source, for a module that has the guest module as `guestModule`. It makes the guest
 * and passes on, as packages' CSS, the stylesheets the bundler's runtime linked into the page for the modules it
 * imports (CSS modules, fonts), which it mutes in the page, so they don't style the page itself.
 */
export function guestExportSource(stylesheets: GuestStylesheets): string {
  const json = (value: string | readonly string[]) => JSON.stringify(value)

  return `const { init, libraryCss, createGuest } = await guestModule.guestParts()
const ours = (link) => link.href.startsWith(${json(stylesheets.stylesheetBase)})
// Kept in the page, as the runtime waits for them to load before a module that imports one runs, but styling nothing.
const mute = (link) => link.setAttribute("media", "not all")
const linked = [...document.querySelectorAll('link[rel="stylesheet"]')].filter(ours)
linked.forEach(mute)

// What modules loaded later link, as a lazy component's CSS module does, is muted too.
new MutationObserver((records) => {
  for (const node of records.flatMap((record) => [...record.addedNodes])) {
    if (node instanceof HTMLLinkElement && node.rel === "stylesheet" && ours(node)) {
      mute(node)
    }
  }
}).observe(document.head, { childList: true })
const text = (url) => fetch(url).then((response) => (response.ok ? response.text() : ""), () => "")
const joined = (urls) => Promise.all(urls.map(text)).then((texts) => texts.filter(Boolean).join("\\n"))
const [css, packageCss, componentCss] = await Promise.all([
  joined(${json(stylesheets.styles)}),
  joined(${json(stylesheets.packageStyles)}),
  joined(linked.map((link) => link.href))
])

export default createGuest({
  ...init,
  // Tokens libraries only create at run time come first, so the project's own declarations still win.
  css: [libraryCss, css].filter(Boolean).join("\\n"),
  packageCss: [packageCss, componentCss].filter(Boolean).join("\\n")
})
`
}
