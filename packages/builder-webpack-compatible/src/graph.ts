import { posix } from "node:path"
import type { BundlerCompilation, BundlerModule } from "./bundler.ts"

/*
 * What a build's module graph says about the project's files: which components a change reaches, what a component's
 * module loads, and what it exports. Paths in are relative to the root or absolute; the graph's are absolute.
 */

/** A path with forward slashes and no query, as files are compared. */
export function filePath(path: string): string {
  return path.split("?")[0]!.replaceAll("\\", "/")
}

/** The build's modules by their file, absolute, with forward slashes. */
export function modulesByFile(compilation: BundlerCompilation): Map<string, BundlerModule[]> {
  const byFile = new Map<string, BundlerModule[]>()

  for (const module of compilation.modules) {
    if (!module.resource) {
      continue
    }

    const file = filePath(module.resource)
    byFile.set(file, [...(byFile.get(file) ?? []), module])
  }

  return byFile
}

/** Whether a file is one of the project's own, not a package's. */
function ownFile(root: string, file: string): boolean {
  const path = posix.relative(root, file)

  return !path.startsWith("../") && !posix.isAbsolute(path) && !path.split("/").includes("node_modules")
}

/**
 * The component files among `components` (relative to the root) that the changed `files` (absolute) reach: a changed
 * file itself, and every module importing it, however deep. Static and dynamic imports both count, since either way the
 * component draws with the changed code.
 */
export function changedComponents(
  compilation: BundlerCompilation,
  root: string,
  files: Iterable<string>,
  components: Iterable<string>
): string[] {
  const byFile = modulesByFile(compilation)
  const seen = new Set<BundlerModule>()
  const queue = [...files].flatMap((file) => byFile.get(filePath(file)) ?? [])
  const touched = new Set<string>()

  for (let index = 0; index < queue.length; index++) {
    const module = queue[index]!

    if (seen.has(module)) {
      continue
    }

    seen.add(module)

    if (module.resource) {
      touched.add(posix.relative(root, filePath(module.resource)))
    }

    for (const connection of compilation.moduleGraph.getIncomingConnections(module)) {
      if (connection.originModule && !seen.has(connection.originModule)) {
        queue.push(connection.originModule)
      }
    }
  }

  return [...new Set(components)].filter((path) => touched.has(path.replace(/^\.\//, "")))
}

/**
 * The project files the modules of `files` (relative to the root) load, themselves included, however deep, as the
 * bundler resolved their imports: relative to the root, with forward slashes, and sorted. Packages are left out, since
 * the lockfile stands for them. Nothing when one of `files` has no module in the build.
 */
export function loadedFiles(
  compilation: BundlerCompilation,
  root: string,
  files: readonly string[]
): string[] | undefined {
  const byFile = modulesByFile(compilation)
  const queue: BundlerModule[] = []

  for (const file of files) {
    const modules = byFile.get(posix.join(root, file))

    if (!modules?.length) {
      return undefined
    }

    queue.push(...modules)
  }

  const seen = new Set<BundlerModule>()
  const found = new Set<string>()

  for (let index = 0; index < queue.length; index++) {
    const module = queue[index]!

    if (seen.has(module)) {
      continue
    }

    seen.add(module)
    const file = module.resource && filePath(module.resource)

    if (file && ownFile(root, file)) {
      found.add(posix.relative(root, file))
    }

    for (const connection of compilation.moduleGraph.getOutgoingConnections(module)) {
      if (connection.module && !seen.has(connection.module)) {
        queue.push(connection.module)
      }
    }
  }

  return [...found].sort((a, b) => a.localeCompare(b, "en"))
}

/** The names a file's module exports, as the bundler read them, or nothing when it can't tell or hasn't built it. */
export function providedExports(compilation: BundlerCompilation, file: string): string[] | undefined {
  for (const module of modulesByFile(compilation).get(filePath(file)) ?? []) {
    const names = compilation.moduleGraph.getProvidedExports(module)

    if (Array.isArray(names)) {
      return names
    }
  }

  return undefined
}
