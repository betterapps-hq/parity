import { posix } from "node:path"
import type { CodeChange } from "@parity-app/core"

/** A module in Vite's graph, as a code change reads it: its file, and its id with any query, as `a.css?inline`. */
interface ChangeModule {
  file: string | null
  id?: string | null
}

/** What of Vite's module graph a code change uses, so it can be tried without a server. */
export interface ChangeGraph<Module extends ChangeModule> {
  getModulesByFile(file: string): Set<Module> | undefined
  invalidateModule(module: Module, seen: Set<Module>, timestamp: number, isHmr: boolean): void
}

/** What a changed file changed for the guest: the component files that import it, and whether its stylesheets did. */
export interface StampedChange {
  paths: string[]
  /** It's a stylesheet the guest's compiled CSS is made from, directly or through an `@import` (PAR-821). */
  styles: boolean
}

/** A stylesheet's file, by its extension, as Vite's CSS plugin reads them. */
const stylesheetFile = /\.(?:css|less|sass|scss|styl|stylus|pcss|postcss|sss)$/

/** A stylesheet imported as text, as the guest imports the project's global ones (`styles.css?inline`). */
const inlineStylesheet = /\.(?:css|less|sass|scss|styl|stylus|pcss|postcss|sss)\?(?:.*&)?inline(?:&|=|$)/

/**
 * Stamps a changed file's modules, and every module importing them, as Vite's HMR does (PAR-165), and gives the
 * component files among them, and whether it's one of the stylesheets the guest imports as text (PAR-821). Once stamped, Vite writes each import of them with `?t=<stamp>`, so a component imported
 * again at its own `?t=` address imports the changed code too, where it would otherwise get the copy the browser holds.
 * The guest has no HMR client, so nothing else is told; the canvas imports the components again itself.
 *
 * `file` and `root` are absolute paths as Vite normalizes them; `components` are the component files relative to the
 * root, as the project lists them.
 */
export function stampChange<Module extends ChangeModule>(
  graph: ChangeGraph<Module>,
  file: string,
  stamp: number,
  root: string,
  components: Iterable<string>
): StampedChange {
  const modules = graph.getModulesByFile(file)

  if (!modules?.size) {
    return { paths: [], styles: false }
  }

  const seen = new Set<Module>()

  for (const module of modules) {
    graph.invalidateModule(module, seen, stamp, true)
  }

  const touched = new Set<string>()

  for (const module of seen) {
    if (module.file) {
      touched.add(posix.relative(root, module.file))
    }
  }

  const styles = stylesheetFile.test(file) && [...seen].some((module) => inlineStylesheet.test(module.id ?? ""))
  const paths = [...new Set(components)].filter((path) => touched.has(path.replace(/^\.\//, "")))

  return { paths, styles }
}

/**
 * Gathers the changes a burst of saves makes, as an editor writing a file more than once does, into one `CodeChange`
 * a moment after the last, with a stamp that always goes up.
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
