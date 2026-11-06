import { posix } from "node:path"
import type { CodeChange } from "@parity-app/core"

/** What of Vite's module graph a code change uses, so it can be tried without a server. */
export interface ChangeGraph<Module extends { file: string | null }> {
  getModulesByFile(file: string): Set<Module> | undefined
  invalidateModule(module: Module, seen: Set<Module>, timestamp: number, isHmr: boolean): void
}

/**
 * Stamps a changed file's modules, and every module importing them, as Vite's HMR does (PAR-165), and gives the
 * component files among them. Once stamped, Vite writes each import of them with `?t=<stamp>`, so a component imported
 * again at its own `?t=` address imports the changed code too, where it would otherwise get the copy the browser holds.
 * The guest has no HMR client, so nothing else is told; the canvas imports the components again itself.
 *
 * `file` and `root` are absolute paths as Vite normalizes them; `components` are the component files relative to the
 * root, as the project lists them.
 */
export function stampChange<Module extends { file: string | null }>(
  graph: ChangeGraph<Module>,
  file: string,
  stamp: number,
  root: string,
  components: Iterable<string>
): string[] {
  const modules = graph.getModulesByFile(file)
  if (!modules?.size) return []
  const seen = new Set<Module>()
  for (const module of modules) graph.invalidateModule(module, seen, stamp, true)
  const touched = new Set<string>()
  for (const module of seen) if (module.file) touched.add(posix.relative(root, module.file))
  return [...new Set(components)].filter((path) => touched.has(path.replace(/^\.\//, "")))
}

/**
 * Gathers the changes a burst of saves makes, as an editor writing a file more than once does, into one `CodeChange`
 * a moment after the last, with a stamp that always goes up.
 */
export function gatherChanges(send: (change: CodeChange) => void, wait = 40) {
  const paths = new Set<string>()
  let stamp = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  return {
    /** The next stamp, later than any given before. */
    stamp: () => (stamp = Math.max(Date.now(), stamp + 1)),
    add(changed: string[]) {
      for (const path of changed) paths.add(path)
      if (paths.size === 0) return
      clearTimeout(timer)
      timer = setTimeout(() => {
        send({ paths: [...paths], stamp })
        paths.clear()
      }, wait)
    },
    stop: () => clearTimeout(timer)
  }
}
