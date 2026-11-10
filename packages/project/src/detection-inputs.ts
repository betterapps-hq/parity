import { existsSync } from "node:fs"
import { join } from "node:path"
import { readPackage } from "./packages.ts"
import { conventionalStylesheets, htmlEntry, shadcnConfig, stylesWith } from "./styles.ts"

/** The config files Vite looks for, which say whether the Vite builder can serve the project at all. */
const viteConfigs = ["js", "mjs", "cjs", "ts", "mts", "cts"].map((extension) => `vite.config.${extension}`)

/**
 * What detection read of a project that an open project can't take in without opening again (PAR-820): its global
 * stylesheets and the UI kit alias (from `components.json`, the app entry or the conventional places), its dependencies,
 * and which Vite config it has. Props, components and designs follow their own files while it's open, so they're not
 * here.
 */
export interface DetectionInputs {
  /** The same while detection would find the same; compare two to know whether the project must open again. */
  key: string
  /** The files it was read from, relative to the root with forward slashes: a change to one may change `key`. */
  files: string[]
}

/** What detection reads of the project at `root` now. Throws when its package.json can't be read, as mid-write. */
export async function detectionInputs(root: string): Promise<DetectionInputs> {
  const manifest = (await readPackage(root))?.manifest
  const shadcn = await shadcnConfig(root, [])
  const { styles, packageStyles } = await stylesWith(root, shadcn, [])
  const entry = await htmlEntry(root)

  const dependencies = [
    ...new Set(
      [manifest?.dependencies, manifest?.devDependencies, manifest?.optionalDependencies].flatMap((versions) =>
        Object.keys(versions ?? {})
      )
    )
  ].sort()

  const key = JSON.stringify({
    package: manifest ? { name: manifest.name ?? null, dependencies } : null,
    styles,
    packageStyles,
    ui: shadcn?.aliases?.ui ?? null,
    vite: viteConfigs.filter((file) => existsSync(join(root, file)))
  })

  const files = [
    "package.json",
    "components.json",
    "index.html",
    ...(entry ? [entry.replace(/^\.?\//, "")] : []),
    ...conventionalStylesheets,
    ...viteConfigs
  ]

  return { key, files: [...new Set(files)] }
}
