import { statSync } from "node:fs"
import { readFile, realpath } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import {
  type ComponentEvidence,
  type ExportsTarget,
  type PackageManifest,
  parseManifest,
  type RendererAdapter
} from "@parity-app/core"
import { isComposite, isText } from "@parity-app/core/values/evaluate"

/**
 * The one reader of installed packages (PAR-573): where a package is installed, its manifest and version, the file
 * each of its entry points leads to, the source a built file was made from, and what a module exports through its
 * re-exports. Manifests are read through core's `packageManifest` schema.
 */

/** A package's folder and the manifest in it. */
export interface PackageFolder {
  dir: string
  manifest: PackageManifest
}

/** A package installed for a folder's code. */
export interface InstalledPackage extends PackageFolder {
  /** Its folder with links followed, as pnpm links packages into its store. */
  dir: string
  /** Where it was found: `node_modules/<name>` in the folder searched or one above, before links are followed. */
  installedAt: string
}

/**
 * The package a folder's code gets for `name`, found the way Node finds packages: in `node_modules` here or in a folder
 * above, with links followed. It reads the package's own package.json, which its `exports` may leave out of reach of
 * `require.resolve`, and never falls back to NODE_PATH, which pnpm's bin shims point at Parity's own dependencies.
 * Throws when the manifest isn't a package's.
 */
export async function findPackage(from: string, name: string): Promise<InstalledPackage | undefined> {
  for (let folder = resolve(from); ; folder = dirname(folder)) {
    const installedAt = join(folder, "node_modules", name)
    const text = await readFile(join(installedAt, "package.json"), "utf8").catch(() => undefined)

    if (text !== undefined) {
      const manifest = parseManifest(text, join(installedAt, "package.json"))

      return { dir: await realpath(installedAt), installedAt, manifest }
    }

    if (dirname(folder) === folder) {
      return undefined
    }
  }
}

/** The package in a folder, or nothing when it has no package.json. Throws when the manifest isn't a package's. */
export async function readPackage(dir: string): Promise<PackageFolder | undefined> {
  const file = join(dir, "package.json")
  const text = await readFile(file, "utf8").catch(() => undefined)

  return text === undefined ? undefined : { dir, manifest: parseManifest(text, file) }
}

/** A bare specifier's package and the entry point in it. */
export interface SplitSpecifier {
  name: string
  subpath: string
}

/** A bare specifier's package and the entry point in it: `@acme/ui/button` is `@acme/ui` and `./button`. */
export function splitSpecifier(specifier: string): SplitSpecifier {
  const parts = specifier.split("/")
  const length = specifier.startsWith("@") ? 2 : 1
  const rest = parts.slice(length).join("/")

  return { name: parts.slice(0, length).join("/"), subpath: rest ? `./${rest}` : "." }
}

/**
 * What an entry point is wanted for, which says which of `exports`'s conditions lead to it, in order:
 * - `types`: the declarations TypeScript reads, from `types`, `import`, `default` or `require`.
 * - `runtime`: the module Node imports, from `node`, `import` or `default`.
 * - `source`: the file it's written in, from `source`, `types`, `import` or `default`, with a built file traced back to
 *   its source, since the canvas builds a workspace package the way the app does.
 * - `style`: a stylesheet, from `style`, `import` or `default`.
 */
export type EntryUse = "types" | "runtime" | "source" | "style"

const conditions: Record<EntryUse, readonly string[]> = {
  types: ["types", "import", "default", "require"],
  runtime: ["node", "import", "default"],
  source: ["source", "types", "import", "default"],
  style: ["style", "import", "default"]
}

/** Which files a target may lead to for each use: declarations for types, anything but them otherwise. */
const accepts: Record<EntryUse, (file: string) => boolean> = {
  types: (file) => isDeclaration(file),
  runtime: (file) => !isDeclaration(file),
  source: () => true,
  style: (file) => !isDeclaration(file)
}

