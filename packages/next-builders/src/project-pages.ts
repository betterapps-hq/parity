import { posix } from "node:path"
import type { GuestAppFile } from "./guest-app.ts"

/*
 * The project's own pages in the guest app (PAR-1164): page frames load the builder's origin at each route's URL, so
 * the guest app serves the project's App Router and Pages Router routes beside its own. Each of the project's route files
 * gets a file of the same name in the guest app that re-exports it, so Next finds the same routes, with the project's own
 * page extensions, and each module still imports what's beside it from where it is.
 */

/** The folders Next reads routes from, by router, from the project root: at the root, or in `src/` when neither is there. */
export const projectRouteFolders = { app: ["app", "src/app"], pages: ["pages", "src/pages"] } as const

/** The route group the project's App Router files go in, so its root layout and the guest's are each a root of their own. */
export const projectRouteGroup = "(project)"

/** The App Router's file conventions that make a route, or wrap one. */
const appConventions = new Set([
  "page",
  "layout",
  "template",
  "loading",
  "error",
  "not-found",
  "global-error",
  "global-not-found",
  "forbidden",
  "unauthorized",
  "default",
  "route"
])

/** The extensions a route file can have: Next's defaults and MDX's, or a custom page extension that ends with one. */
const moduleExtension = /\.(?:tsx|ts|jsx|js|mdx)$/

/**
 * The App Router's segment config, which Next reads from the route's own file, never through a re-export: a value that's
 * a literal is copied instead.
 */
const segmentConfig = new Set([
  "dynamic",
  "dynamicParams",
  "revalidate",
  "fetchCache",
  "runtime",
  "preferredRegion",
  "maxDuration",
  "experimental_ppr"
])

/** The folders a project's routes are in, by router, from the project root, for the routers it has. */
export interface RouteFolders {
  app?: string
  pages?: string
}

/** The folders Next reads routes from, of those the project has: `src/` only when neither router's folder is at the root. */
export function routeFolders(present: readonly string[]): RouteFolders {
  const has = new Set(present)
  const atRoot = has.has("app") || has.has("pages")

  const pick = (folders: readonly string[]) =>
    folders.find((folder) => has.has(folder) && atRoot === !folder.startsWith("src/"))

  const folders: RouteFolders = {}
  const app = pick(projectRouteFolders.app)
  const pages = pick(projectRouteFolders.pages)

  if (app) {
    folders.app = app
  }

  if (pages) {
    folders.pages = pages
  }

  return folders
}

/** Whether a file in the App Router's folder is one of its conventions, whatever page extension it has. */
export function isAppRouteFile(path: string): boolean {
  const name = posix.basename(path)

  return moduleExtension.test(name) && !name.endsWith(".d.ts") && appConventions.has(name.split(".")[0] ?? "")
}

/** Whether a file in the Pages Router's folder is a module Next could make a route of. */
export function isPagesRouteFile(path: string): boolean {
  return moduleExtension.test(path) && !path.endsWith(".d.ts")
}

/** A route file of the project's, by its path from the project root, with its text. */
export interface ProjectRouteFile {
  path: string
  text: string
}

/**
 * The guest app's files that mirror the project's routes: its App Router files in the project's route group, its Pages
 * Router files in the guest's `pages/`, each re-exporting its default and named exports from the project's file.
 */
export function projectPageFiles(folders: RouteFolders, files: readonly ProjectRouteFile[]): GuestAppFile[] {
  return files.flatMap((file) => {
    const inApp = folders.app !== undefined && file.path.startsWith(`${folders.app}/`)
    const inPages = folders.pages !== undefined && file.path.startsWith(`${folders.pages}/`)

    if (inApp && isAppRouteFile(file.path)) {
      const path = posix.join("app", projectRouteGroup, file.path.slice(folders.app!.length + 1))

      return [{ path, text: reexport(path, file, "app") }]
    }

    if (inPages && isPagesRouteFile(file.path)) {
      const path = posix.join("pages", file.path.slice(folders.pages!.length + 1))

      return [{ path, text: reexport(path, file, "pages") }]
    }

    return []
  })
}

/** A mirror's text: the project's file's default and named exports, and its segment config's literal values. */
function reexport(path: string, file: ProjectRouteFile, router: "app" | "pages"): string {
  const from = JSON.stringify(projectSpecifier(path, file.path))
  const names = exportNames(file.text)
  const lines = [`// Written by Parity's Next.js builder: ${file.path}, as a route of the guest app.`]
  const copied = router === "app" ? segmentLiterals(file.text) : []
  const reexported = names.filter((name) => name !== "default" && !copied.some(([copy]) => copy === name))
  // The Pages Router reads a page's `config` from its own file alone, and an API route's isn't a page's concern.
  const kept = router === "pages" ? reexported.filter((name) => name !== "config") : reexported

  if (names.includes("default")) {
    lines.push(`export { default } from ${from}`)
  }

  if (kept.length > 0) {
    lines.push(`export { ${kept.join(", ")} } from ${from}`)
  }

  for (const [name, value] of copied) {
    lines.push(`export const ${name} = ${value}`)
  }

  return `${lines.join("\n")}\n`
}

/** How a mirror at `path` in the guest app imports the project's file, without its extension unless it's MDX. */
export function projectSpecifier(path: string, projectPath: string): string {
  const target = projectPath.endsWith(".mdx") ? projectPath : projectPath.replace(/\.(?:tsx|ts|jsx|js)$/, "")
  const relative = posix.relative(posix.dirname(posix.join(".next/parity", path)), target)

  return relative.startsWith(".") ? relative : `./${relative}`
}

/** The names a module exports, `default` among them, read from its text: declarations and export lists. */
export function exportNames(text: string): string[] {
  const names = new Set<string>()
  const code = text.replaceAll(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "")

  if (/\bexport\s+default\b/.test(code)) {
    names.add("default")
  }

  for (const match of code.matchAll(
    /\bexport\s+(?:declare\s+)?(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/g
  )) {
    names.add(match[1]!)
  }

  for (const match of code.matchAll(/\bexport\s+(type\s+)?\{([^}]*)\}/g)) {
    if (match[1]) {
      continue
    }

    for (const part of match[2]!.split(",")) {
      const spec = part.trim()

      if (spec === "" || spec.startsWith("type ")) {
        continue
      }

      const name = spec
        .split(/\s+as\s+/)
        .pop()!
        .trim()

      if (/^[A-Za-z_$][\w$]*$/.test(name)) {
        names.add(name)
      }
    }
  }

  return [...names]
}

/** The segment config a route's file gives as literals, by name, with each value's text. */
export function segmentLiterals(text: string): [string, string][] {
  const literal = /^(?:"[^"\n]*"|'[^'\n]*'|-?\d+(?:\.\d+)?|true|false|\[[^\]\n]*\])$/

  return [...text.matchAll(/^export\s+const\s+([A-Za-z_]\w*)\s*(?::[^=\n]+)?=\s*([^\n;]+?)\s*;?\s*$/gm)].flatMap(
    (match): [string, string][] => {
      const name = match[1]!
      const value = match[2]!.replace(/\s+as\s+const$/, "")

      return segmentConfig.has(name) && literal.test(value) ? [[name, value]] : []
    }
  )
}
