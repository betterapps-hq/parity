import { writeFile } from "node:fs/promises"
import { join, posix, relative } from "node:path"
import { hasElementSources, tagElementSources } from "@parity-app/code"

/*
 * Tags each element the project's own JSX writes with its file, line and column (PAR-167), before the project's loaders
 * compile it, as Vite's `elementSources` plugin does. A bundler loads a loader from a file, and the builder's code is
 * bundled into Parity's own, so the builder writes a small loader into its output's folder that calls back into the
 * builder through a global: webpack and Rspack run JavaScript loaders in the process that made the compiler.
 */

const global = "__parityElementSources"

/** Tags a module's elements, by its file and code. */
type Tagger = (file: string, source: string) => ReturnType<typeof tagElementSources>

/** The loader file's source: it passes a module's code to the builder's tagger, keyed by its root, if one is set. */
export function elementSourcesLoaderSource(root: string): string {
  return `module.exports = function (source, map) {
  const tag = globalThis.${global}?.get(${JSON.stringify(root)})
  const tagged = tag ? tag(this.resourcePath, source) : undefined
  if (!tagged) return this.callback(null, source, map)
  this.callback(null, tagged.code, tagged.map)
}
`
}

/** A module's code with its elements tagged, when it's the project's own JSX, by its path from `root`. */
export function taggedSource(root: string, file: string, source: string): ReturnType<typeof tagElementSources> {
  const path = relative(root, file).replaceAll("\\", "/")

  if (path.startsWith("../") || posix.isAbsolute(path) || path.split("/").includes("node_modules")) {
    return undefined
  }

  return hasElementSources(file) ? tagElementSources(source, path) : undefined
}

/**
 * Writes the loader into `folder` and sets the tagger it calls for the project at `root`. Gives the loader's file, and
 * what takes the tagger away again.
 */
export async function writeElementSourcesLoader(folder: string, root: string): Promise<{ file: string; stop(): void }> {
  const file = join(folder, "element-sources-loader.cjs")
  await writeFile(file, elementSourcesLoaderSource(root))

  // SAFETY: the global is the builder's own, holding only the taggers this module sets.
  const holder = globalThis as typeof globalThis & { [global]?: Map<string, Tagger> }
  const taggers = (holder[global] ??= new Map<string, Tagger>())
  taggers.set(root, (path, source) => taggedSource(root, path, source))

  return {
    file,
    stop: () => {
      taggers.delete(root)
    }
  }
}

/**
 * Writes a loader for the renderer's guest module that puts the guest's address where its code reads its own
 * (`import.meta.url`), and gives the loader's file. A bundler writes the module's file path there as it builds, but
 * the guest finds the project's public files and components from where it was served, and the bundle runs as classic
 * scripts, where `import.meta` doesn't exist.
 */
export async function writeGuestAddressLoader(folder: string, address: string): Promise<string> {
  const file = join(folder, "guest-address-loader.cjs")
  const literal = JSON.stringify(JSON.stringify(address))
  await writeFile(
    file,
    `module.exports = (source) => source.replaceAll("import.meta.url", ${literal})
`
  )

  return file
}