/**
 * The file one of a package's entry points leads to for a use, or nothing when no file is there. `subpath` is the
 * entry point as `exports` names it: `.` for the package itself, or one such as `./tailwind.css`, which can be written
 * `tailwind.css`. A package that doesn't list an entry point in `exports` is read as older packages are: `types` or
 * `typings` for declarations, `module` or `main` for its module, and `style` for its stylesheet.
 */
export function packageEntry(pkg: PackageFolder, use: EntryUse, subpath = "."): string | undefined {
  const entry = subpath === "." || subpath.startsWith("./") ? subpath : `./${subpath}`

  for (const candidate of entryCandidates(pkg.manifest, use, entry)) {
    const file = candidate && join(pkg.dir, candidate)

    if (file && isFile(file)) {
      return file
    }
  }

  return undefined
}

function entryCandidates(manifest: PackageManifest, use: EntryUse, entry: string): (string | undefined)[] {
  const root = entry === "."
  const path = entry.slice(2)
  const exported = exportTarget(manifest.exports, entry, conditions[use], accepts[use])

  switch (use) {
    case "types":
      return [
        exported,
        ...(root ? [manifest.types, manifest.typings] : []),
        // TypeScript reads the declarations beside the module it would load, as `dist/index.d.ts` for `dist/index.js`.
        ...entryCandidates(manifest, "runtime", entry).map((file) => file && declarationOf(file)),
        root ? "index.d.ts" : `${path}/index.d.ts`,
        root ? undefined : `${path}.d.ts`
      ]
    case "runtime":
      return [
        exported,
        ...(root ? [manifest.module, ...moduleFiles(manifest.main)] : []),
        // Without `exports`, a subpath is a file in the package.
        ...(root || manifest.exports !== undefined ? [] : moduleFiles(path))
      ]
    case "source": {
      const fields = root ? [manifest.types, manifest.typings, manifest.module, manifest.main] : []
      const named = [exported, ...fields].find((file) => file !== undefined)

      return [
        ...(named && isBuilt(named) ? sourcesOf(named) : [named]),
        ...(root ? ["src/index.tsx", "src/index.ts", "src/index.jsx", "src/index.js", "index.tsx", "index.ts"] : [])
      ]
    }

    case "style":
      return root ? [manifest.style, exported] : [exported, path]
  }
}

/** A `main` as Node reads it: the file, the file with `.js`, or a folder's `index.js`; `index.js` without one. */
function moduleFiles(main: string | undefined): string[] {
  return main ? [main, `${main}.js`, `${main}/index.js`] : ["index.js"]
}

const stylesheetNames = ["tailwind.css", "styles.css", "style.css", "index.css", "theme.css"]

/**
 * The stylesheet a project imports to use a package, as a path from the package: its `style` field, else the CSS its
 * `exports` lists, the usual names first. Only one that leads to a file counts.
 */
export function packageStylesheet(pkg: PackageFolder): string | undefined {
  const { style, exports } = pkg.manifest

  if (style && isFile(join(pkg.dir, style))) {
    return style
  }

  const css =
    exports === undefined
      ? []
      : subpaths(exports)
          .keys()
          .filter((key) => key.endsWith(".css") && !key.includes("*"))
          .map((key) => key.slice(2))
          .toArray()

  const pick = stylesheetNames.find((name) => css.includes(name)) ?? css[0]

  return pick && packageEntry(pkg, "style", pick) ? pick : undefined
}

/** `exports` by subpath: a map as written, or the package's one entry point, which is `.`. */
function subpaths(exports: ExportsTarget): Map<string, ExportsTarget> {
  if (!isComposite(exports) || Array.isArray(exports) || !Object.keys(exports).some((key) => key.startsWith("."))) {
    return new Map([[".", exports]])
  }

  return new Map(Object.entries(exports))
}

