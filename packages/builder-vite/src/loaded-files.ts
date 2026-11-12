import { posix } from "node:path"

/** A module in Vite's graph, as `loadedFiles` reads it: its file, and the imports the browser fetches as it loads it. */
export interface LoadedModule {
  file: string | null
  /**
   * The imports Vite's import analysis found in the module's code. Vite has set this since 5.1 without declaring it.
   * `importedModules` is wider: it adds every file a plugin watches, such as each one Tailwind scans for class names,
   * which would make every frame depend on every file.
   */
  staticImportedUrls?: ReadonlySet<string>
}

/** What of Vite's module graph `loadedFiles` reads, so it can be tried without a server. */
export interface LoadedGraph<Module extends LoadedModule> {
  getModulesByFile(file: string): Set<Module> | undefined
  getModuleByUrl(url: string): Promise<Module | undefined>
}

/**
 * The project files the modules of `files` load, themselves included, however deep, as Vite resolved their imports
 * (PAR-994): relative to `root`, with forward slashes, and sorted. Packages are left out, since the lockfile stands for
 * them. Nothing when one of `files` has no module in the graph yet, since Vite hasn't built it and can't say what it
 * loads. `root` and the graph's files are absolute paths as Vite normalizes them.
 */
export async function loadedFiles<Module extends LoadedModule>(
  graph: LoadedGraph<Module>,
  root: string,
  files: readonly string[]
): Promise<string[] | undefined> {
  const seen = new Set<Module>()
  const queue: Module[] = []

  for (const file of files) {
    const modules = graph.getModulesByFile(posix.join(root, file))

    if (!modules?.size) {
      return undefined
    }

    queue.push(...modules)
  }

  const found = new Set<string>()

  for (let index = 0; index < queue.length; index++) {
    const module = queue[index]!

    if (seen.has(module)) {
      continue
    }

    seen.add(module)
    const path = module.file && posix.relative(root, module.file)

    if (path && !path.startsWith("../") && !posix.isAbsolute(path) && !path.split("/").includes("node_modules")) {
      found.add(path)
    }

    for (const url of module.staticImportedUrls ?? []) {
      const imported = await graph.getModuleByUrl(url)

      if (imported && !seen.has(imported)) {
        queue.push(imported)
      }
    }
  }

  return [...found].sort((a, b) => a.localeCompare(b, "en"))
}
