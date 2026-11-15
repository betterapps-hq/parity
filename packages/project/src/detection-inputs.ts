import { existsSync } from "node:fs"
import { join } from "node:path"
import { readPackage } from "./packages.ts"
import { conventionalStylesheets, findStyles, htmlEntry } from "./styles.ts"

/**
 * What detection read of a project that an open project can't take in without opening again (PAR-820): its global
 * stylesheets (from the app entry or the conventional places), its dependencies, and which of the builders' config
 * files it has. Props, components and designs follow their own files while it's open, so they're not here.
 */
export interface DetectionInputs {
  /** The same while detection would find the same; compare two to know whether the project must open again. */
  key: string
  /** The files it was read from, relative to the root with forward slashes: a change to one may change `key`. */
  files: string[]
}

/**
 * What detection reads of the project at `root` now. `builderConfigs` are the files the registered adapters watch
 * (`Adapter.watches`, PAR-826), relative to the root, such as a builder's config files, so a new adapter needs no change
 * here. Throws when its package.json is missing or can't be read, as while an editor or package manager rewrites it, so
 * a moment without it never reads as a change.
 */
export async function detectionInputs(root: string, builderConfigs: readonly string[]): Promise<DetectionInputs> {
  const manifest = (await readPackage(root))?.manifest

  if (!manifest) {
    throw new Error(`There's no package.json in ${root}`)
  }

  const { styles, packageStyles } = await findStyles(root)
  const entry = await htmlEntry(root)

  const dependencies = [
    ...new Set(
      [manifest.dependencies, manifest.devDependencies, manifest.optionalDependencies].flatMap((versions) =>
        Object.keys(versions ?? {})
      )
    )
  ].sort()

  const key = JSON.stringify({
    package: { name: manifest.name ?? null, dependencies },
    styles,
    packageStyles,
    builders: builderConfigs.filter((file) => existsSync(join(root, file)))
  })

  const files = [
    "package.json",
    "index.html",
    ...(entry ? [entry.replace(/^\.?\//, "")] : []),
    ...conventionalStylesheets,
    ...builderConfigs
  ]

  return { key, files: [...new Set(files)] }
}