/**
 * Where `exports` leads for an entry point under these conditions: the entry point as written, else the longest
 * pattern that matches it (`./icons/*`), with what `*` stood for put in.
 */
function exportTarget(
  exports: ExportsTarget | undefined,
  entry: string,
  wanted: readonly string[],
  accept: (file: string) => boolean
): string | undefined {
  if (exports === undefined) {
    return undefined
  }

  const map = subpaths(exports)

  const exact = map.get(entry)

  if (exact !== undefined) {
    return resolveTarget(exact, wanted, accept)
  }

  let best: { key: string; prefix: string; match: string } | undefined

  for (const key of map.keys()) {
    const star = key.indexOf("*")

    if (star === -1) {
      continue
    }

    const [prefix, suffix] = [key.slice(0, star), key.slice(star + 1)]

    // `*` stands for something, never nothing.
    if (entry.length < key.length || !entry.startsWith(prefix) || !entry.endsWith(suffix)) {
      continue
    }

    if (!best || prefix.length > best.prefix.length) {
      best = { key, prefix, match: entry.slice(prefix.length, entry.length - suffix.length) }
    }
  }

  if (!best) {
    return undefined
  }

  const { key, match } = best

  return resolveTarget(map.get(key)!, wanted, (file) => accept(file.replaceAll("*", match)))?.replaceAll("*", match)
}

/** The first file a target leads to under the wanted conditions, taken in the order they're wanted. */
function resolveTarget(
  target: ExportsTarget,
  wanted: readonly string[],
  accept: (file: string) => boolean
): string | undefined {
  if (isText(target)) {
    return accept(target) ? target : undefined
  }

  if (target === null) {
    return undefined
  }

  if (Array.isArray(target)) {
    for (const each of target) {
      const found = resolveTarget(each, wanted, accept)

      if (found) {
        return found
      }
    }

    return undefined
  }

  for (const condition of wanted) {
    const found = Object.hasOwn(target, condition) ? resolveTarget(target[condition]!, wanted, accept) : undefined

    if (found) {
      return found
    }
  }

  return undefined
}

function isDeclaration(file: string): boolean {
  return /\.d\.[cm]?ts$/.test(file)
}

/** The declarations TypeScript looks for beside a module: `index.d.ts` for `index.js`, `index.d.mts` for `index.mjs`. */
function declarationOf(file: string): string | undefined {
  const match = /\.([cm]?)jsx?$/.exec(file)

  return match ? `${file.slice(0, match.index)}.d.${match[1]}ts` : undefined
}

/** Folders a package's build writes to, which its source isn't in. */
const builtFolders = new Set(["dist", "build", "lib", "out", "esm", "cjs"])

