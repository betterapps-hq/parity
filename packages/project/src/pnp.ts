import { existsSync, statSync } from "node:fs"
import { createRequire, register, syncBuiltinESMExports } from "node:module"
import { dirname, join, resolve, sep } from "node:path"
import { pathToFileURL } from "node:url"
import { z } from "zod"

/*
 * Projects installed by Yarn with Plug'n'Play have no `node_modules`: Yarn writes `.pnp.cjs`, a map from each package
 * to its dependencies, and keeps packages in zip archives under `.yarn`. Node finds them only once that file is loaded
 * into the process, which teaches `fs` to read inside the archives and Node to resolve through the map, as `yarn node`
 * does. Parity loads it where it reads a project's packages or runs its code.
 */

/** The part of Yarn's runtime API Parity uses (https://yarnpkg.com/advanced/pnpapi). */
export interface PnpApi {
  /** The folder of the package `request` names, as the file or folder `issuer` gets it. Throws when it can't have it. */
  resolveToUnqualified(request: string, issuer: string): string | null
  /** The package a file or folder belongs to, or null when it isn't in this project. */
  findPackageLocator(location: string): { name: string | null; reference: string | null } | null
  /** Teaches this process's `fs` and module loader the project's packages. */
  setup(): void
}

const pnpApi = z.custom<PnpApi>(
  (value) => value instanceof Object && "resolveToUnqualified" in value && "findPackageLocator" in value
)

const require = createRequire(import.meta.url)

/** Each project's runtime, by its `.pnp.cjs`, with when that file was written, loaded again once Yarn rewrites it. */
const loaded = new Map<string, { api: PnpApi; written: number }>()

/** The project a folder is installed in by Plug'n'Play: its `.pnp.cjs` and that runtime's API. */
export interface PnpProject {
  file: string
  api: PnpApi
}

/**
 * The Plug'n'Play project a folder's code is installed in, with its runtime loaded into this process, or nothing when
 * it's installed another way. The nearest `.pnp.cjs` here or above counts only when its map includes the folder, so a
 * project installed with `node_modules` inside a Plug'n'Play one isn't read as Plug'n'Play. A folder with none above
 * it, such as a package in Yarn's global cache, belongs to whichever project already loaded has it in its map.
 */
export function pnpProject(from: string): PnpProject | undefined {
  const location = `${resolve(from)}${sep}`
  const file = pnpFile(from)

  if (file) {
    const api = loadPnp(file)

    return api.findPackageLocator(location) ? { file, api } : undefined
  }

  for (const known of loaded.keys()) {
    // A project opened earlier may since have been deleted, moved or installed with `node_modules`.
    if (!existsSync(known)) {
      loaded.delete(known)
      continue
    }

    const api = loadPnp(known)

    if (api.findPackageLocator(location)) {
      return { file: known, api }
    }
  }

  return undefined
}

/**
 * The folder a Plug'n'Play project gives `from` for a package, or nothing when it doesn't list the package. Inside a
 * zip archive or a virtual folder Yarn makes for a package with peer dependencies; readable once the runtime is loaded.
 */
export function pnpPackageDir(project: PnpProject, from: string, name: string): string | undefined {
  try {
    const dir = project.api.resolveToUnqualified(name, `${resolve(from)}${sep}`)

    return dir ? dir.replace(/[\\/]+$/, "") : undefined
  } catch {
    // Yarn throws for a package the folder's code may not have, which here is a package that isn't installed for it.
    return undefined
  }
}

/**
 * `NODE_OPTIONS` for a Node process that runs code from a Plug'n'Play project, as `yarn node` sets it: the runtime, and
 * the loader that lets ES modules import from it, added to the options it had. Passed this way rather than as
 * arguments, the processes it starts get them too, as Storybook's need to. Nothing for a project installed another way.
 */
export function pnpNodeOptions(from: string, options?: string): string | undefined {
  const project = pnpProject(from)

  if (!project) {
    return undefined
  }

  const loader = join(dirname(project.file), ".pnp.loader.mjs")

  // Quoted for a folder with spaces in it, with forward slashes, since a backslash in quotes escapes what follows it.
  const added = [
    `--require "${project.file.replaceAll("\\", "/")}"`,
    ...(existsSync(loader) ? [`--experimental-loader ${pathToFileURL(loader).href}`] : [])
  ]

  return [options, ...added].filter(Boolean).join(" ")
}

/** Projects whose loader this process has registered. */
const registered = new Set<string>()

/**
 * Lets this process import ES modules from the Plug'n'Play project a folder is in, as Yarn's loader does for
 * `yarn node`. CommonJS needs only the runtime, which `pnpProject` loads. Does nothing for a project installed another
 * way, or one whose Yarn wrote no loader.
 */
export function importFromPnp(from: string): void {
  const project = pnpProject(from)

  if (project) {
    registerPnpLoader(project)
  }
}

/** Registers a Plug'n'Play project's ES module loader in this process, once. */
export function registerPnpLoader(project: PnpProject): void {
  const loader = join(dirname(project.file), ".pnp.loader.mjs")

  if (registered.has(loader) || !existsSync(loader)) {
    return
  }

  register(pathToFileURL(loader))
  registered.add(loader)
}

/** The `.pnp.cjs` in a folder or the nearest one above it. */
function pnpFile(from: string): string | undefined {
  for (let folder = resolve(from); ; folder = dirname(folder)) {
    const file = join(folder, ".pnp.cjs")

    if (existsSync(file)) {
      return file
    }

    if (dirname(folder) === folder) {
      return undefined
    }
  }
}

/**
 * Loads a project's runtime, again when Yarn has rewritten it since, as installing a package does, so the map is the
 * current one. The first one loaded is set up, which patches `fs` for every project's archives and module resolution
 * for every project's files, so later ones only need their map. Parity's own modules imported `fs` as ES modules, whose
 * bindings Node updates only when asked.
 */
function loadPnp(file: string): PnpApi {
  const written = statSync(file).mtimeMs
  const known = loaded.get(file)

  if (known?.written === written) {
    return known.api
  }

  // Node keeps what it required; the rewritten file is read only once that's forgotten.
  delete require.cache[require.resolve(file)]

  const api = pnpApi.parse(require(file))

  if (!process.versions.pnp) {
    api.setup()
    syncBuiltinESMExports()
  }

  loaded.set(file, { api, written })

  return api
}
