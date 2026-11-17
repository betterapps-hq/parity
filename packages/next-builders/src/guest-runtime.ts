import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { basename, dirname, join, posix, resolve } from "node:path"
import { valueImports } from "./app-styles.ts"

/*
 * The renderer's guest runtime, copied into the guest app. Next's bundlers compile nothing outside the project's root,
 * and the runtime is Parity's: a single bundled file in a packaged app, its source with Parity's own imports in
 * development. The copy follows the runtime's relative imports and Parity's own packages, and leaves the rest, React
 * among them, for the project to resolve, so the runtime draws with the project's React.
 */

/** The folder the runtime is copied to, from the guest app's folder. */
export const runtimeFolder = "renderer"

/**
 * Copies the runtime at `entry` into `guestApp`, and returns where its entry is, from the guest app's folder. The runtime
 * reads `import.meta.url` for where the project is served, which the copy is given as `served`: Next's bundlers would
 * take `new URL(path, import.meta.url)` for a file to bundle.
 */
export async function copyGuestRuntime(entry: string, guestApp: string, served: string): Promise<string> {
  const [copied] = await copyParityModules([entry], guestApp, served, runtimeFolder)

  return copied ?? posix.join(runtimeFolder, basename(entry))
}

/**
 * Copies modules of Parity's at `entries`, with their relative imports and Parity's own packages, into `into` in
 * `guestApp`, which is emptied first, and returns where each entry is, from the guest app's folder, in order.
 */
export async function copyParityModules(
  entries: readonly string[],
  guestApp: string,
  served: string,
  into: string
): Promise<string[]> {
  const folder = join(guestApp, into)
  await rm(folder, { recursive: true, force: true })
  await mkdir(folder, { recursive: true })

  const names = new Map<string, string>()

  const nameOf = (file: string) => {
    let name = names.get(file)

    if (!name) {
      name = `${names.size}-${basename(file)}`
      names.set(file, name)
    }

    return name
  }

  const queue = entries.map((entry) => resolve(entry))

  for (const file of queue) {
    nameOf(file)
  }

  const done = new Set<string>()

  while (queue.length > 0) {
    const file = queue.shift()!

    if (done.has(file)) {
      continue
    }

    done.add(file)
    let source = await readFile(file, "utf8")

    for (const specifier of new Set(valueImports(source))) {
      const target = await runtimeImport(specifier, file)

      if (!target) {
        continue
      }

      queue.push(target)
      source = replaceSpecifier(source, specifier, `./${nameOf(target)}`)
    }

    await writeFile(join(folder, nameOf(file)), source.replaceAll("import.meta.url", JSON.stringify(served)))
  }

  return entries.map((entry) => posix.join(into, nameOf(resolve(entry))))
}

/** The file one of the runtime's imports leads to, when it's the runtime's own: relative, or a Parity package's. */
async function runtimeImport(specifier: string, importer: string): Promise<string | undefined> {
  if (specifier.startsWith(".")) {
    const path = resolve(dirname(importer), specifier)

    for (const candidate of [path, `${path}.ts`, `${path}.tsx`, `${path}.js`, `${path}.mjs`]) {
      if (await isFile(candidate)) {
        return candidate
      }
    }

    return undefined
  }

  if (!specifier.startsWith("@parity-app/")) {
    return undefined
  }

  try {
    return createRequire(importer).resolve(specifier)
  } catch {
    return undefined
  }
}

/** The module's source with an import's specifier changed, wherever a static or dynamic import names it. */
export function replaceSpecifier(source: string, from: string, to: string): string {
  const escaped = from.replaceAll(/[.*+?^${}()|[\]\\/]/g, "\\$&")

  return source.replaceAll(
    new RegExp(`(\\bfrom\\s*|\\bimport\\s*\\(?\\s*)(["'])${escaped}\\2`, "g"),
    (_, keyword: string, quote: string) => `${keyword}${quote}${to}${quote}`
  )
}

async function isFile(path: string): Promise<boolean> {
  return stat(path).then(
    (stats) => stats.isFile(),
    () => false
  )
}
