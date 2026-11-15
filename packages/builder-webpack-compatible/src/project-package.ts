import { readFile, realpath, stat } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { type ExportsTarget, parseManifest } from "@parity-app/core"
import { isComposite, isText } from "@parity-app/core/values/evaluate"

/*
 * The project's own copy of a tool, as its code imports it: never the one Parity might have.
 */

/**
 * Where the project's copy of `name` is installed: `node_modules` in its folder or one above, the way Node finds
 * packages. Not through `require.resolve`, which also looks in `NODE_PATH`: package manager scripts set it, and it
 * could find a copy of Parity's own. Nothing when the project doesn't have it.
 */
export async function projectPackageFolder(root: string, name: string): Promise<string | undefined> {
  for (let folder = resolve(root); ; folder = dirname(folder)) {
    const manifest = join(folder, "node_modules", ...name.split("/"), "package.json")

    if (await isFile(manifest)) {
      return realpath(dirname(manifest))
    }

    if (dirname(folder) === folder) {
      return undefined
    }
  }
}

/** The project's copy of a package, by its ES module entry (`import`, else `node` or `default`), and its version. */
export async function importProjectPackage(root: string, name: string): Promise<{ module: unknown; version: string }> {
  const folder = await projectPackageFolder(root, name)

  if (!folder) {
    throw new Error(`${name} is not installed in ${root}`)
  }

  const file = join(folder, "package.json")
  const manifest = parseManifest(await readFile(file, "utf8"), file)
  const { exports } = manifest
  const main = isComposite(exports) && !Array.isArray(exports) && "." in exports ? exports["."] : exports
  const entry = importCondition(main) ?? manifest.main ?? "index.js"

  return { module: await import(pathToFileURL(join(folder, entry)).href), version: manifest.version ?? "" }
}

function importCondition(target: ExportsTarget | undefined): string | undefined {
  if (isText(target)) {
    return target
  }

  if (isComposite(target) && !Array.isArray(target)) {
    for (const condition of ["import", "node", "default"]) {
      const next = target[condition]

      if (next !== undefined) {
        return importCondition(next)
      }
    }
  }

  return undefined
}

async function isFile(path: string): Promise<boolean> {
  return stat(path).then(
    (stats) => stats.isFile(),
    () => false
  )
}