/** A file a build wrote: declarations, or anything in a build folder at the package's root. */
function isBuilt(file: string): boolean {
  return isDeclaration(file) || builtFolders.has(file.replace(/^\.\//, "").split("/")[0]!)
}

const sourceExtensions = [".tsx", ".ts", ".jsx", ".js"]

/**
 * Where a built file's source may be, in the order to look: `dist/index.js` and `dist/index.d.ts` were built from
 * `src/index.tsx`, `src/index.ts`, `src/index.jsx` or `src/index.js`, and `dist/esm/button.js` from `src/button.tsx`.
 */
function sourcesOf(file: string): string[] {
  const parts = file.replace(/^\.\//, "").split("/")
  let start = 0

  while (start < parts.length - 1 && builtFolders.has(parts[start]!)) {
    start++
  }

  const rest = parts
    .slice(start)
    .join("/")
    .replace(/\.d\.[cm]?ts$|\.[cm]?jsx?$/, "")

  const stem = start > 0 ? `src/${rest}` : rest

  return sourceExtensions.map((extension) => stem + extension)
}

/** A component a module exports. */
export interface ExportedComponent {
  /** What it's called: the name it's exported as, or for a default export, its declaration's name. */
  name: string
  /** The file it's declared in. */
  file: string
  /** How the renderer recognised it. Declaration files don't say. */
  as?: ComponentEvidence
}

/**
 * The components a module exports, by the name each is exported as, following both kinds of re-export into the
 * package's own files: `export * from "./x"`, which brings every name but `default`, and `export { A, B as C } from
 * "./x"`. A declaration file's `./x.js` is read as `./x.d.ts`. Re-exports of types and from other packages are left
 * out.
 */
export function exportedComponents(
  file: string,
  renderer: Pick<RendererAdapter, "findComponents">
): Promise<Map<string, ExportedComponent>> {
  return exportsOf(file, renderer, new Map())
}

async function exportsOf(
  file: string,
  renderer: Pick<RendererAdapter, "findComponents">,
  read: Map<string, Map<string, ExportedComponent>>
): Promise<Map<string, ExportedComponent>> {
  // A file read before gives what it found, and one still being read (an import cycle) what it has so far.
  const known = read.get(file)

  if (known) {
    return known
  }

  const found = new Map<string, ExportedComponent>()
  read.set(file, found)
  const source = await readFile(file, "utf8").catch(() => undefined)

  if (source === undefined) {
    return found
  }

  for (const component of renderer.findComponents(source, file)) {
    found.set(component.export, { name: component.name, file, as: component.as })
  }

  for (const reexport of reexportsOf(source)) {
    const target = resolveRelative(file, reexport.from)

    if (!target) {
      continue
    }

    const inner = await exportsOf(target, renderer, read)

    if (!reexport.names) {
      for (const [name, value] of inner) {
        if (name !== "default" && !found.has(name)) {
          found.set(name, value)
        }
      }

      continue
    }

    for (const [name, as] of reexport.names) {
      const value = inner.get(name)

      if (value) {
        found.set(as, as === "default" ? value : { ...value, name: as })
      }
    }
  }

  return found
}

/** A module's re-exports: `export * from "./x"` (every name), and `export { A, B as C } from "./x"`. Types are left out. */
function reexportsOf(source: string): { from: string; names?: [string, string][] }[] {
  const found: { from: string; names?: [string, string][] }[] = []

  for (const match of source.matchAll(/export\s+\*\s+from\s+["']([^"']+)["']/g)) {
    found.push({ from: match[1]! })
  }

  for (const match of source.matchAll(/export\s+(type\s+)?\{([^}]*)\}\s*from\s+["']([^"']+)["']/g)) {
    if (match[1]) {
      continue
    }

    const names = match[2]!
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part && !part.startsWith("type "))
      .map((part): [string, string] => {
        const [name, as] = part.split(/\s+as\s+/).map((text) => text.trim())

        return [name!, as ?? name!]
      })

    found.push({ from: match[3]!, names })
  }

  return found
}

const declarationExtensions = [".d.ts", ".d.mts", ".d.cts"]

/**
 * A relative specifier as a file: `./button` or `./button.js` written for `./button.tsx`, or a folder's index. From a
 * declaration file, it's the declarations: `./button.d.ts` for `./button.js`.
 */
function resolveRelative(from: string, specifier: string): string | undefined {
  if (!specifier.startsWith(".")) {
    return undefined
  }

  const base = join(dirname(from), specifier)
  const stem = base.replace(/\.[cm]?jsx?$/, "")

  const candidates = isDeclaration(from)
    ? [...declarationExtensions.map((extension) => stem + extension), join(stem, "index.d.ts")]
    : [
        base,
        ...sourceExtensions.map((extension) => stem + extension),
        ...sourceExtensions.map((extension) => join(stem, `index${extension}`))
      ]

  return candidates.find((candidate) => /\.[cm]?[jt]sx?$/.test(candidate) && isFile(candidate))
}

function isFile(path: string): boolean {
  return statSync(path, { throwIfNoEntry: false })?.isFile() ?? false
}
