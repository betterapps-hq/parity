import { posix } from "node:path"
import { isStylesheetFile, type StampedChange, stylesheetExtensions } from "@parity-app/project"

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

/**
 * A stylesheet imported as text, Vite's `?inline` query, as the guest imports the project's global ones
 * (`styles.css?inline`).
 */
const inlineStylesheet = new RegExp(String.raw`\.(?:${stylesheetExtensions.join("|")})\?(?:.*&)?inline(?:&|=|$)`)

/**
 * Stamps a changed file's modules, and every module importing them, as Vite's HMR does (PAR-165), and gives the
 * component files among them, and whether it's one of the stylesheets the guest imports as text (PAR-821). Once
 * stamped, Vite writes each import of them with `?t=<stamp>`, so a component imported again at its own `?t=` address
 * imports the changed code too, where it would otherwise get the copy the browser holds.
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

  const styles = isStylesheetFile(file) && [...seen].some((module) => inlineStylesheet.test(module.id ?? ""))
  const paths = [...new Set(components)].filter((path) => touched.has(path.replace(/^\.\//, "")))

  return { paths, styles }
}
