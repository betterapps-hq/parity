import { readFile, stat } from "node:fs/promises"
import { createRequire } from "node:module"
import { posix } from "node:path"
import { importSpecifiers, type ProjectTsconfig, readTsconfig, resolvePathAlias } from "@parity-app/code"
import type { AppStyles } from "@parity-app/core"
import { chooseAppStyles, type Imported, isStylesheetFile } from "@parity-app/project"

/*
 * Which global stylesheets a Next.js app loads (`BuilderProvider.styles`): the ones its root layout imports, or for the
 * Pages Router `_app`, following the project's own modules from there until some import stylesheets, as the Vite
 * builder follows the app's entry. CSS modules are a component's own, not global, so they're left out.
 */

/** The modules a Next.js app's pages all render inside, from the root, in the order they're looked for. */
export const rootModules = ["app/layout", "src/app/layout", "pages/_app", "src/pages/_app"]

const scriptExtensions = [".tsx", ".ts", ".jsx", ".js", ".mjs", ".cjs"]

/** The most modules followed: a root layout reaches its stylesheets long before this. */
const moduleLimit = 500

/** The global stylesheets the Next.js app at `root` loads. */
export async function nextAppStyles(root: string): Promise<AppStyles> {
  const base = root.replaceAll("\\", "/").replace(/\/$/, "")
  const tsconfig = readTsconfig(root)
  const resolve = (specifier: string, importer: string) => resolveImport(base, tsconfig, specifier, importer)

  const entries = (await Promise.all(rootModules.map((module) => withExtension(posix.join(base, module))))).filter(
    (file) => file !== undefined
  )

  const found: Imported[] = []
  const read = new Set<string>()
  const seen = new Set<string>()
  let level = entries

  for (let depth = 0; level.length > 0 && found.length === 0 && seen.size < moduleLimit; depth++) {
    const deeper: string[] = []

    for (const file of level) {
      if (seen.has(file)) {
        continue
      }

      seen.add(file)
      read.add(file)
      const source = await readFile(file, "utf8").catch(() => "")

      for (const specifier of valueImports(source)) {
        const resolved = await resolve(specifier, file)

        if (!resolved) {
          continue
        }

        if (isStylesheetFile(resolved)) {
          if (!isCssModule(resolved)) {
            found.push({ file: resolved, importer: file, depth })
          }
        } else if (own(base, resolved)) {
          deeper.push(resolved)
        }
      }
    }

    level = deeper
  }

  return chooseAppStyles({ found, read: [...read] }, base, resolve)
}

/** A CSS module, as `Card.module.css` or `Card.module.scss`, scoped to the component that imports it. */
function isCssModule(file: string): boolean {
  return /\.module\.[^./]+$/.test(file)
}

/** The specifiers a module imports values from, leaving out `import type` and `export type`. */
export function valueImports(source: string): string[] {
  const withoutTypes = source.replaceAll(/^\s*(?:import|export)\s+type\b[^;]*?from\s*["'][^"']+["'];?/gm, "")

  return importSpecifiers(withoutTypes)
}

/**
 * Where an import from `importer` leads, as Next resolves it for these: a relative path, a tsconfig path alias such as
 * `@/app/globals.css`, or a package's file, with the extensions a module may leave out.
 */
async function resolveImport(
  root: string,
  tsconfig: ProjectTsconfig,
  specifier: string,
  importer: string
): Promise<string | undefined> {
  const bare = specifier.split("?")[0]!

  if (bare.startsWith(".")) {
    return withExtension(posix.join(posix.dirname(importer), bare))
  }

  const aliased = resolvePathAlias(root, tsconfig, bare)

  if (aliased !== undefined) {
    return withExtension(posix.join(root, aliased))
  }

  if (!isStylesheetFile(bare)) {
    return undefined
  }

  try {
    return createRequire(importer).resolve(bare).replaceAll("\\", "/")
  } catch {
    return undefined
  }
}

/** The file a module path names: itself, with one of the extensions it may leave out, or its folder's index. */
async function withExtension(path: string): Promise<string | undefined> {
  if (isStylesheetFile(path)) {
    return (await isFile(path)) ? path : undefined
  }

  for (const candidate of [
    path,
    ...scriptExtensions.map((extension) => path + extension),
    ...scriptExtensions.map((extension) => posix.join(path, `index${extension}`))
  ]) {
    if (await isFile(candidate)) {
      return candidate
    }
  }

  return undefined
}

function own(root: string, file: string): boolean {
  return file.startsWith(`${root}/`) && !file.includes("/node_modules/")
}

async function isFile(path: string): Promise<boolean> {
  return stat(path).then(
    (stats) => stats.isFile(),
    () => false
  )
}
