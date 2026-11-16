import type { CodeChange } from "@parity-app/core"

/**
 * The extensions of the stylesheets build tools compile (plain CSS, Sass, Less, Stylus and PostCSS), the one list
 * builder adapters and project discovery tell a stylesheet by.
 */
export const stylesheetExtensions = ["css", "scss", "sass", "less", "styl", "stylus", "pcss", "postcss", "sss"] as const

const stylesheetPath = new RegExp(String.raw`\.(?:${stylesheetExtensions.join("|")})$`)

/** Whether a path, with any query left off, names a stylesheet by its extension. */
export function isStylesheetFile(path: string): boolean {
  return stylesheetPath.test(path.split("?")[0]!)
}

/** What one changed file changed for the guest, as a builder works it out: see {@link CodeChange}. */
export interface StampedChange {
  /** The component files that import it, however deep, relative to the project root. */
  paths: string[]
  /** It's a stylesheet the guest's compiled CSS is made from, directly or through an `@import` (PAR-821). */
  styles: boolean
}

/**
 * Gathers the changes a burst of saves makes, as an editor writing a file more than once does, into one `CodeChange`
 * a moment after the last, with a stamp that always goes up. Any builder adapter reports its changes through it.
 */
export function gatherChanges(send: (change: CodeChange) => void, wait = 40) {
  const paths = new Set<string>()
  let styles = false
  let stamp = 0
  let timer: ReturnType<typeof setTimeout> | undefined

  return {
    /** The next stamp, later than any given before. */
    stamp: () => (stamp = Math.max(Date.now(), stamp + 1)),
    add(changed: StampedChange) {
      for (const path of changed.paths) {
        paths.add(path)
      }

      styles ||= changed.styles

      if (paths.size === 0 && !styles) {
        return
      }

      clearTimeout(timer)
      timer = setTimeout(() => {
        send(styles ? { paths: [...paths], stamp, styles } : { paths: [...paths], stamp })
        paths.clear()
        styles = false
      }, wait)
    },
    stop: () => clearTimeout(timer)
  }
}
